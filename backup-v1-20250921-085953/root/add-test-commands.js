#!/usr/bin/env node

/**
 * Add test commands to Turso for user "fabio"
 */

import TursoHistoryClient from './libs/turso-client.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

async function addTestCommands() {
    console.log('\n=== Adding Test Commands for user "fabio" ===\n');

    const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');

    try {
        // Load config
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

        // Create client
        const client = new TursoHistoryClient({
            ...config,
            debug: false
        });

        // Set to user mode with userId "fabio"
        client.mode = 'user';
        client.userId = 'fabio';

        await client.initialize();
        console.log('Client initialized in user mode');
        console.log('UserId:', client.userId);

        // Add some realistic commands
        const commands = [
            { cmd: 'ls -la', response: 'Listed files and directories' },
            { cmd: 'cd /home/fabio/projects', response: 'Changed directory' },
            { cmd: 'git status', response: 'Showed git status' },
            { cmd: 'docker ps', response: 'Listed running containers' },
            { cmd: 'npm install', response: 'Installed dependencies' },
            { cmd: 'echo "Hello Turso"', response: 'Hello Turso' },
            { cmd: 'pwd', response: '/home/fabio/projects' },
            { cmd: 'history', response: 'Showed command history' }
        ];

        console.log('\nAdding commands...');

        for (const { cmd, response } of commands) {
            await client.saveCommand(cmd, response, {
                source: 'test-script'
            });
            console.log(`✓ Added: ${cmd}`);

            // Small delay to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('\n✅ All commands added successfully');

        // Now verify they were saved
        console.log('\n=== Verifying History ===\n');
        const history = await client.getHistory(10);

        console.log(`Found ${history.length} entries in history`);

        if (history.length > 0) {
            console.log('\nLast 5 commands:');
            history.slice(0, 5).forEach((entry, i) => {
                console.log(`${i + 1}. ${entry.command}`);
            });
        }

        await client.close();

    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
    }
}

// Ask for confirmation
console.log('This will add test commands to Turso for user "fabio"');
console.log('Continue? (y/n)');

process.stdin.once('data', (data) => {
    if (data.toString().trim().toLowerCase() === 'y') {
        addTestCommands();
    } else {
        console.log('Cancelled');
        process.exit(0);
    }
});