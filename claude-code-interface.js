#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Claude Code Style Interface
 *
 * Clean, linear interface inspired by Claude Code CLI
 * - No duplicate rendering
 * - Character streaming
 * - Inline markdown
 * - Simple prompt
 */

import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

// Configure marked for terminal rendering
marked.setOptions({
    renderer: new TerminalRenderer({
        showSectionPrefix: false,
        width: 80
    })
});

/**
 * Character Streaming Class
 * Provides progressive text rendering for natural feel
 */
class CharacterStreamer {
    constructor(outputFn, options = {}) {
        this.outputFn = outputFn;
        this.speed = options.speed || 3; // ms between characters
        this.immediate = options.immediate || false;
        this.aborted = false;
    }

    async stream(text) {
        if (this.immediate) {
            this.outputFn(text);
            return;
        }

        this.aborted = false;
        for (const char of text) {
            if (this.aborted) break;

            this.outputFn(char);

            // Variable speed for more natural feel
            if (char === '.' || char === '!' || char === '?') {
                await this.sleep(this.speed * 10); // Longer pause at sentence end
            } else if (char === ',' || char === ';') {
                await this.sleep(this.speed * 5);  // Medium pause at clause
            } else if (char === ' ') {
                await this.sleep(this.speed * 2);  // Short pause at words
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
 * Main Claude Code Style Interface
 */
class ClaudeCodeInterface {
    constructor() {
        this.rl = null;
        this.history = [];
        this.streamer = null;
        this.config = {};
        this.aiModel = null;
        this.isStreaming = false;
        this.conversationHistory = [];
    }

    async initialize() {
        // Load configuration
        await this.loadConfig();

        // Setup readline interface
        this.setupReadline();

        // Initialize AI model
        await this.initializeAI();

        // Load command history
        await this.loadHistory();

        // Setup key bindings
        this.setupKeyBindings();
    }

    async loadConfig() {
        try {
            const configPath = path.join(os.homedir(), '.mcp-terminal/config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            this.config = JSON.parse(configData);
        } catch (error) {
            console.error(chalk.yellow('Using default configuration'));
            this.config = {
                streaming: { enabled: true, speed: 3 },
                prompt: { symbol: '❯', color: 'green' },
                markdown: { enabled: true }
            };
        }
    }

    setupReadline() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            historySize: 100,
            prompt: chalk[this.config.prompt?.color || 'green'](`${this.config.prompt?.symbol || '❯'} `)
        });

        // Character streaming output function
        this.streamer = new CharacterStreamer(
            (char) => process.stdout.write(char),
            { speed: this.config.streaming?.speed || 3 }
        );
    }

    async initializeAI() {
        // Import AI model dynamically
        const ModelFactory = await import('./ai_models/model_factory.js');
        this.aiModel = await ModelFactory.default.createModel(this.config);
    }

    async loadHistory() {
        try {
            const historyPath = path.join(os.homedir(), '.mcp-terminal/history.json');
            const historyData = await fs.readFile(historyPath, 'utf8');
            const history = JSON.parse(historyData);

            // Load into readline history (most recent first for navigation)
            this.rl.history = history.commands?.slice(-50).reverse() || [];
        } catch (error) {
            // No history file, start fresh
            this.rl.history = [];
        }
    }

    setupKeyBindings() {
        // Handle Ctrl+C gracefully
        this.rl.on('SIGINT', () => {
            if (this.isStreaming) {
                // Abort streaming and show full response
                this.streamer.abort();
                this.isStreaming = false;
                console.log(chalk.gray('\n[Streaming aborted]'));
                this.rl.prompt();
            } else {
                // Exit on second Ctrl+C
                console.log(chalk.cyan('\n\nGoodbye! 👋'));
                process.exit(0);
            }
        });

        // Handle line input
        this.rl.on('line', async (input) => {
            await this.processInput(input);
        });
    }

    async processInput(input) {
        const trimmed = input.trim();

        // Skip empty input
        if (!trimmed) {
            this.rl.prompt();
            return;
        }

        // Add to conversation history
        this.conversationHistory.push({ role: 'user', content: trimmed });

        // Handle special commands
        if (trimmed.startsWith('/')) {
            await this.handleCommand(trimmed);
            this.rl.prompt();
            return;
        }

        // Process through AI
        await this.processAIQuery(trimmed);
        this.rl.prompt();
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
            case 'history':
                this.showHistory();
                break;
            case 'reset':
                this.conversationHistory = [];
                console.log(chalk.green('✓ Conversation reset'));
                break;
            case 'exit':
            case 'quit':
                console.log(chalk.cyan('\nGoodbye! 👋'));
                process.exit(0);
                break;
            default:
                console.log(chalk.red(`Unknown command: ${command}`));
                console.log(chalk.gray('Type /help for available commands'));
        }
    }

    showHelp() {
        console.log(`
${chalk.cyan('Available Commands:')}

${chalk.yellow('/help')}     Show this help message
${chalk.yellow('/clear')}    Clear the screen
${chalk.yellow('/history')}  Show command history
${chalk.yellow('/reset')}    Reset conversation context
${chalk.yellow('/exit')}     Exit the application

${chalk.gray('Just type your question for AI assistance')}
        `);
    }

    showHistory() {
        console.log(chalk.cyan('\nRecent commands:'));
        const recent = this.rl.history.slice(0, 10).reverse();
        recent.forEach((cmd, i) => {
            console.log(chalk.gray(`  ${i + 1}. ${cmd}`));
        });
    }

    async processAIQuery(query) {
        // Show thinking indicator
        process.stdout.write(chalk.gray('\nThinking...'));

        try {
            // Get AI response
            const response = await this.aiModel.askCommand(query, {
                history: this.conversationHistory.slice(-10),
                streaming: false  // Get full response first
            });

            // Clear thinking indicator
            process.stdout.write('\r' + ' '.repeat(20) + '\r');

            // Stream or display response
            if (this.config.streaming?.enabled) {
                this.isStreaming = true;
                console.log(); // New line before response

                if (this.config.markdown?.enabled) {
                    // Parse markdown and stream
                    const formatted = marked(response);
                    await this.streamer.stream(formatted);
                } else {
                    // Stream plain text
                    await this.streamer.stream(response);
                }

                this.isStreaming = false;
                console.log(); // New line after response
            } else {
                // Display immediately
                console.log();
                if (this.config.markdown?.enabled) {
                    console.log(marked(response));
                } else {
                    console.log(response);
                }
            }

            // Add to conversation history
            this.conversationHistory.push({ role: 'assistant', content: response });

            // Save to history
            await this.saveHistory(query);

        } catch (error) {
            process.stdout.write('\r' + ' '.repeat(20) + '\r');
            console.log(chalk.red(`\nError: ${error.message}`));
        }
    }

    async saveHistory(command) {
        try {
            const historyPath = path.join(os.homedir(), '.mcp-terminal/history.json');
            let history = { commands: [] };

            try {
                const existing = await fs.readFile(historyPath, 'utf8');
                history = JSON.parse(existing);
            } catch {}

            // Add new command
            history.commands.push(command);

            // Keep only last 1000 commands
            if (history.commands.length > 1000) {
                history.commands = history.commands.slice(-1000);
            }

            await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
        } catch (error) {
            // Silently fail history save
        }
    }

    showHeader() {
        console.log(chalk.cyan.bold('\nMCP Terminal Assistant'));
        console.log(chalk.gray('Claude Code Style Interface\n'));
    }

    async start() {
        console.clear();
        this.showHeader();

        // Initialize
        await this.initialize();

        console.log(chalk.green('✓ Ready\n'));
        console.log(chalk.gray('Type your question or /help for commands\n'));

        // Start prompt
        this.rl.prompt();
    }
}

// Main execution
const main = async () => {
    const app = new ClaudeCodeInterface();
    await app.start();
};

// Error handling
process.on('uncaughtException', (error) => {
    console.error(chalk.red('\nFatal error:'), error.message);
    process.exit(1);
});

// Run
main().catch(error => {
    console.error(chalk.red('Failed to start:'), error.message);
    process.exit(1);
});