/**
 * Setup Types and Interfaces
 *
 * Core type definitions for the MCP Terminal Assistant setup system.
 * These types provide type safety for configuration, installation options,
 * and file mapping operations.
 */

/**
 * Represents a file mapping from source to destination
 * Used for copying files during installation
 */
export interface FileMapping {
  /** Source file path relative to project root */
  src: string;
  /** Destination file path relative to installation directory */
  dest: string;
}

/**
 * Main setup configuration containing all paths and system information
 */
export interface SetupConfig {
  /** MCP installation directory (usually ~/.mcp-terminal) */
  mcpDir: string;
  /** Path to config.json file */
  configPath: string;
  /** Path to user's .zshrc file */
  zshrcPath: string;
  /** Path to user's .bashrc file */
  bashrcPath: string;
  /** Path to version tracking file */
  versionFilePath: string;
  /** User's home directory */
  homeDir: string;
  /** Backup directory path */
  backupDir: string;
  /** Logs directory path */
  logsDir: string;
  /** Whether running as root/admin */
  isRoot: boolean;
  /** Detected shell (e.g., /bin/bash, /bin/zsh) */
  currentShell: string;
  /** Current version from package.json */
  version: string;
}

/**
 * API configuration for AI providers
 */
export interface APIConfig {
  /** Selected AI provider */
  ai_provider: 'claude' | 'openai' | 'gemini';
  /** Anthropic API key for Claude */
  anthropic_api_key?: string;
  /** OpenAI API key */
  openai_api_key?: string;
  /** Google API key for Gemini */
  gemini_api_key?: string;
  /** Selected Claude model */
  claude_model?: string;
  /** Selected OpenAI model */
  openai_model?: string;
  /** Selected Gemini model */
  gemini_model?: string;
  /** Additional configuration options */
  [key: string]: unknown;
}

/**
 * Installation options passed via command line arguments
 */
export interface InstallOptions {
  /** Run automatic installation with defaults */
  auto?: boolean;
  /** Upgrade existing installation */
  upgrade?: boolean;
  /** Force reinstallation even if already installed */
  force?: boolean;
  /** Skip test execution after installation */
  skipTests?: boolean;
  /** Uninstall the system */
  uninstall?: boolean;
}

/**
 * Shell integration configuration
 */
export interface ShellIntegration {
  /** Type of shell */
  type: 'zsh' | 'bash' | 'sh';
  /** Path to shell configuration file */
  configPath: string;
  /** Integration script content */
  integrationScript: string;
}

/**
 * Version information for migration
 */
export interface VersionInfo {
  /** Current installed version */
  current: string | null;
  /** Target version to install */
  target: string;
  /** Whether migration is needed */
  needsMigration: boolean;
}

/**
 * Migration step definition
 */
export interface MigrationStep {
  /** Description of what this migration does */
  description: string;
  /** Function to apply the migration */
  apply: (config: SetupConfig) => Promise<void>;
  /** Version this migration targets */
  fromVersion: string;
  /** Version this migration upgrades to */
  toVersion: string;
}

/**
 * Test result information
 */
export interface TestResult {
  /** Name of the test */
  name: string;
  /** Whether the test passed */
  passed: boolean;
  /** Error message if test failed */
  error?: string;
  /** Time taken to run test in ms */
  duration?: number;
}

/**
 * Platform detection result
 */
export interface PlatformInfo {
  /** Operating system platform */
  platform: 'darwin' | 'linux' | 'win32';
  /** OS version/release */
  release: string;
  /** System architecture */
  arch: string;
  /** Whether platform is supported */
  isSupported: boolean;
}

/**
 * Shell information
 */
export interface ShellInfo {
  /** Full path to shell executable */
  path: string;
  /** Shell name (e.g., bash, zsh) */
  name: string;
  /** Shell type for configuration */
  type: 'zsh' | 'bash' | 'sh';
  /** Shell version */
  version: string;
}

/**
 * Package manager types
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn';

/**
 * Dependency information
 */
export interface DependencyInfo {
  /** Package name */
  name: string;
  /** Required version */
  requiredVersion?: string;
  /** Installed version */
  installedVersion?: string;
  /** Whether dependency is satisfied */
  isInstalled: boolean;
  /** Whether dependency is required */
  isRequired: boolean;
}

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (progress: {
  /** Current step number */
  current: number;
  /** Total number of steps */
  total: number;
  /** Description of current step */
  message: string;
  /** Percentage complete (0-100) */
  percentage: number;
}) => void;

/**
 * Error types that can occur during setup
 */
export enum SetupErrorType {
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  INVALID_CONFIG = 'INVALID_CONFIG',
  NETWORK_ERROR = 'NETWORK_ERROR',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  MIGRATION_ERROR = 'MIGRATION_ERROR',
  TEST_FAILURE = 'TEST_FAILURE',
  TIMEOUT = 'TIMEOUT',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Custom error class for setup operations
 */
export class SetupError extends Error {
  constructor(
    message: string,
    public type: SetupErrorType = SetupErrorType.UNKNOWN,
    public details?: any
  ) {
    super(message);
    this.name = 'SetupError';
  }
}

/**
 * Installation result
 */
export interface InstallResult {
  /** Whether installation was successful */
  success: boolean;
  /** Version that was installed */
  version?: string;
  /** Any warnings during installation */
  warnings?: string[];
  /** Any errors during installation */
  errors?: SetupError[];
  /** Time taken for installation */
  duration?: number;
  /** Files that were installed */
  installedFiles?: string[];
}