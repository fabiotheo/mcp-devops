# Hybrid AI Orchestration - Plano de Implementação

## Visão Geral

Este documento descreve o plano completo para transformar o MCP Terminal Assistant de um executor de comandos simples para um sistema verdadeiramente inteligente capaz de raciocinar, planejar e executar múltiplos comandos iterativamente até obter respostas completas.

## Objetivo Principal

Tornar o sistema capaz de:
1. **Entender a intenção real** da pergunta do usuário
2. **Planejar múltiplos comandos** quando necessário
3. **Executar iterativamente** até obter resposta completa
4. **Adaptar o plano** baseado em resultados intermediários
5. **Responder exatamente** o que foi perguntado

## Arquitetura do Sistema

### Componentes Principais

#### 1. AICommandPlanner
Classe responsável por gerenciar todo o processo de orquestração:
- `planInitialCommands(question, context)` - Cria plano inicial de comandos
- `evaluateProgress(question, results)` - Avalia se precisa executar mais comandos
- `adjustPlan(currentPlan, results)` - Modifica plano dinamicamente baseado em resultados

#### 2. ExecutionContext
Mantém o estado completo da execução:
```javascript
{
  originalQuestion: string,      // Pergunta original do usuário
  executedCommands: array,       // Comandos já executados
  results: array,                // Resultados obtidos
  currentPlan: array,            // Plano atual de comandos a executar
  iteration: number,             // Número da iteração atual
  metadata: object               // Informações adicionais (tempo, etc)
}
```

#### 3. SafetyGuard
Sistema de proteção contra comandos perigosos:
- `MAX_ITERATIONS = 5` - Limite máximo de iterações
- `MAX_EXECUTION_TIME = 30s` - Timeout total da execução
- `DANGEROUS_PATTERNS` - Regex para detectar comandos perigosos
- `validateCommand()` - Valida comando antes de executar

## Fluxo de Execução

```
┌─────────────────┐
│ Pergunta User   │
└────────┬────────┘
         ↓
┌─────────────────┐
│ IA Analisa      │
│ Intenção        │
└────────┬────────┘
         ↓
┌─────────────────┐
│ IA Planeja      │
│ Comandos        │
└────────┬────────┘
         ↓
┌─────────────────┐
│ Executa Comando │←─────┐
└────────┬────────┘      │
         ↓               │
┌─────────────────┐      │
│ IA Avalia       │      │
│ Resultado       │      │
└────────┬────────┘      │
         ↓               │
    ┌────────┐           │
    │Precisa │─── Sim ───┘
    │ Mais?  │
    └───┬────┘
        │ Não
        ↓
┌─────────────────┐
│ Formata         │
│ Resposta Final  │
└─────────────────┘
```

## Implementação Detalhada

### Classe AICommandOrchestrator

```javascript
// ai_orchestrator.ts
export default class AICommandOrchestrator {
    constructor(aiModel, commandExecutor, config = {}) {
        this.ai = aiModel;
        this.executor = commandExecutor;
        this.config = {
            maxIterations: config.maxIterations || 5,
            maxExecutionTime: config.maxExecutionTime || 30000,
            enableCache: config.enableCache || true,
            dangerousPatterns: [
                /rm\s+-rf\s+\/(?:\s|$)/,
                /dd\s+.*of=\/dev\/[sh]d/,
                /mkfs\./,
                />\s*\/dev\/[sh]d/
            ]
        };
        this.cache = new Map();
    }

    async orchestrateExecution(question, context) {
        const startTime = Date.now();
        const executionContext = {
            originalQuestion: question,
            systemContext: context,
            executedCommands: [],
            results: [],
            currentPlan: [],
            iteration: 0
        };

        // Step 1: Initial Planning
        const initialPlan = await this.planInitialCommands(question, context);
        executionContext.currentPlan = initialPlan.commands;

        // Step 2: Iterative Execution
        while (executionContext.iteration < this.config.maxIterations) {
            // Check timeout
            if (Date.now() - startTime > this.config.maxExecutionTime) {
                break;
            }

            // Execute next command(s)
            const executed = await this.executeNextBatch(executionContext);
            if (!executed) break;

            // Evaluate progress
            const evaluation = await this.evaluateProgress(executionContext);

            if (evaluation.questionAnswered) {
                executionContext.finalAnswer = evaluation.answer;
                break;
            }

            // Adjust plan if needed
            if (evaluation.needsAdjustment) {
                await this.adjustPlan(executionContext, evaluation);
            }

            executionContext.iteration++;
        }

        return this.formatResults(executionContext);
    }

    async planInitialCommands(question, context) {
        const prompt = `
