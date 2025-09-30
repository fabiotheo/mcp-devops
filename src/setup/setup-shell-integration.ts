/**
 * Shell Integration for MCP Terminal Setup
 *
 * Manages shell integration for Bash and Zsh including:
 * - Shell detection and configuration
 * - Hook installation
 * - Environment variable setup
 * - Shell-specific customizations
 */

import * as path from 'path';
import * as io from './setup-io.js';
import * as system from './setup-system.js';
import { SetupConfig } from './setup-types.js';
import { SHELL_HOOKS } from './setup-config.js';

/**
 * Shell integration options
 */
export interface ShellIntegrationOptions {
  force?: boolean;
  skipBackup?: boolean;
  verbose?: boolean;
}

/**
 * Shell configuration result
 */
export interface ShellConfigResult {
  success: boolean;
  shellType: 'zsh' | 'bash' | 'sh';
  configFile: string;
  message?: string;
  needsReload?: boolean;
}

/**
 * ShellIntegration class handles shell-specific configurations
 */
export class ShellIntegration {
  private config: SetupConfig;

  constructor(config: SetupConfig) {
    this.config = config;
  }

  /**
   * Detect and configure the current shell
   */
  async detectAndConfigure(options: ShellIntegrationOptions = {}): Promise<ShellConfigResult> {
    const shellInfo = await system.detectShellInfo();

    console.log(`🐚 Detected shell: ${shellInfo.name} (${shellInfo.type})`);

    switch (shellInfo.type) {
      case 'zsh':
        return await this.configureZsh(options);
      case 'bash':
        return await this.configureBash(options);
      default:
        return {
          success: false,
          shellType: 'sh',
          configFile: '',
          message: `Unsupported shell: ${shellInfo.type}. Please configure manually.`
        };
    }
  }

