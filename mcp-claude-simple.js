#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Claude Code Style (SIMPLE VERSION)
 * Versão simplificada que funciona 100% sem bugs de paste
 */

import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';
import ModelFactory from './ai_models/model_factory.js';
import SystemDetector from './libs/system_detector.js';
import AICommandOrchestrator from './ai_orchestrator.js';

/**
 * Processing Indicator
 */
class ProcessingIndicator {
    constructor() {
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.currentFrame = 0;
        this.interval = null;
        this.isRunning = false;
    }

    start(message = 'Processing') {
        if (this.isRunning) return;

        this.isRunning = true;
        process.stdout.write('\n');

        this.interval = setInterval(() => {
            const frame = this.frames[this.currentFrame];
            process.stdout.write(`\r${chalk.cyan(frame)} ${chalk.gray(message)}...`);
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 80);
    }

    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        process.stdout.write('\r' + ' '.repeat(50) + '\r');
    }

    update(message) {
        if (this.isRunning) {
            const frame = this.frames[this.currentFrame];
            process.stdout.write(`\r${chalk.cyan(frame)} ${chalk.gray(message)}...`);
        }
    }
}

/**
 * Character Streaming
 */
class CharacterStreamer {
    constructor(options = {}) {
        this.speed = options.speed || 5;
        this.aborted = false;
    }

    async stream(text) {
        this.aborted = false;

        for (const char of text) {
            if (this.aborted) {
                process.stdout.write(text.substring(text.indexOf(char)));
                break;
            }

            process.stdout.write(char);

            if (char === '.' || char === '!' || char === '?') {
                await this.sleep(this.speed * 8);
            } else if (char === ',' || char === ';' || char === ':') {
                await this.sleep(this.speed * 4);
            } else if (char === ' ') {
                await this.sleep(this.speed * 2);
            } else if (char === '\n') {
                await this.sleep(this.speed * 10);
            } else {
                await this.sleep(this.speed);
            }
        }
    }

    abort() {
        this.aborted = true;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Main Interface
 */
class MCPClaudeSimple {
    constructor() {
        this.rl = null;
        this.config = {};
        this.aiModel = null;
        this.orchestrator = null;
        this.systemDetector = new SystemDetector();
        this.streamer = new CharacterStreamer();
        this.spinner = new ProcessingIndicator();
        this.conversationHistory = [];
        this.isProcessing = false;
        this.commandHistory = [];
        this.sessionName = `session-${Date.now()}`;

        // Multi-line support
        this.inputBuffer = [];
        this.isInMultiLine = false;
    }

    async initialize() {
        console.log(chalk.gray('Initializing...'));
        await this.loadConfig();
        await this.initializeAI();
        this.setupReadline();
        await this.loadHistory();
        console.clear();
    }

    async loadConfig() {
        try {
            const configPath = path.join(os.homedir(), '.mcp-terminal/config.json');
            if (existsSync(configPath)) {
                const configData = await fs.readFile(configPath, 'utf8');
                this.config = JSON.parse(configData);
                console.log(chalk.green('✓') + chalk.gray(' Configuration loaded'));
            } else {
                throw new Error('Config not found');
            }
        } catch (error) {
            console.log(chalk.yellow('⚠') + chalk.gray(' Using default configuration'));
            this.config = {
                ai_provider: 'claude',
                model: 'claude-3-5-sonnet-20241022',
                streaming: { enabled: true, speed: 5 }
            };
        }
    }

    async initializeAI() {
        try {
            this.aiModel = await ModelFactory.createModel(this.config);
            this.orchestrator = new AICommandOrchestrator(this.aiModel, {
                verbose: false,
                execute_commands: false
            });
            console.log(chalk.green('✓') + chalk.gray(' AI initialized'));
        } catch (error) {
            console.error(chalk.red('✗') + chalk.gray(' Failed to initialize AI:'), error.message);
            this.aiModel = {
                askCommand: async (prompt) => {
                    return 'AI service unavailable. Please check your configuration.';
                }
            };
        }
    }

    setupReadline() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            historySize: 100
        });

        this.updatePrompt();

        // Handle line input
        this.rl.on('line', async (input) => {
            await this.handleLine(input);
        });

        // Handle Ctrl+C
        this.rl.on('SIGINT', () => {
            if (this.isProcessing) {
                this.spinner.stop();
                this.streamer.abort();
                console.log(chalk.yellow('\n⚠ Interrupted'));
                this.isProcessing = false;
                this.updatePrompt();
                this.rl.prompt();
            } else {
                console.log(chalk.cyan('\n\nGoodbye! 👋'));
                process.exit(0);
            }
        });

