import { EventEmitter } from 'events';
import type AIConnector from './AIConnector.ts';
import type { CommandResult } from './AIConnector.ts';

// ============== INTERFACES E TIPOS ==============

/**
 * Opções de configuração para o CommandProcessor
 */
export interface CommandProcessorOptions {
  /** Ativa modo debug */
  debug?: boolean;
  /** Tamanho máximo do histórico de comandos */
  maxHistorySize?: number;
}

/**
 * Item do histórico de comandos
 */
export interface CommandHistoryItem {
  /** Comando executado */
  command: string;
  /** Timestamp da execução */
  timestamp: Date;
  /** Se foi processado com sucesso */
  processed: boolean;
}

/**
 * Resultado do processamento de comando
 */
export interface ProcessingResult {
  /** Indica sucesso do processamento */
  success: boolean;
  /** Mensagem de resposta */
  message?: string;
  /** Tipo de resposta */
  type?: 'help' | 'system' | 'status' | 'history' | 'exit' | 'ai' | 'error';
  /** Dados adicionais */
  data?: any;
  /** Mensagem de erro */
  error?: string;
  /** Resposta do AI */
  response?: string;
  /** Comandos executados */
  executedCommands?: string[];
}

/**
 * Status do sistema
 */
export interface SystemStatus {
  /** Se está processando comando */
  processing: boolean;
  /** Tamanho da fila de comandos */
  queueLength: number;
  /** Tamanho do histórico */
  historySize: number;
  /** Modo debug ativo */
  debugMode: boolean;
  /** AI conectado */
  aiConnected: boolean;
}

/**
 * Handler para comandos built-in
 */
type BuiltinCommandHandler = (args: string[]) => ProcessingResult | Promise<ProcessingResult>;

/**
 * Eventos emitidos pelo CommandProcessor
 */
export interface CommandProcessorEvents {
  'processing-start': (command: string) => void;
  'processing-complete': (result: ProcessingResult) => void;
  'processing-error': (error: Error) => void;
  'clear-screen': () => void;
  'exit-request': () => void;
  'multiline-detected': (lines: string[]) => void;
  'debug-mode': (enabled: boolean) => void;
}

// Interface para EventEmitter tipado
interface TypedEventEmitter<TEvents extends Record<string, any>> {
  on<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    handler: TEvents[TEventName]
  ): this;

  emit<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    ...args: Parameters<TEvents[TEventName]>
  ): boolean;

  removeAllListeners(): this;
}

// ============== CLASSE PRINCIPAL ==============

/**
 * CommandProcessor
 * Handles command processing, validation, and routing
 *
 * @example
 * ```typescript
 * const processor = new CommandProcessor(aiConnector, { debug: true });
 * const result = await processor.processInput("ls -la");
 * ```
 */
class CommandProcessor extends EventEmitter implements TypedEventEmitter<CommandProcessorEvents> {
  private aiConnector: AIConnector;
  private debug: boolean;
  private commandQueue: string[];
  private processing: boolean;
  private commandHistory: CommandHistoryItem[];
  private maxHistorySize: number;
  private builtinCommands: Record<string, BuiltinCommandHandler>;

  constructor(aiConnector: AIConnector, options: CommandProcessorOptions = {}) {
    super();
    this.aiConnector = aiConnector;
    this.debug = options.debug || false;
    this.commandQueue = [];
    this.processing = false;
    this.commandHistory = [];
    this.maxHistorySize = options.maxHistorySize || 100;

    // Built-in commands
    this.builtinCommands = {
      '/help': this.showHelp.bind(this),
      '/clear': this.clearScreen.bind(this),
      '/debug': this.toggleDebug.bind(this),
      '/status': this.showStatus.bind(this),
      '/history': this.showHistory.bind(this),
      '/exit': this.exitApp.bind(this),
      '/quit': this.exitApp.bind(this),
    };
  }

  /**
   * Process a command from the UI
   * @param input - User input
   * @returns Processing result
   */
  async processInput(input: string): Promise<ProcessingResult> {
    if (!input || !input.trim()) {
      return { success: false, message: 'Empty command' };
    }

    const trimmedInput = input.trim();

    // Add to history
    this.addToHistory(trimmedInput);

    // Check for built-in commands
    if (trimmedInput.startsWith('/')) {
      return this.handleBuiltinCommand(trimmedInput);
    }

    // Check for special patterns (like paste detection)
    if (this.detectMultilineCommand(trimmedInput)) {
      return this.handleMultilineCommand(trimmedInput);
    }

    // Process through AI orchestrator
    return this.processAICommand(trimmedInput);
  }

  /**
   * Handle built-in commands
   * @param command - Command to handle
   * @returns Processing result
   */
  private async handleBuiltinCommand(command: string): Promise<ProcessingResult> {
    const [cmd, ...args] = command.split(' ');
    const handler = this.builtinCommands[cmd];

    if (handler) {
      return handler(args);
    }

    return {
      success: false,
      message: `Unknown command: ${cmd}. Type /help for available commands.`,
      type: 'error'
    };
  }

