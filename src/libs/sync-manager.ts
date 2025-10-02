/**
 * SyncManager - Bidirectional synchronization between local cache and Turso
 * Part of Phase 2: Multi-machine synchronization
 */

import LocalCache from './local-cache.js';
import TursoHistoryClient from './turso-client.js';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import type { Client } from '@libsql/client';

/**
 * Configuration options for SyncManager
 */
interface SyncConfig {
  syncInterval?: number;
  batchSize?: number;
  maxRetries?: number;
  conflictStrategy?: 'last-write-wins' | 'merge' | 'manual';
  debug?: boolean;
}

/**
 * Synchronization statistics
 */
interface SyncStats {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: number;
}

/**
 * Local cache entry
 */
interface CacheEntry {
  id: string;
  command: string;
  response?: string;
  timestamp: number;
  sync_status?: string;
  machine_id?: string;
  user_id?: string;
  status?: string;
  session_id?: string;
  command_uuid?: string;
}

/**
 * Remote item from Turso
 */
interface RemoteItem {
  id?: string;
  command: string;
  response?: string;
  timestamp?: number;
  status?: string;
  user_id?: string;
  machine_id?: string;
  [key: string]: unknown;
}

/**
 * Sync queue item from local cache
 */
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

/**
 * Options for getting history
 */
interface GetHistoryOptions {
  user_id?: string | null;
  machine_id?: string | null;
  limit?: number;
  offset?: number;
}

/**
 * Upload/Download result
 */
interface SyncResult {
  count: number;
  errors: number;
  conflicts?: number;
}

/**
 * Extended TursoHistoryClient interface
 */
interface ExtendedTursoClient extends TursoHistoryClient {
  client: Client;
  userId: string | null;
  machineId: string | null;
}

class SyncManager {
  private config: Required<SyncConfig>;
  private localCache: LocalCache | null;
  private tursoClient: ExtendedTursoClient | null;
  private syncTimer: NodeJS.Timeout | null;
  private isSyncing: boolean;
  private lastSyncTime: number | null;
  private syncStats: SyncStats;

  constructor(config: SyncConfig = {}) {
    this.config = {
      syncInterval: 30000, // 30 seconds
      batchSize: 100,
      maxRetries: 3,
      conflictStrategy: 'last-write-wins',
      debug: false,
      ...config,
    };

    this.localCache = null;
    this.tursoClient = null;
    this.syncTimer = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncStats = {
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      errors: 0,
    };
  }

  async initialize(tursoClient: TursoHistoryClient): Promise<boolean> {
    try {
      // Initialize local cache
      this.localCache = new LocalCache({
        debug: this.config.debug,
      });
      await this.localCache.initialize();

      // Use provided Turso client
      this.tursoClient = tursoClient as ExtendedTursoClient;

      // Load last sync time
      const lastSyncValue = this.localCache.getMetadata('last_sync_time');
      this.lastSyncTime = typeof lastSyncValue === 'string'
        ? parseInt(lastSyncValue, 10)
        : typeof lastSyncValue === 'number'
        ? lastSyncValue
        : null;

      if (this.config.debug) {
        console.log(chalk.green('✅ SyncManager initialized'));
        if (this.lastSyncTime) {
          console.log(
            chalk.gray(
              `Last sync: ${new Date(this.lastSyncTime).toLocaleString()}`,
            ),
          );
        }
      }

      // Start periodic sync if enabled
      if (this.config.syncInterval > 0) {
        this.startPeriodicSync();
      }

      return true;
    } catch (error) {
      console.error(
        chalk.red('❌ SyncManager initialization failed:', error.message),
      );
      return false;
    }
  }

