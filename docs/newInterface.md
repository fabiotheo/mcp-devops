# Plano de Migração para Nova Interface CLI com Ink

## Visão Geral

Este documento descreve o plano completo de migração da interface CLI atual (baseada em readline/raw input) para uma nova arquitetura usando **Ink** (React-like CLI framework). A migração resolve o problema crítico onde texto colado é executado automaticamente sem pressionar Enter.

## Problema Atual

- **Bug Crítico**: Sistema cola texto e executa automaticamente sem aguardar Enter
- **Arquitetura Legacy**: Interface baseada em readline com acoplamento forte
- **Limitações**: Dificuldade para adicionar features modernas como syntax highlighting em tempo real

## Solução Proposta

Migração para **Ink** com:
- Componentes React-like para UI
- Bracketed Paste Mode nativo
- Syntax highlighting via cli-highlight
- Arquitetura desacoplada e testável

## Arquitetura da Nova Interface

```
┌─────────────────────────────────────────┐
│           Ink UI Layer                  │
│  ┌─────────────┐  ┌──────────────┐     │
│  │ App.jsx     │  │ Components   │     │
│  │ (Main)      │  │ - InputBox   │     │
│  └──────┬──────┘  │ - History    │     │
│         │         │ - Highlight  │     │
│         │         └──────────────┘     │
├─────────┴───────────────────────────────┤
│         Event Bridge Layer              │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ AIConnector  │  │ EventEmitter │    │
│  └──────┬───────┘  └──────┬───────┘    │
├─────────┴─────────────────┴─────────────┤
│         Backend Services                │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ AI           │  │ Pattern      │    │
│  │ Orchestrator │  │ Matcher      │    │
│  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────┘
```

## Fases de Implementação

### FASE 0: BACKUP E PREPARAÇÃO
**Objetivo**: Preservar sistema atual e preparar ambiente

#### Tarefas:
1. **Criar estrutura de backup**
   - Criar diretório `backup-interface/`
   - Copiar arquivos de interface atuais:
     - `test-raw-input.js`
     - `ipcom-chat-cli.js`
     - `mcp_assistant.js`
     - Qualquer arquivo relacionado a input/interface

2. **Instalar dependências**
   ```bash
   pnpm add ink@4 @inkjs/ui cli-highlight external-editor
   pnpm add -D @types/react fuse.js
   ```

3. **Configurar ambiente de desenvolvimento**
   - Criar diretório `interface-v2/`
   - Configurar estrutura de projeto React-like
   - Documentar arquitetura atual em `backup-interface/ARCHITECTURE.md`

4. **Validação**
   - Confirmar que backup está completo
   - Verificar instalação de dependências
   - Testar que sistema atual continua funcionando

---

### FASE 1: IMPLEMENTAÇÃO BÁSICA COM INK
**Objetivo**: Criar interface mínima funcional com Bracketed Paste Mode

#### Componentes Core:
1. **App.jsx - Componente principal**
   ```jsx
   // Estrutura básica do componente
   - useInput hook para captura de teclas
   - useState para gerenciar input buffer
   - useStdin para raw mode control
   ```

2. **PasteManager - Gerenciador de colagem**
   ```javascript
   // Detectar sequências de bracketed paste
   - \x1b[200~ (início do paste)
   - \x1b[201~ (fim do paste)
   - Acumular buffer durante paste
   - Processar apenas quando completo
   ```

3. **InputHandler - Processador de entrada**
   - Diferenciar typing vs pasting
   - Suporte a comandos básicos (Ctrl+C para sair)
   - Gerenciar cursor e edição de linha

4. **Testes**
   - `test-ink-basic.js` para validar entrada simples
   - Testar paste de texto multiline
   - **VALIDAÇÃO CRÍTICA**: Paste NÃO executa automaticamente

#### Estrutura de arquivos:
```
interface-v2/
├── components/
│   ├── App.jsx
│   ├── InputHandler.jsx
│   └── PasteManager.jsx
├── tests/
│   └── test-ink-basic.js
└── index.js
```

---

### FASE 2: FEATURES AVANÇADAS
**Objetivo**: Adicionar funcionalidades profissionais

#### Features a implementar:
1. **Syntax Highlighting**
   - Integrar `cli-highlight`
   - Criar componente `HighlightedText`
   - Destacar código em tempo real durante digitação

2. **Histórico de Comandos**
   - Persistência em filesystem local
   - Navegação com setas (↑/↓)
   - Busca incremental no histórico

3. **Autocomplete**
   - Fuzzy matching com `fuse.js`
   - Sugestões em tempo real
   - Tab completion

4. **Indicadores Visuais**
   - Spinner durante processamento
   - Ícones de status:
     - ✓ Success
     - ✗ Error
     - ⚡ Processing
   - Contador de linhas para multi-line input

5. **Componentes adicionais**
   ```
   components/
   ├── HighlightedText.jsx
   ├── CommandHistory.jsx
   ├── AutoComplete.jsx
   └── StatusIndicator.jsx
   ```

6. **Testes**
   - `test-ink-advanced.js`
   - Validar highlighting funciona
   - Testar autocomplete e histórico

---

### FASE 3: INTEGRAÇÃO COM SISTEMA EXISTENTE
**Objetivo**: Conectar nova UI com backend AI

