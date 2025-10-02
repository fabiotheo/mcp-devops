# Plano de Implementação: Sistema de Histórico Distribuído com Turso

## Visão Geral

Sistema de histórico distribuído para o MCP Terminal Assistant (ipcom-chat) usando Turso como backend, permitindo compartilhamento de conhecimento entre 300+ máquinas Linux corporativas com suporte a usuários e histórico por máquina.

## Requisitos Principais

1. **Sistema de usuários sem senha** - Foco em compartilhamento de conhecimento
2. **Comando `ipcom-chat`** - Histórico global compartilhado (padrão)
3. **Comando `ipcom-chat --user <username>`** - Histórico individual do usuário
4. **Histórico híbrido** - Por máquina (local) e por usuário (compartilhado)
5. **CRUD de usuários** - Criar, editar, deletar usuários
6. **Dados do usuário** - name, username, email (todos obrigatórios)
7. **Identificador único por máquina** - Para rastreamento local
8. **Escalabilidade** - Suportar 300+ máquinas Linux

## Arquitetura do Sistema

### Estrutura de Dados no Turso

#### Tabelas Principais

1. **users** - Cadastro de usuários (name, username, email)
2. **machines** - Registro de máquinas (machine_id, hostname, first_seen, last_seen)
3. **history_global** - Histórico compartilhado por todos
4. **history_user** - Histórico individual por usuário
5. **history_machine** - Histórico local de cada máquina
6. **sessions** - Sessões de chat com contexto

### Identificação de Máquina

```javascript
// Combinação única para identificação
const machineId = sha256(
  hostname +
  primaryMacAddress +
  (fs.readFileSync('/etc/machine-id') || timestamp)
);
```

### Modos de Operação

| Modo | Comando | Descrição | Tabelas Usadas |
|------|---------|-----------|----------------|
| Global | `ipcom-chat` | Histórico compartilhado | history_global |
| User | `ipcom-chat --user X` | Histórico do usuário | history_user |
| Machine | `ipcom-chat --local` | Histórico local apenas | history_machine |
| Mixed | `ipcom-chat --hybrid` | Combina todos com pesos | Todas |

## Implementação Técnica

### Fase 1: Setup Inicial do Turso

#### 1.1 Configuração da Base de Dados

```bash
# Criar database principal
turso db create ipcom-history --region gru

# Adicionar replicas para redundância
turso db replicate ipcom-history iad

# Gerar tokens de acesso
turso db tokens create ipcom-history --expiration never
```

#### 1.2 Schema SQL Completo

```sql
-- Usuários (sem senha)
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    is_active BOOLEAN DEFAULT 1
);

-- Máquinas registradas
CREATE TABLE machines (
    machine_id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    ip_address TEXT,
    os_info TEXT,
    first_seen INTEGER DEFAULT (unixepoch()),
    last_seen INTEGER DEFAULT (unixepoch()),
    total_commands INTEGER DEFAULT 0
);

-- Histórico global compartilhado
CREATE TABLE history_global (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    command TEXT NOT NULL,
    response TEXT,
    machine_id TEXT,
    user_id TEXT,
    timestamp INTEGER DEFAULT (unixepoch()),
    tokens_used INTEGER,
    execution_time_ms INTEGER,
    tags TEXT, -- JSON array
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Histórico por usuário
CREATE TABLE history_user (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    user_id TEXT NOT NULL,
    command TEXT NOT NULL,
    response TEXT,
    machine_id TEXT,
    timestamp INTEGER DEFAULT (unixepoch()),
    session_id TEXT,
    context TEXT, -- JSON com contexto da conversa
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
);

-- Histórico por máquina
CREATE TABLE history_machine (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    machine_id TEXT NOT NULL,
    command TEXT NOT NULL,
    response TEXT,
    user_id TEXT,
    timestamp INTEGER DEFAULT (unixepoch()),
    error_code INTEGER,
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
);

-- Índices para performance
CREATE INDEX idx_history_global_timestamp ON history_global(timestamp DESC);
CREATE INDEX idx_history_user_lookup ON history_user(user_id, timestamp DESC);
CREATE INDEX idx_history_machine_lookup ON history_machine(machine_id, timestamp DESC);

-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
    command,
    response,
    tags,
    content=history_global
);

-- Cache de comandos frequentes
CREATE TABLE command_cache (
    command_hash TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    output TEXT,
    workspace_id TEXT,
    last_executed INTEGER,
    execution_count INTEGER DEFAULT 1,
    avg_execution_time_ms INTEGER
);
```

### Fase 2: Módulos JavaScript

#### 2.1 Gerenciador de Identidade de Máquina

