/**
 * Setup Installer for MCP Terminal
 *
 * Handles all file installation operations including:
 * - Creating directory structure
 * - Copying and adjusting files
 * - Setting permissions
 * - Managing patterns and libraries
 */

import * as path from 'path';
import * as io from './setup-io.js';
import * as system from './setup-system.js';
import * as helpers from './setup-helpers.js';
import { filesToCopy, patternFiles, libFiles, componentFiles } from './setup-files.config.js';
import { FileMapping, SetupConfig } from './setup-types.js';
import { INSTALLATION_DIRS, EXECUTABLE_FILES } from './setup-config.js';

/**
 * Installation progress callback
 */
export interface InstallProgress {
  current: number;
  total: number;
  file: string;
  action: 'copy' | 'adjust' | 'permission' | 'skip';
}

/**
 * Installation options
 */
export interface InstallOptions {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  skipPatterns?: boolean;
  skipLibs?: boolean;
  onProgress?: (progress: InstallProgress) => void;
}

/**
 * SetupInstaller class handles all installation operations
 */
export class SetupInstaller {
  private config: SetupConfig;
  private sourceDir: string;

  constructor(config: SetupConfig, sourceDir?: string) {
    this.config = config;
    this.sourceDir = sourceDir || process.cwd();
  }

  /**
   * Create all required directories
   */
  async createDirectories(): Promise<void> {
    console.log('📁 Creating directory structure...');

    // Create main directory
    await io.ensureDir(this.config.mcpDir);

    // Create all installation directories
    for (const dir of INSTALLATION_DIRS) {
      const fullPath = path.join(this.config.mcpDir, dir);
      await io.ensureDir(fullPath);
    }

    // Create additional directories
    const additionalDirs = [
      'logs',
      '.backups',
      '.cache'
    ];

    for (const dir of additionalDirs) {
      const fullPath = path.join(this.config.mcpDir, dir);
      await io.ensureDir(fullPath);
    }

    console.log('✅ Directory structure created');
  }

  /**
   * Install all files (replaces makeExecutable method)
   */
  async installFiles(options: InstallOptions = {}): Promise<void> {
    const {
      verbose = false,
      dryRun = false,
      force = false,
      skipPatterns = false,
      skipLibs = false,
      onProgress
    } = options;

    // Get files to install
    let filesToInstall = [...filesToCopy];

    if (skipPatterns) {
      filesToInstall = filesToInstall.filter(f => !f.dest.startsWith('patterns/'));
    }

    if (skipLibs) {
      filesToInstall = filesToInstall.filter(f =>
        !f.dest.startsWith('libs/') && !f.dest.startsWith('ai_models/')
      );
    }

    const totalFiles = filesToInstall.length;
    let currentFile = 0;

    console.log(`📦 Installing ${totalFiles} files...`);

    for (const file of filesToInstall) {
      currentFile++;

      // Report progress
      if (onProgress) {
        onProgress({
          current: currentFile,
          total: totalFiles,
          file: file.dest,
          action: 'copy'
        });
      }

      if (verbose) {
        console.log(`  [${currentFile}/${totalFiles}] ${file.dest}`);
      }

      if (!dryRun) {
        await this.installFile(file, force);
      }
    }

    console.log('✅ Files installed successfully');
  }

  /**
   * Install a single file
   */
  private async installFile(mapping: FileMapping, force: boolean = false): Promise<void> {
    const sourcePath = path.join(this.sourceDir, mapping.src);
    const destPath = path.join(this.config.mcpDir, mapping.dest);

    // Check if source exists
    if (!await io.fileExists(sourcePath)) {
      // Skip missing files silently (they might be optional)
      return;
    }

    // Check if destination exists and skip if not forcing
    if (!force && await io.fileExists(destPath)) {
      return;
    }

    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    await io.ensureDir(destDir);

    // Read file content
    const content = await io.readFile(sourcePath, 'utf8');

    // Adjust imports if needed
    const adjustedContent = this.adjustImports(content, mapping.src);

    // Write adjusted content
    await io.writeFile(destPath, adjustedContent);

    // Set executable permission if needed
    if (this.shouldBeExecutable(mapping.src)) {
      await io.setExecutable(destPath);
    }
  }

  /**
   * Adjust imports in file content for installation
   */
  private adjustImports(content: string, filename: string): string {
    // Use the helper function from setup-helpers
    return helpers.adjustImportsForInstallation(content, filename);
  }

  /**
   * Check if file should be executable
   */
  private shouldBeExecutable(filename: string): boolean {
    const basename = path.basename(filename);

    // Check against executable files list
    const executableFiles = [
      'mcp-client.js',
      'mcp-assistant.js',
      'mcp-claude.js',
      'setup.js',
      'ipcom-chat'
    ];

    if (executableFiles.includes(basename)) {
      return true;
    }

    // Check common patterns
    const executablePatterns = [
      /^mcp-/,           // mcp-* files
      /^setup\.(js|ts)$/,  // setup files
      /^ipcom-chat/,     // ipcom-chat files
      /\.sh$/,           // Shell scripts
      /^configure-/      // configure scripts
    ];

    return executablePatterns.some(pattern => pattern.test(basename));
  }

