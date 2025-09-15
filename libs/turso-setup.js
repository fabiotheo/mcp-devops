#!/usr/bin/env node

/**
 * Turso Setup - Script para configurar e inicializar o banco de dados Turso
 * Cria tabelas, índices e dados iniciais
 */

import { createClient } from '@libsql/client';
import readline from 'readline/promises';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

class TursoSetup {
    constructor() {
        this.configFile = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');
        this.client = null;
        this.config = {};
    }

    /**
     * Executa o setup completo
     */
    async run() {
        console.log('═══ Turso Database Setup ═══\n');

        // 1. Verificar/criar configuração
        await this.loadOrCreateConfig();

        // 2. Conectar ao Turso
        await this.connectToTurso();

        // 3. Criar schema
        await this.createSchema();

        // 4. Criar dados iniciais (opcional)
        await this.createInitialData();

        // 5. Verificar instalação
        await this.verifyInstallation();

        console.log('\n✅ Turso setup completed successfully!');
        console.log('\nYou can now use ipcom-chat with distributed history support.');
    }

    /**
     * Carrega ou cria configuração do Turso
     */
    async loadOrCreateConfig() {
        if (existsSync(this.configFile)) {
            console.log('Loading existing Turso configuration...');
            const data = await fs.readFile(this.configFile, 'utf8');
            this.config = JSON.parse(data);
        } else {
            console.log('No Turso configuration found. Let\'s create one.\n');
            await this.createConfig();
        }
    }

    /**
     * Cria nova configuração
     */
    async createConfig() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('Please provide your Turso database credentials:');
        console.log('(Get these from: https://turso.tech/app/databases)\n');

        this.config.turso_url = await rl.question('Turso Database URL: ');
        this.config.turso_token = await rl.question('Turso Auth Token: ');

        // Opcionais
        const useSyncUrl = await rl.question('\nDo you want to configure embedded replica for offline support? (y/n): ');
        if (useSyncUrl.toLowerCase() === 'y') {
            this.config.turso_sync_url = await rl.question('Turso Sync URL (usually same as Database URL): ') || this.config.turso_url;
            const syncInterval = await rl.question('Sync interval in seconds (default: 60): ');
            this.config.turso_sync_interval = parseInt(syncInterval) || 60;
        }

        // Configurações adicionais
        this.config.history_mode = 'hybrid'; // Padrão
        this.config.fallback_enabled = true;
        this.config.cache_ttl = 3600;
        this.config.max_retries = 5;
        this.config.retry_interval = 60000;

        await rl.close();

