#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Modo Interativo
 * Sistema de chat interativo com IA para assistência em comandos Linux
 * Desenvolvido por: Fábio Fernandes Theodoro
 * Empresa: IP COM COMÉRCIO DE EQUIPAMENTOS DE TELEFONIA LTDA
 */

import readline from 'readline';
import chalk from 'chalk';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Importações locais
import ModelFactory from './ai_models/model_factory.js';
import SystemDetector from './libs/system_detector.js';
import AICommandOrchestrator from './ai_orchestrator.js';
import AICommandOrchestratorTools from './ai_orchestrator_tools.js';
import AICommandOrchestratorBash from './ai_orchestrator_bash.js';
import TursoHistoryClient from './libs/turso-client.js';
import UserManager from './libs/user-manager.js';
import PersistentHistory from './libs/persistent-history.js';
import SessionPersistence from './libs/session-persistence.js';

// Classes Internas
class ContextManager {
    constructor(maxTokens = 32000) {
        this.messages = [];
        this.maxTokens = maxTokens;
    }

    addMessage(role, content) {
        this.messages.push({ role, content });
        this.trimContext();
    }

    trimContext() {
        // Simples estimativa de tokens (4 chars = 1 token)
        let totalChars = 0;
        let cutIndex = 0;

        for (let i = this.messages.length - 1; i >= 0; i--) {
            totalChars += this.messages[i].content.length;
            if (totalChars / 4 > this.maxTokens) {
                cutIndex = i + 1;
                break;
            }
        }

        if (cutIndex > 0) {
            this.messages = this.messages.slice(cutIndex);
        }
    }

    getContext() {
        return this.messages;
    }
}

class ShortcutsManager {
    constructor() {
        this.shortcuts = {
            'lt': 'ls -lht | head -20',
            'll': 'ls -lah',
            'la': 'ls -a',
            'l': 'ls',
            'cd..': 'cd ..',
            'cls': 'clear',
            'h': 'history',
            'grep': 'grep --color=auto',
            'df': 'df -h',
            'free': 'free -h',
            'ps': 'ps aux',
            'netstat': 'netstat -tuln',
            'ports': 'netstat -tuln | grep LISTEN',
            'myip': 'curl -s ifconfig.me',
            'weather': 'curl wttr.in',
            'speedtest': 'curl -s https://raw.githubusercontent.com/sivel/speedtest-cli/master/speedtest.py | python3 -',
            'sysinfo': 'uname -a && lsb_release -a 2>/dev/null || cat /etc/os-release',
            'diskusage': 'du -sh * | sort -rh | head -20',
            'topmem': 'ps aux | sort -nrk 4 | head -10',
            'topcpu': 'ps aux | sort -nrk 3 | head -10',
            'update': 'sudo apt update && sudo apt upgrade',
            'search': 'apt search',
            'install': 'sudo apt install',
            'remove': 'sudo apt remove',
            'services': 'systemctl list-units --type=service --state=running',
            'logs': 'journalctl -xe',
            'reboot': 'sudo reboot',
            'shutdown': 'sudo shutdown -h now',
            'mount': 'mount | column -t',
            'path': 'echo $PATH | tr ":" "\n"',
            'aliases': 'alias',
            'functions': 'declare -F',
            'variables': 'env',
            'connections': 'ss -tunap',
            'firewall': 'sudo iptables -L -n -v',
            'users': 'who',
            'groups': 'groups',
            'permissions': 'ls -la',
            'findfile': 'find . -name',
            'findtext': 'grep -r',
            'count': 'wc -l',
            'tail': 'tail -f',
            'head': 'head -n 20',
            'sort': 'sort -n',
            'unique': 'sort | uniq',
            'diff': 'diff -u',
            'tar': 'tar -czvf',
            'untar': 'tar -xzvf',
            'zip': 'zip -r',
            'unzip': 'unzip',
            'wget': 'wget -c',
            'curl': 'curl -O',
            'ssh': 'ssh -v',
            'scp': 'scp -r',
            'rsync': 'rsync -avz',
            'git': 'git status',
            'gitlog': 'git log --oneline --graph --decorate',
            'gitdiff': 'git diff',
            'gitadd': 'git add .',
            'gitcommit': 'git commit -m',
            'gitpush': 'git push',
            'gitpull': 'git pull',
            'docker': 'docker ps -a',
            'dockerimages': 'docker images',
            'dockerlogs': 'docker logs -f',
            'dockerexec': 'docker exec -it',
            'dockerstop': 'docker stop',
            'dockerstart': 'docker start',
            'dockerrm': 'docker rm',
            'dockerrmi': 'docker rmi',
            'compose': 'docker-compose',
            'composeup': 'docker-compose up -d',
            'composedown': 'docker-compose down',
            'composelogs': 'docker-compose logs -f',
            'k8s': 'kubectl get all',
            'k8spods': 'kubectl get pods',
            'k8slogs': 'kubectl logs -f',
            'k8sexec': 'kubectl exec -it',
            'nginx': 'sudo nginx -t',
            'nginxreload': 'sudo nginx -s reload',
            'apache': 'sudo apache2ctl -t',
            'apachereload': 'sudo systemctl reload apache2',
            'mysql': 'mysql -u root -p',
            'postgres': 'psql -U postgres',
            'mongo': 'mongo',
            'redis': 'redis-cli',
            'npm': 'npm list',
            'npminstall': 'npm install',
            'npmstart': 'npm start',
            'npmtest': 'npm test',
            'python': 'python3',
            'pip': 'pip3 list',
            'pipinstall': 'pip3 install',
            'venv': 'python3 -m venv',
            'activate': 'source venv/bin/activate',
            'deactivate': 'deactivate',
            'node': 'node',
            'pm2': 'pm2 list',
            'pm2logs': 'pm2 logs',
            'pm2restart': 'pm2 restart',
            'yarn': 'yarn',
            'yarninstall': 'yarn install',
            'yarnstart': 'yarn start',
            'yarntest': 'yarn test'
        };
    }

