# Plano de Refatoração: src/mcp-ink-cli.mjs

## Visão Geral

O arquivo `src/mcp-ink-cli.mjs` possui atualmente 1710 linhas e concentra múltiplas responsabilidades em um único módulo, dificultando manutenção e testes. Este plano detalha uma refatoração modular segura mantendo **exatamente o mesmo comportamento funcional**.

### Objetivo Principal
- Reduzir arquivo principal para <300 linhas
- Dividir em módulos com <500 linhas cada
- Zero alteração de funcionalidade
- Manter todos os sistemas de debug, cancelamento e integrações

## Análise Atual do Arquivo

### Responsabilidades Identificadas (1710 linhas)
```
src/mcp-ink-cli.mjs
├── [L94-275]   Configuração e inicialização (181 linhas)
├── [L277-396]  Gerenciamento de histórico (119 linhas)
├── [L560-1010] Processamento de comandos (450 linhas)
├── [L1012-1069] Formatação de respostas (57 linhas)
├── [L1071-1124] Comandos especiais (53 linhas)
├── [L1158-1400] Manipulação de input/eventos (242 linhas)
└── [L1402-1677] Renderização da UI (275 linhas)
```

### Estados Críticos (Não Podem Ser Alterados)
- `input, setInput` - Estado do input atual
- `history, setHistory` - Histórico de mensagens exibidas
- `commandHistory, setCommandHistory` - Histórico de comandos
- `fullHistory, setFullHistory` - Contexto completo para IA
- `status, setStatus` - Estado da aplicação
- `isProcessing, setIsProcessing` - Flag de processamento
- `currentRequestId.current` - Controle de requests
- `activeRequests.current` - Map de requests ativos
- `aiAbortControllerRef.current` - Cancelamento de IA
- `dbAbortControllerRef.current` - Cancelamento de DB

## Estrutura Modular Proposta

```
src/
├── mcp-ink-cli.mjs                    (250-300 linhas)
│
├── hooks/                              [Preparados para TypeScript]
│   ├── useBackendInitialization.ts   (~200 linhas)
│   ├── useHistoryManager.ts           (~150 linhas)
│   ├── useCommandProcessor.ts         (~400 linhas)
│   ├── useInputHandler.ts             (~300 linhas)
│   └── useRequestManager.ts           (~250 linhas)
│
├── utils/
│   ├── responseFormatter.ts           (~100 linhas)
│   ├── specialCommands.ts             (~80 linhas)
│   ├── debugLogger.js                 (~50 linhas)
│   └── pasteDetection.ts              (~70 linhas)
│
├── components/
│   └── MainUI.js                      (~350 linhas)
│
└── stores/                             [FUTURO - Pós-refatoração]
    └── useMCPStore.ts                 (Estado centralizado com Zustand)
```

⚠️ **ATENÇÃO**: Esta nova estrutura requer modificações no `setup.js` (ver FASE 1.5)

## Fases de Refatoração