```javascript
// libs/machine-identity.ts
import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default class MachineIdentityManager {
    constructor() {
        this.cacheFile = path.join(os.homedir(), '.mcp-terminal', 'machine-id');
    }

    async getMachineId() {
        // Tentar cache primeiro
        if (existsSync(this.cacheFile)) {
            return await fs.readFile(this.cacheFile, 'utf8');
        }

        // Gerar novo ID
        const id = await this.generateMachineId();

        // Salvar em cache
        await this.ensureDirectory();
        await fs.writeFile(this.cacheFile, id);

        return id;
    }

    async generateMachineId() {
        const components = [];

        // 1. Hostname
        components.push(os.hostname());

        // 2. MAC Address principal
        const mac = await this.getPrimaryMacAddress();
        if (mac) components.push(mac);

        // 3. System machine-id (Linux)
        try {
            if (existsSync('/etc/machine-id')) {
                const machineId = await fs.readFile('/etc/machine-id', 'utf8');
                components.push(machineId.trim());
            }
        } catch (error) {
            // Fallback: usar timestamp
            components.push(Date.now().toString());
        }

        // Gerar hash SHA256
        const hash = crypto.createHash('sha256');
        hash.update(components.join('-'));
        return hash.digest('hex');
    }

    async getPrimaryMacAddress() {
        try {
            const interfaces = os.networkInterfaces();
            for (const [name, ifaces] of Object.entries(interfaces)) {
                // Pular loopback
                if (name === 'lo') continue;

                for (const iface of ifaces) {
                    if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
                        return iface.mac;
                    }
                }
            }
        } catch (error) {
            return null;
        }
    }

    async registerMachine(tursoClient) {
        const machineId = await this.getMachineId();
        const osInfo = {
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMem: os.totalmem()
        };

        await tursoClient.execute({
            sql: `INSERT INTO machines (machine_id, hostname, os_info, first_seen, last_seen)
                  VALUES (?, ?, ?, unixepoch(), unixepoch())
                  ON CONFLICT(machine_id) DO UPDATE SET
                    last_seen = unixepoch(),
                    hostname = excluded.hostname`,
            args: [machineId, os.hostname(), JSON.stringify(osInfo)]
        });

        return machineId;
    }
}
```

#### 2.2 Cliente Turso

```javascript
// libs/turso-client.ts
import { createClient } from '@libsql/client';

export default class TursoHistoryClient {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.machineId = null;
        this.userId = null;
        this.mode = config.history_mode || 'global';
    }

    async initialize() {
        // Criar cliente Turso
        this.client = createClient({
            url: this.config.turso_url,
            authToken: this.config.turso_token,
            syncUrl: this.config.turso_sync_url,
            syncInterval: this.config.turso_sync_interval || 60
        });

        // Registrar máquina
        const machineManager = new MachineIdentityManager();
        this.machineId = await machineManager.registerMachine(this.client);
    }

    async setUser(username) {
        if (!username) {
            this.userId = null;
            this.mode = 'global';
            return;
        }

        const result = await this.client.execute({
            sql: 'SELECT id FROM users WHERE username = ?',
            args: [username]
        });

        if (result.rows.length > 0) {
            this.userId = result.rows[0].id;
            this.mode = 'user';
        } else {
            throw new Error(`User ${username} not found. Create with: ipcom-chat user create --username ${username}`);
        }
    }

    async saveCommand(command, response, metadata = {}) {
        const timestamp = Date.now();

        // Salvar baseado no modo
        switch (this.mode) {
            case 'global':
                await this.saveToGlobal(command, response, metadata);
                break;
            case 'user':
                await this.saveToUser(command, response, metadata);
                break;
            case 'machine':
                await this.saveToMachine(command, response, metadata);
                break;
            case 'hybrid':
                // Salvar em múltiplos lugares
                await Promise.all([
                    this.saveToGlobal(command, response, metadata),
                    this.userId && this.saveToUser(command, response, metadata),
                    this.saveToMachine(command, response, metadata)
                ]);
                break;
        }
    }

    async saveToGlobal(command, response, metadata) {
        await this.client.execute({
            sql: `INSERT INTO history_global
                  (command, response, machine_id, user_id, timestamp, tokens_used, execution_time_ms, tags)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                command,
                response,
                this.machineId,
                this.userId,
                Date.now(),
                metadata.tokens_used || null,
                metadata.execution_time_ms || null,
                JSON.stringify(metadata.tags || [])
            ]
        });
    }

    async saveToUser(command, response, metadata) {
        if (!this.userId) return;

        await this.client.execute({
            sql: `INSERT INTO history_user
                  (user_id, command, response, machine_id, timestamp, session_id, context)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
                this.userId,
                command,
                response,
                this.machineId,
                Date.now(),
                metadata.session_id || null,
                JSON.stringify(metadata.context || {})
            ]
        });
    }

    async saveToMachine(command, response, metadata) {
        await this.client.execute({
            sql: `INSERT INTO history_machine
                  (machine_id, command, response, user_id, timestamp, error_code)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [
                this.machineId,
                command,
                response,
                this.userId,
                Date.now(),
                metadata.error_code || null
            ]
        });
    }

    async getHistory(limit = 100) {
        let sql, args;

        switch (this.mode) {
            case 'global':
                sql = `SELECT * FROM history_global
                       ORDER BY timestamp DESC LIMIT ?`;
                args = [limit];
                break;
            case 'user':
                sql = `SELECT * FROM history_user
                       WHERE user_id = ?
                       ORDER BY timestamp DESC LIMIT ?`;
                args = [this.userId, limit];
                break;
            case 'machine':
                sql = `SELECT * FROM history_machine
                       WHERE machine_id = ?
                       ORDER BY timestamp DESC LIMIT ?`;
                args = [this.machineId, limit];
                break;
            case 'hybrid':
                // Combinar múltiplas fontes com UNION
                sql = `
                    SELECT 'global' as source, command, response, timestamp FROM history_global
                    WHERE timestamp > unixepoch('now', '-7 days')
                    UNION ALL
                    SELECT 'user' as source, command, response, timestamp FROM history_user
                    WHERE user_id = ? AND timestamp > unixepoch('now', '-7 days')
                    UNION ALL
                    SELECT 'machine' as source, command, response, timestamp FROM history_machine
                    WHERE machine_id = ? AND timestamp > unixepoch('now', '-7 days')
                    ORDER BY timestamp DESC LIMIT ?`;
                args = [this.userId, this.machineId, limit];
                break;
        }

        const result = await this.client.execute({ sql, args });
        return result.rows;
    }

    async searchHistory(query, limit = 20) {
        // Busca com FTS5
        const sql = `
            SELECT h.*, snippet(history_fts, -1, '<mark>', '</mark>', '...', 32) as snippet
            FROM history_global h
            JOIN history_fts ON h.id = history_fts.rowid
            WHERE history_fts MATCH ?
            ORDER BY rank
            LIMIT ?`;

        const result = await this.client.execute({
            sql,
            args: [query, limit]
        });

        return result.rows;
    }
}
```

#### 2.3 Gerenciador de Usuários

```javascript
// libs/user-manager.ts
export default class UserManager {
    constructor(tursoClient) {
        this.client = tursoClient;
    }

