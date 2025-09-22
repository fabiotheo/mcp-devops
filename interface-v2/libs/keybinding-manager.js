#!/usr/bin/env node

/**
 * KeybindingManager - Gerenciador de atalhos de teclado
 * Implementa atalhos similares ao Claude Code
 */

import readline from 'readline';
import chalk from 'chalk';

export default class KeybindingManager {
    constructor(rl, options = {}) {
        this.rl = rl;
        this.enabled = true;
        this.callbacks = new Map();
        this.currentInput = '';
        this.isProcessing = false;

        // Configurações padrão de keybindings
        this.bindings = {
            escape: 'escape',
            clearLine: 'ctrl+u',
            clearScreen: 'ctrl+l',
            clearToEnd: 'ctrl+k',
            clearWord: 'ctrl+w',
            interrupt: 'ctrl+c',
            eof: 'ctrl+d',
            ...options.bindings
        };
    }

    /**
     * Inicializa o sistema de keybindings
     */
    initialize() {
        // Ativa modo raw para capturar teclas especiais
        if (process.stdin.isTTY) {
            readline.emitKeypressEvents(process.stdin, this.rl);

            // Configura raw mode temporariamente quando necessário
            this.setupKeypressListener();
        }
    }

    /**
     * Configura listener de teclas
     */
    setupKeypressListener() {
        process.stdin.on('keypress', (str, key) => {
            if (!this.enabled || this.isProcessing) return;

            // Processa tecla pressionada
            this.handleKeypress(str, key);
        });
    }

    /**
     * Processa tecla pressionada
     */
    handleKeypress(str, key) {
        if (!key) return;

        // ESC - Cancela input
        if (key.name === 'escape') {
            this.handleEscape();
            return;
        }

        // Ctrl+U - Limpa linha
        if (key.ctrl && key.name === 'u') {
            this.handleClearLine();
            return;
        }

        // Ctrl+L - Limpa tela
        if (key.ctrl && key.name === 'l') {
            this.handleClearScreen();
            return;
        }

        // Ctrl+K - Apaga até o fim
        if (key.ctrl && key.name === 'k') {
            this.handleClearToEnd();
            return;
        }

        // Ctrl+W - Apaga palavra
        if (key.ctrl && key.name === 'w') {
            this.handleClearWord();
            return;
        }

        // Ctrl+A - Início da linha
        if (key.ctrl && key.name === 'a') {
            this.moveCursorToStart();
            return;
        }

        // Ctrl+E - Fim da linha
        if (key.ctrl && key.name === 'e') {
            this.moveCursorToEnd();
            return;
        }

        // Executa callbacks customizados
        const binding = this.getBindingString(key);
        if (this.callbacks.has(binding)) {
            const callback = this.callbacks.get(binding);
            callback(str, key);
        }
    }

    /**
     * ESC - Cancela input atual
     */
    handleEscape() {
        if (this.rl.line && this.rl.line.length > 0) {
            // Limpa a linha atual
            this.rl.write(null, { ctrl: true, name: 'u' });

            // Feedback visual
            process.stdout.write(chalk.gray('(cancelado)\n'));

            // Reexibe prompt
            this.rl.prompt();
        }

        // Dispara evento de cancelamento
        this.emit('cancel');
    }

    /**
     * Ctrl+U - Limpa linha
     */
    handleClearLine() {
        if (this.rl.line) {
            // Move para início e limpa
            this.rl.write(null, { ctrl: true, name: 'a' });
            this.rl.write(null, { ctrl: true, name: 'k' });
        }
    }

    /**
     * Ctrl+L - Limpa tela
     */
    handleClearScreen() {
        console.clear();

        // Reexibe prompt com conteúdo atual
        if (this.rl.line) {
            const currentLine = this.rl.line;
            this.rl.write(null, { ctrl: true, name: 'u' });
            this.rl.prompt();
            this.rl.write(currentLine);
        } else {
            this.rl.prompt();
        }

        this.emit('clearScreen');
    }

    /**
     * Ctrl+K - Apaga até o fim da linha
     */
    handleClearToEnd() {
        if (this.rl.cursor < this.rl.line.length) {
            const beforeCursor = this.rl.line.substring(0, this.rl.cursor);
            this.rl.line = beforeCursor;
            this.rl.write(null, { ctrl: true, name: 'k' });
        }
    }

    /**
     * Ctrl+W - Apaga palavra anterior
     */
    handleClearWord() {
        if (this.rl.line && this.rl.cursor > 0) {
            const beforeCursor = this.rl.line.substring(0, this.rl.cursor);
            const afterCursor = this.rl.line.substring(this.rl.cursor);

            // Encontra início da palavra
            let wordStart = beforeCursor.trimEnd().lastIndexOf(' ');
            wordStart = wordStart === -1 ? 0 : wordStart + 1;

            // Atualiza linha
            const newBefore = beforeCursor.substring(0, wordStart);
            this.rl.line = newBefore + afterCursor;
            this.rl.cursor = newBefore.length;

            // Reescreve linha
            this.rl.write(null, { ctrl: true, name: 'u' });
            this.rl.write(this.rl.line);

            // Reposiciona cursor
            const movesBack = afterCursor.length;
            for (let i = 0; i < movesBack; i++) {
                this.rl.write(null, { name: 'left' });
            }
        }
    }

    /**
     * Move cursor para início
     */
    moveCursorToStart() {
        this.rl.write(null, { ctrl: true, name: 'a' });
    }

    /**
     * Move cursor para fim
     */
    moveCursorToEnd() {
        this.rl.write(null, { ctrl: true, name: 'e' });
    }

    /**
     * Registra callback para keybinding
     */
    on(binding, callback) {
        this.callbacks.set(binding, callback);
    }

    /**
     * Remove callback
     */
    off(binding) {
        this.callbacks.delete(binding);
    }

    /**
     * Emite evento
     */
    emit(event, ...args) {
        if (this.callbacks.has(event)) {
            const callback = this.callbacks.get(event);
            callback(...args);
        }
    }

    /**
     * Converte key object para string
     */
    getBindingString(key) {
        let parts = [];

        if (key.ctrl) parts.push('ctrl');
        if (key.meta) parts.push('meta');
        if (key.shift) parts.push('shift');

        if (key.name) {
            parts.push(key.name);
        } else if (key.sequence) {
            parts.push(key.sequence);
        }

        return parts.join('+');
    }

    /**
     * Desativa temporariamente keybindings
     */
    disable() {
        this.enabled = false;
    }

    /**
     * Reativa keybindings
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Define flag de processamento
     */
    setProcessing(value) {
        this.isProcessing = value;
    }

    /**
     * Obtém descrição dos atalhos
     */
    getShortcutsDescription() {
        return {
            'ESC': 'Cancela input atual',
            'Ctrl+U': 'Limpa linha',
            'Ctrl+L': 'Limpa tela',
            'Ctrl+K': 'Apaga até o fim',
            'Ctrl+W': 'Apaga palavra',
            'Ctrl+A': 'Início da linha',
            'Ctrl+E': 'Fim da linha',
            'Ctrl+C': 'Interrompe execução',
            'Ctrl+D': 'Finaliza multi-linha'
        };
    }

    /**
     * Cleanup
     */
    destroy() {
        this.callbacks.clear();
        this.enabled = false;
    }
}