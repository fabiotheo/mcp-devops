// ai_orchestrator_bash.js
// Sistema de Orquestração com ferramenta Bash nativa

import chalk from 'chalk';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Classe para gerenciar sessão bash persistente
class BashSession extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            timeout: config.timeout || 30000,
            maxOutputSize: config.maxOutputSize || 100000,
            workingDir: config.workingDir || process.cwd(),
            env: { ...process.env, ...config.env }
        };
        this.process = null;
        this.outputBuffer = '';
        this.errorBuffer = '';
        this.commandQueue = [];
        this.currentCommand = null;
        this.sessionId = Date.now();
    }

    async start() {
        if (this.process) {
            await this.stop();
        }

        this.process = spawn('/bin/bash', [], {
            cwd: this.config.workingDir,
            env: this.config.env,
            shell: false
        });

        this.process.stdout.on('data', (data) => {
            this.outputBuffer += data.toString();
            this.emit('output', data.toString());
        });

        this.process.stderr.on('data', (data) => {
            this.errorBuffer += data.toString();
            this.emit('error', data.toString());
        });

        this.process.on('close', (code) => {
            this.emit('close', code);
            this.process = null;
        });

        // Aguardar inicialização
        await new Promise(resolve => setTimeout(resolve, 100));

        // Configurar PS1 para marcador único
        await this.executeInternal(`export PS1='\\n###PROMPT###\\n'`);

        return true;
    }

    async executeInternal(command) {
        return new Promise((resolve, reject) => {
            if (!this.process) {
                reject(new Error('Sessão bash não iniciada'));
                return;
            }

            const marker = `###END_${Date.now()}###`;
            const fullCommand = `${command}; echo "${marker}"; echo "${marker}" >&2`;

            this.outputBuffer = '';
            this.errorBuffer = '';

            // Timeout
            const timeout = setTimeout(() => {
                reject(new Error(`Comando expirou após ${this.config.timeout/1000} segundos`));
            }, this.config.timeout);

            // Listeners para capturar saída
            const checkComplete = () => {
                if (this.outputBuffer.includes(marker) && this.errorBuffer.includes(marker)) {
                    clearTimeout(timeout);

                    // Remover marcadores
                    const output = this.outputBuffer.split(marker)[0];
                    const error = this.errorBuffer.split(marker)[0];

                    // Limpar buffers
                    this.outputBuffer = '';
                    this.errorBuffer = '';

                    resolve({
                        stdout: output.trim(),
                        stderr: error.trim(),
                        combined: (output + error).trim()
                    });
                }
            };

            this.on('output', checkComplete);
            this.on('error', checkComplete);

            // Enviar comando
            this.process.stdin.write(fullCommand + '\n');
        });
    }

    async execute(command) {
        // Validação de segurança
        const validation = this.validateCommand(command);
        if (!validation.valid) {
            throw new Error(`Comando bloqueado: ${validation.reason}`);
        }

        // Executar comando
        const result = await this.executeInternal(command);

        // Truncar saída se necessário
        if (result.combined.length > this.config.maxOutputSize) {
            const truncated = result.combined.substring(0, this.config.maxOutputSize);
            result.combined = truncated + '\n\n... [Saída truncada]';
            result.truncated = true;
        }

        return result;
    }

    validateCommand(command) {
        // Padrões perigosos
        const dangerousPatterns = [
            /rm\s+-rf\s+\/(?:\s|$)/,  // rm -rf /
            /:(){:|:&};:/,             // Fork bomb
            /mkfs/,                    // Formatar disco
            /dd.*of=\/dev\/[sh]d/,     // Escrever direto no disco
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(command)) {
                return { valid: false, reason: `Padrão perigoso detectado: ${pattern}` };
            }
        }

        return { valid: true };
    }

    async restart() {
        await this.stop();
        await this.start();
        return true;
    }

    async stop() {
        if (this.process) {
            this.process.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 100));
            if (this.process) {
                this.process.kill('SIGKILL');
            }
            this.process = null;
        }
    }

    sanitizeOutput(output) {
        // Remover possíveis credenciais
        output = output.replace(/(?:password|token|key|secret)[\s=:]+\S+/gi, '[REDACTED]');
        output = output.replace(/Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g, 'Bearer [REDACTED]');
        return output;
    }
}