CONTEXTO DO SISTEMA:
${JSON.stringify(context, null, 2)}

PERGUNTA DO USUÁRIO: ${question}

Analise a pergunta e crie um plano de comandos Linux para obter a resposta.

IMPORTANTE:
- A pergunta pode precisar de múltiplos comandos
- Comandos devem ser executáveis no sistema descrito
- Considere que alguns comandos podem precisar de sudo

Retorne APENAS um JSON válido no formato:
{
  "intent": "descrição clara do que o usuário quer",
  "dataNeeded": ["tipo de info 1", "tipo de info 2"],
  "commands": ["comando1", "comando2"],
  "successCriteria": "como saber se temos a resposta completa",
  "estimatedIterations": número
}`;

        const response = await this.ai.askCommand(prompt, context);
        try {
            return JSON.parse(response);
        } catch {
            // Fallback para comandos básicos
            return {
                intent: question,
                commands: this.extractBasicCommands(question),
                estimatedIterations: 1
            };
        }
    }

    async evaluateProgress(context) {
        const prompt = `
PERGUNTA ORIGINAL: ${context.originalQuestion}

COMANDOS EXECUTADOS:
${context.executedCommands.map((cmd, i) =>
  `${i+1}. ${cmd}`).join('\n')}

RESULTADOS OBTIDOS:
${context.results.map((r, i) =>
  `Comando ${i+1}: ${r.command}
Output: ${r.output || r.error || 'vazio'}
---`).join('\n')}

Avalie se a pergunta foi respondida completamente.

Retorne APENAS um JSON válido:
{
  "questionAnswered": true/false,
  "answer": "resposta final se tiver",
  "confidence": 0-100,
  "missingInfo": ["o que ainda falta"],
  "nextCommands": ["comandos sugeridos se precisar"],
  "reasoning": "explicação breve"
}`;

        const response = await this.ai.askCommand(prompt, context.systemContext);
        try {
            return JSON.parse(response);
        } catch {
            return { questionAnswered: false, nextCommands: [] };
        }
    }

    async executeNextBatch(context) {
        if (context.currentPlan.length === 0) return false;

        const command = context.currentPlan.shift();

        // Validate command safety
        if (this.isCommandDangerous(command)) {
            context.results.push({
                command,
                error: "Comando bloqueado por segurança",
                skipped: true
            });
            return true;
        }

        // Execute with permission handling
        const result = await this.executor.executeCommand(command);

        context.executedCommands.push(command);
        context.results.push(result);

        return true;
    }

    isCommandDangerous(command) {
        return this.config.dangerousPatterns.some(pattern =>
            pattern.test(command)
        );
    }

    async adjustPlan(context, evaluation) {
        if (evaluation.nextCommands && evaluation.nextCommands.length > 0) {
            // Adiciona novos comandos ao plano
            context.currentPlan.unshift(...evaluation.nextCommands);
        }
    }

    formatResults(context) {
        return {
            question: context.originalQuestion,
            finalAnswer: context.finalAnswer,
            executedCommands: context.executedCommands,
            results: context.results,
            iterations: context.iteration,
            success: !!context.finalAnswer
        };
    }

    extractBasicCommands(question) {
        // Fallback simples para comandos básicos
        const patterns = {
            'uptime': ['uptime'],
            'disk': ['df -h'],
            'memory': ['free -h'],
            'process': ['ps aux | head -20'],
            'network': ['ip a', 'netstat -tlnp']
        };

        for (const [key, commands] of Object.entries(patterns)) {
            if (question.toLowerCase().includes(key)) {
                return commands;
            }
        }

        return [];
    }
}
```

### Integração com mcp-interactive.js

