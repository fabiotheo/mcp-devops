#!/usr/bin/env node

/**
 * TursoHistoryClient - Cliente para gerenciar histórico distribuído com Turso
 * Suporta modos: global, user, machine e hybrid
 */

import { createClient } from '@libsql/client';
import MachineIdentityManager from './machine-identity.js';
import crypto from 'crypto';
import path from 'path';
import os from 'os';

export default class TursoHistoryClient {
  constructor(config = {}) {
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
    this.mode = this.config.history_mode;
    this.sessionId = null;
    this.machineManager = new MachineIdentityManager({
      debug: this.config.debug,
    });
  }

  /**
   * Inicializa o cliente Turso e registra a máquina
   */
  async initialize() {
    try {
      // Validar configuração
      if (!this.config.turso_url || !this.config.turso_token) {
        throw new Error(
          'Turso URL and token are required. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN',
        );
      }

      // Criar cliente Turso
      if (this.config.turso_sync_url) {
        // Modo com embedded replica (suporte offline)
        this.client = createClient({
          url: this.config.turso_url,
          authToken: this.config.turso_token,
          syncUrl: this.config.turso_sync_url,
          syncInterval: this.config.turso_sync_interval,
        });
      } else {
        // Modo online apenas
        this.client = createClient({
          url: this.config.turso_url,
          authToken: this.config.turso_token,
        });
      }

      // Testar conexão
      await this.client.execute('SELECT 1');

      // Obter ID da máquina
      this.machineId = await this.machineManager.getMachineId();

      // Criar schema se necessário
      await this.ensureSchema();

      // Registrar máquina
      await this.registerMachine();

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
  async ensureSchema() {
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

    // Executar cada statement separadamente
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await this.client.execute(statement);
      }
    }
  }