### FASE 0: Testes E2E de Cancelamento (NOVA - CRÍTICA)
```
0.0 Criar Helpers de Teste (PASSO FUNDAMENTAL)
    // tests/helpers/index.js
    - Implementar renderInkApp() para simular aplicação
    - Criar snapshot-helpers.js com createSnapshot/matchSnapshot
    - Desenvolver test harness para aplicação Ink CLI

    COMPLEXIDADE: Alta - não subestimar o esforço
    TEMPO ESTIMADO: 2-3 dias para harness completo

0.1 Criar suite específica de testes de cancelamento
    - Teste ESC durante inicialização do backend
    - Teste ESC durante chamada da IA (antes da resposta)
    - Teste ESC durante resposta parcial da IA
    - Teste ESC após resposta completa mas antes do render
    - Teste ESC durante escrita no Turso
    - Validar sync entre UI, fullHistory e banco de dados

0.2 Criar suite de testes em JavaScript (MELHORADO)
    // tests/cancellation.test.js
    - Usar node:test ou Jest para assertivas complexas
    - Acessar diretamente estados internos
    - Verificar activeRequests.current via código
    - Validar fullHistory programaticamente
    - Assertivas sobre AbortControllers

    Exemplo:
    ```javascript
    import { test, assert } from 'node:test';
    import { renderInkApp } from './helpers';

    test('ESC cancela requisição durante chamada AI', async () => {
      const app = await renderInkApp();
      app.typeCommand('test command');
      await app.waitFor('isProcessing', true);

      app.pressEsc();

      assert.strictEqual(app.getState('isCancelled'), true);
      assert.strictEqual(app.getState('activeRequests').size, 0);
      assert.match(app.getState('fullHistory').at(-1), /cancelada/);
    });
    ```

    BENEFÍCIO: Mais fácil migrar para Playwright na Fase 9

0.3 Snapshot Testing para fullHistory (NOVO - CRÍTICO)
    // tests/fullHistory.snapshot.test.js
    - Capturar estado exato do fullHistory após sequências complexas
    - Salvar snapshots como prova imutável
    - Detectar QUALQUER desvio (espaço, propriedade, ordem)

    Exemplo:
    ```javascript
    import { test } from 'node:test';
    import { createSnapshot, matchSnapshot } from './snapshot-helpers';

    test('fullHistory mantém estrutura exata após cancelamento', async () => {
      const app = await renderInkApp();

      // Sequência complexa
      await app.type('comando 1');
      await app.waitForResponse();
      await app.type('comando 2');
      await app.pressEsc(); // Cancela
      await app.type('comando 3');
      await app.waitForResponse();

      const fullHistory = app.getState('fullHistory');

      // Primeira execução: cria snapshot
      // Próximas execuções: valida contra snapshot
      await matchSnapshot(fullHistory, 'complex-cancellation-sequence');
    });
    ```

    BENEFÍCIO: Prova matemática que contexto da IA não mudou

0.4 Preparação para Automação Futura
    - Estruturar testes de forma portável para Playwright
    - Documentar cenários em formato reutilizável
    - Criar helpers que possam ser migrados

0.5 Formalizar Scripts de Teste (NOVO)
    // package.json
    ```json
    "scripts": {
      "test": "node --test tests/*.test.js",
      "test:cancellation": "node --test tests/cancellation.test.js",
      "test:snapshots": "node --test tests/fullHistory.snapshot.test.js",
      "test:regression": "npm run test:cancellation && npm run test:snapshots",
      "test:watch": "node --test --watch tests/*.test.js",
      "test:coverage": "node --test --experimental-test-coverage tests/*.test.js"
    }
    ```
    BENEFÍCIO: Execução padronizada, menos erros, documentação oficial

0.6 Documentar comportamento esperado
    - Mapear todos os pontos de cancelamento
    - Documentar ordem exata de execução
    - Registrar dependências entre controllers
```

### FASE 1: Documentação de Contratos e Preparação
```
1.1 Documentar contratos dos hooks (NOVO)
    - Definir assinaturas exatas de entrada/saída
    - Mapear dependências entre hooks
    - Especificar tipos TypeScript/JSDoc
    - Usar JSDoc compatível com futura migração TS

1.2 Criar suite de testes de regressão completa
    - Teste de inicialização completa
    - Teste de processamento de comandos
    - Teste de cancelamento (ESC/Ctrl+C)
    - Teste de histórico e navegação
    - Teste de debug mode
    - Teste de integração Turso/AI/PatternMatcher

1.3 Documentar comportamento atual
    - Fluxos de estado críticos
    - Sequências de cancelamento
    - Interações entre componentes

1.4 Criar branch de segurança
    git checkout -b refactor-mcp-ink-cli

1.5 Preparar setup.js para Nova Estrutura (NOVO - CRÍTICO)
    PROBLEMA: setup.js usa lista hardcoded filesToCopy que não inclui hooks/, utils/

    1.5.1 Análise do makeExecutable():
        - Identificar lista filesToCopy (linha 1091-1110)
        - Verificar cópia de diretórios (src/libs, src/components)
        - Mapear lógica de ajuste de imports

    1.5.2 Estratégia de Simplificação:
        OPÇÃO A: Adicionar novos arquivos à lista (trabalhoso, frágil)
        OPÇÃO B: Mudar para cópia recursiva robusta (RECOMENDADO)

    1.5.3 Implementação (OPÇÃO B):
        ```javascript
        // ANTES: Lista explícita de arquivos
        const filesToCopy = [
          { src: 'src/mcp-ink-cli.mjs', dest: 'mcp-ink-cli.mjs' },
          // ... mais 10 arquivos hardcoded
        ];

        // DEPOIS: Cópia recursiva inteligente
        // Copiar toda src/ preservando estrutura
        await copyDirectory('src', path.join(this.mcpDir, 'src'), {
          filter: (src) => !src.includes('test'),
          adjustImports: true
        });
        ```

    1.5.4 Validação:
        - node setup.js --force
        - Verificar ~/.mcp-terminal/src/hooks/ existe
        - Verificar ~/.mcp-terminal/src/utils/ existe
        - Testar ipcom-chat e mcp-configure funcionando

    IMPORTÂNCIA: Sem isso, instalação quebra com nova estrutura
    QUANDO: Fazer ANTES de começar extração de módulos
```

