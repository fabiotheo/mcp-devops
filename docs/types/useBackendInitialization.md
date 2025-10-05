# Plano Completo: Tipagem de useBackendInitialization

## Objetivo
Remover os 5 `as any` do useBackendInitialization e garantir type safety completo, seguindo o padrão estabelecido nos hooks anteriores.

## Visão Geral do Plano

```
FASE 1: INVESTIGAÇÃO (Passos 1-3)
    |
    v
FASE 2: DECISÃO (Passo 4)
    |
    v
FASE 3: IMPLEMENTAÇÃO (Passos 5-8)
    |
    v
FASE 4: VALIDAÇÃO (Passos 9-10)
```

---

## FASE 1: INVESTIGAÇÃO

### PASSO 1: Analisar o Problema
**Objetivo:** Mapear os 5 type mismatches

**5 `as any` identificados:**
1. `setConfig as any` - Type mismatch between AppConfig and BackendConfig
2. `setStatus as any` - Type mismatch between status types
3. `orchestrator as any` - Ref type mismatch
4. `patternMatcher as any` - Ref type mismatch
5. `tursoAdapter as any` - Ref type mismatch

**Arquivos envolvidos:**
- src/hooks/useBackendInitialization.ts
- src/mcp-ink-cli.tsx
- src/contexts/AppContext.ts
- src/types/services.ts

---

### PASSO 2: Investigar useBackendInitialization.ts
**Objetivo:** Entender tipos esperados pelo hook

**Ações:**
- [ ] Ler src/hooks/useBackendInitialization.ts
- [ ] Identificar interfaces locais definidas
- [ ] Mapear parâmetros esperados
- [ ] Documentar tipos exatos de cada parâmetro

**Resultado esperado:**
```
Hook espera:
- setConfig: Dispatch<SetStateAction<BackendConfig>>
- setStatus: Dispatch<SetStateAction<StatusType>>
- orchestrator: MutableRefObject<X> | ServiceRef<X>
- patternMatcher: MutableRefObject<Y> | ServiceRef<Y>
- tursoAdapter: MutableRefObject<Z> | ServiceRef<Z>
```

---

### PASSO 3: Investigar AppContext.ts
**Objetivo:** Entender tipos fornecidos

**Ações:**
- [ ] Ler src/contexts/AppContext.ts
- [ ] Identificar tipo de setConfig
- [ ] Identificar tipo de setStatus
- [ ] Comparar estrutura de AppConfig

**Resultado esperado:**
```
MAPA DE COMPARAÇÃO:
AppContext fornece          Hook espera
------------------------    ------------------------
setConfig: Type A      vs.  setConfig: Type B
setStatus: Type C      vs.  setStatus: Type D
orchestrator: Ref<X>   vs.  orchestrator: Type E
```

---

## FASE 2: DECISÃO

### PASSO 4: Decidir Estratégia de Tipagem
**Objetivo:** Definir abordagem para cada type mismatch

**Estratégias possíveis:**

**1. orchestrator/patternMatcher/tursoAdapter:**
- Usar ServiceRef<T> (já estabelecido nos outros hooks)
- Verificar se hook espera MutableRefObject ou ServiceRef

**2. setConfig:**
- [ ] Se BackendConfig === AppConfig → unificar
- [ ] Se BackendConfig ⊂ AppConfig → usar tipo mais amplo
- [ ] Se incompatíveis → criar função de conversão

**3. setStatus:**
- [ ] Verificar se é string simples ou tipo específico
- [ ] Unificar se possível

**Decisões a tomar:**
- [ ] Criar UseBackendInitializationParams interface?
- [ ] Atualizar types/services.ts?
- [ ] Precisa função de conversão?

---

## FASE 3: IMPLEMENTAÇÃO

### PASSO 5: Criar UseBackendInitializationParams Interface
**Objetivo:** Interface completa seguindo padrão estabelecido

**Template:**
```typescript
import { Dispatch, SetStateAction } from 'react';
import type {
  AIOrchestrator,
  PatternMatcher,
  TursoAdapter,
  ServiceRef,
  AppConfig  // ou BackendConfig
} from '../types/services.js';

export interface UseBackendInitializationParams {
  // Config setters
  setConfig: Dispatch<SetStateAction<AppConfig>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;

  // Services (refs)
  orchestrator: ServiceRef<AIOrchestrator>;
  patternMatcher: ServiceRef<PatternMatcher>;
  tursoAdapter: ServiceRef<TursoAdapter>;

  // Functions
  loadCommandHistory: () => Promise<void>;

  // Config
  user: string;
  isDebug: boolean;
}
```

**Ações:**
- [ ] Adicionar imports necessários
- [ ] Exportar interface
- [ ] Documentar cada propriedade com JSDoc
- [ ] Atualizar assinatura da função

---

### PASSO 6: Unificar Tipos (se necessário)
**Objetivo:** Resolver duplicações de tipos

**Cenários:**

**Cenário 1: BackendConfig é duplicata**
- [ ] Remover BackendConfig
- [ ] Usar apenas AppConfig
- [ ] Garantir export em types/services.ts

**Cenário 2: BackendConfig extends AppConfig**
- [ ] Manter AppConfig como base
- [ ] BackendConfig extends AppConfig
- [ ] Exportar ambos

**Cenário 3: São diferentes**
- [ ] Manter ambos
- [ ] Criar função de conversão
- [ ] Documentar diferenças

---

### PASSO 7: Atualizar useBackendInitialization.ts
**Objetivo:** Hook totalmente tipado

