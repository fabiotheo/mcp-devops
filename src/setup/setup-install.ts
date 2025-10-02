// setup-install.ts - Functional wrapper for SetupInstaller
import { SetupInstaller } from './setup-installer.js';
import type { SetupConfig, SetupOptions } from './setup-types.js';

/**
 * Create necessary directories
 */
export async function createDirectories(config: SetupConfig): Promise<void> {
  const installer = new SetupInstaller(config);
  await installer.createDirectories();
}

/**
 * Install all files
 */
export async function installFiles(config: SetupConfig, options: SetupOptions = {}): Promise<void> {
  const installer = new SetupInstaller(config);
  await installer.installFiles({
    force: options.force,
    skipPatterns: false,
    skipLibs: false
  });
}
