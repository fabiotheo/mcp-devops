#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Working Paste Detection
 * Versão simplificada e funcional
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

class CharacterStreamer {
    constructor(options = {}) {
        this.speed = options.speed || 5;
        this.aborted = false;
    }

    async stream(text) {
        this.aborted = false;
        if (!text) return;

        const textStr = String(text);
        for (const char of textStr) {
            if (this.aborted) {
                process.stdout.write(textStr.substring(textStr.indexOf(char)));
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

class MCPClaudeWorking {
    constructor() {
        this.config = {};
        this.aiModel = null;
        this.orchestrator = null;
        this.systemDetector = new SystemDetector();
        this.streamer = new CharacterStreamer();
        this.spinner = new ProcessingIndicator();
        this.conversationHistory = [];
        this.isProcessing = false;
        this.commandHistory = [];

        // Input state
        this.currentInput = '';
        this.displayMode = 'normal'; // 'normal', 'paste', 'multiline'
        this.pastedContent = null;
        this.multilineLines = [];
        this.pastedLines = 0; // Track number of pasted lines
    }

    async initialize() {
        console.log(chalk.gray('Initializing...'));
        await this.loadConfig();
        await this.initializeAI();
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

    setupInput() {
        // Setup raw mode
        process.stdin.setRawMode(true);
        process.stdin.setEncoding('utf8');

        // Show initial prompt
        this.showPrompt();

        // Handle input
        process.stdin.on('data', (key) => {
            this.handleInput(key);
        });
    }

    handleInput(key) {
        // Ctrl+C
        if (key === '\x03') {
            if (this.isProcessing) {
                this.spinner.stop();
                this.streamer.abort();
                console.log(chalk.yellow('\n⚠ Interrupted'));
                this.isProcessing = false;
                this.showPrompt();
            } else {
                console.log(chalk.cyan('\n\nGoodbye! 👋'));
                process.exit(0);
            }
            return;
        }

        // Ctrl+D
        if (key === '\x04') {
            console.log(chalk.cyan('\n\nGoodbye! 👋'));
            process.exit(0);
            return;
        }

        // ESC - Cancel current input
        if (key === '\x1b') {
            this.clearCurrentInput();
            console.log(chalk.yellow('Cancelled'));
            this.resetInput();
            this.showPrompt();
            return;
        }

        // Enter/Return
        if (key === '\r' || key === '\n') {
            this.handleEnter();
            return;
        }

        // Backspace
        if (key === '\x7f' || key === '\b') {
            this.handleBackspace();
            return;
        }

        // Check for paste (multiple characters or contains newlines)
        if (key.length > 1) {
            this.handlePaste(key);
            return;
        }

        // Normal character
        if (key.length === 1 && key >= ' ') {
            this.handleNormalChar(key);
        }
    }

    handlePaste(text) {
        // Clear current line
        this.clearCurrentInput();

        // Parse the pasted content
        const lines = text.split(/\r?\n/);
        const nonEmptyLines = lines.filter(l => l.trim());
        const lineCount = nonEmptyLines.length;
        const charCount = text.length;

        // Store the pasted content
        this.pastedContent = text;
        this.currentInput = text;
        this.displayMode = 'paste';

        // Show compact indicator
        process.stdout.write(chalk.green('❯ '));
        process.stdout.write(chalk.dim(`[Pasted ${lineCount} lines, ${charCount} chars]`));
    }

    handleNormalChar(char) {
        this.currentInput += char;

        if (this.displayMode === 'paste') {
            // Update paste indicator
            this.updatePasteDisplay();
        } else if (this.displayMode === 'multiline') {
            // Just add the character
            process.stdout.write(char);
        } else {
            // Normal mode - just echo the character
            process.stdout.write(char);
        }
    }

    handleBackspace() {
        if (this.currentInput.length > 0) {
            this.currentInput = this.currentInput.slice(0, -1);

            if (this.displayMode === 'paste') {
                this.updatePasteDisplay();
            } else {
                process.stdout.write('\b \b');
            }
        }
    }

    handleEnter() {
        // Check for backslash continuation
        if (this.currentInput.endsWith('\\')) {
            // Remove backslash and continue
            const contentWithoutBackslash = this.currentInput.slice(0, -1);

            // Save current content properly
            if (this.displayMode === 'paste') {
                // IMPORTANT: Preserve the pasted content with all its lines
                this.multilineLines = [contentWithoutBackslash];
                this.pastedLines = contentWithoutBackslash.split(/\r?\n/).filter(l => l.trim()).length;
            } else if (this.displayMode === 'normal') {
                // Normal text becoming multiline
                this.multilineLines.push(contentWithoutBackslash);
                this.pastedLines = 0;
            } else {
                // Already in multiline, add this line
                this.multilineLines.push(contentWithoutBackslash);
            }

            // Reset for new line
            this.currentInput = '';
            this.displayMode = 'multiline';
            process.stdout.write('\n');
            this.showPrompt();
            return;
        }

        // Process the input
        process.stdout.write('\n');

        let finalInput = '';
        let totalLineCount = 0;

        if (this.multilineLines.length > 0) {
            // We have multiline content
            this.multilineLines.push(this.currentInput);
            finalInput = this.multilineLines.join('\n');

            // Calculate total lines including pasted content
            totalLineCount = this.pastedLines || 0;
            for (let i = (this.pastedLines > 0 ? 1 : 0); i < this.multilineLines.length; i++) {
                if (this.multilineLines[i] && this.multilineLines[i].trim()) {
                    totalLineCount++;
                }
            }

            console.log(chalk.gray(`> Sending ${totalLineCount} lines...`));
            console.log();
        } else if (this.displayMode === 'paste') {
            // Just pasted content
            finalInput = this.currentInput;
            const lines = finalInput.split(/\r?\n/).filter(l => l.trim());
            if (lines.length > 1) {
                console.log(chalk.gray(`> Sending ${lines.length} lines...`));
                console.log();
            }
        } else {
            // Normal single line
            finalInput = this.currentInput;
        }

        // Reset state
        this.resetInput();

        // Process if not empty
        if (finalInput.trim()) {
            this.processInput(finalInput).then(() => {
                this.showPrompt();
            });
        } else {
            this.showPrompt();
        }
    }

    updatePasteDisplay() {
        // Clear and redraw
        this.clearCurrentInput();

        const lines = this.currentInput.split(/\r?\n/);
        const nonEmptyLines = lines.filter(l => l.trim());
        const lineCount = nonEmptyLines.length;
        const charCount = this.currentInput.length;

        process.stdout.write(chalk.green('❯ '));
        process.stdout.write(chalk.dim(`[${lineCount} lines, ${charCount} chars]`));
    }

    clearCurrentInput() {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
    }

    resetInput() {
        this.currentInput = '';
        this.displayMode = 'normal';
        this.pastedContent = null;
        this.multilineLines = [];
        this.pastedLines = 0;
    }

    showPrompt() {
        if (this.displayMode === 'multiline') {
            // Calculate total lines
            let totalLines = this.pastedLines || 0;

            // Add typed lines
            for (let i = (this.pastedLines > 0 ? 1 : 0); i < this.multilineLines.length; i++) {
                const line = this.multilineLines[i];
                if (line && line.trim()) {
                    totalLines++;
                }
            }

            process.stdout.write(chalk.gray('  '));
            if (totalLines > 0) {
                process.stdout.write(chalk.dim(`[${totalLines}+ lines] `));
            }
        } else {
            process.stdout.write(chalk.green('❯ '));
        }
    }

    async processInput(input) {
        const trimmed = input.trim();
        if (!trimmed) return;

        await this.saveToHistory(trimmed);

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

Type ${chalk.green('\\')} at end of line and press Enter for next line

${chalk.cyan('Paste Detection:')}

Multi-line pastes show as: [X lines, Y chars]
Press Enter to send, ESC to cancel
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
        this.conversationHistory.push({ role: 'user', content: query });
        this.spinner.start('Thinking');

        try {
            setTimeout(() => this.spinner.update('Analyzing context'), 200);
            const systemInfo = this.systemDetector.getSystemInfo();
            const context = {
                ...systemInfo,
                history: this.conversationHistory.slice(-5)
            };

            setTimeout(() => this.spinner.update('Processing with AI'), 500);
            let response;
            if (this.orchestrator && this.orchestrator.askCommand) {
                response = await this.orchestrator.askCommand(query, context);
            } else {
                response = await this.aiModel.askCommand(query, context);
            }

            this.spinner.stop();
            console.log();

            if (response) {
                if (this.config.streaming?.enabled !== false) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    await this.streamer.stream(response);
                } else {
                    console.log(response);
                }
                console.log();
                this.conversationHistory.push({ role: 'assistant', content: response });
            } else {
                console.log(chalk.yellow('No response received from AI'));
                console.log();
            }

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
        console.log(chalk.gray('Working Version • \\ + Enter for multi-line'));
        console.log(chalk.green('✨ Clean paste detection'));
        console.log();
    }

    async start() {
        await this.initialize();
        this.showHeader();
        this.setupInput();
    }
}

// Main
const main = async () => {
    const app = new MCPClaudeWorking();
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