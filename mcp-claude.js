#!/usr/bin/env node

/**
 * MCP Terminal Assistant - FIXED FINAL VERSION
 * Detecta paste corretamente com \r ou \n
 */

import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';
import ModelFactory from './ai_models/model_factory.js';
import SystemDetector from './src/libs/system_detector.js';
import AICommandOrchestrator from './src/ai_orchestrator.js';
import TursoHistoryClient from './src/libs/turso-client.js';
import SyncManager from './src/libs/sync-manager.js';
import { v4 as uuidv4 } from 'uuid';

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

class MCPClaudeFixedFinal {
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

        // Turso integration
        this.tursoClient = null;
        this.tursoEnabled = false;
        this.currentUser = null;
        this.currentQuery = null; // Track the currently processing query
        this.sessionId = uuidv4(); // Unique session identifier
        this.pendingSaves = new Set(); // Track async saves

        // Sync Manager for Phase 2
        this.syncManager = null;
        this.syncEnabled = false;

        // State management
        this.rawBuffer = '';  // Raw input buffer
        this.pastedContent = null;  // Stores pasted multi-line content
        this.additionalText = '';  // Text typed after paste
        this.multilineBuffer = [];  // For backslash continuation
        this.isPasted = false;  // Flag if current content is pasted
        this.lineCount = 0;  // Number of lines in pasted content
        this.wasInterrupted = false;  // Flag if processing was interrupted

