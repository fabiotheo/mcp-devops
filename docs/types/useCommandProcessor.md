# PLANO COMPLETO: Tipar Corretamente useCommandProcessor.ts

## OBJETIVO
Eliminar todos os `as any` relacionados ao `useCommandProcessor` através da criação de interfaces TypeScript adequadas e unificação de tipos duplicados.

---

## ESTRUTURA DO PLANO

```
FASE 1: Preparação        FASE 2: Implementação      FASE 3: Validação
  (Passo 1-2)                (Passo 3-6)               (Passo 7-8)
       |                          |                          |
       v                          v                          v
  Unificar Tipos    -->    Criar Interfaces    -->    Testar e Documentar
```

---

## PASSOS DETALHADOS

### PASSO 1: Análise e Contexto

**Situação Atual:**
- `useCommandProcessor.ts` não possui interfaces TypeScript
- Uso excessivo de `as any` em `mcp-ink-cli.tsx`
- Múltiplas definições duplicadas de tipos
- Type safety comprometido

**Arquivos Envolvidos:**
```
src/
├── hooks/
│   ├── useCommandProcessor.ts   (principal - sem interfaces)
│   ├── useHistoryManager.ts     (referência - tem interfaces)
│   └── useRequestManager.ts     (precisa atualização)
├── types/
│   └── services.ts              (tipos centralizados)
└── mcp-ink-cli.tsx              (usa os hooks com 'as any')
```

---

### PASSO 2: Unificar Tipos Duplicados em types/services.ts

**Problema Identificado:**
- `HistoryMessage` vs `HistoryEntry` (mesma coisa, nomes diferentes)
- `TursoAdapterHistory` vs `TursoAdapter` (3 versões!)

**Ações:**

1. **Adicionar Type Helper para Refs:**
```typescript
// Em src/types/services.ts (após imports)
export type ServiceRef<T> = React.MutableRefObject<T | null>;
```

2. **Garantir exports corretos:**
```typescript
// Em src/types/services.ts
export type {
  HistoryEntry,
  TursoAdapter,
  AIOrchestrator,
  PatternMatcher,
  ServiceRef
};
```

3. **Remover tipos duplicados de useHistoryManager.ts:**
   - Deletar `export interface HistoryMessage` (linhas 19-24)
   - Deletar `export interface TursoAdapterHistory` (linhas 43-50)

4. **Atualizar imports em useHistoryManager.ts:**
```typescript
import type {
  HistoryEntry,
  TursoAdapter,
  ServiceRef
} from '../types/services.js';
```

5. **Atualizar UseHistoryManagerParams:**
```typescript
export interface UseHistoryManagerParams {
  tursoAdapter: ServiceRef<TursoAdapter>;
  setCommandHistory: Dispatch<SetStateAction<string[]>>;
  setFullHistory: Dispatch<SetStateAction<HistoryEntry[]>>;
  commandHistory: string[];
  user: string;
  isDebug: boolean;
}
```

6. **Substituir todas ocorrências de `HistoryMessage` por `HistoryEntry`** no código interno

**Validação:**
```bash
npx tsc --noEmit
```

---

### PASSO 3: Criar Interface UseCommandProcessorParams

**Adicionar no início de useCommandProcessor.ts:**

