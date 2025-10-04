import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs/promises';
import type { Row, InValue } from '@libsql/client';
import { debugLog } from '../../utils/debugLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============== INTERFACES E TIPOS ==============

/**
 * Resultado de salvar mensagem
 */
interface SaveMessageResult {
  id: string;
  timestamp: number;
}

/**
 * Estatísticas do usuário
 */
interface UserStats {
  totalCommands: number;
  lastCommandTime?: number;
}

/**
 * Resultado de limpar histórico
 */
interface ClearHistoryResult {
  deletedCount: number;
}

/**
 * Opções de configuração para o TursoAdapter
 */
export interface TursoAdapterOptions {
  /** Ativa modo debug */
  debug?: boolean;
  /** ID do usuário */
  userId?: string;
  /** Caminho customizado para o cliente Turso */
  tursoClientPath?: string;
}

/**
 * Configuração do Turso
 */
export interface TursoConfig {
  /** URL do banco de dados */
  databaseUrl?: string;
  /** Token de autenticação */
  authToken?: string;
  /** Modo de operação */
  mode?: 'local' | 'remote' | 'hybrid';
  /** Outras configurações */
  [key: string]: unknown;
}

/**
 * Entrada de histórico
 */
export interface HistoryEntry {
  /** ID da entrada */
  id?: string;
  /** Comando executado */
  command: string;
  /** Resposta do comando */
  response?: string | null;
  /** Timestamp da execução */
  timestamp?: number | Date;
  /** Status da execução */
  status?: string;
  /** ID da requisição */
  request_id?: string;
  /** Metadados adicionais */
  metadata?: Record<string, unknown>;
}

/**
 * Informações do usuário
 */
export interface UserInfo {
  /** ID do usuário */
  id: string;
  /** Nome do usuário */
  username: string;
  /** Email do usuário */
  email?: string;
  /** Data de criação */
  created_at?: Date;
}

/**
 * Resultado de execução SQL
 */
interface SqlExecuteResult {
  /** Linhas retornadas */
  rows: Row[];
  /** Número de linhas afetadas */
  rowsAffected: number;
}

/**
 * Interface do cliente SQL
 */
interface SqlClient {
  execute: (query: { sql: string; args: InValue[] }) => Promise<SqlExecuteResult>;
}

/**
 * Interface do módulo TursoHistoryClient
 */
interface TursoHistoryClientModule {
  initialize: () => Promise<void>;
  setUser: (userId: string) => Promise<UserInfo | null>;
  saveCommand: (command: string, response: string | null, metadata?: Record<string, unknown>) => Promise<SaveMessageResult>;
  saveToUser: (command: string, response: string | null, metadata?: Record<string, unknown>) => Promise<SaveMessageResult>;
  updateEntry: (entryId: string, updates: Record<string, unknown>) => Promise<void>;
  updateUserEntry: (entryId: string, updates: Record<string, unknown>) => Promise<void>;
  getHistory: (limit: number) => Promise<HistoryEntry[]>;
  searchHistory: (query: string, options: Record<string, unknown>) => Promise<HistoryEntry[]>;
  close?: () => Promise<void>;
  sessionId?: string;
  machineId?: string;
  mode?: string;
  client?: SqlClient;
}

// ============== CLASSE PRINCIPAL ==============

/**
 * TursoAdapter
 * Integrates Turso distributed history with the new interface
 *
 * @example
 * ```typescript
 * const adapter = new TursoAdapter({ debug: true, userId: 'john' });
 * await adapter.initialize();
 * await adapter.saveCommand('ls -la', { response: 'file list...' });
 * ```
 */
class TursoAdapter {
  private debug: boolean;
  private userId: string;
  private tursoClientPath: string;
  private configPath: string;
  private tursoClient: TursoHistoryClientModule | null;
  private initialized: boolean;
  private enabled: boolean;

  constructor(options: TursoAdapterOptions = {}) {
    this.debug = options.debug || false;
    this.userId = options.userId || 'default';
    this.tursoClientPath =
      options.tursoClientPath ||
      path.join(__dirname, '..', '..', 'libs', 'turso-client.js');
    this.configPath = path.join(
      os.homedir(),
      '.mcp-terminal',
      'config.json',
    );
    this.tursoClient = null;
    this.initialized = false;
    this.enabled = false;
  }