#### Componentes de Integração:
1. **AIConnector Bridge**
   ```javascript
   // Bridge entre Ink UI e ai_orchestrator.js
   - EventEmitter para comunicação bidirecional
   - Manter compatibilidade com API existente
   ```

2. **CommandProcessor**
   - Receber input do Ink
   - Enviar para AI orchestrator
   - Retornar respostas para UI

3. **Adapters**
   - Pattern Matcher adapter
   - Web Search adapter
   - Turso Client adapter (histórico distribuído)

4. **Modo Debug**
   - Monitor de eventos UI↔Backend
   - Log de comunicação
   - Performance metrics

5. **Estrutura de integração**
   ```
   interface-v2/
   ├── bridges/
   │   ├── AIConnector.js
   │   ├── CommandProcessor.js
   │   └── adapters/
   │       ├── PatternAdapter.js
   │       ├── WebSearchAdapter.js
   │       └── TursoAdapter.js
   ```

6. **Validação**
   - `test-integration.js`
   - Comandos fluem UI → AI → UI
   - Respostas mantêm formatação

---

### FASE 4: MIGRAÇÃO E DEPLOYMENT
**Objetivo**: Substituir interface antiga com segurança

#### Estratégia de Migração:
1. **Script de Migração**
   ```bash
   migrate-to-ink.js
   - Preservar configurações existentes
   - Migrar histórico de comandos
   - Backup automático antes da migração
   ```

2. **Mecanismos de Segurança**
   - Fallback para interface antiga (`--legacy` flag)
   - Health check antes de ativar
   - Rollback automático se detectar crashes

3. **Atualização do Setup**
   ```javascript
   // setup.js modifications
   - Incluir arquivos de interface-v2/
   - Configurar instalação condicional
   - Detectar suporte do terminal
   ```

4. **Documentação**
   - `MIGRATION.md` - Guia de migração
   - Breaking changes
   - Troubleshooting comum

5. **Teste em Staging**
   - Deploy em ambiente Linux de teste
   - Validar todos os comandos existentes
   - Teste de stress com múltiplos usuários

6. **Checklist de Deploy**
   - [ ] Backup completo realizado
   - [ ] Testes passando em staging
   - [ ] Documentação atualizada
   - [ ] Rollback testado
   - [ ] Monitoramento configurado

---

### FASE 5: OTIMIZAÇÃO E POLIMENTO
**Objetivo**: Performance e experiência profissional

#### Otimizações:
1. **Performance**
   - Debouncing para syntax highlighting
   - React.memo para componentes pesados
   - Cache de autocomplete suggestions
   - Streaming para respostas longas

2. **Robustez**
   - Graceful degradation sem suporte a cores
   - Handling de terminais limitados
   - Recovery de estados corrompidos

3. **Monitoring**
   - Performance metrics
   - Telemetria opcional
   - Error tracking

4. **Testes de Stress**
   - Inputs grandes (>10MB paste)
   - Múltiplas sessões simultâneas
   - Terminals com latência alta

5. **Benchmarks**
   ```
   Métricas a comparar:
   - Tempo de resposta ao input
   - Memory footprint
   - CPU usage durante paste
   - Startup time
   ```

6. **Documentação Final**
   - `PERFORMANCE.md` - Otimizações implementadas
   - Benchmarks interface antiga vs nova
   - Best practices para extensão

---

## Cronograma Sugerido

```
Semana 1: FASE 0 + FASE 1
├── Dias 1-2: Backup e preparação
└── Dias 3-5: Implementação básica Ink

Semana 2: FASE 2
├── Dias 1-3: Features avançadas
└── Dias 4-5: Testes e refinamento

Semana 3: FASE 3 + FASE 4
├── Dias 1-2: Integração com backend
├── Dia 3: Testes de integração
└── Dias 4-5: Preparação para migração

Semana 4: FASE 4 + FASE 5
├── Dias 1-2: Deploy em staging
├── Dia 3: Validação e ajustes
└── Dias 4-5: Otimizações finais
```

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Incompatibilidade com terminais antigos | Média | Alto | Fallback para interface legacy |
| Performance degradada com Ink | Baixa | Médio | Benchmarks contínuos, otimizações |
| Bugs no Bracketed Paste Mode | Média | Alto | Testes extensivos, múltiplos terminals |
| Resistência dos usuários | Baixa | Baixo | Período de transição com --legacy |

## Critérios de Sucesso

- ✅ Paste de texto NÃO executa automaticamente
- ✅ Performance igual ou melhor que interface atual
- ✅ Todas as funcionalidades existentes preservadas
- ✅ Syntax highlighting funcionando em tempo real
- ✅ Zero crashes em produção por 7 dias
- ✅ Feedback positivo dos usuários

## Próximos Passos

1. **Aprovação do plano**
2. **Início da FASE 0** - Backup e preparação
3. **Criação de branch `feature/ink-interface`**
4. **Setup do ambiente de desenvolvimento**

## Referências

- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [Bracketed Paste Mode](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Bracketed-Paste-Mode)
- [cli-highlight](https://github.com/felixfbecker/cli-highlight)
- Documentação original: `docs/multiLines.md`

---

*Documento criado em: 2025-01-16*
*Última atualização: 2025-01-16*