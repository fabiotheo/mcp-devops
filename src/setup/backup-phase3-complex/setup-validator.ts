/**
 * Setup Validator for MCP Terminal
 *
 * Handles all validation and testing operations including:
 * - System requirements checking
 * - Installation verification
 * - Post-install tests
 * - Configuration validation
 */

import * as path from 'path';
import * as io from './setup-io.js';
import * as system from './setup-system.js';
import { SetupConfig, APIConfig } from './setup-types.js';
import { MIN_NODE_VERSION, SUPPORTED_PLATFORMS } from './setup-config.js';

/**
 * Test result interface
 */
export interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
  error?: Error;
  duration?: number;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

/**
 * System requirements result
 */
export interface RequirementsResult {
  met: boolean;
  platform: {
    current: string;
    supported: boolean;
  };
  nodeVersion: {
    current: string;
    minimum: string;
    valid: boolean;
  };
  commands: {
    git: boolean;
    npm: boolean;
    node: boolean;
  };
  permissions: {
    canWrite: boolean;
    isRoot: boolean;
  };
  storage: {
    available: number;
    required: number;
    sufficient: boolean;
  };
}

/**
 * SetupValidator class handles all validation operations
 */
export class SetupValidator {
  private config: SetupConfig;

  constructor(config: SetupConfig) {
    this.config = config;
  }

  /**
   * Check all system requirements
   */
  async checkSystemRequirements(): Promise<RequirementsResult> {
    console.log('🔍 Checking system requirements...');

    const platform = await this.checkPlatform();
    const nodeVersion = await this.checkNodeVersion();
    const commands = await this.checkRequiredCommands();
    const permissions = await this.checkPermissions();
    const storage = await this.checkStorage();

    const met =
      platform.supported &&
      nodeVersion.valid &&
      commands.git &&
      commands.npm &&
      commands.node &&
      permissions.canWrite &&
      storage.sufficient;

    const result: RequirementsResult = {
      met,
      platform,
      nodeVersion,
      commands,
      permissions,
      storage
    };

    this.printRequirementsReport(result);

    return result;
  }

  /**
   * Check platform compatibility
   */
  private async checkPlatform(): Promise<{ current: string; supported: boolean }> {
    const platform = system.detectPlatform();
    const supported = platform.platform === 'darwin' || platform.platform === 'linux';

    return {
      current: platform.platform,
      supported
    };
  }

  /**
   * Check Node.js version
   */
  private async checkNodeVersion(): Promise<{
    current: string;
    minimum: string;
    valid: boolean;
  }> {
    const currentVersion = process.version.substring(1); // Remove 'v' prefix
    const valid = system.checkNodeVersion(MIN_NODE_VERSION);

    return {
      current: currentVersion,
      minimum: MIN_NODE_VERSION,
      valid
    };
  }

  /**
   * Check required commands
   */
  private async checkRequiredCommands(): Promise<{
    git: boolean;
    npm: boolean;
    node: boolean;
  }> {
    const [git, npm, node] = await Promise.all([
      system.commandExists('git'),
      system.commandExists('npm'),
      system.commandExists('node')
    ]);

    return { git, npm, node };
  }

  /**
   * Check permissions
   */
  private async checkPermissions(): Promise<{
    canWrite: boolean;
    isRoot: boolean;
  }> {
    // Ensure directory exists before checking
    await io.ensureDir(this.config.mcpDir);

    const canWrite = await io.isWritable(this.config.mcpDir);
    const isRoot = system.isRoot();

    return { canWrite, isRoot };
  }

  /**
   * Check available storage
   */
  private async checkStorage(): Promise<{
    available: number;
    required: number;
    sufficient: boolean;
  }> {
    // Required space: 100MB
    const required = 100 * 1024 * 1024;

    // Get available space (simplified - actual implementation would be more complex)
    const stats = await system.executeCommandAsync('df -k . | tail -1');
    const parts = stats.stdout.trim().split(/\s+/);
    const available = parseInt(parts[3]) * 1024; // Convert from KB to bytes

    return {
      available,
      required,
      sufficient: available >= required
    };
  }

  /**
   * Print requirements report
   */
  private printRequirementsReport(result: RequirementsResult): void {
    console.log('\n📋 System Requirements Report:');
    console.log('================================');

    // Platform
    console.log(`Platform: ${result.platform.current} ${result.platform.supported ? '✅' : '❌'}`);

    // Node version
    console.log(`Node.js: ${result.nodeVersion.current} (minimum: ${result.nodeVersion.minimum}) ${result.nodeVersion.valid ? '✅' : '❌'}`);

    // Commands
    console.log('Required commands:');
    console.log(`  - git: ${result.commands.git ? '✅' : '❌'}`);
    console.log(`  - npm: ${result.commands.npm ? '✅' : '❌'}`);
    console.log(`  - node: ${result.commands.node ? '✅' : '❌'}`);

    // Permissions
    console.log('Permissions:');
    console.log(`  - Write access: ${result.permissions.canWrite ? '✅' : '❌'}`);
    console.log(`  - Running as root: ${result.permissions.isRoot ? '⚠️' : '✅'}`);

    // Storage
    const availableMB = Math.floor(result.storage.available / (1024 * 1024));
    const requiredMB = Math.floor(result.storage.required / (1024 * 1024));
    console.log(`Storage: ${availableMB}MB available (${requiredMB}MB required) ${result.storage.sufficient ? '✅' : '❌'}`);

    console.log('================================\n');
  }