    get(shortcut) {
        return this.shortcuts[shortcut] || null;
    }

    list() {
        return this.shortcuts;
    }

    formatList() {
        const categories = {
            'Navegação': ['lt', 'll', 'la', 'l', 'cd..', 'cls'],
            'Sistema': ['h', 'sysinfo', 'df', 'free', 'ps', 'topmem', 'topcpu'],
            'Rede': ['netstat', 'ports', 'myip', 'connections', 'firewall'],
            'Busca': ['findfile', 'findtext', 'grep'],
            'Git': ['git', 'gitlog', 'gitdiff', 'gitadd', 'gitcommit', 'gitpush', 'gitpull'],
            'Docker': ['docker', 'dockerimages', 'dockerlogs', 'compose', 'composeup'],
            'Pacotes': ['update', 'search', 'install', 'remove'],
            'Serviços': ['services', 'logs', 'nginx', 'apache', 'mysql', 'redis'],
            'Node/NPM': ['npm', 'npminstall', 'node', 'pm2', 'yarn'],
            'Python': ['python', 'pip', 'pipinstall', 'venv', 'activate'],
            'Arquivos': ['tar', 'untar', 'zip', 'unzip', 'wget', 'curl', 'rsync'],
            'Utilitários': ['weather', 'speedtest', 'count', 'sort', 'unique', 'diff']
        };

        let output = '';
        for (const [category, shortcuts] of Object.entries(categories)) {
            output += chalk.cyan(`\n${category}:\n`);
            for (const shortcut of shortcuts) {
                if (this.shortcuts[shortcut]) {
                    output += chalk.yellow(`  /${shortcut}`) + chalk.gray(' → ') + chalk.white(this.shortcuts[shortcut]) + '\n';
                }
            }
        }
        return output;
    }
}

class CommandProcessor {
    constructor(mcpInteractive) {
        this.mcp = mcpInteractive;
        this.shortcuts = new ShortcutsManager();
    }

    async process(input) {
        // Verificar comandos especiais
        if (input.startsWith('/')) {
            return await this.handleCommand(input);
        }

        // Processar como pergunta normal
        return false;
    }

    async handleCommand(command) {
        const [cmd, ...args] = command.slice(1).split(' ');
        const fullArg = args.join(' ');

        switch (cmd) {
            case 'help':
            case 'h':
            case '?':
                this.showHelp();
                return true;

            case 'shortcuts':
            case 's':
                this.showShortcuts();
                return true;

            case 'clear':
            case 'cls':
            case 'c':
                console.clear();
                console.log(chalk.cyan('Terminal limpo'));
                return true;

            case 'exit':
            case 'quit':
            case 'q':
                await this.mcp.shutdown();
                return true;

            case 'save':
                await this.saveSession(fullArg);
                return true;

            case 'load':
                await this.loadSession(fullArg);
                return true;

            case 'sessions':
                await this.listSessions();
                return true;

            case 'reset':
                this.resetContext();
                return true;

            case 'model':
                this.showModelInfo();
                return true;

            case 'system':
                this.showSystemInfo();
                return true;

            case 'exec':
            case 'run':
            case '!':
                if (fullArg) {
                    await this.executeSystemCommand(fullArg);
                } else {
                    console.log(chalk.yellow('Uso: /exec <comando>'));
                }
                return true;

            case 'context':
                this.showContext();
                return true;

            case 'token':
            case 'tokens':
                this.showTokenUsage();
                return true;

            default:
                // Verificar se é um shortcut
                const shortcutCmd = this.shortcuts.get(cmd);
                if (shortcutCmd) {
                    await this.executeSystemCommand(shortcutCmd + (fullArg ? ' ' + fullArg : ''));
                    return true;
                }

                console.log(chalk.yellow(`Comando desconhecido: /${cmd}`));
                console.log(chalk.gray('Digite /help para ver comandos disponíveis'));
                return true;
        }
    }

