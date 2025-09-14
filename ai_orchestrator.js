// ~/.mcp-terminal/ai_orchestrator.js
// Sistema de Orquestração Inteligente de Comandos

import chalk from 'chalk';

export default class AICommandOrchestrator {
    constructor(aiModel, commandExecutor, config = {}) {
        this.ai = aiModel;
        this.executor = commandExecutor;
        this.config = {
            maxIterations: config.maxIterations || 10,
            maxExecutionTime: config.maxExecutionTime || 60000,
            verboseLogging: config.verboseLogging || false,
            dangerousPatterns: [
                /rm\s+-rf\s+\/(?:\s|$)/,
                /dd\s+.*of=\/dev\/[sh]d/,
                /mkfs./,
                />\s*\/dev\/[sh]d/,
            ],
            maxQuestionLength: config.maxQuestionLength || 500,
        };
        this.startTime = null;
    }

    async orchestrateExecution(question, context) {
        this.startTime = Date.now();
        const executionContext = {
            originalQuestion: question,
            systemContext: context,
            executedCommands: [],
            results: [],
            currentPlan: [],
            iteration: 0,
            isComplete: false,
            directAnswer: null,
            metadata: { aiCalls: 0, blockedCommands: [] },
        };

        try {
            const initialPlan = await this.planInitialCommands(executionContext);
            executionContext.currentPlan = initialPlan.commands || [];
            executionContext.metadata.aiCalls++;

            while (executionContext.iteration < this.config.maxIterations && !executionContext.isComplete) {
                if (Date.now() - this.startTime > this.config.maxExecutionTime) {
                    console.log(chalk.yellow('\n⚠️ Tempo limite excedido'));
                    break;
                }

                if (executionContext.currentPlan.length > 0) {
                    await this.executeNextBatch(executionContext);
                    executionContext.iteration++;
                    continue;
                }

                const completionCheck = await this.isTaskComplete(executionContext);
                executionContext.metadata.aiCalls++;

                if (completionCheck.isComplete) {
                    executionContext.isComplete = true;
                    break;
                } else {
                    const nextStep = await this.planNextCommands(executionContext, completionCheck.reasoning);
                    executionContext.metadata.aiCalls++;

                    if (nextStep.commands && nextStep.commands.length > 0) {
                        executionContext.currentPlan.push(...nextStep.commands);
                    } else {
                        if (this.config.verboseLogging) {
                            console.log(chalk.yellow('⚠️ IA não conseguiu determinar o próximo passo. Encerrando.'));
                        }
                        break;
                    }
                }
            }

            const synthesis = await this.synthesizeDirectAnswer(executionContext);
            executionContext.directAnswer = synthesis.directAnswer;

            return this.formatResults(executionContext);

        } catch (error) {
            console.error(chalk.red('\n❌ Erro na orquestração: ' + error.message));
            return { success: false, error: error.message, executedCommands: executionContext.executedCommands, results: executionContext.results };
        }
    }

    async planInitialCommands(context) {
        const sanitizedQuestion = context.originalQuestion.replace(/[\r\n]+/g, ' ').substring(0, this.config.maxQuestionLength);
        const prompt = `Você é um planejador de comandos. Sua tarefa é analisar uma pergunta e criar um plano inicial de comandos para respondê-la.

<pergunta_original>
${sanitizedQuestion}
</pergunta_original>

CONTEXTO DO SISTEMA:
OS: ${context.systemContext.os || 'Linux'}
Distribuição: ${context.systemContext.distro || 'Unknown'}

REGRAS:
- Pense no primeiro comando mais lógico para iniciar a investigação.

Retorne APENAS um objeto JSON com a lista de comandos iniciais.
{
  "commands": ["comando1"]
}`;

        try {
            const response = await this.ai.askCommand(prompt, context.systemContext);
            if (!response) throw new Error('IA não retornou plano inicial');
            const jsonStr = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || response;
            return JSON.parse(jsonStr);
        } catch (error) {
            throw new Error(`Não foi possível criar plano inicial: ${error.message}`);
        }
    }

