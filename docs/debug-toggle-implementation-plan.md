# Plano Corrigido: Implementar Toggle de Debug Mode

## Visão Geral

Implementar funcionalidade real para o comando `/debug`, permitindo ativar/desativar o modo debug em tempo de execução sem reiniciar a aplicação.

```
Estado Atual:          Estado Desejado:
─────────────          ────────────────
/debug                 /debug
  |                      |
  └─> "Not supported"    ├─> Toggle ON/OFF
                         ├─> Feedback visual
                         └─> Logs em /tmp/mcp-debug.log
```

## Arquitetura da Solução

```
BackendConfig (já existe)
    |
    ├─> isDebug: boolean (reativo via setConfig)
    |
    └─> Propaga para:
         ├─> debug logger (via useMemo)
         ├─> Hooks (useBackendInitialization, useRequestManager, etc)
         ├─> TursoAdapter
         └─> formatResponse
```

---

## ⚠️ CORREÇÃO: isDebug já existe!

**IMPORTANTE:** `isDebug` já está definido em `BackendConfig` (types/services.ts:272) e já é reativo através do AppContext. NÃO é necessário adicionar ao CoreState.

```typescript
// JÁ EXISTE em types/services.ts
export interface BackendConfig {
  isDebug?: boolean;
  // ...
}

// JÁ EXISTE em AppContext.ts:206
const appConfig = useMemo<BackendConfig>(() => ({
  isDebug: configState.isDebug || false,
  // ...
}), [configState, config.isDebug]);
```

---

## Fase 1: ~~Preparar AppContext~~ (NÃO NECESSÁRIO)

**SKIP - AppContext já tem tudo que precisamos:**
- ✅ `BackendConfig.isDebug` já existe
- ✅ `setConfig` já existe (AppContext.ts:257)
- ✅ Config já é reativo via useMemo

---

## Fase 2: Implementar Toggle Handler

**Arquivo:** `src/mcp-ink-cli.tsx` (linha 374)

### Passo 2.1: Substituir case TOGGLE_DEBUG

**REMOVER:**
```typescript
case 'TOGGLE_DEBUG':
  // Debug toggle is handled by the original implementation
  // We don't handle it here in the command selector
  setResponse('Debug mode toggle not supported from command selector');
  break;
```

**ADICIONAR:**
```typescript
case 'TOGGLE_DEBUG':
  const newIsDebug = !config.isDebug;
  setConfig({ ...config, isDebug: newIsDebug });
  const debugMsg = newIsDebug
    ? '🐛 Debug mode enabled - Logs will be saved to /tmp/mcp-debug.log'
    : '✓ Debug mode disabled - Logging stopped';
  setResponse(debugMsg);
  setHistory([...history, `❯ ${command}`, formatResponse(debugMsg, debug)]);
  break;
```

---

## Fase 3: Criar Debug Logger Reativo

**Arquivo:** `src/mcp-ink-cli.tsx`

### Passo 3.1: REMOVER debug estático no topo do arquivo (linhas 54-55)

**REMOVER:**
```typescript
// Module-level variables
const isDebug: boolean = process.argv.includes('--debug');
const debug = createDebugLogger(isDebug);
```

### Passo 3.2: ADICIONAR debug reativo dentro de MCPInkAppInner (após linha 104)

**ADICIONAR** (logo após `const terminalWidth = stdout?.columns || 80;`):
```typescript
// Create reactive debug logger based on config
const debug = React.useMemo(
  () => createDebugLogger(config.isDebug || false),
  [config.isDebug]
);
```

---

## Fase 4: Configurar isDebug Inicial

**Arquivo:** `src/mcp-ink-cli.tsx` (linha 712)

### Passo 4.1: Passar isDebug inicial para AppProvider

**Localização:** Onde `MCPInkApp` renderiza o `AppProvider`

**ADICIONAR:**
```typescript
const initialIsDebug = process.argv.includes('--debug');

// No render do AppProvider
React.createElement(
  AppProvider,
  {
    config: {
      user,
      isDebug: initialIsDebug,
      isTTY: process.stdout.isTTY
    }
  },
  React.createElement(MCPInkAppInner)
);
```

---

## Arquivos a Modificar

```
src/
└── mcp-ink-cli.tsx              (Fases 2, 3 e 4)

Total: 1 arquivo
Linhas estimadas: ~20 mudanças
```

**NOTA:** AppContext.ts NÃO precisa ser modificado - já tem tudo!

---

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| debug logger não atualizar | Alto | Usar useMemo com config.isDebug como dependência |
| TOGGLE_DEBUG não aplicar | Médio | Usar setConfig que já dispara re-render |
| Inicial isDebug não funcionar | Baixo | Passar no config do AppProvider |

---

## Checklist de Testes

```
[ ] 1. Iniciar app SEM --debug
    -> Executar /debug
    -> Verificar mensagem "Debug mode enabled"
    -> Executar comando qualquer
    -> Verificar que logs aparecem em /tmp/mcp-debug.log

[ ] 2. Executar /debug novamente
    -> Verificar mensagem "Debug mode disabled"
    -> Executar comando qualquer
    -> Verificar que logs PARAM

[ ] 3. Iniciar app COM --debug
    -> Verificar que logs já aparecem
    -> Executar /debug
    -> Verificar que desliga

[ ] 4. Verificar /status
    -> Deve mostrar estado correto do debug
```

---

## Diferenças do Plano Original

**CORREÇÕES APLICADAS:**

1. ✅ Arquivo correto: `AppContext.ts` (não .tsx)
2. ✅ Removida Fase 1: isDebug já existe em BackendConfig
3. ✅ Simplificado: 1 arquivo ao invés de 6
4. ✅ Debug logger reativo: useMemo ao invés de useState
5. ✅ Implementação real do TOGGLE_DEBUG (não apenas stub)
6. ✅ Configuração inicial através do AppProvider

---

## Status

- [x] Plano criado
- [x] Plano revisado e corrigido
- [x] Implementação completa
- [x] Bug corrigido (TursoAdapter debug hardcoded)
- [x] Build compilado sem erros
- [ ] Testes manuais realizados pelo usuário

## Bug Adicional Corrigido

Durante a implementação, foi descoberto que `TursoAdapter.initialize()` tinha múltiplos `debugLog()` com `true` hardcoded ao invés de `this.debug`, causando logs mesmo sem `--debug`. Todas as ocorrências foram corrigidas.
