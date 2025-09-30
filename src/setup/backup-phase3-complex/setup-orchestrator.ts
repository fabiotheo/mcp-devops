/**
 * Setup Orchestrator for MCP Terminal
 *
 * Main orchestration class that coordinates all setup operations.
 * This class brings together all the modular components to provide
 * a unified setup interface.
 */

import * as path from 'path';
import * as readline from 'readline';
import ConfigManager from './setup-config-manager.js';
import { SetupInstaller } from './setup-installer.js';
import { ShellIntegration } from './setup-shell-integration.js';
import { SetupValidator } from './setup-validator.js';
import * as io from './setup-io.js';
import * as system from './setup-system.js';
import * as helpers from './setup-helpers.js';
import {
  SetupConfig,
  APIConfig,
  InstallResult,
  ProgressCallback,
  SetupError,
  SetupErrorType
} from './setup-types.js';

/**
 * Setup command options
 */
export interface SetupOptions {
  auto?: boolean;
  upgrade?: boolean;
  force?: boolean;
  skipTests?: boolean;
  uninstall?: boolean;
  verbose?: boolean;
  configOnly?: boolean;
  repair?: boolean;
  validate?: boolean;
  shellOnly?: boolean;
  migrationOnly?: boolean;
}

/**
 * SetupOrchestrator class - Main coordinator for all setup operations
 */
export class SetupOrchestrator {
  private configManager: ConfigManager;
  private installer: SetupInstaller | null = null;
  private shellIntegration: ShellIntegration | null = null;
  private validator: SetupValidator | null = null;
  private config: SetupConfig;
  private rl: readline.Interface | null = null;

  constructor() {
    this.configManager = new ConfigManager();
    this.config = this.configManager.getConfig();
  }

  /**
   * Main entry point for setup
   */
  async run(options: SetupOptions = {}): Promise<InstallResult> {
    const startTime = Date.now();
    const result: InstallResult = {
      success: false,
      warnings: [],
      errors: []
    };

    try {
      // Handle special modes first
      if (options.validate) {
        return await this.runValidation();
      }

      if (options.uninstall) {
        return await this.runUninstall();
      }

      if (options.repair) {
        return await this.runRepair();
      }

      if (options.configOnly) {
        return await this.runConfigOnly();
      }

      if (options.shellOnly) {
        return await this.runShellOnly();
      }

      if (options.migrationOnly) {
        return await this.runMigrationOnly();
      }

      // Standard installation/upgrade flow
      console.log('🚀 MCP Terminal Assistant Setup');
      console.log('================================\n');

      // Check if this is an upgrade
      const installedVersion = await this.configManager.getInstalledVersion();
      const isUpgrade = installedVersion !== null || options.upgrade;

      if (isUpgrade) {
        console.log(`📦 Current version: ${installedVersion || 'unknown'}`);
        console.log(`📦 Target version: ${this.config.version}\n`);
      }

      // Initialize components
      this.installer = new SetupInstaller(this.config);
      this.shellIntegration = new ShellIntegration(this.config);
      this.validator = new SetupValidator(this.config);

      // Step 1: Check system requirements
      const requirements = await this.validator.checkSystemRequirements();
      if (!requirements.met) {
        throw new SetupError(
          'System requirements not met',
          SetupErrorType.DEPENDENCY_ERROR,
          requirements
        );
      }

      // Step 2: Migration check for upgrades
      if (isUpgrade) {
        await this.handleMigration(installedVersion);
      }

      // Step 3: Configuration
      let apiConfig: APIConfig;
      if (options.auto) {
        apiConfig = await this.configManager.getOrCreateAPIConfig();
        console.log('📋 Using default configuration (auto mode)');
      } else {
        apiConfig = await this.interactiveConfiguration();
      }

      // Validate API configuration
      const configValidation = await this.validator.validateAPIConfiguration(apiConfig);
      if (!configValidation.valid) {
        if (options.auto) {
          result.warnings?.push(...configValidation.errors);
        } else {
          throw new SetupError(
            'Invalid configuration',
            SetupErrorType.INVALID_CONFIG,
            configValidation
          );
        }
      }

      // Save configuration
      await this.configManager.saveAPIConfig(apiConfig);
      console.log('✅ Configuration saved');

      // Step 4: Create directories
      await this.installer.createDirectories();

      // Step 5: Install files
      console.log('\n📦 Installing files...');
      await this.installer.installFiles({
        verbose: options.verbose,
        force: options.force,
        onProgress: (progress) => {
          if (options.verbose) {
            console.log(`  [${progress.current}/${progress.total}] ${progress.file}`);
          }
        }
      });

      // Step 6: Install patterns and libraries
      await this.installer.installPatterns();
      await this.installer.installLibraries();
      await this.installer.installComponents();

      // Step 7: Shell integration
      if (!options.skipTests) {
        const shellResult = await this.shellIntegration.detectAndConfigure({
          force: options.force,
          verbose: options.verbose
        });

        if (shellResult.success) {
          console.log('✅ Shell integration configured');
          if (shellResult.needsReload) {
            result.warnings?.push(shellResult.message || 'Please reload your shell');
          }
        } else {
          result.warnings?.push('Shell integration failed: ' + shellResult.message);
        }
      }

      // Step 8: Create symlinks
      await this.installer.createSymlinks();

      // Step 9: Verify installation
      const verification = await this.installer.verifyInstallation();
      if (!verification.valid) {
        result.warnings?.push(`Missing files: ${verification.missing.join(', ')}`);
      }

      // Step 10: Run tests if not skipped
      if (!options.skipTests) {
        console.log('\n🧪 Running post-installation tests...');
        const tests = await this.validator.runPostInstallTests();
        const failedTests = tests.filter(t => !t.passed);

        if (failedTests.length > 0) {
          result.warnings?.push(`${failedTests.length} tests failed`);
          failedTests.forEach(test => {
            if (test.message) {
              result.warnings?.push(`  - ${test.name}: ${test.message}`);
            }
          });
        }
      }

      // Step 11: Save version
      await this.configManager.saveVersion(this.config.version);

      // Success!
      result.success = true;
      result.version = this.config.version;
      result.duration = Date.now() - startTime;

      // Print final message
      this.printSuccessMessage(isUpgrade, result);

      return result;

    } catch (error) {
      console.error('\n❌ Setup failed:', error);

      if (error instanceof SetupError) {
        result.errors?.push(error);
      } else {
        result.errors?.push(new SetupError(
          error instanceof Error ? error.message : 'Unknown error',
          SetupErrorType.UNKNOWN,
          error
        ));
      }

      result.duration = Date.now() - startTime;
      return result;

    } finally {
      if (this.rl) {
        this.rl.close();
      }
    }
  }

