#!/usr/bin/env node

import readline from 'readline';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import ModelFactory from './ai_models/model_factory.js';
import SystemDetector from './system_detector.js';
import AICommandOrchestrator from './ai_orchestrator.js';
import AICommandOrchestratorWithTools from './ai_orchestrator_tools.js';
import AICommandOrchestratorBash from './ai_orchestrator_bash.js';
import PersistentHistory from './libs/persistent-history.js';
import KeybindingManager from './libs/keybinding-manager.js';
import MultiLineInput from './libs/multiline-input.js';
import { orchestrationAnimator } from './libs/orchestration-animator.js';

class ContextManager {
    constructor(maxTokens = 100000) {
        this.messages = [];
        this.maxTokens = maxTokens;
        this.summary = null;
        this.tokenEstimate = 0;
    }

    addMessage(role, content) {
        this.messages.push({
            role,
            content,
            timestamp: new Date()
        });
        this.optimizeIfNeeded();
    }

    getContext(format = 'array') {
        if (this.summary) {
            return [
                { role: 'system', content: this.summary },
                ...this.messages.slice(-10)
            ];
        }
        return this.messages;
    }

    estimateTokens(text) {
        // Estimativa simples: ~4 caracteres por token
        return Math.ceil(text.length / 4);
    }

    getTokenCount() {
        let total = 0;
        for (const msg of this.messages) {
            total += this.estimateTokens(msg.content);
        }
        if (this.summary) {
            total += this.estimateTokens(this.summary);
        }
        return total;
    }

    optimizeIfNeeded() {
        const tokenCount = this.getTokenCount();
        if (tokenCount > this.maxTokens * 0.8) {
            this.summarizeOldMessages();
        }
    }

    async summarizeOldMessages() {
        // Mantém últimas 20 mensagens + cria summary das antigas
        if (this.messages.length > 20) {
            const toSummarize = this.messages.slice(0, -20);
            const summaryContent = toSummarize.map(m =>
                `${m.role}: ${m.content.substring(0, 100)}...`
            ).join('\n');

            this.summary = `Resumo de conversas anteriores (${toSummarize.length} mensagens):\n${summaryContent}`;
            this.messages = this.messages.slice(-20);
        }
    }

    reset() {
        this.messages = [];
        this.summary = null;
        this.tokenEstimate = 0;
    }

    getHistory(limit = 10) {
        const recent = this.messages.slice(-limit);
        return recent.map(msg => ({
            role: msg.role,
            content: msg.content,
            time: msg.timestamp.toLocaleTimeString()
        }));
    }
}

class CommandProcessor {
    constructor(mcpInteractive) {
        this.mcp = mcpInteractive;
        this.commands = {
            '/help': this.showHelp.bind(this),
            '/shortcuts': this.showShortcuts.bind(this),
            '/clear': this.clearScreen.bind(this),
            '/reset': this.resetContext.bind(this),
            '/save': this.saveSession.bind(this),
            '/load': this.loadSession.bind(this),
            '/model': this.changeModel.bind(this),
            '/exec': this.executeCommand.bind(this),
            '/history': this.showHistory.bind(this),
            '/version': this.showVersion.bind(this),
            '/exit': this.exit.bind(this),
            '/quit': this.exit.bind(this)
        };
    }

    async execute(input) {
        const [command, ...args] = input.split(' ');
        const handler = this.commands[command];

        if (!handler) {
            return chalk.red(`Comando desconhecido: ${command}. Digite /help para ajuda.`);
        }

        return await handler(args.join(' '));
    }

    async showHelp() {
        const help = `
${chalk.cyan('═══ Comandos Disponíveis ═══')}

${chalk.yellow('/help')}      - Mostra esta ajuda
${chalk.yellow('/shortcuts')} - Mostra atalhos de teclado
${chalk.yellow('/clear')}     - Limpa a tela (mantém contexto)
${chalk.yellow('/reset')}     - Reinicia o contexto da conversa
${chalk.yellow('/save')} [nome] - Salva a sessão atual
${chalk.yellow('/load')} [nome] - Carrega uma sessão salva
${chalk.yellow('/model')}     - Mostra/altera o modelo de IA
${chalk.yellow('/exec')}      - Executa o último comando sugerido
${chalk.yellow('/history')}   - Mostra histórico da sessão
${chalk.yellow('/version')}   - Mostra informações da versão
${chalk.yellow('/exit')}      - Sai do modo interativo

${chalk.cyan('═══ Dicas ═══')}

• Digite ${chalk.green('"""')} para entrada multi-linha
• Use ${chalk.green('Tab')} para auto-completar comandos
• Sessões são salvas automaticamente a cada 5 minutos
• AI Orchestration está ${chalk.green('ativado')} para perguntas complexas
• Digite ${chalk.cyan('/shortcuts')} para ver atalhos de teclado
`;
        return help;
    }

    async showShortcuts() {
        const shortcuts = `
${chalk.cyan('═══ Atalhos de Teclado ═══')}

${chalk.blue('Comandos Básicos:')}
${chalk.yellow('ESC')}        - Cancela o input atual
${chalk.yellow('Ctrl+C')}     - Força saída da aplicação
${chalk.yellow('Ctrl+D')}     - Finaliza input multi-linha
${chalk.yellow('Ctrl+L')}     - Limpa a tela
${chalk.yellow('Ctrl+U')}     - Apaga toda a linha
${chalk.yellow('Ctrl+K')}     - Apaga até o fim da linha
${chalk.yellow('Ctrl+W')}     - Apaga palavra anterior

${chalk.blue('Navegação:')}
${chalk.yellow('↑ / ↓')}      - Navega pelo histórico ${chalk.green('(persistente)')}
${chalk.yellow('Ctrl+A')}     - Move para início da linha
${chalk.yellow('Ctrl+E')}     - Move para fim da linha
${chalk.yellow('Tab')}        - Auto-completa comandos

${chalk.blue('Multi-linha:')}
${chalk.yellow('"""')}        - Inicia/termina bloco multi-linha
${chalk.yellow('\\')} no fim   - Continua na próxima linha

${chalk.gray('Use /help para mais comandos')}
`;
        return shortcuts;
    }

    async clearScreen() {
        console.clear();
        return chalk.green('✓ Tela limpa (contexto mantido)');
    }

    async resetContext() {
        this.mcp.contextManager.reset();
        this.mcp.sessionPermissions.clear();  // Limpa permissões ao resetar contexto
        return chalk.green('✓ Contexto e permissões reiniciados');
    }