  /**
   * Migra dados existentes para adicionar status onde não existe
   */
  async migrateExistingData() {
    try {
      // Timestamp de quando esta migração foi implementada (agora)
      const migrationTimestamp = Math.floor(Date.now() / 1000);

      // Migrar history_user - apenas registros antigos
      await this.client.execute(`
                UPDATE history_user
                SET status = CASE
                    WHEN response IS NULL THEN 'cancelled'
                    WHEN response = '[Cancelled by user]' THEN 'cancelled'
                    ELSE 'completed'
                END
                WHERE status IS NULL AND timestamp < ${migrationTimestamp}
            `);

      // Migrar history_global - apenas registros antigos
      await this.client.execute(`
                UPDATE history_global
                SET status = CASE
                    WHEN response IS NULL THEN 'cancelled'
                    ELSE 'completed'
                END
                WHERE status IS NULL AND timestamp < ${migrationTimestamp}
            `);

      // Migrar history_machine - apenas registros antigos
      await this.client.execute(`
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
  async registerMachine() {
    await this.machineManager.registerMachine(this.client);
    // Executar migração após registrar máquina
    await this.migrateExistingData();
  }

  /**
   * Define o usuário atual
   */
  async setUser(username) {
    if (!username) {
      this.userId = null;
      this.mode = 'global';
      return null;
    }

    try {
      const result = await this.client.execute({
        sql: 'SELECT id, name, email FROM users WHERE username = ? AND is_active = 1',
        args: [username],
      });

      if (result.rows.length > 0) {
        this.userId = result.rows[0].id;
        this.mode = 'user';
        if (this.config.debug) {
          console.log(`User set: ${username} (${this.userId})`);
        }
        return result.rows[0];
      } else {
        throw new Error(
          `User ${username} not found. Create with: ipcom-chat user create --username ${username}`,
        );
      }
    } catch (error) {
      console.error('Error setting user:', error);
      throw error;
    }
  }

  /**
   * Define o modo de operação
   */
  setMode(mode) {
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
  async saveCommand(command, response = null, metadata = {}) {
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
  async updateEntry(entryId, updates) {
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
  async updateGlobalEntry(entryId, updates) {
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

      await this.client.execute({
        sql: `UPDATE history_global SET ${updateFields.join(', ')} WHERE id = ?`,
        args: updateArgs,
      });

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
  async updateUserEntry(entryId, updates) {
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

      await this.client.execute({
        sql: `UPDATE history_user SET ${updateFields.join(', ')} WHERE id = ?`,
        args: updateArgs,
      });

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
  async updateMachineEntry(entryId, updates) {
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

      await this.client.execute({
        sql: `UPDATE history_machine SET ${updateFields.join(', ')} WHERE id = ?`,
        args: updateArgs,
      });

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
  async saveToGlobal(command, response, metadata) {
    const result = await this.client.execute({
      sql: `INSERT INTO history_global
                  (command, response, machine_id, user_id, timestamp, tokens_used, execution_time_ms, tags, session_id, status, request_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  RETURNING id`,
      args: [
        command,
        response,
        this.machineId,
        this.userId,
        Math.floor(Date.now() / 1000),
        metadata.tokens_used || null,
        metadata.execution_time_ms || null,
        JSON.stringify(metadata.tags || []),
        metadata.session_id || this.sessionId,
        metadata.status || 'pending',
        metadata.request_id || null,
      ],
    });

    // Return the ID of the inserted row
    return result.rows?.[0]?.id || null;
  }

  /**
   * Salva no histórico do usuário
   */
  async saveToUser(command, response, metadata) {
    if (!this.userId) return null;

    const result = await this.client.execute({
      sql: `INSERT INTO history_user
                  (user_id, command, response, machine_id, timestamp, session_id, context, tokens_used, execution_time_ms, status, request_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  RETURNING id`,
      args: [
        this.userId,
        command,
        response,
        this.machineId,
        Math.floor(Date.now() / 1000),
        metadata.session_id || this.sessionId,
        JSON.stringify(metadata.context || {}),
        metadata.tokens_used || null,
        metadata.execution_time_ms || null,
        metadata.status || 'pending',
        metadata.request_id || null,
      ],
    });

    // Return the ID of the inserted row
    return result.rows?.[0]?.id || null;
  }

  /**
   * Salva no histórico da máquina
   */
  async saveToMachine(command, response, metadata) {
    const result = await this.client.execute({
      sql: `INSERT INTO history_machine
                  (machine_id, command, response, user_id, timestamp, error_code, session_id, status, request_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                  RETURNING id`,
      args: [
        this.machineId,
        command,
        response,
        this.userId,
        Math.floor(Date.now() / 1000),
        metadata.error_code || null,
        metadata.session_id || this.sessionId,
        metadata.status || 'pending',
        metadata.request_id || null,
      ],
    });

    // Return the ID of the inserted row
    return result.rows?.[0]?.id || null;
  }

  /**
   * Salva no histórico da máquina com parâmetros compatíveis com sync
   * Wrapper para compatibilidade com SyncManager
   */
  async saveToMachineHistory(command, response, timestamp, sessionId) {
    await this.client.execute({
      sql: `INSERT INTO history_machine
                  (machine_id, command, response, user_id, timestamp, error_code, session_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        this.machineId,
        command,
        response,
        this.userId,
        timestamp,
        null, // error_code
        sessionId || this.sessionId,
      ],
    });
  }

  /**
   * Atualiza estatísticas da máquina
   */
  async updateMachineStats() {
    await this.client.execute({
      sql: `UPDATE machines
                  SET last_seen = unixepoch(),
                      total_commands = total_commands + 1
                  WHERE machine_id = ?`,
      args: [this.machineId],
    });
  }

  /**
   * Atualiza o status de um comando pelo request_id
   * @param {string} requestId - ID único do request
   * @param {string} status - Novo status ('completed', 'cancelled', 'failed')
   * @param {Object} additionalData - Dados adicionais (response, completedAt, etc)
   */
  async updateCommandStatus(requestId, status, additionalData = {}) {
    if (!requestId) return;

    const now = Math.floor(Date.now() / 1000);
    const updates = {
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
        const args = [updates.status, updates.updated_at];

        if (updates.completed_at) {
          sql += ', completed_at = ?';
          args.push(updates.completed_at);
        }

        if (additionalData.response) {
          sql += ', response = ?';
          args.push(additionalData.response);
        }

        sql += ' WHERE request_id = ?';
        args.push(requestId);

        await this.client.execute({ sql, args });
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
  async completeCommand(requestId, response) {
    await this.updateCommandStatus(requestId, 'completed', { response });
  }

  /**
   * Marca um comando como cancelado
   * @param {string} requestId - ID único do request
   */
  async cancelCommand(requestId) {
    await this.updateCommandStatus(requestId, 'cancelled', {
      response: '[Cancelled by user]',
    });
  }

  /**
   * Atualiza cache de comandos
   */
  async updateCommandCache(command, output, metadata) {
    const hash = this.hashCommand(command);

    await this.client.execute({
      sql: `INSERT INTO command_cache
                  (command_hash, command, output, machine_id, last_executed, avg_execution_time_ms)
                  VALUES (?, ?, ?, ?, unixepoch(), ?)
                  ON CONFLICT(command_hash) DO UPDATE SET
                    output = excluded.output,
                    last_executed = excluded.last_executed,
                    execution_count = execution_count + 1,
                    avg_execution_time_ms = (avg_execution_time_ms * execution_count + ?) / (execution_count + 1)`,
      args: [
        hash,
        command,
        output,
        this.machineId,
        metadata.execution_time_ms || 0,
        metadata.execution_time_ms || 0,
      ],
    });
  }

  /**
   * Obtém histórico de uma tabela específica
   */
  async getHistoryFromTable(table, limit = 100, offset = 0) {
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

    const result = await this.client.execute({ sql, args });
    return result.rows;
  }

  /**
   * Obtém histórico baseado no modo atual
   */
  async getHistory(limit = 100, offset = 0) {
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

    const result = await this.client.execute({ sql, args });
    return result.rows;
  }

  /**
   * Busca no histórico
   */
  async searchHistory(query, options = {}) {
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

    const result = await this.client.execute({ sql, args });
    return result.rows;
  }

  /**
   * Obtém comando do cache
   */
  async getCachedCommand(command) {
    const hash = this.hashCommand(command);

    const result = await this.client.execute({
      sql: `SELECT output, last_executed, execution_count, avg_execution_time_ms
                  FROM command_cache
                  WHERE command_hash = ?
                    AND last_executed > unixepoch('now', '-1 hour')`,
      args: [hash],
    });

    if (result.rows.length > 0) {
      return result.rows[0];
    }
    return null;
  }

  /**
   * Obtém estatísticas do histórico
   */
  async getStats(days = 30) {
    const stats = {};

    // Total de comandos por modo
    const globalCount = await this.client.execute({
      sql: `SELECT COUNT(*) as count FROM history_global
                  WHERE timestamp > unixepoch('now', '-' || ? || ' days')`,
      args: [days],
    });
    stats.globalCommands = globalCount.rows[0].count;

    if (this.userId) {
      const userCount = await this.client.execute({
        sql: `SELECT COUNT(*) as count FROM history_user
                      WHERE user_id = ? AND timestamp > unixepoch('now', '-' || ? || ' days')`,
        args: [this.userId, days],
      });
      stats.userCommands = userCount.rows[0].count;
    }

    const machineCount = await this.client.execute({
      sql: `SELECT COUNT(*) as count FROM history_machine
                  WHERE machine_id = ? AND timestamp > unixepoch('now', '-' || ? || ' days')`,
      args: [this.machineId, days],
    });
    stats.machineCommands = machineCount.rows[0].count;

    // Comandos mais usados
    const topCommands = await this.client.execute({
      sql: `SELECT command, COUNT(*) as usage_count
                  FROM history_global
                  WHERE timestamp > unixepoch('now', '-' || ? || ' days')
                  GROUP BY command
                  ORDER BY usage_count DESC
                  LIMIT 10`,
      args: [days],
    });
    stats.topCommands = topCommands.rows;

    // Máquinas ativas
    const activeMachines = await this.client.execute({
      sql: `SELECT COUNT(DISTINCT machine_id) as count
                  FROM history_global
                  WHERE timestamp > unixepoch('now', '-' || ? || ' days')`,
      args: [days],
    });
    stats.activeMachines = activeMachines.rows[0].count;

    // Usuários ativos
    const activeUsers = await this.client.execute({
      sql: `SELECT COUNT(DISTINCT user_id) as count
                  FROM history_global
                  WHERE user_id IS NOT NULL
                    AND timestamp > unixepoch('now', '-' || ? || ' days')`,
      args: [days],
    });
    stats.activeUsers = activeUsers.rows[0].count;

    return stats;
  }

  /**
   * Gera hash SHA256 de um comando
   */
  hashCommand(command) {
    return crypto.createHash('sha256').update(command).digest('hex');
  }

  /**
   * Gera ID único para sessão
   */
  generateSessionId() {
    return `session-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Fecha a conexão com o banco
   */
  async close() {
    if (this.client) {
      // Registrar fim da sessão se aplicável
      if (this.sessionId) {
        await this.client.execute({
          sql: `UPDATE sessions SET ended_at = unixepoch()
                          WHERE id = ?`,
          args: [this.sessionId],
        });
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
  async execute(sql, args = []) {
    return await this.client.execute({ sql, args });
  }

  /**
   * Inicia uma transação
   */
  async transaction() {
    return await this.client.transaction();
  }
}

// Export para uso direto via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
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
}