  /**
   * Run validation only
   */
  private async runValidation(): Promise<InstallResult> {
    console.log('🔍 Running validation...\n');

    this.validator = new SetupValidator(this.config);

    // Generate and print report
    const report = await this.validator.generateReport();
    console.log(report);

    return {
      success: true,
      warnings: []
    };
  }

  /**
   * Run uninstallation
   */
  private async runUninstall(): Promise<InstallResult> {
    console.log('🗑️ Uninstalling MCP Terminal Assistant...\n');

    // Confirm uninstallation
    const confirmed = await this.confirmAction(
      'Are you sure you want to uninstall MCP Terminal Assistant?'
    );

    if (!confirmed) {
      console.log('Uninstallation cancelled');
      return { success: false };
    }

    // Remove shell integration
    if (this.shellIntegration) {
      await this.shellIntegration.removeIntegration();
    }

    // Remove symlinks
    const commands = ['mcp', 'ask', 'mcp-setup'];
    for (const cmd of commands) {
      const locations = [
        `/usr/local/bin/${cmd}`,
        `${this.config.homeDir}/.local/bin/${cmd}`
      ];

      for (const location of locations) {
        if (await io.fileExists(location)) {
          await io.deleteFile(location);
        }
      }
    }

    // Remove installation directory
    if (await io.dirExists(this.config.mcpDir)) {
      await io.deleteDirectory(this.config.mcpDir);
    }

    console.log('✅ MCP Terminal Assistant uninstalled successfully');

    return { success: true };
  }