  /**
   * Install pattern files specifically
   */
  async installPatterns(): Promise<void> {
    console.log('🎨 Installing pattern files...');

    const patternsDir = path.join(this.config.mcpDir, 'patterns');
    await io.ensureDir(patternsDir);

    for (const file of patternFiles) {
      const sourcePath = path.join(this.sourceDir, file.src);
      const destPath = path.join(this.config.mcpDir, file.dest);

      if (await io.fileExists(sourcePath)) {
        await io.copyFile(sourcePath, destPath);
      }
    }

    console.log('✅ Pattern files installed');
  }

  /**
   * Install library files specifically
   */
  async installLibraries(): Promise<void> {
    console.log('📚 Installing library files...');

    for (const file of libFiles) {
      const sourcePath = path.join(this.sourceDir, file.src);
      const destPath = path.join(this.config.mcpDir, file.dest);

      if (await io.fileExists(sourcePath)) {
        // Ensure directory exists
        const destDir = path.dirname(destPath);
        await io.ensureDir(destDir);

        // Copy with import adjustments
        const content = await io.readFile(sourcePath, 'utf8');
        const adjustedContent = this.adjustImports(content, file.src);
        await io.writeFile(destPath, adjustedContent);

        // Set executable if needed
        if (this.shouldBeExecutable(file.src)) {
          await io.setExecutable(destPath);
        }
      }
    }

    console.log('✅ Library files installed');
  }

  /**
   * Install component files for Ink interface
   */
  async installComponents(): Promise<void> {
    console.log('🧩 Installing component files...');

    for (const file of componentFiles) {
      const sourcePath = path.join(this.sourceDir, file.src);
      const destPath = path.join(this.config.mcpDir, file.dest);

      if (await io.fileExists(sourcePath)) {
        // Ensure directory exists
        const destDir = path.dirname(destPath);
        await io.ensureDir(destDir);

        // Copy with import adjustments
        const content = await io.readFile(sourcePath, 'utf8');
        const adjustedContent = this.adjustImports(content, file.src);
        await io.writeFile(destPath, adjustedContent);
      }
    }

    console.log('✅ Component files installed');
  }

  /**
   * Create symbolic links for CLI commands
   */
  async createSymlinks(): Promise<void> {
    console.log('🔗 Creating symbolic links...');

    // Determine bin directory
    let binDir = '/usr/local/bin';

    // Check if we can write to /usr/local/bin
    if (!await io.isWritable(binDir)) {
      // Fall back to user's local bin
      binDir = path.join(this.config.homeDir, '.local', 'bin');
      await io.ensureDir(binDir);
    }

    // Commands to link
    const commands = [
      { name: 'mcp', target: 'ipcom-chat' },
      { name: 'ask', target: 'mcp-assistant.js' },
      { name: 'mcp-setup', target: 'setup.js' }
    ];

    for (const cmd of commands) {
      const targetPath = path.join(this.config.mcpDir, cmd.target);
      const linkPath = path.join(binDir, cmd.name);

      try {
        // Remove existing link if any
        if (await io.isSymlink(linkPath)) {
          await io.deleteFile(linkPath);
        }

        // Create new symlink
        await io.createSymlink(targetPath, linkPath);
        console.log(`  ✅ ${cmd.name} -> ${cmd.target}`);
      } catch (error) {
        console.log(`  ⚠️ Could not create link for ${cmd.name}`);
      }
    }
  }

  /**
   * Verify installation integrity
   */
  async verifyInstallation(): Promise<{ valid: boolean; missing: string[] }> {
    console.log('🔍 Verifying installation...');

    const missing: string[] = [];

    // Check essential files
    const essentialFiles = [
      'mcp-client.js',
      'mcp-assistant.js',
      'ai_orchestrator.js',
      'setup.js',
      'ipcom-chat'
    ];

    for (const file of essentialFiles) {
      const filePath = path.join(this.config.mcpDir, file);
      if (!await io.fileExists(filePath)) {
        missing.push(file);
      }
    }

    // Check essential directories
    const essentialDirs = [
      'patterns',
      'libs',
      'ai_models',
      'src'
    ];

    for (const dir of essentialDirs) {
      const dirPath = path.join(this.config.mcpDir, dir);
      if (!await io.dirExists(dirPath)) {
        missing.push(`${dir}/`);
      }
    }

    const valid = missing.length === 0;

    if (valid) {
      console.log('✅ Installation verified successfully');
    } else {
      console.log('❌ Installation verification failed');
      console.log('Missing files/directories:', missing);
    }

    return { valid, missing };
  }

  /**
   * Clean up old or temporary files
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up...');

    // Remove backup files
    const backupPatterns = [
      /\.backup-\d+$/,
      /\.tmp$/,
      /~$/
    ];

    const files = await io.listDirectory(this.config.mcpDir, {
      recursive: true
    });

    for (const file of files) {
      if (backupPatterns.some(pattern => pattern.test(file))) {
        const fullPath = path.join(this.config.mcpDir, file);
        await io.deleteFile(fullPath);
      }
    }

    console.log('✅ Cleanup complete');
  }

  /**
   * Get installation statistics
   */
  async getInstallStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    directories: number;
  }> {
    const files = await io.listDirectory(this.config.mcpDir, {
      recursive: true,
      filesOnly: true
    });

    const dirs = await io.listDirectory(this.config.mcpDir, {
      recursive: true,
      dirsOnly: true
    });

    const totalSize = await io.getDirectorySize(this.config.mcpDir);

    return {
      totalFiles: files.length,
      totalSize,
      directories: dirs.length
    };
  }
}

export default SetupInstaller;