**Mudanças:**
```typescript
export function useBackendInitialization(
  params: UseBackendInitializationParams
): void {

  const {
    setConfig,
    setStatus,
    setError,
    orchestrator,
    patternMatcher,
    tursoAdapter,
    loadCommandHistory,
    user,
    isDebug
  } = params;

  // Implementação sem 'as any'
}
```

**Checklist:**
- [ ] Atualizar assinatura da função
- [ ] Adicionar destructuring tipado
- [ ] Remover `as any` internos
- [ ] Garantir `.current` em refs
- [ ] Adicionar JSDoc

---

### PASSO 8: Remover `as any` de mcp-ink-cli.tsx
**Objetivo:** Zero `as any` na chamada

**Transformação:**
```typescript
// ANTES
useBackendInitialization({
    setConfig: setConfig as any,
    setStatus: setStatus as any,
    setError,
    loadCommandHistory,
    orchestrator: orchestrator as any,
    patternMatcher: patternMatcher as any,
    tursoAdapter: tursoAdapter as any,
    user: currentUser,
    isDebug: debugMode
});

// DEPOIS
useBackendInitialization({
    setConfig,
    setStatus,
    setError,
    loadCommandHistory,
    orchestrator,
    patternMatcher,
    tursoAdapter,
    user: currentUser,
    isDebug: debugMode
});
```

**Checklist:**
- [ ] Remover todos os 5 `as any`
- [ ] Verificar ordem das propriedades
- [ ] Confirmar nomes das variáveis

---

## FASE 4: VALIDAÇÃO

### PASSO 9: Compilar e Corrigir Erros
**Objetivo:** Compilação limpa

**Comandos:**
```bash
# 1. Verificar arquivos modificados
npx tsc --noEmit src/hooks/useBackendInitialization.ts src/mcp-ink-cli.tsx

# 2. Verificar erros relacionados aos nossos tipos
npx tsc --noEmit | grep -E "(UseBackendInitialization|BackendConfig|AppConfig)"

# 3. Build completo
npm run build
```

**Validações:**
- [ ] Zero erros nos arquivos modificados
- [ ] Arquivos .d.ts gerados
- [ ] Sourcemaps criados
- [ ] Nenhum `as any` nos arquivos

**Se houver erros:**
1. Analisar mensagens do TypeScript
2. Identificar type mismatches reais
3. Corrigir ou adicionar conversões
4. Re-compilar

---

### PASSO 10: Testar e Documentar
**Objetivo:** Validação funcional e documentação

**Testes Funcionais:**
```bash
MCP_USER=fabio node src/mcp-ink-cli.tsx --debug
```

**Cenários:**
- [ ] App inicia sem erros
- [ ] Backend services inicializam
- [ ] Pergunta simples: "oi teste"
- [ ] Pergunta histórico: "o que eu digitei antes?"
- [ ] Logs sem type errors
- [ ] Ctrl+C funciona

**Documentação:**
- [ ] Criar checklist de validação
- [ ] Documentar mudanças em docs/types/
- [ ] Atualizar TYPE_SAFETY_ISSUES.md

---

## Métricas de Sucesso

```
ANTES                           DEPOIS
---------                       ---------
5 x 'as any'              →     0 x 'as any'
3 hooks tipados           →     4 hooks tipados
Type safety parcial       →     Type safety completo
```

**Critérios:**
- [ ] Zero `as any` no useBackendInitialization
- [ ] TypeScript compila sem erros
- [ ] App executa normalmente
- [ ] Interfaces documentadas
- [ ] Padrão consistente com outros hooks

---

## Dependências entre Passos

```
Passo 1: Análise inicial
    |
    +---> Passo 2: Investigar hook
    |         |
    |         +---> Passo 4: Decidir estratégia
    |         |
    +---> Passo 3: Investigar contexto
              |
              +---> Passo 4: Decidir estratégia
                        |
                        v
                   Passo 5: Criar interface
                        |
                        v
                   Passo 6: Unificar tipos
                        |
                        v
                   Passo 7: Atualizar hook
                        |
                        v
                   Passo 8: Remover as any
                        |
                        v
                   Passo 9: Compilar
                        |
                        v
                   Passo 10: Testar
```

---

## Status do Plano

**Data de Criação:** 2025-01-XX
**Status:** PLANEJADO
**Arquivos a Modificar:**
- src/hooks/useBackendInitialization.ts
- src/mcp-ink-cli.tsx
- src/types/services.ts (possivelmente)

**Progresso:**
- [ ] Passo 1: Analisar o Problema
- [ ] Passo 2: Investigar useBackendInitialization.ts
- [ ] Passo 3: Investigar AppContext.ts
- [ ] Passo 4: Decidir Estratégia de Tipagem
- [ ] Passo 5: Criar UseBackendInitializationParams Interface
- [ ] Passo 6: Unificar Tipos (se necessário)
- [ ] Passo 7: Atualizar useBackendInitialization.ts
- [ ] Passo 8: Remover `as any` de mcp-ink-cli.tsx
- [ ] Passo 9: Compilar e Corrigir Erros
- [ ] Passo 10: Testar e Documentar

---

## Notas

- Este plano segue o mesmo padrão usado com sucesso nos hooks useCommandProcessor, useHistoryManager e useRequestManager
- A investigação (Passos 2-3) é crucial para tomar decisões corretas no Passo 4
- Prioridade: remover `as any` sem quebrar funcionalidade existente
- Zen review recomendado após implementação dos passos 5-8