  /**
   * Process command through AI orchestrator
   * @param command - Command to process
   * @returns Processing result
   */
  private async processAICommand(command: string): Promise<ProcessingResult> {
    if (this.processing) {
      this.commandQueue.push(command);
      return {
        success: true,
        message: 'Command queued for processing...',
        type: 'system'
      };
    }

    this.processing = true;
    this.emit('processing-start', command);

    try {
      const result = await this.aiConnector.processCommand(command);

      this.processing = false;
      this.emit('processing-complete', { ...result, type: 'ai' });

      // Process next queued command if any
      if (this.commandQueue.length > 0) {
        const nextCommand = this.commandQueue.shift();
        if (nextCommand) {
          setImmediate(() => this.processAICommand(nextCommand));
        }
      }

      return {
        success: true,
        type: 'ai',
        ...result,
      };
    } catch (error) {
      this.processing = false;
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.emit('processing-error', errorObj);

      return {
        success: false,
        error: errorObj.message,
        message: 'Error processing command. Please try again.',
        type: 'error'
      };
    }
  }

  /**
   * Detect if input is multiline command
   * @param input - Input to check
   * @returns True if multiline
   */
  private detectMultilineCommand(input: string): boolean {
    return input.includes('\n');
  }

  /**
   * Handle multiline commands (like pasted scripts)
   * @param input - Multiline input
   * @returns Processing result
   */
  private async handleMultilineCommand(input: string): Promise<ProcessingResult> {
    const lines = input.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return {
        success: false,
        message: 'Empty multiline input',
        type: 'error'
      };
    }

    this.emit('multiline-detected', lines);

    // Process as a script or batch command
    return this.processAICommand(input);
  }

  /**
   * Add command to history
   * @param command - Command to add
   */
  private addToHistory(command: string): void {
    this.commandHistory.push({
      command,
      timestamp: new Date(),
      processed: true,
    });

    // Limit history size
    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory = this.commandHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Show help information
   * @returns Help result
   */
  private showHelp(): ProcessingResult {
    const helpText = `
Available Commands:
  /help     - Show this help message
  /clear    - Clear the screen
  /debug    - Toggle debug mode
  /status   - Show system status
  /history  - Show command history
  /exit     - Exit the application
  /quit     - Exit the application

Regular Commands:
  - Type any Linux command or question
  - Paste multi-line scripts
  - Use Tab for auto-completion
  - Use ↑/↓ for command history
`;
    return {
      success: true,
      message: helpText,
      type: 'help',
    };
  }

  /**
   * Clear screen command
   * @returns Clear result
   */
  private clearScreen(): ProcessingResult {
    this.emit('clear-screen');
    return {
      success: true,
      message: 'Screen cleared',
      type: 'system',
    };
  }

  /**
   * Toggle debug mode
   * @param args - Command arguments
   * @returns Toggle result
   */
  private toggleDebug(args: string[]): ProcessingResult {
    const enabled = args[0] === 'on' || (!args[0] && !this.debug);
    this.debug = enabled;
    this.aiConnector.setDebugMode(enabled);
    this.emit('debug-mode', enabled);

    return {
      success: true,
      message: `Debug mode ${enabled ? 'enabled' : 'disabled'}`,
      type: 'system',
    };
  }

  /**
   * Show system status
   * @returns Status result
   */
  private showStatus(): ProcessingResult {
    const status: SystemStatus = {
      processing: this.processing,
      queueLength: this.commandQueue.length,
      historySize: this.commandHistory.length,
      debugMode: this.debug,
      aiConnected: this.aiConnector.isInitialized(),
    };

    return {
      success: true,
      message: JSON.stringify(status, null, 2),
      type: 'status',
      data: status,
    };
  }

  /**
   * Show command history
   * @returns History result
   */
  private showHistory(): ProcessingResult {
    const recent = this.commandHistory.slice(-10);
    const historyText = recent
      .map((item, index) => `${index + 1}. ${item.command}`)
      .join('\n');

    return {
      success: true,
      message: `Recent Commands:\n${historyText}`,
      type: 'history',
    };
  }

  /**
   * Exit application
   * @returns Exit result
   */
  private exitApp(): ProcessingResult {
    this.emit('exit-request');
    return {
      success: true,
      message: 'Goodbye!',
      type: 'exit',
    };
  }

  /**
   * Get suggestions for auto-complete
   * @param partial - Partial command
   * @returns Array of suggestions
   */
  async getSuggestions(partial: string): Promise<string[]> {
    // Check for built-in commands
    if (partial.startsWith('/')) {
      return Object.keys(this.builtinCommands).filter(cmd =>
        cmd.startsWith(partial),
      );
    }

    // Get AI suggestions
    return this.aiConnector.getSuggestions(partial);
  }

  /**
   * Get current command history
   * @returns Command history
   */
  getHistory(): CommandHistoryItem[] {
    return [...this.commandHistory];
  }

  /**
   * Clear command history
   */
  clearHistory(): void {
    this.commandHistory = [];
  }

  /**
   * Check if processor is busy
   * @returns Processing status
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Get queue length
   * @returns Number of queued commands
   */
  getQueueLength(): number {
    return this.commandQueue.length;
  }

  /**
   * Clear command queue
   */
  clearQueue(): void {
    this.commandQueue = [];
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.removeAllListeners();
    this.commandQueue = [];
    this.commandHistory = [];
    this.processing = false;
  }
}

export default CommandProcessor;

// Export types for external usage
export type {
  BuiltinCommandHandler,
  TypedEventEmitter
};