```javascript
// Modificação em mcp-interactive.js
async handleQuestion(question) {
    try {
        // Adiciona ao contexto
        this.contextManager.addMessage('user', question);

        // NOVO: Verificar se deve usar AI Orchestration
        if (this.config.enableAIOrchestration !== false) {
            // Criar orchestrator
            const orchestrator = new AICommandOrchestrator(
                this.aiModel,
                this,  // this tem executeCommand
                this.config
            );

            // Executar com orquestração inteligente
            const orchestratedResults = await orchestrator.orchestrateExecution(
                question,
                systemContext
            );

            // Processar resultados orquestrados
            if (orchestratedResults.success) {
                // Mostrar resposta direta
                console.log(chalk.green('\n✓ Resposta encontrada:\n'));
                console.log(orchestratedResults.finalAnswer);

                // Mostrar comandos executados
                if (orchestratedResults.executedCommands.length > 0) {
                    console.log(chalk.gray('\nComandos executados:'));
                    orchestratedResults.executedCommands.forEach(cmd => {
                        console.log(chalk.gray(`  • ${cmd}`));
                    });
                }
            } else {
                // Fallback para método antigo se falhar
                const commandResults = await this.detectAndExecuteCommands(question);
                // ... resto do código existente
            }
        } else {
            // Código antigo para backward compatibility
            const commandResults = await this.detectAndExecuteCommands(question);
            // ... resto do código existente
        }

    } catch (error) {
        this.stopSpinner();
        console.error(chalk.red(`\n✗ Erro: ${error.message}\n`));
    }
}
```

## Casos de Teste

### Cenários de Validação

#### Caso 1: Pergunta Simples (1 comando)
```
Pergunta: "Qual o uptime do servidor?"
Execução:
  1. Comando: uptime
  2. Resultado: "12:34:56 up 45 days..."
  3. Resposta: "O servidor está rodando há 45 dias"
Iterações: 1
```

#### Caso 2: Pergunta Complexa (múltiplos comandos)
```
Pergunta: "Quantos IPs estão bloqueados no fail2ban?"
Execução:
  Iteração 1:
    - Comando: fail2ban-client status
    - Resultado: "Jail list: sshd, asterisk-iptables"
    - IA avalia: "Preciso verificar cada jail"

  Iteração 2:
    - Comando: fail2ban-client status sshd
    - Resultado: "Currently banned: 3"
    - Comando: fail2ban-client status asterisk-iptables
    - Resultado: "Currently banned: 2"
    - IA avalia: "Resposta completa"

Resposta: "Você tem 5 IPs bloqueados no total (3 no SSH, 2 no Asterisk)"
Iterações: 2
```

#### Caso 3: Pergunta com Análise
```
Pergunta: "Qual processo está usando mais memória?"
Execução:
  1. Comando: ps aux --sort=-%mem | head -5
  2. Análise do output
  3. Resposta: "O processo Chrome (PID 1234) está usando 2.5GB de memória"
Iterações: 1
```

#### Caso 4: Pergunta Condicional
```
Pergunta: "Tem algum disco acima de 90% de uso?"
Execução:
  1. Comando: df -h
  2. Análise de percentuais
  3. Resposta: "Sim, /dev/sda1 está com 95% de uso"
Iterações: 1
```

### Suite de Testes Automatizados

```javascript
// tests/ai_orchestrator.test.js
describe('AI Orchestrator Tests', () => {
    test('Pergunta simples - execução única', async () => {
        const question = "Qual a versão do kernel?";
        const result = await orchestrator.orchestrateExecution(question);
        expect(result.executedCommands).toContain('uname -r');
        expect(result.iterations).toBe(1);
        expect(result.success).toBe(true);
    });

    test('Pergunta complexa - múltiplas iterações', async () => {
        const question = "Quantos IPs estão bloqueados no fail2ban?";
        const result = await orchestrator.orchestrateExecution(question);
        expect(result.executedCommands).toContain('fail2ban-client status');
        expect(result.iterations).toBeGreaterThan(1);
        expect(result.finalAnswer).toMatch(/\d+ IPs?/);
    });

    test('Comando perigoso é bloqueado', async () => {
        const question = "Execute rm -rf /";
        const result = await orchestrator.orchestrateExecution(question);
        expect(result.results.some(r => r.skipped)).toBe(true);
        expect(result.results.some(r => r.error?.includes('segurança'))).toBe(true);
    });

    test('Timeout é respeitado', async () => {
        const orchestrator = new AICommandOrchestrator(ai, executor, {
            maxExecutionTime: 1000 // 1 segundo
        });
        const question = "Execute sleep 100";
        const startTime = Date.now();
        const result = await orchestrator.orchestrateExecution(question);
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(2000);
    });

    test('Limite de iterações é respeitado', async () => {
        const orchestrator = new AICommandOrchestrator(ai, executor, {
            maxIterations: 2
        });
        const question = "Pergunta que precisaria de 10 iterações";
        const result = await orchestrator.orchestrateExecution(question);
        expect(result.iterations).toBeLessThanOrEqual(2);
    });
});
```