  /**
   * Run post-installation tests
   */
  async runPostInstallTests(): Promise<TestResult[]> {
    console.log('🧪 Running post-installation tests...');

    const tests: TestResult[] = [];

    // Test 1: Check essential files
    tests.push(await this.testEssentialFiles());

    // Test 2: Check configuration
    tests.push(await this.testConfiguration());

    // Test 3: Test CLI commands
    tests.push(await this.testCLICommands());

    // Test 4: Test AI orchestrator
    tests.push(await this.testAIOrchestrator());

    // Test 5: Test pattern matching
    tests.push(await this.testPatternMatching());

    // Print results
    this.printTestResults(tests);

    return tests;
  }

  /**
   * Test essential files existence
   */
  private async testEssentialFiles(): Promise<TestResult> {
    const startTime = Date.now();
    const essentialFiles = [
      'mcp-client.js',
      'mcp-assistant.js',
      'ai_orchestrator.js',
      'setup.js'
    ];

    const missing: string[] = [];

    for (const file of essentialFiles) {
      const filePath = path.join(this.config.mcpDir, file);
      if (!await io.fileExists(filePath)) {
        missing.push(file);
      }
    }

    return {
      name: 'Essential Files',
      passed: missing.length === 0,
      message: missing.length > 0 ? `Missing files: ${missing.join(', ')}` : 'All essential files present',
      duration: Date.now() - startTime
    };
  }

