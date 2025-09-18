#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Raw Input Mode Solution
 * Detecta paste interceptando o input antes do readline
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

class MCPClaudeRaw {
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

        // Input handling
        this.inputBuffer = '';
        this.isMultiLine = false;
        this.multiLineBuffer = [];

        // No longer need these paste detection variables
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
        // Setup raw mode input handling
        process.stdin.setRawMode(true);
        process.stdin.setEncoding('utf8');

        // Show prompt
        this.showPrompt();

        // Handle each character
        process.stdin.on('data', (key) => {
            this.handleRawInput(key);
        });
    }

    handleRawInput(key) {
        // Handle special keys
        if (key === '\x03') { // Ctrl+C
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

        if (key === '\x04') { // Ctrl+D
            console.log(chalk.cyan('\n\nGoodbye! 👋'));
            process.exit(0);
            return;
        }

        if (key === '\x1b') { // ESC key
            // Cancel current input
            if (this.inputBuffer.length > 0 || this.isMultiLine) {
                // Clear the current line
                process.stdout.write('\r' + ' '.repeat(80) + '\r');
                this.inputBuffer = '';
                this.multiLineBuffer = [];
                this.isMultiLine = false;
                console.log(chalk.yellow('Cancelled'));
                this.showPrompt();
            }
            return;
        }

        // Remove waiting for confirmation - we don't need it anymore

        // Handle Enter/Return
        if (key === '\r' || key === '\n') {
            // First check for backslash continuation (works for any content)
            if (this.inputBuffer.endsWith('\\')) {
                // Remove backslash from display but keep the content structure
                const currentContent = this.inputBuffer.slice(0, -1);

                // Save the entire current buffer (including multi-line pasted content)
                if (this.isMultiLine) {
                    // Already in multi-line, just add this line
                    this.multiLineBuffer.push(currentContent);
                } else if (currentContent.includes('\r') || currentContent.includes('\n')) {
                    // First time entering multi-line with pasted content
                    this.multiLineBuffer = [currentContent];
                } else {
                    // Regular single line becoming multi-line
                    this.multiLineBuffer.push(currentContent);
                }

                this.inputBuffer = '';
                this.isMultiLine = true;
                process.stdout.write('\n');
                this.showPrompt();
                return;
            }

            // Check if we have multi-line pasted content
            const hasMultipleLines = this.inputBuffer.includes('\r') || this.inputBuffer.includes('\n');

            if (hasMultipleLines && !this.isMultiLine) {
                // Process the pasted content
                process.stdout.write('\n');
                const lineCount = this.inputBuffer.split(/\r?\n/).filter(l => l.trim()).length;
                console.log(chalk.gray(`> Sending ${lineCount} lines...`));
                console.log();

                const finalInput = this.inputBuffer;
                this.inputBuffer = '';

                this.processInput(finalInput).then(() => {
                    this.showPrompt();
                });
            } else {
                // Normal single line or end of manual multi-line
                process.stdout.write('\n');

                let finalInput;
                if (this.isMultiLine) {
                    // Add current buffer to multi-line
                    this.multiLineBuffer.push(this.inputBuffer);

                    // Join everything together
                    // If the first item already has newlines (pasted content), use it as-is
                    // Otherwise join with newlines
                    if (this.multiLineBuffer[0] && (this.multiLineBuffer[0].includes('\r') || this.multiLineBuffer[0].includes('\n'))) {
                        // First element is pasted content, subsequent are typed lines
                        finalInput = this.multiLineBuffer.join('\n');
                    } else {
                        finalInput = this.multiLineBuffer.join('\n');
                    }

                    this.multiLineBuffer = [];
                    this.isMultiLine = false;
                } else {
                    finalInput = this.inputBuffer;
                }

                this.inputBuffer = '';

                if (finalInput.trim()) {
                    // Show what we're sending
                    const lines = finalInput.split(/\r?\n/).filter(l => l.trim());
                    if (lines.length > 1) {
                        console.log(chalk.gray(`> Sending ${lines.length} lines...`));
                        console.log();
                    }

                    this.processInput(finalInput).then(() => {
                        this.showPrompt();
                    });
                } else {
                    this.showPrompt();
                }
            }
            return;
        }

        // Handle backspace
        if (key === '\x7f' || key === '\b') {
            if (this.inputBuffer.length > 0) {
                // Check if we need to clear the paste indicator
                if (this.inputBuffer.includes('\n')) {
                    // Clear the whole line and redraw
                    process.stdout.write('\r' + ' '.repeat(80) + '\r');
                    this.showPrompt();

                    // Remove last character
                    this.inputBuffer = this.inputBuffer.slice(0, -1);

                    // Redraw the input
                    if (this.inputBuffer.includes('\n')) {
                        // Still multi-line, show indicator
                        const lines = this.inputBuffer.split('\n');
                        const lineCount = lines.length;
                        const charCount = this.inputBuffer.length;
                        process.stdout.write(chalk.dim(`[${lineCount} lines, ${charCount} chars] `));
                    } else {
                        // Now single line, show the text
                        process.stdout.write(this.inputBuffer);
                    }
                } else {
                    // Simple backspace for single line
                    this.inputBuffer = this.inputBuffer.slice(0, -1);
                    process.stdout.write('\b \b');
                }
            }
            return;
        }

        // Check for paste (multiple characters at once)
        if (key.length > 1) {
            // This is a paste!
            // Clear current line
            const clearLength = this.inputBuffer.length + 2; // prompt + input
            process.stdout.write('\r' + ' '.repeat(80) + '\r');

            // Pass the raw input to handlePaste
            this.handlePaste(key);
            return;
        }

        // Normal character input
        if (key.length === 1 && key >= ' ') {
            // If buffer has multi-line content, update the display
            if (this.inputBuffer.includes('\n') || this.inputBuffer.includes('\r')) {
                this.inputBuffer += key;
                // Update the indicator
                process.stdout.write('\r' + ' '.repeat(80) + '\r');
                this.showPrompt();
                const lines = this.inputBuffer.split(/\r?\n/).filter(l => l.trim());
                const lineCount = lines.length;
                const charCount = this.inputBuffer.length;
                process.stdout.write(chalk.dim(`[${lineCount} lines, ${charCount} chars] `));
            } else {
                this.inputBuffer += key;
                process.stdout.write(key);
            }
        }
    }

    handlePaste(rawInput) {
        // Detect line breaks in the pasted content
        let lines = [];

        // Try different line break styles
        if (rawInput.includes('\r\n')) {
            lines = rawInput.split('\r\n');
        } else if (rawInput.includes('\n')) {
            lines = rawInput.split('\n');
        } else if (rawInput.includes('\r')) {
            lines = rawInput.split('\r');
        } else {
            lines = [rawInput];
        }

        // Filter empty lines for counting
        const nonEmptyLines = lines.filter(l => l.trim());

        if (nonEmptyLines.length === 0) return;

        // Add pasted text to input buffer
        this.inputBuffer = rawInput;

        // Show compact indicator like Claude Code CLI
        const lineCount = nonEmptyLines.length;
        const charCount = rawInput.length;

        // Display compact paste indicator
        process.stdout.write(chalk.green('❯ '));
        process.stdout.write(chalk.dim(`[Pasted ${lineCount} lines, ${charCount} chars]`));

        // Show that user can continue typing or press Enter
        if (lineCount > 1) {
            process.stdout.write(chalk.gray(' (Enter to send)'));
        }
    }

    // Removed confirmPaste and cancelPaste - no longer needed

    showPrompt() {
        if (this.isMultiLine) {
            // Multi-line continuation prompt
            process.stdout.write(chalk.gray('  '));

            // If we have content in multiLineBuffer, show line count
            if (this.multiLineBuffer.length > 0) {
                let totalLines = 0;
                let totalChars = 0;

                for (const content of this.multiLineBuffer) {
                    if (content.includes('\r') || content.includes('\n')) {
                        // Pasted content
                        const lines = content.split(/\r?\n/);
                        totalLines += lines.filter(l => l.trim()).length;
                    } else {
                        // Single typed line
                        if (content.trim()) totalLines += 1;
                    }
                    totalChars += content.length;
                }

                if (totalLines > 0) {
                    process.stdout.write(chalk.dim(`[${totalLines}+ lines] `));
                }
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

${chalk.green('\\')} + Enter for next line

${chalk.cyan('Paste Detection:')}

Multi-line pastes are automatically detected
in raw mode and require confirmation.
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
        console.log(chalk.gray('Raw Mode • \\ + Enter for multi-line'));
        console.log(chalk.green('✨ Paste detection with confirmation'));
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
    const app = new MCPClaudeRaw();
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