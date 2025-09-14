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
            workingMemory: {
                discovered: {
                    lists: [],        // Ex: ["sshd", "apache"] - discovered entities that need iteration
                    entities: {},     // Ex: {total_jails: 2, blocked_ips: 5}
                    needsIteration: [] // Ex: ["check each jail for IPs"]
                },
                hypothesis: "",       // Current reasoning about what needs to be done
                dataExtracted: {}     // Structured data extracted from command outputs
            }
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
        const prompt = `Memória de Trabalho:
${JSON.stringify(context.workingMemory, null, 2)}

Pergunta Original: ${context.originalQuestion}

A pergunta foi COMPLETAMENTE respondida com os dados na memória?
Responda APENAS: {"isComplete": true} ou {"isComplete": false, "reasoning": "o que falta"}`;

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
        const prompt = `Memória de Trabalho:
${JSON.stringify(context.workingMemory, null, 2)}

Tarefa incompleta porque: ${reason}

REGRAS OBRIGATÓRIAS:
1. Se discovered.lists tem items, DEVE iterar sobre CADA um
2. Se encontrou uma lista em output anterior, DEVE executar comando para cada item
3. Comandos devem extrair dados específicos, não genéricos

Responda APENAS:
{
  "commands": ["comando1", "comando2"],
  "updateMemory": {
    "hypothesis": "novo raciocínio sobre o que fazer",
    "discovered": {
      "lists": [...],
      "entities": {...},
      "needsIteration": [...]
    }
  }
}`;

        try {
            const response = await this.ai.askCommand(prompt, context.systemContext);
            if (!response) throw new Error('IA não retornou resposta para planNextCommands');
            const jsonStr = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || response;
            const result = JSON.parse(jsonStr);

            // Update working memory if provided
            if (result.updateMemory) {
                if (result.updateMemory.hypothesis) {
                    context.workingMemory.hypothesis = result.updateMemory.hypothesis;
                }
                if (result.updateMemory.discovered) {
                    Object.assign(context.workingMemory.discovered, result.updateMemory.discovered);
                }
            }

            return result;
        } catch (error) {
            console.error(chalk.red('❌ Erro ao planejar próximos comandos:'), error.message);
            return { commands: [] };
        }
    }

    async synthesizeDirectAnswer(context) {
        if (!context.results.length) return { directAnswer: "Nenhum comando foi executado, não foi possível obter uma resposta." };

        // Use working memory data for synthesis
        const prompt = `Memória de Trabalho Final:
${JSON.stringify(context.workingMemory, null, 2)}

Pergunta Original: ${context.originalQuestion}

Use APENAS os dados em workingMemory.dataExtracted para responder.
Se há dados sobre jails/IPs, liste-os com números exatos.
Seja direto e específico.

Responda APENAS: {"directAnswer": "resposta direta com dados reais"}`;

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

                // Extract data and update working memory
                this.extractDataFromOutput(context, command, result.output || '');
            }
            return true;
        } catch (error) {
            context.results.push({ command, error: error.message });
            return true;
        }
    }

    extractDataFromOutput(context, command, output) {
        // Extract lists (common patterns)
        if (command.includes('fail2ban-client status') && !command.includes('fail2ban-client status ')) {
            // Main status command - extract jail list
            const jailMatch = output.match(/Jail list:\s*([^\n]+)/i);
            if (jailMatch) {
                const jails = jailMatch[1].trim().split(/[,\s]+/).filter(j => j);
                context.workingMemory.discovered.lists = jails;
                context.workingMemory.discovered.entities.total_jails = jails.length;
                context.workingMemory.discovered.needsIteration = ['check each jail for blocked IPs'];
            }
        } else if (command.includes('fail2ban-client status ')) {
            // Jail-specific status - extract IPs
            const jailName = command.match(/status\s+(\S+)$/)?.[1];
            if (jailName) {
                const ips = output.match(/\d+\.\d+\.\d+\.\d+/g) || [];
                const totalMatch = output.match(/Total banned:\s*(\d+)/i);

                if (!context.workingMemory.dataExtracted.jails) {
                    context.workingMemory.dataExtracted.jails = {};
                }
                context.workingMemory.dataExtracted.jails[jailName] = {
                    ips: ips,
                    count: totalMatch ? parseInt(totalMatch[1]) : ips.length
                };
            }
        } else if (command.includes('docker ps')) {
            // Docker containers
            const lines = output.split('\n').slice(1);
            const containers = lines.filter(l => l.trim()).map(line => {
                const parts = line.split(/\s{2,}/);
                return parts[6] || parts[0]; // container name or ID
            }).filter(c => c);
            if (containers.length > 0) {
                context.workingMemory.discovered.lists = containers;
                context.workingMemory.discovered.entities.total_containers = containers.length;
            }
        } else if (command.includes('systemctl') && command.includes('--failed')) {
            // Failed services
            const services = [];
            const lines = output.split('\n');
            for (const line of lines) {
                if (line.includes('.service') && line.includes('failed')) {
                    const match = line.match(/●?\s*(\S+\.service)/);
                    if (match) services.push(match[1]);
                }
            }
            if (services.length > 0) {
                context.workingMemory.discovered.lists = services;
                context.workingMemory.discovered.entities.failed_services = services.length;
            }
        }

        // Store raw output for reference
        if (!context.workingMemory.dataExtracted.raw) {
            context.workingMemory.dataExtracted.raw = {};
        }
        context.workingMemory.dataExtracted.raw[command] = output.substring(0, 500);
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