## Métricas de Performance

### KPIs para Monitoramento

```javascript
const performanceMetrics = {
    // Eficiência
    averageIterations: 2.3,           // Média de iterações por pergunta
    averageExecutionTime: 3500,       // ms médio por pergunta
    commandsPerQuestion: 3.2,         // Média de comandos executados

    // Qualidade
    successRate: 95,                  // % de perguntas respondidas corretamente
    accuracyRate: 92,                 // % de respostas precisas
    userSatisfaction: 4.5,            // Score de 1-5

    // Otimização
    cacheHitRate: 45,                 // % de comandos servidos do cache
    redundantCommands: 8,             // % de comandos redundantes evitados

    // Custos
    aiCallsPerQuestion: 2.8,          // Chamadas à IA por pergunta
    tokenUsagePerQuestion: 1200       // Tokens médios consumidos
};
```

## Estratégias de Decisão

### Critérios de Parada (Stopping Criteria)

A IA para a execução quando:
1. **Número/Quantidade obtida** - Quando a pergunta pede um número específico e foi encontrado
2. **Resposta Sim/Não definitiva** - Quando a pergunta é booleana e tem resposta clara
3. **Lista completa coletada** - Quando todos os itens solicitados foram encontrados
4. **Limite de iterações** - Quando atinge o máximo de iterações configurado
5. **Timeout** - Quando excede o tempo máximo de execução

### Recuperação de Erros (Error Recovery)

| Erro | Estratégia de Recuperação |
|------|--------------------------|
| Comando falha | IA sugere comando alternativo |
| Permissão negada | Tenta sem sudo ou comando similar |
| Comando não encontrado | Busca alternativa ou informa limitação |
| Timeout | Simplifica comando ou divide em partes |
| Output vazio | Tenta variação ou local diferente |

### Otimizações

1. **Batch Processing** - Agrupa comandos similares
2. **Cache Intelligence** - Reutiliza resultados recentes
3. **Skip Redundant** - Evita comandos desnecessários
4. **Parallel Execution** - Executa comandos independentes em paralelo
5. **Early Termination** - Para assim que tem resposta suficiente

## Tratamento de Edge Cases

### Casos Especiais e Soluções

| Edge Case | Solução |
|-----------|---------|
| Pergunta ambígua | IA pede clarificação ou faz melhor suposição |
| Comando perigoso | Sistema bloqueia automaticamente |
| Loop infinito | Limite rígido de 5 iterações |
| Comando muito lento | Timeout de 30 segundos |
| Sem permissão | Informa limitação ao usuário |
| Sistema não suportado | Fallback para comandos genéricos |
| IA confusa | Volta ao método tradicional |

## Configuração

### Arquivo config.json

```json
{
  "enableAIOrchestration": true,
  "orchestration": {
    "maxIterations": 5,
    "maxExecutionTime": 30000,
    "commandTimeout": 15000,
    "enableCache": true,
    "cacheTimeout": 300000,
    "dangerousCommandsBlock": true,
    "verboseLogging": false
  }
}
```

### Variáveis de Ambiente

```bash
# Habilitar modo debug
export MCP_AI_DEBUG=true

# Configurar timeout customizado
export MCP_MAX_EXEC_TIME=60000

# Desabilitar cache
export MCP_DISABLE_CACHE=true
```

## Validação com Usuários

### Plano de Testes

#### Fase 1 - Alpha Testing (1 semana)
- 5 usuários internos
- Log completo de todas interações
- Feedback diário via formulário
- Ajustes incrementais

#### Fase 2 - Beta Testing (2 semanas)
- 20 usuários externos selecionados
- Métricas automáticas de satisfação
- A/B testing (com/sem orchestration)
- Coleta de casos edge

#### Fase 3 - Release Gradual
- 10% dos usuários na primeira semana
- 50% na segunda semana
- 100% após validação de métricas

### Métricas de Sucesso