    async isTaskComplete(context) {
        const prompt = `Você é um juiz. Sua única função é determinar se uma pergunta foi completamente respondida com base nos dados fornecidos.

<pergunta_original>
${context.originalQuestion}
</pergunta_original>

DADOS COLETADOS ATÉ AGORA:
${context.results.map(r => `Comando: ${r.command}\nOutput: ${(r.output || r.error || 'vazio').substring(0, 1500)}...`).join('\n---\n') || 'Nenhum'}

A pergunta foi completa e diretamente respondida pelos dados acima?
- Se a pergunta foi "Quais IPs estão bloqueados?" e os dados mostram uma lista de IPs, a resposta
       é SIM.
- Se a pergunta foi "Quais IPs estão bloqueados?" e os dados mostram apenas uma lista de 'jails'
       do fail2ban, a resposta é NÃO.

Responda APENAS com um objeto JSON, nada mais.
{"isComplete": true} ou {"isComplete": false, "reasoning": "Breve motivo pelo qual não está completo. Ex: 'Falta a lista de IPs para cada jail.' "}`;

        try {
            const response = await this.ai.askCommand(prompt, context.systemContext);
            if (!response) throw new Error('IA não retornou resposta para isTaskComplete');
            const jsonStr = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || response;
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error(chalk.red('❌ Erro ao avaliar completude da tarefa:'), error.message);
            return { isComplete: false, reasoning: 'Erro na avaliação.' };
        }
    }

    async planNextCommands(context, reason) {
        const prompt = `O assistente está tentando responder a uma pergunta, mas a tarefa ainda não está completa.
${reason ? `Motivo: ${reason}` : ''}

<pergunta_original>
${context.originalQuestion}
</pergunta_original>

HISTÓRICO DE COMANDOS E RESULTADOS:
${context.results.map(r => `Comando: ${r.command}\nOutput: ${(r.output || r.error || 'vazio').substring(0, 1500)}...`).join('\n---\n') || 'Nenhum'}

Qual é o próximo comando ou sequência de comandos que devem ser executados para obter a informação que falta?
Pense passo a passo. Se o último comando listou itens (ex: jails, containers), o próximo passo é inspecionar cada um desses itens.

Responda APENAS com um objeto JSON contendo a lista de próximos comandos.
{"commands": ["comando1", "comando2"]}`;

        try {
            const response = await this.ai.askCommand(prompt, context.systemContext);
            if (!response) throw new Error('IA não retornou resposta para planNextCommands');
            const jsonStr = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || response;
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error(chalk.red('❌ Erro ao planejar próximos comandos:'), error.message);
            return { commands: [] };
        }
    }

    async synthesizeDirectAnswer(context) {
        if (!context.results.length) return { directAnswer: "Nenhum comando foi executado, não foi possível obter uma resposta." };
        const prompt = `Sua única tarefa é analisar os resultados de comandos e responder à pergunta original do usuário de forma direta.

<pergunta_original>
${context.originalQuestion}
</pergunta_original>

HISTÓRICO DE COMANDOS E RESULTADOS:
${context.results.map(r => `Comando: ${r.command}\nResultado:\n${(r.output || r.error || 'vazio').substring(0, 4000)}`).join('\n---\n')}

INSTRUÇÕES:
1. Use APENAS os dados reais do histórico para formular a resposta.
2. Responda à pergunta de forma concisa e direta.
3. Se os dados não forem suficientes, afirme que a resposta não pôde ser encontrada com os dados coletados.
4. NUNCA invente dados ou dê exemplos.

Responda APENAS com um objeto JSON.
{"directAnswer": "A resposta final e direta aqui."}`;

        try {
            const response = await this.ai.askCommand(prompt, context.systemContext);
            if (!response) throw new Error('IA não retornou resposta para síntese');
            const jsonStr = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || response;
            return JSON.parse(jsonStr);
        } catch (error) {
            return { directAnswer: 'Não foi possível sintetizar uma resposta final a partir dos dados coletados.' };
        }
    }

    async executeNextBatch(context) {
        const command = context.currentPlan.shift();
        if (!command) return false;

        if (this.isCommandDangerous(command)) {
            context.results.push({ command, error: "Comando bloqueado por segurança", skipped: true });
            return true;
        }
        try {
            const result = await this.executor.executeCommand(command);
            if (result) {
                context.executedCommands.push(command);
                context.results.push(result);
            }
            return true;
        } catch (error) {
            context.results.push({ command, error: error.message });
            return true;
        }
    }

    isCommandDangerous(command) {
        return this.config.dangerousPatterns.some(pattern => pattern.test(command));
    }

    formatResults(context) {
        const duration = Date.now() - this.startTime;
        return {
            success: !!context.directAnswer,
            question: context.originalQuestion,
            directAnswer: context.directAnswer,
            executedCommands: context.executedCommands,
            results: context.results,
            iterations: context.iteration,
            duration,
        };
    }

    cleanCache() {
        // Lógica de cache pode ser implementada aqui se necessário
    }
}
