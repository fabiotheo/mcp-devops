import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * TursoAdapter
 * Integrates Turso distributed history with the new interface
 */
class TursoAdapter {
    constructor(options = {}) {
        this.debug = options.debug || false;
        this.userId = options.userId || 'default';
        this.tursoClientPath = options.tursoClientPath ||
            path.join(__dirname, '..', '..', '..', 'libs', 'turso-client.js');
        this.configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');
        this.tursoClient = null;
        this.initialized = false;
        this.enabled = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Check if Turso is configured
            const configExists = await this.checkConfig();
            if (!configExists) {
                if (this.debug) {
                    console.log('[TursoAdapter] Turso not configured, running in offline mode');
                }
                this.initialized = true;
                return;
            }

            // Load Turso client
            const module = await import(this.tursoClientPath);
            const TursoHistoryClient = module.default || module.TursoHistoryClient;

            // Load configuration
            const config = JSON.parse(await fs.readFile(this.configPath, 'utf8'));

            // Initialize client
            this.tursoClient = new TursoHistoryClient({
                ...config,
                debug: this.debug
            });

            await this.tursoClient.initialize();

            // Set the user using the proper method that maps username to ID
            if (this.userId && this.userId !== 'default') {
                try {
                    const userInfo = await this.tursoClient.setUser(this.userId);
                    if (userInfo) {
                        if (this.debug) {
                            console.log(`[TursoAdapter] User set successfully:`, userInfo);
                        }
                    } else {
                        if (this.debug) {
                            console.log(`[TursoAdapter] User "${this.userId}" not found in database`);
                        }
                    }
                } catch (err) {
                    if (this.debug) {
                        console.error(`[TursoAdapter] Error setting user:`, err);
                    }
                }
            }
            this.enabled = true;

            if (this.debug) {
                console.log('[TursoAdapter] Turso client initialized successfully');
            }

            this.initialized = true;
        } catch (error) {
            console.error('[TursoAdapter] Failed to initialize:', error);
            // Turso is optional, don't throw
            this.initialized = true;
        }
    }

    async checkConfig() {
        try {
            await fs.access(this.configPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if Turso is connected and ready
     * @returns {boolean} - Connection status
     */
    isConnected() {
        return this.enabled && this.tursoClient !== null;
    }

    /**
     * Add command to history (alias for saveCommand)
     * @param {string} command - Command to save
     * @param {string} response - Command response
     * @returns {Promise<boolean>} - Success status
     */
    async addToHistory(command, response = null) {
        return this.saveCommand(command, { response });
    }

    /**
     * Save only the question/command immediately (without response)
     * @param {string} command - Command to save
     * @returns {Promise<string>} - The ID of the saved entry
     */
    async saveQuestion(command) {
        if (!this.enabled || !this.tursoClient) {
            return null;
        }

        try {
            // Save command without response (will be updated later)
            const entryId = await this.tursoClient.saveCommand(
                command,
                null,  // No response yet
                {
                    source: 'ink-interface',
                    status: 'pending'  // Mark as pending response
                }
            );

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
     * @param {string} entryId - ID of the entry to update
     * @param {string} response - Response to add
     * @returns {Promise<boolean>} - Success status
     */
    async updateWithResponse(entryId, response) {
        if (!this.enabled || !this.tursoClient || !entryId) {
            return false;
        }

        try {
            // Update the entry with response
            await this.tursoClient.updateEntry(entryId, {
                response: response,
                status: 'completed'
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
     * @param {string} entryId - ID of the entry to mark as cancelled
     * @returns {Promise<boolean>} - Success status
     */
    async markAsCancelled(entryId) {
        if (!this.enabled || !this.tursoClient || !entryId) {
            return false;
        }

        try {
            // Mark the entry as cancelled
            await this.tursoClient.updateEntry(entryId, {
                status: 'cancelled',
                response: '[Cancelled by user]'
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
     * @param {string} command - Command to save
     * @param {object} metadata - Additional metadata
     * @returns {Promise<boolean>} - Success status
     */
    async saveCommand(command, metadata = {}) {
        if (!this.enabled || !this.tursoClient) {
            return false;
        }

        try {
            // Extract response from metadata if present
            const { response, ...otherMetadata } = metadata;

            // Use the TursoHistoryClient's saveCommand method
            await this.tursoClient.saveCommand(
                command,
                response || null,
                {
                    source: 'ink-interface',
                    ...otherMetadata
                }
            );

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
     * @param {number} limit - Number of entries to retrieve
     * @returns {Promise<Array>} - Array of history entries
     */
    async getHistory(limit = 100) {
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
     * @param {string} query - Search query
     * @param {number} limit - Number of results
     * @returns {Promise<string[]>} - Matching commands
     */
    async searchHistory(query, limit = 10) {
        if (!this.enabled || !this.tursoClient) {
            return [];
        }

        try {
            const results = await this.tursoClient.searchHistory(query, {
                limit,
                source: 'ink-interface'
            });

            return results.map(result => result.command);
        } catch (error) {
            if (this.debug) {
                console.error('[TursoAdapter] Error searching history:', error);
            }
            return [];
        }
    }

    /**
     * Sync local history with Turso
     * @param {string[]} localHistory - Local command history
     * @returns {Promise<void>}
     */
    async syncHistory(localHistory) {
        if (!this.enabled || !this.tursoClient) {
            return;
        }

        try {
            for (const command of localHistory) {
                await this.saveCommand(command, {
                    synced: true,
                    syncTime: new Date().toISOString()
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
    async cleanup() {
        if (this.tursoClient && typeof this.tursoClient.close === 'function') {
            await this.tursoClient.close();
        }
        this.tursoClient = null;
        this.enabled = false;
    }
}

export default TursoAdapter;