### FASE 2: Extração de Utilitários Puros (Baixo Risco)
```
2.1 utils/responseFormatter.ts
    - preprocessMarkdown()
    - postprocessMarkdown()
    - formatResponse()

2.2 utils/specialCommands.ts
    - handleSpecialCommand() + todos os cases

2.3 utils/debugLogger.js
    - Centralizar lógica de debug logging

2.4 utils/pasteDetection.ts
    - Lógica de detecção de paste

VALIDAÇÃO: Testes passam 100%
```

## Contratos dos Hooks (NOVO - CRÍTICO)

### ConfigContext: Análise de Trade-off (NOVO)

#### Opção A: Implementar ConfigContext (Plano atual)
```javascript
// contexts/ConfigContext.js
interface ConfigContextValue {
  isDebug: boolean;
  user: string;
  config: object | null;
}

// PRÓS:
// - Alívio imediato do prop drilling
// - Preparação gradual para Zustand
// CONTRAS:
// - Código transitório que será descartado
// - Esforço extra de implementação
```

#### Opção B: Manter Prop Drilling até Zustand (Alternativa)
```javascript
// Continuar passando isDebug/user como props até Fase 8

// PRÓS:
// - Menos código transitório
// - Pulo direto para solução final
// CONTRAS:
// - Prop drilling por mais tempo
// - Assinaturas de hooks mais complexas
```

**DECISÃO:** Avaliar com a equipe. Se a refatoração levar <1 mês, considerar Opção B.
Se >1 mês ou se prop drilling causar bugs, usar Opção A.

### Assinaturas e Dependências

```javascript
// hooks/useBackendInitialization.ts
interface UseBackendInitializationProps {
  user: string;
  isDebug: boolean;
  setStatus: (status: string) => void;
  setError: (error: Error | null) => void;
  setConfig: (config: object) => void;
}

interface UseBackendInitializationReturn {
  status: string;
  config: object | null;
  error: Error | null;
  orchestrator: AICommandOrchestratorBash | null;
  patternMatcher: PatternMatcher | null;
  tursoAdapter: TursoAdapter | null;
}

// hooks/useRequestManager.ts (CRÍTICO - MANTER CONTROLLERS JUNTOS)
interface UseRequestManagerProps {
  isDebug: boolean;
  tursoAdapter: TursoAdapter | null;
  setFullHistory: (updater: (prev) => array) => void;
  setHistory: (updater: (prev) => array) => void;
  setInput: (value: string) => void;
  setIsProcessing: (value: boolean) => void;
  setResponse: (value: string) => void;
  setIsCancelled: (value: boolean) => void;
}

interface UseRequestManagerReturn {
  currentRequestId: React.MutableRefObject<string | null>;
  currentTursoEntryId: React.MutableRefObject<number | null>;
  activeRequests: React.MutableRefObject<Map>;
  aiAbortControllerRef: React.MutableRefObject<AbortController | null>;
  dbAbortControllerRef: React.MutableRefObject<AbortController | null>;
  isCancelled: boolean;
  cleanupRequest: (requestId: string, reason: string, clearInput?: boolean) => Promise<void>;
  createNewRequest: (command: string) => string;
  getActiveRequest: (requestId: string) => object | undefined;
}

// hooks/useHistoryManager.ts
interface UseHistoryManagerProps {
  user: string;
  isDebug: boolean;
  tursoAdapter: TursoAdapter | null;
}

interface UseHistoryManagerReturn {
  commandHistory: string[];
  fullHistory: array[];
  setCommandHistory: (history: string[]) => void;
  setFullHistory: (history: array[]) => void;
  loadCommandHistory: () => Promise<void>;
  saveToHistory: (command: string, response: string | null) => Promise<void>;
}

// hooks/useCommandProcessor.ts
interface UseCommandProcessorProps {
  orchestrator: AICommandOrchestratorBash | null;
  patternMatcher: PatternMatcher | null;
  tursoAdapter: TursoAdapter | null;
  fullHistory: array[];
  setFullHistory: (updater: (prev) => array) => void;
  setHistory: (updater: (prev) => array) => void;
  setCommandHistory: (updater: (prev) => array) => void;

  // OPÇÃO A: Passar objeto completo (mais simples, escolhido para fase inicial)
  requestManager: UseRequestManagerReturn;

  // OPÇÃO B: Passar apenas funções necessárias (menor acoplamento, considerar no futuro)
  // createNewRequest: (command: string) => string;
  // cleanupRequest: (id: string, reason: string) => Promise<void>;
  // currentRequestId: React.MutableRefObject<string | null>;
  // aiAbortControllerRef: React.MutableRefObject<AbortController | null>;

  user: string;
  isDebug: boolean;
}

// NOTA: A Opção A foi escolhida para simplificar a refatoração inicial.
// A Opção B pode ser considerada em uma otimização futura para reduzir acoplamento.

interface UseCommandProcessorReturn {
  processCommand: (command: string) => Promise<void>;
  isProcessing: boolean;
  response: string;
  setIsProcessing: (value: boolean) => void;
  setResponse: (value: string) => void;
}

// hooks/useInputHandler.ts (MELHORADO - Hook Puro)
interface UseInputHandlerProps {
  commandHistory: string[];
  isProcessing: boolean;
  isCancelled: boolean;
}

interface UseInputHandlerReturn {
  input: string;
  setInput: (value: string) => void;
  historyIndex: number;
  setHistoryIndex: (value: number) => void;
  lastCtrlC: number;
  lastEsc: number;

  // Callbacks puros (sem lógica de negócio)
  onCommandSubmit: (command: string) => void;
  onCancel: () => void;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
  onExit: () => void;
}

// NOTA: O componente principal conecta os callbacks:
// onCommandSubmit → processCommand
// onCancel → cleanupRequest
// onExit → exit()
// Benefício: useInputHandler totalmente desacoplado e testável
```