    async createUser(username, name, email) {
        // Validar entrada
        if (!username || !name) {
            throw new Error('Username and name are required');
        }

        // Verificar se usuário já existe
        const existing = await this.client.execute({
            sql: 'SELECT id FROM users WHERE username = ?',
            args: [username]
        });

        if (existing.rows.length > 0) {
            throw new Error(`User ${username} already exists`);
        }

        // Criar usuário
        await this.client.execute({
            sql: `INSERT INTO users (username, name, email)
                  VALUES (?, ?, ?)`,
            args: [username, name, email || null]
        });

        console.log(`User ${username} created successfully`);
        return { username, name, email };
    }

    async getUser(username) {
        const result = await this.client.execute({
            sql: 'SELECT * FROM users WHERE username = ?',
            args: [username]
        });

        if (result.rows.length === 0) {
            throw new Error(`User ${username} not found`);
        }

        return result.rows[0];
    }

    async updateUser(username, updates) {
        const fields = [];
        const values = [];

        if (updates.name) {
            fields.push('name = ?');
            values.push(updates.name);
        }
        if (updates.email !== undefined) {
            fields.push('email = ?');
            values.push(updates.email);
        }

        if (fields.length === 0) {
            throw new Error('No fields to update');
        }

        fields.push('updated_at = unixepoch()');
        values.push(username);

        await this.client.execute({
            sql: `UPDATE users SET ${fields.join(', ')} WHERE username = ?`,
            args: values
        });

        console.log(`User ${username} updated successfully`);
    }

    async deleteUser(username) {
        // Soft delete
        await this.client.execute({
            sql: `UPDATE users SET is_active = 0, updated_at = unixepoch()
                  WHERE username = ?`,
            args: [username]
        });

        console.log(`User ${username} deactivated`);
    }

    async listUsers(active = true) {
        const sql = active
            ? 'SELECT username, name, email FROM users WHERE is_active = 1 ORDER BY name'
            : 'SELECT username, name, email, is_active FROM users ORDER BY name';

        const result = await this.client.execute(sql);
        return result.rows;
    }

    async getUserStats(username) {
        const userId = (await this.getUser(username)).id;

        const stats = await this.client.execute({
            sql: `
                SELECT
                    COUNT(*) as total_commands,
                    COUNT(DISTINCT DATE(timestamp/1000, 'unixepoch')) as active_days,
                    MAX(timestamp) as last_command
                FROM history_user
                WHERE user_id = ?`,
            args: [userId]
        });

        return stats.rows[0];
    }
}
```

### Fase 3: Integração com Sistema Existente

#### 3.1 Modificação do mcp-interactive.js

```javascript
// Adicionar no início do arquivo
import TursoHistoryClient from './libs/turso-client.ts';
import UserManager from './libs/user-manager.ts';
import MachineIdentityManager from './libs/machine-identity.ts';

