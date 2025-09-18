#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Claude Code Style
 * Clean, linear interface without duplicate rendering
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
 * Processing Indicator with animated spinner
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

        // Clear the spinner line
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
 * Character Streaming for natural response rendering
 */
class CharacterStreamer {
    constructor(options = {}) {
        this.speed = options.speed || 5;
        this.aborted = false;
        this.currentText = '';
    }

    async stream(text) {
        this.aborted = false;
        this.currentText = '';

        for (const char of text) {
            if (this.aborted) {
                // Print remaining text
                process.stdout.write(text.substring(this.currentText.length));
                break;
            }

            process.stdout.write(char);
            this.currentText += char;

            // Natural pauses
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
 * Claude Code Style Interface
 */
class MCPClaudeStyle {
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
        this.multiLineBuffer = '';
        this.isMultiLine = false;
        this.isPasting = false;
        this.pasteBuffer = '';
    }

    async initialize() {
        console.log(chalk.gray('Initializing...'));

        // Load configuration
        await this.loadConfig();

        // Initialize AI Model
        await this.initializeAI();

        // Setup readline
        this.setupReadline();

        // Load history
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
            // Create AI model
            this.aiModel = await ModelFactory.createModel(this.config);

            // Create orchestrator
            this.orchestrator = new AICommandOrchestrator(this.aiModel, {
                verbose: false,
                execute_commands: false
            });

            console.log(chalk.green('✓') + chalk.gray(' AI initialized'));
        } catch (error) {
            console.error(chalk.red('✗') + chalk.gray(' Failed to initialize AI:'), error.message);
            // Fallback to mock
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
            historySize: 100,
            prompt: chalk.green('❯ ')
        });

        // Override the write to output to hide backslash
        const originalWrite = this.rl._writeToOutput;
        this.rl._writeToOutput = (stringToWrite) => {
            // If the string contains a backslash at the end, don't write it
            if (stringToWrite === '\\') {
                return; // Don't display the backslash
            }
            // For other characters, use original behavior
            originalWrite.call(this.rl, stringToWrite);
        };

        // Enable bracketed paste mode
        if (process.stdout.isTTY) {
            process.stdout.write('\x1b[?2004h');
        }

        // Intercept paste events before readline processes them
        const originalPrepareWrite = this.rl._insertString || this.rl.write;

        this.rl._insertString = (data) => {
            // Check for bracketed paste
            if (data.includes('\x1b[200~')) {
                this.isPasting = true;
                this.pasteBuffer = '';
                return;
            }

            if (data.includes('\x1b[201~')) {
                this.isPasting = false;

                // Process accumulated paste
                if (this.pasteBuffer) {
                    const cleanText = this.pasteBuffer
                        .replace(/\x1b\[200~/g, '')
                        .replace(/\x1b\[201~/g, '')
                        .replace(/\r?\n/g, ' ')  // Convert all newlines to spaces
                        .replace(/\s+/g, ' ')   // Collapse multiple spaces
                        .trim();

                    // Insert as single line
                    if (originalPrepareWrite) {
                        originalPrepareWrite.call(this.rl, cleanText);
                    }
                }
                this.pasteBuffer = '';
                return;
            }

            // Accumulate paste content
            if (this.isPasting) {
                this.pasteBuffer += data;
                return;
            }

            // Normal input
            if (originalPrepareWrite) {
                originalPrepareWrite.call(this.rl, data);
            }
        };


        // Handle input
        this.rl.on('line', async (input) => {
            await this.handleInput(input);
        });

        // Handle Ctrl+C
        this.rl.on('SIGINT', () => {
            if (this.isProcessing) {
                this.spinner.stop();
                this.streamer.abort();
                console.log(chalk.yellow('\n⚠ Interrupted'));
                this.isProcessing = false;
                this.rl.prompt();
            } else {
                console.log(chalk.cyan('\n\nGoodbye! 👋'));
                process.exit(0);
            }
        });

        // Handle Ctrl+D (EOF)
        this.rl.on('close', () => {
            // Disable bracketed paste mode
            if (process.stdout.isTTY) {
                process.stdout.write('\x1b[?2004l');
            }
            console.log(chalk.cyan('\n\nGoodbye! 👋'));
            process.exit(0);
        });
    }

    async loadHistory() {
        try {
            const historyPath = path.join(os.homedir(), '.mcp-terminal/history.json');
            if (existsSync(historyPath)) {
                const data = await fs.readFile(historyPath, 'utf8');
                const history = JSON.parse(data);
                this.commandHistory = history.commands || [];

                // Load into readline (most recent first)
                this.rl.history = this.commandHistory.slice(-50).reverse();
            }
        } catch (error) {
            // No history, start fresh
            this.commandHistory = [];
        }
    }

    async saveToHistory(command) {
        try {
            this.commandHistory.push(command);

            // Keep last 1000 commands
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

    async handleInput(input) {
        // Ignore input during paste operations
        if (this.isPasting) {
            return;
        }

        // Check for multi-line continuation (backslash at end)
        if (input.endsWith('\\')) {
            // Remove the backslash and add to multi-line buffer
            const lineContent = input.slice(0, -1);

            if (this.isMultiLine) {
                this.multiLineBuffer += '\n' + lineContent;
            } else {
                this.multiLineBuffer = lineContent;
                this.isMultiLine = true;
            }

            // Change prompt to indicate multi-line mode
            this.rl.setPrompt(chalk.gray('  '));
            this.rl.prompt();
            return;
        }

        // If we're in multi-line mode, add final line and process
        if (this.isMultiLine) {
            const finalInput = this.multiLineBuffer + '\n' + input;
            this.multiLineBuffer = '';
            this.isMultiLine = false;

            // Reset normal prompt
            this.rl.setPrompt(chalk.green('❯ '));

            await this.processInput(finalInput);
            this.rl.prompt();
            return;
        }

        // Normal single-line input
        await this.processInput(input);
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

${chalk.green('\\')} + ${chalk.green('Enter')}   Continue on next line
${chalk.green('Enter')}        Send message

${chalk.cyan('Example:')}
${chalk.gray('❯')} This is line 1\\
${chalk.gray('  ')}and this is line 2\\
${chalk.gray('  ')}and this is line 3
${chalk.gray('(sends the complete multi-line message)')}

${chalk.gray('Just type your question for AI assistance')}
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
            // Get system context (show progress)
            setTimeout(() => this.spinner.update('Analyzing context'), 200);
            const systemInfo = this.systemDetector.getSystemInfo();
            const context = {
                ...systemInfo,
                history: this.conversationHistory.slice(-5)
            };

            // Get response (show progress)
            setTimeout(() => this.spinner.update('Processing with AI'), 500);
            let response;
            if (this.orchestrator && this.orchestrator.askCommand) {
                response = await this.orchestrator.askCommand(query, context);
            } else {
                response = await this.aiModel.askCommand(query, context);
            }

            // Stop spinner before streaming
            this.spinner.stop();

            // Add visual separator and start streaming
            console.log(); // Clean line after spinner

            // Stream response with typing indicator
            if (this.config.streaming?.enabled !== false) {
                // Brief pause before starting to type
                await new Promise(resolve => setTimeout(resolve, 200));
                await this.streamer.stream(response);
            } else {
                console.log(response);
            }

            console.log(); // New line after response

            // Add to history
            this.conversationHistory.push({ role: 'assistant', content: response });

        } catch (error) {
            this.spinner.stop();
            console.log(chalk.red(`\n❌ Error: ${error.message}`));
            console.log();
        }

        this.isProcessing = false;
    }

    showHeader() {
        console.log();
        console.log(chalk.cyan.bold('MCP Terminal Assistant'));
        console.log(chalk.gray('Claude Code Style • \\ + Enter for new line • /help for commands'));
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
    const app = new MCPClaudeStyle();
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