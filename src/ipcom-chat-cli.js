#!/usr/bin/env node

/**
 * IPCOM Chat CLI - Interface de linha de comando para gerenciamento
 * Suporta comandos de usuário, histórico e máquina
 */

import { Command } from 'commander';
import TursoHistoryClient from './libs/turso-client.js';
import UserManager from './libs/user-manager.js';
import MachineIdentityManager from './libs/machine-identity.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { spawn } from 'child_process';

const program = new Command();

program
    .name('ipcom-chat')
    .description('IPCOM Chat - Terminal Assistant with Distributed History')
    .version('2.0.0');

// Helper para inicializar cliente Turso
async function initTursoClient() {
    const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');

    if (!existsSync(configPath)) {
        console.error(chalk.red('❌ Turso não configurado.'));
        console.log(chalk.yellow('Execute primeiro: node libs/turso-client-setup.js'));
        process.exit(1);
    }

    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    const client = new TursoHistoryClient({
        ...config,
        debug: false
    });

    try {
        await client.initialize();
        return client;
    } catch (error) {
        console.error(chalk.red(`❌ Erro ao conectar ao Turso: ${error.message}`));
        process.exit(1);
    }
}

// ==================== COMANDOS DE USUÁRIO ====================

const userCmd = program.command('user');

