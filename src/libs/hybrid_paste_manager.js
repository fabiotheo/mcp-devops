import { EventEmitter } from 'events';
import chalk from 'chalk';

class HybridPasteManager extends EventEmitter {
    constructor(readline, options = {}) {
        super();

        this.rl = readline;

        // Estratégias habilitadas (todas por padrão)
        this.strategies = {
            bracketed: options.bracketedPaste !== false,
            timeout: options.timeoutDetection !== false,
            delimiter: options.delimiterMode !== false,
            manual: true // Sempre disponível
        };

        // Configurações
        this.delimiter = options.delimiter || '"""';
        this.timeoutMs = options.timeoutMs || 50; // 50ms para detectar paste
        this.maxTimeoutLines = options.maxTimeoutLines || 10;

        // Estado
        this.isMultilineMode = false;
        this.multilineBuffer = [];
        this.bracketedPasteBuffer = '';
        this.inBracketedPaste = false;

        // Timeout detection
        this.inputTimeout = null;
        this.lineAccumulator = [];
        this.lastLineTime = 0;

        // Estatísticas de debug
        this.stats = {
            bracketedDetections: 0,
            timeoutDetections: 0,
            delimiterDetections: 0,
            manualActivations: 0,
            falsePositives: 0
        };

        this.initialize();
    }

    initialize() {
        // DISABLED: Bracketed paste intercepta dados brutos e quebra readline
        // Usando apenas timeout detection que é mais seguro
        console.log('📋 HybridPasteManager inicializado (modo: timeout + delimiter + manual)');
    }

    /**
     * Processa uma linha de entrada do readline
     * @param {string} line - Linha recebida
     * @returns {string|null} - Linha processada ou null se acumulando
     */
    processLine(line) {
        const now = Date.now();

        // Comando /paste manual
        if (line === '/paste') {
            this.startManualMultiline();
            this.stats.manualActivations++;
            return null;
        }

        // PRIORIDADE 1: Detecção por timeout (paste automático)
        if (this.strategies.timeout && this.shouldUseTimeoutDetection(line, now)) {
            return this.handleTimeoutDetection(line, now);
        }

        // PRIORIDADE 2: Modo delimitador manual (apenas se usuário digitou explicitamente)
        if (this.strategies.delimiter && line === this.delimiter) {
            if (!this.isMultilineMode) {
                this.startDelimiterMultiline();
                this.stats.delimiterDetections++;
                return null;
            } else {
                return this.endMultiline();
            }
        }

        // Se está em modo multilinha, acumular
        if (this.isMultilineMode) {
            this.multilineBuffer.push(line);
            this.showProgress();

            // Verificar se é linha vazia dupla (modo /paste)
            if (this.multilineMode === 'manual' && line === '' &&
                this.multilineBuffer.length > 1 &&
                this.multilineBuffer[this.multilineBuffer.length - 2] === '') {
                return this.endMultiline();
            }

            return null;
        }

        // Linha normal - limpar acumulador se existir
        this.clearTimeoutAccumulator();

        return line;
    }

    shouldUseTimeoutDetection(line, now) {
        // Não usar timeout para comandos simples ou vazios
        if (line.startsWith('/') || line.trim() === '') {
            return false;
        }

        // Não usar se linha muito curta (provável comando)
        if (line.length < 20) {
            return false;
        }

        return true;
    }

    handleTimeoutDetection(line, now) {
        // Primeira linha ou muito tempo desde última linha
        if (this.lineAccumulator.length === 0 || (now - this.lastLineTime) > 1000) {
            this.lineAccumulator = [line];
            this.lastLineTime = now;

            this.inputTimeout = setTimeout(() => {
                if (this.lineAccumulator.length === 1) {
                    // Linha única - processar normal
                    const singleLine = this.lineAccumulator[0];
                    this.clearTimeoutAccumulator();
                    this.emit('line-ready', singleLine);
                }
            }, this.timeoutMs);

            return null; // Aguardar timeout
        }

        // Linha adicional chegou rapidamente
        const timeDiff = now - this.lastLineTime;
        this.lastLineTime = now;

        if (timeDiff < this.timeoutMs && this.lineAccumulator.length < this.maxTimeoutLines) {
            // Paste detectado!
            this.lineAccumulator.push(line);

            // Cancelar timeout anterior
            if (this.inputTimeout) {
                clearTimeout(this.inputTimeout);
            }

            // Novo timeout para fim do paste
            this.inputTimeout = setTimeout(() => {
                const fullText = this.lineAccumulator.join('\n');
                this.stats.timeoutDetections++;
                this.clearTimeoutAccumulator();

                this.emit('paste-detected', {
                    type: 'timeout',
                    content: fullText,
                    confidence: 0.8,
                    lineCount: this.lineAccumulator.length,
                    avgTimeDiff: timeDiff
                });
            }, this.timeoutMs * 2); // Timeout maior para fim

            return null; // Continuar acumulando
        } else {
            // Timeout muito longo ou muitas linhas - processar como linhas separadas
            const prevLines = this.lineAccumulator.slice();
            this.clearTimeoutAccumulator();

            // Emitir linhas acumuladas
            for (const prevLine of prevLines) {
                this.emit('line-ready', prevLine);
            }

            // Processar linha atual normalmente
            return line;
        }
    }

    clearTimeoutAccumulator() {
        if (this.inputTimeout) {
            clearTimeout(this.inputTimeout);
            this.inputTimeout = null;
        }
        this.lineAccumulator = [];
        this.lastLineTime = 0;
    }

    startManualMultiline() {
        this.isMultilineMode = true;
        this.multilineMode = 'manual';
        this.multilineBuffer = [];
        this.emit('multiline-start', 'manual');
        console.log(chalk.green('\n📝 Modo multilinha ativado (Enter 2x para enviar)'));
    }

    startDelimiterMultiline() {
        this.isMultilineMode = true;
        this.multilineMode = 'delimiter';
        this.multilineBuffer = [];
        this.emit('multiline-start', 'delimiter');
        console.log(chalk.green(`\n📝 Modo multilinha ativado (${this.delimiter} para enviar)`));
    }

    endMultiline() {
        const fullText = this.multilineBuffer.join('\n');
        this.isMultilineMode = false;
        this.multilineBuffer = [];
        this.multilineMode = null;
        this.emit('multiline-end', fullText);
        console.log(chalk.blue('✅ Texto multilinha capturado\n'));
        return fullText;
    }

    showProgress() {
        const lineCount = this.multilineBuffer.length;
        process.stdout.write(`\r${chalk.gray(`[${lineCount} linhas]`)}`);
    }

    getStats() {
        return { ...this.stats };
    }

    reset() {
        this.isMultilineMode = false;
        this.multilineBuffer = [];
        this.multilineMode = null;
        this.bracketedPasteBuffer = '';
        this.inBracketedPaste = false;
        this.clearTimeoutAccumulator();
    }

    cleanup() {
        this.reset();
        this.removeAllListeners();
    }
}

export default HybridPasteManager;