// Parse argumentos de linha de comando
const args = process.argv.slice(2);
const userFlag = args.find(arg => arg.startsWith('--user='));
const username = userFlag ? userFlag.split('=')[1] : null;
const localMode = args.includes('--local');
const hybridMode = args.includes('--hybrid');

// Determinar modo de histórico
let historyMode = 'global';
if (username) historyMode = 'user';
else if (localMode) historyMode = 'machine';
else if (hybridMode) historyMode = 'hybrid';

// Inicializar cliente Turso
const tursoClient = new TursoHistoryClient({
    turso_url: process.env.TURSO_DATABASE_URL || config.turso_url,
    turso_token: process.env.TURSO_AUTH_TOKEN || config.turso_token,
    turso_sync_url: process.env.TURSO_SYNC_URL || config.turso_sync_url,
    history_mode: historyMode
});

await tursoClient.initialize();

// Se modo usuário, configurar usuário
if (username) {
    await tursoClient.setUser(username);
}

// Modificar método processInput para salvar no Turso
async processInput(input) {
    // ... código existente ...

    // Salvar no Turso além do histórico local
    if (this.tursoClient) {
        await this.tursoClient.saveCommand(input, response, {
            tokens_used: tokensUsed,
            execution_time_ms: executionTime,
            session_id: this.sessionId,
            context: this.contextManager.getContext()
        });
    }

    // ... resto do código ...
}
```

#### 3.2 Interface CLI para Gerenciamento

```javascript
// ipcom-chat-cli.js - Novo arquivo para comandos de gerenciamento
#!/usr/bin/env node

import { Command } from 'commander';
import TursoHistoryClient from './libs/turso-client.ts';
import UserManager from './libs/user-manager.ts';
import MachineIdentityManager from './libs/machine-identity.ts';

const program = new Command();

program
    .name('ipcom-chat')
    .description('IPCOM Chat - Terminal Assistant with Distributed History')
    .version('2.0.0');

// Subcomando: user
const userCmd = program.command('user');

userCmd
    .command('create')
    .description('Create a new user')
    .requiredOption('--username <username>', 'Username for login')
    .requiredOption('--name <name>', 'Full name')
    .option('--email <email>', 'Email address')
    .action(async (options) => {
        const client = await initTursoClient();
        const userManager = new UserManager(client);
        await userManager.createUser(options.username, options.name, options.email);
    });

userCmd
    .command('list')
    .description('List all users')
    .option('--all', 'Include inactive users')
    .action(async (options) => {
        const client = await initTursoClient();
        const userManager = new UserManager(client);
        const users = await userManager.listUsers(!options.all);
        console.table(users);
    });

userCmd
    .command('update <username>')
    .description('Update user information')
    .option('--name <name>', 'New name')
    .option('--email <email>', 'New email')
    .action(async (username, options) => {
        const client = await initTursoClient();
        const userManager = new UserManager(client);
        await userManager.updateUser(username, options);
    });

userCmd
    .command('delete <username>')
    .description('Delete (deactivate) a user')
    .action(async (username) => {
        const client = await initTursoClient();
        const userManager = new UserManager(client);
        await userManager.deleteUser(username);
    });

userCmd
    .command('stats <username>')
    .description('Show user statistics')
    .action(async (username) => {
        const client = await initTursoClient();
        const userManager = new UserManager(client);
        const stats = await userManager.getUserStats(username);
        console.table(stats);
    });

// Subcomando: history
const historyCmd = program.command('history');

historyCmd
    .command('stats')
    .description('Show history statistics')
    .option('--user <username>', 'Filter by user')
    .option('--days <days>', 'Last N days', '30')
    .action(async (options) => {
        const client = await initTursoClient();
        // Implementar estatísticas
        console.log('History statistics...');
    });

historyCmd
    .command('search <query>')
    .description('Search in history')
    .option('--limit <limit>', 'Max results', '20')
    .action(async (query, options) => {
        const client = await initTursoClient();
        const results = await client.searchHistory(query, parseInt(options.limit));
        results.forEach(r => {
            console.log(`[${new Date(r.timestamp).toLocaleString()}] ${r.command}`);
            if (r.snippet) console.log(`  ${r.snippet}`);
        });
    });

historyCmd
    .command('export')
    .description('Export history')
    .option('--format <format>', 'Output format (json|csv)', 'json')
    .option('--output <file>', 'Output file')
    .action(async (options) => {
        const client = await initTursoClient();
        const history = await client.getHistory(10000);

        if (options.format === 'json') {
            const output = JSON.stringify(history, null, 2);
            if (options.output) {
                await fs.writeFile(options.output, output);
            } else {
                console.log(output);
            }
        }
    });

// Subcomando: machine
const machineCmd = program.command('machine');

machineCmd
    .command('register')
    .description('Register current machine')
    .action(async () => {
        const client = await initTursoClient();
        const machineManager = new MachineIdentityManager();
        const id = await machineManager.registerMachine(client);
        console.log(`Machine registered: ${id}`);
    });