        // Salvar configuração
        await this.saveConfig();
    }

    /**
     * Salva configuração
     */
    async saveConfig() {
        const dir = path.dirname(this.configFile);
        if (!existsSync(dir)) {
            await fs.mkdir(dir, { recursive: true });
        }

        await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2));
        console.log(`\nConfiguration saved to: ${this.configFile}`);
    }

    /**
     * Conecta ao Turso
     */
    async connectToTurso() {
        console.log('\nConnecting to Turso database...');

        try {
            if (this.config.turso_sync_url) {
                this.client = createClient({
                    url: this.config.turso_url,
                    authToken: this.config.turso_token,
                    syncUrl: this.config.turso_sync_url,
                    syncInterval: this.config.turso_sync_interval || 60
                });
            } else {
                this.client = createClient({
                    url: this.config.turso_url,
                    authToken: this.config.turso_token
                });
            }

            // Testar conexão
            await this.client.execute('SELECT 1');
            console.log('✅ Connected successfully!');
        } catch (error) {
            console.error('❌ Failed to connect to Turso:', error.message);
            console.error('\nPlease check your credentials and try again.');
            process.exit(1);
        }
    }

    /**
     * Cria schema do banco de dados
     */
    async createSchema() {
        console.log('\nCreating database schema...');

        // Usar transação para garantir atomicidade
        const tx = await this.client.transaction();

        try {
            const tables = [
            {
                name: 'users',
                sql: `CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
                    username TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    created_at INTEGER DEFAULT (unixepoch()),
                    updated_at INTEGER DEFAULT (unixepoch()),
                    is_active BOOLEAN DEFAULT 1
                )`
            },
            {
                name: 'machines',
                sql: `CREATE TABLE IF NOT EXISTS machines (
                    machine_id TEXT PRIMARY KEY,
                    hostname TEXT NOT NULL,
                    ip_address TEXT,
                    os_info TEXT,
                    first_seen INTEGER DEFAULT (unixepoch()),
                    last_seen INTEGER DEFAULT (unixepoch()),
                    total_commands INTEGER DEFAULT 0
                )`
            },
            {
                name: 'history_global',
                sql: `CREATE TABLE IF NOT EXISTS history_global (
                    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
                    command TEXT NOT NULL,
                    response TEXT,
                    machine_id TEXT,
                    user_id TEXT,
                    timestamp INTEGER DEFAULT (unixepoch()),
                    tokens_used INTEGER,
                    execution_time_ms INTEGER,
                    tags TEXT,
                    session_id TEXT,
                    FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`
            },
            {
                name: 'history_user',
                sql: `CREATE TABLE IF NOT EXISTS history_user (
                    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
                    user_id TEXT NOT NULL,
                    command TEXT NOT NULL,
                    response TEXT,
                    machine_id TEXT,
                    timestamp INTEGER DEFAULT (unixepoch()),
                    session_id TEXT,
                    context TEXT,
                    tokens_used INTEGER,
                    execution_time_ms INTEGER,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
                )`
            },
            {
                name: 'history_machine',
                sql: `CREATE TABLE IF NOT EXISTS history_machine (
                    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
                    machine_id TEXT NOT NULL,
                    command TEXT NOT NULL,
                    response TEXT,
                    user_id TEXT,
                    timestamp INTEGER DEFAULT (unixepoch()),
                    error_code INTEGER,
                    session_id TEXT,
                    FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`
            },
            {
                name: 'command_cache',
                sql: `CREATE TABLE IF NOT EXISTS command_cache (
                    command_hash TEXT PRIMARY KEY,
                    command TEXT NOT NULL,
                    output TEXT,
                    machine_id TEXT,
                    last_executed INTEGER,
                    execution_count INTEGER DEFAULT 1,
                    avg_execution_time_ms INTEGER
                )`
            },
            {
                name: 'sessions',
                sql: `CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    machine_id TEXT NOT NULL,
                    user_id TEXT,
                    started_at INTEGER DEFAULT (unixepoch()),
                    ended_at INTEGER,
                    command_count INTEGER DEFAULT 0,
                    FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )`
            }
        ];

            for (const table of tables) {
                await tx.execute(table.sql);
                console.log(`  ✅ Table '${table.name}' created`);
            }

            // Criar índices
            console.log('\nCreating indexes...');
            const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_history_global_timestamp ON history_global(timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_history_global_machine ON history_global(machine_id, timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_history_user_lookup ON history_user(user_id, timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_history_machine_lookup ON history_machine(machine_id, timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_command_cache_lookup ON command_cache(machine_id, last_executed DESC)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_machine ON sessions(machine_id, started_at DESC)'
        ];

            for (const index of indexes) {
                await tx.execute(index);
                console.log('  ✅ Index created');
            }

            // Commit da transação se tudo deu certo
            await tx.commit();
            console.log('\n✅ Schema created successfully!');

        } catch (error) {
            // Rollback em caso de erro
            console.error('\n❌ Schema creation failed, rolling back transaction:', error.message);
            await tx.rollback();
            throw error; // Re-throw para parar o setup
        }
    }

    /**
     * Cria dados iniciais (opcional)
     */
    async createInitialData() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const createUser = await rl.question('\nDo you want to create an initial user? (y/n): ');

        if (createUser.toLowerCase() === 'y') {
            const username = await rl.question('Username: ');
            const name = await rl.question('Full name: ');
            let email = '';

            // Garantir que email seja fornecido
            while (!email) {
                email = await rl.question('Email: ');
                if (!email) {
                    console.log('  ⚠️  Email is required. Please provide a valid email address.');
                }
            }

            try {
                await this.client.execute({
                    sql: `INSERT INTO users (username, name, email)
                          VALUES (?, ?, ?)`,
                    args: [username, name, email]
                });
                console.log(`\n✅ User '${username}' created successfully!`);
                console.log(`You can now use: ipcom-chat --user ${username}`);
            } catch (error) {
                if (error.message.includes('UNIQUE')) {
                    console.log(`\nUser '${username}' already exists.`);
                } else {
                    console.error('\nFailed to create user:', error.message);
                }
            }
        }

        await rl.close();
    }

    /**
     * Verifica a instalação
     */
    async verifyInstallation() {
        console.log('\nVerifying installation...');

        try {
            // Verificar tabelas
            const tables = await this.client.execute(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            `);

            console.log(`\n✅ Found ${tables.rows.length} tables:`);
            tables.rows.forEach(row => {
                console.log(`  - ${row.name}`);
            });

            // Verificar usuários
            const users = await this.client.execute('SELECT COUNT(*) as count FROM users');
            console.log(`\n✅ ${users.rows[0].count} users registered`);

            // Verificar máquinas
            const machines = await this.client.execute('SELECT COUNT(*) as count FROM machines');
            console.log(`✅ ${machines.rows[0].count} machines registered`);

            // Verificar histórico
            const history = await this.client.execute('SELECT COUNT(*) as count FROM history_global');
            console.log(`✅ ${history.rows[0].count} commands in global history`);

        } catch (error) {
            console.error('❌ Verification failed:', error.message);
        }
    }

    /**
     * Limpa o banco de dados (CUIDADO!)
     */
    async resetDatabase() {
        console.log('\n⚠️  WARNING: This will DELETE all data from the database!');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const confirm = await rl.question('Are you sure? Type "DELETE ALL DATA" to confirm: ');
        await rl.close();

        if (confirm === 'DELETE ALL DATA') {
            console.log('\nDropping all tables...');

            const tables = ['sessions', 'command_cache', 'history_machine', 'history_user', 'history_global', 'machines', 'users'];

            for (const table of tables) {
                try {
                    await this.client.execute(`DROP TABLE IF EXISTS ${table}`);
                    console.log(`  ✅ Dropped table '${table}'`);
                } catch (error) {
                    console.error(`  ❌ Failed to drop table '${table}':`, error.message);
                }
            }

            console.log('\n✅ Database reset complete. Run setup again to recreate tables.');
        } else {
            console.log('\n❌ Reset cancelled.');
        }
    }
}

// Executar setup
if (import.meta.url === `file://${process.argv[1]}`) {
    const setup = new TursoSetup();

    const command = process.argv[2];

    try {
        if (command === 'reset') {
            await setup.loadOrCreateConfig();
            await setup.connectToTurso();
            await setup.resetDatabase();
        } else if (command === 'verify') {
            await setup.loadOrCreateConfig();
            await setup.connectToTurso();
            await setup.verifyInstallation();
        } else {
            await setup.run();
        }
    } catch (error) {
        console.error('\n❌ Setup failed:', error);
        process.exit(1);
    }

    process.exit(0);
}