  /**
   * Run repair operation
   */
  private async runRepair(): Promise<InstallResult> {
    console.log('🔧 Repairing MCP Terminal Assistant installation...\n');

    this.installer = new SetupInstaller(this.config);
    this.validator = new SetupValidator(this.config);

    // Check what's missing or broken
    const verification = await this.installer.verifyInstallation();

    if (verification.valid) {
      console.log('✅ Installation appears to be intact');

      // Run tests to check functionality
      const tests = await this.validator.runPostInstallTests();
      const failedTests = tests.filter(t => !t.passed);

      if (failedTests.length === 0) {
        console.log('✅ All tests passed - no repair needed');
        return { success: true };
      }

      console.log(`⚠️ ${failedTests.length} tests failed - attempting repair`);
    } else {
      console.log(`⚠️ Missing files: ${verification.missing.join(', ')}`);
    }

    // Reinstall missing files
    await this.installer.installFiles({ force: true });
    await this.installer.installPatterns();
    await this.installer.installLibraries();
    await this.installer.installComponents();

    // Verify repair
    const postRepair = await this.installer.verifyInstallation();

    if (postRepair.valid) {
      console.log('✅ Repair completed successfully');
      return { success: true };
    } else {
      console.log('❌ Repair failed - some files still missing');
      return {
        success: false,
        errors: [new SetupError(
          'Repair failed',
          SetupErrorType.UNKNOWN,
          { missing: postRepair.missing }
        )]
      };
    }
  }

  /**
   * Configure API keys only
   */
  private async runConfigOnly(): Promise<InstallResult> {
    console.log('⚙️ Configuring API keys...\n');

    const apiConfig = await this.interactiveConfiguration();
    await this.configManager.saveAPIConfig(apiConfig);

    console.log('✅ Configuration saved');

    return { success: true };
  }

  /**
   * Configure shell integration only
   */
  private async runShellOnly(): Promise<InstallResult> {
    console.log('🐚 Configuring shell integration...\n');

    this.shellIntegration = new ShellIntegration(this.config);

    const result = await this.shellIntegration.detectAndConfigure({
      force: true,
      verbose: true
    });

    if (result.success) {
      console.log('✅ Shell integration configured');
      if (result.needsReload) {
        console.log(`\n${result.message}`);
      }
      return { success: true };
    } else {
      return {
        success: false,
        errors: [new SetupError(
          result.message || 'Shell integration failed',
          SetupErrorType.UNKNOWN
        )]
      };
    }
  }

  /**
   * Run migration only
   */
  private async runMigrationOnly(): Promise<InstallResult> {
    console.log('🔄 Running migration...\n');

    const success = await this.configManager.migrateOldConfig();

    if (success) {
      console.log('✅ Migration completed successfully');
      return { success: true };
    } else {
      console.log('ℹ️ No old configuration found to migrate');
      return { success: true };
    }
  }

  /**
   * Handle migration for upgrades
   */
  private async handleMigration(currentVersion: string | null): Promise<void> {
    // Check for old config migration
    const migrated = await this.configManager.migrateOldConfig();
    if (migrated) {
      console.log('✅ Migrated old configuration format');
    }

    // Version-specific migrations could be added here
    // For now, we just backup the current config
    if (currentVersion) {
      const backupPath = await this.configManager.createBackup('pre-upgrade');
      console.log(`📦 Configuration backed up to: ${backupPath}`);
    }
  }

  /**
   * Interactive configuration
   */
  private async interactiveConfiguration(): Promise<APIConfig> {
    console.log('\n⚙️ Configuration Setup');
    console.log('====================\n');

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Get existing config or create default
    const existingConfig = await this.configManager.getOrCreateAPIConfig();

    // Ask for AI provider
    const provider = await this.askQuestion(
      `Select AI provider [claude/openai/gemini] (${existingConfig.ai_provider}): `,
      existingConfig.ai_provider
    ) as 'claude' | 'openai' | 'gemini';

    // Ask for appropriate API key
    let apiKey = '';
    switch (provider) {
      case 'claude':
        apiKey = await this.askQuestion(
          'Enter Anthropic API key: ',
          existingConfig.anthropic_api_key,
          true
        );
        existingConfig.anthropic_api_key = apiKey;
        break;

      case 'openai':
        apiKey = await this.askQuestion(
          'Enter OpenAI API key: ',
          existingConfig.openai_api_key,
          true
        );
        existingConfig.openai_api_key = apiKey;
        break;

      case 'gemini':
        apiKey = await this.askQuestion(
          'Enter Gemini API key: ',
          existingConfig.gemini_api_key,
          true
        );
        existingConfig.gemini_api_key = apiKey;
        break;
    }

    existingConfig.ai_provider = provider;

    return existingConfig;
  }

