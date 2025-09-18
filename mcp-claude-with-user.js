#!/usr/bin/env node

/**
 * MCP Terminal Assistant - WITH USER SUPPORT
 * Versão de teste que suporta especificar usuário via environment variable
 *
 * Uso:
 *   MCP_USER=testuser node mcp-claude-with-user.js
 */

import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';
import ModelFactory from './ai_models/model_factory.js';
import SystemDetector from './libs/system_detector.js';
import AICommandOrchestrator from './ai_orchestrator.js';
import TursoHistoryClient from './libs/turso-client.js';
import UserManager from './libs/user-manager.js';
import { v4 as uuidv4 } from 'uuid';

// Import the main class
const mainModule = await import('./mcp-claude.js');

// Get the username from environment variable
const username = process.env.MCP_USER;

if (!username) {
    console.log(chalk.yellow('⚠️  Uso: MCP_USER=<username> node mcp-claude-with-user.js'));
    console.log(chalk.gray('Exemplo: MCP_USER=testuser node mcp-claude-with-user.js'));
    process.exit(1);
}

// Create custom class that extends the main one
class MCPClaudeWithUser extends mainModule.default {
    constructor() {
        super();
        this.targetUsername = username;
    }

    async initializeTurso() {
        try {
            const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');
            if (!existsSync(configPath)) {
                console.log(chalk.gray('ℹ️  Turso não configurado (modo offline)'));
                return;
            }

            const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

            // Force user mode for testing
            config.history_mode = 'user';

            this.tursoClient = new TursoHistoryClient(config);
            await this.tursoClient.initialize();
            this.tursoEnabled = true;

            // Get the specified user
            const userManager = new UserManager(this.tursoClient.client);

            try {
                const user = await userManager.getUser(this.targetUsername);
                this.currentUser = user;
                await this.tursoClient.setUser(user.username);

                console.log(chalk.green(`✓ Turso conectado como usuário: ${user.username}`));
                console.log(chalk.gray(`  Nome: ${user.name}`));
                console.log(chalk.gray(`  ID: ${user.id}`));
            } catch (error) {
                console.log(chalk.yellow(`⚠️  Usuário '${this.targetUsername}' não encontrado`));
                console.log(chalk.gray('Crie o usuário primeiro com: ./test-user-turso.sh'));
                this.tursoEnabled = false;
            }
        } catch (error) {
            console.log(chalk.yellow(`⚠️  Turso indisponível: ${error.message}`));
            this.tursoEnabled = false;
        }
    }

    showHeader() {
        console.log();
        console.log(chalk.cyan.bold('MCP Terminal Assistant'));
        console.log(chalk.gray('WITH USER SUPPORT • \\ + Enter for multi-line'));
        console.log(chalk.green(`✨ Logged as: ${this.targetUsername}`));
        console.log();
    }
}

// Main execution
const main = async () => {
    console.log(chalk.blue(`\n🔐 Iniciando com usuário: ${username}\n`));

    const app = new MCPClaudeWithUser();
    await app.start();
};

// Error handling
process.on('uncaughtException', (error) => {
    console.error(chalk.red('\nFatal error:'), error.message);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error(chalk.red('\nUnhandled rejection:'), error.message);
    process.exit(1);
});

// Start
main().catch(error => {
    console.error(chalk.red('Failed to start:'), error.message);
    process.exit(1);
});
export default MCPClaudeWithUser;
