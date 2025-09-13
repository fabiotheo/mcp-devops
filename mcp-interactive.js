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
            '/clear': this.clearScreen.bind(this),
            '/reset': this.resetContext.bind(this),
            '/save': this.saveSession.bind(this),
            '/load': this.loadSession.bind(this),
            '/model': this.changeModel.bind(this),
            '/exec': this.executeCommand.bind(this),
            '/history': this.showHistory.bind(this),
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

${chalk.yellow('/help')}     - Mostra esta ajuda
${chalk.yellow('/clear')}    - Limpa a tela (mantém contexto)
${chalk.yellow('/reset')}    - Reinicia o contexto da conversa
${chalk.yellow('/save')} [nome] - Salva a sessão atual
${chalk.yellow('/load')} [nome] - Carrega uma sessão salva
${chalk.yellow('/model')}    - Mostra/altera o modelo de IA
${chalk.yellow('/exec')}     - Executa o último comando sugerido
${chalk.yellow('/history')}  - Mostra histórico da sessão
${chalk.yellow('/exit')}     - Sai do modo interativo

${chalk.cyan('═══ Dicas ═══')}

• Digite ${chalk.green('"""')} para entrada multi-linha
• Use ${chalk.green('Tab')} para auto-completar comandos
• Sessões são salvas automaticamente a cada 5 minutos
`;
        return help;
    }

    async clearScreen() {
        console.clear();
        return chalk.green('✓ Tela limpa (contexto mantido)');
    }

    async resetContext() {
        this.mcp.contextManager.reset();
        return chalk.green('✓ Contexto reiniciado');
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
    }

    initialize() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.cyan('mcp> '),
            completer: this.autoComplete.bind(this)
        });

        this.rl.on('line', (line) => {
            const processed = this.handleMultiline(line);
            if (processed !== null) {
                this.emit('line', processed);
            }
        });

        this.rl.on('SIGINT', () => {
            if (this.inMultiline) {
                this.inMultiline = false;
                this.multilineBuffer = '';
                this.rl.setPrompt(chalk.cyan('mcp> '));
                this.rl.prompt();
            } else {
                this.emit('interrupt');
            }
        });
    }

    autoComplete(line) {
        const completions = [
            '/help', '/clear', '/reset', '/save', '/load',
            '/model', '/exec', '/history', '/exit', '/quit'
        ];
        const hits = completions.filter((c) => c.startsWith(line));
        return [hits.length ? hits : completions, line];
    }

    handleMultiline(line) {
        if (line === '"""') {
            if (this.inMultiline) {
                // Fim do multi-linha
                const result = this.multilineBuffer.trimEnd();
                this.multilineBuffer = '';
                this.inMultiline = false;
                this.rl.setPrompt(chalk.cyan('mcp> '));
                return result;
            } else {
                // Início do multi-linha
                this.inMultiline = true;
                this.rl.setPrompt(chalk.gray('... '));
                return null;
            }
        }

        if (this.inMultiline) {
            this.multilineBuffer += line + '\n';
            return null;
        }

        return line;
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
    }

    async initialize() {
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

        // Inicializar modelo de IA
        this.aiModel = await ModelFactory.createModel(modelConfig);
        await this.aiModel.initialize();

        // Inicializar interface REPL
        this.replInterface.initialize();

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
        console.log(chalk.cyan('╔════════════════════════════════════════════╗'));
        console.log(chalk.cyan('║') + chalk.white('     MCP Terminal Assistant v1.0.8          ') + chalk.cyan('║'));
        console.log(chalk.cyan('║') + chalk.yellow('         Modo Interativo Ativado            ') + chalk.cyan('║'));
        console.log(chalk.cyan('╚════════════════════════════════════════════╝'));
        console.log();

        // Informações do sistema
        const systemInfo = this.systemDetector.getSystemInfo();
        console.log(chalk.gray('Sistema:'), `${systemInfo.os} ${systemInfo.distro || ''}`);

        // Informações do modelo
        const providerInfo = this.aiModel.getProviderInfo();
        console.log(chalk.gray('Modelo:'), providerInfo.model);
        console.log();

        console.log(chalk.gray('Digite /help para comandos, /exit para sair'));
        console.log();
    }

    async processInput(input) {
        if (!input || input.trim() === '') {
            this.replInterface.prompt();
            return;
        }

        input = input.trim();

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

            // Mostra indicador de processamento
            process.stdout.write(chalk.gray('Pensando...'));

            // Obtém resposta da IA com contexto
            const context = this.contextManager.getContext();
            const systemInfo = this.systemDetector.getSystemInfo();

            // Preparar contexto para o modelo
            const enhancedQuestion = this.prepareQuestion(question, context, systemInfo);

            // Criar contexto completo compatível com askCommand
            const systemContext = {
                ...systemInfo,
                currentDir: process.cwd(),
                dirInfo: '',
                formattedPackages: '',
                webSearchResults: null,  // Importante: definir como null ao invés de undefined
                capabilities: this.systemDetector.getSystemCapabilities() || [],  // Adicionar capabilities
                commands: this.systemDetector.getSystemCommands() || {}  // Adicionar commands também
            };

            // Obter resposta - passar contexto completo
            const response = await this.aiModel.askCommand(enhancedQuestion, systemContext);

            // Limpar indicador
            process.stdout.write('\r' + ' '.repeat(20) + '\r');

            // Adiciona resposta ao contexto
            this.contextManager.addMessage('assistant', response);

            // Exibir resposta
            console.log('\n' + response + '\n');

        } catch (error) {
            process.stdout.write('\r' + ' '.repeat(20) + '\r');
            console.error(chalk.red(`\nErro: ${error.message}\n`));
        }
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
        console.log(chalk.yellow('\n\nUse /exit para sair ou Ctrl+C novamente para forçar saída'));
        this.replInterface.prompt();

        // Configurar handler para segunda interrupção
        setTimeout(() => {
            process.once('SIGINT', () => {
                console.log(chalk.red('\nSaída forçada...'));
                process.exit(0);
            });
        }, 100);
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