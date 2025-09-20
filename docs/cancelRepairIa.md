# Plano Definitivo: Correção do Histórico de Mensagens Canceladas

## Problema Identificado
Quando o usuário cancela uma mensagem com ESC e depois pergunta "O que eu escrevi na pergunta anterior?", a IA não consegue reconhecer a mensagem cancelada, mesmo que ela tenha sido salva no Turso.

## Causa Raiz (Confirmada)

### 1. **Race Condition e Sincronização de Estado**
- O `fullHistory` local não é atualizado quando uma mensagem é cancelada
- Existe uma race condition entre o salvamento no Turso e o carregamento para a próxima pergunta
- O histórico do Turso SUBSTITUI ao invés de MESCLAR com o fullHistory local

### 2. **Fluxo Problemático Atual**
```
1. Usuário digita: "O brasil foi criado em que ano?"
2. Usuário pressiona ESC
3. Mensagem é salva no Turso com status "cancelled"
4. fullHistory NÃO é atualizado localmente ❌
5. Usuário pergunta: "O que eu escrevi na pergunta anterior?"
6. Histórico é carregado do Turso (pode não ter a mensagem ainda)
7. fullHistory é SUBSTITUÍDO (não mesclado)
8. IA não vê a mensagem cancelada
```

## Solução Detalhada

### Fase 1: Atualizar fullHistory no Cancelamento
**Arquivo:** `interface-v2/mcp-ink-cli.mjs`

#### 1.1 Modificar a função `cleanupRequest`
```javascript
const cleanupRequest = async (requestId, reason, clearInput = false) => {
    const request = activeRequests.get(requestId);
    if (!request) return;

    // 1. Marcar como cancelado
    request.isCancelled = true;

    // 2. Abortar controlador AI
    if (request.controller) {
        request.controller.abort();
    }

    // 3. CRÍTICO: Adicionar mensagem cancelada ao fullHistory IMEDIATAMENTE
    if (reason.includes('cancel') && request.command) {
        // Adicionar a mensagem do usuário
        setFullHistory(prev => {
            const updated = [...prev];
            // Verificar se a mensagem já não está no histórico
            const lastUserMessage = updated[updated.length - 1];
            if (!lastUserMessage || lastUserMessage.content !== request.command) {
                updated.push({
                    role: 'user',
                    content: request.command
                });
            }
            // Adicionar marcador de cancelamento
            updated.push({
                role: 'assistant',
                content: '[Processing was cancelled by user - no response was generated]'
            });
            return updated;
        });
    }

    // 4. Atualizar Turso se conectado
    if (tursoAdapter.current?.isConnected() && request.tursoId) {
        try {
            await tursoAdapter.current.updateStatusByRequestId(
                request.tursoId,
                'cancelled'
            );
        } catch (error) {
            console.error('[Turso] Failed to update cancelled status:', error);
        }
    }

    // 5. Limpar do mapa APÓS todas as operações
    activeRequests.delete(requestId);

    // 6. Limpar input se necessário
    if (clearInput) {
        setInputValue('');
    }
};
```

### Fase 2: Sincronização Adequada com Turso

#### 2.1 Modificar `loadTursoHistory` para MESCLAR, não substituir
```javascript
const loadTursoHistory = async () => {
    if (!tursoAdapter.current?.isConnected() || user === 'default') {
        return;
    }

    try {
        const entries = await tursoAdapter.current.getRecentHistory(10);

        if (entries && entries.length > 0) {
            // Processar entradas do Turso
            const tursoMessages = [];

            entries.forEach(entry => {
                // Adicionar pergunta do usuário
                tursoMessages.push({
                    role: 'user',
                    content: entry.question
                });

                // Adicionar resposta ou marcador de cancelamento
                if (entry.status === 'cancelled') {
                    tursoMessages.push({
                        role: 'assistant',
                        content: '[Message processing was interrupted - no response generated]'
                    });
                } else if (entry.response) {
                    tursoMessages.push({
                        role: 'assistant',
                        content: entry.response
                    });
                }
            });

            // MESCLAR com fullHistory existente, não substituir
            setFullHistory(prev => {
                // Criar um mapa de mensagens únicas baseado no conteúdo
                const messageMap = new Map();

                // Adicionar mensagens do Turso primeiro (mais antigas)
                tursoMessages.forEach(msg => {
                    const key = `${msg.role}:${msg.content}`;
                    messageMap.set(key, msg);
                });

                // Adicionar mensagens locais (mais recentes, sobrescrevem se duplicadas)
                prev.forEach(msg => {
                    const key = `${msg.role}:${msg.content}`;
                    messageMap.set(key, msg);
                });

                // Converter de volta para array
                return Array.from(messageMap.values());
            });
        }
    } catch (error) {
        console.error('[Debug] Error loading Turso history:', error);
    }
};
```

