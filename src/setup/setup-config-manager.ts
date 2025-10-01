/**
 * Configuration Manager for MCP Terminal Setup
 *
 * Manages all configuration-related operations including:
 * - Loading and saving configuration files
 * - API key management
 * - Configuration validation
 * - Migration from old configurations
 */

import * as path from 'path';
import * as os from 'os';
import { SetupConfig, APIConfig } from './setup-types.js';
import { DEFAULT_API_CONFIG, DEFAULT_MODELS } from './setup-config.js';
import * as io from './setup-io.js';
import * as system from './setup-system.js';

/**
 * Legacy config format for migration
 */
interface LegacyConfig {
  ai_provider?: string;
  anthropic_api_key?: string;
  claude_api_key?: string;  // Old field name
  openai_api_key?: string;
  gemini_api_key?: string;
  google_api_key?: string;  // Old field name
  claude_model?: string;
  openai_model?: string;
  gemini_model?: string;
  version?: string;
  created?: string;
  [key: string]: unknown;  // Allow other legacy fields
}

/**
 * ConfigManager class handles all configuration operations
 */
export class ConfigManager {
  private config: SetupConfig;
  private apiConfig: APIConfig | null = null;

  constructor(customConfig?: Partial<SetupConfig>) {
    const homeDir = system.getUserHome();
    const mcpDir = path.join(homeDir, '.mcp-terminal');

    // Initialize with defaults
    this.config = {
      homeDir,
      mcpDir,
      configDir: path.join(mcpDir, 'config'),
      configPath: path.join(mcpDir, 'config.json'),
      zshrcPath: path.join(homeDir, '.zshrc'),
      bashrcPath: path.join(homeDir, '.bashrc'),
      versionFilePath: path.join(mcpDir, '.version'),
      backupDir: path.join(mcpDir, '.backups'),
      logsDir: path.join(mcpDir, 'logs'),
      platform: system.detectPlatform(),
      shell: system.detectShell(),
      isRoot: system.isRoot(),
      currentShell: system.detectShell().type,
      verbose: false,
      version: '1.0.0',
      ...customConfig
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): SetupConfig {
    return { ...this.config };
  }

  /**
   * Update configuration with new values
   */
  updateConfig(updates: Partial<SetupConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Load API configuration from disk
   */
  async loadAPIConfig(): Promise<APIConfig | null> {
    if (!this.config.configPath) {
      throw new Error('Config path is not defined');
    }

    try {
      const configData = await io.readJsonFile<APIConfig>(this.config.configPath);

      if (configData) {
        // Validate and set defaults if missing
        this.apiConfig = this.normalizeAPIConfig(configData);
        return this.apiConfig;
      }

      return null;
    } catch (error) {
      // Config doesn't exist yet
      return null;
    }
  }

  /**
   * Save API configuration to disk
   */
  async saveAPIConfig(apiConfig: APIConfig): Promise<void> {
    if (!this.config.configPath) {
      throw new Error('Config path is not defined');
    }

    const normalizedConfig = this.normalizeAPIConfig(apiConfig);

    // Ensure directory exists
    await io.ensureDir(this.config.mcpDir);

    // Save configuration
    await io.writeJsonFile(this.config.configPath, normalizedConfig, {
      indent: 2,
      atomic: true
    });

    this.apiConfig = normalizedConfig;
  }

  /**
   * Get or create default API configuration
   */
  async getOrCreateAPIConfig(): Promise<APIConfig> {
    // Try to load existing config
    const existingConfig = await this.loadAPIConfig();

    if (existingConfig) {
      return existingConfig;
    }

    // Create default config
    const defaultConfig: APIConfig = {
      ...DEFAULT_API_CONFIG,
      ai_provider: 'claude',
      claude_model: DEFAULT_MODELS.claude,
      openai_model: DEFAULT_MODELS.openai,
      gemini_model: DEFAULT_MODELS.gemini
    } as APIConfig;

    return defaultConfig;
  }

  /**
   * Validate API keys for the selected provider
   */
  validateAPIKeys(apiConfig: APIConfig): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    switch (apiConfig.ai_provider) {
      case 'claude':
        if (!apiConfig.anthropic_api_key) {
          missing.push('anthropic_api_key');
        }
        break;

      case 'openai':
        if (!apiConfig.openai_api_key) {
          missing.push('openai_api_key');
        }
        break;

      case 'gemini':
        if (!apiConfig.gemini_api_key) {
          missing.push('gemini_api_key');
        }
        break;
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Migrate old configuration format to new format
   */
  async migrateOldConfig(): Promise<boolean> {
    const oldConfigPath = path.join(this.config.homeDir, '.mcp_config.json');

    // Check if old config exists
    if (!await io.fileExists(oldConfigPath)) {
      return false;
    }

    try {
      // Load old config
      const oldConfig = await io.readJsonFile<LegacyConfig>(oldConfigPath);

      if (!oldConfig) {
        return false;
      }

      // Map old format to new format
      const newConfig: APIConfig = {
        ai_provider: oldConfig.ai_provider || 'claude',
        anthropic_api_key: oldConfig.anthropic_api_key || oldConfig.claude_api_key || '',
        openai_api_key: oldConfig.openai_api_key || '',
        gemini_api_key: oldConfig.gemini_api_key || oldConfig.google_api_key || '',
        claude_model: oldConfig.claude_model || DEFAULT_MODELS.claude,
        openai_model: oldConfig.openai_model || DEFAULT_MODELS.openai,
        gemini_model: oldConfig.gemini_model || DEFAULT_MODELS.gemini,
        version: oldConfig.version || '1.0.0',
        created: oldConfig.created || new Date().toISOString()
      };

      // Save in new location
      await this.saveAPIConfig(newConfig);

      // Create backup of old config
      if (!this.config.backupDir) {
        throw new Error('Backup directory is not defined');
      }
      const backupPath = path.join(this.config.backupDir, 'old_config.json');
      await io.ensureDir(this.config.backupDir);
      await io.copyFile(oldConfigPath, backupPath);

      // Remove old config
      await io.deleteFile(oldConfigPath);

      console.log('✅ Successfully migrated old configuration');
      return true;
    } catch (error) {
      console.error('Error migrating old config:', error);
      return false;
    }
  }

  /**
   * Check if this is a fresh installation (no existing config)
   */
  async isFreshInstall(): Promise<boolean> {
    if (!this.config.configPath) {
      return true;
    }
    return !await io.fileExists(this.config.configPath);
  }

  /**
   * Get the current installed version
   */
  async getInstalledVersion(): Promise<string | null> {
    if (!this.config.versionFilePath) {
      return null;
    }
    try {
      const version = await io.readFile(this.config.versionFilePath, 'utf8');
      return version.trim();
    } catch {
      return null;
    }
  }

  /**
   * Save the current version
   */
  async saveVersion(version: string): Promise<void> {
    if (!this.config.versionFilePath) {
      throw new Error('Version file path is not defined');
    }
    await io.ensureDir(this.config.mcpDir);
    await io.writeFileAtomic(this.config.versionFilePath, version);
    this.config.version = version;
  }

  /**
   * Create a backup of the current configuration
   */
  async createBackup(label?: string): Promise<string> {
    if (!this.config.backupDir) {
      throw new Error('Backup directory is not defined');
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = label ? `config-${label}-${timestamp}.json` : `config-${timestamp}.json`;
    const backupPath = path.join(this.config.backupDir, backupName);

    await io.ensureDir(this.config.backupDir);

    if (this.apiConfig) {
      await io.writeJsonFile(backupPath, this.apiConfig, { indent: 2 });
    } else {
      const config = await this.loadAPIConfig();
      if (config) {
        await io.writeJsonFile(backupPath, config, { indent: 2 });
      }
    }

    return backupPath;
  }

  /**
   * List available backup configurations
   */
  async listBackups(): Promise<string[]> {
    if (!this.config.backupDir) {
      return [];
    }
    try {
      const files = await io.listDirectory(this.config.backupDir, {
        pattern: /config-.*\.json$/
      });
      return files.sort().reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * Restore configuration from backup
   */
  async restoreFromBackup(backupFile: string): Promise<void> {
    if (!this.config.backupDir) {
      throw new Error('Backup directory is not defined');
    }
    const backupPath = path.join(this.config.backupDir, backupFile);

    if (!await io.fileExists(backupPath)) {
      throw new Error(`Backup file not found: ${backupFile}`);
    }

    const backupConfig = await io.readJsonFile<APIConfig>(backupPath);

    if (!backupConfig) {
      throw new Error('Invalid backup file');
    }

    // Create backup of current config before restoring
    await this.createBackup('before-restore');

    // Restore the backup
    await this.saveAPIConfig(backupConfig);
  }

  /**
   * Normalize API configuration with defaults
   */
  private normalizeAPIConfig(config: Partial<APIConfig>): APIConfig {
    return {
      ai_provider: config.ai_provider || 'claude',
      anthropic_api_key: config.anthropic_api_key || '',
      openai_api_key: config.openai_api_key || '',
      gemini_api_key: config.gemini_api_key || '',
      claude_model: config.claude_model || DEFAULT_MODELS.claude,
      openai_model: config.openai_model || DEFAULT_MODELS.openai,
      gemini_model: config.gemini_model || DEFAULT_MODELS.gemini,
      version: config.version || '1.0.0',
      created: config.created || new Date().toISOString()
    };
  }

  /**
   * Get environment variables for the current configuration
   */
  getEnvironmentVariables(): Record<string, string> {
    const env: Record<string, string> = {
      MCP_HOME: this.config.mcpDir
    };

    if (this.config.configPath) {
      env.MCP_CONFIG = this.config.configPath;
    }

    if (this.apiConfig) {
      if (this.apiConfig.anthropic_api_key) {
        env.ANTHROPIC_API_KEY = this.apiConfig.anthropic_api_key;
      }
      if (this.apiConfig.openai_api_key) {
        env.OPENAI_API_KEY = this.apiConfig.openai_api_key;
      }
      if (this.apiConfig.gemini_api_key) {
        env.GEMINI_API_KEY = this.apiConfig.gemini_api_key;
      }
    }

    return env;
  }

  /**
   * Reset configuration to defaults
   */
  async resetToDefaults(): Promise<void> {
    // Create backup before reset
    await this.createBackup('before-reset');

    // Create default configuration
    const defaultConfig: APIConfig = {
      ai_provider: 'claude',
      anthropic_api_key: '',
      openai_api_key: '',
      gemini_api_key: '',
      claude_model: DEFAULT_MODELS.claude,
      openai_model: DEFAULT_MODELS.openai,
      gemini_model: DEFAULT_MODELS.gemini,
      version: '1.0.0',
      created: new Date().toISOString()
    };

    await this.saveAPIConfig(defaultConfig);
  }
}

/**
 * Export a singleton instance for convenience
 */
export const configManager = new ConfigManager();

export default ConfigManager;