        // History navigation
        this.historyIndex = -1;  // Current position in command history
        this.tempBuffer = '';  // Temporary buffer to store current input when navigating
    }

    async initialize() {
        console.log(chalk.gray('Initializing...'));
        await this.loadConfig();
        await this.initializeAI();

        // Initialize Turso after basic setup
        await this.initializeTurso();

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

    async initializeTurso() {
        try {
            const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');
            if (!existsSync(configPath)) {
                console.log(chalk.gray('ℹ️  Turso não configurado (modo offline)'));

                // Initialize SyncManager with local cache only
                await this.initializeSyncManager(null);
                return;
            }

            const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
            this.tursoClient = new TursoHistoryClient(config);
            await this.tursoClient.initialize();
            this.tursoEnabled = true;

            // TODO: Replace with dynamic user loading from UserManager when available
            // This hardcoded default is a blocker for multi-user support
            // Consider using environment variable as interim solution: process.env.USER || 'default'
            this.currentUser = { username: 'default', id: 1 };

            // Initialize SyncManager for Phase 2
            await this.initializeSyncManager(this.tursoClient);

            console.log(chalk.green('✓ Turso conectado'));
        } catch (error) {
            console.log(chalk.yellow(`⚠️  Turso indisponível: ${error.message}`));
            this.tursoEnabled = false;

            // Try to initialize SyncManager with local cache only
            await this.initializeSyncManager(null);
        }
    }

    async initializeSyncManager(tursoClient) {
        try {
            this.syncManager = new SyncManager({
                syncInterval: this.config.sync?.interval || 30000,
                debug: this.config.debug || false,
                conflictStrategy: 'last-write-wins'
            });

            await this.syncManager.initialize(tursoClient);
            this.syncEnabled = true;

            if (tursoClient) {
                console.log(chalk.green('✓ Sync habilitado') + chalk.gray(' (30s interval)'));

                // Initial sync
                setImmediate(() => {
                    this.syncManager.sync().catch(err => {
                        if (this.config.debug) {
                            console.log(chalk.gray('[Sync] Initial sync failed:', err.message));
                        }
                    });
                });
            } else {
                console.log(chalk.yellow('⚠️  Modo offline (cache local)'));
            }
        } catch (error) {
            console.log(chalk.yellow(`⚠️  SyncManager indisponível: ${error.message}`));
            this.syncEnabled = false;
        }
    }

    setupInput() {
        process.stdin.setRawMode(true);
        process.stdin.setEncoding('utf8');
        this.showPrompt();

        process.stdin.on('data', (key) => {
            this.handleInput(key);
        });
    }

    // Split text by any type of line ending
    splitLines(text) {
        // Use regex to handle all line ending types at once: \r\n, \n, \r
        // This ensures we catch all variations in a single pass
        const lines = text.split(/\r\n|\r|\n/);
        return lines;
    }

    async handleInput(key) {
        // DEBUG: Log all input if debugging
        if (process.env.DEBUG_PASTE) {
            console.log(`\n[INPUT] Length: ${key.length}, Raw: ${JSON.stringify(key.substring(0, 50))}`);
        }

        // Ctrl+C - Always exit
        if (key === '\x03') {
            await this.cleanup();
            console.log(chalk.cyan('\n\nGoodbye! 👋'));
            process.exit(0);
            return;
        }

        // Ctrl+D
        if (key === '\x04') {
            await this.cleanup();
            console.log(chalk.cyan('\n\nGoodbye! 👋'));
            process.exit(0);
            return;
        }

        // Handle arrow keys (escape sequences)
        if (key.startsWith('\x1b[')) {
            // Up arrow: \x1b[A
            if (key === '\x1b[A') {
                this.navigateHistoryUp();
                return;
            }
            // Down arrow: \x1b[B
            if (key === '\x1b[B') {
                this.navigateHistoryDown();
                return;
            }
            // Ignore other escape sequences (left/right arrows, etc.)
            return;
        }

        // ESC - Cancel input or interrupt processing
        if (key === '\x1b') {
            // If we're processing with AI, interrupt it
            if (this.isProcessing) {
                this.wasInterrupted = true;  // Set flag to prevent double prompt
                this.isProcessing = false;
                this.spinner.stop();
                this.streamer.abort();

                // TURSO INTEGRATION: Save cancelled question
                if (this.currentQuery) {
                    const queryToCancel = this.currentQuery;
                    setImmediate(() =>
                        this.saveTursoConversation(queryToCancel, null, 'cancelled')
                            .catch(err => {
                                if (this.config.debug) {
                                    console.log(`[DEBUG] Background Turso save failed (cancelled): ${err.message}`);
                                }
                            })
                    );
                    this.currentQuery = null; // Clear after handling
                }

                console.log(chalk.yellow('\n⚠ Interrupted'));
                this.showPrompt();
                return;
            }

            // Otherwise, cancel current input
            this.clearLine();
            console.log(chalk.yellow('Cancelled'));

            // Reset all state
            this.reset();

            // Show fresh prompt
            this.showPrompt();
            return;
        }

        // Enter
        if (key === '\r' || key === '\n') {
            this.handleEnter();
            return;
        }

        // Backspace
        if (key === '\x7f' || key === '\b') {
            this.handleBackspace();
            return;
        }

        // Detect paste - multiple characters at once
        // (Single \r or \n are handled above as Enter)
        if (key.length > 1) {
            if (process.env.DEBUG_PASTE) {
                console.log('[PASTE DETECTED] Sending to handlePaste');
            }
            this.handlePaste(key);
            return;
        }

        // Normal character
        if (key.length === 1 && key >= ' ') {
            this.handleChar(key);
        }
    }

    handlePaste(text) {
        // Clear current display
        this.clearLine();

        // DEBUG: Log what we received
        if (process.env.DEBUG_PASTE) {
            console.log('\n=== PASTE DEBUG ===');
            console.log('Raw length:', text.length);
            console.log('Has \\n:', text.includes('\n'));
            console.log('Has \\r:', text.includes('\r'));
            console.log('Has \\r\\n:', text.includes('\r\n'));
            // Show first 100 chars
            console.log('First 100 chars:', JSON.stringify(text.substring(0, 100)));
        }

        // Split and analyze the pasted content
        const lines = this.splitLines(text);
        const nonEmptyLines = lines.filter(l => l.trim());

        // DEBUG: Log split results
        if (process.env.DEBUG_PASTE) {
            console.log('Total lines after split:', lines.length);
            console.log('Non-empty lines:', nonEmptyLines.length);
            console.log('First 3 lines:', lines.slice(0, 3).map(l => `"${l.substring(0, 30)}"`));
            console.log('===================\n');
        }

        // Store the paste
        this.pastedContent = text;
        this.rawBuffer = text;
        this.isPasted = true;
        this.lineCount = nonEmptyLines.length;
        this.additionalText = ''; // Track text typed after paste

        // Display compact indicator
        process.stdout.write(chalk.green('❯ '));
        process.stdout.write(chalk.dim(`[Pasted ${this.lineCount} lines, ${text.length} chars] `));
    }

    handleChar(char) {
        if (this.isPasted) {
            // Add to both buffers
            this.additionalText = (this.additionalText || '') + char;
            this.rawBuffer = this.pastedContent + this.additionalText;

            // Redraw: prompt + indicator + additional text
            this.clearLine();
            process.stdout.write(chalk.green('❯ '));
            process.stdout.write(chalk.dim(`[Pasted ${this.lineCount} lines, ${this.pastedContent.length} chars] `));
            process.stdout.write(this.additionalText);
        } else {
            // Normal mode - just add to buffer and echo
            this.rawBuffer += char;
            process.stdout.write(char);
        }
    }

    handleBackspace() {
        if (this.isPasted && this.additionalText && this.additionalText.length > 0) {
            // Remove from additional text first
            this.additionalText = this.additionalText.slice(0, -1);
            this.rawBuffer = this.pastedContent + this.additionalText;

            // Redraw
            this.clearLine();
            process.stdout.write(chalk.green('❯ '));
            process.stdout.write(chalk.dim(`[Pasted ${this.lineCount} lines, ${this.pastedContent.length} chars] `));
            process.stdout.write(this.additionalText);
        } else if (!this.isPasted && this.rawBuffer.length > 0) {
            // Normal backspace
            this.rawBuffer = this.rawBuffer.slice(0, -1);
            process.stdout.write('\b \b');
        }
    }

    handleEnter() {
        // Check for backslash continuation
        if (this.rawBuffer.endsWith('\\')) {
            // IMPORTANT: Erase the backslash from the screen first!
            process.stdout.write('\b \b');

            // Remove backslash from buffer
            const content = this.rawBuffer.slice(0, -1);

            // Save to multiline buffer - handle pasted content specially
            if (this.isPasted) {
                // First line is the pasted content + any additional text (minus the \)
                const firstLineContent = this.pastedContent + this.additionalText.slice(0, -1);
                this.multilineBuffer = [{
                    content: firstLineContent,
                    lineCount: this.lineCount,  // Keep original line count
                    isPasted: true
                }];
            } else if (this.multilineBuffer.length > 0) {
                // Already in multiline mode - add this line
                this.multilineBuffer.push({
                    content: content,
                    lineCount: 1,
                    isPasted: false
                });
            } else {
                // Starting multiline mode with regular text
                this.multilineBuffer = [{
                    content: content,
                    lineCount: 1,
                    isPasted: false
                }];
            }

            // Reset for new line but keep multiline mode
            this.rawBuffer = '';
            this.isPasted = false;
            this.additionalText = '';
            process.stdout.write('\n');
            this.showMultilinePrompt();
            return;
        }

        // Process the complete input
        process.stdout.write('\n');

        let finalInput = '';
        let totalLines = 0;

        if (this.multilineBuffer.length > 0) {
            // Add current buffer to multiline
            if (this.rawBuffer) {
                this.multilineBuffer.push({
                    content: this.rawBuffer,
                    lineCount: 1,
                    isPasted: false
                });
            }

            // Combine all parts
            const parts = [];
            let hasPastedContent = false;

            for (const item of this.multilineBuffer) {
                parts.push(item.content);
                if (item.isPasted) {
                    hasPastedContent = true;
                    totalLines = item.lineCount;
                }
            }

            // Add additional lines if we had pasted content
            if (hasPastedContent) {
                const additionalLines = this.multilineBuffer.length - 1;
                if (additionalLines > 0) {
                    totalLines += additionalLines;
                }
            } else {
                totalLines = this.multilineBuffer.length;
            }

            finalInput = parts.join('\n');

            // Only show message for actual multi-line content, not just continuation
            if (hasPastedContent && totalLines > 1) {
                console.log(chalk.gray(`> Sending ${totalLines} lines...`));
                console.log();
            }
        } else if (this.isPasted) {
            // Just pasted content
            finalInput = this.rawBuffer;
            if (this.lineCount > 1) {
                console.log(chalk.gray(`> Sending ${this.lineCount} lines...`));
                console.log();
            }
        } else {
            // Normal input
            finalInput = this.rawBuffer;
        }

        // Reset state
        this.reset();

        // Process if not empty
        if (finalInput.trim()) {
            this.processInput(finalInput).then(() => {
                // Only show prompt if not interrupted
                if (!this.wasInterrupted) {
                    this.showPrompt();
                } else {
                    // Reset the flag for next time
                    this.wasInterrupted = false;
                }
            });
        } else {
            this.showPrompt();
        }
    }

    updatePasteDisplay() {
        // This method is no longer used - we update display directly
        // in handleChar and handleBackspace to avoid recalculating lines
        this.clearLine();
        process.stdout.write(chalk.green('❯ '));
        process.stdout.write(chalk.dim(`[${this.lineCount} lines, ${this.rawBuffer.length} chars]`));
    }

    showMultilinePrompt() {
        // Just show the indent for continuation lines
        // No line counter needed
        process.stdout.write(chalk.gray('  '));
    }

    showPrompt() {
        process.stdout.write(chalk.green('❯ '));
    }

    clearLine() {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
    }

    reset() {
        this.rawBuffer = '';
        this.pastedContent = null;
        this.additionalText = '';
        this.multilineBuffer = [];
        this.isPasted = false;
        this.lineCount = 0;
        this.historyIndex = -1;  // Reset history navigation
        this.tempBuffer = '';
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
                await this.cleanup();
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

${chalk.cyan('Multi-line:')}

Type ${chalk.green('\\')} at end of line + Enter for next line

${chalk.cyan('Keyboard Shortcuts:')}

${chalk.yellow('ESC')}       Cancel input / Interrupt AI processing
${chalk.yellow('Ctrl+C')}    Exit program
${chalk.yellow('Ctrl+D')}    Exit program

${chalk.cyan('Paste Detection:')}

Multi-line pastes are automatically detected
Shows as: [X lines, Y chars]
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
        this.currentQuery = query; // Store the current query for ESC handler

        // Add user message to history immediately
        this.conversationHistory.push({ role: 'user', content: query });

        this.spinner.start('Thinking');

        try {
            // Check if interrupted
            if (!this.isProcessing) {
                // Add interrupted marker to history
                this.conversationHistory.push({
                    role: 'assistant',
                    content: '[Interrompido]'
                });
                return;
            }

            setTimeout(() => {
                if (this.isProcessing) this.spinner.update('Analyzing context');
            }, 200);

            const systemInfo = this.systemDetector.getSystemInfo();
            const context = {
                ...systemInfo,
                history: this.conversationHistory.slice(-5)
            };

            // Check if interrupted
            if (!this.isProcessing) {
                // Add interrupted marker to history
                this.conversationHistory.push({
                    role: 'assistant',
                    content: '[Interrompido durante processamento]'
                });
                return;
            }

            setTimeout(() => {
                if (this.isProcessing) this.spinner.update('Processing with AI');
            }, 500);

            let response;
            if (this.orchestrator && this.orchestrator.askCommand) {
                response = await this.orchestrator.askCommand(query, context);
            } else {
                response = await this.aiModel.askCommand(query, context);
            }

            // Check if interrupted before showing response
            if (!this.isProcessing) {
                // Interrupted before getting response
                this.conversationHistory.push({
                    role: 'assistant',
                    content: '[Processamento interrompido antes da resposta]'
                });
                return;
            }

            this.spinner.stop();
            console.log();

            if (response && this.isProcessing) {
                if (this.config.streaming?.enabled !== false) {
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // Check again before streaming
                    if (!this.isProcessing) {
                        // Was interrupted during streaming - add a note
                        this.conversationHistory.push({
                            role: 'assistant',
                            content: '[Resposta interrompida]'
                        });
                        return;
                    }

                    await this.streamer.stream(response);
                } else {
                    console.log(response);
                }
                console.log();
                this.conversationHistory.push({ role: 'assistant', content: response });

                // TURSO INTEGRATION: Save completed conversation
                setImmediate(() =>
                    this.saveTursoConversation(query, response, 'completed')
                        .catch(err => {
                            if (this.config.debug) {
                                console.log(`[DEBUG] Background Turso save failed (completed): ${err.message}`);
                            }
                        })
                );
            } else if (this.isProcessing) {
                console.log(chalk.yellow('No response received from AI'));
                console.log();
            }

        } catch (error) {
            if (this.isProcessing) {
                this.spinner.stop();
                console.log(chalk.red(`\n❌ Error: ${error.message}`));
                console.log();
            }
        } finally {
            this.isProcessing = false;
            this.currentQuery = null; // Clear after processing is complete
        }
    }

    async loadHistory() {
        try {
            // Phase 2: Use SyncManager if available
            if (this.syncEnabled && this.syncManager) {
                const history = await this.syncManager.getHistory({
                    user_id: this.tursoClient?.userId || null,
                    limit: 100
                });
                this.commandHistory = history
                    .map(h => h.command)
                    .filter(cmd => cmd && cmd.trim())
                    .reverse(); // Most recent last for easier navigation
                return;
            }

            // Phase 1: Direct Turso connection
            if (this.tursoEnabled && this.tursoClient && this.tursoClient.userId) {
                const userHistory = await this.tursoClient.getHistoryFromTable('user', 100);
                this.commandHistory = userHistory
                    .map(h => h.command)
                    .filter(cmd => cmd && cmd.trim())
                    .reverse(); // Most recent last for easier navigation
                return;
            }

            // Fall back to local file
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

    navigateHistoryUp() {
        if (this.commandHistory.length === 0) return;

        // Save current input if we're starting navigation
        if (this.historyIndex === -1) {
            this.tempBuffer = this.rawBuffer;
        }

        // Move up in history
        if (this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
            const historicCommand = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];

            // Clear current line and show historic command
            this.clearLine();
            this.rawBuffer = historicCommand;
            this.isPasted = false;
            this.pastedContent = null;
            this.additionalText = '';

            process.stdout.write(chalk.green('❯ ') + historicCommand);
        }
    }

    navigateHistoryDown() {
        if (this.historyIndex === -1) return;

        // Move down in history
        this.historyIndex--;

        let commandToShow;
        if (this.historyIndex === -1) {
            // Restore original input
            commandToShow = this.tempBuffer;
        } else {
            // Show historic command
            commandToShow = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
        }

        // Clear current line and show command
        this.clearLine();
        this.rawBuffer = commandToShow;
        this.isPasted = false;
        this.pastedContent = null;
        this.additionalText = '';

        process.stdout.write(chalk.green('❯ ') + commandToShow);
    }

    showHeader() {
        console.log();
        console.log(chalk.cyan.bold('MCP Terminal Assistant'));
        console.log(chalk.gray('FIXED FINAL • \\ + Enter for multi-line'));
        console.log(chalk.green('✨ Works with all line endings'));
        console.log();
    }

    async cleanup() {
        try {
            // Close SyncManager if enabled
            if (this.syncManager) {
                this.syncManager.close();
                if (this.config.debug) {
                    console.log(chalk.gray('[Cleanup] SyncManager closed'));
                }
            }

            // Close Turso client if enabled
            if (this.tursoClient) {
                await this.tursoClient.close();
                if (this.config.debug) {
                    console.log(chalk.gray('[Cleanup] Turso client closed'));
                }
            }

            // Save any pending data to local file
            if (this.pendingSaves.size > 0) {
                await this.saveTursoConversation('[System]', 'Session ended with pending saves', 'cancelled');
            }
        } catch (error) {
            console.error(chalk.red('[Cleanup] Error during cleanup:', error.message));
        }
    }

    async saveTursoConversation(question, response, status) {
        // Phase 2: Use SyncManager when available
        if (this.syncEnabled && this.syncManager) {
            try {
                const metadata = {
                    status,
                    user_id: this.tursoClient?.userId || null,
                    machine_id: this.tursoClient?.machineId || null,
                    session_id: this.sessionId,
                    timestamp: Date.now()
                };

                // Save to local cache and queue for sync
                await this.syncManager.saveCommand(question, response, metadata);

                if (this.config.debug) {
                    console.log(chalk.gray('[Sync] Command saved to cache and queued'));
                }
                return;
            } catch (error) {
                if (this.config.debug) {
                    console.log(chalk.yellow(`[Sync] Cache save failed: ${error.message}`));
                }
                // Fall through to direct save
            }
        }

        // Fall back to direct Turso save (Phase 1)
        if (!this.tursoEnabled) return;

        // Generate unique key for this save operation
        const saveKey = `${this.sessionId}:${question.substring(0, 50)}:${status}`;

        // Check if this save is already in progress
        if (this.pendingSaves.has(saveKey)) {
            if (this.config.debug) {
                console.log('[DEBUG] Duplicate save prevented for:', saveKey);
            }
            return;
        }

        try {
            // Mark this save as in progress
            this.pendingSaves.add(saveKey);

            await this.tursoClient.saveCommand(question, response, {
                status: status,
                user: this.currentUser,
                timestamp: new Date().toISOString(),
                session_id: this.sessionId
            });
        } catch (error) {
            // Use debug logging instead of console.error
            if (this.config.debug) {
                console.log(`[DEBUG] Turso save failed: ${error.message}`);
            }
        } finally {
            // Remove from pending saves when complete
            this.pendingSaves.delete(saveKey);
        }
    }

    async start() {
        await this.initialize();
        this.showHeader();
        this.setupInput();
    }
}

// Main
const main = async () => {
    const app = new MCPClaudeFixedFinal();

    // Handle process signals for cleanup
    const handleExit = async (signal) => {
        console.log(chalk.gray(`\nReceived ${signal}, cleaning up...`));
        await app.cleanup();
        process.exit(0);
    };

    process.on('SIGINT', () => handleExit('SIGINT'));
    process.on('SIGTERM', () => handleExit('SIGTERM'));

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

// Start only if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error(chalk.red('Failed to start:'), error.message);
        process.exit(1);
    });
}

// Export the class for reuse
export default MCPClaudeFixedFinal;