    async saveSession(name) {
        if (!name) {
            name = `session-${Date.now()}`;
        }
        await this.mcp.sessionPersistence.save(name, this.mcp.contextManager.getContext());
        return chalk.green(`✓ Sessão salva como: ${name}`);
    }

    async loadSession(name) {
        if (!name) {
            return chalk.red('Por favor, especifique o nome da sessão');
        }
        try {
            const context = await this.mcp.sessionPersistence.load(name);
            this.mcp.contextManager.messages = context;
            return chalk.green(`✓ Sessão '${name}' carregada`);
        } catch (error) {
            return chalk.red(`Erro ao carregar sessão: ${error.message}`);
        }
    }

    async changeModel(modelName) {
        if (!modelName) {
            const info = await this.mcp.aiModel.getProviderInfo();
            return chalk.cyan(`Modelo atual: ${info.model}\nProvedor: ${info.provider}`);
        }
        // TODO: Implementar troca de modelo
        return chalk.yellow('Troca de modelo será implementada em breve');
    }

    async executeCommand() {
        // TODO: Implementar execução do último comando
        return chalk.yellow('Execução de comando será implementada em breve');
    }

    async showHistory() {
        const history = this.mcp.contextManager.getHistory();
        if (history.length === 0) {
            return chalk.yellow('Histórico vazio');
        }

        let output = chalk.cyan('\n═══ Histórico da Sessão ═══\n\n');
        for (const msg of history) {
            const roleColor = msg.role === 'user' ? chalk.blue : chalk.green;
            output += `${roleColor(`[${msg.time}] ${msg.role}:`)} ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}\n`;
        }
        return output;
    }

    async showVersion() {
        const version = this.mcp.version || '1.0.22';
        const systemInfo = this.mcp.systemDetector?.getSystemInfo() || {};
        const providerInfo = this.mcp.aiModel?.getProviderInfo() || {};

        const versionInfo = `
${chalk.cyan('═══ Informações da Versão ═══')}

${chalk.blue('▶ MCP Terminal:')} v${version}
${chalk.blue('▶ Sistema:')} ${systemInfo.os || 'Unknown'} ${systemInfo.distro || ''}
${chalk.blue('▶ IA Model:')} ${providerInfo.model || 'Not configured'}
${chalk.blue('▶ AI Orchestration:')} ${chalk.green('Enabled')}
${chalk.blue('▶ Node.js:')} ${process.version}

${chalk.gray('© 2024 IPCOM - AI Tool for Linux')}
`;
        return versionInfo;
    }

    async exit() {
        await this.mcp.shutdown();
        return null; // Sinaliza saída
    }
}

class SessionPersistence {
    constructor(sessionDir = null) {
        this.sessionDir = sessionDir || path.join(os.homedir(), '.mcp-terminal', 'sessions');
        this.autoSaveTimer = null;
        this.ensureDir();
    }

    async ensureDir() {
        if (!existsSync(this.sessionDir)) {
            await fs.mkdir(this.sessionDir, { recursive: true });
        }
    }

    async save(sessionName, context) {
        const filePath = path.join(this.sessionDir, `${sessionName}.json`);
        const data = {
            version: '1.0',
            timestamp: new Date(),
            context: context,
            metadata: {
                messageCount: context.length
            }
        };
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    async load(sessionName) {
        const filePath = path.join(this.sessionDir, `${sessionName}.json`);
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
        return data.context;
    }

    async listSessions() {
        const files = await fs.readdir(this.sessionDir);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    }

    enableAutoSave(sessionName, contextManager, interval = 300000) {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }

        this.autoSaveTimer = setInterval(async () => {
            try {
                await this.save(sessionName, contextManager.getContext());
            } catch (error) {
                console.error(chalk.red('Erro no auto-save:', error.message));
            }
        }, interval);
    }

    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }
}

class REPLInterface extends EventEmitter {
    constructor() {
        super();
        this.rl = null;
        this.multilineBuffer = '';
        this.inMultiline = false;
        this.multilineInput = null;
        this.keybindingManager = null;
    }

