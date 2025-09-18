#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Claude Code Style (BETTER PASTE)
 * Solução melhorada com detecção de paste completa
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

        // Handle undefined or null text
        if (!text) {
            return;
        }

        // Convert to string if needed
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

/**
 * Main Interface - Better paste detection
 */
class MCPClaudeBetter {
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

        // Multi-line support
        this.inputBuffer = [];
        this.isInMultiLine = false;

        // Better paste detection
        this.pasteLines = [];
        this.pasteTimer = null;
        this.waitingForConfirmation = false;
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

        // Counter for lines
        let lineCounter = 0;
        let lineTimestamps = [];

        this.rl.on('line', (input) => {
            // If waiting for confirmation
            if (this.waitingForConfirmation) {
                this.handlePasteConfirmation(input);
                return;
            }

            // Track line timing
            const now = Date.now();
            lineTimestamps.push(now);

            // Check if this might be part of a paste
            if (lineTimestamps.length >= 2) {
                const timeDiff = now - lineTimestamps[lineTimestamps.length - 2];

                // If lines are coming too fast (< 100ms), it's likely a paste
                if (timeDiff < 100) {
                    // Collect paste lines
                    if (this.pasteTimer) {
                        clearTimeout(this.pasteTimer);
                    }

                    this.pasteLines.push(input);

                    // Wait a bit to see if more lines are coming
                    this.pasteTimer = setTimeout(() => {
                        this.processPastedLines();
                    }, 150);

                    return;
                }
            }

            // Clean old timestamps (keep only last 10)
            if (lineTimestamps.length > 10) {
                lineTimestamps = lineTimestamps.slice(-10);
            }

            // Check if we have pending paste lines
            if (this.pasteLines.length > 0) {
                this.pasteLines.push(input);

                if (this.pasteTimer) {
                    clearTimeout(this.pasteTimer);
                }

                this.pasteTimer = setTimeout(() => {
                    this.processPastedLines();
                }, 150);
            } else {
                // Normal single line
                this.handleLine(input);
            }
        });

        // Handle Ctrl+C
        this.rl.on('SIGINT', () => {
            if (this.waitingForConfirmation) {
                this.cancelPaste();
            } else if (this.isProcessing) {
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

    processPastedLines() {
        const lines = [...this.pasteLines];
        this.pasteLines = [];
        this.pasteTimer = null;

        if (lines.length > 1) {
            // Clear any visual artifacts
            process.stdout.write('\r' + ' '.repeat(80) + '\r');

            // Show paste dialog
            this.showPasteDialog(lines);
        } else if (lines.length === 1) {
            // Single line, process normally
            this.handleLine(lines[0]);
        }
    }

    showPasteDialog(lines) {
        this.waitingForConfirmation = true;
        this.pendingPaste = lines;

        console.log(chalk.yellow('\n📋 Multi-line paste detected:'));
        console.log(chalk.gray('━'.repeat(50)));

        // Show preview
        const maxPreview = 5;
        const preview = lines.slice(0, maxPreview);

        preview.forEach(line => {
            const display = line.substring(0, 45);
            console.log(chalk.gray('  ' + display + (line.length > 45 ? '...' : '')));
        });

        if (lines.length > maxPreview) {
            console.log(chalk.gray(`  ... and ${lines.length - maxPreview} more lines`));
        }

        console.log(chalk.gray('━'.repeat(50)));
        console.log(chalk.green('\n✅ Press Enter to send'));
        console.log(chalk.red('❌ Press Ctrl+C to cancel'));
        console.log();

        // Change prompt
        this.rl.setPrompt(chalk.cyan('↵ '));
        this.rl.prompt();
    }

    handlePasteConfirmation(input) {
        if (input === '') {
            // User pressed Enter - send the paste
            this.waitingForConfirmation = false;
            const combined = this.pendingPaste.join('\n');
            this.pendingPaste = null;

            console.log(chalk.green('✓ Sending pasted content...'));
            console.log();

            this.processInput(combined).then(() => {
                this.updatePrompt();
                this.rl.prompt();
            });
        } else {
            // User typed something - cancel
            this.cancelPaste();
        }
    }

    cancelPaste() {
        this.waitingForConfirmation = false;
        this.pendingPaste = null;
        console.log(chalk.yellow('\n⚠ Paste cancelled'));
        console.log();
        this.updatePrompt();
        this.rl.prompt();
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

${chalk.cyan('Paste Detection:')}

Multi-line pastes are automatically detected
and require confirmation before sending.

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

            // Check if we got a response
            if (response) {
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
        console.log(chalk.gray('Claude Code Style • \\ + Enter for multi-line'));
        console.log(chalk.green('✨ Better paste detection with confirmation'));
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
    const app = new MCPClaudeBetter();
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