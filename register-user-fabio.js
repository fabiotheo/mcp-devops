#!/usr/bin/env node

/**
 * Register user "fabio" in Turso database
 */

import { createClient } from '@libsql/client';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

async function registerUser() {
    console.log('\n=== Registering User "fabio" ===\n');

    const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');

    try {
        // Load config
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

        // Create direct client
        const client = createClient({
            url: config.turso_url,
            authToken: config.turso_token
        });

        // First check if user exists
        const checkResult = await client.execute({
            sql: 'SELECT * FROM users WHERE username = ?',
            args: ['fabio']
        });

        if (checkResult.rows.length > 0) {
            console.log('User "fabio" already exists:');
            console.log('ID:', checkResult.rows[0].id);
            console.log('Username:', checkResult.rows[0].username);
            console.log('Name:', checkResult.rows[0].name);
            return checkResult.rows[0].id;
        }

        // Create user
        console.log('Creating user "fabio"...');
        const insertResult = await client.execute({
            sql: `INSERT INTO users (username, name, email)
                  VALUES (?, ?, ?)`,
            args: ['fabio', 'Fabio', 'fabio@example.com']
        });

        console.log('✅ User created successfully');

        // Get the created user
        const newUser = await client.execute({
            sql: 'SELECT * FROM users WHERE username = ?',
            args: ['fabio']
        });

        if (newUser.rows.length > 0) {
            console.log('\nCreated user:');
            console.log('ID:', newUser.rows[0].id);
            console.log('Username:', newUser.rows[0].username);
            console.log('Name:', newUser.rows[0].name);

            // Now update the TursoHistoryClient to use this ID
            console.log('\n⚠️  IMPORTANT: The user ID in the database is:', newUser.rows[0].id);
            console.log('This is different from the username "fabio"');

            return newUser.rows[0].id;
        }

        client.close();

    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
    }
}

registerUser().then(userId => {
    if (userId) {
        console.log('\n=== Next Steps ===');
        console.log(`1. The actual user ID is: ${userId}`);
        console.log('2. You need to use this ID (not "fabio") when querying history_user table');
        console.log('3. Or update the system to map username "fabio" to this ID');
    }
    process.exit(0);
});