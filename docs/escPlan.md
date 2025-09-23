# Plano de Correção - Problema de Cancelamento com ESC

## Resumo Executivo
Quando o usuário cola um texto e pressiona ESC rapidamente, a mensagem é salva no banco de dados e enviada para a IA, mesmo que o usuário tenha tentado cancelar. O problema não é o salvamento em si (que é correto para auditoria), mas sim que o sistema **não respeita o status de cancelamento** quando a resposta da IA chega.

### Solução Proposta: request_id + status
- **request_id**: Identificador único gerado no cliente para cada requisição
- **status**: Estado atual da requisição (pending → processing → completed/cancelled)
- **Fonte única de verdade**: Banco de dados com índices otimizados

### Mudanças Essenciais no Banco
```sql
-- 1. Adicionar colunas
ALTER TABLE history_user ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE history_user ADD COLUMN request_id TEXT;

-- 2. Criar índices
CREATE INDEX idx_history_user_status ON history_user(status, timestamp DESC);
CREATE UNIQUE INDEX idx_history_user_request_unique ON history_user(request_id) WHERE request_id IS NOT NULL;
```

## Problema Identificado

### Fluxo Atual (INCORRETO)
1. Usuário cola texto com bracketed paste
2. Sistema salva imediatamente no Turso (✅ CORRETO - queremos isso para auditoria)
3. Usuário pressiona ESC
4. Sistema marca como cancelado (✅ CORRETO)
5. **IA responde e a resposta é exibida e salva** (❌ ERRO - deveria ignorar)

### Evidências do Problema
```javascript
// mcp-ink-cli.mjs linha 321-326
// CORRETO: Salva imediatamente (bom para auditoria)
currentTursoEntryId.current = await tursoAdapter.current.saveQuestion(command);

// linha 532-536
// PROBLEMA: Atualiza com resposta SEM verificar se foi cancelado
await tursoAdapter.current.updateWithResponse(currentTursoEntryId.current, output);
```

## Solução com Gerenciamento de Estado

### Princípios Revisados
1. **Salvar sempre** - Manter registro completo para auditoria
2. **Gerenciar estados** - Usar status (pending → processing → completed/cancelled)
3. **Respeitar cancelamento** - Verificar status antes de processar respostas
4. **Fonte única de verdade** - Banco de dados é a autoridade sobre o estado

### Estados do Ciclo de Vida
```
pending     → Pergunta salva, aguardando processamento
processing  → Enviado para IA, aguardando resposta
completed   → Resposta recebida e salva
cancelled   → Cancelado pelo usuário (ESC)
error       → Erro durante processamento
```

### Implementação em 4 Fases

#### Fase 1: Atualizar Schema do Banco (FUNDAMENTAL)
```sql
-- libs/turso-client.js - Adicionar no ensureSchema()

-- 1. Adicionar coluna status para controle de estado
ALTER TABLE history_user ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE history_global ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE history_machine ADD COLUMN status TEXT DEFAULT 'pending';

-- 2. Adicionar request_id para rastreamento único
ALTER TABLE history_user ADD COLUMN request_id TEXT;
ALTER TABLE history_global ADD COLUMN request_id TEXT;
ALTER TABLE history_machine ADD COLUMN request_id TEXT;

-- 3. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_history_user_status
    ON history_user(status, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_history_user_request
    ON history_user(request_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_history_user_request_unique
    ON history_user(request_id) WHERE request_id IS NOT NULL;

-- 4. Migrar dados existentes
UPDATE history_user
SET status = CASE
    WHEN response IS NULL THEN 'cancelled'
    WHEN response = '[Cancelled by user]' THEN 'cancelled'
    ELSE 'completed'
END
WHERE status IS NULL;
```

#### Por que request_id é importante?
- **Rastreamento único**: Cada requisição tem ID único gerado no cliente
- **Evita duplicatas**: Índice único previne registros duplicados
- **Debug facilitado**: Correlação entre logs do cliente e banco
- **Recuperação**: Possível retomar requisições interrompidas

#### Fase 2: Adicionar Rastreamento Local de Requisições
```javascript
// No início do componente MCPInkApp
const activeRequests = useRef(new Map());
```

