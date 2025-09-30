/**
 * IO Operations Module
 *
 * Centralized module for all file system and I/O operations.
 * Provides a unified interface for file/directory operations with:
 * - Cross-platform compatibility
 * - Atomic operations for critical files
 * - Stream support for large files
 * - Comprehensive error handling
 * - Security validations
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { SetupError, SetupErrorType } from './setup-types.js';

// ============================================
// Type Definitions and Constants
// ============================================

/**
 * Valid Node.js buffer encodings
 */
const VALID_ENCODINGS = [
  'utf8', 'utf16le', 'latin1', 'base64', 'hex',
  'ascii', 'binary', 'ucs2'
] as const;

type ValidEncoding = typeof VALID_ENCODINGS[number];

/**
 * Validate if encoding is supported
 */
function validateEncoding(encoding: BufferEncoding): encoding is ValidEncoding {
  return VALID_ENCODINGS.includes(encoding as any);
}

// ============================================
// Path Utilities
// ============================================

/**
 * Expand tilde (~) in paths to home directory
 */
export function expandPath(filepath: string): string {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

/**
 * Normalize and resolve a path safely
 */
export function normalizePath(filepath: string): string {
  const expanded = expandPath(filepath);
  return path.resolve(expanded);
}

/**
 * Validate path to prevent directory traversal attacks
 */
export function isPathSafe(filepath: string, baseDir?: string): boolean {
  const normalizedBase = baseDir ? normalizePath(baseDir) : process.cwd();

  // Resolve the filepath relative to the base directory
  const resolvedPath = path.resolve(normalizedBase, filepath);

  // Check if the resolved path is within the base directory
  const relative = path.relative(normalizedBase, resolvedPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Get file extension (lowercase, without dot)
 */
export function getFileExtension(filepath: string): string {
  const basename = path.basename(filepath);

  // Handle hidden files that start with a dot
  if (basename.startsWith('.') && !basename.includes('.', 1)) {
    // If it's just a hidden file without an extension (e.g., '.hidden')
    // return the part after the dot as the extension
    return basename.slice(1).toLowerCase();
  }

  const ext = path.extname(filepath);
  return ext.startsWith('.') ? ext.slice(1).toLowerCase() : ext.toLowerCase();
}

// ============================================
// File Existence and Stats
// ============================================

/**
 * Check if a file exists
 */
export async function fileExists(filepath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(expandPath(filepath));
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
export async function dirExists(dirpath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(expandPath(dirpath));
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path exists (file or directory)
 */
export async function pathExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(expandPath(filepath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file/directory stats
 */
export async function getStats(filepath: string): Promise<fsSync.Stats | null> {
  try {
    return await fs.stat(expandPath(filepath));
  } catch {
    return null;
  }
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filepath: string): Promise<number> {
  const stats = await getStats(filepath);
  return stats?.size ?? 0;
}

/**
 * Check if file is writable
 */
export async function isWritable(filepath: string): Promise<boolean> {
  try {
    await fs.access(expandPath(filepath), fsSync.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if file is readable
 */
export async function isReadable(filepath: string): Promise<boolean> {
  try {
    await fs.access(expandPath(filepath), fsSync.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Directory Operations
// ============================================

/**
 * Create directory recursively if it doesn't exist
 */
export async function ensureDir(dirpath: string): Promise<void> {
  const fullPath = expandPath(dirpath);
  await fs.mkdir(fullPath, { recursive: true });
}

/**
 * Remove directory recursively
 */
export async function removeDirectory(dirpath: string): Promise<void> {
  const fullPath = expandPath(dirpath);
  try {
    await fs.rm(fullPath, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors if directory doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Delete directory (alias for removeDirectory)
 */
export async function deleteDirectory(dirpath: string): Promise<void> {
  return removeDirectory(dirpath);
}

/**
 * List directory contents
 */
export async function listDirectory(dirpath: string, options?: {
  recursive?: boolean;
  filesOnly?: boolean;
  dirsOnly?: boolean;
  pattern?: RegExp;
}): Promise<string[]> {
  const fullPath = expandPath(dirpath);
  const { recursive = false, filesOnly = false, dirsOnly = false, pattern } = options || {};

  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const relativePath = path.relative(fullPath, entryPath);

      if (entry.isDirectory()) {
        if (!filesOnly) {
          if (!pattern || pattern.test(relativePath)) {
            results.push(relativePath);
          }
        }
        if (recursive) {
          await walk(entryPath);
        }
      } else if (entry.isFile() && !dirsOnly) {
        if (!pattern || pattern.test(relativePath)) {
          results.push(relativePath);
        }
      }
    }
  }

  await walk(fullPath);
  return results.sort();
}

/**
 * Copy directory recursively
 */
export async function copyDirectory(src: string, dest: string, options?: {
  overwrite?: boolean;
  filter?: (src: string) => boolean;
}): Promise<void> {
  const srcPath = expandPath(src);
  const destPath = expandPath(dest);
  const { overwrite = true, filter } = options || {};

  await ensureDir(destPath);
  const entries = await fs.readdir(srcPath, { withFileTypes: true });

  for (const entry of entries) {
    const srcEntry = path.join(srcPath, entry.name);
    const destEntry = path.join(destPath, entry.name);

    if (filter && !filter(srcEntry)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirectory(srcEntry, destEntry, options);
    } else {
      if (!overwrite && await fileExists(destEntry)) {
        continue;
      }
      await fs.copyFile(srcEntry, destEntry);
    }
  }
}

/**
 * Create backup of a directory with timestamp
 */
export async function createBackup(dirpath: string, backupDir?: string): Promise<string> {
  const fullPath = expandPath(dirpath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `${path.basename(fullPath)}.backup-${timestamp}`;
  const backupPath = backupDir
    ? path.join(expandPath(backupDir), backupName)
    : `${fullPath}.backup-${timestamp}`;

  if (await dirExists(fullPath)) {
    await copyDirectory(fullPath, backupPath);
  } else if (await fileExists(fullPath)) {
    await fs.copyFile(fullPath, backupPath);
  }

  return backupPath;
}

// ============================================
// File Operations
// ============================================

/**
 * Read file as text
 */
export async function readFile(filepath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
  const fullPath = expandPath(filepath);

  // Validate encoding
  if (!validateEncoding(encoding)) {
    throw new SetupError(
      `Invalid encoding: ${encoding}. Valid encodings are: ${VALID_ENCODINGS.join(', ')}`,
      SetupErrorType.INVALID_CONFIG
    );
  }

  return await fs.readFile(fullPath, encoding);
}

/**
 * Write text to file
 */
export async function writeFile(
  filepath: string,
  content: string,
  options?: { encoding?: BufferEncoding; mode?: number }
): Promise<void> {
  const fullPath = expandPath(filepath);
  const { encoding = 'utf8', mode } = options || {};

  // Validate encoding
  if (!validateEncoding(encoding)) {
    throw new SetupError(
      `Invalid encoding: ${encoding}. Valid encodings are: ${VALID_ENCODINGS.join(', ')}`,
      SetupErrorType.INVALID_CONFIG
    );
  }

  // Ensure directory exists
  const dir = path.dirname(fullPath);
  await ensureDir(dir);

  await fs.writeFile(fullPath, content, { encoding, mode });
}

/**
 * Append text to file
 */
export async function appendFile(
  filepath: string,
  content: string,
  encoding: BufferEncoding = 'utf8'
): Promise<void> {
  const fullPath = expandPath(filepath);

  // Validate encoding
  if (!validateEncoding(encoding)) {
    throw new SetupError(
      `Invalid encoding: ${encoding}. Valid encodings are: ${VALID_ENCODINGS.join(', ')}`,
      SetupErrorType.INVALID_CONFIG
    );
  }

  // Ensure directory exists before appending
  const dir = path.dirname(fullPath);
  await ensureDir(dir);

  await fs.appendFile(fullPath, content, encoding);
}

/**
 * Copy file with optional content transformation
 */
export async function copyFile(
  src: string,
  dest: string,
  transform?: (content: string) => string | Promise<string>
): Promise<void> {
  const srcPath = expandPath(src);
  const destPath = expandPath(dest);

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  await ensureDir(destDir);

  if (transform) {
    // Read, transform, and write
    const content = await readFile(srcPath);
    const transformed = await transform(content);
    await writeFile(destPath, transformed);
  } else {
    // Simple copy
    await fs.copyFile(srcPath, destPath);
  }
}

/**
 * Move/rename file or directory
 * Handles cross-device moves by falling back to copy-and-delete
 */
export async function move(src: string, dest: string): Promise<void> {
  const srcPath = expandPath(src);
  const destPath = expandPath(dest);

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  await ensureDir(destDir);

  try {
    // Try atomic rename first (fastest)
    await fs.rename(srcPath, destPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    // Handle cross-device move
    if (nodeError.code === 'EXDEV') {
      // Cross-device move: fall back to copy-and-delete
      const stats = await fs.stat(srcPath);

      if (stats.isDirectory()) {
        await copyDirectory(srcPath, destPath);
        await removeDirectory(srcPath);
      } else {
        await fs.copyFile(srcPath, destPath);
        await fs.unlink(srcPath);
      }
    } else {
      // Re-throw other errors
      throw error;
    }
  }
}

/**
 * Delete file
 */
export async function deleteFile(filepath: string): Promise<void> {
  const fullPath = expandPath(filepath);
  try {
    await fs.unlink(fullPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

// ============================================
// Atomic Operations
// ============================================

/**
 * Write file atomically (write to temp file then rename)
 * Prevents corruption from partial writes or concurrent access
 */
export async function writeFileAtomic(
  filepath: string,
  content: string | Buffer,
  options?: { encoding?: BufferEncoding; mode?: number }
): Promise<void> {
  const fullPath = expandPath(filepath);
  const { encoding = 'utf8', mode } = options || {};

  // Validate encoding for string content
  if (typeof content === 'string' && !validateEncoding(encoding)) {
    throw new SetupError(
      `Invalid encoding: ${encoding}. Valid encodings are: ${VALID_ENCODINGS.join(', ')}`,
      SetupErrorType.INVALID_CONFIG
    );
  }

  // Generate unique temp file name in system temp directory
  const tempDir = os.tmpdir();
  const tempFile = path.join(
    tempDir,
    `atomic-${path.basename(fullPath)}-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  );

  try {
    // Write to temp file
    await fs.writeFile(tempFile, content, { encoding, mode });

    // Preserve original file permissions if it exists
    try {
      const stats = await fs.stat(fullPath);
      await fs.chmod(tempFile, stats.mode);
    } catch {
      // Original file doesn't exist, use default or specified mode
      if (mode) {
        await fs.chmod(tempFile, mode);
      }
    }

    // Ensure destination directory exists
    const destDir = path.dirname(fullPath);
    await ensureDir(destDir);

    // Atomic rename (this is atomic on POSIX systems)
    await fs.rename(tempFile, fullPath);
  } catch (error) {
    // Clean up temp file if operation failed
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Update file content atomically with a transformer function
 */
export async function updateFileAtomic(
  filepath: string,
  transformer: (content: string) => string | Promise<string>,
  encoding: BufferEncoding = 'utf8'
): Promise<void> {
  const fullPath = expandPath(filepath);

  // Read existing content
  let content = '';
  try {
    content = await readFile(fullPath, encoding);
  } catch {
    // File doesn't exist yet
  }

  // Transform content
  const newContent = await transformer(content);

  // Write atomically
  await writeFileAtomic(fullPath, newContent, { encoding });
}

// ============================================
// JSON Operations
// ============================================

/**
 * Read JSON file safely
 */
export async function readJsonFile<T = any>(filepath: string): Promise<T | null> {
  try {
    const content = await readFile(filepath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new SetupError(
      `Failed to read JSON file ${filepath}: ${(error as Error).message}`,
      SetupErrorType.INVALID_CONFIG
    );
  }
}

/**
 * Write JSON file with pretty formatting
 */
export async function writeJsonFile(
  filepath: string,
  data: any,
  options?: { indent?: number; atomic?: boolean }
): Promise<void> {
  const { indent = 2, atomic = false } = options || {};
  const content = JSON.stringify(data, null, indent);

  if (atomic) {
    await writeFileAtomic(filepath, content);
  } else {
    await writeFile(filepath, content);
  }
}

/**
 * Update JSON file atomically
 */
export async function updateJsonFile<T = any>(
  filepath: string,
  updater: (data: T | null) => T | Promise<T>,
  options?: { indent?: number }
): Promise<void> {
  const { indent = 2 } = options || {};

  const currentData = await readJsonFile<T>(filepath);
  const newData = await updater(currentData);

  await writeJsonFile(filepath, newData, { indent, atomic: true });
}

// ============================================
// Stream Operations
// ============================================

/**
 * Copy large file using streams with retry logic
 * @param src - Source file path
 * @param dest - Destination file path
 * @param options - Options for retry behavior
 */
export async function copyFileStream(
  src: string,
  dest: string,
  options?: { maxRetries?: number; retryDelay?: number }
): Promise<void> {
  const srcPath = expandPath(src);
  const destPath = expandPath(dest);
  const { maxRetries = 3, retryDelay = 1000 } = options || {};

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  await ensureDir(destDir);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const readStream = createReadStream(srcPath);
      const writeStream = createWriteStream(destPath);

      await pipeline(readStream, writeStream);
      return; // Success, exit function
    } catch (error) {
      lastError = error as Error;

      // Don't retry on certain errors
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT' || nodeError.code === 'EACCES') {
        throw error; // File not found or permission denied, don't retry
      }

      // If not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }

  // All retries failed
  throw new SetupError(
    `Failed to copy file after ${maxRetries} attempts: ${lastError?.message}`,
    SetupErrorType.UNKNOWN
  );
}

/**
 * Process large file line by line
 */
export async function* readLines(
  filepath: string,
  encoding: BufferEncoding = 'utf8'
): AsyncGenerator<string> {
  const fullPath = expandPath(filepath);
  const fileHandle = await fs.open(fullPath, 'r');

  try {
    const stream = fileHandle.createReadStream({ encoding });
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        yield line;
      }
    }

    if (buffer) {
      yield buffer;
    }
  } finally {
    await fileHandle.close();
  }
}

/**
 * Count lines in a file efficiently
 */
export async function countLines(filepath: string): Promise<number> {
  let count = 0;
  for await (const _line of readLines(filepath)) {
    count++;
  }
  return count;
}

// ============================================
// Permission Operations
// ============================================

/**
 * Set file permissions
 */
export async function setPermissions(filepath: string, mode: number): Promise<void> {
  const fullPath = expandPath(filepath);
  await fs.chmod(fullPath, mode);
}

/**
 * Set file as executable (755)
 */
export async function setExecutable(filepath: string): Promise<void> {
  const fullPath = expandPath(filepath);
  try {
    await fs.chmod(fullPath, 0o755);
  } catch (error) {
    // Ignore on Windows where chmod doesn't work the same way
    if (process.platform !== 'win32') {
      throw error;
    }
  }
}

/**
 * Get file permissions
 */
export async function getPermissions(filepath: string): Promise<number> {
  const stats = await getStats(filepath);
  return stats ? stats.mode & 0o777 : 0;
}

// ============================================
// Symbolic Links
// ============================================

/**
 * Create symbolic link safely
 */
export async function createSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    const targetPath = expandPath(target);
    const link = expandPath(linkPath);

    // Check if target exists
    if (!await pathExists(targetPath)) {
      throw new SetupError(
        `Symlink target does not exist: ${targetPath}`,
        SetupErrorType.FILE_NOT_FOUND
      );
    }

    // Check what exists at link path
    try {
      const stats = await fs.lstat(link);
      if (stats.isSymbolicLink()) {
        await fs.unlink(link);
      } else {
        // File or directory already exists
        return false;
      }
    } catch {
      // Link doesn't exist, OK to create
    }

    await fs.symlink(targetPath, link);
    return true;
  } catch (error) {
    // Re-throw SetupError as is
    if (error instanceof SetupError) {
      throw error;
    }

    // Map system errors to appropriate SetupErrorType
    const nodeError = error as NodeJS.ErrnoException;
    let errorType = SetupErrorType.UNKNOWN;

    switch (nodeError.code) {
      case 'EACCES':
      case 'EPERM':
        errorType = SetupErrorType.PERMISSION_DENIED;
        break;
      case 'ENOENT':
        errorType = SetupErrorType.FILE_NOT_FOUND;
        break;
      case 'EEXIST':
        errorType = SetupErrorType.ALREADY_EXISTS;
        break;
      case 'ENOTDIR':
      case 'EISDIR':
        errorType = SetupErrorType.INVALID_CONFIG;
        break;
    }

    throw new SetupError(
      `Failed to create symlink: ${nodeError.message}`,
      errorType
    );
  }
}

/**
 * Check if path is a symbolic link
 */
export async function isSymlink(filepath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(expandPath(filepath));
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Read symbolic link target
 */
export async function readSymlink(linkPath: string): Promise<string | null> {
  try {
    return await fs.readlink(expandPath(linkPath));
  } catch {
    return null;
  }
}

// ============================================
// Temporary Files
// ============================================

/**
 * Create a temporary file
 */
export async function createTempFile(
  prefix: string = 'tmp',
  suffix: string = '',
  dir?: string
): Promise<string> {
  // Sanitize prefix and suffix to remove invalid filename characters
  const sanitize = (str: string) => str.replace(/[<>:"|?*\/\\]/g, '-');
  const safePrefix = sanitize(prefix);
  const safeSuffix = sanitize(suffix);

  const tempDir = dir ? expandPath(dir) : os.tmpdir();
  const randomName = `${safePrefix}-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeSuffix}`;
  const tempPath = path.join(tempDir, randomName);

  await writeFile(tempPath, '');
  return tempPath;
}

/**
 * Create a temporary directory
 */
export async function createTempDir(
  prefix: string = 'tmp',
  dir?: string
): Promise<string> {
  // Sanitize prefix to remove invalid filename characters
  const safePrefix = prefix.replace(/[<>:"|?*\/\\]/g, '-');

  const tempDir = dir ? expandPath(dir) : os.tmpdir();
  const randomName = `${safePrefix}-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const tempPath = path.join(tempDir, randomName);

  await ensureDir(tempPath);
  return tempPath;
}

// ============================================
// File Watching
// ============================================

/**
 * Watch file or directory for changes
 *
 * @param filepath - The path to watch
 * @param callback - Callback function triggered on changes
 * @returns FSWatcher instance - IMPORTANT: Call .close() on the returned watcher
 *          when done to prevent memory leaks and resource exhaustion
 *
 * @example
 * const watcher = watchPath('/path/to/file', (event, filename) => {
 *   console.log(`File ${filename} changed: ${event}`);
 * });
 * // Later, when done watching:
 * watcher.close();
 */
export function watchPath(
  filepath: string,
  callback: (eventType: string, filename: string | null) => void
): fsSync.FSWatcher {
  const fullPath = expandPath(filepath);
  return fsSync.watch(fullPath, callback);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate file hash (SHA256)
 */
export async function getFileHash(
  filepath: string,
  algorithm: string = 'sha256'
): Promise<string> {
  const fullPath = expandPath(filepath);
  const hash = crypto.createHash(algorithm);
  const stream = createReadStream(fullPath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

/**
 * Compare two files efficiently
 * First compares sizes, then computes hashes if needed
 */
export async function filesAreEqual(file1: string, file2: string): Promise<boolean> {
  // First, quick check: compare file sizes
  const [size1, size2] = await Promise.all([
    getFileSize(file1),
    getFileSize(file2)
  ]);

  if (size1 !== size2) {
    return false; // Different sizes = different files
  }

  // For small files, compare content directly (faster than hashing)
  const SMALL_FILE_THRESHOLD = 64 * 1024; // 64KB

  if (size1 < SMALL_FILE_THRESHOLD) {
    const [content1, content2] = await Promise.all([
      fs.readFile(expandPath(file1)),
      fs.readFile(expandPath(file2))
    ]);
    return Buffer.compare(content1, content2) === 0;
  }

  // For large files, compare hashes
  const [hash1, hash2] = await Promise.all([
    getFileHash(file1),
    getFileHash(file2)
  ]);

  return hash1 === hash2;
}

/**
 * Find files matching a pattern
 */
export async function findFiles(
  baseDir: string,
  pattern: RegExp | ((filepath: string) => boolean),
  maxDepth: number = Infinity
): Promise<string[]> {
  const results: string[] = [];
  const basePath = expandPath(baseDir);

  async function search(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const relativePath = path.relative(basePath, entryPath);

      if (entry.isFile()) {
        const matches = typeof pattern === 'function'
          ? pattern(relativePath)
          : pattern.test(relativePath);

        if (matches) {
          results.push(relativePath);
        }
      } else if (entry.isDirectory()) {
        await search(entryPath, depth + 1);
      }
    }
  }

  await search(basePath, 0);
  return results.sort();
}

/**
 * Get directory size recursively
 * Safely handles symbolic links to prevent infinite loops
 */
export async function getDirectorySize(dirpath: string): Promise<number> {
  const fullPath = expandPath(dirpath);
  let totalSize = 0;
  const visited = new Set<string>(); // Track visited paths by their real path

  async function calculateSize(dir: string): Promise<void> {
    // Get the real path to handle symlinks
    let realPath: string;
    try {
      realPath = await fs.realpath(dir);
    } catch {
      // If we can't resolve the path, skip it
      return;
    }

    // Check if we've already visited this directory (prevents loops)
    if (visited.has(realPath)) {
      return;
    }
    visited.add(realPath);

    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Skip directories we can't read
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      try {
        if (entry.isFile()) {
          const stats = await fs.stat(entryPath);
          totalSize += stats.size;
        } else if (entry.isDirectory()) {
          // Recursively calculate subdirectory size
          await calculateSize(entryPath);
        } else if (entry.isSymbolicLink()) {
          // For symlinks, check if they point to a file
          try {
            const stats = await fs.stat(entryPath);
            if (stats.isFile()) {
              totalSize += stats.size;
            } else if (stats.isDirectory()) {
              // Follow symlink to directory
              await calculateSize(entryPath);
            }
          } catch {
            // Broken symlink, ignore
          }
        }
      } catch {
        // Skip files we can't access
      }
    }
  }

  await calculateSize(fullPath);
  return totalSize;
}

// ============================================
// Export all functions
// ============================================

export default {
  // Path utilities
  expandPath,
  normalizePath,
  isPathSafe,
  getFileExtension,

  // Existence and stats
  fileExists,
  dirExists,
  pathExists,
  getStats,
  getFileSize,
  isWritable,
  isReadable,

  // Directory operations
  ensureDir,
  removeDirectory,
  listDirectory,
  copyDirectory,
  createBackup,

  // File operations
  readFile,
  writeFile,
  appendFile,
  copyFile,
  move,
  deleteFile,

  // Atomic operations
  writeFileAtomic,
  updateFileAtomic,

  // JSON operations
  readJsonFile,
  writeJsonFile,
  updateJsonFile,

  // Stream operations
  copyFileStream,
  readLines,
  countLines,

  // Permissions
  setPermissions,
  setExecutable,
  getPermissions,

  // Symbolic links
  createSymlink,
  isSymlink,
  readSymlink,

  // Temporary files
  createTempFile,
  createTempDir,

  // File watching
  watchPath,

  // Utilities
  getFileHash,
  filesAreEqual,
  findFiles,
  getDirectorySize
};