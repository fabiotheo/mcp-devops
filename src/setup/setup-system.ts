/**
 * System Operations Module
 *
 * Centralized module for all system-related operations including:
 * - Platform detection and information
 * - Shell detection and configuration
 * - Command execution and validation
 * - Package manager detection
 * - Environment and PATH management
 * - Permission checks
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execSync, exec, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { promisify } from 'util';
import { SetupError, SetupErrorType, PlatformInfo, ShellInfo, PackageManager } from './setup-types.js';
import { compareVersions } from './setup-helpers.js';

const execAsync = promisify(exec);

/**
 * Extended platform information
 */
export interface SystemInfo extends PlatformInfo {
  hostname: string;
  username: string;
  homeDir: string;
  tempDir: string;
  shell: ShellInfo;
  nodeVersion: string;
  npmVersion: string | null;
  isWSL: boolean;
  isDocker: boolean;
}

/**
 * Command execution options
 */
export interface CommandOptions {
  timeout?: number;
  cwd?: string;
  silent?: boolean;
  shell?: string | boolean;
  env?: NodeJS.ProcessEnv;
}

/**
 * Command execution result
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
}

/**
 * Shell configuration paths
 */
export interface ShellConfig {
  rcFile: string;
  profileFile?: string;
  configDir: string;
  historyFile: string;
}

// ============================================
// Platform Detection
// ============================================

/**
 * Get comprehensive system information
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  const platform = detectPlatform();
  const shell = await detectShellInfo();

  return {
    ...platform,
    hostname: os.hostname(),
    username: os.userInfo().username,
    homeDir: os.homedir(),
    tempDir: os.tmpdir(),
    shell,
    nodeVersion: process.version,
    npmVersion: await getNpmVersion(),
    isWSL: await isWSL(),
    isDocker: await isDocker()
  };
}

/**
 * Detect platform information
 */
export function detectPlatform(): PlatformInfo {
  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  const release = os.release();
  const arch = os.arch();
  const isSupported = platform === 'darwin' || platform === 'linux';

  return {
    platform,
    release,
    arch,
    isSupported
  };
}

/**
 * Check if running in Windows Subsystem for Linux
 */
