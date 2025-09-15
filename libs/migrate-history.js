#!/usr/bin/env node

/**
 * History Migration Tool
 * Migrates local history.json to Turso database
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import readline from 'readline/promises';
import TursoHistoryClient from './turso-client.js';
import MachineIdentityManager from './machine-identity.js';

class HistoryMigrator {
    constructor() {
        this.configDir = path.join(os.homedir(), '.mcp-terminal');
        this.historyFile = path.join(this.configDir, 'history.json');
        this.tursoConfigFile = path.join(this.configDir, 'turso-config.json');
        this.migrationLogFile = path.join(this.configDir, 'migration.log');
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async checkPrerequisites() {
        // Check if Turso is configured
            if (!existsSync(this.tursoConfigFile)) {
            console.error(chalk.red('❌ Turso não configurado.'));
                console.log(chalk.yellow('Execute primeiro: node libs/turso-setup.js'));
            return false;
        }

        // Check if local history exists
            if (!existsSync(this.historyFile)) {
                console.log(chalk.yellow('⚠️  Nenhum histórico local encontrado.'));
            return false;
        }

        return true;
    }

    async loadLocalHistory() {
            try {
            const data = await fs.readFile(this.historyFile, 'utf8');
            return JSON.parse(data);
            } catch (error) {
            console.error(chalk.red(`❌ Erro ao ler histórico local: ${error.message}`));
            return null;
        }
    }

    async initializeTurso() {
            try {
            const config = JSON.parse(await fs.readFile(this.tursoConfigFile, 'utf8'));
            const client = new TursoHistoryClient({
                ...config,
                debug: false
            });
            await client.initialize();
            return client;
            } catch (error) {
            console.error(chalk.red(`❌ Erro ao conectar ao Turso: ${error.message}`));
            return null;
        }
    }

    async migrate() {
            try {
                console.log(chalk.cyan('\n═══ Migração de Histórico Local para Turso ═══\n'));

            // Check prerequisites
                if (!await this.checkPrerequisites()) {
                return;
            }

            // Load local history
                const localHistory = await this.loadLocalHistory();
                if (!localHistory || localHistory.length === 0) {
                    console.log(chalk.yellow('Histórico local vazio.'));
                return;
            }

            console.log(chalk.white(`📊 Encontrados ${localHistory.length} comandos no histórico local.`));

        // Ask for migration mode
            console.log(chalk.cyan('\nComo você deseja migrar o histórico?\n'));
            console.log('1. Como comandos globais (visíveis para todos)');
            console.log('2. Como comandos da máquina local');
            console.log('3. Associar a um usuário específico');
            console.log('4. Cancelar migração\n');

            const choice = await this.rl.question('Escolha uma opção (1-4): ');

        let mode = 'global';
        let username = null;

        switch (choice) {
            case '1':
                mode = 'global';
                break;
            case '2':
                mode = 'machine';
                break;
            case '3':
                username = await this.rl.question('Username do usuário: ');
                    if (!username) {
                        console.log(chalk.red('Username inválido.'));
                    return;
                }
                mode = 'user';
                break;
            case '4':
                    console.log(chalk.yellow('Migração cancelada.'));
                return;
            default:
                    console.log(chalk.red('Opção inválida.'));
                return;
        }

            // Initialize Turso client
                const tursoClient = await this.initializeTurso();
                if (!tursoClient) {
                return;
            }

            // Set mode and user if applicable
            if (username) {
            await tursoClient.setUser(username);
        }

            // Get machine info
            const machineManager = new MachineIdentityManager();
            const machineInfo = await machineManager.getMachineInfo();

            // Start migration
            console.log(chalk.cyan('\n🚀 Iniciando migração...\n'));

            let migrated = 0;
        let failed = 0;
            const errors = [];

            for (const entry of localHistory) {
                try {
                // Prepare command data
                    const commandData = {
                    command: entry.command || entry,
                    response: entry.response || null,
                    timestamp: entry.timestamp || Math.floor(Date.now() / 1000),
                    user_id: username || null,
                    machine_id: machineInfo.machineId,
                    session_id: entry.session || 'migration',
                    execution_time: entry.execution_time || null,
                    exit_code: entry.exit_code || 0,
                    cwd: entry.cwd || null,
                    metadata: {
                        migrated: true,
                        migration_date: new Date().toISOString(),
                        original_source: 'local_history'
                    }
                };

                // Save to appropriate history
                    if (mode === 'global') {
                    await tursoClient.saveToGlobalHistory(
                        commandData.command,
                        commandData.response,
                        commandData
                    );
                } else if (mode === 'machine') {
                    await tursoClient.saveToMachineHistory(
                        commandData.command,
                        commandData.response,
                        commandData
                    );
                } else if (mode === 'user' && username) {
                    await tursoClient.saveToUserHistory(
                        commandData.command,
                        commandData.response,
                        commandData
                    );
                }

                migrated++;

                // Show progress
                    if (migrated % 10 === 0) {
                    process.stdout.write(chalk.green(`✓ ${migrated}/${localHistory.length} comandos migrados\r`));
                }
                } catch (error) {
                failed++;
                errors.push({
                    command: entry.command || entry,
                    error: error.message
                });
            }
        }

            console.log('\n');

            // Show results
            console.log(chalk.green(`✅ Migração concluída!`));
            console.log(chalk.white(`   Migrados: ${migrated} comandos`));
            if (failed > 0) {
                console.log(chalk.red(`   Falhas: ${failed} comandos`));
        }

            // Save migration log
            const migrationLog = {
            date: new Date().toISOString(),
            mode: mode,
            username: username,
            machine_id: machineInfo.machineId,
            total_commands: localHistory.length,
            migrated: migrated,
            failed: failed,
            errors: errors
        };

            try {
            await fs.writeFile(this.migrationLogFile, JSON.stringify(migrationLog, null, 2));
                console.log(chalk.gray(`\nLog de migração salvo em: ${this.migrationLogFile}`));
            } catch (error) {
            console.error(chalk.yellow(`⚠️  Não foi possível salvar o log: ${error.message}`));
        }

            // Ask if should backup and clear local history
            const clearLocal = await this.rl.question('\nDeseja fazer backup e limpar o histórico local? (s/n): ');

            if (clearLocal.toLowerCase() === 's') {
                const backupFile = path.join(this.configDir, `history.backup.${Date.now()}.json`);
            await fs.copyFile(this.historyFile, backupFile);
            await fs.writeFile(this.historyFile, '[]');
                console.log(chalk.green(`✅ Backup salvo em: ${backupFile}`));
                console.log(chalk.green(`✅ Histórico local limpo.`));
        }
        } finally {
            // Garantir que readline sempre seja fechado
                if (this.rl) {
                this.rl.close();
            }
        }
    }

    async verify() {
            try {
                console.log(chalk.cyan('\n═══ Verificação de Migração ═══\n'));

            const tursoClient = await this.initializeTurso();
            if (!tursoClient) {
                return;
            }

            // Get stats
            const stats = await tursoClient.getStats(30);

            console.log(chalk.white('📊 Estatísticas do Turso:'));
            console.log(`   Comandos globais: ${stats.globalCommands}`);
            console.log(`   Comandos da máquina: ${stats.machineCommands}`);
            console.log(`   Máquinas ativas: ${stats.activeMachines}`);
            console.log(`   Usuários ativos: ${stats.activeUsers}`);

            // Check migration log
            if (existsSync(this.migrationLogFile)) {
                const log = JSON.parse(await fs.readFile(this.migrationLogFile, 'utf8'));
                console.log(chalk.cyan('\n📋 Última migração:'));
                console.log(`   Data: ${new Date(log.date).toLocaleString('pt-BR')}`);
                console.log(`   Modo: ${log.mode}`);
                console.log(`   Comandos migrados: ${log.migrated}/${log.total_commands}`);
                if (log.failed > 0) {
                    console.log(chalk.red(`   Falhas: ${log.failed}`));
            }
        }
        } finally {
            // Garantir que readline sempre seja fechado
                if (this.rl) {
                this.rl.close();
            }
        }
    }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        const migrator = new HistoryMigrator();
        const command = process.argv[2];

        if (command === 'verify') {
            await migrator.verify();
        } else {
            await migrator.migrate();
        }
    })();
}

export default HistoryMigrator;