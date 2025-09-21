#!/usr/bin/env node

/**
 * Migration Script: Readline Interface → Ink Interface
 *
 * This script helps migrate from the old readline-based interface
 * to the new Ink-based interface while preserving user configurations
 * and history.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class InterfaceMigrator {
    constructor() {
        this.mcpDir = path.join(os.homedir(), '.mcp-terminal');
        this.backupDir = path.join(this.mcpDir, 'backup-pre-ink');
        this.configFile = path.join(this.mcpDir, 'config.json');
        this.historyFile = path.join(this.mcpDir, 'history.json');
        this.tursoConfigFile = path.join(this.mcpDir, 'turso-config.json');

        // Files to backup
        this.filesToBackup = [
            'ipcom',
            'ipcom-chat',
            'config.json',
            'history.json',
            'turso-config.json'
        ];

        // New interface files to install
        this.newInterfaceFiles = [
            { src: 'interface-v2/mcp-ink-cli.mjs', dest: 'mcp-ink-cli.mjs' },
            { src: 'interface-v2/bridges/adapters/TursoAdapter.js', dest: 'bridges/adapters/TursoAdapter.js' },
            { src: 'interface-v2/bridges/CommandProcessor.js', dest: 'bridges/CommandProcessor.js' },
            { src: 'interface-v2/components/CommandInput.js', dest: 'components/CommandInput.js' },
            { src: 'interface-v2/components/HistorySearch.js', dest: 'components/HistorySearch.js' },
            { src: 'interface-v2/components/LoadingSpinner.js', dest: 'components/LoadingSpinner.js' },
            { src: 'interface-v2/components/PasteManager.js', dest: 'components/PasteManager.js' },
            { src: 'interface-v2/components/ResponseDisplay.js', dest: 'components/ResponseDisplay.js' },
            { src: 'interface-v2/components/SessionDisplay.js', dest: 'components/SessionDisplay.js' }
        ];
    }

    async run() {
        try {
            console.log('🚀 Starting Migration to Ink Interface\n');

            // Step 1: Check current installation
            await this.checkCurrentInstallation();

            // Step 2: Create backup
            await this.createBackup();

            // Step 3: Install new interface files
            await this.installNewInterface();

            // Step 4: Update shell aliases
            await this.updateShellAliases();

            // Step 5: Migrate history
            await this.migrateHistory();

            // Step 6: Test new installation
            await this.testNewInstallation();

            console.log('\n✅ Migration completed successfully!');
            console.log('\n📝 Next steps:');
            console.log('1. Restart your terminal or run: source ~/.zshrc');
            console.log('2. Test the new interface: ipcom "your question"');
            console.log('3. If issues occur, restore backup: node restore-from-backup.js');

        } catch (error) {
            console.error('\n❌ Migration failed:', error.message);
            console.log('\n🔄 Rolling back changes...');
            await this.rollback();
            process.exit(1);
        }
    }

    async checkCurrentInstallation() {
        console.log('📋 Checking current installation...');

        try {
            await fs.access(this.mcpDir);
            console.log('  ✓ MCP directory found');
        } catch {
            throw new Error('MCP Terminal Assistant not installed. Run: node setup.js');
        }

        // Check for old interface files
        const oldInterface = path.join(this.mcpDir, 'ipcom-chat');
        try {
            await fs.access(oldInterface);
            console.log('  ✓ Old interface detected');
        } catch {
            console.log('  ⚠ Old interface not found (might already be migrated)');
        }

        // Check for Turso configuration
        try {
            await fs.access(this.tursoConfigFile);
            console.log('  ✓ Turso configuration found');
        } catch {
            console.log('  ℹ Turso not configured (optional)');
        }
    }

    async createBackup() {
        console.log('\n📦 Creating backup...');

        // Create backup directory
        await fs.mkdir(this.backupDir, { recursive: true });
        console.log(`  ✓ Backup directory created: ${this.backupDir}`);

        // Backup existing files
        for (const file of this.filesToBackup) {
            const srcPath = path.join(this.mcpDir, file);
            const destPath = path.join(this.backupDir, file);

            try {
                await fs.access(srcPath);
                await fs.cp(srcPath, destPath, { recursive: true });
                console.log(`  ✓ Backed up: ${file}`);
            } catch {
                // File doesn't exist, skip
            }
        }

        // Create restore script
        const restoreScript = `#!/usr/bin/env node
// Restore script for pre-Ink backup
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const mcpDir = path.join(os.homedir(), '.mcp-terminal');
const backupDir = path.join(mcpDir, 'backup-pre-ink');

async function restore() {
    console.log('Restoring from backup...');
    const files = await fs.readdir(backupDir);
    for (const file of files) {
        if (file === 'restore.js') continue;
        const src = path.join(backupDir, file);
        const dest = path.join(mcpDir, file);
        await fs.cp(src, dest, { recursive: true, force: true });
        console.log('Restored:', file);
    }
    console.log('Restore complete!');
}

restore().catch(console.error);
`;

        await fs.writeFile(
            path.join(this.backupDir, 'restore.js'),
            restoreScript,
            { mode: 0o755 }
        );
        console.log('  ✓ Restore script created');
    }

    async installNewInterface() {
        console.log('\n📥 Installing new Ink interface...');

        for (const file of this.newInterfaceFiles) {
            const srcPath = path.join(__dirname, file.src);
            const destPath = path.join(this.mcpDir, file.dest);

            // Ensure destination directory exists
            const destDir = path.dirname(destPath);
            await fs.mkdir(destDir, { recursive: true });

            try {
                await fs.access(srcPath);
                await fs.copyFile(srcPath, destPath);
                console.log(`  ✓ Installed: ${file.dest}`);
            } catch (error) {
                console.warn(`  ⚠ Could not install ${file.dest}: ${error.message}`);
            }
        }

        // Create new ipcom-chat wrapper
        const wrapperContent = `#!/usr/bin/env node

/**
 * Wrapper for Ink-based MCP Terminal Assistant
 * Auto-generated by migration script
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const inkInterface = path.join(__dirname, 'mcp-ink-cli.mjs');

// Set MCP_USER from environment or use 'default'
const user = process.env.MCP_USER || process.env.USER || 'default';

const child = spawn('node', [inkInterface, ...args], {
    stdio: 'inherit',
    env: { ...process.env, MCP_USER: user }
});

child.on('exit', (code) => {
    process.exit(code || 0);
});
`;

        const wrapperPath = path.join(this.mcpDir, 'ipcom-chat-ink');
        await fs.writeFile(wrapperPath, wrapperContent, { mode: 0o755 });
        console.log('  ✓ Created ipcom-chat-ink wrapper');
    }

    async updateShellAliases() {
        console.log('\n🔧 Updating shell aliases...');

        const shellrc = path.join(os.homedir(), '.zshrc');

        try {
            let content = await fs.readFile(shellrc, 'utf-8');

            // Check if aliases exist
            if (content.includes('alias ipcom=')) {
                // Update existing alias to use new interface
                content = content.replace(
                    /alias ipcom=.*$/m,
                    `alias ipcom="${path.join(this.mcpDir, 'ipcom-chat-ink')}"`
                );

                await fs.writeFile(shellrc, content);
                console.log('  ✓ Updated ipcom alias to use Ink interface');
            } else {
                console.log('  ℹ No ipcom alias found (might be using different shell)');
            }
        } catch {
            console.log('  ⚠ Could not update .zshrc (might be using different shell)');
        }
    }

    async migrateHistory() {
        console.log('\n📚 Migrating history...');

        try {
            const history = await fs.readFile(this.historyFile, 'utf-8');
            const historyData = JSON.parse(history);

            // Check if Turso is configured
            try {
                await fs.access(this.tursoConfigFile);
                console.log('  ℹ Turso configured - history will sync automatically');
            } catch {
                // Create compatible history format for new interface
                const newHistory = {
                    commands: historyData.commands || historyData,
                    version: '2.0',
                    interface: 'ink',
                    migrated: new Date().toISOString()
                };

                await fs.writeFile(
                    this.historyFile,
                    JSON.stringify(newHistory, null, 2)
                );
                console.log('  ✓ History migrated to new format');
            }
        } catch {
            console.log('  ℹ No history to migrate');
        }
    }

    async testNewInstallation() {
        console.log('\n🧪 Testing new installation...');

        try {
            // Test if new interface can be executed
            execSync(`node ${path.join(this.mcpDir, 'mcp-ink-cli.mjs')} --version`, {
                stdio: 'ignore'
            });
            console.log('  ✓ New interface executable');
        } catch {
            console.log('  ⚠ Could not test new interface (might need dependencies)');
        }

        // Check required dependencies
        const requiredPackages = ['ink', 'ink-text-input', '@inkjs/ui'];
        console.log('\n  Checking dependencies...');

        for (const pkg of requiredPackages) {
            try {
                await import(pkg);
                console.log(`    ✓ ${pkg} installed`);
            } catch {
                console.log(`    ⚠ ${pkg} not installed - run: pnpm install ${pkg}`);
            }
        }
    }

    async rollback() {
        console.log('🔄 Rolling back migration...');

        try {
            const restoreScript = path.join(this.backupDir, 'restore.js');
            execSync(`node ${restoreScript}`, { stdio: 'inherit' });
            console.log('✓ Rollback complete');
        } catch (error) {
            console.error('Failed to rollback:', error.message);
            console.log(`Manual restore: cp -r ${this.backupDir}/* ${this.mcpDir}/`);
        }
    }
}

// Run migration
const migrator = new InterfaceMigrator();
migrator.run().catch(console.error);