export async function isWSL(): Promise<boolean> {
  if (process.platform !== 'linux') return false;

  try {
    const procVersion = await fs.readFile('/proc/version', 'utf8');
    return procVersion.toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

/**
 * Check if running inside Docker container
 */
export async function isDocker(): Promise<boolean> {
  try {
    await fs.access('/.dockerenv');
    return true;
  } catch {
    try {
      const cgroup = await fs.readFile('/proc/1/cgroup', 'utf8');
      return cgroup.includes('docker') || cgroup.includes('containerd');
    } catch {
      return false;
    }
  }
}

/**
 * Check if running as root/administrator
 */
export function isRoot(): boolean {
  if (process.platform === 'win32') {
    // Windows: Check if running as administrator
    try {
      execSync('net session', { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  // Unix-like: Check UID
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

// ============================================
// Shell Detection and Configuration
// ============================================

/**
 * Detect detailed shell information
 */
export async function detectShellInfo(): Promise<ShellInfo> {
  const shellPath = process.env.SHELL || '/bin/bash';
  const shellName = path.basename(shellPath);
  const shellType = getShellType(shellPath);

  // Try to get shell version
  let version = 'unknown';
  try {
    if (shellType === 'zsh') {
      version = execSync('zsh --version', { encoding: 'utf8', timeout: 5000 }).trim().split(' ')[1];
    } else if (shellType === 'bash') {
      const output = execSync('bash --version', { encoding: 'utf8', timeout: 5000 });
      const match = output.match(/version ([0-9.]+)/);
      version = match ? match[1] : 'unknown';
    }
  } catch {
    // Ignore version detection errors
  }

  return {
    path: shellPath,
    name: shellName,
    type: shellType,
    version
  };
}

/**
 * Get shell type from path
 */
export function getShellType(shellPath: string): 'zsh' | 'bash' | 'sh' {
  const basename = path.basename(shellPath);
  if (basename.includes('zsh')) return 'zsh';
  if (basename.includes('bash')) return 'bash';
  return 'sh';
}

/**
 * Get shell configuration file paths
 */
export function getShellConfigPaths(shellType?: 'zsh' | 'bash' | 'sh'): ShellConfig {
  const homeDir = os.homedir();
  const detectedShell = shellType || getShellType(process.env.SHELL || '/bin/bash');

  switch (detectedShell) {
    case 'zsh':
      return {
        rcFile: path.join(homeDir, '.zshrc'),
        profileFile: path.join(homeDir, '.zprofile'),
        configDir: path.join(homeDir, '.config', 'zsh'),
        historyFile: path.join(homeDir, '.zsh_history')
      };

    case 'bash':
      return {
        rcFile: path.join(homeDir, '.bashrc'),
        profileFile: path.join(homeDir, '.bash_profile'),
        configDir: path.join(homeDir, '.config', 'bash'),
        historyFile: path.join(homeDir, '.bash_history')
      };

    default:
      return {
        rcFile: path.join(homeDir, '.profile'),
        configDir: path.join(homeDir, '.config'),
        historyFile: path.join(homeDir, '.sh_history')
      };
  }
}

/**
 * Add line to shell configuration file with atomic write
 */
export async function addToShellConfig(line: string, shellType?: 'zsh' | 'bash' | 'sh'): Promise<boolean> {
  const config = getShellConfigPaths(shellType);
  const tempFile = `${config.rcFile}.tmp-${process.pid}-${Date.now()}`;

  try {
    // Read existing content
    let content = '';
    try {
      content = await fs.readFile(config.rcFile, 'utf8');
    } catch {
      // File doesn't exist yet, that's ok
    }

    // Check if line already exists
    if (content.includes(line)) {
      return false; // Already exists
    }

    // Prepare new content
    const toAppend = content.endsWith('\n') || content === ''
      ? `${line}\n`
      : `\n${line}\n`;
    const newContent = content + toAppend;

    // Atomic write: write to temp file then rename
    await fs.writeFile(tempFile, newContent, 'utf8');

    // Preserve original file permissions if it exists
    try {
      const stats = await fs.stat(config.rcFile);
      await fs.chmod(tempFile, stats.mode);
    } catch {
      // Original file doesn't exist, use default permissions
      await fs.chmod(tempFile, 0o644);
    }

    // Atomic rename (this is atomic on POSIX systems)
    await fs.rename(tempFile, config.rcFile);

    return true;
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }

    throw new SetupError(
      `Failed to update shell config: ${(error as Error).message}`,
      SetupErrorType.PERMISSION_DENIED
    );
  }
}

// ============================================
// Command Execution
// ============================================

/**
 * Execute command synchronously with enhanced error handling
 */
export function executeCommand(command: string, options: CommandOptions = {}): CommandResult {
  const {
    timeout = 30000,
    cwd = process.cwd(),
    silent = false,
    shell,
    env = process.env
  } = options;

  try {
    // Build exec options properly typed
    const execOptions: ExecSyncOptionsWithStringEncoding = {
      encoding: 'utf8',
      timeout,
      cwd,
      stdio: silent ? 'pipe' : 'inherit',
      env
    };

    // Only set shell if it's a string (path to shell)
    // execSync always uses a shell by default, so we only need to specify if custom
    if (typeof shell === 'string') {
      execOptions.shell = shell;
    }

    const stdout = execSync(command, execOptions);

    return {
      stdout: stdout?.toString() || '',
      stderr: '',
      exitCode: 0
    };
  } catch (error: any) {
    if (error.signal === 'SIGTERM') {
      throw new SetupError(
        `Command timed out after ${timeout}ms: ${command}`,
        SetupErrorType.TIMEOUT
      );
    }

    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message,
      exitCode: error.status || 1,
      signal: error.signal
    };
  }
}

/**
 * Execute command asynchronously
 */
export async function executeCommandAsync(
  command: string,
  options: CommandOptions = {}
): Promise<CommandResult> {
  const {
    timeout = 30000,
    cwd = process.cwd(),
    env = process.env
  } = options;

  try {
    const { stdout, stderr } = await execAsync(command, {
      encoding: 'utf8',
      timeout,
      cwd,
      env
    });

    return {
      stdout: stdout || '',
      stderr: stderr || '',
      exitCode: 0
    };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      exitCode: error.code || 1,
      signal: error.signal
    };
  }
}

/**
 * Check if a command exists in PATH (secure version)
 */
export async function commandExists(command: string): Promise<boolean> {
  // Sanitize input to prevent command injection
  if (!command || !/^[a-zA-Z0-9._-]+$/.test(command)) {
    return false;
  }

  try {
    if (process.platform === 'win32') {
      // Windows: Use 'where' command
      const result = executeCommand(`where ${command}`, { silent: true, timeout: 5000 });
      return result.exitCode === 0;
    } else {
      // Unix-like: Use 'command -v' (more portable than 'which')
      const result = executeCommand(`command -v ${command}`, { silent: true, timeout: 5000 });
      return result.exitCode === 0;
    }
  } catch {
    return false;
  }
}

// ============================================
// Package Manager Detection
// ============================================

/**
 * Detect which package manager is available
 */
export async function detectPackageManager(): Promise<PackageManager> {
  // Check for pnpm first (preferred)
  if (await commandExists('pnpm')) {
    return 'pnpm';
  }

  // Then yarn
  if (await commandExists('yarn')) {
    return 'yarn';
  }

  // Default to npm (always available with Node.js)
  return 'npm';
}

/**
 * Get package manager version
 */
export async function getPackageManagerVersion(pm: PackageManager): Promise<string | null> {
  try {
    const result = executeCommand(`${pm} --version`, { silent: true, timeout: 5000 });
    return result.exitCode === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Get npm version (internal helper)
 */
async function getNpmVersion(): Promise<string | null> {
  return getPackageManagerVersion('npm');
}

/**
 * Install packages using the detected package manager
 */
export async function installPackages(
  packages: string[],
  options: { dev?: boolean; global?: boolean } = {}
): Promise<CommandResult> {
  const pm = await detectPackageManager();
  const { dev = false, global = false } = options;

  let command = pm;

  // Build the install command based on package manager
  switch (pm) {
    case 'pnpm':
      command += ' add';
      if (dev) command += ' -D';
      if (global) command += ' -g';
      break;

    case 'yarn':
      command += ' add';
      if (dev) command += ' --dev';
      if (global) command += ' global add';
      break;

    default: // npm
      command += ' install';
      if (dev) command += ' --save-dev';
      if (global) command += ' -g';
  }

  command += ' ' + packages.join(' ');

  return executeCommandAsync(command);
}

// ============================================
// Environment and PATH Management
// ============================================

/**
 * Get current PATH as array
 */
export function getPathArray(): string[] {
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  return (process.env.PATH || '').split(pathSeparator).filter(Boolean);
}

/**
 * Check if a directory is in PATH
 */
export function isInPath(directory: string): boolean {
  const paths = getPathArray();
  const normalizedDir = path.resolve(directory);

  return paths.some(p => path.resolve(p) === normalizedDir);
}

/**
 * Add directory to PATH in current process
 */
export function addToPath(directory: string): void {
  if (!isInPath(directory)) {
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    process.env.PATH = `${directory}${pathSeparator}${process.env.PATH}`;
  }
}

/**
 * Get environment variable with fallback
 */
export function getEnvVar(name: string, fallback?: string): string | undefined {
  return process.env[name] || fallback;
}

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.TRAVIS ||
    process.env.JENKINS_URL
  );
}

// ============================================
// System Requirements Checking
// ============================================

/**
 * Check if Node.js version meets requirement
 */
export function checkNodeVersion(minVersion: string): boolean {
  const currentVersion = process.version.slice(1); // Remove 'v' prefix
  return compareVersions(currentVersion, minVersion) >= 0;
}

/**
 * Check system requirements
 */
export async function checkSystemRequirements(): Promise<{
  passed: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check Node.js version
  if (!checkNodeVersion('18.0.0')) {
    issues.push(`Node.js version 18.0.0 or higher required (current: ${process.version})`);
  }

  // Check supported platform
  const platform = detectPlatform();
  if (!platform.isSupported) {
    issues.push(`Platform ${platform.platform} is not fully supported`);
  }

  // Check if git is available
  if (!(await commandExists('git'))) {
    issues.push('Git is not installed or not in PATH');
  }

  // Check if running as root (warning only)
  if (isRoot()) {
    issues.push('Warning: Running as root/administrator is not recommended');
  }

  return {
    passed: issues.length === 0,
    issues
  };
}

// ============================================
// File System Helpers
// ============================================

/**
 * Get user's config directory
 */
export function getUserConfigDir(): string {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }

  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

/**
 * Get user's data directory
 */
export function getUserDataDir(): string {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }

  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
}

/**
 * Get user's cache directory
 */
export function getUserCacheDir(): string {
  if (process.platform === 'win32') {
    return process.env.TEMP || path.join(os.homedir(), 'AppData', 'Local', 'Temp');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches');
  }

  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
}

/**
 * Get user home directory (alias for compatibility)
 */
export function getUserHome(): string {
  return os.homedir();
}

/**
 * Get user home directory
 */
export function getHomeDir(): string {
  return os.homedir();
}

/**
 * Detect current shell (simplified version for compatibility)
 */
export function detectShell(): { type: 'zsh' | 'bash' | 'sh'; path: string } {
  const shellPath = process.env.SHELL || '/bin/bash';
  const type = getShellType(shellPath);
  return { type, path: shellPath };
}

// ============================================
// Export all functions for convenience
// ============================================

export default {
  // Platform
  getSystemInfo,
  detectPlatform,
  isWSL,
  isDocker,
  isRoot,
  isCI,

  // Shell
  detectShellInfo,
  getShellType,
  getShellConfigPaths,
  addToShellConfig,

  // Commands
  executeCommand,
  executeCommandAsync,
  commandExists,

  // Package Management
  detectPackageManager,
  getPackageManagerVersion,
  installPackages,

  // Environment
  getPathArray,
  isInPath,
  addToPath,
  getEnvVar,

  // System Requirements
  checkNodeVersion,
  checkSystemRequirements,

  // File System
  getUserConfigDir,
  getUserDataDir,
  getUserCacheDir
};