  /**
   * Inicializa o adapter Turso
   * @throws {Error} Se falhar ao carregar o cliente
   */
  async initialize(): Promise<void> {
    debugLog('[TursoAdapter] initialize() called', {
      userId: this.userId,
      initialized: this.initialized
    }, true); // Always log this

    if (this.initialized) {
      debugLog('[TursoAdapter] Already initialized, skipping...', {}, true);
      return;
    }

    try {
      // Check if Turso is configured
      debugLog('[TursoAdapter] Checking config...', {}, true);
      const configExists = await this.checkConfig();
      debugLog('[TursoAdapter] Config exists', { configExists }, true);

      if (!configExists) {
        debugLog('[TursoAdapter] Turso not configured, running in offline mode', {}, true);
        this.initialized = true;
        return;
      }

      // Load Turso client
      debugLog('[TursoAdapter] Loading Turso client module...', { path: this.tursoClientPath }, true);
      const module = await import(this.tursoClientPath) as { default?: unknown; TursoHistoryClient?: unknown };
      const TursoHistoryClient = module.default || module.TursoHistoryClient;
      debugLog('[TursoAdapter] Turso client module loaded', { hasDefault: !!module.default, hasNamed: !!module.TursoHistoryClient }, true);

      // Load configuration
      debugLog('[TursoAdapter] Loading configuration...', {}, true);
      const config: TursoConfig = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
      debugLog('[TursoAdapter] Configuration loaded', { 
        hasTursoUrl: !!config.turso_url,
        hasTursoToken: !!config.turso_token,
        hasDatabaseUrl: !!config.databaseUrl,
        hasAuthToken: !!config.authToken,
        configKeys: Object.keys(config).filter(k => k.toLowerCase().includes('turso') || k.toLowerCase().includes('database') || k.toLowerCase().includes('auth'))
      }, true);

      // Initialize client
      debugLog('[TursoAdapter] Creating TursoClient instance...', { debug: this.debug }, true);
      this.tursoClient = new (TursoHistoryClient as unknown as new (config: TursoConfig) => TursoHistoryClientModule)({
        ...config,
        debug: this.debug,
      });
      debugLog('[TursoAdapter] TursoClient instance created', { 
        hasInitialize: typeof this.tursoClient.initialize === 'function',
        clientType: this.tursoClient.constructor.name 
      }, true);

      // Initialize with timeout to prevent hanging
      debugLog('[TursoAdapter] Initializing TursoClient...', {}, true);
      await Promise.race([
        this.tursoClient.initialize(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Turso initialization timeout after 5s')), 5000)
        )
      ]);
      debugLog('[TursoAdapter] ✓ TursoClient initialized successfully', {}, true);

      // Set the user - this will throw if user doesn't exist
      debugLog('[TursoAdapter] About to set user', { userId: this.userId }, true);
      if (this.userId && this.userId !== 'default') {
        debugLog('[TursoAdapter] Calling setUser...', { userId: this.userId }, true);
        await this.tursoClient.setUser(this.userId);
        debugLog('[TursoAdapter] User set successfully', { userId: this.userId }, true);
      } else {
        debugLog('[TursoAdapter] Skipping setUser (default user or empty)', { userId: this.userId }, true);
      }

      this.initialized = true;
      this.enabled = true;
      debugLog('[TursoAdapter] Adapter fully initialized', { enabled: this.enabled }, true);
    } catch (err: any) {
      debugLog('[TursoAdapter] Initialization failed', { 
        error: err?.message, 
        stack: err?.stack,
        isUserNotFound: err?.message?.startsWith?.('USER_NOT_FOUND')
      }, true);

      // Re-throw user not found errors - these should stop the system
      if (err?.message?.startsWith?.('USER_NOT_FOUND')) {
        throw err;
      }

      // Other errors are logged but not thrown (offline mode)
      console.error('[TursoAdapter] Error during initialization:', err?.message);
      this.initialized = true; // Mark as initialized even on error (offline mode)
    }
  }