### FASE 3: Extração de useRequestManager (CRÍTICO - NOVA PRIORIDADE)
```
3.1 hooks/useRequestManager.ts (FAZER PRIMEIRO - MAIS CRÍTICO)
    EXTRAIR:
    - currentRequestId.current
    - currentTursoEntryId.current
    - activeRequests.current
    - aiAbortControllerRef.current (MANTER JUNTOS)
    - dbAbortControllerRef.current (MANTER JUNTOS)
    - cleanupRequest() (L406-558)
    - createNewRequest()
    - getActiveRequest()
    - Sistema de cancelamento completo

    IMPORTANTE:
    - NUNCA separar os AbortControllers
    - Manter toda lógica de cancelamento junta
    - Preservar ordem exata do fluxo de cancelamento
    - Incluir atualização do CANCELLATION_MARKER

    RETORNAR:
    {
      currentRequestId,
      currentTursoEntryId,
      activeRequests,
      aiAbortControllerRef,
      dbAbortControllerRef,
      cleanupRequest,
      createNewRequest,
      getActiveRequest,
      isCancelled,
      setIsCancelled
    }

VALIDAÇÃO CRÍTICA:
- Testar cancelamento em TODOS os estágios
- Verificar sync com fullHistory
- Confirmar limpeza de Map
```

### FASE 4: Extração de Hooks de Inicialização e História
```
4.1 hooks/useBackendInitialization.ts
    EXTRAIR:
    - Todo useEffect de inicialização (L94-275)
    - Estados: config, error, orchestrator.current, etc
    - Métodos: initBackend()
    - Manter ordem: Turso → PatternMatcher → Orchestrator

    RETORNAR:
    {
      status,
      config,
      orchestrator: orchestrator.current,
      patternMatcher: patternMatcher.current,
      tursoAdapter: tursoAdapter.current,
      error
    }

4.2 hooks/useHistoryManager.ts
    EXTRAIR:
    - loadCommandHistory() (L278-362)
    - saveToHistory() (L364-402)
    - Estados de histórico

    RETORNAR:
    {
      commandHistory,
      setCommandHistory,
      fullHistory,
      setFullHistory,
      loadCommandHistory,
      saveToHistory
    }

VALIDAÇÃO: Testes passam 100%
```

### FASE 5: Extração de Processamento de Comandos
```
5.1 hooks/useCommandProcessor.ts
    EXTRAIR:
    - processCommand() (L560-1010)
    - Toda lógica de processamento
    - Integração com AI/Pattern Matcher

    IMPORTANTE:
    - Depende fortemente do useRequestManager
    - Receber requestManager como prop
    - Manter refs de orchestrator/patternMatcher

    RETORNAR:
    {
      processCommand,
      isProcessing,
      setIsProcessing,
      response,
      setResponse
    }

VALIDAÇÃO: Testes passam 100% - CRÍTICO
```