  /**
   * Test configuration validity
   */
  private async testConfiguration(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const configPath = this.config.configPath;

      if (!await io.fileExists(configPath)) {
        return {
          name: 'Configuration',
          passed: false,
          message: 'Configuration file not found',
          duration: Date.now() - startTime
        };
      }

      const config = await io.readJsonFile<APIConfig>(configPath);

      if (!config) {
        return {
          name: 'Configuration',
          passed: false,
          message: 'Invalid configuration format',
          duration: Date.now() - startTime
        };
      }

      // Validate required fields
      const hasProvider = config.ai_provider !== undefined;
      const hasValidProvider = ['claude', 'openai', 'gemini'].includes(config.ai_provider);

      return {
        name: 'Configuration',
        passed: hasProvider && hasValidProvider,
        message: hasProvider && hasValidProvider ? 'Configuration valid' : 'Invalid AI provider configuration',
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Configuration',
        passed: false,
        message: `Error reading configuration: ${error}`,
        error: error as Error,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Test CLI commands
   */
  private async testCLICommands(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Test mcp-assistant.js
      const assistantPath = path.join(this.config.mcpDir, 'mcp-assistant.js');
      const result = await system.executeCommandAsync(
        `node "${assistantPath}" --version`,
        { timeout: 5000 }
      );

      return {
        name: 'CLI Commands',
        passed: result.exitCode === 0,
        message: result.exitCode === 0 ? 'CLI commands working' : `CLI test failed: ${result.stderr}`,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'CLI Commands',
        passed: false,
        message: `CLI test error: ${error}`,
        error: error as Error,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Test AI orchestrator
   */
  private async testAIOrchestrator(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const orchestratorPath = path.join(this.config.mcpDir, 'ai_orchestrator.js');

      if (!await io.fileExists(orchestratorPath)) {
        return {
          name: 'AI Orchestrator',
          passed: false,
          message: 'AI orchestrator file not found',
          duration: Date.now() - startTime
        };
      }

      // Try to load the module
      const result = await system.executeCommandAsync(
        `node -e "require('${orchestratorPath}')"`,
        { timeout: 5000 }
      );

      return {
        name: 'AI Orchestrator',
        passed: result.exitCode === 0,
        message: result.exitCode === 0 ? 'AI orchestrator loads correctly' : `Load failed: ${result.stderr}`,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'AI Orchestrator',
        passed: false,
        message: `AI orchestrator test error: ${error}`,
        error: error as Error,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Test pattern matching
   */
  private async testPatternMatching(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const patternsDir = path.join(this.config.mcpDir, 'patterns');

      if (!await io.dirExists(patternsDir)) {
        return {
          name: 'Pattern Matching',
          passed: false,
          message: 'Patterns directory not found',
          duration: Date.now() - startTime
        };
      }

      // Check for pattern files
      const patternFiles = await io.listDirectory(patternsDir, {
        pattern: /\.json$/
      });

      return {
        name: 'Pattern Matching',
        passed: patternFiles.length > 0,
        message: patternFiles.length > 0
          ? `Found ${patternFiles.length} pattern files`
          : 'No pattern files found',
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Pattern Matching',
        passed: false,
        message: `Pattern test error: ${error}`,
        error: error as Error,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Print test results
   */
  private printTestResults(tests: TestResult[]): void {
    console.log('\n📊 Test Results:');
    console.log('================================');

    const passed = tests.filter(t => t.passed).length;
    const failed = tests.filter(t => !t.passed).length;

    tests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      const duration = test.duration ? ` (${test.duration}ms)` : '';
      console.log(`${status} ${test.name}${duration}`);
      if (!test.passed && test.message) {
        console.log(`   ↳ ${test.message}`);
      }
    });

    console.log('================================');
    console.log(`Summary: ${passed} passed, ${failed} failed`);
    console.log('================================\n');
  }

  /**
   * Validate API configuration
   */
  async validateAPIConfiguration(config: APIConfig): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    // Check AI provider
    if (!config.ai_provider) {
      errors.push('AI provider not specified');
    } else if (!['claude', 'openai', 'gemini'].includes(config.ai_provider)) {
      errors.push(`Invalid AI provider: ${config.ai_provider}`);
    }

    // Check API keys based on provider
    switch (config.ai_provider) {
      case 'claude':
        if (!config.anthropic_api_key) {
          errors.push('Anthropic API key required for Claude provider');
        }
        break;
      case 'openai':
        if (!config.openai_api_key) {
          errors.push('OpenAI API key required for OpenAI provider');
        }
        break;
      case 'gemini':
        if (!config.gemini_api_key) {
          errors.push('Gemini API key required for Gemini provider');
        }
        break;
    }

    // Check for unused API keys
    if (config.ai_provider !== 'claude' && config.anthropic_api_key) {
      warnings.push('Anthropic API key configured but not in use');
    }
    if (config.ai_provider !== 'openai' && config.openai_api_key) {
      warnings.push('OpenAI API key configured but not in use');
    }
    if (config.ai_provider !== 'gemini' && config.gemini_api_key) {
      warnings.push('Gemini API key configured but not in use');
    }

    // Info messages
    if (config.claude_model) {
      info.push(`Claude model: ${config.claude_model}`);
    }
    if (config.openai_model) {
      info.push(`OpenAI model: ${config.openai_model}`);
    }
    if (config.gemini_model) {
      info.push(`Gemini model: ${config.gemini_model}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info
    };
  }

  /**
   * Generate validation report
   */
  async generateReport(outputPath?: string): Promise<string> {
    const report: string[] = [];

    report.push('MCP Terminal Setup Validation Report');
    report.push('=====================================');
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push('');

    // System requirements
    const requirements = await this.checkSystemRequirements();
    report.push('System Requirements:');
    report.push(`  Platform: ${requirements.platform.current} (${requirements.platform.supported ? 'Supported' : 'Not Supported'})`);
    report.push(`  Node.js: ${requirements.nodeVersion.current} (Minimum: ${requirements.nodeVersion.minimum})`);
    report.push(`  Git: ${requirements.commands.git ? 'Available' : 'Missing'}`);
    report.push(`  NPM: ${requirements.commands.npm ? 'Available' : 'Missing'}`);
    report.push('');

    // Installation verification
    const installer = await import('./setup-installer.js');
    const inst = new installer.SetupInstaller(this.config);
    const verification = await inst.verifyInstallation();
    report.push('Installation Status:');
    report.push(`  Valid: ${verification.valid ? 'Yes' : 'No'}`);
    if (!verification.valid) {
      report.push(`  Missing: ${verification.missing.join(', ')}`);
    }
    report.push('');

    // Configuration validation
    const configManager = await import('./setup-config-manager.js');
    const cm = new configManager.ConfigManager();
    const apiConfig = await cm.loadAPIConfig();
    if (apiConfig) {
      const validation = await this.validateAPIConfiguration(apiConfig);
      report.push('Configuration:');
      report.push(`  Valid: ${validation.valid ? 'Yes' : 'No'}`);
      if (validation.errors.length > 0) {
        report.push('  Errors:');
        validation.errors.forEach(e => report.push(`    - ${e}`));
      }
      if (validation.warnings.length > 0) {
        report.push('  Warnings:');
        validation.warnings.forEach(w => report.push(`    - ${w}`));
      }
    }
    report.push('');

    // Test results
    const tests = await this.runPostInstallTests();
    report.push('Test Results:');
    tests.forEach(test => {
      report.push(`  ${test.passed ? '✓' : '✗'} ${test.name}`);
      if (!test.passed && test.message) {
        report.push(`    ${test.message}`);
      }
    });

    const reportText = report.join('\n');

    // Save report if output path provided
    if (outputPath) {
      await io.writeFile(outputPath, reportText);
      console.log(`📄 Report saved to: ${outputPath}`);
    }

    return reportText;
  }
}

export default SetupValidator;