#!/usr/bin/env node
// ~/.mcp-terminal/mcp-assistant.js
//
// MCP Assistant - Um assistente de linha de comando para Linux
//
// Recursos:
// - Responde perguntas sobre comandos Linux
// - Detecta o sistema operacional e adapta respostas
// - Detecta pacotes instalados (firewalls, servidores web, etc.) e adapta respostas
// - Navegação e manipulação de arquivos
// - Histórico de comandos

import { Anthropic } from '@anthropic-ai/sdk';
import SystemDetector from './system_detector.js';
import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs'; // Keep for sync ops if any, or specific needs
import path from 'path';
import { execSync, spawn } from 'child_process';
import ModelFactory from './ai_models/model_factory.js';
import WebSearcher from './web_search/index.js';
import readline from 'readline';
import os from 'os'; // For tmpdir and EOL

const CONFIG_PATH = path.join(process.env.HOME, '.mcp-terminal/config.json');
const HISTORY_PATH = path.join(process.env.HOME, '.mcp-terminal/command-history.json');

class MCPAssistant {
    constructor() {
        this.configPath = CONFIG_PATH;
        this.systemDetector = new SystemDetector();
        this.aiModel = null;
        this.webSearcher = null;
        this.config = {}; // Initialize config
        // loadConfig is called asynchronously, so ensure it's handled if methods depend on it immediately
    }