#### Fase 3: Modificar processCommand para Gerenciar Estados
```javascript
const processCommand = async (command) => {
    if (!command.trim()) return;

    // Gerar request_id único (timestamp + random para garantir unicidade)
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    currentRequestId.current = requestId;

    // Criar AbortController e registrar requisição
    const controller = new AbortController();
    activeRequests.current.set(requestId, {
        status: 'pending',
        controller: controller,
        command: command,
        tursoId: null
    });

    setIsProcessing(true);
    setResponse('');
    setError(null);
    setIsCancelled(false);

    // SALVAR IMEDIATAMENTE com status 'pending' e request_id
    currentTursoEntryId.current = null;
    if (tursoAdapter.current && tursoAdapter.current.isConnected()) {
        // Salvar com status inicial E request_id
        currentTursoEntryId.current = await tursoAdapter.current.saveQuestionWithStatusAndRequestId(
            command,
            'pending',
            requestId  // Passar o request_id único
        );

        // Atualizar Map com ID do Turso
        const request = activeRequests.current.get(requestId);
        if (request) {
            request.tursoId = currentTursoEntryId.current;
        }

        if (isDebug) {
            console.log(`[Turso] Question saved with ID: ${currentTursoEntryId.current}, request_id: ${requestId}, status: pending`);
        }
    }

    // Verificar se já foi cancelado antes de enviar para IA
    const request = activeRequests.current.get(requestId);
    if (!request || request.status === 'cancelled') {
        if (isDebug) {
            console.log('[Debug] Request cancelled before sending to AI');
        }
        activeRequests.current.delete(requestId);
        setIsProcessing(false);
        return;
    }

    // Atualizar status para 'processing'
    if (currentTursoEntryId.current && tursoAdapter.current) {
        await tursoAdapter.current.updateStatus(currentTursoEntryId.current, 'processing');
        request.status = 'processing';
    }

    try {
        // Enviar para IA
        const result = await orchestrator.current.askCommand(command, {
            history: formattedHistory,
            verbose: isDebug,
            signal: controller.signal
        });

        // CRÍTICO: Verificar status ANTES de processar resposta
        const currentRequest = activeRequests.current.get(requestId);

        // Buscar status atual do banco usando request_id (fonte da verdade)
        let dbStatus = 'processing';
        if (tursoAdapter.current) {
            // Usar request_id em vez de tursoId para buscar status
            dbStatus = await tursoAdapter.current.getStatusByRequestId(requestId);
        }

        if (dbStatus === 'cancelled' || currentRequest?.status === 'cancelled') {
            if (isDebug) {
                console.log(`[Debug] Response received for cancelled request ${requestId} (db status: ${dbStatus}). Ignoring.`);
            }
            return; // NÃO processar resposta de requisição cancelada
        }

        // Processar resposta
        const output = extractResponse(result);

        setResponse(output);
        setHistory(prev => [...prev, formatResponse(output)]);

        // Atualizar no Turso com status 'completed'
        if (currentTursoEntryId.current && tursoAdapter.current) {
            await tursoAdapter.current.updateWithResponseAndStatus(
                currentTursoEntryId.current,
                output,
                'completed'
            );
            if (isDebug) {
                console.log(`[Turso] Entry ${currentTursoEntryId.current} completed`);
            }
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            // Cancelado via AbortController
            if (isDebug) {
                console.log('[Debug] Request aborted');
            }
        } else {
            // Erro real
            setError(error.message);
            if (currentTursoEntryId.current && tursoAdapter.current) {
                await tursoAdapter.current.updateStatus(currentTursoEntryId.current, 'error');
            }
        }
    } finally {
        activeRequests.current.delete(requestId);
        setIsProcessing(false);
    }
};
```

#### Fase 4: Melhorar Handler de ESC para Atualizar Status
```javascript
// No handler de ESC (linha ~704)
if (key.escape) {
    if (isProcessing) {
        // Buscar requisição ativa
        const request = activeRequests.current.get(currentRequestId.current);
        if (request) {
            // Marcar como cancelada localmente
            request.status = 'cancelled';

            // Abortar chamada para IA
            request.controller.abort();

            // CRÍTICO: Atualizar status no banco IMEDIATAMENTE usando request_id
            if (tursoAdapter.current) {
                // Usar request_id para atualizar (mais confiável que tursoId)
                await tursoAdapter.current.updateStatusByRequestId(requestId, 'cancelled');
                if (isDebug) {
                    console.log(`[Turso] Request ${requestId} marked as cancelled`);
                }
            }

            if (isDebug) {
                console.log(`[Debug] Request ${currentRequestId.current} cancelled`);
            }
        }

        // Reset estados locais
        setIsProcessing(false);
        setResponse('Operation cancelled by user');
        currentRequestId.current = null;
        currentTursoEntryId.current = null;

        // Adicionar marcador ao histórico para contexto
        setCommandHistory(prev => [...prev, '[ESC - Message cancelled]'].slice(-100));
    }
    // ... resto do código ESC
}
```

## Novos Métodos Necessários no TursoAdapter

```javascript
// interface-v2/bridges/adapters/TursoAdapter.js

// Salvar com status E request_id (NOVO)
async saveQuestionWithStatusAndRequestId(command, status = 'pending', requestId) {
    const entryId = generateId();
    await this.tursoClient.saveToUser({
        id: entryId,
        command,
        response: null,
        status,
        request_id: requestId,  // IMPORTANTE: Salvar request_id único
        timestamp: Date.now()
    });
    return entryId;
}

// Atualizar apenas o status
async updateStatus(entryId, status) {
    return await this.tursoClient.updateUserEntry(entryId, {
        status,
        updated_at: Date.now()
    });
}

// Buscar status usando request_id (NOVO)
async getStatusByRequestId(requestId) {
    // Query usando request_id em vez de ID do banco
    const query = `
        SELECT status FROM history_user
        WHERE request_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
    `;
    const result = await this.tursoClient.execute(query, [requestId]);
    return result.rows[0]?.status || 'unknown';
}

// Atualizar status usando request_id (NOVO)
async updateStatusByRequestId(requestId, status) {
    const query = `
        UPDATE history_user
        SET status = ?, updated_at = ?
        WHERE request_id = ?
    `;
    return await this.tursoClient.execute(query, [status, Date.now(), requestId]);
}

// Atualizar resposta e status juntos
async updateWithResponseAndStatus(entryId, response, status) {
    return await this.tursoClient.updateUserEntry(entryId, {
        response,
        status,
        completed_at: Date.now()
    });
}

// Verificar se request_id já existe (para evitar duplicatas)
async requestIdExists(requestId) {
    const query = `
        SELECT COUNT(*) as count FROM history_user
        WHERE request_id = ?
    `;
    const result = await this.tursoClient.execute(query, [requestId]);
    return result.rows[0]?.count > 0;
}
```