machineCmd
    .command('list')
    .description('List all registered machines')
    .action(async () => {
        const client = await initTursoClient();
        const result = await client.execute({
            sql: 'SELECT machine_id, hostname, last_seen FROM machines ORDER BY last_seen DESC'
        });
        console.table(result.rows);
    });

// Comando padrão - iniciar modo interativo
program
    .option('--user <username>', 'Use specific user profile')
    .option('--local', 'Use local machine history only')
    .option('--hybrid', 'Use hybrid mode (all histories)')
    .action(async (options) => {
        // Redirecionar para mcp-interactive.js com flags apropriadas
        const { spawn } = await import('child_process');
        const args = ['mcp-interactive.js'];

        if (options.user) args.push(`--user=${options.user}`);
        if (options.local) args.push('--local');
        if (options.hybrid) args.push('--hybrid');

        spawn('node', args, { stdio: 'inherit' });
    });

// Helper para inicializar cliente Turso
async function initTursoClient() {
    const config = await loadConfig();
    const client = new TursoHistoryClient({
        turso_url: process.env.TURSO_DATABASE_URL || config.turso_url,
        turso_token: process.env.TURSO_AUTH_TOKEN || config.turso_token
    });
    await client.initialize();
    return client.client;
}

program.parse();
```

### Fase 4: Sistema de Migração e Fallback

#### 4.1 Migração do Histórico Existente

```javascript
// libs/migrate-history.ts
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

export default class HistoryMigrator {
    constructor(tursoClient, machineId) {
        this.tursoClient = tursoClient;
        this.machineId = machineId;
        this.historyFile = path.join(os.homedir(), '.mcp-terminal', 'history.json');
        this.backupFile = path.join(os.homedir(), '.mcp-terminal', 'history.backup.json');
    }

    async migrateFromLocal() {
        if (!existsSync(this.historyFile)) {
            console.log('No local history found to migrate');
            return;
        }

        console.log('Starting migration of local history to Turso...');

        try {
            // Fazer backup primeiro
            await this.createBackup();

            // Ler histórico local
            const data = await fs.readFile(this.historyFile, 'utf8');
            const history = JSON.parse(data);

            let entries = [];
            if (history.version === '1.0' && Array.isArray(history.entries)) {
                entries = history.entries;
            } else if (Array.isArray(history)) {
                entries = history;
            }

            console.log(`Found ${entries.length} entries to migrate`);

            // Migrar em lotes
            const batchSize = 100;
            for (let i = 0; i < entries.length; i += batchSize) {
                const batch = entries.slice(i, i + batchSize);
                await this.migrateBatch(batch);
                console.log(`Migrated ${Math.min(i + batchSize, entries.length)}/${entries.length} entries`);
            }

            console.log('Migration completed successfully');

            // Marcar como migrado
            await this.markAsMigrated();

        } catch (error) {
            console.error('Migration failed:', error);
            console.log('Backup preserved at:', this.backupFile);
            throw error;
        }
    }

    async migrateBatch(entries) {
        const tx = await this.tursoClient.transaction();

        try {
            for (const entry of entries) {
                await tx.execute({
                    sql: `INSERT INTO history_machine (machine_id, command, response, timestamp)
                          VALUES (?, ?, ?, ?)`,
                    args: [
                        this.machineId,
                        entry.command || entry,
                        entry.response || null,
                        entry.timestamp || Date.now()
                    ]
                });
            }
            await tx.commit();
        } catch (error) {
            await tx.rollback();
            throw error;
        }
    }

    async createBackup() {
        await fs.copyFile(this.historyFile, this.backupFile);
        console.log(`Backup created: ${this.backupFile}`);
    }

    async markAsMigrated() {
        const migrationFile = path.join(os.homedir(), '.mcp-terminal', '.migrated');
        await fs.writeFile(migrationFile, new Date().toISOString());
    }

