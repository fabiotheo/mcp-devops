// ai_orchestrator_tools.js
// Sistema de Orquestração com Tools nativas seguindo documentação oficial do Claude

import chalk from 'chalk';

export default class AICommandOrchestratorWithTools {
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
        };
        this.startTime = null;
    }

    // Define tools disponíveis seguindo melhores práticas da documentação
    getAvailableTools() {
        return [
            {
                name: "list_fail2ban_jails",
                description: "Lista todas as jails (regras de bloqueio) ativas no fail2ban. Esta ferramenta retorna a lista completa de jails configuradas e ativas no sistema, incluindo o número total de jails. Use esta ferramenta primeiro quando precisar informações sobre fail2ban, antes de verificar jails individuais. A ferramenta não requer parâmetros e sempre retorna a lista atual de jails ativas.",
                input_schema: {
                    type: "object",
                    properties: {},
                    required: []
                }
            },
            {
                name: "get_jail_status",
                description: "Obtém o status detalhado de uma jail específica do fail2ban, incluindo todos os IPs atualmente banidos, total de banimentos históricos, arquivos de log monitorados e estatísticas de falhas. Use esta ferramenta após listar as jails para obter detalhes de cada uma. A ferramenta retorna uma lista completa de IPs bloqueados e métricas da jail. Sempre use esta ferramenta para CADA jail descoberta quando precisar contar IPs bloqueados totais.",
                input_schema: {
                    type: "object",
                    properties: {
                        jail_name: {
                            type: "string",
                            description: "Nome exato da jail do fail2ban como retornado por list_fail2ban_jails (ex: 'sshd', 'asterisk-iptables', 'apache-auth'). O nome deve corresponder exatamente ao listado."
                        }
                    },
                    required: ["jail_name"]
                }
            },
            {
                name: "execute_command",
                description: "Executa um comando Linux/Unix arbitrário no sistema. Use esta ferramenta para comandos que não têm uma ferramenta específica disponível. O comando será automaticamente prefixado com 'sudo' se necessário (para comandos que requerem privilégios elevados). A ferramenta retorna a saída completa do comando ou mensagem de erro se falhar. Use com cuidado e apenas quando necessário para responder perguntas do usuário.",
                input_schema: {
                    type: "object",
                    properties: {
                        command: {
                            type: "string",
                            description: "O comando Linux/Unix completo para executar, exatamente como seria digitado no terminal. Não inclua 'sudo' para comandos administrativos - será adicionado automaticamente."
                        },
                        reason: {
                            type: "string",
                            description: "Breve explicação de por que este comando está sendo executado e o que você espera obter com ele."
                        }
                    },
                    required: ["command"]
                }
            },
            {
                name: "list_docker_containers",
                description: "Lista todos os containers Docker atualmente em execução no sistema. Retorna informações básicas incluindo ID do container (12 caracteres), imagem usada, nomes dos containers, portas mapeadas e status. Use esta ferramenta primeiro quando precisar informações sobre Docker. Não requer parâmetros e sempre mostra containers ativos no momento.",
                input_schema: {
                    type: "object",
                    properties: {},
                    required: []
                }
            },
            {
                name: "get_container_details",
                description: "Obtém informações detalhadas e completas sobre um container Docker específico, incluindo configuração completa, variáveis de ambiente, volumes montados, rede, limites de recursos e metadados. Use após listar containers quando precisar de detalhes específicos. Aceita tanto o ID do container quanto o nome.",
                input_schema: {
                    type: "object",
                    properties: {
                        container_id: {
                            type: "string",
                            description: "ID do container (pode ser parcial, mínimo 3 caracteres) ou nome completo do container como retornado por list_docker_containers. Exemplos: 'a1b2c3', 'web-server', 'nginx-proxy'."
                        }
                    },
                    required: ["container_id"]
                }
            },
            {
                name: "list_systemd_services",
                description: "Lista serviços do systemd com status opcional de filtro. Pode listar todos os serviços, apenas os que falharam, apenas os ativos, ou apenas os inativos. Útil para diagnóstico de sistema e verificação de saúde dos serviços. Retorna nome do serviço, estado de carga, estado ativo, estado secundário e descrição.",
                input_schema: {
                    type: "object",
                    properties: {
                        filter: {
                            type: "string",
                            enum: ["all", "failed", "active", "inactive"],
                            description: "Filtro para tipos específicos de serviços. 'failed' mostra apenas serviços com falha, 'active' mostra em execução, 'inactive' mostra parados, 'all' mostra todos."
                        }
                    },
                    required: []
                }
            },
            {
                name: "analyze_system_logs",
                description: "Analisa logs do sistema para encontrar erros, avisos ou padrões específicos. Pode filtrar por severidade (error, warning, critical), por serviço específico, ou por período de tempo. Útil para diagnóstico de problemas e monitoramento. Retorna as linhas de log relevantes com timestamps.",
                input_schema: {
                    type: "object",
                    properties: {
                        severity: {
                            type: "string",
                            enum: ["error", "warning", "critical", "all"],
                            description: "Nível de severidade das mensagens para filtrar. 'all' retorna todos os níveis."
                        },
                        service: {
                            type: "string",
                            description: "Nome do serviço específico para filtrar logs (opcional). Exemplos: 'sshd', 'nginx', 'mysql'."
                        },
                        lines: {
                            type: "number",
                            description: "Número de linhas mais recentes para analisar. Padrão é 100."
                        }
                    },
                    required: []
                }
            },
            {
                name: "check_disk_usage",
                description: "Verifica o uso de disco do sistema, mostrando espaço usado e disponível para cada ponto de montagem. Retorna informações sobre sistema de arquivos, tamanho total, usado, disponível, porcentagem de uso e ponto de montagem. Útil para identificar problemas de espaço em disco. Pode opcionalmente mostrar uso por diretório específico.",
                input_schema: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "Caminho específico para verificar uso (opcional). Se não fornecido, mostra todos os pontos de montagem. Exemplos: '/', '/home', '/var/log'."
                        }
                    },
                    required: []
                }
            },
            {
                name: "check_network_connections",
                description: "Lista conexões de rede ativas, portas em escuta e estatísticas de rede. Pode filtrar por protocolo (tcp, udp) ou mostrar apenas portas em escuta. Útil para diagnóstico de rede, verificação de segurança e troubleshooting de conectividade. Retorna endereços locais e remotos, estado da conexão e processo associado.",
                input_schema: {
                    type: "object",
                    properties: {
                        protocol: {
                            type: "string",
                            enum: ["tcp", "udp", "all"],
                            description: "Protocolo para filtrar. 'all' mostra TCP e UDP."
                        },
                        listening_only: {
                            type: "boolean",
                            description: "Se true, mostra apenas portas em escuta (servidores). Se false, mostra todas as conexões."
                        }
                    },
                    required: []
                }
            }
        ];
    }

    async orchestrateExecution(question, context, options = {}) {
        this.startTime = Date.now();
        const executionContext = {
            originalQuestion: question,
            systemContext: context,
            executedCommands: [],
            results: [],
            finalAnswer: null,
            metadata: { iterations: 0, toolCalls: 0 }
        };

        try {
            // System prompt otimizado com best practices para uso paralelo
            const systemPrompt = `Você é um assistente Linux especializado em administração de sistemas.
Sua tarefa é responder perguntas executando comandos e analisando outputs.

INSTRUÇÕES IMPORTANTES:
1. Para perguntas sobre fail2ban: Use list_fail2ban_jails primeiro, depois get_jail_status para CADA jail
2. Para perguntas sobre Docker: Use list_docker_containers primeiro, depois get_container_details se necessário
3. Para outros comandos: Use execute_command
4. SEMPRE execute comandos iterativamente até ter todos os dados necessários
5. NÃO pare após o primeiro comando se precisar de mais informações

<use_parallel_tool_calls>
Para máxima eficiência, sempre que você realizar múltiplas operações independentes, invoque todas as ferramentas relevantes simultaneamente em vez de sequencialmente.
Por exemplo:
- Ao verificar múltiplas jails do fail2ban, chame get_jail_status para todas as jails em paralelo
- Ao verificar múltiplos containers Docker, chame get_container_details para todos em paralelo
- Ao coletar informações do sistema, chame ferramentas de diagnóstico em paralelo
Priorize chamar ferramentas em paralelo sempre que possível para reduzir latência.
</use_parallel_tool_calls>

Sistema: ${context.os || 'Linux'} ${context.distro || ''}`;

            // Se o modelo suporta tools nativas
            if (this.ai.supportsTools && this.ai.supportsTools()) {
                return await this.executeWithNativeTools(
                    executionContext,
                    systemPrompt,
                    question,
                    options.tool_choice
                );
            } else {
                console.log(chalk.yellow('⚠️ Modelo não suporta tools nativas'));
                return {
                    success: false,
                    error: "Este modelo não suporta tools. Use Claude 3+ ou GPT-4+",
                    executedCommands: [],
                    results: []
                };
            }

        } catch (error) {
            console.error(chalk.red('\n❌ Erro na orquestração:'), error.message);
            return {
                success: false,
                error: error.message,
                executedCommands: executionContext.executedCommands,
                results: executionContext.results
            };
        }
    }

    async executeWithNativeTools(context, systemPrompt, question, toolChoice = null) {
        // Iniciar conversa conforme documentação
        const messages = [
            {
                role: 'user',
                content: question
            }
        ];

        let continueProcessing = true;
        let iterations = 0;

        // Configurar tool_choice baseado em opções ou detectar automaticamente
        const defaultToolChoice = this.detectToolChoice(question, toolChoice);

        while (continueProcessing && iterations < this.config.maxIterations) {
            iterations++;
            context.metadata.iterations = iterations;

            if (Date.now() - this.startTime > this.config.maxExecutionTime) {
                console.log(chalk.yellow('\n⚠️ Tempo limite excedido'));
                break;
            }

            // Chamar Claude com tools (formato exato da documentação)
            const response = await this.ai.askWithTools({
                system: systemPrompt,
                messages: messages,
                tools: this.getAvailableTools(),
                tool_choice: defaultToolChoice || { type: 'auto' }
            });

            if (this.config.verboseLogging) {
                console.log(chalk.blue(`\n🔄 Iteração ${iterations}`));
                console.log(chalk.gray(`   Stop reason: ${response.stop_reason}`));
            }

            // Verificar stop_reason conforme documentação
            if (response.stop_reason === 'tool_use') {
                // Claude quer usar ferramentas
                const assistantMessage = {
                    role: 'assistant',
                    content: response.content
                };
                messages.push(assistantMessage);

                // Processar cada tool_use block
                const toolResults = [];
                for (const block of response.content) {
                    if (block.type === 'tool_use') {
                        if (this.config.verboseLogging) {
                            console.log(chalk.blue(`\n🔧 Ferramenta: ${block.name}`));
                            console.log(chalk.gray(`   Input: ${JSON.stringify(block.input)}`));
                        }

                        context.metadata.toolCalls++;

                        // Executar a ferramenta
                        const result = await this.executeTool(
                            block.name,
                            block.input,
                            context
                        );

                        // Adicionar resultado no formato correto
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: typeof result === 'string' ? result : JSON.stringify(result)
                        });
                    }
                }

                // Adicionar resultados das ferramentas como nova mensagem do usuário
                if (toolResults.length > 0) {
                    messages.push({
                        role: 'user',
                        content: toolResults
                    });
                }

            } else {
                // Claude terminou (stop_reason pode ser 'end_turn' ou 'stop_sequence')
                // Extrair resposta final
                const textBlocks = response.content.filter(block => block.type === 'text');
                context.finalAnswer = textBlocks.map(block => block.text).join('\n');
                continueProcessing = false;

                // Adicionar mensagem final ao histórico
                messages.push({
                    role: 'assistant',
                    content: response.content
                });
            }
        }

        // Se não temos resposta final, pedir para Claude sintetizar
        if (!context.finalAnswer && messages.length > 1) {
            messages.push({
                role: 'user',
                content: 'Por favor, forneça uma resposta final resumindo todos os dados coletados.'
            });

            const finalResponse = await this.ai.askWithTools({
                system: systemPrompt,
                messages: messages,
                tools: [], // Sem tools para forçar resposta textual
                tool_choice: { type: 'none' }
            });

            const textBlocks = finalResponse.content.filter(block => block.type === 'text');
            context.finalAnswer = textBlocks.map(block => block.text).join('\n');
        }

        return this.formatResults(context);
    }

    async executeTool(toolName, toolInput, context) {
        try {
            switch (toolName) {
                case 'list_fail2ban_jails':
                    const jailsCommand = 'sudo fail2ban-client status';
                    const jailsResult = await this.executeCommand(jailsCommand, context);

                    // Extrair lista de jails
                    const jailMatch = jailsResult.match(/Jail list:\s*([^\n]+)/i);
                    const jails = jailMatch ?
                        jailMatch[1].trim().split(/[,\s]+/).filter(j => j) : [];

                    return {
                        success: true,
                        jails: jails,
                        raw_output: jailsResult
                    };

                case 'get_jail_status':
                    const statusCommand = `sudo fail2ban-client status ${toolInput.jail_name}`;
                    const statusResult = await this.executeCommand(statusCommand, context);

                    // Extrair IPs banidos
                    const ips = statusResult.match(/\d+\.\d+\.\d+\.\d+/g) || [];
                    const bannedMatch = statusResult.match(/Currently banned:\s*(\d+)/i);
                    const totalMatch = statusResult.match(/Total banned:\s*(\d+)/i);

                    return {
                        success: true,
                        jail_name: toolInput.jail_name,
                        banned_ips: ips,
                        currently_banned: bannedMatch ? parseInt(bannedMatch[1]) : ips.length,
                        total_banned: totalMatch ? parseInt(totalMatch[1]) : null,
                        raw_output: statusResult
                    };

                case 'list_docker_containers':
                    const dockerCommand = 'sudo docker ps';
                    const dockerResult = await this.executeCommand(dockerCommand, context);

                    // Parse containers
                    const lines = dockerResult.split('\n').slice(1);
                    const containers = lines.filter(l => l.trim()).map(line => {
                        const parts = line.split(/\s{2,}/);
                        return {
                            id: parts[0]?.substring(0, 12),
                            image: parts[1],
                            name: parts[parts.length - 1]
                        };
                    }).filter(c => c.id);

                    return {
                        success: true,
                        containers: containers,
                        raw_output: dockerResult
                    };

                case 'get_container_details':
                    const inspectCommand = `sudo docker inspect ${toolInput.container_id}`;
                    const inspectResult = await this.executeCommand(inspectCommand, context);

                    try {
                        const details = JSON.parse(inspectResult);
                        return {
                            success: true,
                            details: details[0],
                            raw_output: inspectResult
                        };
                    } catch (e) {
                        return {
                            success: false,
                            error: 'Failed to parse container details',
                            raw_output: inspectResult
                        };
                    }

                case 'execute_command':
                    const result = await this.executeCommand(toolInput.command, context);
                    return {
                        success: true,
                        output: result,
                        command: toolInput.command
                    };

                case 'list_systemd_services':
                    const filter = toolInput.filter || 'all';
                    let servicesCommand = 'sudo systemctl list-units --type=service';

                    if (filter === 'failed') {
                        servicesCommand = 'sudo systemctl list-units --type=service --failed';
                    } else if (filter === 'active') {
                        servicesCommand = 'sudo systemctl list-units --type=service --state=active';
                    } else if (filter === 'inactive') {
                        servicesCommand = 'sudo systemctl list-units --type=service --state=inactive';
                    }

                    const servicesResult = await this.executeCommand(servicesCommand, context);

                    // Parse services
                    const serviceLines = servicesResult.split('\n').slice(1);
                    const services = [];
                    for (const line of serviceLines) {
                        if (line.includes('.service')) {
                            const parts = line.trim().split(/\s+/);
                            if (parts.length >= 4) {
                                services.push({
                                    unit: parts[0],
                                    load: parts[1],
                                    active: parts[2],
                                    sub: parts[3],
                                    description: parts.slice(4).join(' ')
                                });
                            }
                        }
                    }

                    return {
                        success: true,
                        filter: filter,
                        services: services,
                        count: services.length,
                        raw_output: servicesResult
                    };

                case 'analyze_system_logs':
                    const severity = toolInput.severity || 'all';
                    const service = toolInput.service || '';
                    const numLines = toolInput.lines || 100;

                    let logCommand = `sudo journalctl -n ${numLines} --no-pager`;

                    if (service) {
                        logCommand += ` -u ${service}`;
                    }

                    if (severity !== 'all') {
                        const priorityMap = {
                            'critical': '2',
                            'error': '3',
                            'warning': '4'
                        };
                        logCommand += ` -p ${priorityMap[severity]}`;
                    }

                    const logResult = await this.executeCommand(logCommand, context);

                    // Parse log entries
                    const logLines = logResult.split('\n').filter(l => l.trim());
                    const logEntries = logLines.map(line => {
                        const match = line.match(/^(\S+\s+\d+\s+[\d:]+)\s+(\S+)\s+(.+?)(\[\d+\])?:\s*(.*)$/);
                        if (match) {
                            return {
                                timestamp: match[1],
                                host: match[2],
                                service: match[3],
                                pid: match[4],
                                message: match[5]
                            };
                        }
                        return { raw: line };
                    });

                    return {
                        success: true,
                        severity: severity,
                        service: service || 'all',
                        entries: logEntries,
                        count: logEntries.length,
                        raw_output: logResult
                    };

                case 'check_disk_usage':
                    const path = toolInput.path || '';
                    let diskCommand = 'df -h';

                    if (path) {
                        diskCommand += ` ${path}`;
                    }

                    const diskResult = await this.executeCommand(diskCommand, context);

                    // Parse disk usage
                    const diskLines = diskResult.split('\n').slice(1);
                    const diskUsage = diskLines.filter(l => l.trim()).map(line => {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 6) {
                            return {
                                filesystem: parts[0],
                                size: parts[1],
                                used: parts[2],
                                available: parts[3],
                                use_percent: parts[4],
                                mounted_on: parts[5]
                            };
                        }
                    }).filter(d => d);

                    return {
                        success: true,
                        path: path || 'all',
                        disks: diskUsage,
                        raw_output: diskResult
                    };

                case 'check_network_connections':
                    const protocol = toolInput.protocol || 'all';
                    const listeningOnly = toolInput.listening_only || false;

                    let netCommand = 'sudo netstat -tunap';

                    if (protocol === 'tcp') {
                        netCommand = 'sudo netstat -tnap';
                    } else if (protocol === 'udp') {
                        netCommand = 'sudo netstat -unap';
                    }

                    if (listeningOnly) {
                        netCommand += ' | grep LISTEN';
                    }

                    const netResult = await this.executeCommand(netCommand, context);

                    // Parse connections
                    const netLines = netResult.split('\n').slice(2);
                    const connections = netLines.filter(l => l.trim()).map(line => {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 6) {
                            return {
                                protocol: parts[0],
                                recv_q: parts[1],
                                send_q: parts[2],
                                local_address: parts[3],
                                foreign_address: parts[4],
                                state: parts[5],
                                process: parts[6] || ''
                            };
                        }
                    }).filter(c => c);

                    return {
                        success: true,
                        protocol: protocol,
                        listening_only: listeningOnly,
                        connections: connections,
                        count: connections.length,
                        raw_output: netResult
                    };

                default:
                    return {
                        success: false,
                        error: `Ferramenta desconhecida: ${toolName}`
                    };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async executeCommand(command, context) {
        // Verificar segurança
        if (this.isCommandDangerous(command)) {
            throw new Error("Comando bloqueado por segurança");
        }

        // Adicionar sudo se necessário e não presente
        let finalCommand = command;
        if (command.includes('fail2ban') || command.includes('docker')) {
            if (!command.startsWith('sudo')) {
                finalCommand = `sudo ${command}`;
            }
        }

        // Executar comando
        const result = await this.executor.executeCommand(finalCommand);

        // Registrar
        context.executedCommands.push(finalCommand);
        context.results.push(result);

        if (this.config.verboseLogging) {
            console.log(chalk.green(`   ✓ Comando executado: ${finalCommand}`));
        }

        return result.output || result.error || '';
    }

    isCommandDangerous(command) {
        return this.config.dangerousPatterns.some(pattern => pattern.test(command));
    }

    detectToolChoice(question, userChoice) {
        // Se o usuário especificou, usar essa escolha
        if (userChoice) {
            return userChoice;
        }

        const q = question.toLowerCase();

        // Detectar quando forçar uso de ferramentas
        if (q.includes('fail2ban') || q.includes('docker') || q.includes('systemd') ||
            q.includes('logs') || q.includes('disco') || q.includes('rede')) {
            // Forçar uso de alguma ferramenta
            return { type: 'any' };
        }

        // Detectar quando é melhor deixar automático
        if (q.includes('como') || q.includes('o que') || q.includes('explicar')) {
            // Deixar Claude decidir se precisa de ferramentas
            return { type: 'auto' };
        }

        // Padrão: automático
        return { type: 'auto' };
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