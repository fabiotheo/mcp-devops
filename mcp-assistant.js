#!/usr/bin/env node
// ~/.mcp-terminal/mcp-assistant.js

import { Anthropic } from '@anthropic-ai/sdk';
import SystemDetector from './system_detector.js';
import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs'; // Keep for sync ops if any, or specific needs
import path from 'path';
import { execSync, spawn } from 'child_process';
import ModelFactory from './ai_models/model_factory.js';
import readline from 'readline';
import os from 'os'; // For tmpdir and EOL

const CONFIG_PATH = path.join(process.env.HOME, '.mcp-terminal/config.json');
const HISTORY_PATH = path.join(process.env.HOME, '.mcp-terminal/command-history.json');

class MCPAssistant {
    constructor() {
        this.configPath = CONFIG_PATH;
        this.systemDetector = new SystemDetector();
        this.aiModel = null;
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
            const systemContext = this.systemDetector.getSystemContext();
            const currentDir = process.cwd();
            const dirInfo = await this.getCurrentDirectoryInfo();

            if (this.aiModel && !this.usingFallbackAI) {
                return await this.aiModel.askCommand(question, {
                    ...systemContext,
                    currentDir,
                    dirInfo,
                });
            }

            // Fallback para o sistema antigo (Claude direto via Anthropic SDK)
            if (!this.anthropic) {
                return '❌ Erro: Cliente Anthropic (fallback) não inicializado. Verifique sua API key.';
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

DIRETÓRIO ATUAL: ${currentDir}
${dirInfo}

COMANDOS DISPONÍVEIS NESTE SISTEMA (amostra ou relevantes, se aplicável):
${systemContext.commands && systemContext.commands.length > 0 ? JSON.stringify(systemContext.commands.slice(0, 20), null, 2) + (systemContext.commands.length > 20 ? "\n(e mais...)" : "") : "Não especificado"}

PERGUNTA DO USUÁRIO: ${question}

INSTRUÇÕES:
1. Analise a pergunta considerando o sistema específico do usuário.
2. Forneça o comando exato para a distribuição/sistema detectado.
3. Explique brevemente o que o comando faz.
4. Se houver variações por distribuição, mencione isso.
5. Inclua opções úteis do comando.
6. Se apropriado, sugira comandos relacionados.

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