    async loadConfig() {
        try {
            if (!existsSync(this.configPath)) {
                console.error(`❌ Arquivo de configuração não encontrado em ${this.configPath}`);
                console.error('Execute: mcp-setup --configure');
                process.exit(1);
            }
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);

            // Initialize web searcher if enabled
            if (this.config.web_search && this.config.web_search.enabled) {
                this.webSearcher = new WebSearcher(this.config.web_search);
                console.log('🌐 Web search functionality initialized');
            }

            try {
                this.aiModel = await ModelFactory.createModel(this.config);
            } catch (error) {
                console.warn(`⚠️  Aviso ao inicializar modelo de IA via ModelFactory: ${error.message}`);
                if (this.config.anthropic_api_key) {
                    console.log('🔁 Tentando fallback para Anthropic SDK direto...');
                    this.anthropic = new Anthropic({
                        apiKey: this.config.anthropic_api_key,
                    });
                    // Mark that we are using fallback
                    this.usingFallbackAI = true;
                } else {
                    console.error('❌ Nenhuma API key da Anthropic configurada para fallback.');
                    throw new Error('Falha ao inicializar o modelo de IA e sem fallback configurado.');
                }
            }

        } catch (error) {
            console.error('❌ Erro crítico ao carregar configuração ou inicializar IA:', error.message);
            console.error('Verifique sua configuração ou execute: mcp-setup --configure');
            process.exit(1);
        }
    }

    async askCommand(question) {
        console.log('🔍 askCommand called with question:', question);

        if (!this.aiModel && !this.anthropic) {
            console.log('⚠️ No AI model or Anthropic client initialized, loading config...');
            // This might happen if loadConfig hasn't completed or failed critically
            await this.loadConfig(); // Ensure config is loaded
            console.log('✅ Config loaded, AI model initialized:', !!this.aiModel, 'Anthropic fallback:', !!this.anthropic);
        }

        try {
            // Verifica o tipo de consulta
            const isFirewallQuery = this.isFirewallBlockQuery(question);
            const isAsteriskQuery = this.isAsteriskQuery(question);
            const isPM2Query = this.isPM2Query(question);
            const isAWSS3Query = this.isAWSS3Query(question);

            console.log('📊 Query type detection:', {
                isFirewallQuery,
                isAsteriskQuery,
                isPM2Query,
                isAWSS3Query
            });

            // Obtém o contexto do sistema, incluindo IPs bloqueados se for uma consulta de firewall
            let systemContext = this.systemDetector.getSystemContext(isFirewallQuery);
            const currentDir = process.cwd();
            const dirInfo = await this.getCurrentDirectoryInfo();

            // Try to get web search results if enabled
            let webSearchResults = null;
            if (this.webSearcher && this.config.web_search && this.config.web_search.enabled) {
                try {
                    console.log('🔍 Searching web for relevant information...');
                    webSearchResults = await this.webSearcher.searchDocumentation(question, {
                        os: systemContext.os,
                        distro: systemContext.distro,
                        version: systemContext.version,
                        language: 'bash' // Assuming Linux commands
                    });
                    console.log(`✅ Found ${webSearchResults.results ? webSearchResults.results.length : 0} web search results`);
                } catch (error) {
                    console.warn(`⚠️  Web search failed: ${error.message}`);
                    // Continue without web search results
                }
            }

            if (this.aiModel && !this.usingFallbackAI) {
                console.log('🤖 Using AI model:', this.aiModel.getModelName());
                // Ensure we have the installed packages information
                if (!systemContext.installedPackages) {
                    console.log('📦 Detecting installed packages...');
                    this.systemDetector.detectInstalledPackages();
                    // Update systemContext with the latest information
                    systemContext = this.systemDetector.getSystemContext();
                    console.log('✅ Packages detected');
                }

                console.log('🔄 Sending question to AI model...');
                const response = await this.aiModel.askCommand(question, {
                    ...systemContext,
                    currentDir,
                    dirInfo,
                    formattedPackages: this.formatInstalledPackages(systemContext.installedPackages),
                    webSearchResults: webSearchResults
                });
                console.log('✅ Received response from AI model');
                return response;
            }

            // Fallback para o sistema antigo (Claude direto via Anthropic SDK)
            if (!this.anthropic) {
                console.log('❌ Anthropic fallback client not initialized');
                return '❌ Erro: Cliente Anthropic (fallback) não inicializado. Verifique sua API key.';
            }

            console.log('🔄 Using Anthropic fallback client');

            // Format web search results if available
            let webSearchSection = '';
            if (webSearchResults && webSearchResults.results && webSearchResults.results.length > 0) {
                webSearchSection = `
RESULTADOS DE BUSCA NA WEB:
${webSearchResults.results.map((result, index) => 
  `${index + 1}. ${result.title}
   URL: ${result.url}
   Fonte: ${result.source}
   Resumo: ${result.snippet}`
).join('\n\n')}
`;
            }

            // Formata informações detalhadas com base no tipo de consulta
            let detailedSection = '';

            // Informações de firewall para consultas de firewall
            if (isFirewallQuery && systemContext.firewallDetails && systemContext.firewallDetails.blockedIPs) {
                detailedSection = this.formatFirewallBlockedIPs(systemContext.firewallDetails);
            }

            // Informações de Asterisk para consultas de VoIP
            if (isAsteriskQuery && systemContext.installedPackages && systemContext.installedPackages.asterisk) {
                detailedSection += this.formatAsteriskDetails(systemContext.installedPackages.asterisk);
            }

            // Informações de PM2 para consultas de gerenciamento de processos Node.js
            if (isPM2Query && systemContext.installedPackages && systemContext.installedPackages.pm2) {
                detailedSection += this.formatPM2Details(systemContext.installedPackages.pm2);
            }

            // Informações de AWS S3 para consultas relacionadas a S3
            if (isAWSS3Query && systemContext.installedPackages && systemContext.installedPackages.awsCLI) {
                detailedSection += this.formatAWSS3Details(systemContext.installedPackages.awsCLI);
            }

            const prompt = `Você é um assistente especializado em Linux/Unix que ajuda usuários a encontrar o comando correto para suas tarefas.

INFORMAÇÕES DO SISTEMA:
- OS: ${systemContext.os}
- Distribuição: ${systemContext.distro}
- Versão: ${systemContext.version}
- Package Manager: ${systemContext.packageManager}
- Shell: ${systemContext.shell}
- Arquitetura: ${systemContext.architecture}
- Kernel: ${systemContext.kernel}
- Capacidades: ${systemContext.capabilities.join(', ') || 'N/A'}

PACOTES INSTALADOS:
${this.formatInstalledPackages(systemContext.installedPackages)}
${detailedSection}

DIRETÓRIO ATUAL: ${currentDir}
${dirInfo}

COMANDOS DISPONÍVEIS NESTE SISTEMA (amostra ou relevantes, se aplicável):
${systemContext.commands && systemContext.commands.length > 0 ? JSON.stringify(systemContext.commands.slice(0, 20), null, 2) + (systemContext.commands.length > 20 ? "\n(e mais...)" : "") : "Não especificado"}
${webSearchSection}
PERGUNTA DO USUÁRIO: ${question}

INSTRUÇÕES:
1. Analise a pergunta considerando o sistema específico do usuário e os pacotes instalados.
2. Se a pergunta for sobre um tipo específico de software (firewall, servidor web, etc.), adapte sua resposta com base nos pacotes detectados no sistema.
3. Forneça o comando exato para a distribuição/sistema detectado e os pacotes instalados.
4. Explique brevemente o que o comando faz.
5. Se houver variações por distribuição ou pacote instalado, mencione isso.
6. Inclua opções úteis do comando.
7. Se apropriado, sugira comandos relacionados.
8. Se a pergunta for sobre IPs bloqueados ou firewalls, forneça uma resposta detalhada com base nas informações de firewall disponíveis.
9. Se a pergunta for sobre Asterisk (VoIP), forneça comandos específicos para gerenciar ramais, chamadas, peers SIP, etc.
10. Se a pergunta for sobre PM2 (gerenciador de processos Node.js), forneça comandos para monitorar, reiniciar ou gerenciar aplicações.
11. Se a pergunta for sobre AWS S3, forneça comandos específicos para operações com buckets, sincronização, upload/download, etc.

FORMATO DA RESPOSTA (use este formato estritamente):
🔧 COMANDO:
\`\`\`bash
comando exato aqui
\`\`\`

📝 EXPLICAÇÃO:
[Explicação clara do que faz]

💡 OPÇÕES ÚTEIS:
[Variações ou opções importantes]

⚠️ OBSERVAÇÕES:
[Avisos ou considerações especiais]

Responda de forma direta e prática. Se o comando for multi-linha, coloque cada parte em uma nova linha dentro do bloco de código bash.

FORMATOS ESPECIAIS PARA CONSULTAS ESPECÍFICAS:

1. PARA CONSULTAS DE FIREWALL/IPS BLOQUEADOS:
Se a pergunta for sobre IPs bloqueados, use este formato adicional:

🛡️ IPS BLOQUEADOS:
[Lista formatada de IPs bloqueados por firewall]

🔧 COMANDOS PARA GERENCIAR:
[Comandos para desbloquear IPs ou gerenciar regras]

2. PARA CONSULTAS DE ASTERISK (VoIP):
Se a pergunta for sobre Asterisk ou telefonia VoIP, use este formato adicional:

📞 STATUS DO ASTERISK:
[Informações sobre status, versão, peers registrados, canais ativos]

🔧 COMANDOS ESPECÍFICOS:
[Comandos específicos para a tarefa solicitada]

3. PARA CONSULTAS DE PM2 (GERENCIADOR DE PROCESSOS):
Se a pergunta for sobre PM2 ou aplicações Node.js, use este formato adicional:

📊 APLICAÇÕES EM EXECUÇÃO:
[Lista de aplicações, status, uso de recursos]

🔧 COMANDOS DE GERENCIAMENTO:
[Comandos específicos para monitorar, reiniciar ou gerenciar aplicações]

4. PARA CONSULTAS DE AWS S3:
Se a pergunta for sobre AWS S3, use este formato adicional:

☁️ INFORMAÇÕES DE S3:
[Informações sobre buckets, configuração, região]

🔧 COMANDOS S3:
[Comandos específicos para operações com buckets, sincronização, upload/download]`;

            const modelToUse = this.config.claude_model || this.config.model || "claude-3-sonnet-20240229"; // Exemplo de nome de modelo válido
            console.log('🤖 Using Anthropic model:', modelToUse);

            try {
                console.log('🔄 Sending request to Anthropic API...');
                const response = await this.anthropic.messages.create({
                    model: modelToUse,
                    max_tokens: 2000,
                    messages: [{ role: 'user', content: prompt }],
                });

                console.log('✅ Received response from Anthropic API');
                if (response && response.content && response.content.length > 0) {
                    const responseText = response.content[0].text;
                    return responseText;
                } else {
                    console.log('⚠️ Empty or invalid response from Anthropic API:', response);
                    return '❌ Erro: Resposta vazia ou inválida da API Anthropic.';
                }
            } catch (apiError) {
                console.error('❌ Anthropic API error:', apiError);
                return `❌ Erro na API Anthropic: ${apiError.message}`;
            }
        } catch (error) {
            console.error('❌ Erro ao consultar assistente:', error.message);
            console.error('Stack trace:', error.stack);
            return `❌ Erro ao conectar com o assistente: ${error.message}\nVerifique sua configuração e a API key.`;
        }
    }

    async getCurrentDirectoryInfo() {
        try {
            // Lista alguns arquivos e diretórios do diretório atual
            let files = [];
            let dirs = [];
            try {
                const entries = await fs.readdir('.', { withFileTypes: true });
                files = entries.filter(e => e.isFile()).map(e => e.name).slice(0, 10); // Show more
                dirs = entries.filter(e => e.isDirectory()).map(e => e.name).slice(0, 5);
            } catch (e) {
                // Silently ignore if can't read dir, e.g. permissions
            }

            let projectType = [];
            // Check for common project files
            const projectFiles = {
                'Node.js': 'package.json',
                'Rust': 'Cargo.toml',
                'Go': 'go.mod',
                'Python': 'requirements.txt',
                'Make': 'Makefile',
                'Git Repo': '.git', // .git is a directory
            };

            for (const [type, fileOrDir] of Object.entries(projectFiles)) {
                try {
                    await fs.access(fileOrDir); // Checks existence
                    projectType.push(type);
                } catch { /* File/dir not found */ }
            }

            return `
INFORMAÇÕES DO DIRETÓRIO:
- Tipo de projeto detectado: ${projectType.length > 0 ? projectType.join(', ') : 'Genérico'}
- Primeiros arquivos: ${files.join(', ') || 'Nenhum visível'}
- Primeiros diretórios: ${dirs.join(', ') || 'Nenhum visível'}`;

        } catch (error) {
            console.warn(`⚠️  Não foi possível obter informações detalhadas do diretório: ${error.message}`);
            return 'INFORMAÇÕES DO DIRETÓRIO: Não foi possível carregar.';
        }
    }

    async saveCommandHistory(question, command) {
        try {
            let history = [];
            if (existsSync(HISTORY_PATH)) {
                const content = await fs.readFile(HISTORY_PATH, 'utf8');
                history = JSON.parse(content);
            }

            history.unshift({
                timestamp: new Date().toISOString(),
                question,
                command,
                system: this.systemDetector.getSystemContext().distro || this.systemDetector.getSystemContext().os, // Simpler system info
                provider: (this.aiModel && !this.usingFallbackAI) ? this.aiModel.getProviderName() : 'Anthropic (Fallback)',
            });

            history = history.slice(0, 100); // Manter apenas os últimos 100
            await fs.writeFile(HISTORY_PATH, JSON.stringify(history, null, 2));
        } catch (error) {
            console.error('❌ Erro ao salvar histórico:', error.message);
        }
    }

    getProviderInfo() {
        const info = {
            provider: 'Unknown',
            model: 'Unknown',
            apiKeyConfigured: false,
            webSearchEnabled: false,
            firecrawlConfigured: false
        };

        if (this.aiModel && !this.usingFallbackAI) {
            info.provider = this.aiModel.getProviderName();
            info.model = this.aiModel.getModelName();
        } else if (this.usingFallbackAI) {
            info.provider = 'Anthropic (Fallback)';
            info.model = this.config.claude_model || this.config.model || "claude-3-sonnet-20240229";
        }

        // Check API key status
        if (this.config.anthropic_api_key && this.config.anthropic_api_key !== 'YOUR_ANTHROPIC_API_KEY') {
            info.apiKeyConfigured = true;
        } else if (this.config.openai_api_key && this.config.openai_api_key !== 'YOUR_OPENAI_API_KEY') {
            info.apiKeyConfigured = true;
        } else if (this.config.gemini_api_key && this.config.gemini_api_key !== 'YOUR_GEMINI_API_KEY') {
            info.apiKeyConfigured = true;
        }

        // Check web search status
        info.webSearchEnabled = this.config.web_search && this.config.web_search.enabled;

        // Check Firecrawl status
        info.firecrawlConfigured = this.config.firecrawl_api_key &&
                                   this.config.firecrawl_api_key !== 'YOUR_FIRECRAWL_API_KEY';

        return info;
    }

    // Verifica se a pergunta é sobre IPs bloqueados ou firewalls
    isFirewallBlockQuery(question) {
        const firewallKeywords = [
            'firewall', 'ips bloqueados', 'ip bloqueado', 'bloqueio', 'bloqueados',
            'ufw', 'iptables', 'firewalld', 'fail2ban', 'csf', 'shorewall', 'pf',
            'regras de bloqueio', 'conexões bloqueadas', 'endereços bloqueados',
            'bloquear ip', 'listar bloqueios', 'mostrar bloqueios', 'ver bloqueios'
        ];

        // Versão em inglês para compatibilidade
        const englishKeywords = [
            'blocked ip', 'blocked ips', 'firewall block', 'ip block', 'blocked address',
            'list blocks', 'show blocks', 'view blocks', 'blocked connections'
        ];

        const normalizedQuestion = question.toLowerCase();

        // Verifica se alguma das palavras-chave está presente na pergunta
        return [...firewallKeywords, ...englishKeywords].some(keyword =>
            normalizedQuestion.includes(keyword)
        );
    }

    // Verifica se a pergunta é sobre Asterisk (VoIP)
    isAsteriskQuery(question) {
        const asteriskKeywords = [
            'asterisk', 'voip', 'telefonia', 'telefone', 'ramal', 'ramais', 'sip',
            'chamada', 'chamadas', 'ligação', 'ligações', 'pabx', 'pbx', 'canal',
            'canais', 'extensão', 'extensões', 'registro sip', 'registros sip',
            'peer', 'peers', 'trunk', 'trunks', 'dialplan', 'codec', 'codecs'
        ];

        // Versão em inglês para compatibilidade
        const englishKeywords = [
            'extension', 'extensions', 'phone', 'call', 'calls', 'sip register',
            'sip registry', 'voip server', 'pbx', 'channel', 'channels'
        ];

        const normalizedQuestion = question.toLowerCase();

        // Verifica se alguma das palavras-chave está presente na pergunta
        return [...asteriskKeywords, ...englishKeywords].some(keyword =>
            normalizedQuestion.includes(keyword)
        );
    }

    // Verifica se a pergunta é sobre PM2 (Process Manager)
    isPM2Query(question) {
        const pm2Keywords = [
            'pm2', 'process manager', 'gerenciador de processo', 'node.js', 'nodejs',
            'aplicação node', 'aplicações node', 'app node', 'apps node',
            'monitorar processo', 'monitorar processos', 'monitoramento de processo',
            'reiniciar app', 'reiniciar aplicação', 'logs de aplicação', 'logs de app',
            'memória de aplicação', 'cpu de aplicação', 'aplicação travando',
            'aplicação caindo', 'aplicação reiniciando', 'ecosystem', 'ecossistema'
        ];

        // Versão em inglês para compatibilidade
        const englishKeywords = [
            'node app', 'node application', 'process monitoring', 'restart app',
            'application logs', 'app logs', 'app memory', 'app cpu', 'app crashing',
            'app restarting', 'node process'
        ];

        const normalizedQuestion = question.toLowerCase();

        // Verifica se alguma das palavras-chave está presente na pergunta
        return [...pm2Keywords, ...englishKeywords].some(keyword =>
            normalizedQuestion.includes(keyword)
        );
    }

    // Verifica se a pergunta é sobre AWS S3
    isAWSS3Query(question) {
        const s3Keywords = [
            's3', 'aws', 'amazon s3', 'bucket', 'buckets', 'aws cli', 'cli aws',
            'sincronizar s3', 'sincronizar com s3', 'upload s3', 'download s3',
            'copiar para s3', 'copiar do s3', 'backup s3', 'backup para s3',
            'armazenamento em nuvem', 'armazenamento na nuvem', 'objeto s3',
            'objetos s3', 'url temporária', 'url pré-assinada', 'presigned url'
        ];

        // Versão em inglês para compatibilidade
        const englishKeywords = [
            'cloud storage', 's3 sync', 'sync to s3', 's3 upload', 's3 download',
            'copy to s3', 'copy from s3', 's3 backup', 'backup to s3', 's3 object',
            's3 objects', 'temporary url', 'presigned url'
        ];

        const normalizedQuestion = question.toLowerCase();

        // Verifica se alguma das palavras-chave está presente na pergunta
        return [...s3Keywords, ...englishKeywords].some(keyword =>
            normalizedQuestion.includes(keyword)
        );
    }

    // Formata informações de IPs bloqueados para o prompt
    formatFirewallBlockedIPs(firewallDetails) {
        if (!firewallDetails || !firewallDetails.blockedIPs) {
            return '';
        }

        let result = "\n\nINFORMAÇÕES DE FIREWALL DETALHADAS:";
        result += `\n- Firewalls ativos: ${firewallDetails.activeFirewalls.join(', ')}`;

        // Para cada firewall, formata os IPs bloqueados
        for (const [firewallName, firewallData] of Object.entries(firewallDetails.blockedIPs)) {
            if (!firewallData.success) {
                result += `\n\n${firewallName.toUpperCase()}: Erro ao obter informações (${firewallData.error || 'Erro desconhecido'})`;
                continue;
            }

            if (!firewallData.blockedIPs || firewallData.blockedIPs.length === 0) {
                result += `\n\n${firewallName.toUpperCase()}: Nenhum IP bloqueado encontrado`;
                continue;
            }

            result += `\n\n${firewallName.toUpperCase()} (${firewallData.blockedIPs.length} IPs bloqueados):`;

            // Limita a quantidade de IPs mostrados para não sobrecarregar o prompt
            const maxIPsToShow = 15;
            const ipsToShow = firewallData.blockedIPs.slice(0, maxIPsToShow);

            for (const blockedIP of ipsToShow) {
                result += `\n- IP: ${blockedIP.ip}`;
                if (blockedIP.direction) result += `, Direção: ${blockedIP.direction}`;
                if (blockedIP.type) result += `, Tipo: ${blockedIP.type}`;
                if (blockedIP.formattedTime) result += `, Expira em: ${blockedIP.formattedTime}`;
                if (blockedIP.comment) result += `, Comentário: ${blockedIP.comment}`;
            }

            if (firewallData.blockedIPs.length > maxIPsToShow) {
                result += `\n- ... e mais ${firewallData.blockedIPs.length - maxIPsToShow} IPs (omitidos para brevidade)`;
            }

            // Adiciona comandos específicos para este firewall
            result += `\n\nComandos para ${firewallName}:`;
            switch (firewallName) {
                case 'ufw':
                    result += `
- Listar regras: ufw status numbered
- Desbloquear IP: ufw delete deny from <ip>
- Ver logs: grep "BLOCK" /var/log/ufw.log`;
                    break;
                case 'firewalld':
                    result += `
- Listar regras: firewall-cmd --list-all
- Desbloquear IP: firewall-cmd --permanent --remove-rich-rule='rule family="ipv4" source address="<ip>" reject'
- Ver logs: journalctl -u firewalld`;
                    break;
                case 'iptables':
                    result += `
- Listar regras: iptables -L -n -v
- Desbloquear IP: iptables -D INPUT -s <ip> -j DROP
- Ver logs: grep "DROP" /var/log/kern.log`;
                    break;
                case 'fail2ban':
                    result += `
- Listar jails: fail2ban-client status
- Desbloquear IP: fail2ban-client set <jail> unbanip <ip>
- Ver logs: tail -f /var/log/fail2ban.log`;
                    break;
                case 'csf':
                    result += `
- Listar bloqueios: cat /etc/csf/csf.deny
- Desbloquear IP: csf -dr <ip>
- Ver logs: grep <ip> /var/log/lfd.log`;
                    break;
                case 'shorewall':
                    result += `
- Listar regras: shorewall show blacklists
- Desbloquear IP: shorewall allow <ip>
- Ver logs: grep <ip> /var/log/messages`;
                    break;
                case 'pf':
                    result += `
- Listar regras: pfctl -s rules
- Desbloquear IP: pfctl -t <table> -T delete <ip>
- Ver logs: tcpdump -n -e -ttt -i pflog0`;
                    break;
                default:
                    result += `
- Consulte a documentação específica para este firewall`;
            }
        }

        return result;
    }

    // Formata informações detalhadas do Asterisk para o prompt
    formatAsteriskDetails(asterisk) {
        if (!asterisk) {
            return '';
        }

        let result = "\n\nINFORMAÇÕES DETALHADAS DO ASTERISK:";
        result += `\n- Status: ${asterisk.active ? 'Ativo' : 'Inativo'}`;
        if (asterisk.version) {
            result += `\n- Versão: ${asterisk.version}`;
        }

        // Adiciona informações de peers e canais
        if (asterisk.registeredPeers > 0) {
            result += `\n- Peers SIP registrados: ${asterisk.registeredPeers}`;
        } else {
            result += `\n- Peers SIP registrados: Nenhum ou não disponível`;
        }

        if (asterisk.activeChannels > 0) {
            result += `\n- Canais ativos: ${asterisk.activeChannels}`;
        } else {
            result += `\n- Canais ativos: Nenhum`;
        }

        // Adiciona detalhes de configuração se disponíveis
        if (asterisk.configDetails) {
            result += `\n- Diretório de configuração: ${asterisk.configDetails.configPath || '/etc/asterisk'}`;
            result += `\n- Diretório de logs: ${asterisk.configDetails.logPath || '/var/log/asterisk'}`;
            if (asterisk.configDetails.uptime) {
                result += `\n- Uptime: ${asterisk.configDetails.uptime}`;
            }
        }

        // Adiciona comandos úteis para Asterisk
        result += `\n\nCOMANDOS ÚTEIS PARA ASTERISK:`;
        result += `
- Verificar status: systemctl status asterisk
- Ver peers SIP: asterisk -rx "sip show peers"
- Ver registros SIP: asterisk -rx "sip show registry"
- Ver canais ativos: asterisk -rx "core show channels"
- Recarregar configuração SIP: asterisk -rx "sip reload"
- Reiniciar sem derrubar chamadas: asterisk -rx "core restart gracefully"
- Ver logs em tempo real: tail -f /var/log/asterisk/full
- Verificar configuração: asterisk -T
- Ver versão: asterisk -rx "core show version"
- Ver uptime: asterisk -rx "core show uptime"
- Ver módulos carregados: asterisk -rx "module show"
- Ver dialplan: asterisk -rx "dialplan show"`;

        return result;
    }

    // Formata informações detalhadas do PM2 para o prompt
    formatPM2Details(pm2) {
        if (!pm2) {
            return '';
        }

        let result = "\n\nINFORMAÇÕES DETALHADAS DO PM2:";
        result += `\n- Status: ${pm2.active ? 'Ativo' : 'Instalado mas sem aplicações ativas'}`;
        if (pm2.version) {
            result += `\n- Versão: ${pm2.version}`;
        }

        // Adiciona informações de aplicações
        if (pm2.runningApps > 0) {
            result += `\n- Aplicações em execução: ${pm2.runningApps}`;

            // Adiciona detalhes das aplicações se disponíveis
            if (pm2.appDetails && pm2.appDetails.apps && pm2.appDetails.apps.length > 0) {
                result += `\n\nAPLICAÇÕES EM EXECUÇÃO:`;
                for (const app of pm2.appDetails.apps) {
                    result += `\n- Nome: ${app.name}`;
                    result += `, Status: ${app.status}`;
                    if (app.memory) result += `, Memória: ${typeof app.memory === 'number' ? `${Math.round(app.memory / (1024 * 1024))} MB` : app.memory}`;
                    if (app.cpu) result += `, CPU: ${app.cpu}%`;
                    if (app.restarts) result += `, Restarts: ${app.restarts}`;
                }

                if (pm2.appDetails.apps.length < pm2.runningApps) {
                    result += `\n- ... e mais ${pm2.runningApps - pm2.appDetails.apps.length} aplicações (omitidas para brevidade)`;
                }
            }
        } else {
            result += `\n- Aplicações em execução: Nenhuma`;
        }

        // Adiciona comandos úteis para PM2
        result += `\n\nCOMANDOS ÚTEIS PARA PM2:`;
        result += `
- Listar aplicações: pm2 list
- Monitorar em tempo real: pm2 monit
- Ver logs de todas as aplicações: pm2 logs
- Ver logs de uma aplicação específica: pm2 logs [app-name]
- Reiniciar aplicação: pm2 restart [app-name]
- Recarregar aplicação (zero downtime): pm2 reload [app-name]
- Parar aplicação: pm2 stop [app-name]
- Remover aplicação: pm2 delete [app-name]
- Configurar inicialização automática: pm2 startup
- Salvar configuração atual: pm2 save
- Ver detalhes de uma aplicação: pm2 show [app-name]
- Iniciar nova aplicação: pm2 start app.js --name [app-name]
- Iniciar com opções avançadas: pm2 start app.js --name [app-name] --watch --max-memory-restart 300M
- Limpar logs: pm2 flush
- Recarregar logs: pm2 reloadLogs
- Verificar status do daemon: pm2 ping
- Atualizar PM2: pm2 update
- Gerar arquivo ecosystem: pm2 ecosystem
- Iniciar usando ecosystem: pm2 start ecosystem.config.js`;

        return result;
    }

    // Formata informações detalhadas do AWS S3 para o prompt
    formatAWSS3Details(awsCLI) {
        if (!awsCLI) {
            return '';
        }

        let result = "\n\nINFORMAÇÕES DETALHADAS DO AWS CLI (S3):";
        result += `\n- Status: ${awsCLI.configured ? 'Configurado' : 'Instalado mas não configurado'}`;
        if (awsCLI.version) {
            result += `\n- Versão: ${awsCLI.version}`;
        }

        // Adiciona informações de configuração
        if (awsCLI.configured) {
            result += `\n- Região padrão: ${awsCLI.defaultRegion || 'Não definida'}`;

            // Adiciona detalhes de configuração se disponíveis
            if (awsCLI.configDetails) {
                if (awsCLI.configDetails.profile) {
                    result += `\n- Perfil: ${awsCLI.configDetails.profile}`;
                }
                if (awsCLI.configDetails.outputFormat) {
                    result += `\n- Formato de saída: ${awsCLI.configDetails.outputFormat}`;
                }
            }

            // Adiciona informações de buckets
            if (awsCLI.buckets && awsCLI.buckets.length > 0) {
                result += `\n\nBUCKETS DISPONÍVEIS (${awsCLI.buckets.length}):`;
                for (const bucket of awsCLI.buckets) {
                    result += `\n- ${bucket}`;
                }
            } else {
                result += `\n- Buckets disponíveis: Nenhum ou sem permissão para listar`;
            }
        }

        // Adiciona comandos úteis para AWS S3
        result += `\n\nCOMANDOS ÚTEIS PARA AWS S3:`;
        result += `
- Listar buckets: aws s3 ls
- Listar objetos em um bucket: aws s3 ls s3://[bucket-name]
- Listar objetos recursivamente: aws s3 ls s3://[bucket-name] --recursive
- Criar bucket: aws s3 mb s3://[bucket-name]
- Remover bucket: aws s3 rb s3://[bucket-name]
- Copiar arquivo para S3: aws s3 cp [local-file] s3://[bucket-name]/[path]
- Copiar arquivo do S3: aws s3 cp s3://[bucket-name]/[path] [local-file]
- Sincronizar diretório para S3: aws s3 sync [local-dir] s3://[bucket-name]/[path]
- Sincronizar diretório do S3: aws s3 sync s3://[bucket-name]/[path] [local-dir]
- Remover objeto: aws s3 rm s3://[bucket-name]/[path]
- Gerar URL temporária: aws s3 presign s3://[bucket-name]/[path] --expires-in [seconds]
- Ver tamanho do bucket: aws s3 ls s3://[bucket-name] --recursive --human-readable --summarize
- Configurar concorrência: aws configure set default.s3.max_concurrent_requests [number]
- Configurar tamanho de chunk: aws configure set default.s3.multipart_chunksize [size]
- Habilitar aceleração: aws s3 cp --endpoint-url=https://s3-accelerate.amazonaws.com`;

        return result;
    }

    // Formata informações de pacotes instalados para o prompt
    formatInstalledPackages(packages) {
        if (!packages) return "- Nenhuma informação de pacotes disponível";

        let result = "";

        // Formata firewalls
        if (packages.firewalls && packages.firewalls.length > 0) {
            result += "- Firewalls: ";
            result += packages.firewalls.map(fw =>
                `${fw.name}${fw.active ? ' (ativo)' : ' (inativo)'}`
            ).join(", ");
            result += "\n";
        } else {
            result += "- Firewalls: Nenhum detectado\n";
        }

        // Formata servidores web
        if (packages.webServers && packages.webServers.length > 0) {
            result += "- Servidores Web: ";
            result += packages.webServers.map(server =>
                `${server.name}${server.active ? ' (ativo)' : ' (inativo)'}`
            ).join(", ");
            result += "\n";
        } else {
            result += "- Servidores Web: Nenhum detectado\n";
        }

        // Formata bancos de dados
        if (packages.databases && packages.databases.length > 0) {
            result += "- Bancos de Dados: ";
            result += packages.databases.map(db =>
                `${db.name}${db.active ? ' (ativo)' : ' (inativo)'}`
            ).join(", ");
            result += "\n";
        } else {
            result += "- Bancos de Dados: Nenhum detectado\n";
        }

        // Formata ferramentas de contêiner
        if (packages.containerTools && packages.containerTools.length > 0) {
            result += "- Ferramentas de Contêiner: ";
            result += packages.containerTools.map(tool =>
                `${tool.name}${tool.active ? ' (ativo)' : ' (inativo)'}`
            ).join(", ");
            result += "\n";
        } else {
            result += "- Ferramentas de Contêiner: Nenhuma detectada\n";
        }

        // Formata ferramentas de monitoramento
        if (packages.monitoringTools && packages.monitoringTools.length > 0) {
            result += "- Ferramentas de Monitoramento: ";
            result += packages.monitoringTools.map(tool =>
                `${tool.name}${tool.active ? ' (ativo)' : ' (inativo)'}`
            ).join(", ");
            result += "\n";
        } else {
            result += "- Ferramentas de Monitoramento: Nenhuma detectada\n";
        }

        // Formata Asterisk (VoIP)
        if (packages.asterisk) {
            result += "- Asterisk (VoIP): ";
            result += `${packages.asterisk.details}`;
            if (packages.asterisk.registeredPeers > 0) {
                result += `, ${packages.asterisk.registeredPeers} peers registrados`;
            }
            if (packages.asterisk.activeChannels > 0) {
                result += `, ${packages.asterisk.activeChannels} canais ativos`;
            }
            result += "\n";
        } else {
            result += "- Asterisk (VoIP): Não detectado\n";
        }

        // Formata PM2 (Process Manager)
        if (packages.pm2) {
            result += "- PM2 (Process Manager): ";
            result += `${packages.pm2.details}`;
            result += "\n";
        } else {
            result += "- PM2 (Process Manager): Não detectado\n";
        }

        // Formata AWS CLI (S3)
        if (packages.awsCLI) {
            result += "- AWS CLI (S3): ";
            result += `${packages.awsCLI.details}`;
            if (packages.awsCLI.buckets && packages.awsCLI.buckets.length > 0) {
                result += `, ${packages.awsCLI.buckets.length} buckets disponíveis`;
            }
        } else {
            result += "- AWS CLI (S3): Não detectado";
        }

        return result;
    }

    async listDirectory(dirPath = '.') {
        try {
            const absolutePath = path.resolve(dirPath);
            const entries = await fs.readdir(absolutePath, { withFileTypes: true });
            const items = entries.map(entry => ({
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                path: path.join(absolutePath, entry.name),
            })).sort((a,b) => { // Sort directories first, then files, then alphabetically
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            });

            return {
                currentPath: absolutePath,
                parent: path.dirname(absolutePath),
                items,
            };
        } catch (error) {
            console.error(`❌ Erro ao listar diretório ${dirPath}:`, error.message);
            throw error; // Re-throw para ser tratado pelo chamador
        }
    }

    async readFile(filePath) {
        try {
            const absolutePath = path.resolve(filePath);
            return await fs.readFile(absolutePath, 'utf8');
        } catch (error) {
            console.error(`❌ Erro ao ler arquivo ${filePath}:`, error.message);
            throw error;
        }
    }

    async editFile(filePath) {
        const absolutePath = path.resolve(filePath);
        let currentContent = '';
        try {
            currentContent = await fs.readFile(absolutePath, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`📝 Arquivo não existe. Será criado: ${absolutePath}`);
            } else {
                console.error(`❌ Erro ao ler arquivo para edição ${absolutePath}:`, error.message);
                throw error;
            }
        }

        const tempDir = os.tmpdir();
        const tempFileName = `mcp-edit-${Date.now()}-${path.basename(absolutePath)}`;
        const tempFilePath = path.join(tempDir, tempFileName);

        try {
            await fs.writeFile(tempFilePath, currentContent, 'utf8');

            const editor = process.env.EDITOR || process.env.VISUAL || 'nano'; // Default to nano
            console.log(`\n✏️  Abrindo ${absolutePath} com ${editor}... (Salve e feche o editor para continuar)`);

            await new Promise((resolve, reject) => {
                const editorProcess = spawn(editor, [tempFilePath], { stdio: 'inherit' });
                editorProcess.on('exit', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Editor ${editor} saiu com código de erro ${code}.`));
                    }
                });
                editorProcess.on('error', (err) => {
                    reject(new Error(`Falha ao iniciar o editor ${editor}: ${err.message}`));
                });
            });

            const newContent = await fs.readFile(tempFilePath, 'utf8');
            await fs.writeFile(absolutePath, newContent, 'utf8');
            console.log(`\n✅ Arquivo salvo com sucesso: ${absolutePath}`);
            return true;

        } catch (error) {
            console.error(`❌ Erro durante a edição do arquivo ${absolutePath}:`, error.message);
            throw error;
        } finally {
            // Clean up temporary file
            try {
                await fs.unlink(tempFilePath);
            } catch (e) {
                // Ignore errors during temp file cleanup, but log them
                console.warn(`⚠️  Não foi possível remover o arquivo temporário: ${tempFilePath}`, e.message);
            }
        }
    }


    async removeItem(itemPath) {
        try {
            const absolutePath = path.resolve(itemPath);
            const stats = await fs.stat(absolutePath);

            if (stats.isDirectory()) {
                await fs.rm(absolutePath, { recursive: true, force: true });
                return { success: true, type: 'directory' };
            } else {
                await fs.unlink(absolutePath);
                return { success: true, type: 'file' };
            }
        } catch (error) {
            console.error(`❌ Erro ao remover item ${itemPath}:`, error.message);
            throw error;
        }
    }

    async getItemInfo(itemPath) {
        try {
            const absolutePath = path.resolve(itemPath);
            const stats = await fs.stat(absolutePath);
            const info = {
                path: absolutePath,
                name: path.basename(absolutePath),
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                accessed: stats.atime,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
                permissions: (stats.mode & 0o777).toString(8), // More reliable permission string
            };

            if (info.isDirectory) {
                try {
                    const entries = await fs.readdir(absolutePath);
                    info.contents = entries.length;
                } catch (e) {
                    info.contents = 'N/A';
                    info.error = `Sem permissão para ler conteúdo de ${absolutePath}`;
                }
            }
            return info;
        } catch (error) {
            console.error(`❌ Erro ao obter informações de ${itemPath}:`, error.message);
            throw error;
        }
    }
}

// CLI
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
🤖 MCP Terminal Assistant

USO:
  ask "sua pergunta sobre comando linux"
  ask --history                    # Ver histórico dos últimos 10 comandos
  ask --system-info                # Informações do sistema detectadas
  ask --provider-info              # Informações do provedor de IA atual
  ask --model                      # Ver modelo de IA em uso (atalho)
  ask --web-search <on|off>        # Ativar/desativar busca na web
  ask --web-status                 # Ver status da busca na web
  ask --scrape <url>               # Extrair conteúdo de uma página web
  ask --crawl <url> [--limit N]    # Rastrear um site web (limite opcional)
  ask --firecrawl-key <key>        # Configurar chave API do Firecrawl

OPERAÇÕES DE ARQUIVOS:
  ask --list [caminho]             # Listar conteúdo do diretório (padrão: .)
  ask --read <arquivo>             # Ler conteúdo do arquivo
  ask --edit <arquivo>             # Editar arquivo usando $EDITOR (ou nano)
  ask --delete <caminho>           # Remover arquivo ou diretório (com confirmação)
  ask --info <caminho>             # Informações detalhadas sobre arquivo/diretório

EXEMPLOS:
  ask "como listar arquivos por data de modificação"
  ask "encontrar arquivos maiores que 1GB em /var/log"
  ask --list /etc
  ask --read ~/.bashrc
  ask --edit ./meu_script.sh
        `);
        process.exit(0);
    }

    const assistant = new MCPAssistant();
    await assistant.loadConfig(); // Ensure config is loaded before proceeding

    const command = args[0].toLowerCase();
    const commandArg = args[1];

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // Função de confirmação usando promises
    const askConfirmation = (prompt) => {
        return new Promise((resolve) => {
            rl.question(prompt, (answer) => {
                resolve(answer && (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'));
            });
        });
    };

    try {
        switch (command) {
            case '--history':
                try {
                    const historyData = await fs.readFile(HISTORY_PATH, 'utf8');
                    const history = JSON.parse(historyData);
                    console.log('\n📚 Últimos comandos sugeridos (até 10 mais recentes):\n');
                    history.slice(0, 10).forEach((entry, i) => {
                        console.log(`${i + 1}. Pergunta: ${entry.question}`);
                        console.log(`   💻 Comando: ${entry.command}`);
                        console.log(`   📅 Data: ${new Date(entry.timestamp).toLocaleString()}`);
                        if (entry.provider) console.log(`   🤖 Provedor: ${entry.provider}`);
                        if (entry.system) console.log(`   🖥️  Sistema: ${entry.system}`);
                        console.log('');
                    });
                } catch (err) {
                    if (err.code === 'ENOENT') console.log('Nenhum histórico encontrado.');
                    else console.error('❌ Erro ao ler histórico:', err.message);
                }
                break;

            case '--system-info':
                console.log('\n🖥️  Informações do Sistema Detectadas:\n');
                console.log(JSON.stringify(assistant.systemDetector.getSystemContext(), null, 2));
                break;

            case '--provider-info':
                const providerInfo = assistant.getProviderInfo();
                console.log('\n╔══════════════════════════════════════════╗');
                console.log('║      🤖 CONFIGURAÇÃO DE IA ATUAL        ║');
                console.log('╚══════════════════════════════════════════╝\n');
                console.log(`📦 Provedor: ${providerInfo.provider}`);
                console.log(`🧠 Modelo: ${providerInfo.model}`);
                console.log(`🔑 API Key: ${providerInfo.apiKeyConfigured ? '✅ Configurada' : '❌ Não configurada'}`);
                console.log(`🌐 Web Search: ${providerInfo.webSearchEnabled ? '✅ Ativado' : '⚪ Desativado'}`);
                console.log(`🔥 Firecrawl: ${providerInfo.firecrawlConfigured ? '✅ Configurado' : '⚪ Não configurado'}`);
                console.log('\n💡 Dicas:');
                console.log('   • Para mudar o modelo: edite ~/.mcp-terminal/config.json');
                console.log('   • Para web search: ask --web-search on/off');
                console.log('   • Para ver todos os comandos: ask --help');
                break;

            case '--model':
                const modelInfo = assistant.getProviderInfo();
                console.log(`\n🧠 Modelo de IA: ${modelInfo.provider} - ${modelInfo.model}`);
                if (!modelInfo.apiKeyConfigured) {
                    console.log('⚠️  API Key não configurada!');
                }
                break;

            case '--web-search':
                if (!commandArg || (commandArg !== 'on' && commandArg !== 'off')) {
                    console.log('❌ Uso: ask --web-search <on|off>');
                    break;
                }

                try {
                    // Read current config
                    const configData = await fs.readFile(CONFIG_PATH, 'utf8');
                    const config = JSON.parse(configData);

                    // Ensure web_search section exists
                    if (!config.web_search) {
                        config.web_search = {
                            enabled: false,
                            cache_settings: {
                                documentation: 7,
                                error_solutions: 1,
                                package_info: 0.04,
                                man_pages: 30
                            },
                            priority_sources: [
                                "man_pages",
                                "official_docs",
                                "github_issues",
                                "stackoverflow"
                            ],
                            rate_limit_per_hour: 50
                        };
                    }

                    // Update enabled setting
                    config.web_search.enabled = (commandArg === 'on');

                    // Save updated config
                    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

                    // Update current instance
                    assistant.config.web_search = config.web_search;

                    // Initialize or clear web searcher as needed
                    if (commandArg === 'on' && !assistant.webSearcher) {
                        assistant.webSearcher = new WebSearcher(config.web_search);
                        console.log('🌐 Busca na web ativada e inicializada');
                    } else if (commandArg === 'off' && assistant.webSearcher) {
                        assistant.webSearcher = null;
                        console.log('🌐 Busca na web desativada');
                    } else {
                        console.log(`🌐 Busca na web ${commandArg === 'on' ? 'ativada' : 'desativada'}`);
                    }
                } catch (error) {
                    console.error('❌ Erro ao atualizar configuração de busca na web:', error.message);
                }
                break;

            case '--web-status':
                if (assistant.config.web_search && assistant.config.web_search.enabled) {
                    console.log('\n🌐 Status da Busca na Web: ATIVADA\n');
                    console.log('Configurações:');
                    console.log(JSON.stringify(assistant.config.web_search, null, 2));

                    // Check if Firecrawl is configured
                    if (assistant.webSearcher && assistant.webSearcher.isFirecrawlConfigured()) {
                        console.log('\n🔥 Firecrawl: CONFIGURADO');
                        console.log('Você pode usar os comandos --scrape e --crawl para extrair conteúdo de sites.');
                    } else {
                        console.log('\n🔥 Firecrawl: NÃO CONFIGURADO');
                        console.log('Para configurar, use: ask --firecrawl-key <sua_chave_api>');
                    }
                } else {
                    console.log('\n🌐 Status da Busca na Web: DESATIVADA\n');
                    console.log('Para ativar, use: ask --web-search on');
                }
                break;

            case '--firecrawl-key':
                if (!commandArg) {
                    console.log('❌ Uso: ask --firecrawl-key <sua_chave_api>');
                    break;
                }

                try {
                    // Read current config
                    const configData = await fs.readFile(CONFIG_PATH, 'utf8');
                    const config = JSON.parse(configData);

                    // Update Firecrawl API key
                    config.firecrawl_api_key = commandArg;

                    // Save updated config
                    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

                    console.log('✅ Chave API do Firecrawl configurada com sucesso');
                    console.log('Reinicie o MCP Assistant para aplicar as alterações');
                } catch (error) {
                    console.error('❌ Erro ao atualizar configuração do Firecrawl:', error.message);
                }
                break;

            case '--scrape':
                if (!commandArg) {
                    console.log('❌ Uso: ask --scrape <url>');
                    break;
                }

                if (!assistant.webSearcher) {
                    console.log('❌ Web search não está inicializado. Ative com: ask --web-search on');
                    break;
                }

                if (!assistant.webSearcher.isFirecrawlConfigured()) {
                    console.log('❌ Firecrawl não está configurado. Configure com: ask --firecrawl-key <sua_chave_api>');
                    break;
                }

                try {
                    console.log(`\n🔍 Extraindo conteúdo de: ${commandArg}\n`);
                    const result = await assistant.webSearcher.scrapeWebsite(commandArg);

                    if (!result.success) {
                        console.log(`❌ Erro ao extrair conteúdo: ${result.error}`);
                        break;
                    }

                    // Display the result
                    console.log('✅ Conteúdo extraído com sucesso:\n');

                    if (result.data && result.data.markdown) {
                        console.log(result.data.markdown.substring(0, 1000) + '...');
                        console.log('\n(Conteúdo truncado para exibição. Conteúdo completo disponível no objeto de resultado)');
                    } else {
                        console.log(JSON.stringify(result, null, 2));
                    }
                } catch (error) {
                    console.error('❌ Erro ao extrair conteúdo:', error.message);
                }
                break;

            case '--crawl':
                if (!commandArg) {
                    console.log('❌ Uso: ask --crawl <url> [--limit N]');
                    break;
                }

                if (!assistant.webSearcher) {
                    console.log('❌ Web search não está inicializado. Ative com: ask --web-search on');
                    break;
                }

                if (!assistant.webSearcher.isFirecrawlConfigured()) {
                    console.log('❌ Firecrawl não está configurado. Configure com: ask --firecrawl-key <sua_chave_api>');
                    break;
                }

                try {
                    // Parse limit if provided
                    let limit = 10; // Default limit
                    const limitArg = args.find(arg => arg.startsWith('--limit'));
                    if (limitArg) {
                        const limitValue = limitArg.split(' ')[1] || args[args.indexOf(limitArg) + 1];
                        if (limitValue && !isNaN(parseInt(limitValue))) {
                            limit = parseInt(limitValue);
                        }
                    }

                    console.log(`\n🔍 Rastreando site: ${commandArg} (limite: ${limit} páginas)\n`);
                    const result = await assistant.webSearcher.crawlWebsite(commandArg, { limit });

                    if (!result.success) {
                        console.log(`❌ Erro ao rastrear site: ${result.error}`);
                        break;
                    }

                    // Display the result
                    console.log('✅ Site rastreado com sucesso:\n');

                    if (result.data && result.data.pages) {
                        console.log(`Páginas rastreadas: ${result.data.pages.length}`);
                        result.data.pages.slice(0, 5).forEach((page, index) => {
                            console.log(`\n${index + 1}. ${page.url}`);
                            if (page.title) console.log(`   Título: ${page.title}`);
                            if (page.markdown) console.log(`   Conteúdo: ${page.markdown.substring(0, 100)}...`);
                        });

                        if (result.data.pages.length > 5) {
                            console.log('\n(Exibindo apenas as 5 primeiras páginas)');
                        }
                    } else {
                        console.log(JSON.stringify(result, null, 2));
                    }
                } catch (error) {
                    console.error('❌ Erro ao rastrear site:', error.message);
                }
                break;

            case '--list':
            case '-l':
                const dirPath = commandArg || '.';
                const listing = await assistant.listDirectory(dirPath);
                console.log(`\n📂 Conteúdo de: ${listing.currentPath}\n`);
                console.log(`   ../ (${path.basename(listing.parent)})`); // Parent directory
                listing.items.forEach(item => {
                    console.log(`   ${item.type === 'directory' ? '📁' : '📄'} ${item.name}${item.type === 'directory' ? '/' : ''}`);
                });
                console.log(`\nTotal: ${listing.items.length} itens`);
                break;

            case '--read':
            case '-r':
                if (!commandArg) throw new Error('Caminho do arquivo não especificado para --read.');
                const content = await assistant.readFile(commandArg);
                console.log(`\n📄 Conteúdo de: ${path.resolve(commandArg)}\n${'-'.repeat(50)}\n${content}\n${'-'.repeat(50)}`);
                break;

            case '--edit':
            case '-e':
                if (!commandArg) throw new Error('Caminho do arquivo não especificado para --edit.');
                await assistant.editFile(commandArg);
                break;

            case '--delete':
            case '-d':
                if (!commandArg) throw new Error('Caminho não especificado para --delete.');
                const itemInfoForDelete = await assistant.getItemInfo(commandArg);
                const itemType = itemInfoForDelete.isDirectory ? 'diretório' : 'arquivo';
                console.log(`\n⚠️  Você está prestes a excluir o ${itemType}: ${itemInfoForDelete.path}`);
                if (itemInfoForDelete.isDirectory && itemInfoForDelete.contents > 0) {
                    console.log(`Este diretório contém ${itemInfoForDelete.contents} item(ns) que também serão excluídos.`);
                }
                const confirmedDelete = await askConfirmation('Tem certeza que deseja excluir? (y/N): ');
                if (confirmedDelete) {
                    await assistant.removeItem(commandArg);
                    console.log(`\n✅ ${itemType.charAt(0).toUpperCase() + itemType.slice(1)} removido com sucesso.`);
                } else {
                    console.log('Operação cancelada.');
                }
                break;

            case '--info':
            case '-i':
                if (!commandArg) throw new Error('Caminho não especificado para --info.');
                const info = await assistant.getItemInfo(commandArg);
                console.log(`\n📊 Informações de: ${info.path}\n`);
                Object.entries(info).forEach(([key, value]) => {
                    if (value instanceof Date) value = value.toLocaleString();
                    if (key === 'error' && value) console.log(`   ❗ ${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`);
                    else if (key !== 'error') console.log(`   ${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`);
                });
                break;

            default: // Assume it's a question for the AI
                const question = args.join(' ');
                console.log('\n🤔 Analisando sua pergunta com a IA...\n');
                console.log('📝 Pergunta completa:', question);

                let response = null;
                let success = false;

                try {
                    console.log('🔄 Chamando assistant.askCommand()...');
                    response = await assistant.askCommand(question);
                    console.log('✅ Resposta recebida do assistant.askCommand()');

                    if (!response) {
                        console.log('⚠️ Resposta vazia recebida do assistant.askCommand()');
                        console.log('❌ Não foi possível obter uma resposta da IA. Por favor, tente novamente.');
                    } else {
                        // Imprimir a resposta diretamente para o usuário com formatação adequada
                        console.log('\n' + response + '\n');
                        success = true;
                    }
                } catch (error) {
                    console.error('❌ Erro ao chamar assistant.askCommand():', error);
                    console.error('Stack trace:', error.stack);
                    console.log('❌ Ocorreu um erro ao processar sua pergunta. Por favor, tente novamente.');
                }

                // Extract command using a more specific regex for the ```bash ... ``` block or the `COMANDO: \`...\`` format
                let extractedCommand = null;

                if (success && response) {
                    const bashBlockMatch = response.match(/```bash\s*([\s\S]+?)\s*```/m);
                    if (bashBlockMatch && bashBlockMatch[1]) {
                        extractedCommand = bashBlockMatch[1].trim();
                    } else {
                        const legacyCommandMatch = response.match(/🔧 COMANDO:\s*`([^`]+)`/m);
                        if (legacyCommandMatch && legacyCommandMatch[1]) {
                            extractedCommand = legacyCommandMatch[1].trim();
                        }
                    }
                }

                if (extractedCommand) {
                    // Sanitize command a bit (remove potential leading ./ or bash )
                    extractedCommand = extractedCommand.replace(/^(\.\/|bash\s+-c\s+['"]|bash\s+)/, '').replace(/['"]$/, '');

                    await assistant.saveCommandHistory(question, extractedCommand);
                    const confirmedExecute = await askConfirmation(`\n❓ Deseja executar o comando sugerido: \`${extractedCommand}\` ? (y/N): `);
                    if (confirmedExecute) {
                        console.log(`\n▶️  Executando: ${extractedCommand}\n`);
                        try {
                            execSync(extractedCommand, { stdio: 'inherit' });
                        } catch (execError) {
                            console.error(`\n❌ Erro ao executar comando: ${execError.message}`);
                            // execSync throws on non-zero exit, which is often not an "error" in shell sense
                            // but rather the command finished with a specific status.
                            // stderr is already inherited, so specific error details from the command should be visible.
                        }
                    } else {
                        console.log('Comando não executado.');
                    }
                } else {
                    console.log('\nℹ️ Não foi possível extrair um comando executável da resposta.');
                }
                break;
        }
    } catch (error) {
        console.error(`\n❌ Erro inesperado na operação: ${error.message}`);
        // console.error(error.stack); // Uncomment for more detailed debug info
        process.exitCode = 1; // Set exit code to indicate failure
    } finally {
        rl.close();
    }
}

// Ensure main is called only when script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(err => {
        console.error("❌ Falha crítica no script:", err);
        process.exit(1);
    });
}

export default MCPAssistant;
