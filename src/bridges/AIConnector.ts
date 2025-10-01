import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============== INTERFACES E TIPOS ==============

/**
 * Mensagem no histórico de conversação
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Opções de configuração para o AIConnector
 */
export interface AIConnectorOptions {
  /** Ativa modo debug com logs detalhados */
  debug?: boolean;
  /** Caminho customizado para o orchestrador */
  orchestratorPath?: string;
}

/**
 * Contexto adicional para processamento de comandos
 */
export interface CommandContext {
  /** Indica se é uma sessão interativa */
  interactive?: boolean;
  /** Origem da requisição */
  source?: string;
  /** ID do usuário */
  userId?: string;
  /** Histórico de conversação */
  conversationHistory?: ConversationMessage[];
  /** Metadados adicionais */
  metadata?: Record<string, unknown>;
}

/**
 * Resultado do processamento de comando
 */
export interface CommandResult {
  /** Indica se o comando foi processado com sucesso */
  success: boolean;
  /** Resposta do AI */
  response?: string;
  /** Dados estruturados da resposta */
  data?: unknown;
  /** Mensagem de erro se falhou */
  error?: string;
  /** Sugestão para correção se falhou */
  suggestion?: string;
  /** Comandos executados */
  executedCommands?: string[];
  /** Metadados da resposta */
  metadata?: Record<string, unknown>;
}

/**
 * Interface do módulo orchestrador
 */
interface OrchestratorModule {
  processUserQuery: (
    command: string,
    context: CommandContext
  ) => Promise<CommandResult>;
  getSuggestions?: (partial: string) => Promise<string[]>;
  setDebugMode?: (enabled: boolean) => void;
  cleanup?: () => Promise<void>;
}

/**
 * Eventos emitidos pelo AIConnector
 */
export interface AIConnectorEvents {
  initialized: () => void;
  processing: (data: { command: string; context: CommandContext }) => void;
  result: (result: CommandResult) => void;
  error: (error: Error) => void;
  'debug-mode': (enabled: boolean) => void;
  [key: string]: (...args: never[]) => void;
}

// Tipo para EventEmitter tipado
interface TypedEventEmitter<TEvents extends Record<string, (...args: never[]) => void>> {
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
 * AIConnector Bridge
 * Connects the Ink UI with the existing AI orchestrator
 *
 * @example
 * ```typescript
 * const connector = new AIConnector({ debug: true });
 * await connector.initialize();
 * const result = await connector.processCommand("How to list files?");
 * ```
 */
class AIConnector extends EventEmitter implements TypedEventEmitter<AIConnectorEvents> {
  private debug: boolean;
  private orchestratorPath: string;
  private initialized: boolean = false;
  private orchestratorModule: OrchestratorModule | null = null;

  constructor(options: AIConnectorOptions = {}) {
    super();
    this.debug = options.debug || false;
    this.orchestratorPath =
      options.orchestratorPath ||
      path.join(__dirname, '..', 'ai_orchestrator_bash.ts');
  }

  /**
   * Inicializa o conector carregando o módulo orchestrador
   * @throws {Error} Se falhar ao carregar o orchestrador
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import the AI orchestrator
      this.orchestratorModule = await import(this.orchestratorPath) as OrchestratorModule;

      if (this.debug) {
        console.log('[AIConnector] AI Orchestrator loaded successfully');
      }

      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.error('[AIConnector] Failed to load AI orchestrator:', errorObj);
      this.emit('error', errorObj);
      throw errorObj;
    }
  }

  /**
   * Process a command through the AI orchestrator
   * @param command - The command to process
   * @param context - Additional context
   * @returns The AI response
   */
  async processCommand(
    command: string,
    context: CommandContext = {}
  ): Promise<CommandResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.debug) {
      console.log(`[AIConnector] Processing command: ${command}`);
    }

    this.emit('processing', { command, context });

    try {
      if (!this.orchestratorModule) {
        throw new Error('Orchestrator module not loaded');
      }

      // Call the AI orchestrator's main function
      const result = await this.orchestratorModule.processUserQuery(command, {
        ...context,
        interactive: true,
        source: context.source || 'ink-interface',
      });

      if (this.debug) {
        console.log('[AIConnector] Result:', result);
      }

      this.emit('result', result);
      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.error('[AIConnector] Error processing command:', errorObj);
      this.emit('error', errorObj);

      return {
        success: false,
        error: errorObj.message,
        suggestion:
          'Try rephrasing your command or check the logs for more details',
      };
    }
  }

  /**
   * Get command suggestions based on partial input
   * @param partial - Partial command
   * @returns Array of suggestions
   */
  async getSuggestions(partial: string): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      if (this.orchestratorModule?.getSuggestions) {
        return await this.orchestratorModule.getSuggestions(partial);
      }

      // Fallback to basic suggestions
      return this.getBasicSuggestions(partial);
    } catch (error) {
      if (this.debug) {
        console.error('[AIConnector] Error getting suggestions:', error);
      }
      return [];
    }
  }

  /**
   * Get basic command suggestions (fallback)
   * @param partial - Partial command
   * @returns Array of basic command suggestions
   */
  private getBasicSuggestions(partial: string): string[] {
    const commands: readonly string[] = [
      'help',
      'status',
      'clear',
      'history',
      'debug on',
      'debug off',
      'config',
      'version',
    ] as const;

    return commands
      .filter(cmd => cmd.toLowerCase().startsWith(partial.toLowerCase()))
      .map(cmd => cmd); // Ensure we return mutable array
  }

  /**
   * Enable or disable debug mode
   * @param enabled - Whether to enable debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debug = enabled;
    this.emit('debug-mode', enabled);

    if (this.orchestratorModule?.setDebugMode) {
      this.orchestratorModule.setDebugMode(enabled);
    }
  }

  /**
   * Check if debug mode is enabled
   * @returns Current debug mode status
   */
  isDebugMode(): boolean {
    return this.debug;
  }

  /**
   * Check if connector is initialized
   * @returns Initialization status
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the orchestrator path
   * @returns Path to the orchestrator module
   */
  getOrchestratorPath(): string {
    return this.orchestratorPath;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.orchestratorModule?.cleanup) {
        await this.orchestratorModule.cleanup();
      }
    } catch (error) {
      if (this.debug) {
        console.error('[AIConnector] Error during cleanup:', error);
      }
    } finally {
      this.removeAllListeners();
      this.initialized = false;
      this.orchestratorModule = null;
    }
  }
}

export default AIConnector;

// Export types for external usage
export type {
  OrchestratorModule,
  TypedEventEmitter
};