```typescript
import { useCallback } from 'react';
import { CANCELLATION_MARKER } from '../constants.js';
import type {
  AIOrchestrator,
  PatternMatcher,
  TursoAdapter,
  HistoryEntry,
  ServiceRef,
  OrchestratorResult,
  DebugFunction,
  FormatResponseFunction
} from '../types/services.js';

/**
 * Parameters for useCommandProcessor hook
 */
export interface UseCommandProcessorParams {
  // Services (refs)
  orchestrator: ServiceRef<AIOrchestrator>;
  patternMatcher: ServiceRef<PatternMatcher>;
  tursoAdapter: ServiceRef<TursoAdapter>;

  // State
  input: string;
  commandHistory: string[];
  fullHistory: HistoryEntry[];
  isProcessing: boolean;
  response: string;
  error: string | null;
  status: string;

  // State setters
  setCommandHistory: React.Dispatch<React.SetStateAction<string[]>>;
  setFullHistory: React.Dispatch<React.SetStateAction<HistoryEntry[]>>;
  setHistory: React.Dispatch<React.SetStateAction<string[]>>;
  setResponse: React.Dispatch<React.SetStateAction<string>>;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  // Functions
  saveToHistory: (command: string, response?: string | null) => Promise<void>;
  formatResponse: FormatResponseFunction;
  debug: DebugFunction;

  // Request manager (temporariamente any até tipar useRequestManager)
  requestManager: any;

  // Config
  user: string;
  isDebug: boolean;
}
```

**Atualizar assinatura da função:**
```typescript
export function useCommandProcessor(params: UseCommandProcessorParams) {
  // Desestruturar params
  const {
    orchestrator,
    patternMatcher,
    tursoAdapter,
    fullHistory,
    setFullHistory,
    setHistory,
    setCommandHistory,
    requestManager,
    user,
    debug,
    formatResponse,
    isProcessing,
    setIsProcessing,
    response,
    setResponse,
    error,
    setError,
    status,
    setStatus
  } = params;

  // ... resto do código permanece igual
}
```

---

### PASSO 4: Criar Interface UseCommandProcessorReturn

**Adicionar após UseCommandProcessorParams:**

```typescript
/**
 * Return type for useCommandProcessor hook
 */
export interface UseCommandProcessorReturn {
  processCommand: (command: string) => Promise<void>;
}
```

**Atualizar o retorno da função:**

```typescript
export function useCommandProcessor(
  params: UseCommandProcessorParams
): UseCommandProcessorReturn {
  // ... implementação

  return {
    processCommand
  };
}
```

---

### PASSO 5: Atualizar useHistoryManager Completamente

**Já foi feito no Passo 2**, mas garantir:

1. Nenhum tipo duplicado
2. Todos os imports de `types/services.ts`
3. `UseHistoryManagerParams` usa `ServiceRef<TursoAdapter>`
4. `UseHistoryManagerReturn` está definido

---

### PASSO 6: Remover `as any` de mcp-ink-cli.tsx

**Localização: src/mcp-ink-cli.tsx (linhas 106-158)**

**ANTES:**
```typescript
const { loadCommandHistory, saveToHistory } = useHistoryManager({
  tursoAdapter: tursoAdapter as any,
  setCommandHistory,
  setFullHistory: setFullHistory as any,
  commandHistory,
  user: currentUser,
  isDebug: debugMode
});

const requestManager = useRequestManager({
  setFullHistory: setFullHistory as any,
  setInput,
  setIsProcessing: actions.core.setIsProcessing,
  setStatus,
  setError,
  tursoAdapter: tursoAdapter as any,
  isDebug: debugMode,
  isTTY,
});

const { processCommand } = useCommandProcessor({
  // ... 20+ propriedades
} as any);
```

**DEPOIS:**
```typescript
const { loadCommandHistory, saveToHistory } = useHistoryManager({
  tursoAdapter,
  setCommandHistory,
  setFullHistory,
  commandHistory,
  user: currentUser,
  isDebug: debugMode
});

const requestManager = useRequestManager({
  setFullHistory,
  setInput,
  setIsProcessing: actions.core.setIsProcessing,
  setStatus,
  setError,
  tursoAdapter,
  isDebug: debugMode,
  isTTY,
});

const { processCommand } = useCommandProcessor({
  // Core state
  input,
  commandHistory,
  fullHistory,
  isProcessing,
  response,
  error,
  status,
  // Services
  orchestrator,
  patternMatcher,
  tursoAdapter,
  // Functions
  saveToHistory,
  setCommandHistory,
  setFullHistory,
  setHistory,
  setResponse,
  setIsProcessing: actions.core.setIsProcessing,
  setStatus,
  setError,
  // Other
  requestManager,
  isDebug: debugMode,
  user: currentUser,
  formatResponse,
  debug
});
```

