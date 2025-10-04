#!/usr/bin/env node
// noinspection SqlNoDataSourceInspection

/**
 * TursoHistoryClient - Cliente para gerenciar histórico distribuído com Turso
 * Suporta modos: global, user, machine e hybrid
 */

import { createClient, type Client, type InArgs, type InValue } from '@libsql/client';
import MachineIdentityManager from './machine-identity.js';
import * as crypto from 'crypto';

/**
 * Configuration interface
 */
interface TursoConfig {
  turso_url?: string;
  turso_token?: string;
  turso_sync_url?: string;
  turso_sync_interval?: number;
  history_mode?: string;
  debug?: boolean;
  fallback_enabled?: boolean;
  cache_ttl?: number;
}

/**
 * History entry interface
 */
interface HistoryEntry {
  id?: string;
  command?: string;
  response?: string | null;
  status?: string;
  tokens_used?: number;
  completed_at?: number;
  timestamp?: number;
  user_id?: string;
  machine_id?: string;
  session_id?: string;
  command_uuid?: string;
  [key: string]: any;
}

/**
 * Result from COUNT queries
 */
interface CountResult {
  count: number;
}

/**
 * GlobalStats interface
 */
interface GlobalStats {
  globalCommands: number;
  userCommands?: number;
  machineCommands: number;
  activeMachines: number;
  activeUsers: number;
  topCommands?: Array<{
    command: string;
    usage_count: number;
  }>;
}

export default class TursoHistoryClient {
  private config: TursoConfig;
  public client: Client | null;
  public machineId: string | null;
  public userId: string | null;
  private mode: string;
  private sessionId: string | null;
  private machineManager: MachineIdentityManager;
  private debug: boolean;

  constructor(config: TursoConfig = {}) {
    this.config = {
      turso_url: config.turso_url || process.env.TURSO_DATABASE_URL,
      turso_token: config.turso_token || process.env.TURSO_AUTH_TOKEN,
      turso_sync_url: config.turso_sync_url || process.env.TURSO_SYNC_URL,
      turso_sync_interval: config.turso_sync_interval || 60,
      history_mode: config.history_mode || 'global',
      debug: config.debug || false,
      fallback_enabled: config.fallback_enabled !== false,
      cache_ttl: config.cache_ttl || 3600,
    };

    this.client = null;
    this.machineId = null;
    this.userId = null;
    this.mode = this.config.history_mode || 'global';
    this.sessionId = null;
    this.machineManager = new MachineIdentityManager({
      debug: this.config.debug,
    });
    this.debug = this.config.debug || false;
  }