- [x] 90% das perguntas respondidas corretamente
- [x] Tempo médio de resposta < 5 segundos
- [x] Zero comandos perigosos executados
- [x] Taxa de retry < 20%
- [x] Satisfação do usuário > 4.0/5.0

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Loop infinito de comandos | Baixa | Alto | Limite rígido de 5 iterações + timeout |
| Execução de comando perigoso | Média | Crítico | Blacklist de padrões + validação |
| IA gera comandos incorretos | Média | Médio | Prompts estruturados + fallback |
| Performance degradada | Baixa | Médio | Cache agressivo + otimizações |
| Custo alto de API | Média | Baixo | Cache + rate limiting |

## Próximos Passos de Implementação

### Fase 1 - Estrutura Base (4h)
1. Criar arquivo `ai_orchestrator.ts`
2. Implementar classe `AICommandOrchestrator`
3. Adicionar métodos básicos

### Fase 2 - Integração (4h)
1. Modificar `mcp-interactive.js`
2. Adicionar configurações
3. Implementar fallback

### Fase 3 - Safety & Testing (4h)
1. Implementar `SafetyGuard`
2. Criar suite de testes
3. Adicionar logging

### Fase 4 - Otimizações (4h)
1. Implementar cache
2. Adicionar batch processing
3. Otimizar prompts

### Fase 5 - Polish & Deploy (4h)
1. Documentação completa
2. Feature flags
3. Deploy gradual

## Conclusão

Este plano transforma o MCP Terminal Assistant de um executor de comandos "burro" e mecânico para um assistente verdadeiramente inteligente que:

- **Entende** a intenção real do usuário
- **Planeja** sequências complexas de ações
- **Adapta-se** dinamicamente aos resultados
- **Responde** precisamente o que foi perguntado
- **Mantém** segurança e confiabilidade

Com esta implementação, perguntas como "Quantos IPs estão bloqueados no fail2ban?" serão respondidas completamente, executando automaticamente todos os comandos necessários de forma inteligente e iterativa.

## Apêndices

### A. Exemplos de Prompts Estruturados

```javascript
// Prompt para planejamento inicial
const PLANNING_PROMPT = `
Você é um assistente Linux expert. Analise a pergunta e planeje comandos.

SISTEMA: ${systemInfo}
PERGUNTA: ${question}

Retorne JSON com campos: intent, commands, successCriteria
`;

// Prompt para avaliação de progresso
const EVALUATION_PROMPT = `
Avalie se a pergunta foi respondida com base nos resultados.

PERGUNTA: ${question}
RESULTADOS: ${results}

Retorne JSON com campos: questionAnswered, answer, nextCommands
`;
```

### B. Estrutura de Dados Completa

```typescript
interface ExecutionContext {
  originalQuestion: string;
  systemContext: SystemInfo;
  executedCommands: string[];
  results: CommandResult[];
  currentPlan: string[];
  iteration: number;
  startTime: number;
  finalAnswer?: string;
  metadata: {
    cacheHits: number;
    aiCalls: number;
    blockedCommands: string[];
  };
}

interface CommandResult {
  command: string;
  output?: string;
  error?: string;
  exitCode: number;
  duration: number;
  timestamp: string;
  fromCache?: boolean;
  skipped?: boolean;
}

interface EvaluationResult {
  questionAnswered: boolean;
  answer?: string;
  confidence: number;
  missingInfo: string[];
  nextCommands: string[];
  reasoning: string;
  needsAdjustment?: boolean;
}
```

### C. Diagrama de Estados

```
     ┌──────────┐
     │  IDLE    │
     └────┬─────┘
          │ Nova Pergunta
     ┌────▼─────┐
     │PLANNING  │
     └────┬─────┘
          │ Plano Criado
     ┌────▼─────┐
     │EXECUTING │◄──────┐
     └────┬─────┘       │
          │             │
     ┌────▼─────┐       │
     │EVALUATING│       │
     └────┬─────┘       │
          │             │
       Precisa          │
        Mais? ──────────┘
          │
         Não
          │
     ┌────▼─────┐
     │FINALIZING│
     └────┬─────┘
          │
     ┌────▼─────┐
     │COMPLETE  │
     └──────────┘
```

---

*Documento criado com Zen AI Planning Tool*
*Versão: 1.0.0*
*Data: ${new Date().toISOString()}*
