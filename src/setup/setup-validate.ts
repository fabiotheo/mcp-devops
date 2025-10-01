// setup-validate.ts - Installation validation
import { SetupInstaller } from './setup-installer.js';
import { ShellIntegration } from './setup-shell-integration.js';
import type { SetupConfig } from './setup-types.js';

/**
 * Validate installation
 */
export async function validateInstallation(config: SetupConfig): Promise<boolean> {
  try {
    const installer = new SetupInstaller(config);
    const shellIntegration = new ShellIntegration(config);

    // Verify installation
    const installVerified = await installer.verifyInstallation();

    // Verify shell integration
    const shellVerified = await shellIntegration.verifyIntegration();

    return installVerified && shellVerified;
  } catch (error) {
    console.error('Validation error:', error);
    return false;
  }
}