  /**
   * Start periodic background sync
   */
  startPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      if (!this.isSyncing) {
        await this.sync();
      }
    }, this.config.syncInterval);

    if (this.config.debug) {
      console.log(
        chalk.gray(
          `[Sync] Periodic sync started (${this.config.syncInterval}ms interval)`,
        ),
      );
    }
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Main sync function - bidirectional sync
   */
  async sync() {
    if (this.isSyncing) {
      if (this.config.debug) {
        console.log(chalk.yellow('[Sync] Already syncing, skipping...'));
      }
      return { success: false, reason: 'already_syncing' };
    }

    this.isSyncing = true;
    const syncId = uuidv4().substring(0, 8);

    try {
      if (this.config.debug) {
        console.log(chalk.blue(`[Sync:${syncId}] Starting sync...`));
      }

      // Check if Turso is available
      if (!this.tursoClient || !this.tursoClient.client) {
        throw new Error('Turso client not available');
      }

      const results = {
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        errors: 0,
      };

      // Step 1: Upload local changes to Turso
      const uploadResult = await this.uploadToTurso();
      results.uploaded = uploadResult.count;
      results.errors += uploadResult.errors;

      // Step 2: Download remote changes from Turso
      const downloadResult = await this.downloadFromTurso();
      results.downloaded = downloadResult.count;
      results.conflicts = downloadResult.conflicts;

      // Step 3: Clean up sync queue
      await this.cleanupSyncQueue();

      // Update last sync time
      this.lastSyncTime = Date.now();
      this.localCache.setMetadata('last_sync_time', this.lastSyncTime);

      // Update stats
      this.syncStats.uploaded += results.uploaded;
      this.syncStats.downloaded += results.downloaded;
      this.syncStats.conflicts += results.conflicts;
      this.syncStats.errors += results.errors;

      if (this.config.debug) {
        console.log(
          chalk.green(
            `[Sync:${syncId}] Complete:`,
            `↑${results.uploaded} ↓${results.downloaded}`,
            results.conflicts > 0 ? `⚠${results.conflicts}` : '',
          ),
        );
      }

      return { success: true, ...results };
    } catch (error) {
      if (this.config.debug) {
        console.log(chalk.red(`[Sync:${syncId}] Failed:`, error.message));
      }
      this.syncStats.errors++;
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Upload pending local changes to Turso
   */
  async uploadToTurso() {
    const result = { count: 0, errors: 0 };

    try {
      // Get pending items from sync queue
      const pendingItems = this.localCache.getPendingSync(
        this.config.batchSize,
      ) as SyncQueueItem[];

      if (pendingItems.length === 0) {
        return result;
      }

      if (this.config.debug) {
        console.log(
          chalk.gray(`[Sync] Uploading ${pendingItems.length} items...`),
        );
      }

      const successIds: number[] = [];
      const successUuids: string[] = [];

      for (const item of pendingItems) {
        try {
          // Safely parse JSON data
          let data;
          try {
            data = JSON.parse(item.data);
          } catch (parseError) {
            console.error(
              chalk.red(
                `[Sync] Invalid JSON in sync queue item ${item.id}:`,
                parseError.message,
              ),
            );
            // Mark as permanently failed
            this.localCache.incrementRetryCount(item.id, 'Invalid JSON data');
            result.errors++;
            continue;
          }

          // Upload to appropriate Turso table based on metadata
          if (data.user_id && this.tursoClient.userId) {
            // User-specific history
            await this.tursoClient.saveCommand(data.command, data.response, {
              status: data.status,
              timestamp: new Date(data.timestamp * 1000).toISOString(),
              session_id: data.session_id,
              command_uuid: data.command_uuid,
            });
          } else {
            // Machine or global history
            await this.tursoClient.saveToMachineHistory(
              data.command,
              data.response,
              data.timestamp,
              data.session_id,
            );
          }

          successIds.push(item.id);
          successUuids.push(data.command_uuid);
          result.count++;
        } catch (error) {
          // Increment retry count
          this.localCache.incrementRetryCount(item.id, error.message);
          result.errors++;

          if (this.config.debug) {
            console.log(
              chalk.yellow(
                `[Sync] Upload failed for ${item.id}:`,
                error.message,
              ),
            );
          }
        }
      }

      // Mark successful items as synced
      if (successUuids.length > 0) {
        this.localCache.markSynced(successUuids);
        this.localCache.clearSyncQueue(successIds);
      }

      return result;
    } catch (error) {
      console.error(chalk.red('[Sync] Upload error:', error.message));
      return result;
    }
  }

  /**
   * Download new items from Turso to local cache
   */
  async downloadFromTurso() {
    const result = { count: 0, conflicts: 0 };

    try {
      // Determine what to download based on last sync
      const since = this.lastSyncTime
        ? Math.floor(this.lastSyncTime / 1000)
        : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000); // Last 7 days

      if (this.config.debug) {
        console.log(
          chalk.gray(
            `[Sync] Downloading since ${new Date(since * 1000).toLocaleString()}...`,
          ),
        );
      }

      // Get recent history from Turso with pagination support
      let remoteHistory = [];
      let offset = 0;
      let hasMore = true;

      // Download with pagination to avoid large result sets
      while (hasMore && remoteHistory.length < this.config.batchSize * 2) {
        const pageSize = Math.min(this.config.batchSize, 100);
        let pageResults = [];

        // Download from appropriate tables
        if (this.tursoClient.userId) {
          // Get user history
          const userHistory = await this.tursoClient.client.execute({
            sql: `SELECT * FROM history_user
                              WHERE user_id = ? AND timestamp > ?
                              ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
            args: [this.tursoClient.userId, since, pageSize, offset],
          });
          pageResults = pageResults.concat(userHistory.rows);
        }

        // Get machine history
        const machineHistory = await this.tursoClient.client.execute({
          sql: `SELECT * FROM history_machine
                          WHERE machine_id = ? AND timestamp > ?
                          ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
          args: [this.tursoClient.machineId, since, pageSize, offset],
        });
        pageResults = pageResults.concat(machineHistory.rows);

        // Check if we got results
        if (pageResults.length === 0) {
          hasMore = false;
        } else {
          remoteHistory = remoteHistory.concat(pageResults);
          offset += pageSize;

          // Stop if we have enough results
          if (pageResults.length < pageSize) {
            hasMore = false;
          }
        }
      }

      if (remoteHistory.length === 0) {
        return result;
      }

      if (this.config.debug) {
        console.log(
          chalk.gray(
            `[Sync] Processing ${remoteHistory.length} remote items...`,
          ),
        );
      }

      // Process each remote item
      const itemsToImport = [];
      for (const item of remoteHistory) {
        const remoteItem = item as RemoteItem;
        const conflict = await this.checkConflict(remoteItem);

        if (conflict) {
          // Resolve conflict
          const resolved = await this.resolveConflict(
            conflict.local,
            remoteItem,
          );
          if (resolved === remoteItem) {
            itemsToImport.push(remoteItem);
          }
          result.conflicts++;
        } else {
          // No conflict, import directly
          itemsToImport.push(remoteItem);
        }
      }

      // Import to local cache
      if (itemsToImport.length > 0) {
        this.localCache.importHistory(itemsToImport);
        result.count = itemsToImport.length;
      }

      return result;
    } catch (error) {
      console.error(chalk.red('[Sync] Download error:', error.message));
      return result;
    }
  }

  /**
   * Check if a remote item conflicts with local cache
   */
  async checkConflict(remoteItem: RemoteItem): Promise<{ local: CacheEntry; remote: RemoteItem } | null> {
    try {
      const localItem = this.localCache.query<CacheEntry>(
        `SELECT * FROM history_cache WHERE command_uuid = ?`,
        remoteItem.command_uuid || remoteItem.id
      );

      if (!localItem) {
        return null; // No conflict
      }

      // Check if they differ
      if (
        localItem.command !== remoteItem.command ||
        localItem.response !== remoteItem.response ||
        localItem.status !== remoteItem.status
      ) {
        return { local: localItem, remote: remoteItem };
      }

      return null; // Same content, no conflict
    } catch (error) {
      return null;
    }
  }

  /**
   * Resolve conflict between local and remote items
   */
  async resolveConflict(localItem: CacheEntry, remoteItem: RemoteItem): Promise<RemoteItem> {
    if (this.config.conflictStrategy === 'last-write-wins') {
      // Choose the item with the most recent timestamp
      const winner =
        localItem.timestamp > (remoteItem.timestamp || 0) ? localItem : remoteItem;

      // Log conflict resolution
      this.localCache.execute(
        `INSERT INTO conflict_log (command_uuid, local_data, remote_data, resolution)
         VALUES (?, ?, ?, ?)`,
        localItem.command_uuid,
        JSON.stringify(localItem),
        JSON.stringify(remoteItem),
        winner === localItem ? 'kept_local' : 'kept_remote'
      );

      if (this.config.debug) {
        console.log(
          chalk.yellow(
            `[Sync] Conflict resolved:`,
            winner === localItem ? 'kept local' : 'kept remote',
          ),
        );
      }

      return winner === localItem ? (localItem as unknown as RemoteItem) : remoteItem;
    }

    // Default: keep remote (server wins)
    return remoteItem;
  }

  /**
   * Clean up old items from sync queue
   */
  async cleanupSyncQueue(): Promise<void> {
    try {
      // Remove items that have been retried too many times
      this.localCache.execute(
        `DELETE FROM sync_queue WHERE retry_count >= ?`,
        this.config.maxRetries
      );

      // Clean up old synced items from cache
      this.localCache.cleanup(30); // Keep 30 days
    } catch (error) {
      if (this.config.debug) {
        console.log(chalk.yellow('[Sync] Cleanup error:', error.message));
      }
    }
  }

  /**
   * Force immediate sync
   */
  async forceSync(): Promise<void> {
    if (this.config.debug) {
      console.log(chalk.blue('[Sync] Force sync requested'));
    }
    await this.sync();
  }

  /**
   * Get sync statistics
   */
  getStats() {
    const cacheStats = this.localCache.getStats();
    return {
      ...this.syncStats,
      cache: cacheStats,
      lastSync: this.lastSyncTime,
      isSyncing: this.isSyncing,
    };
  }

  /**
   * Save command with sync
   */
  async saveCommand(command: string, response: string | null, metadata: Record<string, unknown> = {}): Promise<string> {
    // Save to local cache first
    const uuid = await this.localCache.saveCommand(command, response, metadata);

    // Trigger async sync if online
    if (!this.isSyncing) {
      setImmediate(() => {
        this.sync().catch(err => {
          if (this.config.debug) {
            console.log(
              chalk.yellow('[Sync] Background sync failed:', err.message),
            );
          }
        });
      });
    }

    return uuid;
  }

  /**
   * Get history with offline support
   */
  async getHistory(options: GetHistoryOptions = {}): Promise<CacheEntry[]> {
    try {
      // Try to get from Turso if online
      if (this.tursoClient && this.tursoClient.client) {
        const tursoHistory = await this.tursoClient.getHistory(
          options.limit || 100,
        );
        // Import to cache for offline access
        this.localCache.importHistory(tursoHistory);
        return tursoHistory as CacheEntry[];
      }
    } catch (error) {
      if (this.config.debug) {
        console.log(chalk.yellow('[Sync] Falling back to local cache'));
      }
    }

    // Fall back to local cache
    return this.localCache.getHistory(options);
  }

  /**
   * Close and cleanup
   */
  close(): void {
    this.stopPeriodicSync();
    if (this.localCache) {
      this.localCache.close();
    }
  }
}

export default SyncManager;