### FASE 6: Extração de UI e Finalização
```
6.1 hooks/useInputHandler.ts
    EXTRAIR:
    - Todo useInput() (L1158-1400)
    - Manipulação de eventos
    - Histórico de navegação
    - Lógica de ESC/Ctrl+C

    IMPORTANTE:
    - Depende do requestManager.cleanupRequest
    - Precisa acesso ao currentRequestId

    RETORNAR:
    {
      input,
      setInput,
      historyIndex,
      setHistoryIndex,
      lastCtrlC,
      lastEsc
    }

6.2 components/MainUI.js
    EXTRAIR:
    - Toda renderização (L1402-1677)
    - Componente React completo

6.3 Arquivo principal simplificado
    - Apenas orquestração de hooks
    - ~250-300 linhas total
    - Composição clara de dependências

VALIDAÇÃO FINAL: Suite completa de testes
```

## Estratégias de Segurança

### 1. Preservação de Estado
```javascript
// NUNCA alterar essas assinaturas:
const [input, setInput] = useState('');
const [history, setHistory] = useState([]);
const currentRequestId = useRef(null);

// SEMPRE manter essas referências:
orchestrator.current
patternMatcher.current
tursoAdapter.current
```

### 2. Sistema de Cancelamento (CRÍTICO)
```javascript
// Este fluxo JAMAIS pode ser alterado:
ESC pressed → setIsCancelled(true) →
cleanupRequest() → aiAbortController.abort() →
Map status = 'cancelled' → Turso update →
fullHistory marker → UI reset
```

### 3. Preservação dos AbortControllers (NOVO - CRÍTICO)
```javascript
// REGRA ABSOLUTA: Manter TODOS os controllers no mesmo hook
// hooks/useRequestManager.ts
const aiAbortControllerRef = useRef(null);
const dbAbortControllerRef = useRef(null);

// NUNCA fazer isto (separar controllers):
// ❌ useAIController.js - aiAbortController
// ❌ useDBController.js - dbAbortController

// SEMPRE manter juntos no useRequestManager:
// ✅ Todos os AbortControllers no mesmo lugar
// ✅ Lógica de cancelamento centralizada
// ✅ cleanupRequest com acesso a todos controllers
```

### 4. Debug Mode (Preservar)
```javascript
// Todos os console.log com isDebug devem permanecer
// Arquivo /tmp/mcp-debug.log deve continuar funcionando
// appendFileSync deve continuar nos mesmos pontos
```

## Procedimentos de Teste

### Testes de Regressão Obrigatórios
```bash
# FASE 0 - Antes de QUALQUER refatoração:
0. Executar suites de testes JavaScript
   npm run test:regression  # Roda cancellation + snapshots
   - Validar TODOS os cenários de cancelamento
   - Verificar snapshots do fullHistory
   - Confirmar sync entre componentes
   - Verificar limpeza de memória

# Antes de cada extração:
1. npm test                      # Se existir suite
2. Teste manual completo:
   - Inicialização sem erros
   - Comando simples + resposta
   - Cancelamento com ESC (CRÍTICO)
   - Navegação histórico (setas)
   - Comando especial (/help)
   - Mode debug (--debug)
   - Ctrl+C duplo para sair

# Validação de funcionalidades específicas:
3. Teste Turso (se configurado)
4. Teste Pattern Matcher
5. Teste AI Orchestrator
6. Teste paste detection
7. Teste multi-line input

# Após CADA fase:
8. Re-executar npm run test:regression
9. Verificar que contratos dos hooks são respeitados
10. Confirmar que refs mantêm sincronização
```

### Critérios de Sucesso (ATUALIZADOS)
- [ ] Suite de testes JavaScript passa 100%
- [ ] Todos os testes de regressão passam
- [ ] Zero mensagens de erro no console
- [ ] Comportamento idêntico ao original
- [ ] Sistema de cancelamento funcionando perfeitamente
- [ ] AbortControllers mantidos no mesmo hook
- [ ] Ordem de inicialização preservada
- [ ] fullHistory sincronizado com history
- [ ] Debug logs mantidos
- [ ] Performance similar ou melhor
- [ ] Arquivo principal <300 linhas
- [ ] Cada módulo <500 linhas
- [ ] Contratos dos hooks documentados e respeitados

## Estratégia de Rollback

### Se Algo Quebrar
```bash
1. git stash                    # Salvar trabalho atual
2. git checkout HEAD~1          # Voltar para última versão funcional
3. Analisar logs de erro
4. Identificar causa raiz
5. Planejar correção específica
6. git stash pop               # Recuperar trabalho se necessário
```

### Pontos de Checkpoint

#### Estratégia de Commits Atômicos (NOVO)
Cada sub-passo validado deve ter seu próprio commit:

```bash
# Exemplo para Fase 2 (Utilitários):
1. Extrair responseFormatter.ts
2. npm test tests/cancellation.test.js  # Validar
3. git add utils/responseFormatter.ts src/mcp-ink-cli.mjs
4. git commit -m "refactor: Extract responseFormatter utility"

5. Extrair specialCommands.ts
6. npm test tests/cancellation.test.js  # Validar
7. git add utils/specialCommands.ts src/mcp-ink-cli.mjs
8. git commit -m "refactor: Extract specialCommands utility"

# Repetir para cada extração
```

**Benefícios:**
- Rollback trivial com `git revert <commit>`
- Histórico Git documenta cada passo
- Isolamento de mudanças problemáticas
- Revisão mais fácil do processo

#### Checkpoints Originais
- Após cada utilitário extraído
- Após cada hook extraído
- Antes da extração de UI
- Antes do commit final

## Ordem de Implementação (REVISADA)

### Sequência Obrigatória (Para Minimizar Risco)
```
0. FASE 0: Testes E2E de Cancelamento (NOVO - FAZER PRIMEIRO)
1. FASE 1: Documentação de Contratos
2. FASE 2: Utilitários puros (sem estado)
3. FASE 3: Hook de request manager (CRÍTICO - PRIORIDADE MÁXIMA)
4. FASE 4: Hook de inicialização + Hook de histórico
5. FASE 5: Hook de command processor (depende do request manager)
6. FASE 6: Hook de input handler + Componente UI
7. Arquivo principal final

JUSTIFICATIVA DA NOVA ORDEM:
- RequestManager primeiro: É o mais crítico e complexo
- Inicialização e histórico juntos: São mais independentes
- Command processor depois: Depende fortemente do RequestManager
- UI por último: Menor risco, apenas apresentação
```

### Estratégia de Gestão de Branch e Conflitos (NOVO)

#### Opção A: Feature Freeze (Recomendado para equipes pequenas)
```bash
# Comunicar à equipe
"Feature Freeze em mcp-ink-cli.mjs por ~2 semanas durante refatoração"

# Branch dedicada
git checkout -b refactor-mcp-ink-cli
```

#### Opção B: Rebase Contínuo (Para desenvolvimento paralelo ativo)
```bash
# Diariamente durante a refatoração:
git checkout main
git pull origin main
git checkout refactor-mcp-ink-cli
git rebase main

# Resolver conflitos imediatamente enquanto são pequenos
# Re-executar testes após cada rebase
npm run test:regression
```

**IMPORTANTE:** Escolher estratégia ANTES de começar baseado na atividade da equipe

### Estratégia de Stacked PRs

Para facilitar revisão e minimizar risco, dividir em PRs sequenciais:

```
PR #1: "Setup de Testes e Contratos" (Baixo Risco)
├── FASE 0: Suite de testes de cancelamento
├── FASE 1: Documentação de contratos
└── Pode ser merged imediatamente (não altera código)

PR #2: "Extração de Utilitários" (Baixo Risco)
├── FASE 2: Todos os utilitários puros
├── ~300 linhas de mudança
└── Fácil de revisar (funções sem estado)

PR #3: "Request Manager" (CRÍTICO - Alta Atenção)
├── FASE 3: useRequestManager completo
├── ~400 linhas de mudança
└── Revisão focada no sistema de cancelamento

PR #4: "Hooks de Estado" (Médio Risco)
├── FASE 4: Inicialização + Histórico
├── ~350 linhas de mudança
└── Revisão focada em ordem de inicialização

PR #5: "Command Processor" (Médio Risco)
├── FASE 5: useCommandProcessor
├── ~400 linhas de mudança
└── Revisão focada em integração com RequestManager

PR #6: "UI e Finalização" (Baixo Risco)
├── FASE 6: Input handler + UI
├── FASE 7: Arquivo principal simplificado
└── Revisão focada em comportamento visual
```

**Benefícios:**
- Cada PR tem <500 linhas (revisão efetiva)
- Isolamento de discussões por funcionalidade
- Rollback granular se necessário
- Absorção gradual pela equipe

### Validação Entre Fases
Cada fase DEVE passar todos os testes antes da próxima.
**NUNCA** prosseguir se houver falhas.

## Benefícios Esperados

### Manutenibilidade
- Responsabilidades claras por módulo
- Testes isolados por funcionalidade
- Debugging mais fácil

### Qualidade
- Código mais legível
- Menos bugs por complexidade reduzida
- Facilidade para adicionar features

