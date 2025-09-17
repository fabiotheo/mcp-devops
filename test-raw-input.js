import { EventEmitter } from 'events';
import chalk from 'chalk';

class TestREPLInterface extends EventEmitter {
    constructor() {
        super();
    }

    initialize() {
        console.log('🧪 Testing Raw Input Implementation');
        console.log('Type some text and press Enter. Paste multiline text.');
        console.log('Use Ctrl+C to exit.');
        console.log('');

        // RAW INPUT - não processa Enter automaticamente
        process.stdin.setEncoding('utf8');

        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        this.currentLine = '';
        this.cursorPos = 0;
        this.history = [];
        this.historyIndex = -1;

        this.showPrompt();

        process.stdin.on('data', (key) => {
            this.handleRawInput(key);
        });

        this.on('line', (line) => {
            console.log(chalk.green(`\n✅ Received line: "${line}"`));
            console.log(chalk.blue(`📊 Line length: ${line.length} characters`));
            if (line.includes('\n')) {
                const lines = line.split('\n');
                console.log(chalk.yellow(`📝 Multi-line detected: ${lines.length} lines`));
                lines.forEach((l, i) => {
                    console.log(chalk.gray(`   Line ${i + 1}: "${l}"`));
                });
            }
            console.log('');
            this.showPrompt();
        });

        this.on('interrupt', () => {
            console.log(chalk.red('\n\n👋 Exiting test...'));
            this.close();
            process.exit(0);
        });
    }

    handleRawInput(key) {
        const code = key.charCodeAt(0);

        // Enter (13 ou 10)
        if (code === 13 || code === 10) {
            process.stdout.write('\n');
            if (this.currentLine.trim()) {
                this.emit('line', this.currentLine);
                this.history.unshift(this.currentLine);
                if (this.history.length > 1000) this.history.pop();
            }
            this.currentLine = '';
            this.cursorPos = 0;
            this.historyIndex = -1;
            this.showPrompt();
            return;
        }

        // Ctrl+C
        if (code === 3) {
            this.emit('interrupt');
            return;
        }

        // Backspace (127 ou 8)
        if (code === 127 || code === 8) {
            if (this.cursorPos > 0) {
                this.currentLine = this.currentLine.slice(0, this.cursorPos - 1) +
                                  this.currentLine.slice(this.cursorPos);
                this.cursorPos--;
                this.redrawLine();
            }
            return;
        }

        // Delete (27,91,51,126)
        if (key === '\x1b[3~') {
            if (this.cursorPos < this.currentLine.length) {
                this.currentLine = this.currentLine.slice(0, this.cursorPos) +
                                  this.currentLine.slice(this.cursorPos + 1);
                this.redrawLine();
            }
            return;
        }

        // Setas
        if (key.startsWith('\x1b[')) {
            this.handleArrowKeys(key);
            return;
        }

        // Ctrl+L (clear screen)
        if (code === 12) {
            console.clear();
            this.redrawLine();
            return;
        }

        // Caracteres imprimíveis
        if (code >= 32 && code <= 126) {
            this.currentLine = this.currentLine.slice(0, this.cursorPos) + key +
                              this.currentLine.slice(this.cursorPos);
            this.cursorPos++;
            this.redrawLine();
        }
    }

    handleArrowKeys(key) {
        switch(key) {
            case '\x1b[A': // Up
                if (this.historyIndex < this.history.length - 1) {
                    this.historyIndex++;
                    this.currentLine = this.history[this.historyIndex] || '';
                    this.cursorPos = this.currentLine.length;
                    this.redrawLine();
                }
                break;
            case '\x1b[B': // Down
                if (this.historyIndex > -1) {
                    this.historyIndex--;
                    this.currentLine = this.historyIndex >= 0 ? this.history[this.historyIndex] : '';
                    this.cursorPos = this.currentLine.length;
                    this.redrawLine();
                }
                break;
            case '\x1b[C': // Right
                if (this.cursorPos < this.currentLine.length) {
                    this.cursorPos++;
                    process.stdout.write('\x1b[C');
                }
                break;
            case '\x1b[D': // Left
                if (this.cursorPos > 0) {
                    this.cursorPos--;
                    process.stdout.write('\x1b[D');
                }
                break;
        }
    }

    showPrompt() {
        process.stdout.write(chalk.cyan('test> '));
    }

    redrawLine() {
        // Limpa a linha
        process.stdout.write('\r\x1b[K');
        // Mostra prompt + linha atual
        this.showPrompt();
        process.stdout.write(this.currentLine);
        // Posiciona cursor
        const targetPos = this.cursorPos;
        const currentPos = this.currentLine.length;
        if (targetPos < currentPos) {
            process.stdout.write('\x1b[' + (currentPos - targetPos) + 'D');
        }
    }

    close() {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
        process.stdin.removeAllListeners('data');
    }
}

const testInterface = new TestREPLInterface();
testInterface.initialize();