    showHelp() {
        console.log(chalk.cyan('\n═══ Comandos Disponíveis ═══\n'));
        console.log(chalk.yellow('/help, /h, /?') + chalk.gray(' - Mostrar esta ajuda'));
        console.log(chalk.yellow('/shortcuts, /s') + chalk.gray(' - Listar atalhos disponíveis'));
        console.log(chalk.yellow('/clear, /cls, /c') + chalk.gray(' - Limpar terminal'));
        console.log(chalk.yellow('/exit, /quit, /q') + chalk.gray(' - Sair do modo interativo'));
        console.log(chalk.yellow('/save [nome]') + chalk.gray(' - Salvar sessão atual'));
        console.log(chalk.yellow('/load [nome]') + chalk.gray(' - Carregar sessão salva'));
        console.log(chalk.yellow('/sessions') + chalk.gray(' - Listar sessões salvas'));
        console.log(chalk.yellow('/reset') + chalk.gray(' - Resetar contexto da conversa'));
        console.log(chalk.yellow('/model') + chalk.gray(' - Informações do modelo de IA'));
        console.log(chalk.yellow('/system') + chalk.gray(' - Informações do sistema'));
        console.log(chalk.yellow('/exec <cmd>') + chalk.gray(' - Executar comando no sistema'));
        console.log(chalk.yellow('/context') + chalk.gray(' - Mostrar contexto atual'));
        console.log(chalk.yellow('/tokens') + chalk.gray(' - Mostrar uso de tokens'));
        console.log(chalk.gray('\nDica: Use /<shortcut> para comandos rápidos (ex: /ll, /df, /git)'));
        console.log();
    }

    showShortcuts() {
        console.log(chalk.cyan('\n═══ Atalhos Disponíveis ═══'));
        console.log(this.shortcuts.formatList());
        console.log(chalk.gray('\nUso: /<atalho> [argumentos]'));
        console.log(chalk.gray('Exemplo: /findfile "*.log"'));
        console.log();
    }