    initialize() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.cyan('mcp> '),
            completer: this.autoComplete.bind(this),
            terminal: true
        });

        // Inicializa MultiLineInput
        this.multilineInput = new MultiLineInput({
            blockDelimiter: '"""',
            continuationChar: '\\',
            continuationPrompt: chalk.gray('... '),
            normalPrompt: chalk.cyan('mcp> ')
        });

        // Inicializa KeybindingManager
        this.keybindingManager = new KeybindingManager(this.rl, {
            bindings: {
                escape: 'escape',
                clearLine: 'ctrl+u',
                clearScreen: 'ctrl+l'
            }
        });
        this.keybindingManager.initialize();

        // Handler para cancelamento com ESC
        this.keybindingManager.on('cancel', () => {
            if (this.multilineInput.cancel()) {
                this.rl.setPrompt(chalk.cyan('mcp> '));
                this.rl.prompt();
            }
        });

        // Detecta quando o usuário digita "/" para mostrar comandos
        let commandMenuShown = false;
        let lastLineLength = 0;

        this.rl.on('keypress', (char, key) => {
            const currentLine = this.rl.line;

            // Quando digitar "/" no início da linha
            if (char === '/' && currentLine === '') {
                // Aguarda o caractere ser adicionado à linha
                setImmediate(() => {
                    if (this.rl.line === '/' && !commandMenuShown) {
                        // Mostra o menu de comandos automaticamente
                        const commands = {
                            '/help': 'Mostrar ajuda e comandos disponíveis',
                            '/shortcuts': 'Mostrar atalhos de teclado',
                            '/clear': 'Limpar a tela',
                            '/reset': 'Resetar contexto da conversa',
                            '/save': 'Salvar sessão atual',
                            '/load': 'Carregar sessão salva',
                            '/model': 'Mudar modelo de IA',
                            '/exec': 'Executar comando direto',
                            '/history': 'Mostrar histórico',
                            '/exit': 'Sair do programa',
                            '/quit': 'Sair do programa'
                        };

                        console.log('\n' + chalk.cyan('═══ Comandos Disponíveis ═══'));
                        for (const [cmd, desc] of Object.entries(commands)) {
                            console.log(chalk.yellow(cmd.padEnd(12)) + chalk.gray(' - ' + desc));
                        }
                        console.log(chalk.cyan('═══════════════════════════════') + '\n');

                        // Reposiciona o cursor e mantém o "/" na linha
                        this.rl.prompt(true);
                        commandMenuShown = true;
                    }
                });
            }

            // Se continuar digitando após "/", filtra os comandos
            if (currentLine.startsWith('/') && currentLine.length > 1 && commandMenuShown) {
                setImmediate(() => {
                    const commands = {
                        '/help': 'Mostrar ajuda e comandos disponíveis',
                        '/shortcuts': 'Mostrar atalhos de teclado',
                        '/clear': 'Limpar a tela',
                        '/reset': 'Resetar contexto da conversa',
                        '/save': 'Salvar sessão atual',
                        '/load': 'Carregar sessão salva',
                        '/model': 'Mudar modelo de IA',
                        '/exec': 'Executar comando direto',
                        '/history': 'Mostrar histórico',
                        '/exit': 'Sair do programa',
                        '/quit': 'Sair do programa'
                    };

                    const filtered = Object.entries(commands).filter(([cmd]) =>
                        cmd.startsWith(this.rl.line)
                    );

                    if (filtered.length > 0 && filtered.length < Object.keys(commands).length) {
                        // Limpa as linhas anteriores do menu (estimativa)
                        process.stdout.write('\x1B[2K\x1B[1A'.repeat(13));

                        console.log('\n' + chalk.cyan('═══ Comandos Filtrados ═══'));
                        for (const [cmd, desc] of filtered) {
                            const typed = this.rl.line;
                            const remaining = cmd.slice(typed.length);
                            console.log(
                                chalk.green(typed) +
                                chalk.yellow(remaining.padEnd(12 - typed.length)) +
                                chalk.gray(' - ' + desc)
                            );
                        }
                        console.log(chalk.cyan('═══════════════════════════════') + '\n');

                        // Reposiciona o cursor
                        this.rl.prompt(true);
                    }
                });
            }

            // Reset quando limpar a linha
            if (currentLine === '' || !currentLine.startsWith('/')) {
                commandMenuShown = false;
            }

            lastLineLength = currentLine.length;
        });


        this.rl.on('line', (line) => {
            const result = this.multilineInput.processInput(line);

            if (!result.complete) {
                // Continua capturando input
                this.rl.setPrompt(result.prompt);
                if (result.message) {
                    process.stdout.write(result.message + '\n');
                }
                this.rl.prompt();
            } else {
                // Input completo, processa
                this.multilineInput.reset();
                this.rl.setPrompt(chalk.cyan('mcp> '));
                this.emit('line', result.text);
            }
        });

        this.rl.on('SIGINT', () => {
            if (this.multilineInput.isMultiline()) {
                this.multilineInput.cancel();
                this.rl.setPrompt(chalk.cyan('mcp> '));
                this.rl.prompt();
            } else {
                this.emit('interrupt');
            }
        });
    }

    autoComplete(line, callback) {
        const commands = {
            '/help': 'Mostrar ajuda e comandos disponíveis',
            '/shortcuts': 'Mostrar atalhos de teclado',
            '/clear': 'Limpar a tela',
            '/reset': 'Resetar contexto da conversa',
            '/save': 'Salvar sessão atual',
            '/load': 'Carregar sessão salva',
            '/model': 'Mudar modelo de IA',
            '/exec': 'Executar comando direto',
            '/history': 'Mostrar histórico',
            '/exit': 'Sair do programa',
            '/quit': 'Sair do programa'
        };

        const completions = Object.keys(commands);

        // Se digitou apenas "/" mostra todas as opções com descrições
        if (line === '/') {
            // Mostra menu de comandos formatado
            console.log('\n' + chalk.cyan('═══ Comandos Disponíveis ═══'));
            for (const [cmd, desc] of Object.entries(commands)) {
                console.log(chalk.yellow(cmd.padEnd(12)) + chalk.gray(' - ' + desc));
            }
            console.log(chalk.cyan('═══════════════════════════════\n'));

            // Retorna todas as completions
            if (callback) {
                callback(null, [completions, line]);
            }
            return [completions, line];
        }

        // Caso contrário, filtra baseado no que foi digitado
        const hits = completions.filter((c) => c.startsWith(line));

        // Se tem múltiplas opções e o usuário pressionou TAB
        if (hits.length > 1 && line.length > 1) {
            console.log('\n' + chalk.cyan('Opções:'));
            hits.forEach(cmd => {
                console.log(chalk.yellow(cmd) + chalk.gray(' - ' + commands[cmd]));
            });
            console.log();
        }

        if (callback) {
            callback(null, [hits.length ? hits : completions, line]);
        }
        return [hits.length ? hits : completions, line];
    }


    prompt() {
        this.rl.prompt();
    }

    close() {
        if (this.rl) {
            this.rl.close();
        }
    }

    write(text) {
        process.stdout.write(text);
    }
}