    async needsMigration() {
        const migrationFile = path.join(os.homedir(), '.mcp-terminal', '.migrated');
        return !existsSync(migrationFile);
    }
}
```

#### 4.2 Sistema de Fallback

```javascript
// libs/fallback-handler.js
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export default class FallbackHandler {
    constructor(tursoClient, localHistory) {
        this.tursoClient = tursoClient;
        this.localHistory = localHistory;
        this.retryQueueFile = path.join(os.homedir(), '.mcp-terminal', 'retry-queue.json');
        this.retryQueue = [];
        this.retryInterval = 60000; // 1 minuto
        this.maxRetries = 5;
    }

    async initialize() {
        await this.loadRetryQueue();
        this.startRetryWorker();
    }

    async saveWithFallback(data) {
        try {
            // Tentar salvar no Turso
            await this.tursoClient.saveCommand(
                data.command,
                data.response,
                data.metadata
            );
            return { success: true, location: 'turso' };
        } catch (error) {
            console.error('Failed to save to Turso:', error.message);

            // Fallback para arquivo local
            try {
                await this.localHistory.add(data.command);

                // Adicionar à fila de retry
                await this.addToRetryQueue(data);

                return { success: true, location: 'local' };
            } catch (localError) {
                console.error('Failed to save locally:', localError.message);
                return { success: false, error: localError.message };
            }
        }
    }

    async addToRetryQueue(data) {
        const item = {
            ...data,
            retryCount: 0,
            firstAttempt: Date.now(),
            lastAttempt: null
        };

        this.retryQueue.push(item);
        await this.saveRetryQueue();
    }

    async loadRetryQueue() {
        try {
            if (existsSync(this.retryQueueFile)) {
                const data = await fs.readFile(this.retryQueueFile, 'utf8');
                this.retryQueue = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to load retry queue:', error);
            this.retryQueue = [];
        }
    }

    async saveRetryQueue() {
        try {
            await fs.writeFile(
                this.retryQueueFile,
                JSON.stringify(this.retryQueue, null, 2)
            );
        } catch (error) {
            console.error('Failed to save retry queue:', error);
        }
    }

    startRetryWorker() {
        setInterval(async () => {
            await this.processRetryQueue();
        }, this.retryInterval);
    }

    async processRetryQueue() {
        if (this.retryQueue.length === 0) return;

        const toRetry = [...this.retryQueue];
        this.retryQueue = [];

        for (const item of toRetry) {
            if (item.retryCount >= this.maxRetries) {
                console.log(`Dropping item after ${this.maxRetries} retries:`, item.command);
                continue;
            }

            try {
                await this.tursoClient.saveCommand(
                    item.command,
                    item.response,
                    item.metadata
                );
                console.log('Successfully synced queued command:', item.command);
            } catch (error) {
                item.retryCount++;
                item.lastAttempt = Date.now();
                this.retryQueue.push(item);
            }
        }

        if (this.retryQueue.length > 0) {
            await this.saveRetryQueue();
        }
    }

    async getQueueStatus() {
        return {
            queueSize: this.retryQueue.length,
            oldestItem: this.retryQueue[0]?.firstAttempt,
            totalRetries: this.retryQueue.reduce((sum, item) => sum + item.retryCount, 0)
        };
    }
}
```

### Fase 5: Funcionalidades Avançadas

#### 5.1 Busca Inteligente Híbrida

```javascript
// libs/hybrid-search.js
export default class HybridSearch {
    constructor(tursoClient) {
        this.client = tursoClient;
    }

    async searchAcrossHistories(query, username = null, options = {}) {
        const weights = options.weights || {
            global: 0.3,
            user: 0.5,
            machine: 0.2
        };

        const [globalResults, userResults, machineResults] = await Promise.all([
            this.searchGlobal(query, weights.global),
            username ? this.searchUser(username, query, weights.user) : [],
            this.searchMachine(query, weights.machine)
        ]);

        return this.rankResults([
            ...globalResults,
            ...userResults,
            ...machineResults
        ]);
    }

    async searchGlobal(query, weight) {
        const results = await this.client.execute({
            sql: `SELECT *, ? as weight, 'global' as source
                  FROM history_global
                  WHERE command LIKE ? OR response LIKE ?
                  ORDER BY timestamp DESC LIMIT 50`,
            args: [weight, `%${query}%`, `%${query}%`]
        });
        return results.rows;
    }

    async searchUser(username, query, weight) {
        const userId = await this.getUserId(username);
        const results = await this.client.execute({
            sql: `SELECT *, ? as weight, 'user' as source
                  FROM history_user
                  WHERE user_id = ? AND (command LIKE ? OR response LIKE ?)
                  ORDER BY timestamp DESC LIMIT 50`,
            args: [weight, userId, `%${query}%`, `%${query}%`]
        });
        return results.rows;
    }

    async searchMachine(query, weight) {
        const machineId = await this.getMachineId();
        const results = await this.client.execute({
            sql: `SELECT *, ? as weight, 'machine' as source
                  FROM history_machine
                  WHERE machine_id = ? AND (command LIKE ? OR response LIKE ?)
                  ORDER BY timestamp DESC LIMIT 50`,
            args: [weight, machineId, `%${query}%`, `%${query}%`]
        });
        return results.rows;
    }

    rankResults(results) {
        // Calcular score baseado em:
        // - Peso da fonte
        // - Recência (timestamp)
        // - Relevância (match quality)

        return results
            .map(r => ({
                ...r,
                score: this.calculateScore(r)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 20);
    }

    calculateScore(result) {
        const recencyScore = this.getRecencyScore(result.timestamp);
        const sourceScore = result.weight || 0.5;

        return recencyScore * 0.5 + sourceScore * 0.5;
    }

    getRecencyScore(timestamp) {
        const now = Date.now();
        const age = now - timestamp;
        const dayInMs = 24 * 60 * 60 * 1000;

        if (age < dayInMs) return 1.0;           // Hoje
        if (age < 7 * dayInMs) return 0.8;      // Esta semana
        if (age < 30 * dayInMs) return 0.6;     // Este mês
        if (age < 90 * dayInMs) return 0.4;     // Últimos 3 meses
        return 0.2;                              // Mais antigo
    }
}
```

#### 5.2 Sistema de Sugestões

```javascript
// libs/suggestion-engine.js
export default class SuggestionEngine {
    constructor(tursoClient) {
        this.client = tursoClient;
    }

    async getSuggestions(currentCommand, context = {}) {
        // 1. Buscar comandos similares que funcionaram
        const similar = await this.findSimilarSuccessfulCommands(currentCommand);

        // 2. Buscar padrões comuns após este comando
        const patterns = await this.findCommandPatterns(currentCommand);

        // 3. Buscar soluções da comunidade
        const community = await this.findCommunitySolutions(currentCommand);

        return {
            similar,
            nextCommands: patterns,
            communitySolutions: community
        };
    }

    async findSimilarSuccessfulCommands(command) {
        // Buscar comandos com palavras-chave similares
        const keywords = this.extractKeywords(command);

        const results = await this.client.execute({
            sql: `
                SELECT command, response, COUNT(*) as usage_count,
                       AVG(CASE WHEN error_code = 0 THEN 1 ELSE 0 END) as success_rate
                FROM history_global
                WHERE command LIKE ?
                GROUP BY command
                HAVING success_rate > 0.8
                ORDER BY usage_count DESC
                LIMIT 5`,
            args: [`%${keywords[0]}%`]
        });

        return results.rows;
    }

    async findCommandPatterns(command) {
        // Encontrar que comandos geralmente seguem este
        const results = await this.client.execute({
            sql: `
                WITH command_pairs AS (
                    SELECT
                        h1.command as cmd1,
                        h2.command as cmd2,
                        h2.timestamp - h1.timestamp as time_diff
                    FROM history_global h1
                    JOIN history_global h2 ON h2.machine_id = h1.machine_id
                    WHERE h1.command LIKE ?
                      AND h2.timestamp > h1.timestamp
                      AND h2.timestamp - h1.timestamp < 300000  -- 5 minutos
                )
                SELECT cmd2, COUNT(*) as frequency
                FROM command_pairs
                GROUP BY cmd2
                ORDER BY frequency DESC
                LIMIT 3`,
            args: [`%${command}%`]
        });

        return results.rows;
    }

    async findCommunitySolutions(command) {
        // Buscar soluções votadas pela comunidade
        const keywords = this.extractKeywords(command);

        const results = await this.client.execute({
            sql: `
                SELECT DISTINCT command, response,
                       COUNT(DISTINCT user_id) as users_count,
                       COUNT(DISTINCT machine_id) as machines_count
                FROM history_global
                WHERE command LIKE ? OR response LIKE ?
                GROUP BY command, response
                HAVING users_count > 2
                ORDER BY users_count DESC, machines_count DESC
                LIMIT 3`,
            args: [`%${keywords[0]}%`, `%${keywords[0]}%`]
        });

        return results.rows;
    }

    extractKeywords(command) {
        // Extrair palavras-chave relevantes
        return command
            .toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3)
            .filter(word => !['sudo', 'echo', 'grep', 'awk'].includes(word));
    }
}
```

## Cronograma de Implementação

### Semana 1: Fundação
- [ ] Setup Turso (criar DB, configurar replicas)
- [ ] Implementar machine-identity.ts
- [ ] Implementar turso-client.ts básico
- [ ] Criar schema inicial no Turso
- [ ] Testes unitários dos módulos

### Semana 2: Integração
- [ ] Integrar Turso com mcp-interactive.js
- [ ] Implementar user-manager.ts
- [ ] Criar comandos CLI (user, history, machine)
- [ ] Sistema de migração de histórico existente
- [ ] Testes de integração

### Semana 3: Robustez
- [ ] Sistema de fallback e retry
- [ ] Modo offline com embedded replica
- [ ] Sincronização e resolução de conflitos
- [ ] Performance tuning (índices, cache)
- [ ] Testes de stress (300 máquinas simultâneas)

### Semana 4: Rollout
- [ ] Deploy em ambiente de teste (10 máquinas)
- [ ] Monitoramento e métricas
- [ ] Documentação completa
- [ ] Training para equipe
- [ ] Rollout gradual (10 → 50 → 150 → 300 máquinas)

## Configuração de Produção

### Variáveis de Ambiente

```bash
# .env.production
TURSO_DATABASE_URL=libsql://ipcom-history-ipcom.turso.io
TURSO_AUTH_TOKEN=eyJhbGc...
TURSO_SYNC_URL=libsql://ipcom-history-ipcom.turso.io
TURSO_SYNC_INTERVAL=60
HISTORY_MODE=hybrid # global|user|machine|hybrid
FALLBACK_ENABLED=true
CACHE_TTL=3600
MAX_RETRIES=5
RETRY_INTERVAL=60000
```

### Configuração do Sistema

```javascript
// config/turso.config.js
export default {
    // Database principal
    primary: {
        region: 'gru',  // São Paulo
        url: process.env.TURSO_DATABASE_URL
    },

    // Replicas para redundância
    replicas: [
        { region: 'iad' },  // Virginia
        { region: 'ams' }   // Amsterdam
    ],

    // Embedded replicas para modo offline
    embedded: {
        enabled: true,
        syncInterval: 60,  // segundos
        conflictResolution: 'last-write-wins'
    },

    // Performance
    performance: {
        batchSize: 100,
        connectionPool: 10,
        queryTimeout: 5000,
        cacheEnabled: true,
        cacheTTL: 3600
    },

    // Fallback
    fallback: {
        enabled: true,
        retryInterval: 60000,
        maxRetries: 5,
        queueFile: '~/.mcp-terminal/retry-queue.json'
    }
};
```

## Métricas de Sucesso

### KPIs Técnicos
- **Latência de escrita**: < 50ms (p95)
- **Latência de leitura**: < 20ms (p95)
- **Taxa de sincronização**: > 99.9%
- **Disponibilidade**: > 99.95%
- **Uso de storage**: < 10GB para 1M comandos

### KPIs de Negócio
- **Adoção**: 80% das máquinas em 30 dias
- **Uso de histórico compartilhado**: +50% em soluções
- **Tempo de resolução**: -30% com conhecimento compartilhado
- **Satisfação da equipe**: NPS > 8

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Turso fora do ar | Baixa | Alto | Fallback local + retry queue |
| Latência alta | Média | Médio | Cache local + embedded replicas |
| Conflitos de sync | Média | Baixo | Timestamp resolution + merge strategy |
| Adoção baixa | Baixa | Alto | Training + benefícios visíveis |
| Custos elevados | Baixa | Médio | Monitoramento + alertas de uso |
| Perda de dados | Baixa | Alto | Backups automáticos + replicas |

## Testes Críticos

### Testes de Unidade
```javascript
// tests/turso-client.test.js
describe('TursoHistoryClient', () => {
    test('should save to global history', async () => {});
    test('should handle connection failures', async () => {});
    test('should queue offline commands', async () => {});
    test('should sync when online', async () => {});
});
```

### Testes de Carga
```javascript
// tests/load-test.js
// Simular 300 máquinas salvando simultaneamente
const workers = [];
for (let i = 0; i < 300; i++) {
    workers.push(simulateMachine(i));
}
await Promise.all(workers);
// Verificar: latência < 100ms, success rate > 99%
```

### Testes de Resiliência
- Desconexão de rede durante operação
- Turso database indisponível
- Conflitos de sincronização
- Migração de dados corrompidos
- Fallback para modo local
- Recovery após falhas

## Monitoramento

```javascript
// libs/monitoring.js
export default class TursoMonitor {
    async collectMetrics() {
        return {
            // Latência
            writeLatency: await this.measureWriteLatency(),
            readLatency: await this.measureReadLatency(),

            // Throughput
            commandsPerMinute: await this.getCommandRate(),

            // Disponibilidade
            tursoHealth: await this.checkTursoHealth(),
            syncStatus: await this.getSyncStatus(),

            // Storage
            dbSize: await this.getDatabaseSize(),
            cacheHitRate: await this.getCacheHitRate(),

            // Fila de retry
            retryQueueSize: await this.getRetryQueueSize(),
            failedSyncs: await this.getFailedSyncCount()
        };
    }

    async sendAlerts(metrics) {
        // Alertas críticos
        if (metrics.writeLatency > 100) {
            this.alert('High write latency detected');
        }

        if (metrics.tursoHealth === false) {
            this.alert('Turso database unreachable');
        }

        if (metrics.retryQueueSize > 1000) {
            this.alert('Large retry queue detected');
        }
    }
}
```

## Próximos Passos Imediatos

1. **Criar conta Turso** e database de desenvolvimento
2. **Implementar machine-identity.ts** com testes
3. **Protótipo mínimo** com save/load básico
4. **Validar** com 2-3 máquinas de teste
5. **Iterar** baseado em feedback

## Conclusão

Este plano oferece uma implementação robusta e escalável do histórico distribuído usando Turso, com foco em:

- ✅ **Compartilhamento de conhecimento** entre equipe
- ✅ **Funcionamento offline/online** transparente
- ✅ **Gestão simples de usuários** sem senha
- ✅ **Escalabilidade** para 300+ máquinas
- ✅ **Fallback e resiliência** contra falhas
- ✅ **Métricas e monitoramento** em tempo real
- ✅ **Migração suave** do sistema existente
- ✅ **Busca inteligente** híbrida
- ✅ **Sugestões baseadas** em comunidade

O sistema manterá compatibilidade com o histórico local existente enquanto adiciona capacidades distribuídas poderosas, permitindo que a equipe de suporte compartilhe conhecimento e resolva problemas mais rapidamente.
