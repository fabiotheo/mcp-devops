# Plano de Integração Turso no mcp-claude.js

## Visão Geral

Este documento detalha o plano completo para integrar o Turso Database no `mcp-claude.js`, mantendo toda a UX atual (paste detection, ESC interruption, conversation history) enquanto adiciona persistência de conversas e sincronização entre sessões.

## Contexto Atual

### O que temos:
- `mcp-claude.js` - Interface moderna com UX melhorado
- Sistema antigo (`src/core/mcp-interactive.js`) - Tinha integração completa com Turso
- `libs/turso-client.js` - Cliente Turso já implementado
- Infraestrutura de configuração e setup funcional

### O que perdemos na migração:
- Persistência de conversas no database
- Sincronização entre múltiplas máquinas/sessões
- Histórico de longo prazo
- Integração com sistema de usuários e máquinas

## Estratégia de Implementação

### Abordagem: Sistema Híbrido Faseado

```
MEMÓRIA (UX rápida)  +  TURSO (persistência)
       |                      |
   conversationHistory    saveCommand()
       |                      |
   Interface responsiva   Sync assíncrono
```

### Fases de Desenvolvimento

```
FASE 1: Envio para Turso (Prioridade)
├── Setup e inicialização
├── Salvamento automático de conversas
├── Política ESC para cancelamentos
└── Error handling robusto

FASE 2: Recovery do Turso (Futuro)
├── Carregamento de histórico na inicialização
├── Merge inteligente memória + Turso
└── Sincronização cross-session
```

## FASE 1: Implementação de Envio

### Objetivos
- Salvar todas as conversas automaticamente no Turso
- Implementar política ESC para cancelamentos
- Manter performance UX inalterada
- Graceful degradation se Turso falhar

### Política ESC Definida
```
ESC pressionado → Salvar pergunta com status "cancelled"
                → NÃO salvar resposta (foi interrompida)
                → Manter histórico em memória para contexto
                → Permitir análise de padrões de cancelamento
```

### Sequência de Implementação

#### Etapa 1: Preparação
- Criar backup: `cp mcp-claude.js mcp-claude-backup.js`
- Verificar APIs do TursoHistoryClient existente
- Adicionar imports necessários

#### Etapa 2: Setup Básico
- Adicionar propriedades Turso ao constructor
- Implementar `initializeTurso()` method
- Integrar inicialização no `start()` method
- Teste: Verificar conexão Turso funciona

#### Etapa 3: Salvamento de Conversas
- Implementar `saveTursoConversation()` method
- Adicionar hook pós-resposta em `processQuery()`
- Adicionar sessionId generation
- Teste: Verificar salvamento após resposta IA

#### Etapa 4: Política ESC
- Modificar ESC handler para salvar pergunta cancelada
- Adicionar flag para tracking estado cancellation
- Teste: ESC salva pergunta como "cancelled"

#### Etapa 5: Error Handling & Polish
- Graceful degradation se Turso falhar
- Logging apropriado sem spam UX
- Teste: Modo offline funciona perfeitamente

## Implementação Técnica Detalhada

### 1. Imports Adicionais

```javascript
import TursoHistoryClient from './libs/turso-client.js';
import UserManager from './libs/user-manager.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
```

### 2. Modificações no Constructor

```javascript
constructor() {
    // ... existing code ...

    // Turso integration
    this.tursoClient = null;
    this.tursoEnabled = false;
    this.currentUser = null;
    this.sessionId = uuidv4(); // Unique session identifier
    this.pendingSaves = new Set(); // Track async saves
}
```

### 3. Método de Inicialização

```javascript
async initializeTurso() {
    try {
        const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');
        if (!existsSync(configPath)) {
            console.log(chalk.gray('ℹ️  Turso não configurado (modo offline)'));
            return;
        }

        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        this.tursoClient = new TursoHistoryClient(config);
        await this.tursoClient.initialize();
        this.tursoEnabled = true;

        // Get current user context
        const userManager = new UserManager(this.tursoClient.client);
        this.currentUser = await userManager.getCurrentUser();

        console.log(chalk.green('✓ Turso conectado'));
    } catch (error) {
        console.log(chalk.yellow(`⚠️  Turso indisponível: ${error.message}`));
        this.tursoEnabled = false;
    }
}
```

### 4. Integração no Start Method

```javascript
async start() {
    // ... existing initialization ...

    // Initialize Turso after basic setup
    await this.initializeTurso();

    // ... rest of start method ...
}
```

### 5. Hook Pós-Resposta IA

```javascript
async processQuery(query) {
    // ... existing code até linha de push assistant response ...

    if (response && this.isProcessing) {
        // ... existing response handling ...
        this.conversationHistory.push({ role: 'assistant', content: response });

        // TURSO INTEGRATION: Save completed conversation
        setImmediate(() => this.saveTursoConversation(query, response, 'completed'));
    }

    // ... rest of method ...
}
```