---

### PASSO 7: Compilar e Corrigir Erros

**Processo iterativo:**

1. **Compilar sem emitir:**
```bash
npx tsc --noEmit
```

2. **Analisar erros:**
   - Tipos incompatíveis → Ajustar em `types/services.ts`
   - Propriedades faltando → Adicionar à interface
   - Imports errados → Corrigir paths

3. **Corrigir um erro de cada vez**

4. **Recompilar após cada correção**

5. **Compilar arquivos finais:**
```bash
npm run build
```

---

### PASSO 8: Testar e Documentar

**Checklist de Testes:**

```
[ ] TypeScript compila sem erros (npx tsc --noEmit)
[ ] Build completa funciona (npm run build)
[ ] App executa normalmente (node src/mcp-ink-cli.tsx)
[ ] Autocomplete funciona no VSCode
[ ] Nenhum 'as any' relacionado aos hooks
[ ] Histórico funciona corretamente
```

**Testes Funcionais:**
```bash
MCP_USER=fabio node src/mcp-ink-cli.tsx --debug
```

1. Fazer pergunta simples: "oi teste"
2. Fazer pergunta sobre histórico: "o que eu digitei antes?"
3. Verificar logs sem erros

**Documentação:**
- Atualizar `TYPE_SAFETY_ISSUES.md` → marcar como RESOLVIDO
- Adicionar comentários nos arquivos modificados
- Documentar decisões arquiteturais

---

## DEPENDÊNCIAS ENTRE PASSOS

```
Passo 1 (Análise)
    |
    v
Passo 2 (Unificar Tipos) ──┐
    |                       |
    v                       |
Passo 3 (Params) ───────────┤
    |                       |
    v                       |
Passo 4 (Return) ───────────┤
    |                       |
    v                       |
Passo 5 (useHistoryManager) ┤
    |                       |
    v                       |
Passo 6 (Remover as any) <──┘
    |
    v
Passo 7 (Compilar) ─────┐
    |                   |
    v                   |
Passo 8 (Testar) <──────┘
```

---

## RESULTADO ESPERADO

**Antes:**
- 5+ ocorrências de `as any`
- Tipos duplicados em múltiplos arquivos
- Sem type safety
- Autocomplete não funciona

**Depois:**
- Zero `as any` nos hooks
- Tipos unificados em `types/services.ts`
- Type safety completo
- Autocomplete funcionando
- Código mais fácil de manter

---

## STATUS DE IMPLEMENTAÇÃO

- [ ] Passo 1: Análise e Contexto
- [ ] Passo 2: Unificar Tipos Duplicados
- [ ] Passo 3: Criar Interface UseCommandProcessorParams
- [ ] Passo 4: Criar Interface UseCommandProcessorReturn
- [ ] Passo 5: Atualizar useHistoryManager
- [ ] Passo 6: Remover `as any` de mcp-ink-cli.tsx
- [ ] Passo 7: Compilar e Corrigir Erros
- [ ] Passo 8: Testar e Documentar

---

## NOTAS IMPORTANTES

1. **Ordem dos passos é crítica** - Não pule etapas
2. **Compile após cada passo** - Use `npx tsc --noEmit` para validação
3. **Mantenha backup** - Faça commit antes de mudanças grandes
4. **Teste incrementalmente** - Não espere até o final para testar
5. **Documente decisões** - Adicione comentários explicando escolhas de tipos

---

## PRÓXIMOS PASSOS APÓS CONCLUSÃO

Após completar este plano, considere:
1. Tipar `useRequestManager` seguindo o mesmo padrão
2. Tipar `useInputHandler` e outros hooks
3. Criar documentação de padrões de tipagem para o projeto
4. Configurar ESLint para proibir `as any` em código novo