  /**
   * Verifica se existe configuração do Turso
   * @returns True se a configuração existe
   */
  private async checkConfig(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if Turso is connected and ready
   * @returns Connection status
   */
  isConnected(): boolean {
    return this.enabled && this.tursoClient !== null;
  }

  /**
   * Add command to history (alias for saveCommand)
   * @param command - Command to save
   * @param response - Command response
   * @returns Success status
   */
  async addToHistory(command: string, response: string | null = null): Promise<boolean> {
    return this.saveCommand(command, { response });
  }

  /**
   * Save only the question/command immediately (without response)
   * @param command - Command to save
   * @returns The ID of the saved entry or null
   */
  async saveQuestion(command: string): Promise<string | null> {
    if (!this.enabled || !this.tursoClient) {
      return null;
    }

    try {
      // Save command without response (will be updated later)
      const result = await this.tursoClient.saveCommand(
        command,
        null, // No response yet
        {
          source: 'ink-interface',
          status: 'pending', // Mark as pending response
        },
      );

      const entryId = typeof result === 'string' ? result : result.id;

      if (this.debug) {
        console.log(`[TursoAdapter] Question saved with ID: ${entryId}`);
      }

      return entryId;
    } catch (error) {
      if (this.debug) {
        console.error('[TursoAdapter] Error saving question:', error);
      }
      return null;
    }
  }

  /**
   * Update an existing entry with the response
   * @param entryId - ID of the entry to update
   * @param response - Response to add
   * @returns Success status
   */
  async updateWithResponse(entryId: string, response: string): Promise<boolean> {
    if (!this.enabled || !this.tursoClient || !entryId) {
      return false;
    }

    try {
      // Update the entry with response
      await this.tursoClient.updateEntry(entryId, {
        response: response,
        status: 'completed',
      });

      if (this.debug) {
        console.log(`[TursoAdapter] Entry ${entryId} updated with response`);
      }

      return true;
    } catch (error) {
      if (this.debug) {
        console.error('[TursoAdapter] Error updating response:', error);
      }
      return false;
    }
  }

  /**
   * Mark an entry as cancelled
   * @param entryId - ID of the entry to mark as cancelled
   * @returns Success status
   */
  async markAsCancelled(entryId: string): Promise<boolean> {
    if (!this.enabled || !this.tursoClient || !entryId) {
      return false;
    }

    try {
      // Mark the entry as cancelled
      await this.tursoClient.updateEntry(entryId, {
        status: 'cancelled',
        response: '[Cancelled by user]',
      });

      if (this.debug) {
        console.log(`[TursoAdapter] Entry ${entryId} marked as cancelled`);
      }

      return true;
    } catch (error) {
      if (this.debug) {
        console.error('[TursoAdapter] Error marking as cancelled:', error);
      }
      return false;
    }
  }

  /**
   * Save command to distributed history
   * @param command - Command to save
   * @param metadata - Additional metadata
   * @returns Success status
   */
  async saveCommand(command: string, metadata: Record<string, unknown> = {}): Promise<boolean> {
    if (!this.enabled || !this.tursoClient) {
      return false;
    }

    try {
      // Extract response from metadata if present
      const { response, ...otherMetadata } = metadata;
      const responseStr = typeof response === 'string' ? response : null;

      // Use the TursoHistoryClient's saveCommand method
      await this.tursoClient.saveCommand(command, responseStr, {
        source: 'ink-interface',
        ...otherMetadata,
      });

      return true;
    } catch (error) {
      if (this.debug) {
        console.error('[TursoAdapter] Error saving command:', error);
      }
      return false;
    }
  }

  /**
   * Get command history from Turso
   * @param limit - Number of entries to retrieve
   * @returns Array of history entries
   */
  async getHistory(limit: number = 100): Promise<HistoryEntry[]> {
    if (!this.enabled || !this.tursoClient) {
      return [];
    }

    try {
      // The TursoHistoryClient.getHistory accepts limit as a simple parameter
      const entries = await this.tursoClient.getHistory(limit);

      // Return the entries as is - they already have command and timestamp fields
      return entries || [];
    } catch (error) {
      if (this.debug) {
        console.error('[TursoAdapter] Error getting history:', error);
      }
      return [];
    }
  }

  /**
   * Search history with a query
   * @param query - Search query
   * @param limit - Number of results
   * @returns Matching commands
   */
  async searchHistory(query: string, limit: number = 10): Promise<string[]> {
    if (!this.enabled || !this.tursoClient) {
      return [];
    }

    try {
      const results = await this.tursoClient.searchHistory(query, {
        limit,
        source: 'ink-interface',
      });

      return results.map((result: HistoryEntry) => result.command);
    } catch (error) {
      if (this.debug) {
        console.error('[TursoAdapter] Error searching history:', error);
      }
      return [];
    }
  }

  /**
   * Save question with status and request_id
   * @param command - Command to save
   * @param status - Status (default 'pending')
   * @param requestId - Unique request ID
   * @returns Entry ID or null
   */
  async saveQuestionWithStatusAndRequestId(
    command: string,
    status: string = 'pending',
    requestId: string,
  ): Promise<string | null> {
    if (!this.enabled || !this.tursoClient) {
      return null;
    }

    try {
      let entryId;

      // If we have a userId (not default), save to user table
      // Otherwise, use saveCommand which respects the mode (will save to machine/global)
      if (this.userId && this.userId !== 'default') {
        entryId = await this.tursoClient.saveToUser(command, null, {
          status,
          request_id: requestId,
          session_id: this.tursoClient.sessionId,
          source: 'ink-interface',
        });
      } else {
        // For default users, set mode to hybrid to save to machine and global
        const originalMode = this.tursoClient.mode;
        this.tursoClient.mode = 'hybrid';

        if (this.debug) {
          console.log(
            `[TursoAdapter] Saving for default user in hybrid mode. Machine ID: ${this.tursoClient.machineId}`,
          );
        }

        entryId = await this.tursoClient.saveCommand(command, null, {
          status,
          request_id: requestId,
          session_id: this.tursoClient.sessionId,
          source: 'ink-interface',
        });

        // Restore original mode
        this.tursoClient.mode = originalMode;
      }

      if (this.debug) {
        console.log(
          `[TursoAdapter] Question saved with ID: ${entryId}, request_id: ${requestId}, status: ${status}`,
        );
      }

      return entryId;
    } catch (error) {
      if (this.debug) {
        console.error(
          '[TursoAdapter] Error saving question with status:',
          error,
        );
      }
      return null;
    }
  }

  /**
   * Update only the status
   * @param entryId - Entry ID
   * @param status - New status
   * @returns Success
   */
  async updateStatus(entryId: string, status: string): Promise<boolean> {
    if (!this.enabled || !this.tursoClient) {
      return false;
    }

    try {
      await this.tursoClient.updateUserEntry(entryId, {
        status,
        updated_at: Math.floor(Date.now() / 1000),
      });
      return true;
    } catch (error) {
      if (this.debug) {
        console.error('[TursoAdapter] Error updating status:', error);
      }
      return false;
    }
  }

  /**
   * Get status by request_id
   * @param requestId - Request ID
   * @returns Status or 'unknown'
   */
  async getStatusByRequestId(requestId: string): Promise<string> {
    if (!this.enabled || !this.tursoClient || !this.tursoClient.client) {
      return 'unknown';
    }

    try {
      const result = await this.tursoClient.client.execute({
        sql: 'SELECT status FROM history_user WHERE request_id = ? ORDER BY timestamp DESC LIMIT 1',
        args: [requestId],
      });
      const status = result.rows[0]?.status;
      return typeof status === 'string' ? status : 'unknown';
    } catch (error) {
      if (this.debug) {
        console.error(
          '[TursoAdapter] Error getting status by request_id:',
          error,
        );
      }
      return 'unknown';
    }
  }

  /**
   * Update status by request_id
   * @param requestId - Request ID
   * @param status - New status
   * @returns Success
   */
  async updateStatusByRequestId(requestId: string, status: string): Promise<boolean> {
    if (!this.enabled || !this.tursoClient || !this.tursoClient.client) {
      return false;
    }

    try {
      const updateTime = Math.floor(Date.now() / 1000);
      const updates = [];

      // Update all tables that might have this request_id
      if (this.userId && this.userId !== 'default') {
        // If we have a user, update user table
        updates.push(
          this.tursoClient.client.execute({
            sql: 'UPDATE history_user SET status = ?, updated_at = ? WHERE request_id = ?',
            args: [status, updateTime, requestId],
          })
        );
      }

      // Always update global and machine tables for default users
      updates.push(
        this.tursoClient.client.execute({
          sql: 'UPDATE history_global SET status = ?, updated_at = ? WHERE request_id = ?',
          args: [status, updateTime, requestId],
        })
      );

      updates.push(
        this.tursoClient.client.execute({
          sql: 'UPDATE history_machine SET status = ?, updated_at = ? WHERE request_id = ?',
          args: [status, updateTime, requestId],
        })
      );

      const results: SqlExecuteResult[] = await Promise.all(updates);

      // Return true only if at least one row was updated
      const success = results.some(r => r.rowsAffected > 0);

      if (this.debug && !success) {
        console.log(
          `[TursoAdapter] No rows updated for request_id: ${requestId}`,
        );
      }

      return success;
    } catch (error) {
      if (this.debug) {
        console.error(
          '[TursoAdapter] Error updating status by request_id:',
          error,
        );
      }
      return false;
    }
  }

  /**
   * Update response and status together
   * @param entryId - Entry ID
   * @param response - Response text
   * @param status - Status
   * @returns Success
   */
  async updateWithResponseAndStatus(entryId: string, response: string, status: string): Promise<boolean> {
    if (!this.enabled || !this.tursoClient) {
      return false;
    }

    try {
      const updateTime = Math.floor(Date.now() / 1000);

      // For default users, we need to update multiple tables
      if (this.userId && this.userId !== 'default') {
        // Update user table for registered users
        await this.tursoClient.updateUserEntry(entryId, {
          response,
          status,
          completed_at: updateTime,
        });
      } else {
        // For default users, update global and machine tables
        // The entryId returned from hybrid mode is the global table ID
        const updates = [];

        // Update global table by ID
        updates.push(
          this.tursoClient.client.execute({
            sql: 'UPDATE history_global SET response = ?, status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
            args: [response, status, updateTime, updateTime, entryId],
          })
        );

        // Update machine table by session_id and recent timestamp
        // Since entries are created at the same time, we can find the matching entry
        updates.push(
          this.tursoClient.client.execute({
            sql: 'UPDATE history_machine SET response = ?, status = ?, completed_at = ?, updated_at = ? WHERE machine_id = ? AND status = ? AND response IS NULL ORDER BY timestamp DESC LIMIT 1',
            args: [response, status, updateTime, updateTime, this.tursoClient.machineId, 'pending'],
          })
        );

        await Promise.all(updates);

        if (this.debug) {
          console.log(
            `[TursoAdapter] Updated response for default user in global and machine tables`,
          );
        }
      }

      return true;
    } catch (error) {
      if (this.debug) {
        console.error(
          '[TursoAdapter] Error updating response and status:',
          error,
        );
      }
      return false;
    }
  }

  /**
   * Sync local history with Turso
   * @param localHistory - Local command history
   * @returns Promise that resolves when sync is complete
   */
  async syncHistory(localHistory: string[]): Promise<void> {
    if (!this.enabled || !this.tursoClient) {
      return;
    }

    try {
      for (const command of localHistory) {
        await this.saveCommand(command, {
          synced: true,
          syncTime: new Date().toISOString(),
        });
      }

      if (this.debug) {
        console.log(`[TursoAdapter] Synced ${localHistory.length} commands`);
      }
    } catch (error) {
      if (this.debug) {
        console.error('[TursoAdapter] Error syncing history:', error);
      }
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.tursoClient && typeof this.tursoClient.close === 'function') {
      await this.tursoClient.close();
    }
    this.tursoClient = null;
    this.enabled = false;
  }
  /**
   * Check if debug mode is enabled
   * @returns Current debug mode status
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
   * Get current user ID
   * @returns User ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Check if Turso is enabled
   * @returns Enabled status
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get the Turso client path
   * @returns Path to the Turso client module
   */
  getTursoClientPath(): string {
    return this.tursoClientPath;
  }

  /**
   * Check if adapter is initialized
   * @returns Initialization status
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

export default TursoAdapter;

// Export types for external usage
export type {
  TursoHistoryClientModule,
  SqlClient,
  SqlExecuteResult
};