    async executeSystemCommand(command) {
        console.log(chalk.gray(`Executando: ${command}`));

        return new Promise((resolve) => {
            const child = spawn(command, [], {
                shell: true,
                stdio: 'inherit'
            });

            child.on('error', (error) => {
                console.error(chalk.red(`Erro: ${error.message}`));
                resolve();
            });

            child.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    console.log(chalk.yellow(`Comando finalizado com código: ${code}`));
                }
                resolve();
            });
        });
    }

    async saveSession(name) {
        const sessionName = name || `session-${Date.now()}`;
        try {
            await this.mcp.sessionPersistence.save(sessionName, this.mcp.contextManager.getContext());
            console.log(chalk.green(`✓ Sessão salva como '${sessionName}'`));
        } catch (error) {
            console.error(chalk.red(`Erro ao salvar sessão: ${error.message}`));
        }
    }

    async loadSession(name) {
        if (!name) {
            console.log(chalk.yellow('Uso: /load <nome-da-sessão>'));
            return;
        }

        try {
            const context = await this.mcp.sessionPersistence.load(name);
            this.mcp.contextManager.messages = context;
            console.log(chalk.green(`✓ Sessão '${name}' carregada`));
        } catch (error) {
            console.error(chalk.red(`Erro ao carregar sessão: ${error.message}`));
        }
    }

    async listSessions() {
        try {
            const sessions = await this.mcp.sessionPersistence.list();
            if (sessions.length === 0) {
                console.log(chalk.yellow('Nenhuma sessão salva'));
                return;
            }

            console.log(chalk.cyan('\n═══ Sessões Salvas ═══\n'));
            for (const session of sessions) {
                const info = await this.mcp.sessionPersistence.getInfo(session);
                console.log(chalk.yellow(`• ${session}`));
                if (info) {
                    console.log(chalk.gray(`  Mensagens: ${info.messageCount}`));
                    console.log(chalk.gray(`  Modificada: ${new Date(info.lastModified).toLocaleString()}`));
                }
            }
            console.log();
        } catch (error) {
            console.error(chalk.red(`Erro ao listar sessões: ${error.message}`));
        }
    }

    resetContext() {
        this.mcp.contextManager.messages = [];
        console.log(chalk.green('✓ Contexto resetado'));
    }

    showModelInfo() {
        const info = this.mcp.aiModel.getProviderInfo();
        console.log(chalk.cyan('\n═══ Informações do Modelo ═══\n'));
        console.log(chalk.yellow('Provider:'), info.provider);
        console.log(chalk.yellow('Modelo:'), info.model);
        console.log(chalk.yellow('Contexto Máximo:'), `${this.mcp.contextManager.maxTokens} tokens`);
        console.log();
    }

    showSystemInfo() {
        const info = this.mcp.systemDetector.getSystemInfo();
        console.log(chalk.cyan('\n═══ Informações do Sistema ═══\n'));
        console.log(chalk.yellow('OS:'), info.os);
        console.log(chalk.yellow('Distribuição:'), info.distro || 'N/A');
        console.log(chalk.yellow('Versão:'), info.version || 'N/A');
        console.log(chalk.yellow('Kernel:'), info.kernel || 'N/A');
        console.log(chalk.yellow('Arquitetura:'), info.arch || 'N/A');
        console.log(chalk.yellow('Hostname:'), info.hostname || 'N/A');
        console.log();
    }

    showContext() {
        const context = this.mcp.contextManager.getContext();
        console.log(chalk.cyan('\n═══ Contexto da Conversa ═══\n'));
        console.log(chalk.yellow(`Total de mensagens: ${context.length}`));

        if (context.length > 0) {
            console.log(chalk.gray('\nÚltimas 5 mensagens:'));
            const recent = context.slice(-5);
            for (const msg of recent) {
                const preview = msg.content.substring(0, 100);
                const suffix = msg.content.length > 100 ? '...' : '';
                console.log(chalk.blue(`[${msg.role}]:`), preview + suffix);
            }
        }
        console.log();
    }

    showTokenUsage() {
        const context = this.mcp.contextManager.getContext();
        let totalChars = 0;
        for (const msg of context) {
            totalChars += msg.content.length;
        }
        const estimatedTokens = Math.round(totalChars / 4);
        const maxTokens = this.mcp.contextManager.maxTokens;
        const percentage = Math.round((estimatedTokens / maxTokens) * 100);

        console.log(chalk.cyan('\n═══ Uso de Tokens ═══\n'));
        console.log(chalk.yellow('Tokens estimados:'), `${estimatedTokens} / ${maxTokens} (${percentage}%)`);
        console.log(chalk.yellow('Caracteres totais:'), totalChars);
        console.log(chalk.yellow('Mensagens no contexto:'), context.length);

        // Barra de progresso
        const barLength = 40;
        const filled = Math.round((percentage / 100) * barLength);
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        console.log(chalk.cyan('Uso: [') + bar + chalk.cyan(']'));
        console.log();
    }
}

// Classe para gerenciar entrada multilinha
class MultilineInput {
    constructor() {
        this.multilineBuffer = '';
        this.isCollecting = false;
    }

    processInput(line) {
        if (!this.isCollecting && line === '```') {
            this.isCollecting = true;
            this.multilineBuffer = '';
            return { collecting: true };
        }

        if (this.isCollecting) {
            if (line === '```') {
                this.isCollecting = false;
                const result = this.multilineBuffer;
                this.multilineBuffer = '';
                return { collecting: false, content: result };
            } else {
                this.multilineBuffer += line + '\n';
                return { collecting: true };
            }
        }

        return { collecting: false, content: line };
    }
}

class REPLInterface extends EventEmitter {
    constructor() {
        super();
        this.rl = null;
    }

