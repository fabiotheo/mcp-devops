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
        if (!this.aiModel && !this.anthropic) {
            // This might happen if loadConfig hasn't completed or failed critically
            await this.loadConfig(); // Ensure config is loaded
        }

        try {
            let systemContext = this.systemDetector.getSystemContext();
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
                // Ensure we have the installed packages information
                if (!systemContext.installedPackages) {
                    this.systemDetector.detectInstalledPackages();
                    // Update systemContext with the latest information
                    systemContext = this.systemDetector.getSystemContext();
                }

                return await this.aiModel.askCommand(question, {
                    ...systemContext,
                    currentDir,
                    dirInfo,
                    formattedPackages: this.formatInstalledPackages(systemContext.installedPackages),
                    webSearchResults: webSearchResults
                });
            }

            // Fallback para o sistema antigo (Claude direto via Anthropic SDK)
            if (!this.anthropic) {
                return '❌ Erro: Cliente Anthropic (fallback) não inicializado. Verifique sua API key.';
            }

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

Responda de forma direta e prática. Se o comando for multi-linha, coloque cada parte em uma nova linha dentro do bloco de código bash.`;

            const modelToUse = this.config.claude_model || this.config.model || "claude-3-sonnet-20240229"; // Exemplo de nome de modelo válido
            const response = await this.anthropic.messages.create({
                model: modelToUse,
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }],
            });

            return response.content[0].text;
        } catch (error) {
            console.error('❌ Erro ao consultar assistente:', error.message);
            return '❌ Erro ao conectar com o assistente. Verifique sua configuração e a API key.';
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
        if (this.aiModel && !this.usingFallbackAI) {
            return {
                provider: this.aiModel.getProviderName(),
                model: this.aiModel.getModelName(),
            };
        }
        return {
            provider: 'Anthropic (Fallback)',
            model: this.config.claude_model || this.config.model || "claude-3-sonnet-20240229",
        };
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
        } else {
            result += "- Ferramentas de Monitoramento: Nenhuma detectada";
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

    const askConfirmation = (prompt) => {
        return new Promise((resolve) => {
            rl.question(prompt, (answer) => {
                resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
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
                console.log('\n🤖 Provedor de IA Configurado:\n');
                console.log(`   Provedor: ${providerInfo.provider}`);
                console.log(`   Modelo: ${providerInfo.model}`);
                console.log('\nPara alterar, edite seu config.json ou execute: mcp-setup --configure-model');
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
                const response = await assistant.askCommand(question);
                console.log(response);

                // Extract command using a more specific regex for the ```bash ... ``` block or the `COMANDO: \`...\`` format
                let extractedCommand = null;
                const bashBlockMatch = response.match(/```bash\s*([\s\S]+?)\s*```/m);
                if (bashBlockMatch && bashBlockMatch[1]) {
                    extractedCommand = bashBlockMatch[1].trim();
                } else {
                    const legacyCommandMatch = response.match(/🔧 COMANDO:\s*`([^`]+)`/m);
                    if (legacyCommandMatch && legacyCommandMatch[1]) {
                        extractedCommand = legacyCommandMatch[1].trim();
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
if (import.meta.url.startsWith('file:') && process.argv[1] === import.meta.url.substring('file:'.length)) {
    main().catch(err => {
        console.error("❌ Falha crítica no script:", err);
        process.exit(1);
    });
}

export default MCPAssistant;