  /**
   * Ask a question and get user input
   */
  private askQuestion(prompt: string, defaultValue?: string, hidden?: boolean): Promise<string> {
    return new Promise((resolve) => {
      if (!this.rl) {
        resolve(defaultValue || '');
        return;
      }

      if (hidden && process.stdout.isTTY) {
        // Hide input for passwords/API keys
        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;

        stdin.setRawMode?.(true);
        process.stdout.write(prompt);

        let input = '';
        stdin.on('data', (char) => {
          const str = char.toString();

          if (str === '\r' || str === '\n') {
            stdin.setRawMode?.(wasRaw);
            stdin.removeAllListeners('data');
            process.stdout.write('\n');
            resolve(input || defaultValue || '');
          } else if (str === '\u0003') { // Ctrl+C
            process.exit();
          } else if (str === '\u007f') { // Backspace
            if (input.length > 0) {
              input = input.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else {
            input += str;
            process.stdout.write('*');
          }
        });
      } else {
        this.rl.question(prompt, (answer) => {
          resolve(answer || defaultValue || '');
        });
      }
    });
  }

  /**
   * Confirm an action
   */
  private async confirmAction(message: string): Promise<boolean> {
    const answer = await this.askQuestion(`${message} (y/N): `);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  /**
   * Print success message
   */
  private printSuccessMessage(isUpgrade: boolean, result: InstallResult): void {
    console.log('\n' + '='.repeat(50));
    console.log('✨ ' + (isUpgrade ? 'Upgrade' : 'Installation') + ' completed successfully!');
    console.log('='.repeat(50));

    if (result.warnings && result.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      result.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    console.log('\n📚 Quick Start:');
    console.log('  1. Reload your shell: source ~/.zshrc (or ~/.bashrc)');
    console.log('  2. Test the assistant: mcp "how do I list files?"');
    console.log('  3. Get help: mcp --help');
    console.log('\n🔗 Documentation: https://github.com/your-repo/mcp-terminal');

    if (result.duration) {
      const seconds = Math.round(result.duration / 1000);
      console.log(`\n⏱️ Time taken: ${seconds} seconds`);
    }
  }

  /**
   * Parse command line arguments
   */
  static parseArguments(argv: string[]): SetupOptions {
    const options: SetupOptions = {};

    for (let i = 2; i < argv.length; i++) {
      const arg = argv[i];

      switch (arg) {
        case '--auto':
        case '-a':
          options.auto = true;
          break;

        case '--upgrade':
        case '-u':
          options.upgrade = true;
          break;

        case '--force':
        case '-f':
          options.force = true;
          break;

        case '--skip-tests':
          options.skipTests = true;
          break;

        case '--uninstall':
          options.uninstall = true;
          break;

        case '--verbose':
        case '-v':
          options.verbose = true;
          break;

        case '--config':
          options.configOnly = true;
          break;

        case '--repair':
          options.repair = true;
          break;

        case '--validate':
          options.validate = true;
          break;

        case '--shell':
          options.shellOnly = true;
          break;

        case '--migrate':
          options.migrationOnly = true;
          break;

        case '--help':
        case '-h':
          SetupOrchestrator.printHelp();
          process.exit(0);
          break;

        default:
          console.error(`Unknown option: ${arg}`);
          SetupOrchestrator.printHelp();
          process.exit(1);
      }
    }

    return options;
  }

  /**
   * Print help message
   */
  static printHelp(): void {
    console.log(`
MCP Terminal Assistant Setup

Usage: node setup.js [options]

Options:
  --auto, -a        Run automatic installation with defaults
  --upgrade, -u     Upgrade existing installation
  --force, -f       Force reinstallation of files
  --skip-tests      Skip post-installation tests
  --uninstall       Remove MCP Terminal Assistant
  --verbose, -v     Show detailed output
  --config          Configure API keys only
  --repair          Repair broken installation
  --validate        Validate existing installation
  --shell           Configure shell integration only
  --migrate         Run configuration migration only
  --help, -h        Show this help message

Examples:
  node setup.js                  # Interactive installation
  node setup.js --auto           # Automatic installation
  node setup.js --upgrade        # Upgrade existing installation
  node setup.js --config         # Reconfigure API keys
  node setup.js --repair         # Fix broken installation
    `);
  }
}

export default SetupOrchestrator;