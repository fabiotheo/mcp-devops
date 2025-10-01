// setup-shell.ts - Functional wrapper for ShellIntegration
import { ShellIntegration } from './setup-shell-integration.js';
import type { SetupConfig } from './setup-types.js';

/**
 * Configure shell integration
 */
export async function configureShell(config: SetupConfig): Promise<void> {
  const integration = new ShellIntegration(config);
  await integration.detectAndConfigure();
}
