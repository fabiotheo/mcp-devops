/**
 * Setup Helper Functions
 *
 * Utility functions for the setup system including version comparison,
 * formatting, and other non-I/O utilities.
 */

import { VERSION_REGEX } from './setup-config.js';
import { SetupError, SetupErrorType } from './setup-types.js';

// Re-export commonly used I/O functions from setup-io for backward compatibility
export {
  expandPath,
  fileExists,
  dirExists,
  ensureDir,
  readJsonFile,
  writeJsonFile,
  copyFile,
  copyDirectory,
  createBackup,
  removeDirectory,
  setExecutable,
  createSymlink
} from './setup-io.js'


/**
 * Compare semantic versions
 * Returns: -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const match1 = v1.match(VERSION_REGEX);
  const match2 = v2.match(VERSION_REGEX);

  if (!match1 || !match2) {
    throw new SetupError(
      `Invalid version format: ${!match1 ? v1 : v2}`,
      SetupErrorType.INVALID_CONFIG
    );
  }

  const parts1 = [
    parseInt(match1[1], 10),
    parseInt(match1[2], 10),
    parseInt(match1[3], 10)
  ];
  const parts2 = [
    parseInt(match2[1], 10),
    parseInt(match2[2], 10),
    parseInt(match2[3], 10)
  ];

  for (let i = 0; i < 3; i++) {
    if (parts1[i] < parts2[i]) return -1;
    if (parts1[i] > parts2[i]) return 1;
  }

  // Compare pre-release tags if present
  const pre1 = match1[4] || '';
  const pre2 = match2[4] || '';

  if (pre1 && !pre2) return -1; // v1 is pre-release, v2 is not
  if (!pre1 && pre2) return 1;  // v2 is pre-release, v1 is not
  if (pre1 && pre2) return pre1.localeCompare(pre2);

  return 0;
}

/**
 * Check if Node.js version meets minimum requirement
 */
export function checkNodeVersion(minVersion: string): boolean {
  const currentVersion = process.version.slice(1); // Remove 'v' prefix
  return compareVersions(currentVersion, minVersion) >= 0;
}

/**
 * Get package version from package.json
 */
export async function getPackageVersion(packagePath?: string): Promise<string> {
  const { readJsonFile } = await import('./setup-io.js');
  const path = await import('path');

  const jsonPath = packagePath || path.join(process.cwd(), 'package.json');
  const packageJson = await readJsonFile<{ version: string }>(jsonPath);

  if (!packageJson?.version) {
    throw new SetupError(
      'Could not read version from package.json',
      SetupErrorType.FILE_NOT_FOUND
    );
  }

  return packageJson.version;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Package manager detection is now in setup-system.ts
// Re-exported at the top of this file for backward compatibility

/**
 * Adjust imports for installation structure
 * Removes src/ prefix from imports when files are copied to installation directory
 */
export function adjustImportsForInstallation(content: string, filename: string): string {
  // Skip adjustment for certain files
  const skipFiles = ['configure-ai.ts', 'mcp-configure'];
  if (skipFiles.some(f => filename.includes(f))) {
    return content;
  }

  // Unified import adjustment for all file types
  const importPatterns = [
    // ES6 imports and exports
    [/from ['"]\.\/src\//g, "from './"],
    [/from ['"]\.\.\/src\//g, "from '../"],
    [/import ['"]\.\/src\//g, "import './"],
    [/import\(['"]\.\/src\//g, "import('./"],

    // CommonJS requires (for legacy files)
    [/require\(['"]\.\/src\//g, "require('./"],

    // AI orchestrator path normalization
    [/\.\/ai_orchestrator/g, './ai_orchestrator'],
    [/\.\.\/ai_orchestrator/g, '../ai_orchestrator']
  ] as const;

  // Apply all patterns
  for (const [pattern, replacement] of importPatterns) {
    content = content.replace(pattern, replacement as string);
  }

  return content;
}

// Command exists check is now in setup-system.ts
// Re-exported at the top of this file for backward compatibility

/**
 * Create a progress bar string
 */
export function createProgressBar(current: number, total: number, width: number = 20): string {
  const percentage = Math.min(100, Math.max(0, (current / total) * 100));
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;

  return `[${'█'.repeat(filled)}${' '.repeat(empty)}] ${percentage.toFixed(1)}%`;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries reached');
}