  /**
   * Configure Zsh integration
   */
  async configureZsh(options: ShellIntegrationOptions = {}): Promise<ShellConfigResult> {
    const { force = false, skipBackup = false, verbose = false } = options;
    const zshrcPath = this.config.zshrcPath;

    console.log('⚙️ Configuring Zsh integration...');

    try {
      // Create backup if needed
      if (!skipBackup && await io.fileExists(zshrcPath)) {
        const backupPath = await io.createBackup(zshrcPath);
        if (verbose) {
          console.log(`  📦 Backup created: ${backupPath}`);
        }
      }

      // Check if already configured
      const isConfigured = await this.isShellConfigured(zshrcPath, SHELL_HOOKS.zsh.marker);

      if (isConfigured && !force) {
        console.log('  ✅ Zsh already configured');
        return {
          success: true,
          shellType: 'zsh',
          configFile: zshrcPath,
          needsReload: false
        };
      }

      // Add Zsh configuration
      await this.addZshConfig(zshrcPath);

      console.log('✅ Zsh configuration complete');

      return {
        success: true,
        shellType: 'zsh',
        configFile: zshrcPath,
        needsReload: true,
        message: 'Please run: source ~/.zshrc'
      };
    } catch (error) {
      console.error('❌ Failed to configure Zsh:', error);
      return {
        success: false,
        shellType: 'zsh',
        configFile: zshrcPath,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Configure Bash integration
   */
  async configureBash(options: ShellIntegrationOptions = {}): Promise<ShellConfigResult> {
    const { force = false, skipBackup = false, verbose = false } = options;
    const bashrcPath = this.config.bashrcPath;

    console.log('⚙️ Configuring Bash integration...');

    try {
      // Create backup if needed
      if (!skipBackup && await io.fileExists(bashrcPath)) {
        const backupPath = await io.createBackup(bashrcPath);
        if (verbose) {
          console.log(`  📦 Backup created: ${backupPath}`);
        }
      }

      // Check if already configured
      const isConfigured = await this.isShellConfigured(bashrcPath, SHELL_HOOKS.bash.marker);

      if (isConfigured && !force) {
        console.log('  ✅ Bash already configured');
        return {
          success: true,
          shellType: 'bash',
          configFile: bashrcPath,
          needsReload: false
        };
      }

      // Add Bash configuration
      await this.addBashConfig(bashrcPath);

      console.log('✅ Bash configuration complete');

      return {
        success: true,
        shellType: 'bash',
        configFile: bashrcPath,
        needsReload: true,
        message: 'Please run: source ~/.bashrc'
      };
    } catch (error) {
      console.error('❌ Failed to configure Bash:', error);
      return {
        success: false,
        shellType: 'bash',
        configFile: bashrcPath,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Add Zsh-specific configuration
   */
  private async addZshConfig(zshrcPath: string): Promise<void> {
    const zshConfig = `
# ${SHELL_HOOKS.zsh.marker}
# MCP Terminal Assistant - Zsh Integration
export MCP_HOME="${this.config.mcpDir}"
export MCP_CONFIG="${this.config.configPath}"

# Add MCP to PATH if not already there
if [[ ":$PATH:" != *":$MCP_HOME:"* ]]; then
    export PATH="$MCP_HOME:$PATH"
fi

# Command tracking for MCP
${SHELL_HOOKS.zsh.preexec}

${SHELL_HOOKS.zsh.precmd}

# Aliases
${SHELL_HOOKS.zsh.alias}

# Source local environment if exists
if [ -f "$MCP_HOME/.env.local" ]; then
    source "$MCP_HOME/.env.local"
fi

# Enable MCP debug mode if set
if [ ! -z "$MCP_DEBUG" ]; then
    echo "MCP Terminal Assistant loaded (debug mode)"
fi
# End MCP Terminal Assistant
`;

    // Check if file exists
    if (await io.fileExists(zshrcPath)) {
      // Append to existing file
      await io.appendFile(zshrcPath, zshConfig);
    } else {
      // Create new file
      await io.writeFile(zshrcPath, zshConfig);
    }
  }

  /**
   * Add Bash-specific configuration
   */
  private async addBashConfig(bashrcPath: string): Promise<void> {
    const bashConfig = `
# ${SHELL_HOOKS.bash.marker}
# MCP Terminal Assistant - Bash Integration
export MCP_HOME="${this.config.mcpDir}"
export MCP_CONFIG="${this.config.configPath}"

# Add MCP to PATH if not already there
if [[ ":$PATH:" != *":$MCP_HOME:"* ]]; then
    export PATH="$MCP_HOME:$PATH"
fi

# Command tracking for MCP
${SHELL_HOOKS.bash.trap}

${SHELL_HOOKS.bash.prompt}

# Aliases
${SHELL_HOOKS.bash.alias}

# Source local environment if exists
if [ -f "$MCP_HOME/.env.local" ]; then
    source "$MCP_HOME/.env.local"
fi

# Enable MCP debug mode if set
if [ ! -z "$MCP_DEBUG" ]; then
    echo "MCP Terminal Assistant loaded (debug mode)"
fi
# End MCP Terminal Assistant
`;

    // Check if file exists
    if (await io.fileExists(bashrcPath)) {
      // Append to existing file
      await io.appendFile(bashrcPath, bashConfig);
    } else {
      // Create new file
      await io.writeFile(bashrcPath, bashConfig);
    }
  }

  /**
   * Check if shell is already configured
   */
  private async isShellConfigured(rcFile: string, marker: string): Promise<boolean> {
    if (!await io.fileExists(rcFile)) {
      return false;
    }

    try {
      const content = await io.readFile(rcFile, 'utf8');
      return content.includes(marker);
    } catch {
      return false;
    }
  }

  /**
   * Remove shell integration
   */
  async removeIntegration(shellType?: 'zsh' | 'bash'): Promise<void> {
    // Detect shell if not specified
    if (!shellType) {
      const shellInfo = await system.detectShellInfo();
      shellType = shellInfo.type as 'zsh' | 'bash';
    }

    const rcFile = shellType === 'zsh' ? this.config.zshrcPath : this.config.bashrcPath;
    const marker = shellType === 'zsh' ? SHELL_HOOKS.zsh.marker : SHELL_HOOKS.bash.marker;

    console.log(`🗑️ Removing ${shellType} integration...`);

    if (!await io.fileExists(rcFile)) {
      console.log('  ℹ️ Config file not found, nothing to remove');
      return;
    }

    // Read file content
    const content = await io.readFile(rcFile, 'utf8');
    const lines = content.split('\n');

    // Find and remove MCP configuration block
    const startMarker = `# ${marker}`;
    const endMarker = '# End MCP Terminal Assistant';

    let inBlock = false;
    const filteredLines = lines.filter(line => {
      if (line.includes(startMarker)) {
        inBlock = true;
        return false;
      }
      if (line.includes(endMarker)) {
        inBlock = false;
        return false;
      }
      return !inBlock;
    });

    // Write back the filtered content
    await io.writeFile(rcFile, filteredLines.join('\n'));

    console.log(`✅ ${shellType} integration removed`);
  }

  /**
   * Verify shell integration is working
   */
  async verifyIntegration(): Promise<boolean> {
    console.log('🔍 Verifying shell integration...');

    try {
      // Check if MCP_HOME is set in current environment
      const mcpHome = process.env.MCP_HOME;

      if (mcpHome === this.config.mcpDir) {
        console.log('✅ Shell integration is active');
        return true;
      }

      // Check if configuration exists in shell files
      const shellInfo = await system.detectShellInfo();
      const rcFile = shellInfo.type === 'zsh' ? this.config.zshrcPath : this.config.bashrcPath;
      const marker = shellInfo.type === 'zsh' ? SHELL_HOOKS.zsh.marker : SHELL_HOOKS.bash.marker;

      const isConfigured = await this.isShellConfigured(rcFile, marker);

      if (isConfigured) {
        console.log('⚠️ Shell integration configured but not active in current session');
        console.log(`   Please run: source ${rcFile}`);
        return false;
      }

      console.log('❌ Shell integration not configured');
      return false;
    } catch (error) {
      console.error('❌ Error verifying integration:', error);
      return false;
    }
  }

  /**
   * Get shell reload command
   */
  getReloadCommand(): string {
    const shellInfo = system.detectShell();

    switch (shellInfo.type) {
      case 'zsh':
        return 'source ~/.zshrc';
      case 'bash':
        return 'source ~/.bashrc';
      default:
        return `source ${shellInfo.path}rc`;
    }
  }

  /**
   * Create shell aliases
   */
  async createAliases(): Promise<void> {
    const aliases = [
      'alias mcp="ipcom-chat"',
      'alias ask="node ~/.mcp-terminal/mcp-assistant.js"',
      'alias mcp-help="mcp --help"',
      'alias mcp-config="node ~/.mcp-terminal/setup.js --config"'
    ];

    const aliasFile = path.join(this.config.mcpDir, '.aliases');
    await io.writeFile(aliasFile, aliases.join('\n'));

    console.log('✅ Shell aliases created');
  }

  /**
   * Export environment variables for child processes
   */
  exportEnvironmentVariables(vars: Record<string, string>): void {
    Object.entries(vars).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }

  /**
   * Get integration status
   */
  async getStatus(): Promise<{
    configured: boolean;
    active: boolean;
    shellType: string;
    configFile: string;
    mcpHome?: string;
  }> {
    const shellInfo = await system.detectShellInfo();
    const rcFile = shellInfo.type === 'zsh' ? this.config.zshrcPath : this.config.bashrcPath;
    const marker = shellInfo.type === 'zsh' ? SHELL_HOOKS.zsh.marker : SHELL_HOOKS.bash.marker;

    const configured = await this.isShellConfigured(rcFile, marker);
    const active = process.env.MCP_HOME === this.config.mcpDir;

    return {
      configured,
      active,
      shellType: shellInfo.type,
      configFile: rcFile,
      mcpHome: process.env.MCP_HOME
    };
  }
}

export default ShellIntegration;