### 6. Modificação do ESC Handler

```javascript
// ESC - Cancel input or interrupt processing
if (key === '\x1b') {
    // If we're processing with AI, interrupt it
    if (this.isProcessing) {
        this.wasInterrupted = true;
        this.isProcessing = false;
        this.spinner.stop();
        this.streamer.abort();

        // TURSO INTEGRATION: Save cancelled question
        if (this.conversationHistory.length > 0) {
            const lastMessage = this.conversationHistory[this.conversationHistory.length - 1];
            if (lastMessage.role === 'user') {
                setImmediate(() => this.saveTursoConversation(lastMessage.content, null, 'cancelled'));
            }
        }

        console.log(chalk.yellow('\n⚠ Interrupted'));
        this.showPrompt();
        return;
    }
    // ... rest of ESC handling ...
}
```

### 7. Método de Salvamento

```javascript
async saveTursoConversation(question, response, status) {
    if (!this.tursoEnabled) return;

    try {
        await this.tursoClient.saveCommand(question, response, {
            status: status,
            user: this.currentUser,
            timestamp: new Date().toISOString(),
            session_id: this.sessionId
        });
    } catch (error) {
        // Log but don't interrupt UX
        console.error('Turso save failed:', error.message);
    }
}
```

## Protocolo de Testes

### Test Suite 1: Funcionalidade Básica

```bash
# Test 1: Conexão Turso
node mcp-claude.js
# Expected: "✓ Turso conectado" ou "⚠️ Turso indisponível"

# Test 2: Conversa Normal
❯ Como listar arquivos?
# Expected: Resposta IA + save silencioso no Turso

# Test 3: Verificar Salvamento
./ipcom-chat history --limit 1
# Expected: Última conversa aparece no histórico
```

### Test Suite 2: Política ESC

```bash
# Test 4: Cancelamento
❯ Esta é uma pergunta que vou cancelar [ESC]
⚠ Interrupted
❯

# Test 5: Verificar Cancelamento no DB
./ipcom-chat history --status cancelled
# Expected: Pergunta cancelada aparece com status "cancelled"
```

### Test Suite 3: Error Scenarios

```bash
# Test 6: Modo Offline
mv ~/.mcp-terminal/turso-config.json ~/.mcp-terminal/turso-config.json.bak
node mcp-claude.js
# Expected: "ℹ️ Turso não configurado (modo offline)" + interface funciona normal

# Test 7: Recovery
mv ~/.mcp-terminal/turso-config.json.bak ~/.mcp-terminal/turso-config.json
# Next session should connect to Turso again
```

## Critérios de Sucesso Fase 1

- [ ] 100% conversas salvas no Turso
- [ ] ESC salva pergunta como "cancelled"
- [ ] UX performance inalterada
- [ ] Modo offline funcional
- [ ] Zero breaking changes
- [ ] Interface nunca crasha por erros Turso

## Considerações de Performance

- `setImmediate()` para não bloquear UI thread
- `Set` tracking para evitar duplicate saves
- Error boundaries para não crashar interface
- Operações assíncronas sempre
- Graceful degradation como padrão

## FASE 2: Roadmap Futuro (História Recovery)

### Fase 2A: History Loading
- Carregar histórico Turso na inicialização
- Merge inteligente com conversationHistory em memória
- Limite de histórico (últimas 20-50 conversas)
- Filtro por período/usuário

### Fase 2B: Cross-Session Sync
- Detectar novas conversas de outras sessões
- Sync periódico opcional
- Resolução de conflitos
- Cache invalidation strategies

### Fase 2C: Advanced Features (opcional)
- Search no histórico via CLI
- Export/import conversations
- Analytics de usage patterns
- Multi-user session management

## Implementação Prática

### Passo 1: Backup e Preparação
```bash
cp mcp-claude.js mcp-claude-backup.js
```

### Passo 2: Implementação Incremental
1. Adicionar imports e propriedades
2. Implementar `initializeTurso()`
3. Integrar no `start()`
4. Testar conexão
5. Implementar `saveTursoConversation()`
6. Adicionar hooks de salvamento
7. Testar salvamento
8. Implementar política ESC
9. Testar cancelamentos
10. Polish e error handling

### Passo 3: Validação Completa
- Executar todos os test suites
- Verificar performance
- Confirmar compatibilidade CLI
- Validar modo offline

## Resultado Final

Sistema híbrido que mantém toda a excelente UX do `mcp-claude.js` atual, mas adiciona:
- Persistência automática de todas as conversas
- Histórico sincronizado entre sessões
- Política inteligente para cancelamentos
- Modo offline robusto
- Zero impact na performance percebida

O plano está pronto para implementação imediata!