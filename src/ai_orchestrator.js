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

    async orchestrateExecution(question, context, animator = null) {
        this.startTime = Date.now();

        // Extract signal from context if provided
        const signal = context.signal || null;

        // Check if already aborted
        if (signal?.aborted) {
            console.log(chalk.yellow('⚠️ [Orchestrator] Request already aborted'));
            throw new Error('Request aborted');
        }

        // CRITICAL: Check for questions about previous messages FIRST
        if (question.toLowerCase().includes('anterior') ||
            question.toLowerCase().includes('disse') ||
            question.toLowerCase().includes('escrevi') ||
            question.toLowerCase().includes('pergunt')) {

            // Check if we have history to reference
            if (context.history && context.history.length > 0) {
                console.log('🔍 [Orchestrator] Detected history question with', context.history.length, 'messages');

                // Find previous user messages
                const previousUserMessages = [];
                for (let i = context.history.length - 1; i >= 0; i--) {
                    const msg = context.history[i];
                    if (msg.role === 'user' && msg.content !== question) {
                        previousUserMessages.push(msg.content);
                        if (previousUserMessages.length >= 3) break;
                    }
                }

                if (previousUserMessages.length > 0) {
                    // Return direct answer without executing commands
                    const answer = previousUserMessages.length === 1
                        ? `Você escreveu anteriormente: "${previousUserMessages[0]}"`
                        : `Suas mensagens anteriores foram:\n${previousUserMessages.map((m, i) => `${i+1}. "${m}"`).join('\n')}`;

                    return {
                        success: true,
                        directAnswer: answer,
                        executedCommands: [],
                        results: [],
                        iterations: 0
                    };
                }
            }
        }

        // Debug logging
        if (context.verbose) {
            console.log('🔍 [Orchestrator] Received context with history?', !!context.history);
            if (context.history) {
                console.log('🔍 [Orchestrator] History length:', context.history.length);
                console.log('🔍 [Orchestrator] History content:', context.history);
            }
        }

        const executionContext = {
            originalQuestion: question,
            systemContext: context,  // This now contains history directly
            options: context, // Pass the entire context as options (includes signal if provided)
            signal: signal,  // Store signal for use in helper methods
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
            if (animator) {
                animator.updateStatus('Analisando pergunta e planejando comandos');
            }

            // Check before AI call
            if (signal?.aborted) {
                console.log(chalk.yellow('\n⚠️ [Orchestrator] Request aborted before initial planning'));
                throw new Error('Request aborted');
            }

            const initialPlan = await this.planInitialCommands(executionContext);
            executionContext.currentPlan = initialPlan.commands || [];
            executionContext.metadata.aiCalls++;

            while (executionContext.iteration < this.config.maxIterations && !executionContext.isComplete) {
                // Check if request was aborted
                if (signal?.aborted) {
                    console.log(chalk.yellow('\n⚠️ [Orchestrator] Request aborted by user'));
                    throw new Error('Request aborted');
                }

                if (Date.now() - this.startTime > this.config.maxExecutionTime) {
                    console.log(chalk.yellow('\n⚠️ Tempo limite excedido'));
                    break;
                }

                if (executionContext.currentPlan.length > 0) {
                    await this.executeNextBatch(executionContext, animator);
                    executionContext.iteration++;
                    continue;
                }

                if (animator) {
                    animator.updateStatus('Verificando se a tarefa está completa');
                }

                // Check before AI call
                if (signal?.aborted) {
                    console.log(chalk.yellow('\n⚠️ [Orchestrator] Request aborted before completion check'));
                    throw new Error('Request aborted');
                }

                const completionCheck = await this.isTaskComplete(executionContext);
                executionContext.metadata.aiCalls++;

                if (completionCheck.isComplete) {
                    executionContext.isComplete = true;
                    break;
                } else {
                    if (this.config.verboseLogging) {
                        console.log(chalk.blue(`\n🔄 Tarefa incompleta: ${completionCheck.reasoning}`));
                        console.log(chalk.gray(`📝 Working Memory Lists: ${JSON.stringify(executionContext.workingMemory.discovered.lists)}`));
                    }

                    if (animator) {
                        animator.updateStatus('Planejando próximos comandos');
                    }

                    // Check before AI call
                    if (signal?.aborted) {
                        console.log(chalk.yellow('\n⚠️ [Orchestrator] Request aborted before planning next commands'));
                        throw new Error('Request aborted');
                    }

                    const nextStep = await this.planNextCommands(executionContext, completionCheck.reasoning);
                    executionContext.metadata.aiCalls++;

                    if (nextStep.commands && nextStep.commands.length > 0) {
                        if (this.config.verboseLogging) {
                            console.log(chalk.green(`✅ Próximos comandos: ${nextStep.commands.join(', ')}`));
                        }
                        executionContext.currentPlan.push(...nextStep.commands);
                        if (animator) {
                            animator.showProgress(executionContext.iteration, this.config.maxIterations, 'Executando comandos');
                        }
                    } else {
                        if (this.config.verboseLogging) {
                            console.log(chalk.yellow('⚠️ IA não conseguiu determinar o próximo passo. Encerrando.'));
                        }
                        break;
                    }
                }
            }

            if (animator) {
                animator.updateStatus('Preparando resposta final');
            }

            // Check before final AI call
            if (signal?.aborted) {
                console.log(chalk.yellow('\n⚠️ [Orchestrator] Request aborted before final synthesis'));
                throw new Error('Request aborted');
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

        // CRITICAL FIX: Include conversation history in the prompt
        let historyContext = '';
        if (context.systemContext.history && context.systemContext.history.length > 0) {
            historyContext = '\n\nCONTEXTO DA CONVERSA ANTERIOR:\n';
            context.systemContext.history.forEach(msg => {
                if (msg.role === 'user') {
                    historyContext += `Usuário disse: "${msg.content}"\n`;
                } else if (msg.role === 'assistant' && !msg.content.includes('[Message processing was interrupted]')) {
                    const preview = msg.content.substring(0, 100);
                    historyContext += `Assistente respondeu: "${preview}..."\n`;
                }
            });
            historyContext += '\nLEVE EM CONTA O CONTEXTO ACIMA AO RESPONDER!\n';
        }

        const prompt = `Você é um planejador de comandos. Sua tarefa é analisar uma pergunta e criar um plano inicial de comandos para respondê-la.
${historyContext}
<pergunta_original>
${sanitizedQuestion}
</pergunta_original>

CONTEXTO DO SISTEMA:
OS: ${context.systemContext.os || 'Linux'}
Distribuição: ${context.systemContext.distro || 'Unknown'}

REGRAS:
- IMPORTANTE: Se a pergunta se refere a algo mencionado anteriormente, considere o contexto
- Pense no primeiro comando mais lógico para iniciar a investigação.

Retorne APENAS um objeto JSON com a lista de comandos iniciais.
{
  "commands": ["comando1"]
}`;

        try {
            // Now systemContext IS the context, which contains history directly
            const response = await this.ai.askCommand(prompt, context.systemContext, context.systemContext);
            if (!response) throw new Error('IA não retornou plano inicial');
            const jsonStr = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || response;
            return JSON.parse(jsonStr);
        } catch (error) {
            throw new Error(`Não foi possível criar plano inicial: ${error.message}`);
        }
    }

    async isTaskComplete(context) {
        // Quick check if we have jail data for all discovered jails
        const hasAllJailData = context.workingMemory.discovered.lists.length > 0 &&
            context.workingMemory.dataExtracted.jails &&
            Object.keys(context.workingMemory.dataExtracted.jails).length === context.workingMemory.discovered.lists.length;

        const prompt = `Memória de Trabalho:
${JSON.stringify(context.workingMemory, null, 2)}

Pergunta Original: ${context.originalQuestion}

A pergunta foi COMPLETAMENTE respondida com os dados na memória?
IMPORTANTE: Responda APENAS com JSON puro, sem texto adicional.
Formato: {"isComplete": true} ou {"isComplete": false, "reasoning": "o que falta"}`;

        try {
            // Now systemContext IS the context, which contains history directly
            const response = await this.ai.askCommand(prompt, context.systemContext, context.systemContext);
            if (!response) throw new Error('IA não retornou resposta para isTaskComplete');

            // Try to extract JSON from the response
            let jsonStr = response;

            // Remove code blocks if present
            const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                jsonStr = codeBlockMatch[1];
            }

            // Try to find JSON object in the text
            const jsonMatch = jsonStr.match(/\{[^}]*"isComplete"[^}]*\}/);
            if (jsonMatch) {
                jsonStr = jsonMatch[0];
            }

            // Clean up common issues
            jsonStr = jsonStr.trim();
            if (jsonStr.startsWith('bash') || jsonStr.startsWith('sudo')) {
                // AI returned a command instead of JSON, force incomplete
                return { isComplete: false, reasoning: 'Ainda há comandos a executar' };
            }

            return JSON.parse(jsonStr);
        } catch (error) {
            console.error(chalk.red('❌ Erro ao avaliar completude da tarefa:'), error.message);

            // If we have all jail data, consider it complete
            if (hasAllJailData) {
                return { isComplete: true };
            }

            return { isComplete: false, reasoning: 'Erro na avaliação, continuando...' };
        }
    }

    async planNextCommands(context, reason) {
        // Check if we have lists to iterate
        let iterationHint = '';
        if (context.workingMemory.discovered.lists && context.workingMemory.discovered.lists.length > 0) {
            const lists = context.workingMemory.discovered.lists;
            iterationHint = `\n⚠️ ATENÇÃO: Você descobriu a lista: [${lists.join(', ')}]
VOCÊ DEVE EXECUTAR UM COMANDO PARA CADA ITEM DESTA LISTA.`;

            // For fail2ban specifically
            if (context.originalQuestion.toLowerCase().includes('fail2ban') ||
                context.originalQuestion.toLowerCase().includes('bloqueado')) {
                // Check which jails we already have data for
                const jailsWithData = context.workingMemory.dataExtracted.jails ?
                    Object.keys(context.workingMemory.dataExtracted.jails) : [];
                const jailsNeedingData = lists.filter(jail => !jailsWithData.includes(jail));

                if (jailsNeedingData.length > 0) {
                    iterationHint += `\nPara fail2ban, execute comandos para as jails FALTANTES: ${jailsNeedingData.map(jail => `sudo fail2ban-client status ${jail}`).join(', ')}`;
                }
            }
        }

        const prompt = `Memória de Trabalho:
${JSON.stringify(context.workingMemory, null, 2)}

Tarefa incompleta porque: ${reason}
${iterationHint}

INSTRUÇÕES DIRETAS E OBRIGATÓRIAS:
1. Se discovered.lists contém items, VOCÊ DEVE criar comandos para CADA item
2. NÃO sugira ao usuário executar comandos - VOCÊ deve retorná-los
3. Para fail2ban: se encontrou jails, execute "fail2ban-client status [jail]" para CADA jail

Responda APENAS com JSON:
{
  "commands": ["comando1", "comando2"],
  "updateMemory": {
    "hypothesis": "vou verificar cada item da lista"
  }
}`;

        try {
            // Now systemContext IS the context, which contains history directly
            const response = await this.ai.askCommand(prompt, context.systemContext, context.systemContext);
            if (!response) throw new Error('IA não retornou resposta para planNextCommands');

            // Try to extract JSON from the response
            let jsonStr = response;

            // Remove code blocks if present
            const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                jsonStr = codeBlockMatch[1];
            }

            // Try to find JSON object with commands
            const jsonMatch = jsonStr.match(/\{[^}]*"commands"[^}]*\}/s);
            if (jsonMatch) {
                jsonStr = jsonMatch[0];
            }

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
        // Special handling for conversational queries about previous messages
        if (context.originalQuestion.toLowerCase().includes('anterior') ||
            context.originalQuestion.toLowerCase().includes('disse') ||
            context.originalQuestion.toLowerCase().includes('escrevi')) {

            // Check if we have conversation history
            if (context.systemContext.history && context.systemContext.history.length > 0) {
                // Find the most recent user messages before the current question
                const previousMessages = [];
                for (let i = context.systemContext.history.length - 1; i >= 0; i--) {
                    const msg = context.systemContext.history[i];
                    if (msg.role === 'user' && msg.content !== context.originalQuestion) {
                        previousMessages.push(msg.content);
                        if (previousMessages.length >= 2) break; // Get last 2 messages
                    }
                }

                if (previousMessages.length > 0) {
                    const answer = previousMessages.length === 1
                        ? `Você disse anteriormente: "${previousMessages[0]}"`
                        : `Suas mensagens anteriores foram:\n1. "${previousMessages[1]}"\n2. "${previousMessages[0]}"`;
                    return { directAnswer: answer };
                }
            }
        }

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
            // Now systemContext IS the context, which contains history directly
            const response = await this.ai.askCommand(prompt, context.systemContext, context.systemContext);
            if (!response) throw new Error('IA não retornou resposta para síntese');
            const jsonStr = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || response;
            return JSON.parse(jsonStr);
        } catch (error) {
            return { directAnswer: 'Não foi possível sintetizar uma resposta final a partir dos dados coletados.' };
        }
    }

    async executeNextBatch(context, animator = null) {
        // Check if request was aborted before executing command
        if (context.signal?.aborted) {
            console.log(chalk.yellow('\n⚠️ [Orchestrator] Request aborted before command execution'));
            throw new Error('Request aborted');
        }

        const command = context.currentPlan.shift();
        if (!command) return false;

        if (this.isCommandDangerous(command)) {
            context.results.push({ command, error: "Comando bloqueado por segurança", skipped: true });
            return true;
        }
        try {
            if (animator) {
                animator.addCommand(command);
            }
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