### Performance
- Imports otimizados
- Bundle splitting possível
- Lazy loading de componentes

### Preparação para Evolução Futura
- Arquitetura modular facilita adoção de Zustand
- Contratos definidos facilitam migração TypeScript
- Testes isolados permitem automação E2E incremental
- Estrutura preparada para CI/CD moderno

## Riscos e Mitigações

### Alto Risco
- **Sistema de cancelamento**: Testar exaustivamente cada extração
- **Estados compartilhados**: Manter refs exatas
- **Integrações externas**: Validar Turso/AI/Pattern após mudanças

### Risco Médio
- **Debug system**: Validar logs em cada fase
- **UI rendering**: Testar todas as condições visuais
- **Input handling**: Validar paste/keyboard events

### Baixo Risco
- **Utilitários puros**: Sem efeitos colaterais
- **Formatação**: Apenas transformação de texto

## Roadmap Pós-Refatoração (NOVO)

### PARTE 2: Evolução Arquitetural
Após a conclusão bem-sucedida da refatoração modular, os seguintes passos evolutivos são recomendados:

### FASE 7: Preparação para TypeScript (Mês 1)
```
7.1 Configuração Inicial
    - Criar tsconfig.json com allowJs: true
    - Configurar build pipeline para .ts/.tsx
    - Adicionar @types para dependências

7.2 Migração Gradual dos Hooks
    - Converter hooks/useRequestManager.ts → .ts (PRIMEIRO)
    - Migrar outros hooks incrementalmente
    - Manter retrocompatibilidade durante transição

7.3 Benefícios Esperados
    - Contratos enforced em compile-time
    - Eliminação de bugs de tipos
    - Melhor experiência de desenvolvimento
```

### FASE 8: Estado Centralizado com Zustand (Mês 2)
```
8.1 Análise de Estado Atual
    Estados candidatos para store central:
    - Request management (currentRequestId, activeRequests)
    - History states (commandHistory, fullHistory)
    - Processing states (isProcessing, isCancelled)
    - Backend refs (orchestrator, patternMatcher, tursoAdapter)

8.2 Implementação do Store
    // stores/useMCPStore.ts
    interface MCPStore {
      // Request Management
      currentRequestId: string | null
      activeRequests: Map<string, RequestData>
      cleanupRequest: (id: string, reason: string) => Promise<void>

      // History Management
      commandHistory: string[]
      fullHistory: HistoryEntry[]
      saveToHistory: (cmd: string, res: string) => Promise<void>

      // Processing State
      isProcessing: boolean
      isCancelled: boolean
      setProcessing: (val: boolean) => void
    }

8.3 Migração Incremental
    - Fase 1: Mover request management
    - Fase 2: Mover history management
    - Fase 3: Mover processing states
    - Eliminar 70% do prop drilling

8.4 Eliminar Acoplamento do useCommandProcessor (CRÍTICO)
    // ANTES (Fase 3-5): requestManager como objeto completo
    const processor = useCommandProcessor({ requestManager });

    // DEPOIS (Fase 8): Ações do store, acoplamento mínimo
    const processor = useCommandProcessor({
      createRequest: useMCPStore(s => s.createRequest),
      cancelRequest: useMCPStore(s => s.cancelRequest),
      // Apenas o necessário, não o objeto todo
    });

8.5 Benefícios
    - Fluxo de dados unidirecional claro
    - Debug simplificado com DevTools
    - Testes mais fáceis de escrever
    - Acoplamento drasticamente reduzido
```

### FASE 9: Automação E2E Completa (Mês 3)
```
9.1 Setup de Playwright para Terminal Apps
    - Configurar Playwright com suporte a TTY
    - Criar helpers para interação com Ink
    - Setup de CI/CD com GitHub Actions

9.2 Migração dos Testes Manuais
    // tests/e2e/cancellation.spec.ts
    test('ESC durante chamada AI cancela corretamente', async () => {
      const terminal = await launchTerminal();
      await terminal.type('test command');
      await terminal.pressKey('Enter');
      await terminal.waitForText('Processing');
      await terminal.pressKey('Escape');

      expect(await terminal.getOutput()).toContain(CANCELLATION_MARKER);
      expect(await terminal.getState('activeRequests')).toHaveLength(0);
    });

9.3 Cobertura de Testes
    - Fluxo de cancelamento: 100%
    - Navegação de histórico: 100%
    - Comandos especiais: 100%
    - Integração Turso: 100%
    - Multi-line input: 100%

9.4 Integração Contínua
    - Testes rodando em cada PR
    - Deploy automático após merge
    - Relatórios de cobertura
```