class MCPInteractive extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.contextManager = new ContextManager(config.max_context_tokens);
        this.sessionPersistence = new SessionPersistence(config.session_dir);
        this.commandProcessor = new CommandProcessor(this);
        this.replInterface = new REPLInterface();
        this.aiModel = null;
        this.systemDetector = new SystemDetector();
        this.sessionName = config.session || `session-${Date.now()}`;
        this.sessionPermissions = new Set();  // Armazena comandos já aprovados na sessão
        this.exitOnNextInterrupt = false; // Flag para saída com Ctrl+C
        this.spinnerInterval = null;
        // Spinner animado com braille patterns para efeito suave
        this.spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        // Alternativa: ['◐', '◓', '◑', '◒'] ou ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']
        this.persistentHistory = null;
        this.spinnerIndex = 0;
    }

    async initialize() {
        // Carregar versão do package.json
        try {
            const packagePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
            this.version = packageJson.version;
        } catch (error) {
            this.version = '1.0.22'; // Fallback
        }

        // Carregar configuração
        const configPath = path.join(os.homedir(), '.mcp-terminal', 'config.json');
        let modelConfig = {};

        if (existsSync(configPath)) {
            try {
                modelConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
            } catch (error) {
                console.error(chalk.yellow('Aviso: Não foi possível carregar configuração'));
            }
        }

        // Inicializar detector de sistema
        this.systemDetector = new SystemDetector();
        // SystemDetector já detecta no constructor, não precisa chamar detect()

        // Inicializar modelo de IA
        this.aiModel = await ModelFactory.createModel(modelConfig);
        await this.aiModel.initialize();

        // Criar executor de comandos desacoplado
        const commandExecutor = {
            executeCommand: this.executeCommand.bind(this)
        };

        // Escolher orquestrador baseado na configuração
        const useToolsOrchestrator = modelConfig.use_native_tools || false;
        const useBashTool = modelConfig.enable_bash_tool || false;

        if (useBashTool && this.aiModel.supportsTools && this.aiModel.supportsTools()) {
            // Usar orquestrador com ferramenta Bash
            this.commandOrchestrator = new AICommandOrchestratorBash(
                this.aiModel,
                {
                    maxIterations: modelConfig.ai_orchestration?.max_iterations || 10,
                    maxExecutionTime: modelConfig.ai_orchestration?.max_execution_time || 60000,
                    verboseLogging: modelConfig.ai_orchestration?.verbose_logging || false,
                    enableBash: true,
                    bashConfig: modelConfig.bash_config || {
                        timeout: 30000,
                        maxOutputSize: 100000,
                        workingDir: process.cwd()
                    }
                }
            );
            console.log(chalk.green('✓ Usando orquestrador com ferramenta Bash persistente'));
        } else if (useToolsOrchestrator && this.aiModel.supportsTools && this.aiModel.supportsTools()) {
            // Usar novo orquestrador com Tools nativas
            this.commandOrchestrator = new AICommandOrchestratorWithTools(
                this.aiModel,
                commandExecutor,
                {
                    maxIterations: modelConfig.ai_orchestration?.max_iterations || 10,
                    maxExecutionTime: modelConfig.ai_orchestration?.max_execution_time || 60000,
                    verboseLogging: modelConfig.ai_orchestration?.verbose_logging || false
                }
            );
            console.log(chalk.green('✓ Usando orquestrador com Tools nativas do Claude'));
        } else {
            // Usar orquestrador tradicional
            this.commandOrchestrator = new AICommandOrchestrator(
                this.aiModel,
                commandExecutor,  // Passa apenas o executor, não toda a instância
                {
                    maxIterations: modelConfig.ai_orchestration?.max_iterations || 5,
                    maxExecutionTime: modelConfig.ai_orchestration?.max_execution_time || 30000,
                    enableCache: modelConfig.ai_orchestration?.enable_cache !== false,
                    verboseLogging: modelConfig.ai_orchestration?.verbose_logging || false,
                    cacheDurationHours: modelConfig.cache_duration_hours || 1
                }
            );
        }

        // Inicializar histórico persistente
        this.persistentHistory = new PersistentHistory({
            historyFile: path.join(os.homedir(), '.mcp-terminal', 'history.json'),
            maxEntries: modelConfig.history?.max_entries || 1000,
            deduplicate: modelConfig.history?.deduplicate !== false
        });
        await this.persistentHistory.initialize();

        // Inicializar interface REPL
        this.replInterface.initialize();

        // Carregar histórico no readline APÓS inicialização
        if (this.persistentHistory.history.length > 0 && this.replInterface.rl) {
            this.persistentHistory.history.forEach(cmd => {
                this.replInterface.rl.history.push(cmd);
            });
        }

        // Configurar listeners
        this.replInterface.on('line', this.processInput.bind(this));
        this.replInterface.on('interrupt', this.handleInterrupt.bind(this));

        // Configurar auto-save
        if (this.config.auto_save !== false) {
            this.sessionPersistence.enableAutoSave(
                this.sessionName,
                this.contextManager,
                this.config.auto_save_interval || 300000
            );
        }

        // Carregar sessão se especificada
        if (this.config.resume) {
            try {
                const context = await this.sessionPersistence.load(this.config.resume);
                this.contextManager.messages = context;
                console.log(chalk.green(`✓ Sessão '${this.config.resume}' retomada`));
            } catch (error) {
                console.log(chalk.yellow(`Não foi possível retomar sessão '${this.config.resume}'`));
            }
        }
    }

    async start() {
        await this.initialize();
        this.showWelcome();
        this.replInterface.prompt();
    }

    showWelcome() {
        console.clear();

        // ASCII Art do IPCOM
        console.log(chalk.cyan(`  ___ ____   ____ ___  __  __
 |_ _|  _ \\ / ___/ _ \\|  \\/  |
  | || |_) | |  | | | | |\\/| |
  | ||  __/| |__| |_| | |  | |
 |___|_|  __\\____\\___/|_|  |_|  _    __              _     _
    / \\  |_ _| |_   _|__   ___ | |  / _| ___  _ __  | |   (_)_ __  _   ___  __
   / _ \\  | |    | |/ _ \\ / _ \\| | | |_ / _ \\| '__| | |   | | '_ \\| | | \\ \\/ /
  / ___ \\ | |    | | (_) | (_) | | |  _| (_) | |    | |___| | | | | |_| |>  <
 /_/   \\_\\___|   |_|\\___/ \\___/|_| |_|  \\___/|_|    |_____|_|_| |_|\\__,_/_/\\_\\
`));

        console.log(chalk.cyan('═'.repeat(80)));
        console.log(chalk.white.bold(`                    MCP Terminal Assistant v${this.version || '1.0.22'}`));
        console.log(chalk.yellow('                        Modo Interativo Ativado'));
        console.log(chalk.cyan('═'.repeat(80)));

        // Informações de autoria
        console.log();
        console.log(chalk.gray('👨‍💻 Desenvolvido por:'), chalk.white('Fábio Fernandes Theodoro'));
        console.log(chalk.gray('🏢 Empresa:'), chalk.white('IP COM COMÉRCIO DE EQUIPAMENTOS DE TELEFONIA LTDA'));
        console.log(chalk.gray('📧 Contato:'), chalk.white('fabio@ipcom.com.br'));
        console.log(chalk.gray('🌐 Site:'), chalk.white('https://ipcom.com.br'));
        console.log(chalk.gray('📦 GitHub:'), chalk.white('https://github.com/fabiotheo/mcp-devops'));
        console.log();
        console.log(chalk.cyan('═'.repeat(80)));
        console.log(chalk.yellow.bold('🎯 Finalidade:'));
        console.log(chalk.white('Sistema inteligente de assistência para equipes de suporte e DevOps,'));
        console.log(chalk.white('especializado em administração de servidores Linux/Unix com análise'));
        console.log(chalk.white('automática de erros e orquestração inteligente de comandos.'));
        console.log(chalk.cyan('═'.repeat(80)));
        console.log();

        // Informações do sistema
        const systemInfo = this.systemDetector.getSystemInfo();
        console.log(chalk.blue('▶ Sistema:'), chalk.white(`${systemInfo.os} ${systemInfo.distro || ''}`));

        // Informações do modelo
        const providerInfo = this.aiModel.getProviderInfo();
        console.log(chalk.blue('▶ IA Model:'), chalk.white(providerInfo.model));

        // Informações de contexto
        console.log(chalk.blue('▶ Contexto:'), chalk.white('AI Orchestration Enabled'));

        console.log();
        console.log(chalk.cyan('─'.repeat(80)));
        console.log(chalk.gray('💡 Digite'), chalk.cyan('/help'), chalk.gray('para comandos |'),
                    chalk.cyan('/shortcuts'), chalk.gray('para atalhos |'),
                    chalk.cyan('/exit'), chalk.gray('para sair'));
        console.log(chalk.cyan('─'.repeat(80)));
        console.log();
    }

    async processInput(input) {
        if (!input || input.trim() === '') {
            this.replInterface.prompt();
            return;
        }

        input = input.trim();

        // Salvar no histórico persistente
        if (this.persistentHistory && input !== '') {
            await this.persistentHistory.add(input);
        }

        // Verificar se é um comando
        if (input.startsWith('/')) {
            const result = await this.commandProcessor.execute(input);
            if (result === null) {
                // Comando de saída
                return;
            }
            console.log(result);
            this.replInterface.prompt();
            return;
        }

        // Processar pergunta normal
        await this.handleQuestion(input);
        this.replInterface.prompt();
    }

    async handleQuestion(question) {
        try {
            // Adiciona ao contexto
            this.contextManager.addMessage('user', question);

            // Verifica se deve usar orquestração inteligente
            const shouldOrchestrate = this.shouldUseOrchestration(question);

            if (shouldOrchestrate && this.config.ai_orchestration?.enabled !== false) {
                // Usa orquestração inteligente para perguntas complexas
                orchestrationAnimator.start('Iniciando análise inteligente');

                const systemInfo = this.systemDetector.getSystemInfo();
                const systemContext = {
                    ...systemInfo,
                    packageManager: systemInfo.packageManager || 'apt',
                    capabilities: this.systemDetector.getSystemCapabilities() || [],
                    commands: this.systemDetector.getSystemCommands() || {}
                };

                // Executa orquestração com animator
                const result = await this.commandOrchestrator.orchestrateExecution(question, systemContext, orchestrationAnimator);

                // Para a animação
                orchestrationAnimator.stop(result.success ? 'Análise concluída com sucesso!' : 'Análise concluída');

                if (result.success && (result.directAnswer || result.finalAnswer)) {
                    // PRIMEIRO: Mostra resposta direta e clara
                    if (result.directAnswer) {
                        console.log();
                        console.log(chalk.cyan('═══════════════════════════════════════════════════════'));
                        console.log(chalk.bold.white('📊 RESPOSTA:'));
                        console.log(chalk.cyan('───────────────────────────────────────────────────────'));
                        console.log();
                        console.log(chalk.white(result.directAnswer));
                        console.log();
                        console.log(chalk.cyan('═══════════════════════════════════════════════════════'));

                        // Adiciona ao contexto
                        this.contextManager.addMessage('assistant', result.directAnswer);
                    }

                    // SEGUNDO: Mostra detalhes técnicos (se houver)
                    if (result.technicalDetails || result.executedCommands.length > 0) {
                        console.log();
                        console.log(chalk.gray('📝 Detalhes Técnicos:'));

                        // Comandos executados
                        if (result.executedCommands.length > 0) {
                            console.log(chalk.gray(`  • Comandos executados: ${result.executedCommands.join(', ')}`));
                        }

                        // Métricas
                        if (result.metadata) {
                            console.log(chalk.gray(`  • Tempo: ${(result.duration / 1000).toFixed(1)}s`));
                            if (result.metadata.cacheHits > 0) {
                                console.log(chalk.gray(`  • Cache hits: ${result.metadata.cacheHits}`));
                            }
                        }

                        // Resumo técnico
                        if (result.technicalDetails) {
                            console.log(chalk.gray(`  • ${result.technicalDetails}`));
                        }
                    }

                    // TERCEIRO: Resposta detalhada adicional (se existir e for diferente)
                    if (result.finalAnswer && result.finalAnswer !== result.directAnswer) {
                        console.log();
                        console.log(chalk.gray('💡 Informações Adicionais:'));
                        console.log(chalk.gray(result.finalAnswer));
                    }
                } else {
                    // Fallback para método tradicional se não encontrou resposta
                    await this.handleQuestionTraditional(question);
                }
            } else {
                // Usa método tradicional para perguntas simples
                await this.handleQuestionTraditional(question);
            }

        } catch (error) {
            this.stopSpinner();
            console.error(chalk.red(`\n✗ Erro: ${error.message}\n`));
        }
    }

    // Decide se deve usar orquestração baseado na pergunta
    shouldUseOrchestration(question) {
        const q = question.toLowerCase();

        // Padrões que indicam necessidade de executar comandos
        const patterns = [
            // Comandos de listagem e análise
            /list[ea]/i,  // liste, listar
            /mostr[ea]/i,  // mostre, mostrar
            /exib[ia]/i,  // exiba, exibir
            /quais?\s+(?:são|os?|as?)/i,  // quais são, quais os
            /quant[oa]s?\s+/i,  // quantos, quantas

            // Análise de recursos do sistema
            /(?:memória|memoria|ram|cpu|disco|processos?|apps?|aplicações?|aplicativos?)/i,
            /(?:consumo|uso|utilização|ocupação)/i,
            /(?:espaço|tamanho|portas?|serviços?)/i,

            // Comandos específicos
            /top\s+\d+/i,  // top 5, top 10
            /primeiros?\s+\d+/i,  // primeiros 5
            /últimos?\s+\d+/i,  // últimos 10
            /maiores?\s+/i,  // maiores consumidores

            // Análise e verificação
            /status\s+/i,  // status de qualquer coisa
            /informações?\s+/i,  // informações sobre
            /analis[ea]r?\s+/i,  // analisar
            /verificar?\s+/i,  // verificar
            /diagnóstico/i,  // diagnóstico
            /relatório/i,  // relatório

            // Serviços específicos
            /fail2ban/i,  // fail2ban
            /docker/i,  // docker
            /systemd?/i,  // systemd
            /nginx/i,  // nginx
            /apache/i,  // apache
            /mysql/i,  // mysql
            /postgres/i,  // postgres

            // Estados e condições
            /bloqueado|banido/i,  // IPs bloqueados
            /rodando|executando|ativo/i,  // processos rodando
            /parado|inativo|morto/i,  // serviços parados
            /erro|warning|critical/i  // logs de erro
        ];

        return patterns.some(pattern => pattern.test(q));
    }

    // Método tradicional (mantido para perguntas simples)
    async handleQuestionTraditional(question) {
        // Detecta e executa comandos mencionados na pergunta (SEM spinner ainda)
        const commandResults = await this.detectAndExecuteCommands(question);

        // SÓ AGORA inicia animação de loading (após permissões)
        this.startSpinner(' Processando com IA');

        // Obtém resposta da IA com contexto
        const context = this.contextManager.getContext();
        const systemInfo = this.systemDetector.getSystemInfo();

        // Preparar contexto para o modelo - incluindo resultados dos comandos
        const enhancedQuestion = this.prepareQuestionWithCommandResults(question, context, systemInfo, commandResults);

        // Criar contexto completo compatível com askCommand
        const systemContext = {
            ...systemInfo,
            currentDir: process.cwd(),
            dirInfo: '',
            formattedPackages: '',
            webSearchResults: null,
            capabilities: this.systemDetector.getSystemCapabilities() || [],
            commands: this.systemDetector.getSystemCommands() || {},
            commandResults: commandResults
        };

        // Obter resposta - passar contexto completo
        const response = await this.aiModel.askCommand(enhancedQuestion, systemContext);

        // Para animação de loading
        this.stopSpinner();

        // Adiciona resposta ao contexto
        this.contextManager.addMessage('assistant', response);

        // Exibir resposta formatada
        this.displayFormattedResponse(response);
    }

    // Detecta comandos na pergunta e os executa
    async detectAndExecuteCommands(question) {
        const commandResults = [];

        // Padrões para detectar pedidos de execução de comandos
        const executePatterns = [
            /(?:execute|executar?|run|rodar?|pode\s+(?:executar|rodar)|me\s+(?:mostre|passe|dê))\s+(?:o\s+)?(?:comando\s+)?[`"]?([^`"\n]+)[`"]?/gi,
            /(?:qual|quais|me\s+(?:dê|passe|mostre))\s+(?:o\s+)?(?:resultado|output|saída)\s+(?:do\s+)?(?:comando\s+)?[`"]?([^`"\n]+)[`"]?/gi,
            /(?:status|informações?|detalhes?)\s+(?:do|da|de)\s+([a-zA-Z0-9_\-]+)/gi
        ];

        // Comandos comuns que o usuário pode querer executar
        const commonCommands = {
            'fail2ban': ['fail2ban-client status'],  // Removido systemctl status duplicado
            'firewall': ['ufw status', 'iptables -L -n'],
            'docker': ['docker ps', 'docker stats --no-stream'],
            'sistema': ['uname -a', 'lsb_release -a'],
            'rede': ['ip a'],
            'processos': ['ps aux | head -20']
        };

        // Verifica se a pergunta menciona algum serviço/comando conhecido
        for (const [service, commands] of Object.entries(commonCommands)) {
            if (question.toLowerCase().includes(service)) {
                for (const cmd of commands) {
                    // Executa apenas se o usuário está pedindo informações atuais
                    if (question.match(/(?:status|estado|ativas?|rodando|executando|quais|quant|liste|mostrar?|habilitad|regras?|bloqueado)/i)) {
                        const result = await this.executeCommand(cmd);
                        if (result) {
                            commandResults.push(result);
                        }
                    }
                }
            }
        }

        // Busca por comandos específicos mencionados
        for (const pattern of executePatterns) {
            let match;
            pattern.lastIndex = 0; // Reset regex
            while ((match = pattern.exec(question)) !== null) {
                const command = match[1].trim();
                if (command && !command.includes('&&') && !command.includes(';') && !command.includes('|>')) {
                    const result = await this.executeCommand(command);
                    if (result) {
                        commandResults.push(result);
                    }
                }
            }
        }

        return commandResults;
    }

    // Executa um comando de forma segura com permissão
    async executeCommand(command) {
        const { spawn } = await import('child_process');

        try {
            // Adiciona sudo se necessário para comandos que normalmente precisam
            let actualCommand = command;
            const needsSudo = [
                'fail2ban-client',
                'iptables',
                'netstat -tlnp',
                'systemctl status',
                'ufw status'
            ].some(cmd => command.startsWith(cmd));

            if (needsSudo && !command.startsWith('sudo')) {
                actualCommand = `sudo ${command}`;
            }

            // Para o spinner antes de pedir permissão (se estiver rodando)
            this.stopSpinner();

            // Verifica se precisa pedir permissão
            const needsPermission = !this.sessionPermissions.has(actualCommand);

            if (needsPermission) {
                const permission = await this.askCommandPermission(actualCommand);

                if (permission === 'n') {
                    console.log(chalk.yellow('\n❌ Comando cancelado pelo usuário\n'));
                    return null;
                } else if (permission === 'y') {
                    // Executa apenas uma vez este comando
                    // Não adiciona às permissões permanentes
                } else if (permission === 'a') {
                    // Sempre executar ESTE comando específico nesta sessão
                    this.sessionPermissions.add(actualCommand);
                    console.log(chalk.green(`\n✅ O comando "${actualCommand}" será executado automaticamente nesta sessão\n`));
                } else if (permission === 'd') {
                    // Usuário quer digitar outro comando
                    const customCommand = await this.askCustomCommand();
                    if (customCommand) {
                        actualCommand = customCommand;
                        // Não adiciona às permissões, executa apenas uma vez
                    } else {
                        return null;
                    }
                }
            }

            console.log(chalk.cyan(`\n▶ Executando: ${actualCommand}`));

            // Usa spawn para maior segurança (previne command injection)
            return new Promise((resolve) => {
                // Pega timeout da configuração ou usa padrão de 15 segundos
                const commandTimeout = this.config.command_timeout || 15000;

                // Para comandos com pipes, precisamos usar shell de forma segura
                // Verifica se é um comando que precisa de shell
                const needsShell = actualCommand.includes('|') || actualCommand.includes('>') || actualCommand.includes('<');

                let child;
                if (needsShell) {
                    // Para comandos com pipes, usa sh -c com comando como argumento único
                    // Isso é mais seguro que shell: true
                    child = spawn('sh', ['-c', actualCommand], {
                        encoding: 'utf8',
                        timeout: commandTimeout
                    });
                } else {
                    // Para comandos simples, separa comando e argumentos (mais seguro)
                    const parts = actualCommand.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
                    const command = parts[0];
                    const args = parts.slice(1).map(arg => arg.replace(/^"(.*)"$/, '$1'));

                    child = spawn(command, args, {
                        encoding: 'utf8',
                        timeout: commandTimeout
                    });
                }

                let stdout = '';
                let stderr = '';
                let outputShown = false;
                let commandCompleted = false;  // Flag para evitar timeout fantasma

                child.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                child.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                child.on('close', (code) => {
                    commandCompleted = true;  // Marca comando como completo
                    if (code === 0) {
                        console.log(chalk.green('✓ Sucesso'));

                        // Mostra o output do comando com formatação melhorada
                        if (stdout && stdout.trim() && !outputShown) {
                            console.log();
                            console.log(chalk.bold.cyan('📄 Resultado do comando:'));
                            console.log(chalk.gray('─'.repeat(45)));
                            console.log(chalk.yellow(stdout.substring(0, 500)));
                            if (stdout.length > 500) {
                                console.log(chalk.gray('... (output truncado para 500 caracteres)'));
                            }
                            console.log(chalk.gray('─'.repeat(45)));
                            console.log();
                        }

                        resolve({
                            command: actualCommand,
                            output: stdout.trim(),
                            exitCode: 0,
                            timestamp: new Date().toISOString()
                        });
                    } else {
                        // Comando falhou mas pode ter output útil
                        if (stdout || stderr) {
                            console.log(chalk.yellow(`⚠️ Comando retornou erro mas tem output\n`));

                            if ((stdout + stderr).trim()) {
                                console.log(chalk.bold.yellow('📄 Output do erro:'));
                                console.log(chalk.gray('─'.repeat(45)));
                                console.log(chalk.red((stdout + stderr).substring(0, 500)));
                                if ((stdout + stderr).length > 500) {
                                    console.log(chalk.gray('... (output truncado)'));
                                }
                                console.log(chalk.gray('─'.repeat(45)));
                                console.log();
                            }

                            resolve({
                                command: actualCommand,
                                output: (stdout + stderr).trim(),
                                exitCode: code || 1,
                                error: `Exit code: ${code}`,
                                timestamp: new Date().toISOString()
                            });
                        } else {
                            console.log(chalk.red(`✗ Comando falhou com código ${code}\n`));
                            resolve(null);
                        }
                    }
                });

                child.on('error', (err) => {
                    commandCompleted = true;  // Marca como completo mesmo com erro
                    console.log(chalk.red(`✗ Falha ao executar: ${err.message}\n`));
                    resolve(null);
                });

                // Timeout manual caso o timeout do spawn não funcione
                setTimeout(() => {
                    if (!child.killed && !commandCompleted) {  // Só mostra timeout se comando não completou
                        child.kill('SIGTERM');
                        console.log(chalk.yellow(`⚠️ Comando excedeu o tempo limite de ${commandTimeout/1000}s\n`));
                        resolve(null);  // Resolve para evitar hanging
                    }
                }, commandTimeout);
            });

        } catch (error) {
            console.log(chalk.red(`✗ Erro inesperado: ${error.message}\n`));
            return null;
        }
    }

    // Pede permissão para executar comando
    async askCommandPermission(command) {
        const readline = await import('readline');

        // Pausa temporariamente o REPL principal
        if (this.replInterface && this.replInterface.rl) {
            this.replInterface.rl.pause();
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,  // Evita duplicação de eco
            history: [],     // Histórico vazio para não interferir
            historySize: 0   // Não salva histórico
        });

        return new Promise((resolve) => {
            console.log();
            console.log(chalk.bgYellow.black(' 🔐 PERMISSÃO NECESSÁRIA '));
            console.log(chalk.yellow('━'.repeat(45)));
            console.log(chalk.cyan('Comando solicitado:'));
            console.log(chalk.bold.white(`  ${command}`));
            console.log(chalk.yellow('━'.repeat(45)));
            console.log();
            console.log(chalk.white('Escolha uma opção:'));
            console.log(chalk.green('  [Y]') + chalk.gray(' Executar uma vez'));
            console.log(chalk.red('  [N]') + chalk.gray(' Cancelar'));
            console.log(chalk.blue('  [A]') + chalk.gray(' Sempre permitir este comando'));
            console.log(chalk.magenta('  [D]') + chalk.gray(' Digitar outro comando'));
            console.log();

            rl.question(chalk.yellow('Escolha (y/n/a/d): '), (answer) => {
                rl.close();

                // Retoma o REPL principal
                if (this.replInterface && this.replInterface.rl) {
                    this.replInterface.rl.resume();
                }

                resolve(answer.toLowerCase().charAt(0));  // Pega apenas o primeiro caractere
            });
        });
    }

    // Pede para o usuário digitar um comando customizado
    async askCustomCommand() {
        const readline = await import('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            history: [],     // Histórico vazio para não interferir
            historySize: 0   // Não salva histórico
        });

        return new Promise((resolve) => {
            console.log(chalk.cyan('\n📝 Digite o comando que deseja executar:'));
            rl.question(chalk.gray('> '), (command) => {
                rl.close();
                resolve(command.trim() || null);
            });
        });
    }

    // Inicia animação de loading
    startSpinner(message = '') {
        // Não inicia se já estiver rodando
        if (this.spinnerInterval) return;

        this.spinnerIndex = 0;
        this.spinnerInterval = setInterval(() => {
            const frame = this.spinnerFrames[this.spinnerIndex];
            const text = chalk.cyan(frame) + chalk.gray(message);
            process.stdout.write(`\r${text}`);
            this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
        }, 80);
    }

    // Para animação de loading
    stopSpinner() {
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
            process.stdout.write('\r' + ' '.repeat(50) + '\r');
        }
    }

    // Formata e exibe resposta com cores
    displayFormattedResponse(response) {
        console.log();  // Nova linha após limpar o spinner

        // Primeiro, processa blocos de código de forma robusta
        let processedResponse = response;
        const codeBlocks = [];
        let blockIndex = 0;

        // Extrai e substitui blocos de código temporariamente
        processedResponse = processedResponse.replace(/```[\s\S]*?```/g, (match) => {
            const placeholder = `___CODEBLOCK_${blockIndex}___`;
            codeBlocks[blockIndex] = match;
            blockIndex++;
            return placeholder;
        });

        // Processa linhas com formatação
        const lines = processedResponse.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Restaura blocos de código
            if (line.includes('___CODEBLOCK_')) {
                const match = line.match(/___CODEBLOCK_(\d+)___/);
                if (match) {
                    const idx = parseInt(match[1]);
                    const codeBlock = codeBlocks[idx];
                    // Remove os ``` e extrai o conteúdo
                    const codeContent = codeBlock.replace(/```[\s\S]*?\n([\s\S]*?)```/, '$1').trim();
                    console.log(chalk.gray('```'));
                    console.log(chalk.green(codeContent));
                    console.log(chalk.gray('```'));
                    continue;
                }
            }

            // Aplica cores baseado no conteúdo
            if (line.startsWith('## ')) {
                // Títulos principais - ANÁLISE, SIGNIFICADO, etc
                console.log();
                console.log(chalk.bold.cyan(line));
                console.log(chalk.gray('─'.repeat(40)));
            } else if (line.startsWith('### ')) {
                // Subtítulos
                console.log();
                console.log(chalk.bold.yellow(line.replace('### ', '▶ ')));
            } else if (line.startsWith('🔧') || line.includes('COMANDO')) {
                // Comandos
                console.log(chalk.bold.green(line));
            } else if (line.startsWith('📝') || line.includes('EXPLICAÇÃO')) {
                // Explicações
                console.log(chalk.blue(line));
            } else if (line.startsWith('💡') || line.includes('OPÇÕES')) {
                // Opções/Dicas
                console.log(chalk.magenta(line));
            } else if (line.startsWith('⚠️') || line.includes('OBSERVAÇÕES')) {
                // Avisos/Observações
                console.log(chalk.yellow(line));
            } else if (line.startsWith('🌐') || line.includes('FONTES')) {
                // Fontes
                console.log(chalk.gray(line));
            } else if (line.startsWith('**') && line.endsWith('**')) {
                // Texto em negrito
                const text = line.replace(/\*\*/g, '');
                console.log(chalk.bold.white(text));
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
                // Listas
                console.log(chalk.white('  •' + line.substring(1)));
            } else if (line.includes('`') && !line.includes('```')) {
                // Inline code
                const formatted = line.replace(/`([^`]+)`/g, (match, code) => {
                    return chalk.green.bold(code);
                });
                console.log(formatted);
            } else if (line.trim() === '') {
                // Linha vazia
                console.log();
            } else {
                // Texto normal
                console.log(chalk.white(line));
            }
        }

        console.log();  // Linha extra no final
    }

    // Prepara a pergunta com os resultados dos comandos
    prepareQuestionWithCommandResults(question, context, systemInfo, commandResults) {
        let enhanced = this.prepareQuestion(question, context, systemInfo);

        if (commandResults && commandResults.length > 0) {
            enhanced += '\n\n### Resultados de Comandos Executados:\n';
            for (const result of commandResults) {
                enhanced += `\n**Comando:** \`${result.command}\`\n`;
                enhanced += `**Exit Code:** ${result.exitCode}\n`;
                if (result.output) {
                    enhanced += `**Output:**\n\`\`\`\n${result.output.substring(0, 1000)}\n\`\`\`\n`;
                }
                if (result.error) {
                    enhanced += `**Erro:** ${result.error}\n`;
                }
            }
            enhanced += '\n### Instruções: Com base nos resultados dos comandos executados acima, forneça primeiro uma ANÁLISE do que foi encontrado, depois explique o significado dos resultados, e por fim sugira comandos adicionais se necessário.';
        }

        return enhanced;
    }

    prepareQuestion(question, context, systemInfo) {
        let fullContext = '';

        // Adicionar contexto de sistema
        fullContext += `Sistema: ${systemInfo.os} ${systemInfo.distro || ''}\n`;

        // Adicionar histórico relevante (últimas 5 mensagens)
        if (context.length > 1) {
            const recent = context.slice(-5);
            fullContext += '\nContexto da conversa:\n';
            for (const msg of recent) {
                if (msg.role !== 'system') {
                    fullContext += `${msg.role}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}\n`;
                }
            }
            fullContext += '\n';
        }

        // Adicionar pergunta atual
        fullContext += `Pergunta atual: ${question}`;

        return fullContext;
    }

    async handleInterrupt() {
        if (this.exitOnNextInterrupt) {
            console.log(chalk.red('\nSaída forçada...'));
            process.exit(0);
        } else {
            this.exitOnNextInterrupt = true;
            console.log(chalk.yellow('\n\n(Pressione Ctrl+C novamente para forçar a saída)'));
            this.replInterface.prompt(); // Manter o prompt

            // Resetar a flag após um curto período se o usuário não pressionar novamente
            setTimeout(() => {
                this.exitOnNextInterrupt = false;
            }, 2000); // Janela de 2 segundos
        }
    }

    async shutdown() {
        console.log(chalk.yellow('\nEncerrando...'));

        // Salvar sessão
        try {
            await this.sessionPersistence.save(this.sessionName, this.contextManager.getContext());
            console.log(chalk.green(`✓ Sessão salva como '${this.sessionName}'`));
        } catch (error) {
            console.error(chalk.red('Erro ao salvar sessão:', error.message));
        }

        // Parar auto-save
        this.sessionPersistence.stopAutoSave();

        // Fechar interface
        this.replInterface.close();

        console.log(chalk.cyan('Até logo!'));
        process.exit(0);
    }
}

