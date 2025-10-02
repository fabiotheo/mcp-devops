import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============== INTERFACES E TIPOS ==============

/**
 * Opções de configuração para o PatternAdapter
 */
export interface PatternAdapterOptions {
  /** Ativa modo debug */
  debug?: boolean;
  /** Caminho customizado para o pattern matcher */
  patternMatcherPath?: string;
}

/**
 * Resultado de um match de padrão
 */
export interface PatternMatch {
  /** Nome do padrão encontrado */
  name: string;
  /** Sequência de comandos a executar */
  sequence: Array<string | (() => Promise<unknown>)>;
  /** Confiança no match (0.0-1.0) */
  confidence?: number;
  /** Dados extraídos do padrão */
  data?: Record<string, unknown>;
  /** Função para parsear output */
  parseOutput?: (output: string) => unknown;
  /** Função para agregar resultados */
  aggregator?: (results: unknown[]) => unknown;
}

/**
 * Resultado da execução de comando
 */
export interface CommandResult {
  /** Comando executado ou função chamada */
  command?: string;
  /** Indica se está pendente de execução */
  pending?: boolean;
  /** Resultado da execução */
  result?: unknown;
  /** Erro se houver */
  error?: string;
}

/**
 * Resultado da execução de padrão
 */
export interface PatternExecutionResult {
  /** Indica sucesso da execução */
  success: boolean;
  /** Nome do padrão executado */
  pattern?: string;
  /** Resultados dos comandos */
  results?: CommandResult[];
  /** Mensagem de erro ou status */
  message?: string;
  /** Erro se falhou */
  error?: string;
}

/**
 * Interface do módulo pattern matcher
 */
interface PatternMatcherModule {
  match?: (input: string) => Promise<PatternMatch | null>;
  getSuggestions?: (partial: string) => Promise<string[]>;
  default?: PatternMatcherModule;
  PatternMatcher?: PatternMatcherModule;
  (input: string): Promise<PatternMatch | null>;
}

// ============== CLASSE PRINCIPAL ==============

/**
 * PatternAdapter
 * Adapts the pattern_matcher.ts for use with the new interface
 *
 * @example
 * ```typescript
 * const adapter = new PatternAdapter({ debug: true });
 * await adapter.initialize();
 * const match = await adapter.checkPatterns("how many IPs are blocked?");
 * ```
 */
class PatternAdapter {
  private debug: boolean;
  private patternMatcherPath: string;
  private patternMatcher: PatternMatcherModule | null;
  private initialized: boolean;

  constructor(options: PatternAdapterOptions = {}) {
    this.debug = options.debug || false;
    this.patternMatcherPath =
      options.patternMatcherPath ||
      path.join(__dirname, '..', '..', '..', 'libs', 'pattern_matcher.ts');
    this.patternMatcher = null;
    this.initialized = false;
  }

  /**
   * Inicializa o adapter carregando o pattern matcher
   * @throws {Error} Se falhar ao carregar o módulo
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import pattern matcher
      const module = await import(this.patternMatcherPath) as PatternMatcherModule;
      this.patternMatcher = module.default || module.PatternMatcher || module;

      if (this.debug) {
        console.log('[PatternAdapter] Pattern matcher loaded successfully');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[PatternAdapter] Failed to load pattern matcher:', error);
      // Pattern matching is optional, don't throw
      this.initialized = true;
    }
  }

  /**
   * Check if input matches any patterns
   * @param input - User input
   * @returns Pattern match result or null
   */
  async checkPatterns(input: string): Promise<PatternMatch | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.patternMatcher) {
      return null;
    }

    try {
      // Check if pattern matcher has the expected interface
      if (typeof this.patternMatcher.match === 'function') {
        return await this.patternMatcher.match(input);
      }

      // Check if the module itself is callable
      if (typeof this.patternMatcher === 'function') {
        return await (this.patternMatcher as (input: string) => Promise<PatternMatch | null>)(input);
      }

      return null;
    } catch (error) {
      if (this.debug) {
        console.error('[PatternAdapter] Error checking patterns:', error);
      }
      return null;
    }
  }

  /**
   * Get pattern suggestions based on partial input
   * @param partial - Partial input
   * @returns Array of suggestions
   */
  async getPatternSuggestions(partial: string): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.patternMatcher) {
      return [];
    }

    try {
      if (typeof this.patternMatcher.getSuggestions === 'function') {
        return await this.patternMatcher.getSuggestions(partial);
      }

      // Fallback to basic pattern-based suggestions
      return this.getBasicPatternSuggestions(partial);
    } catch (error) {
      if (this.debug) {
        console.error('[PatternAdapter] Error getting suggestions:', error);
      }
      return [];
    }
  }

  /**
   * Get basic pattern suggestions
   * @param partial - Partial input to match
   * @returns Filtered list of pattern suggestions
   */
  private getBasicPatternSuggestions(partial: string): string[] {
    // Common patterns for Linux commands
    const patterns: readonly string[] = [
      'how many IPs are blocked',
      'check disk usage',
      'show docker containers',
      'list running processes',
      'check system logs',
      'show network connections',
      'check memory usage',
      'list systemd services',
    ] as const;

    return patterns
      .filter(p => p.toLowerCase().includes(partial.toLowerCase()))
      .map(p => p); // Ensure we return mutable array
  }

  /**
   * Execute pattern-matched command sequence
   * @param pattern - Pattern match result
   * @returns Execution result
   */
  async executePattern(pattern: PatternMatch): Promise<PatternExecutionResult> {
    if (!pattern || !pattern.sequence) {
      return {
        success: false,
        message: 'Invalid pattern',
      };
    }

    try {
      const results: CommandResult[] = [];

      for (const command of pattern.sequence) {
        // If command is a function, execute it
        if (typeof command === 'function') {
          const result = await command();
          results.push({ result });
        } else {
          // Return command for execution by the orchestrator
          results.push({ command, pending: true });
        }
      }

      return {
        success: true,
        pattern: pattern.name,
        results,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if adapter is initialized
   * @returns Initialization status
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if pattern matcher is loaded
   * @returns True if pattern matcher is available
   */
  hasPatternMatcher(): boolean {
    return this.patternMatcher !== null;
  }

  /**
   * Get debug mode status
   * @returns Current debug mode
   */
  isDebugMode(): boolean {
    return this.debug;
  }

  /**
   * Set debug mode
   * @param enabled - Whether to enable debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debug = enabled;
  }

  /**
   * Get the pattern matcher path
   * @returns Path to the pattern matcher module
   */
  getPatternMatcherPath(): string {
    return this.patternMatcherPath;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.patternMatcher = null;
    this.initialized = false;
  }
}

export default PatternAdapter;

// Export types for external usage
export type {
  PatternMatcherModule
};
