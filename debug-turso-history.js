#!/usr/bin/env node

/**
 * Debug script to check Turso history loading
 */

import TursoHistoryClient from './libs/turso-client.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

async function debugHistory() {
    console.log('\n=== Debug Turso History ===\n');

    const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');

    try {
        // Load config
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        console.log('Config loaded:', {
            history_mode: config.history_mode,
            has_url: !!config.turso_url,
            has_token: !!config.turso_token
        });

        // Create client for user "fabio"
        const client = new TursoHistoryClient({
            ...config,
            debug: true
        });

        // Set userId BEFORE initialize
        client.userId = 'fabio';
        console.log('\nUserId set to:', client.userId);

        await client.initialize();
        console.log('\nClient initialized');
        console.log('Mode:', client.mode);
        console.log('UserId after init:', client.userId);

        // Get history
        console.log('\n=== Loading History ===\n');
        const history = await client.getHistory(10);

        console.log(`Found ${history.length} entries\n`);

        if (history.length > 0) {
            // Show raw data structure
            console.log('First entry structure:', Object.keys(history[0]));
            console.log('\nFirst 5 entries:');

            history.slice(0, 5).forEach((entry, i) => {
                console.log(`\n${i + 1}. Entry:`);
                console.log('   Command:', entry.command);
                console.log('   Timestamp:', new Date(entry.timestamp * 1000).toLocaleString());
                console.log('   User ID:', entry.user_id);
                console.log('   Source:', entry.source || 'N/A');
            });
        }

        // Now let's test what happens with TursoAdapter
        console.log('\n\n=== Testing TursoAdapter ===\n');

        const { default: TursoAdapter } = await import('./interface-v2/bridges/adapters/TursoAdapter.js');

        const adapter = new TursoAdapter({
            debug: true,
            userId: 'fabio'
        });

        await adapter.initialize();
        console.log('Adapter initialized');
        console.log('Is connected:', adapter.isConnected());

        const adapterHistory = await adapter.getHistory(10);
        console.log(`\nAdapter returned ${adapterHistory.length} entries`);

        if (adapterHistory.length > 0) {
            console.log('\nFirst 3 from adapter:');
            adapterHistory.slice(0, 3).forEach((entry, i) => {
                console.log(`${i + 1}. ${entry.command}`);
            });
        }

        await client.close();

    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
    }
}

debugHistory();