    initialize() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.blue('mcp> '),
            terminal: true,
            historySize: 1000,
            removeHistoryDuplicates: true
        });

        // Configurar para manter histórico
        this.rl.history = [];
        this.rl.historyIndex = -1;
    }

    on(event, handler) {
        if (this.rl) {
            this.rl.on(event, handler);
        }
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

        // Turso integration
        this.tursoClient = null;
        this.userManager = null;
        this.tursoEnabled = false;
        this.currentUser = null;
        this.historyMode = 'global'; // global, user, machine, hybrid
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
            // Usar orquestrador com tools nativo
            this.commandOrchestrator = new AICommandOrchestratorTools(
                this.aiModel,
                commandExecutor,
                {
                    maxIterations: modelConfig.ai_orchestration?.max_iterations || 10,
                    maxExecutionTime: modelConfig.ai_orchestration?.max_execution_time || 60000,
                    verboseLogging: modelConfig.ai_orchestration?.verbose_logging || false
                }
            );
            console.log(chalk.green('✓ Usando orquestrador com ferramentas nativas'));
        } else {
            // Usar orquestrador padrão com regex
            this.commandOrchestrator = new AICommandOrchestrator(
                this.aiModel,
                commandExecutor,
                {
                    maxIterations: modelConfig.ai_orchestration?.max_iterations || 10,
                    maxExecutionTime: modelConfig.ai_orchestration?.max_execution_time || 60000,
                    verboseLogging: modelConfig.ai_orchestration?.verbose_logging || false
                }
            );
            console.log(chalk.green('✓ Usando orquestrador padrão com detecção por regex'));
        }

        // Inicializar histórico persistente
        this.persistentHistory = new PersistentHistory({
            historyFile: modelConfig.history?.file || path.join(os.homedir(), '.mcp-terminal', 'history.json'),
            maxSize: modelConfig.history?.max_size || 1000,
            deduplicate: modelConfig.history?.deduplicate !== false
        });
        await this.persistentHistory.initialize();

        // Inicializar Turso se configurado
        console.log(chalk.blue('🔄 Inicializando Turso...'));
        await this.initializeTurso(modelConfig);
        console.log(chalk.blue('✅ Turso inicializado'));

        // Inicializar interface REPL
        console.log(chalk.blue('🔄 Inicializando interface REPL...'));
        this.replInterface.initialize();
        console.log(chalk.blue('✅ Interface REPL inicializada'));

        // Carregar histórico combinado (local + Turso) no readline
        console.log(chalk.blue('🔄 Tentando carregar histórico...'));
        await this.loadCombinedHistory();

        // Configurar detecção de paste multilinha
        this.setupMultilineDetection();

        // Configurar listeners
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

    async initializeTurso(modelConfig) {
        try {
            const tursoConfigPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');

            if (existsSync(tursoConfigPath)) {
                console.log(chalk.blue('📦 Configuração do Turso encontrada'));
                const tursoConfig = JSON.parse(await fs.readFile(tursoConfigPath, 'utf8'));

                this.tursoClient = new TursoHistoryClient({
                    ...tursoConfig,
                    debug: false // Desabilitar debug em produção
                });

                console.log(chalk.blue('🔗 Conectando ao Turso...'));
                await this.tursoClient.initialize();
                console.log(chalk.green('✅ Turso conectado'));

                // Gerenciador de usuários
                this.userManager = new UserManager(this.tursoClient.client);

                // Configurar usuário e modo
                const args = process.argv.slice(2);
                for (let i = 0; i < args.length; i++) {
                    if (args[i].startsWith('--user=')) {
                        const username = args[i].split('=')[1];
                        if (username) {
                            await this.setUser(username);
                        }
                    } else if (args[i] === '--local') {
                        this.historyMode = 'machine';
                        console.log(chalk.blue('📍 Modo: Histórico local da máquina'));
                    } else if (args[i] === '--hybrid') {
                        this.historyMode = 'hybrid';
                        console.log(chalk.blue('🔀 Modo: Histórico híbrido (todos)'));
                    }
                }

                this.tursoEnabled = true;
                console.log(chalk.green('✅ Histórico distribuído ativado'));
            } else {
                console.log(chalk.gray('ℹ️  Turso não configurado - usando apenas histórico local'));
            }
        } catch (error) {
            console.log(chalk.yellow(`⚠️  Turso não disponível: ${error.message}`));
            console.log(chalk.gray('Continuando com histórico local apenas'));
        }
    }

    async setUser(username) {
        try {
            const user = await this.userManager.getUser(username);
            if (user) {
                this.currentUser = user;
                await this.tursoClient.setUser(username);
                this.historyMode = 'user';
                console.log(chalk.green(`✅ Usuário definido: ${user.name} (${username})`));
                console.log(chalk.blue('👤 Modo: Histórico do usuário'));
            } else {
                console.log(chalk.yellow(`⚠️  Usuário '${username}' não encontrado`));
            }
        } catch (error) {
            console.log(chalk.yellow(`⚠️  Erro ao definir usuário: ${error.message}`));
        }
    }

    setupMultilineDetection() {
        const self = this;
        this.pasteBuffer = [];
        this.pasteTimer = null;
        this.waitingForPasteConfirmation = false;
        this.pendingPasteText = '';

        // Track input speed to detect paste
        let lastInputTime = Date.now();
        let rapidInputCount = 0;
        let inputBuffer = '';

        // Override _addHistory to prevent multiline from being added to history
        const originalAddHistory = this.replInterface.rl._addHistory;
        this.replInterface.rl._addHistory = function() {
            // Only add to history if not multiline
            if (!this.line || !this.line.includes('\n')) {
                return originalAddHistory.call(this);
            }
            return this.history[0];
        };

        // Override the line handler
        this.replInterface.rl.on('line', async (input) => {
            // If waiting for confirmation
            if (self.waitingForPasteConfirmation) {
                if (input === '') {
                    self.waitingForPasteConfirmation = false;
                    const content = self.pendingPasteText;
                    self.pendingPasteText = '';
                    await self.processInput(content);
                } else {
                    self.waitingForPasteConfirmation = false;
                    self.pendingPasteText = '';
                    await self.processInput(input);
                }
                return;
            }

            // Check if the input contains newlines (multiline paste detected)
            if (input.includes('\n')) {
                const lines = input.split('\n').filter(l => l.trim());

                if (lines.length > 1) {
                    console.log(chalk.cyan('\n📋 Detected multiline paste:'));
                    console.log(chalk.gray('─'.repeat(50)));
                    lines.forEach((line, i) => {
                        console.log(chalk.gray(`${(i+1).toString().padStart(3)} │ `) + line);
                    });
                    console.log(chalk.gray('─'.repeat(50)));
                    console.log(chalk.yellow('Press Enter to send or type anything to cancel\n'));

                    self.pendingPasteText = input;
                    self.waitingForPasteConfirmation = true;
                    self.replInterface.prompt();
                    return;
                }
            }

            // Normal single-line processing
            await self.processInput(input);
        });

        // Override keypress to detect rapid input (paste)
        const stdin = process.stdin;
        if (stdin.setRawMode) {
            // Store original keypress handler
            const originalKeypressHandler = this.replInterface.rl._onKeypress;

            this.replInterface.rl._onKeypress = function(char, key) {
                const now = Date.now();
                const timeDiff = now - lastInputTime;
                lastInputTime = now;

                // Detect rapid input (paste)
                if (timeDiff < 10 && char && char !== '\r' && char !== '\n') {
                    rapidInputCount++;
                    inputBuffer += char;

                    // Clear existing timer
                    if (self.pasteTimer) {
                        clearTimeout(self.pasteTimer);
                    }

                    // Set timer to process after paste completes
                    self.pasteTimer = setTimeout(() => {
                        if (rapidInputCount > 20 && inputBuffer.includes('\n')) {
                            // Likely a multiline paste
                            rapidInputCount = 0;

                            // Clear the current line
                            this.line = '';
                            this.cursor = 0;
                            this._refreshLine();

                            // Show the pasted content
                            const lines = inputBuffer.split('\n').filter(l => l.trim());
                            console.log(chalk.cyan('\n📋 Detected multiline paste:'));
                            console.log(chalk.gray('─'.repeat(50)));
                            lines.forEach((line, i) => {
                                console.log(chalk.gray(`${(i+1).toString().padStart(3)} │ `) + line);
                            });
                            console.log(chalk.gray('─'.repeat(50)));
                            console.log(chalk.yellow('Press Enter to send or type anything to cancel\n'));

                            self.pendingPasteText = inputBuffer;
                            self.waitingForPasteConfirmation = true;
                            inputBuffer = '';
                            self.replInterface.prompt();
                        } else {
                            // Regular input, add to line
                            if (inputBuffer) {
                                this.line += inputBuffer;
                                this.cursor += inputBuffer.length;
                                this._refreshLine();
                            }
                            rapidInputCount = 0;
                            inputBuffer = '';
                        }
                    }, 50);
                } else {
                    // Reset rapid input detection if input is slow
                    if (timeDiff > 50) {
                        rapidInputCount = 0;
                        if (inputBuffer) {
                            // Add buffered input to line
                            this.line += inputBuffer;
                            this.cursor += inputBuffer.length;
                            this._refreshLine();
                            inputBuffer = '';
                        }
                    }
                }

                // Call original handler
                return originalKeypressHandler.call(this, char, key);
            };
        }
    }

    async loadCombinedHistory() {
        console.log(chalk.gray('🔍 Iniciando carregamento do histórico...'));

        if (!this.replInterface.rl) {
            console.log(chalk.yellow('⚠️  Interface readline não disponível'));
            return;
        }

        const combinedHistory = [];

        try {
            // 1. Carregar histórico local (PersistentHistory)
            console.log(chalk.gray(`📂 Histórico local: ${this.persistentHistory.history.length} comandos`));
            if (this.persistentHistory.history.length > 0) {
                combinedHistory.push(...this.persistentHistory.history);
            }

            // 2. Carregar histórico do Turso se disponível
            if (this.tursoClient) {
                console.log(chalk.gray('🔗 Carregando histórico do Turso...'));
                try {
                    const tursoHistory = await this.tursoClient.getHistory(50); // Últimos 50 comandos
                    console.log(chalk.gray(`📊 Turso retornou: ${tursoHistory.length} entradas`));

                    // Extrair apenas os comandos (sem as respostas)
                    const tursoCommands = tursoHistory.map(h => h.command).filter(cmd => cmd);
                    console.log(chalk.gray(`💬 Comandos válidos do Turso: ${tursoCommands.length}`));

                    // Adicionar comandos do Turso que não estão no histórico local
                    tursoCommands.forEach(cmd => {
                        if (!combinedHistory.includes(cmd)) {
                            combinedHistory.push(cmd);
                        }
                    });
                } catch (error) {
                    console.log(chalk.yellow(`⚠️  Erro ao carregar do Turso: ${error.message}`));
                }
            }

            // 3. Remover duplicatas mantendo ordem (comandos mais recentes primeiro)
            const uniqueHistory = [...new Set(combinedHistory)];
            console.log(chalk.gray(`📝 Total após deduplicação: ${uniqueHistory.length} comandos únicos`));

            // 4. Limpar histórico existente do readline
            this.replInterface.rl.history = [];

            // 5. Adicionar ao histórico do readline na ordem correta
            // O readline espera o histórico na ordem: mais recente no índice 0
            // Como nosso histórico já está com os mais recentes primeiro, adicionamos na ordem reversa
            for (let i = uniqueHistory.length - 1; i >= 0; i--) {
                this.replInterface.rl.history.push(uniqueHistory[i]);
            }

            // 6. Resetar o índice do histórico
            this.replInterface.rl.historyIndex = -1;

            console.log(chalk.green(`✅ Histórico carregado: ${this.replInterface.rl.history.length} comandos disponíveis`));

            // Debug: mostrar os primeiros comandos do histórico
            if (this.replInterface.rl.history.length > 0) {
                console.log(chalk.gray('📌 Comandos recentes no histórico:'));
                const recentCommands = this.replInterface.rl.history.slice(0, 3);
                recentCommands.forEach((cmd, i) => {
                    const preview = cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;
                    console.log(chalk.gray(`   ${i + 1}. ${preview}`));
                });
            }
        } catch (error) {
            console.log(chalk.red(`❌ Erro ao carregar histórico: ${error.message}`));
            console.error(error);
        }
    }

    async start() {
        await this.initialize();

        // Exibir banner de boas-vindas

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
        console.log(chalk.gray('   Cole texto multilinha e o sistema detecta automaticamente'));
        console.log(chalk.cyan('─'.repeat(80)));
        console.log();
    }

    handleLineInput(line) {
        // This is now handled in setupMultilineDetection
        // Keeping for compatibility
        this.processInput(line);
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
        const isCommand = await this.commandProcessor.process(input);
        if (isCommand) {
            this.replInterface.prompt();
            return;
        }

        // Processar como pergunta para IA
        await this.handleQuestion(input);
        this.replInterface.prompt();
    }

    async handleQuestion(question) {
        // Adiciona pergunta ao contexto
        this.contextManager.addMessage('user', question);

        // Iniciar animação de loading
        this.startSpinner();

        // Detectar e executar comandos se necessário
        const commandResults = await this.detectAndExecuteCommands(question);

        // Checar se a pergunta requer execução de comandos usando o orquestrador
        if (this.shouldUseOrchestrator(question)) {
            console.log(chalk.gray('\n🤖 Orquestrando comandos para responder sua pergunta...\n'));

            const systemInfo = this.systemDetector.getSystemInfo();
            const context = this.contextManager.getContext();

            const result = await this.commandOrchestrator.orchestrate(question, {
                systemInfo,
                context,
                sessionPermissions: this.sessionPermissions
            });

            // Parar animação de loading
            this.stopSpinner();

            // Adicionar resposta ao contexto
            this.contextManager.addMessage('assistant', result.response);

            // Salvar no Turso
            if (this.tursoEnabled) {
                try {
                    await this.tursoClient.saveCommand(question, result.response, {
                        session_id: this.sessionName
                    });
                } catch (error) {
                    // Silenciosamente continua
                }
            }

            // Exibir resposta formatada
            this.displayFormattedResponse(result.response);
            return;
        }

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

        // Salvar resposta no Turso
        if (this.tursoEnabled) {
            try {
                await this.tursoClient.saveCommand(question, response, {
                    session_id: this.sessionName
                });
            } catch (error) {
                // Silenciosamente continua
            }
        }

        // Exibir resposta formatada
        this.displayFormattedResponse(response);
    }

    // Detecta comandos na pergunta e os executa
    async detectAndExecuteCommands(question) {
        const commandResults = [];

        // Padrões para detectar pedidos de execução de comandos
        const executePatterns = [
            /execute[:\s]+`([^`]+)`/gi,
            /run[:\s]+`([^`]+)`/gi,
            /comando[:\s]+`([^`]+)`/gi,
            /executar[:\s]+`([^`]+)`/gi,
            /rodar[:\s]+`([^`]+)`/gi
        ];

        for (const pattern of executePatterns) {
            let match;
            while ((match = pattern.exec(question)) !== null) {
                const command = match[1];
                console.log(chalk.gray(`\n🔧 Executando: ${command}`));

                const result = await this.executeCommand(command);
                commandResults.push({
                    command,
                    ...result
                });

                // Mostrar resultado
                if (result.exitCode === 0) {
                    console.log(chalk.green('✓ Comando executado com sucesso'));
                    if (result.output) {
                        console.log(chalk.gray(result.output));
                    }
                } else {
                    console.log(chalk.red(`✗ Erro no comando (código ${result.exitCode})`));
                    if (result.error) {
                        console.log(chalk.red(result.error));
                    }
                }
            }
        }

        return commandResults;
    }

    // Executa comando do sistema
    async executeCommand(command) {
        return new Promise((resolve) => {
            let output = '';
            let error = '';

            const child = spawn(command, [], {
                shell: true,
                encoding: 'utf8'
            });

            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.stderr.on('data', (data) => {
                error += data.toString();
            });

            child.on('error', (err) => {
                resolve({
                    exitCode: -1,
                    output: output,
                    error: err.message
                });
            });

            child.on('exit', (code) => {
                resolve({
                    exitCode: code || 0,
                    output: output.trim(),
                    error: error.trim()
                });
            });

            // Timeout de segurança
            setTimeout(() => {
                child.kill();
                resolve({
                    exitCode: -1,
                    output: output,
                    error: 'Comando excedeu o tempo limite'
                });
            }, 30000); // 30 segundos
        });
    }

    // Verifica se deve usar o orquestrador
    shouldUseOrchestrator(question) {
        const orchestratorKeywords = [
            'quantos', 'quanto', 'lista', 'listar', 'mostrar', 'mostra',
            'verificar', 'verifica', 'checar', 'status', 'informação',
            'informações', 'diagnóstico', 'diagnostic', 'analisar',
            'analise', 'descobrir', 'descubra', 'encontrar', 'encontre',
            'buscar', 'busque', 'procurar', 'procure', 'qual', 'quais',
            'onde', 'quando', 'como está', 'como estão', 'tem', 'existe',
            'há', 'possui', 'contém', 'disponível', 'rodando', 'executando',
            'ativo', 'inativo', 'funcionando', 'problema', 'erro', 'falha',
            'debug', 'investigar', 'examine', 'explore', 'teste', 'monitor'
        ];

        const lowerQuestion = question.toLowerCase();
        return orchestratorKeywords.some(keyword => lowerQuestion.includes(keyword));
    }

    startSpinner() {
        this.spinnerIndex = 0;
        this.spinnerInterval = setInterval(() => {
            process.stdout.write(`\r${chalk.cyan(this.spinnerFrames[this.spinnerIndex])} ${chalk.gray('Processando...')}`);
            this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
        }, 80);
    }

    stopSpinner() {
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
            process.stdout.write('\r' + ' '.repeat(20) + '\r'); // Limpar linha
        }
    }

    displayFormattedResponse(response) {
        console.log(); // Nova linha
        console.log(chalk.white(response));
        console.log(); // Nova linha
    }

    prepareQuestionWithCommandResults(question, context, systemInfo, commandResults) {
        let enhanced = question;

        // Se houver resultados de comandos, incluí-los
        if (commandResults && commandResults.length > 0) {
            enhanced += '\n\n### Resultados dos comandos executados:\n';
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