  /**
   * Inicializa o cliente Turso e registra a máquina
   */
  async initialize() {
    if (this.debug) console.log('[TursoClient] initialize() called');
    try {
      // Validar configuração
      if (this.debug) console.log('[TursoClient] Validating config...');
      if (!this.config.turso_url || !this.config.turso_token) {
        throw new Error(
          'Turso URL and token are required. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN',
        );
      }

      if (this.debug) console.log('[TursoClient] Creating client...');
      // Criar cliente Turso
      if (this.config.turso_sync_url) {
        if (this.debug) console.log('[TursoClient] Using sync mode');
        // Modo com embedded replica (suporte offline)
        this.client = createClient({
          url: this.config.turso_url,
          authToken: this.config.turso_token,
          syncUrl: this.config.turso_sync_url,
          syncInterval: this.config.turso_sync_interval,
        });
      } else {
        if (this.debug) console.log('[TursoClient] Using online-only mode');
        // Modo online apenas
        this.client = createClient({
          url: this.config.turso_url,
          authToken: this.config.turso_token,
        });
      }
      if (this.debug) console.log('[TursoClient] Client created');

      // Testar conexão com timeout
      if (this.debug) console.log('[TursoClient] Testing connection...');
      const testPromise = this.client.execute('SELECT 1');
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection test timeout')), 5000)
      );

      try {
        await Promise.race([testPromise, timeoutPromise]);
        if (this.debug) console.log('[TursoClient] Connection test successful');
      } catch (err) {
        if (this.debug) console.error('[TursoClient] Connection test failed:', err.message);
        throw err;
      }

      // Obter ID da máquina
      if (this.debug) console.log('[TursoClient] Getting machine ID...');
      this.machineId = await this.machineManager.getMachineId();
      if (this.debug) console.log('[TursoClient] Machine ID:', this.machineId);

      // SKIP SCHEMA CREATION - Tables are created via migrations
      // await this.ensureSchema();

      // Registrar máquina
      if (this.debug) console.log('[TursoClient] Registering machine...');
      await this.registerMachine();
      if (this.debug) console.log('[TursoClient] Machine registered');

      // Gerar session ID
      this.sessionId = this.generateSessionId();

      if (this.config.debug) {
        console.log('TursoHistoryClient initialized successfully');
        console.log('Mode:', this.mode);
        console.log('Machine ID:', this.machineId);
        console.log('Session ID:', this.sessionId);
      }
    } catch (error) {
      console.error('Failed to initialize TursoHistoryClient:', error);
      throw error;
    }
  }

  /**
   * Garante que o schema existe no banco
   */
  async ensureSchema(): Promise<void> {
    // Check if tables already exist
    try {
      const result = await this.client!.execute(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='history_user'
      `);

      if (result.rows.length > 0) {
        console.log('[TursoClient] Tables already exist, skipping schema creation');
        return;
      }
    } catch (err) {
      console.log('[TursoClient] Error checking tables:', err.message);
    }

    const schema = `
            -- Usuários (sem senha)
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
                username TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                is_active BOOLEAN DEFAULT 1
            );

            -- Máquinas registradas
            CREATE TABLE IF NOT EXISTS machines (
                machine_id TEXT PRIMARY KEY,
                hostname TEXT NOT NULL,
                ip_address TEXT,
                os_info TEXT,
                first_seen INTEGER DEFAULT (strftime('%s', 'now')),
                last_seen INTEGER DEFAULT (strftime('%s', 'now')),
                total_commands INTEGER DEFAULT 0
            );

            -- Histórico global compartilhado
            CREATE TABLE IF NOT EXISTS history_global (
                id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
                command TEXT NOT NULL,
                response TEXT,
                machine_id TEXT,
                user_id TEXT,
                timestamp INTEGER DEFAULT (strftime('%s', 'now')),
                tokens_used INTEGER,
                execution_time_ms INTEGER,
                tags TEXT,
                session_id TEXT,
                status TEXT DEFAULT 'pending',
                request_id TEXT,
                updated_at INTEGER,
                completed_at INTEGER,
                FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            -- Histórico por usuário
            CREATE TABLE IF NOT EXISTS history_user (
                id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
                user_id TEXT NOT NULL,
                command TEXT NOT NULL,
                response TEXT,
                machine_id TEXT,
                timestamp INTEGER DEFAULT (strftime('%s', 'now')),
                session_id TEXT,
                context TEXT,
                tokens_used INTEGER,
                execution_time_ms INTEGER,
                status TEXT DEFAULT 'pending',
                request_id TEXT,
                updated_at INTEGER,
                completed_at INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
            );

            -- Histórico por máquina
            CREATE TABLE IF NOT EXISTS history_machine (
                id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
                machine_id TEXT NOT NULL,
                command TEXT NOT NULL,
                response TEXT,
                user_id TEXT,
                timestamp INTEGER DEFAULT (strftime('%s', 'now')),
                error_code INTEGER,
                session_id TEXT,
                status TEXT DEFAULT 'pending',
                request_id TEXT,
                updated_at INTEGER,
                completed_at INTEGER,
                FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            -- Índices para performance
            CREATE INDEX IF NOT EXISTS idx_history_global_timestamp
                ON history_global(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_history_global_machine
                ON history_global(machine_id, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_history_user_lookup
                ON history_user(user_id, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_history_machine_lookup
                ON history_machine(machine_id, timestamp DESC);

            -- Novos índices para status e request_id
            CREATE INDEX IF NOT EXISTS idx_history_user_status
                ON history_user(status, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_history_user_request
                ON history_user(request_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_history_user_request_unique
                ON history_user(request_id);
            CREATE INDEX IF NOT EXISTS idx_history_global_status
                ON history_global(status, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_history_global_request
                ON history_global(request_id);
            CREATE INDEX IF NOT EXISTS idx_history_machine_status
                ON history_machine(status, timestamp DESC);

            -- Cache de comandos frequentes
            CREATE TABLE IF NOT EXISTS command_cache (
                command_hash TEXT PRIMARY KEY,
                command TEXT NOT NULL,
                output TEXT,
                machine_id TEXT,
                last_executed INTEGER,
                execution_count INTEGER DEFAULT 1,
                avg_execution_time_ms INTEGER
            );

            -- Sessões
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                machine_id TEXT NOT NULL,
                user_id TEXT,
                started_at INTEGER DEFAULT (strftime('%s', 'now')),
                ended_at INTEGER,
                command_count INTEGER DEFAULT 0,
                FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `;

    // Executar cada statement separadamente com timeout
    const statements = schema.split(';').filter(s => s.trim());
    console.log(`[TursoClient] Executing ${statements.length} schema statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`[TursoClient] Executing statement ${i+1}/${statements.length}...`);

        const execPromise = this.client.execute(statement);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Statement ${i+1} timeout`)), 3000)
        );

        try {
          await Promise.race([execPromise, timeoutPromise]);
        } catch (err) {
          console.error(`[TursoClient] Statement ${i+1} failed:`, err.message);
          // Continue with next statement instead of throwing
        }
      }
    }
    console.log('[TursoClient] Schema statements executed');
  }

  /**
   * Migra dados existentes para adicionar status onde não existe
   */
  async migrateExistingData(): Promise<void> {
    try {
      // Timestamp de quando esta migração foi implementada (agora)
      const migrationTimestamp = Math.floor(Date.now() / 1000);

      // Migrar history_user - apenas registros antigos
      await this.client!.execute(`
                UPDATE history_user
                SET status = CASE
                    WHEN response IS NULL THEN 'cancelled'
                    WHEN response = '[Cancelled by user]' THEN 'cancelled'
                    ELSE 'completed'
                END
                WHERE status IS NULL AND timestamp < ${migrationTimestamp}
            `);

      // Migrar history_global - apenas registros antigos
      await this.client!.execute(`
                UPDATE history_global
                SET status = CASE
                    WHEN response IS NULL THEN 'cancelled'
                    ELSE 'completed'
                END
                WHERE status IS NULL AND timestamp < ${migrationTimestamp}
            `);

      // Migrar history_machine - apenas registros antigos
      await this.client!.execute(`
                UPDATE history_machine
                SET status = CASE
                    WHEN response IS NULL THEN 'cancelled'
                    WHEN error_code IS NOT NULL THEN 'error'
                    ELSE 'completed'
                END
                WHERE status IS NULL AND timestamp < ${migrationTimestamp}
            `);

      if (this.config.debug) {
        console.log('[Turso] Existing data migrated successfully');
      }
    } catch (error) {
      // Ignorar erro se colunas já existem
      if (this.config.debug) {
        console.log(
          '[Turso] Migration skipped or already done:',
          error.message,
        );
      }
    }
  }

  /**
   * Registra a máquina no banco de dados
   */
  async registerMachine(): Promise<void> {
    try {
      await this.machineManager.registerMachine(this.client);
    } catch (err) {
      console.log('[TursoClient] Machine registration failed:', err.message);
      // Continue anyway - machine might already be registered
    }

    // SKIP MIGRATION - not needed for normal operation
    // await this.migrateExistingData();
  }

  /**
   * Define o usuário atual
   */
  async setUser(username: string): Promise<void> {
    // Write directly to debug log file
    const fs = await import('fs/promises');
    const logMsg = (msg: string) => {
      const timestamp = new Date().toISOString();
      const logLine = `\n[${timestamp}] ${msg}\n${'='.repeat(60)}\n`;
      fs.appendFile('/tmp/mcp-debug.log', logLine).catch(() => {});
    };

    logMsg(`[turso-client] setUser called with username: ${username}`);

    if (!username) {
      logMsg('[turso-client] Empty username, setting to global mode');
      this.userId = null;
      this.mode = 'global';
      return;
    }

    logMsg('[turso-client] Executing SELECT query...');
    const result = await this.client!.execute(
      'SELECT id, name, email FROM users WHERE username = ? AND is_active = 1',
      [username]
    );

    logMsg(`[turso-client] Query returned ${result.rows.length} rows`);
    logMsg(`[turso-client] Result: ${JSON.stringify(result.rows)}`);

    if (result.rows.length > 0) {
      this.userId = result.rows[0].id as string;
      this.mode = 'user';
      logMsg(`[turso-client] User found! Setting userId: ${this.userId}`);
      return;
    } else {
      logMsg(`[turso-client] User NOT found, throwing error...`);
      const error = new Error(
        `USER_NOT_FOUND:${username}`
      );
      error.name = 'UserNotFoundError';
      throw error;
    }
  }

  /**
   * Define o modo de operação
   */
  setMode(mode: string): void {
    const validModes = ['global', 'user', 'machine', 'hybrid'];
    if (!validModes.includes(mode)) {
      throw new Error(
        `Invalid mode: ${mode}. Valid modes: ${validModes.join(', ')}`,
      );
    }
    this.mode = mode;
    if (this.config.debug) {
      console.log('Mode changed to:', mode);
    }
  }

  /**
   * Salva um comando no histórico
   */
  async saveCommand(command: string, response: string | null = null, metadata: Record<string, unknown> = {}): Promise<string> {
    const timestamp = Date.now();

    // Adicionar informações da sessão
    metadata.session_id = metadata.session_id || this.sessionId;

    let entryId = null;

    try {
      // Salvar baseado no modo
      switch (this.mode) {
        case 'global':
          entryId = await this.saveToGlobal(command, response, metadata);
          break;
        case 'user':
          if (!this.userId) {
            throw new Error('User mode requires a user to be set');
          }
          entryId = await this.saveToUser(command, response, metadata);
          break;
        case 'machine':
          entryId = await this.saveToMachine(command, response, metadata);
          break;
        case 'hybrid':
          // Salvar em múltiplos lugares - return the first ID
          const saves = [
            this.saveToGlobal(command, response, metadata),
            this.saveToMachine(command, response, metadata),
          ];
          if (this.userId) {
            saves.push(this.saveToUser(command, response, metadata));
          }
          const results = await Promise.all(saves);
          entryId = results[0]; // Use the global history ID as primary
          break;
      }

      // Atualizar contador de comandos da máquina
      await this.updateMachineStats();

      // Atualizar cache se aplicável
      if (metadata.cache !== false) {
        await this.updateCommandCache(command, response, metadata);
      }

      if (this.config.debug) {
        console.log(
          `Command saved to ${this.mode} history with ID: ${entryId}`,
        );
      }

      return entryId;
    } catch (error) {
      console.error('Error saving command:', error);
      throw error;
    }
  }

  /**
   * Update an existing history entry
   */
  async updateEntry(entryId: string, updates: Partial<HistoryEntry>): Promise<boolean> {
    if (!entryId) return false;

    try {
      // Update based on mode - different tables have different schemas
      switch (this.mode) {
        case 'global':
          return await this.updateGlobalEntry(entryId, updates);
        case 'user':
          return await this.updateUserEntry(entryId, updates);
        case 'machine':
          return await this.updateMachineEntry(entryId, updates);
        case 'hybrid':
          // Update all tables in hybrid mode
          const results = await Promise.allSettled([
            this.updateGlobalEntry(entryId, updates),
            this.updateMachineEntry(entryId, updates),
            this.updateUserEntry(entryId, updates),
          ]);
          // Return true if at least one update succeeded
          return results.some(
            r => r.status === 'fulfilled' && r.value === true,
          );
      }
    } catch (error) {
      console.error('Error updating entry:', error);
      return false;
    }
  }

  /**
   * Update entry in global history table
   */
  async updateGlobalEntry(entryId: string, updates: Partial<HistoryEntry>): Promise<boolean> {
    try {
      const updateFields = [];
      const updateArgs = [];

      if (updates.response !== undefined) {
        updateFields.push('response = ?');
        updateArgs.push(updates.response);
      }
      if (updates.status !== undefined) {
        // Global table has tags field - update status in JSON
        updateFields.push('tags = json_set(tags, "$.status", ?)');
        updateArgs.push(updates.status);
      }

      if (updateFields.length === 0) return true;

      updateArgs.push(entryId);

      await this.client!.execute(
        `UPDATE history_global SET ${updateFields.join(', ')} WHERE id = ?`,
        updateArgs
      );

      if (this.config.debug) {
        console.log(`Entry ${entryId} updated in history_global`);
      }
      return true;
    } catch (error) {
      if (this.config.debug) {
        console.error('Error updating global entry:', error);
      }
      return false;
    }
  }

  /**
   * Update entry in user history table
   */
  async updateUserEntry(entryId: string, updates: Partial<HistoryEntry>): Promise<boolean> {
    try {
      const updateFields = [];
      const updateArgs = [];

      if (updates.response !== undefined) {
        updateFields.push('response = ?');
        updateArgs.push(updates.response);
      }
      if (updates.status !== undefined) {
        // Update the dedicated status column
        updateFields.push('status = ?');
        updateArgs.push(updates.status);
      }
      if (updates.updated_at !== undefined) {
        updateFields.push('updated_at = ?');
        updateArgs.push(updates.updated_at);
      }
      if (updates.completed_at !== undefined) {
        updateFields.push('completed_at = ?');
        updateArgs.push(updates.completed_at);
      }

      if (updateFields.length === 0) return true;

      updateArgs.push(entryId);

      await this.client!.execute(
        `UPDATE history_user SET ${updateFields.join(', ')} WHERE id = ?`,
        updateArgs
      );

      if (this.config.debug) {
        console.log(`Entry ${entryId} updated in history_user`);
      }
      return true;
    } catch (error) {
      if (this.config.debug) {
        console.error('Error updating user entry:', error);
      }
      return false;
    }
  }

  /**
   * Update entry in machine history table
   */
  async updateMachineEntry(entryId: string, updates: Partial<HistoryEntry>): Promise<boolean> {
    try {
      const updateFields = [];
      const updateArgs = [];

      if (updates.response !== undefined) {
        updateFields.push('response = ?');
        updateArgs.push(updates.response);
      }
      // Machine table doesn't have tags or context field for status

      if (updateFields.length === 0) return true;

      updateArgs.push(entryId);

      await this.client!.execute(
        `UPDATE history_machine SET ${updateFields.join(', ')} WHERE id = ?`,
        updateArgs
      );

      if (this.config.debug) {
        console.log(`Entry ${entryId} updated in history_machine`);
      }
      return true;
    } catch (error) {
      if (this.config.debug) {
        console.error('Error updating machine entry:', error);
      }
      return false;
    }
  }

  /**
   * Salva no histórico global
   */
  async saveToGlobal(command: string, response: string | null, metadata: Record<string, unknown>): Promise<string> {
    const result = await this.client!.execute(
      'INSERT INTO history_global ' +
      '(command, response, machine_id, user_id, timestamp, tokens_used, execution_time_ms, tags, session_id, status, request_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'RETURNING id',
      [
        command,
        response,
        this.machineId,
        this.userId,
        Math.floor(Date.now() / 1000),
        (metadata.tokens_used || null) as InValue,
        (metadata.execution_time_ms || null) as InValue,
        JSON.stringify(metadata.tags || []),
        (metadata.session_id || this.sessionId) as InValue,
        (metadata.status || 'pending') as InValue,
        (metadata.request_id || null) as InValue,
      ] as InArgs
    );

    // Return the ID of the inserted row
    return (result.rows?.[0]?.id as string) || null;
  }

  /**
   * Salva no histórico do usuário
   */
  async saveToUser(command: string, response: string | null, metadata: Record<string, unknown>): Promise<string> {
    if (!this.userId) return null;

    const result = await this.client!.execute(
      'INSERT INTO history_user ' +
      '(user_id, command, response, machine_id, timestamp, session_id, context, tokens_used, execution_time_ms, status, request_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'RETURNING id',
      [
        this.userId,
        command,
        response,
        this.machineId,
        Math.floor(Date.now() / 1000),
        (metadata.session_id || this.sessionId) as InValue,
        JSON.stringify(metadata.context || {}),
        (metadata.tokens_used || null) as InValue,
        (metadata.execution_time_ms || null) as InValue,
        (metadata.status || 'pending') as InValue,
        (metadata.request_id || null) as InValue,
      ] as InArgs
    );

    // Return the ID of the inserted row
    return (result.rows?.[0]?.id as string) || null;
  }

  /**
   * Salva no histórico da máquina
   */
  async saveToMachine(command: string, response: string | null, metadata: Record<string, unknown>): Promise<string> {
    const result = await this.client!.execute(
      'INSERT INTO history_machine ' +
      '(machine_id, command, response, user_id, timestamp, error_code, session_id, status, request_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'RETURNING id',
      [
        this.machineId,
        command,
        response,
        this.userId,
        Math.floor(Date.now() / 1000),
        (metadata.error_code || null) as InValue,
        (metadata.session_id || this.sessionId) as InValue,
        (metadata.status || 'pending') as InValue,
        (metadata.request_id || null) as InValue,
      ] as InArgs
    );

    // Return the ID of the inserted row
    return (result.rows?.[0]?.id as string) || null;
  }

  /**
   * Salva no histórico da máquina com parâmetros compatíveis com sync
   * Wrapper para compatibilidade com SyncManager
   */
  async saveToMachineHistory(command: string, response: string | null, timestamp: number, sessionId: string): Promise<void> {
    await this.client!.execute(
      `INSERT INTO history_machine
                  (machine_id, command, response, user_id, timestamp, error_code, session_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        this.machineId,
        command,
        response,
        this.userId,
        timestamp,
        null, // error_code
        sessionId || this.sessionId,
      ]
    );
  }

  /**
   * Atualiza estatísticas da máquina
   */
  async updateMachineStats(): Promise<void> {
    await this.client!.execute(
      `UPDATE machines
                  SET last_seen = unixepoch(),
                      total_commands = total_commands + 1
                  WHERE machine_id = ?`,
      [this.machineId]
    );
  }

  /**
   * Atualiza o status de um comando pelo request_id
   * @param {string} requestId - ID único do request
   * @param {string} status - Novo status ('completed', 'cancelled', 'failed')
   * @param {Object} additionalData - Dados adicionais (response, completedAt, etc)
   */
  async updateCommandStatus(requestId: string, status: string, additionalData: Record<string, unknown> = {}): Promise<boolean> {
    if (!requestId) return false;

    const now = Math.floor(Date.now() / 1000);
    const updates: Record<string, unknown> = {
      status,
      updated_at: now,
    };

    if (
      status === 'completed' ||
      status === 'cancelled' ||
      status === 'failed'
    ) {
      updates.completed_at = now;
    }

    // Atualizar em todas as tabelas que tenham o request_id
    const tables = ['history_global', 'history_user', 'history_machine'];

    for (const table of tables) {
      try {
        let sql = `UPDATE ${table} SET status = ?, updated_at = ?`;
        const args: InValue[] = [updates.status as InValue, updates.updated_at as InValue];

        if (updates.completed_at) {
          sql += ', completed_at = ?';
          args.push(updates.completed_at as InValue);
        }

        if (additionalData.response) {
          sql += ', response = ?';
          args.push(additionalData.response as InValue);
        }

        sql += ' WHERE request_id = ?';
        args.push(requestId);

        await this.client!.execute(sql, args);
      } catch (err) {
        if (this.debug) {
          console.error(`Error updating ${table}:`, err);
        }
      }
    }
  }

  /**
   * Marca um comando como completado
   * @param {string} requestId - ID único do request
   * @param {string} response - Resposta do comando
   */
  async completeCommand(requestId: string, response: string): Promise<void> {
    await this.updateCommandStatus(requestId, 'completed', { response });
  }

  /**
   * Marca um comando como cancelado
   * @param {string} requestId - ID único do request
   */
  async cancelCommand(requestId: string): Promise<void> {
    await this.updateCommandStatus(requestId, 'cancelled', {
      response: '[Cancelled by user]',
    });
  }

  /**
   * Atualiza cache de comandos
   */
  async updateCommandCache(command: string, output: string, metadata: Record<string, unknown>): Promise<void> {
    const hash = this.hashCommand(command);

    await this.client!.execute(
      'INSERT INTO command_cache ' +
      '(command_hash, command, output, machine_id, last_executed, avg_execution_time_ms) ' +
      'VALUES (?, ?, ?, ?, unixepoch(), ?) ' +
      'ON CONFLICT(command_hash) DO UPDATE SET ' +
      'output = excluded.output, ' +
      'last_executed = excluded.last_executed, ' +
      'execution_count = execution_count + 1, ' +
      'avg_execution_time_ms = (avg_execution_time_ms * execution_count + ?) / (execution_count + 1)',
      [
        hash,
        command,
        output,
        this.machineId,
        (metadata.execution_time_ms || 0) as InValue,
        (metadata.execution_time_ms || 0) as InValue,
      ] as InArgs
    );
  }

  /**
   * Obtém histórico de uma tabela específica
   */
  async getHistoryFromTable(table: string, limit: number = 100, offset: number = 0): Promise<HistoryEntry[]> {
    let sql, args;

    switch (table) {
      case 'global':
        sql = `SELECT * FROM history_global
                       ORDER BY timestamp ASC
                       LIMIT ? OFFSET ?`;
        args = [limit, offset];
        break;

      case 'user':
        if (!this.userId) {
          throw new Error('User table requires a user to be set');
        }
        sql = `SELECT * FROM history_user
                       WHERE user_id = ?
                       ORDER BY timestamp ASC
                       LIMIT ? OFFSET ?`;
        args = [this.userId, limit, offset];
        break;

      case 'machine':
        sql = `SELECT * FROM history_machine
                       WHERE machine_id = ?
                       ORDER BY timestamp ASC
                       LIMIT ? OFFSET ?`;
        args = [this.machineId, limit, offset];
        break;

      default:
        throw new Error(
          `Invalid table: ${table}. Use 'global', 'user', or 'machine'`,
        );
    }

    const result = await this.client!.execute(sql, args);
    return result.rows as HistoryEntry[];
  }

  /**
   * Obtém histórico baseado no modo atual
   */
  async getHistory(limit: number = 100, offset: number = 0): Promise<HistoryEntry[]> {
    let sql, args;

    switch (this.mode) {
      case 'global':
        sql = `SELECT * FROM history_global
                       ORDER BY timestamp ASC
                       LIMIT ? OFFSET ?`;
        args = [limit, offset];
        break;

      case 'user':
        if (!this.userId) {
          throw new Error('User mode requires a user to be set');
        }
        sql = `SELECT * FROM history_user
                       WHERE user_id = ?
                       ORDER BY timestamp ASC
                       LIMIT ? OFFSET ?`;
        args = [this.userId, limit, offset];
        break;

      case 'machine':
        sql = `SELECT * FROM history_machine
                       WHERE machine_id = ?
                       ORDER BY timestamp ASC
                       LIMIT ? OFFSET ?`;
        args = [this.machineId, limit, offset];
        break;

      case 'hybrid':
        // Combinar múltiplas fontes com UNION
          sql = `
                    SELECT 'global' as source, id, command, response, timestamp,
                           machine_id, user_id, session_id, tokens_used, execution_time_ms
                    FROM history_global
                    WHERE timestamp > unixepoch('now', '-7 days')
                    UNION ALL
                    SELECT 'user' as source, id, command, response, timestamp,
                           machine_id, user_id, session_id, tokens_used, execution_time_ms
                    FROM history_user
                    WHERE user_id = ? AND timestamp > unixepoch('now', '-7 days')
                    UNION ALL
                    SELECT 'machine' as source, id, command, response, timestamp,
                           machine_id, user_id, session_id, NULL as tokens_used, NULL as execution_time_ms
                    FROM history_machine
                    WHERE machine_id = ? AND timestamp > unixepoch('now', '-7 days')
                    ORDER BY timestamp ASC
                    LIMIT ? OFFSET ?`;
        args = [this.userId || '', this.machineId, limit, offset];
        break;
    }

    const result = await this.client!.execute(sql, args);
    return result.rows as HistoryEntry[];
  }

  /**
   * Busca no histórico
   */
  async searchHistory(query: string, options: Record<string, unknown> = {}): Promise<HistoryEntry[]> {
    const limit = options.limit || 20;
    const mode = options.mode || this.mode;

    let sql, args;

    switch (mode) {
      case 'global':
        sql = `SELECT * FROM history_global
                       WHERE command LIKE ? OR response LIKE ?
                       ORDER BY timestamp ASC
                       LIMIT ?`;
        args = [`%${query}%`, `%${query}%`, limit];
        break;

      case 'user':
        if (!this.userId && !options.userId) {
          throw new Error('User search requires a user ID');
        }
        sql = `SELECT * FROM history_user
                       WHERE user_id = ? AND (command LIKE ? OR response LIKE ?)
                       ORDER BY timestamp ASC
                       LIMIT ?`;
        args = [
          options.userId || this.userId,
          `%${query}%`,
          `%${query}%`,
          limit,
        ];
        break;

      case 'machine':
        sql = `SELECT * FROM history_machine
                       WHERE machine_id = ? AND (command LIKE ? OR response LIKE ?)
                       ORDER BY timestamp ASC
                       LIMIT ?`;
        args = [
          options.machineId || this.machineId,
          `%${query}%`,
          `%${query}%`,
          limit,
        ];
        break;

      default:
        // Busca em todas as tabelas - precisa especificar colunas para compatibilidade
        sql = `
                    SELECT 'global' as source, id, command, response, timestamp,
                           machine_id, user_id, session_id, tokens_used, execution_time_ms
                    FROM history_global
                    WHERE command LIKE ? OR response LIKE ?
                    UNION ALL
                    SELECT 'user' as source, id, command, response, timestamp,
                           machine_id, user_id, session_id, tokens_used, execution_time_ms
                    FROM history_user
                    WHERE command LIKE ? OR response LIKE ?
                    UNION ALL
                    SELECT 'machine' as source, id, command, response, timestamp,
                           machine_id, NULL as user_id, session_id,
                           NULL as tokens_used, NULL as execution_time_ms
                    FROM history_machine
                    WHERE command LIKE ? OR response LIKE ?
                    ORDER BY timestamp ASC
                    LIMIT ?`;
        args = [
          `%${query}%`,
          `%${query}%`,
          `%${query}%`,
          `%${query}%`,
          `%${query}%`,
          `%${query}%`,
          limit,
        ];
    }

    const result = await this.client!.execute(sql, args);
    return result.rows as HistoryEntry[];
  }

  /**
   * Obtém comando do cache
   */
  async getCachedCommand(command: string): Promise<HistoryEntry | null> {
    const hash = this.hashCommand(command);

    const result = await this.client!.execute(
      `SELECT output, last_executed, execution_count, avg_execution_time_ms
                  FROM command_cache
                  WHERE command_hash = ?
                    AND last_executed > unixepoch('now', '-1 hour')`,
      [hash]
    );

    if (result.rows.length > 0) {
      return result.rows[0] as HistoryEntry;
    }
    return null;
  }

  /**
   * Obtém estatísticas do histórico
   */
  async getStats(days: number = 30): Promise<GlobalStats> {
    // Total de comandos por modo
    const globalCount = await this.client!.execute(
      `SELECT COUNT(*) as count FROM history_global
                  WHERE timestamp > unixepoch('now', '-' || ? || ' days')`,
      [days]
    );
    const globalCommands = (globalCount.rows[0] as unknown as CountResult).count;

    let userCommands: number | undefined;
    if (this.userId) {
      const userCount = await this.client!.execute(
        `SELECT COUNT(*) as count FROM history_user
                      WHERE user_id = ? AND timestamp > unixepoch('now', '-' || ? || ' days')`,
        [this.userId, days]
      );
      userCommands = (userCount.rows[0] as unknown as CountResult).count;
    }

    const machineCount = await this.client!.execute(
      `SELECT COUNT(*) as count FROM history_machine
                  WHERE machine_id = ? AND timestamp > unixepoch('now', '-' || ? || ' days')`,
      [this.machineId, days]
    );
    const machineCommands = (machineCount.rows[0] as unknown as CountResult).count;

    // Comandos mais usados
    const topCommands = await this.client!.execute(
      `SELECT command, COUNT(*) as usage_count
                  FROM history_global
                  WHERE timestamp > unixepoch('now', '-' || ? || ' days')
                  GROUP BY command
                  ORDER BY usage_count DESC
                  LIMIT 10`,
      [days]
    );

    // Máquinas ativas
    const activeMachines = await this.client!.execute(
      `SELECT COUNT(DISTINCT machine_id) as count
                  FROM history_global
                  WHERE timestamp > unixepoch('now', '-' || ? || ' days')`,
      [days]
    );
    const activeMachinesCount = (activeMachines.rows[0] as unknown as CountResult).count;

    // Usuários ativos
    const activeUsers = await this.client!.execute(
      `SELECT COUNT(DISTINCT user_id) as count
                  FROM history_global
                  WHERE user_id IS NOT NULL
                    AND timestamp > unixepoch('now', '-' || ? || ' days')`,
      [days]
    );
    const activeUsersCount = (activeUsers.rows[0] as unknown as CountResult).count;

    return {
      globalCommands,
      userCommands,
      machineCommands,
      activeMachines: activeMachinesCount,
      activeUsers: activeUsersCount,
      topCommands: topCommands.rows as unknown as Array<{ command: string; usage_count: number }>,
    };
  }

  /**
   * Gera hash SHA256 de um comando
   */
  hashCommand(command: string): string {
    return crypto.createHash('sha256').update(command).digest('hex');
  }

  /**
   * Gera ID único para sessão
   */
  generateSessionId(): string {
    return `session-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Fecha a conexão com o banco
   */
  async close(): Promise<void> {
    if (this.client) {
      // Registrar fim da sessão se aplicável
      if (this.sessionId) {
        await this.client!.execute(
          `UPDATE sessions SET ended_at = unixepoch()
                          WHERE id = ?`,
          [this.sessionId]
        );
      }

      // Fechar conexão
      await this.client.close();
      this.client = null;

      if (this.config.debug) {
        console.log('TursoHistoryClient connection closed');
      }
    }
  }

  /**
   * Executa query customizada (para operações avançadas)
   */
  async execute(sql: { sql: string; args?: InArgs } | string, args: InArgs = []): Promise<unknown> {
    if (typeof sql === 'string') {
      return await this.client!.execute(sql, args);
    } else {
      return await this.client!.execute(sql.sql, sql.args || []);
    }
  }

  /**
   * Inicia uma transação
   */
  async transaction(): Promise<unknown> {
    return await this.client!.transaction();
  }
}

// Export para uso direto via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    // Teste básico do cliente
    const client = new TursoHistoryClient({ debug: true });

    try {
      console.log('Testing TursoHistoryClient...');
      await client.initialize();

      // Salvar comando de teste
      await client.saveCommand('echo "Test command"', 'Test command output', {
        tokens_used: 10,
        execution_time_ms: 5,
      });

      // Buscar histórico
      const history = await client.getHistory(5);
      console.log('\nRecent history:');
      history.forEach(h => {
        console.log(`- ${h.command} (${new Date(h.timestamp).toLocaleString()})`);
      });

      // Estatísticas
      const stats = await client.getStats(7);
      console.log('\nStats (last 7 days):');
      console.log(JSON.stringify(stats, null, 2));

      await client.close();
    } catch (error) {
      console.error('Test failed:', error);
      process.exit(1);
    }
  })();
}