export default class AICommandOrchestratorBash {
    constructor(aiModel, config = {}) {
        this.ai = aiModel;
        this.config = {
            maxIterations: config.maxIterations || 10,
            maxExecutionTime: config.maxExecutionTime || 60000,
            verboseLogging: config.verboseLogging || false,
            enableBash: config.enableBash !== false,
            bashConfig: config.bashConfig || {}
        };
        this.bashSession = null;
        this.startTime = null;
    }

    // Define ferramenta bash seguindo formato da documentação
    getBashTool() {
        return {
            type: "bash_20250124",
            name: "bash",
            description: `Executa comandos shell em uma sessão bash persistente. A sessão mantém estado entre comandos,
incluindo variáveis de ambiente, diretório de trabalho e arquivos criados. Use para:
- Executar comandos Linux/Unix
- Criar e manipular arquivos
- Executar scripts
- Instalar pacotes
- Processar dados
- Automação de tarefas
A ferramenta retorna stdout e stderr combinados. Para reiniciar a sessão, use restart: true.`,
            input_schema: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "O comando bash a ser executado. Pode incluir pipes, redirecionamentos e múltiplos comandos com && ou ;"
                    },
                    restart: {
                        type: "boolean",
                        description: "Se true, reinicia a sessão bash (limpa variáveis e volta ao diretório inicial)"
                    }
                },
                required: []
            }
        };
    }

    // Outras ferramentas específicas ainda disponíveis
    getAdditionalTools() {
        return [
            {
                name: "list_fail2ban_jails",
                description: "Atalho otimizado para listar jails do fail2ban. Mais rápido que usar bash para este caso específico.",
                input_schema: {
                    type: "object",
                    properties: {},
                    required: []
                }
            },
            {
                name: "get_jail_status",
                description: "Atalho otimizado para status de jail do fail2ban. Retorna dados estruturados.",
                input_schema: {
                    type: "object",
                    properties: {
                        jail_name: {
                            type: "string",
                            description: "Nome da jail"
                        }
                    },
                    required: ["jail_name"]
                }
            }
        ];
    }

    async orchestrateExecution(question, context, options = {}) {
        this.startTime = Date.now();

        // Iniciar sessão bash se habilitada
        if (this.config.enableBash) {
            this.bashSession = new BashSession(this.config.bashConfig);
            await this.bashSession.start();
        }

        const executionContext = {
            originalQuestion: question,
            systemContext: context,
            executedCommands: [],
            results: [],
            finalAnswer: null,
            metadata: { iterations: 0, toolCalls: 0 }
        };

        try {
            const systemPrompt = `Você é um assistente Linux especializado em administração de sistemas.
Você tem acesso a uma ferramenta bash com sessão persistente que mantém estado entre comandos.

INSTRUÇÕES IMPORTANTES:
1. Use a ferramenta bash para executar comandos do sistema
2. A sessão mantém variáveis, diretório atual e arquivos entre comandos
3. Você pode encadear comandos com && ou ;
4. Use pipes, redirecionamentos e scripts conforme necessário
5. Para tarefas específicas de fail2ban, use as ferramentas otimizadas quando disponíveis

<use_parallel_tool_calls>
Sempre que possível, execute operações independentes em paralelo.
Por exemplo, ao verificar múltiplos serviços ou coletar várias informações do sistema.
</use_parallel_tool_calls>

Sistema: ${context.os || 'Linux'} ${context.distro || ''}`;

            // Combinar ferramentas
            const allTools = [
                this.getBashTool(),
                ...this.getAdditionalTools()
            ];

            if (this.ai.supportsTools && this.ai.supportsTools()) {
                return await this.executeWithTools(
                    executionContext,
                    systemPrompt,
                    question,
                    allTools,
                    options.tool_choice
                );
            } else {
                return {
                    success: false,
                    error: "Modelo não suporta tools nativas"
                };
            }

        } catch (error) {
            console.error(chalk.red('Erro na orquestração:'), error.message);
            return {
                success: false,
                error: error.message,
                executedCommands: executionContext.executedCommands
            };
        } finally {
            // Limpar sessão bash
            if (this.bashSession) {
                await this.bashSession.stop();
            }
        }
    }

    async executeWithTools(context, systemPrompt, question, tools, toolChoice = null) {
        const messages = [
            {
                role: 'user',
                content: question
            }
        ];

        let continueProcessing = true;
        let iterations = 0;

        while (continueProcessing && iterations < this.config.maxIterations) {
            iterations++;
            context.metadata.iterations = iterations;

            if (Date.now() - this.startTime > this.config.maxExecutionTime) {
                console.log(chalk.yellow('\n⚠️ Tempo limite excedido'));
                break;
            }

            const response = await this.ai.askWithTools({
                system: systemPrompt,
                messages: messages,
                tools: tools,
                tool_choice: toolChoice || { type: 'auto' }
            });

            if (this.config.verboseLogging) {
                console.log(chalk.blue(`\n🔄 Iteração ${iterations}`));
                console.log(chalk.gray(`   Stop reason: ${response.stop_reason}`));
            }

            if (response.stop_reason === 'tool_use') {
                const assistantMessage = {
                    role: 'assistant',
                    content: response.content
                };
                messages.push(assistantMessage);

                const toolResults = [];
                for (const block of response.content) {
                    if (block.type === 'tool_use') {
                        context.metadata.toolCalls++;

                        const result = await this.executeTool(
                            block.name,
                            block.input,
                            context
                        );

                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: typeof result === 'string' ? result : JSON.stringify(result),
                            is_error: result.error ? true : false
                        });
                    }
                }

                if (toolResults.length > 0) {
                    messages.push({
                        role: 'user',
                        content: toolResults
                    });
                }

            } else {
                const textBlocks = response.content.filter(block => block.type === 'text');
                context.finalAnswer = textBlocks.map(block => block.text).join('\n');
                continueProcessing = false;
            }
        }

        return this.formatResults(context);
    }

    async executeTool(toolName, toolInput, context) {
        try {
            if (toolName === 'bash') {
                // Ferramenta bash principal
                if (toolInput.restart) {
                    await this.bashSession.restart();
                    return "Sessão bash reiniciada com sucesso";
                }

                const command = toolInput.command;
                if (!command) {
                    return { error: "Comando não fornecido" };
                }

                if (this.config.verboseLogging) {
                    console.log(chalk.blue(`\n🔧 Bash: ${command}`));
                }

                context.executedCommands.push(command);

                const result = await this.bashSession.execute(command);

                // Sanitizar saída
                const sanitized = this.bashSession.sanitizeOutput(result.combined);

                if (this.config.verboseLogging && sanitized) {
                    console.log(chalk.gray(sanitized.substring(0, 200) + '...'));
                }

                context.results.push({
                    command,
                    output: sanitized,
                    truncated: result.truncated
                });

                return sanitized || "Comando executado sem saída";

            } else if (toolName === 'list_fail2ban_jails') {
                // Ferramenta otimizada específica
                const result = await this.bashSession.execute('sudo fail2ban-client status');
                const jailMatch = result.combined.match(/Jail list:\s*([^\n]+)/i);
                const jails = jailMatch ?
                    jailMatch[1].trim().split(/[,\s]+/).filter(j => j) : [];

                return {
                    success: true,
                    jails: jails,
                    count: jails.length
                };

            } else if (toolName === 'get_jail_status') {
                const result = await this.bashSession.execute(`sudo fail2ban-client status ${toolInput.jail_name}`);
                const ips = result.combined.match(/\d+\.\d+\.\d+\.\d+/g) || [];

                return {
                    success: true,
                    jail_name: toolInput.jail_name,
                    banned_ips: ips,
                    count: ips.length
                };

            } else {
                return { error: `Ferramenta desconhecida: ${toolName}` };
            }

        } catch (error) {
            return {
                error: error.message,
                success: false
            };
        }
    }

    formatResults(context) {
        const duration = Date.now() - this.startTime;

        return {
            success: !!context.finalAnswer,
            question: context.originalQuestion,
            directAnswer: context.finalAnswer,
            executedCommands: context.executedCommands,
            results: context.results,
            iterations: context.metadata.iterations,
            toolCalls: context.metadata.toolCalls,
            duration
        };
    }
}