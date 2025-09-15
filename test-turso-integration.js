#!/usr/bin/env node

/**
 * Test Suite para Integração Turso
 * Testa todas as funcionalidades críticas do sistema
 */

import chalk from 'chalk';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

class TursoIntegrationTests {
    constructor() {
        this.testResults = [];
        this.configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');
        this.testUser = `test_${Date.now()}`;
        this.testEmail = `test_${Date.now()}@test.com`;
    }

    // Utilitário para executar comandos
    async runCommand(command, args = []) {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                stdio: 'pipe',
                shell: true
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                resolve({
                    code,
                    stdout,
                    stderr
                });
            });

            child.on('error', (error) => {
                reject(error);
            });
        });
    }

    // Testa se a configuração do Turso existe
    async testTursoConfig() {
        const testName = 'Configuração Turso';
        try {
            await fs.access(this.configPath);
            const config = JSON.parse(await fs.readFile(this.configPath, 'utf8'));

            if (config.turso_url && config.turso_token) {
                this.pass(testName, 'Configuração encontrada e válida');

                // Verificar se é config de admin ou cliente
                if (config.is_admin_config) {
                    this.warn('Tipo de Config', 'Configuração de ADMIN detectada');
                } else {
                    this.pass('Tipo de Config', 'Configuração de CLIENTE detectada');
                }
            } else {
                this.fail(testName, 'Configuração incompleta');
            }
        } catch (error) {
            this.fail(testName, `Arquivo não encontrado: ${error.message}`);
        }
    }

    // Testa criação de usuário
    async testUserCreation() {
        const testName = 'Criação de Usuário';
        try {
            const result = await this.runCommand('node', [
                'ipcom-chat-cli.js',
                'user',
                'create',
                '--username', this.testUser,
                '--name', 'Test User',
                '--email', this.testEmail
            ]);

            if (result.code === 0 && result.stdout.includes('✅')) {
                this.pass(testName, `Usuário ${this.testUser} criado`);
            } else {
                this.fail(testName, result.stderr || 'Falha na criação');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Testa listagem de usuários
    async testUserList() {
        const testName = 'Listagem de Usuários';
        try {
            const result = await this.runCommand('node', [
                'ipcom-chat-cli.js',
                'user',
                'list'
            ]);

            if (result.code === 0 && result.stdout.includes(this.testUser)) {
                this.pass(testName, 'Usuário de teste encontrado na lista');
            } else {
                this.fail(testName, 'Usuário não encontrado');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Testa atualização de usuário
    async testUserUpdate() {
        const testName = 'Atualização de Usuário';
        try {
            const newEmail = `updated_${this.testEmail}`;
            const result = await this.runCommand('node', [
                'ipcom-chat-cli.js',
                'user',
                'update',
                this.testUser,
                '--email', newEmail
            ]);

            if (result.code === 0 && result.stdout.includes('✅')) {
                this.pass(testName, 'Usuário atualizado com sucesso');
            } else {
                this.fail(testName, 'Falha na atualização');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Testa registro de máquina
    async testMachineRegistration() {
        const testName = 'Registro de Máquina';
        try {
            const result = await this.runCommand('node', [
                'ipcom-chat-cli.js',
                'machine',
                'register'
            ]);

            if (result.code === 0 && result.stdout.includes('✅')) {
                this.pass(testName, 'Máquina registrada com sucesso');
            } else {
                this.fail(testName, 'Falha no registro');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Testa informações da máquina
    async testMachineInfo() {
        const testName = 'Informações da Máquina';
        try {
            const result = await this.runCommand('node', [
                'ipcom-chat-cli.js',
                'machine',
                'info'
            ]);

            if (result.code === 0 && result.stdout.includes('Machine ID')) {
                this.pass(testName, 'Informações obtidas com sucesso');
            } else {
                this.fail(testName, 'Falha ao obter informações');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Testa estatísticas do histórico
    async testHistoryStats() {
        const testName = 'Estatísticas do Histórico';
        try {
            const result = await this.runCommand('node', [
                'ipcom-chat-cli.js',
                'history',
                'stats'
            ]);

            if (result.code === 0 && result.stdout.includes('Comandos')) {
                this.pass(testName, 'Estatísticas obtidas com sucesso');
            } else {
                this.fail(testName, 'Falha ao obter estatísticas');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Testa busca no histórico
    async testHistorySearch() {
        const testName = 'Busca no Histórico';
        try {
            const result = await this.runCommand('node', [
                'ipcom-chat-cli.js',
                'history',
                'search',
                'test'
            ]);

            if (result.code === 0) {
                this.pass(testName, 'Busca executada com sucesso');
            } else {
                this.fail(testName, 'Falha na busca');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Testa exportação do histórico
    async testHistoryExport() {
        const testName = 'Exportação do Histórico';
        const outputFile = `/tmp/test_export_${Date.now()}.json`;

        try {
            const result = await this.runCommand('node', [
                'ipcom-chat-cli.js',
                'history',
                'export',
                '--format', 'json',
                '--output', outputFile
            ]);

            if (result.code === 0) {
                // Verificar se arquivo foi criado
                await fs.access(outputFile);
                await fs.unlink(outputFile); // Limpar
                this.pass(testName, 'Exportação bem-sucedida');
            } else {
                this.fail(testName, 'Falha na exportação');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Testa modo interativo com flag --user
    async testInteractiveUserMode() {
        const testName = 'Modo Interativo com Usuário';
        try {
            // Criar processo filho
            const child = spawn('node', ['ipcom-chat', `--user=${this.testUser}`], {
                stdio: 'pipe'
            });

            let output = '';
            let errorOccurred = false;

            // Capturar output
            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.stderr.on('data', (data) => {
                errorOccurred = true;
                output += data.toString();
            });

            // Aguardar inicialização
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Enviar comando de saída
            child.stdin.write('/exit\n');

            // Aguardar finalização
            await new Promise((resolve) => {
                child.on('close', () => resolve());
            });

            if (!errorOccurred && (output.includes('Logado como') || output.includes('não encontrado'))) {
                this.pass(testName, 'Modo interativo iniciou corretamente');
            } else {
                this.fail(testName, 'Erro ao iniciar modo interativo');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Testa migração de histórico
    async testHistoryMigration() {
        const testName = 'Verificação de Migração';
        try {
            const result = await this.runCommand('node', [
                'libs/migrate-history.js',
                'verify'
            ]);

            if (result.code === 0 && result.stdout.includes('Estatísticas')) {
                this.pass(testName, 'Verificação executada com sucesso');
            } else {
                this.fail(testName, 'Falha na verificação');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Testa verificador de schema
    async testSchemaVerifier() {
        const testName = 'Verificador de Schema';
        try {
            const result = await this.runCommand('node', [
                'libs/turso-verify-schema.js'
            ]);

            if (result.code === 0 && result.stdout.includes('RELATÓRIO')) {
                this.pass(testName, 'Verificação de schema executada com sucesso');
            } else {
                this.warn(testName, 'Verificação executada mas com avisos');
            }
        } catch (error) {
            this.fail(testName, error.message);
        }
    }

    // Cleanup: deletar usuário de teste
    async cleanup() {
        const testName = 'Limpeza';
        try {
            const result = await this.runCommand('node', [
                'ipcom-chat-cli.js',
                'user',
                'delete',
                this.testUser
            ]);

            if (result.code === 0) {
                this.pass(testName, 'Usuário de teste removido');
            } else {
                this.warn(testName, 'Não foi possível remover usuário de teste');
            }
        } catch (error) {
            this.warn(testName, error.message);
        }
    }

    // Registrar resultado de teste
    pass(name, message) {
        this.testResults.push({ name, status: 'pass', message });
        console.log(chalk.green(`✅ ${name}: ${message}`));
    }

    fail(name, message) {
        this.testResults.push({ name, status: 'fail', message });
        console.log(chalk.red(`❌ ${name}: ${message}`));
    }

    warn(name, message) {
        this.testResults.push({ name, status: 'warn', message });
        console.log(chalk.yellow(`⚠️  ${name}: ${message}`));
    }

    // Executar todos os testes
    async runAllTests() {
        console.log(chalk.cyan('\n═══════════════════════════════════════════════'));
        console.log(chalk.cyan('         Testes de Integração Turso            '));
        console.log(chalk.cyan('═══════════════════════════════════════════════\n'));

        const tests = [
            () => this.testTursoConfig(),
            () => this.testSchemaVerifier(),
            () => this.testUserCreation(),
            () => this.testUserList(),
            () => this.testUserUpdate(),
            () => this.testMachineRegistration(),
            () => this.testMachineInfo(),
            () => this.testHistoryStats(),
            () => this.testHistorySearch(),
            () => this.testHistoryExport(),
            () => this.testInteractiveUserMode(),
            () => this.testHistoryMigration(),
            () => this.cleanup()
        ];

        for (const test of tests) {
            await test();
            // Pequena pausa entre testes
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Resumo dos resultados
        console.log(chalk.cyan('\n═══════════════════════════════════════════════'));
        console.log(chalk.cyan('                   Resumo                       '));
        console.log(chalk.cyan('═══════════════════════════════════════════════\n'));

        const passed = this.testResults.filter(r => r.status === 'pass').length;
        const failed = this.testResults.filter(r => r.status === 'fail').length;
        const warned = this.testResults.filter(r => r.status === 'warn').length;
        const total = this.testResults.length;

        console.log(chalk.green(`✅ Passou: ${passed}/${total}`));
        if (failed > 0) {
            console.log(chalk.red(`❌ Falhou: ${failed}/${total}`));
        }
        if (warned > 0) {
            console.log(chalk.yellow(`⚠️  Avisos: ${warned}/${total}`));
        }

        if (failed === 0) {
            console.log(chalk.green('\n🎉 Todos os testes passaram!'));
        } else {
            console.log(chalk.red('\n⚠️  Alguns testes falharam. Verifique os logs acima.'));
            process.exit(1);
        }
    }
}

// Executar testes
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new TursoIntegrationTests();
    tester.runAllTests().catch(error => {
        console.error(chalk.red(`\n❌ Erro fatal: ${error.message}`));
        process.exit(1);
    });
}

export default TursoIntegrationTests;