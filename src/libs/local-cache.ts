/**
 * LocalCache Manager - SQLite-based local caching for offline support
 * Part of Phase 2: Multi-machine synchronization
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';

interface LocalCacheConfig {
  dbPath?: string;
  debug?: boolean;
}

interface CommandMetadata {
  command_uuid?: string;
  user_id?: string;
  machine_id?: string;
  session_id?: string;
  timestamp?: number;
  status?: string;
  tokens_used?: number;
}

interface HistoryRecord {
  id: string;
  command: string;
  response: string | null;
  timestamp: number;
  user_id: string | null;
  machine_id: string | null;
  session_id: string | null;
  status: string | null;
  tokens_used: number | null;
  sync_status: string;
  last_synced: number | null;
  command_uuid: string;
  created_at: number;
  updated_at: number;
}

interface SyncQueueItem {
  id: number;
  operation: string;
  table_name: string;
  record_id: string;
  data: string;
  priority: number;
  retry_count: number;
  created_at: number;
}

interface CacheStats {
  totalCommands: number;
  pendingSync: number;
  failedSync: number;
  oldestEntry: HistoryRecord | null;
  newestEntry: HistoryRecord | null;
  totalTokens: number;
  dbSize: number;
}

interface RemoteHistoryItem {
  id?: string;
  command_uuid?: string;
  command?: string;
  response?: string | null;
  timestamp?: number;
  user_id?: string | null;
  machine_id?: string | null;
  session_id?: string | null;
  status?: string;
  tokens_used?: number;
  completed_at?: number;
  [key: string]: unknown;
}

interface PreparedStatements {
  insertCommand?: Database.Statement;
  getHistory?: Database.Statement;
  addToQueue?: Database.Statement;
  getPendingSync?: Database.Statement;
  updateSyncStatus?: Database.Statement;
}

class LocalCache {
  private config: Required<LocalCacheConfig>;
  private db: Database.Database | null;
  private prepared: PreparedStatements;

  constructor(config: LocalCacheConfig = {}) {
    this.config = {
      dbPath: path.join(os.homedir(), '.mcp-terminal', 'cache.db'),
      debug: false,
      ...config,
    };

    this.db = null;
    this.prepared = {}; // Prepared statements cache
  }

  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.dbPath);
      await fs.mkdir(dir, { recursive: true });

      // Open database
      this.db = new Database(this.config.dbPath);
      this.db.pragma('journal_mode = WAL'); // Better concurrency
      this.db.pragma('synchronous = NORMAL'); // Balance safety/speed

      // Create tables
      this.createTables();

      // Prepare common statements
      this.prepareStatements();

      if (this.config.debug) {
        console.log(
          chalk.green('✅ LocalCache initialized at:', this.config.dbPath),
        );
      }
    } catch (error) {
      console.error(
        chalk.red('❌ LocalCache initialization failed:', error.message),
      );
      throw error;
    }
  }

  createTables() {
    // Main history cache table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS history_cache (
                id TEXT PRIMARY KEY,
                command TEXT NOT NULL,
                response TEXT,
                timestamp INTEGER NOT NULL,
                user_id TEXT,
                machine_id TEXT,
                session_id TEXT,
                status TEXT,
                tokens_used INTEGER,
                sync_status TEXT DEFAULT 'pending',
                last_synced INTEGER,
                command_uuid TEXT UNIQUE,
                created_at INTEGER DEFAULT (unixepoch()),
                updated_at INTEGER DEFAULT (unixepoch())
            );

            CREATE INDEX IF NOT EXISTS idx_cache_timestamp ON history_cache(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_cache_user ON history_cache(user_id);
            CREATE INDEX IF NOT EXISTS idx_cache_machine ON history_cache(machine_id);
            CREATE INDEX IF NOT EXISTS idx_cache_sync ON history_cache(sync_status);
            CREATE INDEX IF NOT EXISTS idx_cache_uuid ON history_cache(command_uuid);
        `);

    // Sync queue for offline operations
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation TEXT NOT NULL,
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at INTEGER DEFAULT (unixepoch()),
                retry_count INTEGER DEFAULT 0,
                last_error TEXT,
                priority INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_queue_created ON sync_queue(created_at);
            CREATE INDEX IF NOT EXISTS idx_queue_priority ON sync_queue(priority DESC);
            CREATE INDEX IF NOT EXISTS idx_queue_retry ON sync_queue(retry_count);
        `);

    // Sync metadata
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS sync_metadata (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at INTEGER DEFAULT (unixepoch())
            );
        `);

    // Conflict log
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS conflict_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command_uuid TEXT,
                local_data TEXT,
                remote_data TEXT,
                resolution TEXT,
                resolved_at INTEGER DEFAULT (unixepoch())
            );
        `);
  }

  prepareStatements() {
    // Insert command
    this.prepared.insertCommand = this.db.prepare(`
            INSERT OR REPLACE INTO history_cache (
                id, command, response, timestamp, user_id, machine_id,
                session_id, status, tokens_used, sync_status, command_uuid
            ) VALUES (
                @id, @command, @response, @timestamp, @user_id, @machine_id,
                @session_id, @status, @tokens_used, @sync_status, @command_uuid
            )
        `);

    // Get recent history
    this.prepared.getHistory = this.db.prepare(`
            SELECT * FROM history_cache
            WHERE (@user_id IS NULL OR user_id = @user_id)
            AND (@machine_id IS NULL OR machine_id = @machine_id)
            ORDER BY timestamp DESC
            LIMIT @limit OFFSET @offset
        `);

    // Add to sync queue
    this.prepared.addToQueue = this.db.prepare(`
            INSERT INTO sync_queue (operation, table_name, record_id, data, priority)
            VALUES (@operation, @table_name, @record_id, @data, @priority)
        `);

    // Get pending sync items
    this.prepared.getPendingSync = this.db.prepare(`
            SELECT * FROM sync_queue
            WHERE retry_count < 3
            ORDER BY priority DESC, created_at ASC
            LIMIT @limit
        `);

    // Update sync status
    this.prepared.updateSyncStatus = this.db.prepare(`
            UPDATE history_cache
            SET sync_status = @status, last_synced = @timestamp
            WHERE command_uuid = @uuid
        `);
  }

  /**
   * Save a command to local cache
   */
  async saveCommand(command: string, response: string | null, metadata: CommandMetadata = {}): Promise<string> {
    // Input validation
    if (!command || typeof command !== 'string') {
      throw new Error('Command must be a non-empty string');
    }

    // Limit command and response size to prevent database bloat
    const MAX_COMMAND_SIZE = 10000; // 10KB limit
    const MAX_RESPONSE_SIZE = 100000; // 100KB limit

    if (command.length > MAX_COMMAND_SIZE) {
      console.error(
        chalk.yellow(
          `[Cache] Command too large (${command.length} chars), truncating`,
        ),
      );
      command = command.substring(0, MAX_COMMAND_SIZE) + '...[truncated]';
    }

    if (response && response.length > MAX_RESPONSE_SIZE) {
      console.error(
        chalk.yellow(
          `[Cache] Response too large (${response.length} chars), truncating`,
        ),
      );
      response = response.substring(0, MAX_RESPONSE_SIZE) + '...[truncated]';
    }

    const commandUuid = metadata.command_uuid || uuidv4();
    const timestamp = metadata.timestamp || Date.now();

    const data = {
      id: commandUuid,
      command,
      response,
      timestamp: Math.floor(timestamp / 1000),
      user_id: metadata.user_id || null,
      machine_id: metadata.machine_id || null,
      session_id: metadata.session_id || null,
      status: metadata.status || 'completed',
      tokens_used: metadata.tokens_used || 0,
      sync_status: 'pending',
      command_uuid: commandUuid,
    };

    try {
      this.prepared.insertCommand.run(data);

      // Add to sync queue for background upload
      this.prepared.addToQueue.run({
        operation: 'insert',
        table_name: 'history',
        record_id: commandUuid,
        data: JSON.stringify(data),
        priority: 0,
      });

      if (this.config.debug) {
        console.log(
          chalk.gray(`[Cache] Saved: ${command.substring(0, 50)}...`),
        );
      }

      return commandUuid;
    } catch (error) {
      console.error(chalk.red('[Cache] Save error:', error.message));
      throw error;
    }
  }

  /**
   * Get history from local cache
   */
  public getHistory(options: {
    user_id?: string | null;
    machine_id?: string | null;
    limit?: number;
    offset?: number;
  } = {}): HistoryRecord[] {
    const {
      user_id = null,
      machine_id = null,
      limit = 100,
      offset = 0,
    } = options;

    try {
      const results = this.prepared.getHistory.all({
        user_id,
        machine_id,
        limit,
        offset,
      }) as HistoryRecord[];

      return results.map((row) => ({
        ...row,
        timestamp: row.timestamp * 1000, // Convert back to milliseconds
      }));
    } catch (error) {
      console.error(chalk.red('[Cache] Get history error:', error.message));
      return [];
    }
  }

  /**
   * Get items pending synchronization
   */
  getPendingSync(limit = 100) {
    try {
      return this.prepared.getPendingSync.all({ limit });
    } catch (error) {
      console.error(
        chalk.red('[Cache] Get pending sync error:', error.message),
      );
      return [];
    }
  }

  /**
   * Mark items as synchronized
   */
  markSynced(uuids: string[]): boolean {
    const timestamp = Math.floor(Date.now() / 1000);
    const update = this.db.prepare(`
            UPDATE history_cache
            SET sync_status = 'synced', last_synced = ?
            WHERE command_uuid = ?
        `);

    const updateMany = this.db.transaction((uuids: string[]) => {
      for (const uuid of uuids) {
        update.run(timestamp, uuid);
      }
    });

    try {
      updateMany(uuids);
      return true;
    } catch (error) {
      console.error(chalk.red('[Cache] Mark synced error:', error.message));
      return false;
    }
  }

  /**
   * Clear sync queue after successful sync
   */
  clearSyncQueue(ids: number[]): boolean {
    const del = this.db.prepare('DELETE FROM sync_queue WHERE id = ?');

    const deleteMany = this.db.transaction((ids: number[]) => {
      for (const id of ids) {
        del.run(id);
      }
    });

    try {
      deleteMany(ids);
      return true;
    } catch (error) {
      console.error(chalk.red('[Cache] Clear queue error:', error.message));
      return false;
    }
  }

  /**
   * Update retry count for failed sync
   */
  incrementRetryCount(id: number, error: unknown): void {
    try {
      // Safely convert error to string
      const errorMessage = error
        ? typeof error === 'string'
          ? error
          : error instanceof Error ? error.message : String(error)
        : 'Unknown error';

      this.db
        .prepare(
          `
                UPDATE sync_queue
                SET retry_count = retry_count + 1,
                    last_error = @error
                WHERE id = @id
            `,
        )
        .run({ id, error: errorMessage.substring(0, 500) });
    } catch (err) {
      console.error(chalk.red('[Cache] Update retry error:', err.message));
    }
  }

  /**
   * Get sync metadata
   */
  public getMetadata(key: string): string | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const row = this.db
        .prepare('SELECT value FROM sync_metadata WHERE key = ?')
        .get(key) as { value: string } | undefined;
      if (!row) return null;

      // Safely parse JSON
      try {
        return JSON.parse(row.value);
      } catch (parseError) {
        console.error(
          chalk.red('[Cache] Failed to parse metadata:', parseError.message),
        );
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Set sync metadata
   */
  setMetadata(key: string, value: unknown): boolean {
    try {
      this.db
        .prepare(
          `
                INSERT OR REPLACE INTO sync_metadata (key, value, updated_at)
                VALUES (?, ?, ?)
            `,
        )
        .run(key, JSON.stringify(value), Math.floor(Date.now() / 1000));
      return true;
    } catch (error) {
      console.error(chalk.red('[Cache] Set metadata error:', error.message));
      return false;
    }
  }

  /**
   * Import history from remote (during sync)
   */
  importHistory(remoteHistory: RemoteHistoryItem[]): boolean {
    const insert = this.db.prepare(`
            INSERT OR IGNORE INTO history_cache (
                id, command, response, timestamp, user_id, machine_id,
                session_id, status, tokens_used, sync_status, command_uuid
            ) VALUES (
                @id, @command, @response, @timestamp, @user_id, @machine_id,
                @session_id, @status, @tokens_used, 'synced', @command_uuid
            )
        `);

    const importMany = this.db.transaction((items: RemoteHistoryItem[]) => {
      for (const item of items) {
        insert.run({
          ...item,
          id: item.command_uuid || item.id,
          command: item.command || '',
          response: item.response || null,
          timestamp: item.timestamp || item.completed_at || Math.floor(Date.now() / 1000),
          command_uuid: item.command_uuid || item.id,
          status: item.status || 'completed',
          tokens_used: item.tokens_used || 0,
        });
      }
    });

    try {
      importMany(remoteHistory);
      if (this.config.debug) {
        console.log(
          chalk.green(`[Cache] Imported ${remoteHistory.length} items`),
        );
      }
      return true;
    } catch (error) {
      console.error(chalk.red('[Cache] Import error:', error.message));
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    try {
      const stats = this.db
        .prepare(
          `
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
                    SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) as pending,
                    (SELECT COUNT(*) FROM sync_queue WHERE retry_count < 3) as queue_size
                FROM history_cache
            `,
        )
        .get();

      return stats;
    } catch (error) {
      return { total: 0, synced: 0, pending: 0, queue_size: 0 };
    }
  }

  /**
   * Clean old cache entries
   */
  cleanup(daysToKeep: number = 30): number {
    const cutoff = Math.floor(
      (Date.now() - daysToKeep * 24 * 60 * 60 * 1000) / 1000,
    );

    try {
      const result = this.db
        .prepare(
          `
                DELETE FROM history_cache
                WHERE timestamp < ? AND sync_status = 'synced'
            `,
        )
        .run(cutoff);

      if (this.config.debug) {
        console.log(
          chalk.gray(`[Cache] Cleaned ${result.changes} old entries`),
        );
      }
      return result.changes;
    } catch (error) {
      console.error(chalk.red('[Cache] Cleanup error:', error.message));
      return 0;
    }
  }

  /**
   * Execute a query that returns a single row
   */
  public query<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  /**
   * Execute a query that modifies data (INSERT, UPDATE, DELETE)
   */
  public execute(sql: string, ...params: unknown[]): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare(sql).run(...params);
  }

  close() {
    if (this.db) {
      // Finalize all prepared statements
      try {
        for (const key in this.prepared) {
          if (
            this.prepared[key] &&
            typeof this.prepared[key].finalize === 'function'
          ) {
            this.prepared[key].finalize();
          }
        }
      } catch (error) {
        console.error(
          chalk.red('[Cache] Error finalizing statements:', error.message),
        );
      }

      // Close database connection
      this.db.close();
      this.db = null;
      this.prepared = {};
    }
  }
}

export default LocalCache;