### Fase 3: Garantir Sincronização Antes de Nova Pergunta

#### 3.1 Adicionar flag de sincronização
```javascript
// No início do componente
const [isSyncing, setIsSyncing] = useState(false);

// Modificar processCommand
const processCommand = async (command) => {
    if (command.trim() === '') return;

    // Aguardar sincronização se necessário
    if (isSyncing) {
        console.log('[Debug] Waiting for sync to complete...');
        await new Promise(resolve => {
            const checkSync = setInterval(() => {
                if (!isSyncing) {
                    clearInterval(checkSync);
                    resolve();
                }
            }, 100);
        });
    }

    // Continuar com o processamento normal...
};
```

#### 3.2 Adicionar sincronização no cleanup
```javascript
// Em cleanupRequest
if (reason.includes('cancel')) {
    setIsSyncing(true);

    // Garantir que o Turso foi atualizado
    if (tursoAdapter.current?.isConnected() && request.tursoId) {
        try {
            await tursoAdapter.current.updateStatusByRequestId(
                request.tursoId,
                'cancelled'
            );
            // Aguardar um pouco para garantir persistência
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error('[Turso] Failed to update cancelled status:', error);
        }
    }

    setIsSyncing(false);
}
```

### Fase 4: Validação do Histórico Antes de Enviar para IA

#### 4.1 Adicionar log de validação
```javascript
// Em processCommand, antes de chamar a IA
if (fullHistory.length > 0) {
    console.log('[Debug] Validating fullHistory before AI call:');
    console.log('- Total messages:', fullHistory.length);
    console.log('- Last 4 messages:', fullHistory.slice(-4));

    // Verificar se há mensagens canceladas recentes
    const recentCancelled = fullHistory.filter(
        msg => msg.content.includes('cancelled') ||
               msg.content.includes('interrupted')
    );
    console.log('- Recent cancelled messages:', recentCancelled.length);
}
```

## Testes de Validação

### Test Case 1: Cancelamento Simples
1. Digite: "Qual a capital do Brasil?"
2. Pressione ESC durante processamento
3. Digite: "O que eu perguntei antes?"
4. **Esperado:** IA responde "Você perguntou 'Qual a capital do Brasil?'"

### Test Case 2: Múltiplos Cancelamentos
1. Digite: "Pergunta 1" → ESC
2. Digite: "Pergunta 2" → ESC
3. Digite: "Quais foram minhas perguntas?"
4. **Esperado:** IA lista ambas as perguntas canceladas

### Test Case 3: Race Condition
1. Digite: "Teste rápido" → ESC
2. IMEDIATAMENTE digite: "O que eu disse?"
3. **Esperado:** IA reconhece "Teste rápido"

## Ordem de Implementação

1. **PRIMEIRO:** Atualizar `cleanupRequest` para adicionar ao fullHistory
2. **SEGUNDO:** Modificar `loadTursoHistory` para mesclar ao invés de substituir
3. **TERCEIRO:** Adicionar sincronização com flag `isSyncing`
4. **QUARTO:** Adicionar validação e logs de debug
5. **QUINTO:** Executar todos os testes de validação

## Indicadores de Sucesso

✅ Mensagens canceladas aparecem no fullHistory imediatamente
✅ Histórico do Turso é mesclado, não substitui o local
✅ Não há race conditions entre cancelamento e nova pergunta
✅ IA sempre reconhece mensagens canceladas anteriores
✅ Logs mostram histórico completo sendo passado para IA

## Notas Importantes

⚠️ **CRÍTICO:** O fullHistory deve ser a fonte de verdade para a sessão atual
⚠️ **CRÍTICO:** Sempre adicionar mensagem cancelada ao fullHistory ANTES de limpar activeRequests
⚠️ **CRÍTICO:** Mesclar, nunca substituir o histórico ao carregar do Turso

## Arquivos Afetados

- `interface-v2/mcp-ink-cli.mjs` (principal)
- `interface-v2/bridges/adapters/TursoAdapter.js` (se necessário)
- `ai_orchestrator_bash.js` (já corrigido anteriormente)
- `ai_models/claude_model.js` (já corrigido anteriormente)