// Função principal
async function main() {
    const args = process.argv.slice(2);
    const config = {};

    // Processar argumentos
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--session' && i + 1 < args.length) {
            config.session = args[++i];
        } else if (arg === '--resume' && i + 1 < args.length) {
            config.resume = args[++i];
        } else if (arg === '--model' && i + 1 < args.length) {
            config.model = args[++i];
        } else if (arg === '--no-auto-save') {
            config.auto_save = false;
        } else if (arg === '--help') {
            console.log(`
Uso: mcp-chat [opções]

Opções:
  --session <nome>    Nome da sessão para salvar
  --resume <nome>     Retomar sessão existente
  --model <modelo>    Especificar modelo de IA
  --no-auto-save      Desabilitar auto-save
  --help              Mostrar esta ajuda
`);
            process.exit(0);
        }
    }

    // Carregar configuração do usuário
    const configPath = path.join(os.homedir(), '.mcp-terminal', 'config.json');
    if (existsSync(configPath)) {
        try {
            const userConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
            if (userConfig.interactive) {
                Object.assign(config, userConfig.interactive);
            }
        } catch (error) {
            console.error(chalk.yellow('Aviso: Não foi possível carregar configuração do usuário'));
        }
    }

    // Criar e iniciar modo interativo
    const mcp = new MCPInteractive(config);

    try {
        await mcp.start();
    } catch (error) {
        console.error(chalk.red('Erro ao iniciar modo interativo:', error.message));
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error(chalk.red('Erro fatal:', error));
        process.exit(1);
    });
}

export default MCPInteractive;
