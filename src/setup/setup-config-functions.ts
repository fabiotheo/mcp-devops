// setup-config-functions.ts - Functional wrapper for ConfigManager
import { ConfigManager } from './setup-config-manager.js';
import type { SetupConfig, APIConfig } from './setup-types.js';

/**
 * Load API configuration
 */
export async function loadConfig(config: SetupConfig): Promise<APIConfig> {
  const manager = new ConfigManager(config);
  return manager.getOrCreateAPIConfig();
}

/**
 * Save API configuration
 */
export async function saveConfig(config: SetupConfig, apiConfig: APIConfig): Promise<void> {
  const manager = new ConfigManager(config);
  await manager.saveAPIConfig(apiConfig);
}