## Testes de Validação

### Teste 1: Cancelamento Rápido de Paste
1. Colar texto longo
2. Pressionar ESC imediatamente
3. **Esperado**:
   - Entrada salva no Turso com status 'cancelled'
   - Nenhuma resposta da IA exibida
   - Histórico mostra "[ESC - Message cancelled]"

### Teste 2: Paste Normal
1. Colar texto
2. Aguardar resposta sem pressionar ESC
3. **Esperado**:
   - Status: pending → processing → completed
   - Resposta exibida normalmente

### Teste 3: Cancelamento Durante Processamento
1. Enviar comando
2. Pressionar ESC durante processamento da IA
3. **Esperado**:
   - Status muda para 'cancelled'
   - Resposta da IA (se chegar) é ignorada
   - Interface mostra "Operation cancelled by user"

### Teste 4: Verificação no Banco
```sql
-- Ver últimas entradas com status e request_id
SELECT
    request_id,
    substr(command, 1, 50) as command_preview,
    status,
    CASE
        WHEN response IS NULL THEN 'NULL'
        ELSE LENGTH(response) || ' chars'
    END as response_info,
    datetime(timestamp/1000, 'unixepoch', 'localtime') as time
FROM history_user
ORDER BY timestamp DESC
LIMIT 10;

-- Verificar requisições canceladas
SELECT COUNT(*) as cancelled_count
FROM history_user
WHERE status = 'cancelled'
AND timestamp > unixepoch() - 86400; -- últimas 24h
```

## Vantagens desta Abordagem

✅ **Auditoria Completa** - Registra todas as tentativas, mesmo canceladas
✅ **Estado Consistente** - Banco é fonte única de verdade
✅ **Recuperação** - Possível retomar operações interrompidas
✅ **Análise** - Métricas de cancelamento para melhorias futuras
✅ **Debug** - Histórico completo para troubleshooting

## Implementação Incremental

### Fase 1 - Schema do Banco (AGORA)
- [ ] Adicionar coluna `status` nas tabelas
- [ ] Migrar dados existentes
- [ ] Testar migração

### Fase 2 - Lógica de Estado (AGORA)
- [ ] Implementar novos métodos no TursoAdapter
- [ ] Adicionar Map de requisições ativas
- [ ] Modificar processCommand para gerenciar estados
- [ ] Atualizar handler de ESC

### Fase 3 - Validação (AGORA)
- [ ] Verificar status antes de processar respostas
- [ ] Ignorar respostas de requisições canceladas
- [ ] Testar fluxo completo

### Fase 4 - Melhorias (DEPOIS)
- [ ] Dashboard com métricas de cancelamento
- [ ] Retry automático para erros
- [ ] Limpeza periódica de registros antigos

## Por que usar request_id + status?

### request_id garante:
- **Unicidade**: Cada requisição tem identificador único global
- **Rastreabilidade**: Correlação entre cliente, servidor e banco
- **Idempotência**: Evita duplicatas mesmo com retry
- **Debug**: Facilita troubleshooting com ID consistente

### status garante:
- **Estado claro**: Sempre sabemos o estado atual
- **Auditoria**: Histórico completo de mudanças
- **Recuperação**: Possível retomar operações
- **Análise**: Métricas de cancelamento e erros

## Fluxo Correto Final

```mermaid
graph TD
    A[Usuário digita/cola] --> B[Gera request_id único]
    B --> C[Salva com status='pending' + request_id]
    C --> D{ESC pressionado?}
    D -->|Sim| E[updateStatusByRequestId(request_id, 'cancelled')]
    E --> F[Ignora resposta da IA se chegar]
    D -->|Não| G[updateStatusByRequestId(request_id, 'processing')]
    G --> H[Envia para IA com AbortController]
    H --> I{Resposta recebida}
    I --> J[getStatusByRequestId(request_id)]
    J --> K{Status ainda é 'processing'?}
    K -->|Sim| L[Salva resposta, status='completed']
    K -->|Não (cancelled)| M[Descarta resposta]
```

## Conclusão

Esta solução mantém registro completo de todas as interações para auditoria, enquanto respeita o desejo do usuário de cancelar operações. O banco de dados se torna a fonte única de verdade sobre o estado de cada requisição, eliminando inconsistências entre interface e persistência.