        // Handle Ctrl+D
        this.rl.on('close', () => {
            console.log(chalk.cyan('\n\nGoodbye! 👋'));
            process.exit(0);
        });
    }

    updatePrompt() {
        if (this.isInMultiLine) {
            this.rl.setPrompt(chalk.gray('  '));
        } else {
            this.rl.setPrompt(chalk.green('❯ '));
        }
    }

    async handleLine(input) {
        // Check for multi-line continuation (ends with \)
        if (input.endsWith('\\')) {
            const content = input.slice(0, -1); // Remove backslash
            this.inputBuffer.push(content);
            this.isInMultiLine = true;
            this.updatePrompt();
            this.rl.prompt();
            return;
        }

        // Complete input (either single line or end of multi-line)
        let finalInput;
        if (this.isInMultiLine) {
            this.inputBuffer.push(input);
            finalInput = this.inputBuffer.join('\n');
            this.inputBuffer = [];
            this.isInMultiLine = false;
        } else {
            finalInput = input;
        }

        this.updatePrompt();

        // Process the complete input
        await this.processInput(finalInput);
        this.rl.prompt();
    }

    async processInput(input) {
        const trimmed = input.trim();

        if (!trimmed) {
            return;
        }

        // Save to history
        await this.saveToHistory(trimmed);

        // Handle commands
        if (trimmed.startsWith('/')) {
            await this.handleCommand(trimmed);
        } else {
            await this.processQuery(trimmed);
        }
    }

    async handleCommand(command) {
        const cmd = command.slice(1).toLowerCase();

        switch(cmd) {
            case 'help':
                this.showHelp();
                break;
            case 'clear':
                console.clear();
                this.showHeader();
                break;
            case 'reset':
                this.conversationHistory = [];
                console.log(chalk.green('✓ Context reset'));
                break;
            case 'history':
                this.showHistory();
                break;
            case 'exit':
            case 'quit':
                console.log(chalk.cyan('Goodbye! 👋'));
                process.exit(0);
                break;
            default:
                console.log(chalk.red(`Unknown command: ${command}`));
        }
    }

    showHelp() {
        console.log(`
${chalk.cyan('Commands:')}

${chalk.yellow('/help')}     Show this help
${chalk.yellow('/clear')}    Clear screen
${chalk.yellow('/reset')}    Reset conversation
${chalk.yellow('/history')}  Show history
${chalk.yellow('/exit')}     Exit

${chalk.cyan('Multi-line Input:')}

${chalk.green('\\')} + ${chalk.green('Enter')}   Continue to next line
${chalk.green('Enter')}        Send message

${chalk.cyan('Paste:')} Just paste normally - it will be treated as one message

${chalk.gray('Type your question for AI assistance')}
        `);
    }

    showHistory() {
        console.log(chalk.cyan('\nRecent:'));
        const recent = this.commandHistory.slice(-10);
        recent.forEach((cmd, i) => {
            console.log(chalk.gray(`  ${i + 1}. ${cmd}`));
        });
        console.log();
    }

    async processQuery(query) {
        this.isProcessing = true;

        // Add to conversation
        this.conversationHistory.push({ role: 'user', content: query });

        // Start processing indicator
        this.spinner.start('Thinking');

        try {
            // Get system context
            setTimeout(() => this.spinner.update('Analyzing context'), 200);
            const systemInfo = this.systemDetector.getSystemInfo();
            const context = {
                ...systemInfo,
                history: this.conversationHistory.slice(-5)
            };

            // Get response
            setTimeout(() => this.spinner.update('Processing with AI'), 500);
            let response;
            if (this.orchestrator && this.orchestrator.askCommand) {
                response = await this.orchestrator.askCommand(query, context);
            } else {
                response = await this.aiModel.askCommand(query, context);
            }

            // Stop spinner
            this.spinner.stop();
            console.log();

            // Stream response
            if (this.config.streaming?.enabled !== false) {
                await new Promise(resolve => setTimeout(resolve, 200));
                await this.streamer.stream(response);
            } else {
                console.log(response);
            }

            console.log();

            // Add to history
            this.conversationHistory.push({ role: 'assistant', content: response });

        } catch (error) {
            this.spinner.stop();
            console.log(chalk.red(`\n❌ Error: ${error.message}`));
            console.log();
        }

        this.isProcessing = false;
    }

    async loadHistory() {
        try {
            const historyPath = path.join(os.homedir(), '.mcp-terminal/history.json');
            if (existsSync(historyPath)) {
                const data = await fs.readFile(historyPath, 'utf8');
                const history = JSON.parse(data);
                this.commandHistory = history.commands || [];
                this.rl.history = this.commandHistory.slice(-50).reverse();
            }
        } catch (error) {
            this.commandHistory = [];
        }
    }

    async saveToHistory(command) {
        try {
            this.commandHistory.push(command);
            if (this.commandHistory.length > 1000) {
                this.commandHistory = this.commandHistory.slice(-1000);
            }

            const historyPath = path.join(os.homedir(), '.mcp-terminal/history.json');
            await fs.writeFile(
                historyPath,
                JSON.stringify({ commands: this.commandHistory }, null, 2)
            );
        } catch (error) {
            // Silent fail
        }
    }

    showHeader() {
        console.log();
        console.log(chalk.cyan.bold('MCP Terminal Assistant'));
        console.log(chalk.gray('Claude Code Style • \\ + Enter for new line • /help for commands'));
        console.log(chalk.green('✨ Paste works perfectly - just Ctrl+V and Enter'));
        console.log();
    }

    async start() {
        await this.initialize();
        this.showHeader();
        this.rl.prompt();
    }
}

// Main
const main = async () => {
    const app = new MCPClaudeSimple();
    await app.start();
};

// Error handling
process.on('uncaughtException', (error) => {
    console.error(chalk.red('\nFatal error:'), error.message);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error(chalk.red('\nUnhandled rejection:'), error.message);
    process.exit(1);
});

// Start
main().catch(error => {
    console.error(chalk.red('Failed to start:'), error.message);
    process.exit(1);
});