userCmd
    .command('create')
    .description('Criar novo usuário')
    .requiredOption('--username <username>', 'Nome de usuário para login')
    .requiredOption('--name <name>', 'Nome completo')
    .requiredOption('--email <email>', 'Endereço de email')
    .action(async (options) => {
        const client = await initTursoClient();
        const userManager = new UserManager(client.client);

        try {
            await userManager.createUser(options.username, options.name, options.email);
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

userCmd
    .command('list')
    .description('Listar todos os usuários')
    .option('--all', 'Incluir usuários inativos')
    .action(async (options) => {
        const client = await initTursoClient();
        const userManager = new UserManager(client.client);

        try {
            const users = await userManager.listUsers(!options.all);

            if (users.length === 0) {
                console.log(chalk.yellow('Nenhum usuário cadastrado.'));
                return;
            }

            console.log(chalk.cyan('\n═══ Usuários Cadastrados ═══\n'));
            console.table(users.map(u => ({
                Username: u.username,
                Nome: u.name,
                Email: u.email,
                Criado: new Date(u.created_at * 1000).toLocaleDateString('pt-BR')
            })));
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

userCmd
    .command('update <username>')
    .description('Atualizar informações do usuário')
    .option('--name <name>', 'Novo nome')
    .option('--email <email>', 'Novo email')
    .action(async (username, options) => {
        if (!options.name && !options.email) {
            console.error(chalk.red('❌ Especifique --name ou --email para atualizar'));
            process.exit(1);
        }

        const client = await initTursoClient();
        const userManager = new UserManager(client.client);

        try {
            await userManager.updateUser(username, options);
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

userCmd
    .command('delete <username>')
    .description('Deletar (desativar) usuário')
    .action(async (username) => {
        const client = await initTursoClient();
        const userManager = new UserManager(client.client);

        try {
            await userManager.deleteUser(username);
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

userCmd
    .command('stats <username>')
    .description('Mostrar estatísticas do usuário')
    .action(async (username) => {
        const client = await initTursoClient();
        const userManager = new UserManager(client.client);

        try {
            const stats = await userManager.getUserStats(username);

            console.log(chalk.cyan(`\n═══ Estatísticas de ${username} ═══\n`));
            console.log(`Total de comandos: ${stats.total_commands}`);
            console.log(`Dias ativos: ${stats.active_days}`);

            if (stats.last_command) {
                console.log(`Último comando: ${new Date(stats.last_command * 1000).toLocaleString('pt-BR')}`);
            }
            if (stats.first_command) {
                console.log(`Primeiro comando: ${new Date(stats.first_command * 1000).toLocaleString('pt-BR')}`);
            }

            if (stats.avg_tokens) {
                console.log(`Tokens médios: ${Math.round(stats.avg_tokens)}`);
                console.log(`Total de tokens: ${stats.total_tokens}`);
            }

            if (stats.top_commands && stats.top_commands.length > 0) {
                console.log(chalk.cyan('\nComandos mais usados:'));
                stats.top_commands.forEach((cmd, i) => {
                    console.log(`  ${i + 1}. ${cmd.command} (${cmd.usage_count}x)`);
                });
            }
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

// ==================== COMANDOS DE HISTÓRICO ====================

const historyCmd = program.command('history');

// Comando base para mostrar histórico
historyCmd
    .description('Mostrar histórico de comandos')
    .option('--limit <number>', 'Número de comandos a mostrar', '20')
    .option('-u, --user <username>', 'Filtrar por usuário')
    .option('--format <format>', 'Formato de saída (table, json)', 'table')
    .option('--global', 'Mostrar apenas histórico global')
    .option('--machine', 'Mostrar apenas histórico desta máquina')
    .option('--all', 'Mostrar histórico de todas as tabelas (modo hybrid)')
    .action(async (options) => {
        const client = await initTursoClient();

        if (options.user) {
            try {
                await client.setUser(options.user);
                if (process.env.DEBUG) {
                    console.log(`DEBUG: User set to ${options.user}, userId: ${client.userId}`);
                }
            } catch (error) {
                console.error(chalk.red(`❌ Usuário '${options.user}' não encontrado`));
                console.log(chalk.yellow(`Dica: Crie o usuário com: ./test-user-turso-simple.sh`));
                process.exit(1);
            }
        }

        try {
            // Determine which history to fetch based on flags
            let history;

            // Check if user option is specified (has a username value)
            const fetchUserHistory = options.user && typeof options.user === 'string';


            if (options.global) {
                history = await client.getHistoryFromTable('global', parseInt(options.limit));
            } else if (options.machine) {
                history = await client.getHistoryFromTable('machine', parseInt(options.limit));
            } else if (fetchUserHistory) {
                // When --user <username> is specified, fetch from user table
                history = await client.getHistoryFromTable('user', parseInt(options.limit));
            } else if (options.all) {
                history = await client.getHistory(parseInt(options.limit)); // Keep existing hybrid behavior
            } else {
                // Default: use machine history (local to this machine only)
                history = await client.getHistoryFromTable('machine', parseInt(options.limit));
            }

            if (history.length === 0) {
                console.log(chalk.yellow('Nenhum comando encontrado no histórico.'));
                return;
            }

            if (options.format === 'json') {
                console.log(JSON.stringify(history, null, 2));
            } else {
                console.log(chalk.cyan('\n═══ Histórico de Comandos ═══\n'));
                history.forEach((h, index) => {
                    const date = new Date(h.timestamp * 1000).toLocaleString('pt-BR');
                    console.log(chalk.gray(`[${index + 1}] ${date}`));
                    console.log(chalk.white(`Comando: ${h.command}`));
                    if (h.response) {
                        const truncated = h.response.length > 100
                            ? h.response.substring(0, 100) + '...'
                            : h.response;
                        console.log(chalk.green(`Resposta: ${truncated}`));
                    }
                    console.log('');
                });
            }

        } catch (error) {
            console.error(chalk.red(`Erro ao buscar histórico: ${error.message}`));
        }
    });

historyCmd
    .command('stats')
    .description('Mostrar estatísticas do histórico')
    .option('--user <username>', 'Filtrar por usuário')
    .option('--days <days>', 'Últimos N dias', '30')
    .action(async (options) => {
        const client = await initTursoClient();

        if (options.user) {
            await client.setUser(options.user);
        }

        try {
            const stats = await client.getStats(parseInt(options.days));

            console.log(chalk.cyan('\n═══ Estatísticas do Histórico ═══\n'));
            console.log(`Comandos globais: ${stats.globalCommands}`);
            if (stats.userCommands !== undefined) {
                console.log(`Comandos do usuário: ${stats.userCommands}`);
            }
            console.log(`Comandos da máquina: ${stats.machineCommands}`);
            console.log(`Máquinas ativas: ${stats.activeMachines}`);
            console.log(`Usuários ativos: ${stats.activeUsers}`);

            if (stats.topCommands && stats.topCommands.length > 0) {
                console.log(chalk.cyan('\nTop 10 Comandos:'));
                stats.topCommands.forEach((cmd, i) => {
                    console.log(`  ${i + 1}. ${cmd.command} (${cmd.usage_count}x)`);
                });
            }
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

historyCmd
    .command('search <query>')
    .description('Buscar no histórico')
    .option('--limit <limit>', 'Máximo de resultados', '20')
    .option('--mode <mode>', 'Modo de busca (global/user/machine/all)', 'all')
    .action(async (query, options) => {
        const client = await initTursoClient();

        try {
            const results = await client.searchHistory(query, {
                limit: parseInt(options.limit),
                mode: options.mode
            });

            if (results.length === 0) {
                console.log(chalk.yellow('Nenhum resultado encontrado.'));
                return;
            }

            console.log(chalk.cyan(`\n═══ Resultados da busca: "${query}" ═══\n`));
            results.forEach(r => {
                const date = new Date(r.timestamp * 1000).toLocaleString('pt-BR');
                console.log(chalk.gray(`[${date}]`), chalk.white(r.command));
                if (r.response) {
                    console.log(chalk.gray('  →'), r.response.substring(0, 100) + '...');
                }
                console.log();
            });
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

historyCmd
    .command('export')
    .description('Exportar histórico')
    .option('--format <format>', 'Formato de saída (json/csv)', 'json')
    .option('--output <file>', 'Arquivo de saída')
    .option('--limit <limit>', 'Limite de registros', '10000')
    .action(async (options) => {
        const client = await initTursoClient();

        try {
            const history = await client.getHistory(parseInt(options.limit));

            let output;
            if (options.format === 'json') {
                output = JSON.stringify(history, null, 2);
            } else if (options.format === 'csv') {
                // Header
                output = 'Timestamp,Command,Response,Source\n';
                // Data
                history.forEach(h => {
                    const timestamp = new Date(h.timestamp * 1000).toISOString();
                    const command = `"${h.command.replace(/"/g, '""')}"`;
                    const response = h.response ? `"${h.response.replace(/"/g, '""')}"` : '""';
                    const source = h.source || 'local';
                    output += `${timestamp},${command},${response},${source}\n`;
                });
            }

            if (options.output) {
                await fs.writeFile(options.output, output);
                console.log(chalk.green(`✅ Histórico exportado para: ${options.output}`));
            } else {
                console.log(output);
            }
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

// ==================== COMANDOS DE MÁQUINA ====================

const machineCmd = program.command('machine');

machineCmd
    .command('register')
    .description('Registrar máquina atual')
    .action(async () => {
        const client = await initTursoClient();
        const machineManager = new MachineIdentityManager();

        try {
            const id = await machineManager.registerMachine(client.client);
            console.log(chalk.green(`✅ Máquina registrada: ${id}`));
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

machineCmd
    .command('list')
    .description('Listar máquinas registradas')
    .action(async () => {
        const client = await initTursoClient();

        try {
            const result = await client.client.execute({
                sql: 'SELECT machine_id, hostname, ip_address, last_seen, total_commands FROM machines ORDER BY last_seen DESC'
            });

            if (result.rows.length === 0) {
                console.log(chalk.yellow('Nenhuma máquina registrada.'));
                return;
            }

            console.log(chalk.cyan('\n═══ Máquinas Registradas ═══\n'));
            console.table(result.rows.map(m => ({
                ID: m.machine_id.substring(0, 12) + '...',
                Hostname: m.hostname,
                IP: m.ip_address || 'N/A',
                'Último Acesso': new Date(m.last_seen * 1000).toLocaleString('pt-BR'),
                Comandos: m.total_commands
            })));
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

machineCmd
    .command('info')
    .description('Mostrar informações da máquina atual')
    .action(async () => {
        const machineManager = new MachineIdentityManager();

        try {
            const info = await machineManager.getMachineInfo();

            console.log(chalk.cyan('\n═══ Informações da Máquina ═══\n'));
            console.log(`Machine ID: ${info.machineId}`);
            console.log(`Hostname: ${info.hostname}`);
            console.log(`Platform: ${info.platform}`);
            console.log(`Architecture: ${info.arch}`);
            console.log(`CPUs: ${info.cpus.length}`);
            console.log(`Total Memory: ${(info.totalMemory / (1024 ** 3)).toFixed(2)} GB`);
            console.log(`Free Memory: ${(info.freeMemory / (1024 ** 3)).toFixed(2)} GB`);
            console.log(`Uptime: ${(info.uptime / 3600).toFixed(2)} hours`);
            console.log(`IP Address: ${info.ipAddress}`);
        } catch (error) {
            console.error(chalk.red(`❌ ${error.message}`));
            process.exit(1);
        }
    });

// ==================== COMANDO PADRÃO (MODO INTERATIVO) ====================

program
    .option('--user <username>', 'Usar perfil de usuário específico')
    .option('--local', 'Usar apenas histórico local da máquina')
    .option('--hybrid', 'Usar modo híbrido (todos os históricos)')
    .action(async (options) => {
        // Se nenhum comando ou opção foi especificado, inicia modo interativo
        const args = ['mcp-interactive.js'];

        if (options.user) args.push(`--user=${options.user}`);
        if (options.local) args.push('--local');
        if (options.hybrid) args.push('--hybrid');

        const child = spawn('node', args, {
            stdio: 'inherit',
            cwd: path.dirname(new URL(import.meta.url).pathname)
        });

        child.on('error', (error) => {
            console.error(chalk.red(`❌ Erro ao iniciar modo interativo: ${error.message}`));
            process.exit(1);
        });

        child.on('exit', (code) => {
            process.exit(code || 0);
        });
    });

// Parse dos argumentos
program.parse();