## Preparação Durante a Refatoração

### Decisões Arquiteturais para Facilitar Evolução

1. **Interfaces de Hooks Preparadas para Zustand**
```javascript
// Em vez de retornar múltiplos estados:
return { state1, setState1, state2, setState2 }

// Preparar para store único:
return {
  states: { state1, state2 },
  actions: { setState1, setState2 }
}
```

2. **Documentação JSDoc Compatível com TypeScript**
```javascript
/**
 * @typedef {Object} UseRequestManagerReturn
 * @property {React.MutableRefObject<string|null>} currentRequestId
 * @property {(id: string, reason: string) => Promise<void>} cleanupRequest
 */
```

3. **Estrutura de Testes Portável**
```javascript
// Escrever testes de forma que possam ser portados para Playwright
describe('Cancellation Flow', () => {
  const scenarios = [
    { stage: 'during-init', expectedBehavior: '...' },
    { stage: 'during-ai-call', expectedBehavior: '...' }
  ];
});
```

## Métricas de Sucesso da Evolução

### Após TypeScript (Fase 7)
- [ ] 0 erros de tipo em runtime
- [ ] 100% dos hooks com tipos strict
- [ ] Autocomplete funcionando em toda codebase

### Após Zustand (Fase 8)
- [ ] Redução de 70% em prop drilling
- [ ] Estado centralizado e previsível
- [ ] DevTools mostrando fluxo de estado

### Após Automação E2E (Fase 9)
- [ ] 100% dos testes manuais automatizados
- [ ] CI/CD com testes em cada PR
- [ ] Tempo de validação < 5 minutos

## Timeline Estimado

```
Mês 0 (Atual): Refatoração Modular
├── Semanas 1-2: Fases 0-3 (Testes + RequestManager)
├── Semanas 3-4: Fases 4-6 (Hooks restantes + UI)
└── Validação: Comportamento 100% idêntico

Mês 1: TypeScript Migration
├── Semana 1: Setup e configuração
├── Semanas 2-3: Migração incremental
└── Semana 4: Validação e ajustes

Mês 2: Zustand Integration
├── Semana 1: Criar store central
├── Semanas 2-3: Migração de estados
└── Semana 4: Otimização e testes

Mês 3: E2E Automation
├── Semana 1: Setup Playwright
├── Semanas 2-3: Escrever testes E2E
└── Semana 4: CI/CD integration
```

**NOTA IMPORTANTE:** Estas são estimativas baseadas em desenvolvimento full-time. A prioridade absoluta é a **qualidade e segurança** da entrega em cada fase. É preferível estender o cronograma do que comprometer a estabilidade do sistema. Cada fase deve ser considerada completa apenas quando:
- Todos os testes passam
- Zero regressões identificadas
- Código revisado e documentado
- Equipe confiante na mudança

Se necessário, adicione 20-30% de buffer ao timeline para garantir entrega de qualidade.

## Fase Final: Revisão de Documentação Externa (NOVO)

### FASE 7.5: Atualização de Documentação do Projeto
```
7.5.1 Revisar e atualizar arquivos de documentação
    - README.md: Verificar instruções de debug
    - docs/commands.md: Atualizar se estrutura mudou
    - CONTRIBUTING.md: Adicionar guia sobre nova arquitetura
    - CLAUDE.md: Atualizar estrutura de arquivos

7.5.2 Verificar instruções que possam ter sido invalidadas
    - Comandos de debug (--debug flag)
    - Variáveis de ambiente (MCP_USER)
    - Paths de arquivos mencionados
    - Scripts de desenvolvimento

7.5.3 Adicionar documentação sobre nova arquitetura
    - docs/architecture.md: Explicar estrutura modular
    - Diagrama de dependências entre hooks
    - Guia para adicionar novos hooks

TEMPO ESTIMADO: 1 dia
IMPORTÂNCIA: Alta - documentação desatualizada causa confusão
```

## Conclusão

Esta refatoração seguirá uma abordagem **gradual e segura**, priorizando a **preservação total** da funcionalidade existente. Cada extração será validada independentemente antes de prosseguir.

O resultado final será um codebase mais maintível, testável e extensível, mas com comportamento **idêntico** ao atual.

Após a refatoração inicial, o roadmap de evolução arquitetural (TypeScript → Zustand → E2E) transformará o projeto em uma aplicação moderna, type-safe e com testes automatizados completos.

---
**IMPORTANTE**: Este plano deve ser seguido rigorosamente. Qualquer desvio ou alteração de comportamento deve ser considerado uma falha que requer correção imediata.
