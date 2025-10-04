#!/usr/bin/env node

/**
 * 🔍 VERIFICADOR DE SCHEMA TURSO 🔍
 *
 * Este script verifica se o schema do Turso está configurado corretamente.
 * Útil para diagnóstico e troubleshooting.
 */

import { createClient, type Client } from '@libsql/client';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

/**
 * Turso configuration
 */
interface TursoConfig {
  turso_url?: string;
  turso_token?: string;
  [key: string]: unknown;
}

/**
 * Verification message
 */
interface VerificationMessage {
  type: 'error' | 'warning' | 'info';
  message: string;
}

class TursoSchemaVerifier {
  private configDir: string;
  private configPath: string;
  private client: Client | null;
  private config: TursoConfig | null;
  private errors: string[];
  private warnings: string[];
  private info: string[];

  constructor() {
    this.configDir = path.join(os.homedir(), '.mcp-terminal');
    this.configPath = path.join(this.configDir, 'config.json');
    this.client = null;
    this.config = null;
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  async loadConfig(): Promise<boolean> {
    if (!existsSync(this.configPath)) {
      console.log(chalk.red('❌ Arquivo de configuração não encontrado!'));
      console.log(chalk.yellow(`   Esperado em: ${this.configPath}`));
      console.log(chalk.yellow('\nExecute primeiro:'));
      console.log(
        chalk.green('  Para administrador: node libs/turso-admin-setup.js'),
      );
      console.log(
        chalk.green('  Para cliente: node libs/turso-client-setup.js'),
      );
      return false;
    }

    try {
      const config = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
      this.config = config;

      if (!config.turso_url || !config.turso_token) {
        console.log(chalk.red('❌ Configuração incompleta!'));
        console.log(chalk.yellow('   Faltam URL ou token do Turso'));
        return false;
      }

      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Erro ao ler configuração: ${error.message}`));
      return false;
    }
  }

  async connectToDatabase(): Promise<boolean> {
    try {
      this.client = createClient({
        url: this.config.turso_url,
        authToken: this.config.turso_token,
      });

      // Testar conexão
      await this.client.execute('SELECT 1');
      this.info.push('✅ Conexão com banco estabelecida');
      return true;
    } catch (error) {
      this.errors.push(`❌ Erro de conexão: ${error.message}`);
      return false;
    }
  }

  async verifyTables(): Promise<void> {
    const requiredTables = [
      'users',
      'machines',
      'history_global',
      'history_user',
      'history_machine',
      'command_cache',
      'sessions',
    ];

    console.log(chalk.cyan('\n📋 Verificando tabelas...'));

    for (const table of requiredTables) {
      try {
        const result = await this.client.execute({
          sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
          args: [table],
        });

        if (result.rows.length > 0) {
          // Contar registros
          const countResult = await this.client.execute(
            `SELECT COUNT(*) as count FROM ${table}`,
          );
          const count = Number(countResult.rows[0].count);
          this.info.push(`  ✅ Tabela '${table}' existe (${count} registros)`);
        } else {
          this.errors.push(`  ❌ Tabela '${table}' NÃO existe`);
        }
      } catch (error) {
        this.errors.push(
          `  ❌ Erro ao verificar tabela '${table}': ${error.message}`,
        );
      }
    }
  }

  async verifyIndexes(): Promise<void> {
    const expectedIndexes = [
      'idx_history_global_timestamp',
      'idx_history_global_machine',
      'idx_history_user_lookup',
      'idx_history_machine_lookup',
      'idx_command_cache_lookup',
      'idx_sessions_machine',
      'idx_users_username',
      'idx_machines_hostname',
    ];

    console.log(chalk.cyan('\n🔍 Verificando índices...'));

    for (const index of expectedIndexes) {
      try {
        const result = await this.client.execute({
          sql: `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
          args: [index],
        });

        if (result.rows.length > 0) {
          this.info.push(`  ✅ Índice '${index}' existe`);
        } else {
          this.warnings.push(`  ⚠️  Índice '${index}' não encontrado`);
        }
      } catch (error) {
        this.warnings.push(
          `  ⚠️  Erro ao verificar índice '${index}': ${error.message}`,
        );
      }
    }
  }

  async verifyPermissions(): Promise<void> {
    console.log(chalk.cyan('\n🔐 Verificando permissões...'));

    // Testar INSERT
    try {
      await this.client.execute('BEGIN TRANSACTION');
      await this.client.execute({
        sql: `INSERT INTO machines (machine_id, hostname, os_info) 
                      VALUES ('test_verify_' || hex(randomblob(8)), 'test', 'test')`,
        args: [],
      });
      await this.client.execute('ROLLBACK');
      this.info.push('  ✅ Permissão INSERT confirmada');
    } catch (error) {
      if (error.message.includes('PERMISSION')) {
        this.errors.push('  ❌ Sem permissão INSERT');
      } else if (error.message.includes('no such table')) {
        this.errors.push(
          '  ❌ Schema não existe - execute turso-admin-setup.js primeiro',
        );
      } else {
        this.warnings.push(`  ⚠️  Erro ao testar INSERT: ${error.message}`);
      }
    }

    // Testar SELECT
    try {
      await this.client.execute('SELECT * FROM users LIMIT 1');
      this.info.push('  ✅ Permissão SELECT confirmada');
    } catch (error) {
      if (error.message.includes('PERMISSION')) {
        this.errors.push('  ❌ Sem permissão SELECT');
      } else if (error.message.includes('no such table')) {
        // Já reportado acima
      } else {
        this.warnings.push(`  ⚠️  Erro ao testar SELECT: ${error.message}`);
      }
    }

    // Verificar se é admin (tentar criar tabela temporária)
    try {
      await this.client.execute('CREATE TEMP TABLE test_admin (id INTEGER)');
      await this.client.execute('DROP TABLE test_admin');
      this.warnings.push(
        '  ⚠️  Token parece ter permissões de ADMIN (considere usar token de cliente)',
      );
    } catch {
      this.info.push(
        '  ✅ Token não tem permissões de admin (bom para cliente)',
      );
    }
  }

  async verifyData(): Promise<void> {
    console.log(chalk.cyan('\n📊 Verificando dados...'));

    // Verificar usuários
    try {
      const users = await this.client.execute(
        'SELECT COUNT(*) as count FROM users',
      );
      const userCount = Number(users.rows[0].count);

      if (userCount === 0) {
        this.warnings.push('  ⚠️  Nenhum usuário cadastrado');
        this.info.push(
          '     Use: ipcom-chat user create --username USER --name "Nome" --email email',
        );
      } else {
        this.info.push(`  ✅ ${userCount} usuário(s) cadastrado(s)`);

        // Listar usuários
        const userList = await this.client.execute(
          'SELECT username, name, email FROM users LIMIT 5',
        );
        for (const user of userList.rows) {
          this.info.push(
            `     - ${user.username} (${user.name}) - ${user.email}`,
          );
        }
        if (userCount > 5) {
          this.info.push(`     ... e mais ${userCount - 5} usuário(s)`);
        }
      }
    } catch (error) {
      this.errors.push(`  ❌ Erro ao verificar usuários: ${error.message}`);
    }

    // Verificar máquinas
    try {
      const machines = await this.client.execute(
        'SELECT COUNT(*) as count FROM machines',
      );
      const machineCount = Number(machines.rows[0].count);

      if (machineCount === 0) {
        this.warnings.push('  ⚠️  Nenhuma máquina registrada');
      } else {
        this.info.push(`  ✅ ${machineCount} máquina(s) registrada(s)`);

        // Listar máquinas recentes
        const machineList = await this.client.execute(`
                    SELECT hostname, ip_address, datetime(last_seen, 'unixepoch') as last_seen 
                    FROM machines 
                    ORDER BY last_seen DESC 
                    LIMIT 5
                `);
        for (const machine of machineList.rows) {
          this.info.push(
            `     - ${machine.hostname} (${machine.ip_address || 'N/A'}) - Visto: ${machine.last_seen}`,
          );
        }
        if (machineCount > 5) {
          this.info.push(`     ... e mais ${machineCount - 5} máquina(s)`);
        }
      }
    } catch (error) {
      this.errors.push(`  ❌ Erro ao verificar máquinas: ${error.message}`);
    }

    // Verificar histórico
    try {
      const history = await this.client.execute(
        'SELECT COUNT(*) as count FROM history_global',
      );
      const historyCount = Number(history.rows[0].count);

      if (historyCount === 0) {
        this.info.push('  ℹ️  Histórico vazio (normal para instalação nova)');
      } else {
        this.info.push(`  ✅ ${historyCount} comando(s) no histórico global`);
      }
    } catch (error) {
      this.errors.push(`  ❌ Erro ao verificar histórico: ${error.message}`);
    }
  }

  async showReport(): Promise<void> {
    console.log(
      chalk.cyan('\n════════════════════════════════════════════════'),
    );
    console.log(chalk.cyan('                  RELATÓRIO                     '));
    console.log(chalk.cyan('════════════════════════════════════════════════'));

    // Mostrar configuração
    if (this.config) {
      console.log(chalk.blue('\n🔧 Configuração:'));
      console.log(chalk.gray(`  URL: ${this.config.turso_url}`));
      console.log(
        chalk.gray(`  Modo: ${this.config.history_mode || 'padrão'}`),
      );
      console.log(
        chalk.gray(`  Admin: ${this.config.is_admin_config ? 'Sim' : 'Não'}`),
      );
      console.log(chalk.gray(`  Criado: ${this.config.created_at}`));
    }

    // Mostrar informações
    if (this.info.length > 0) {
      console.log(chalk.green('\n✅ Informações:'));
      this.info.forEach(msg => console.log(chalk.green(msg)));
    }

    // Mostrar avisos
    if (this.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Avisos:'));
      this.warnings.forEach(msg => console.log(chalk.yellow(msg)));
    }

    // Mostrar erros
    if (this.errors.length > 0) {
      console.log(chalk.red('\n❌ Erros:'));
      this.errors.forEach(msg => console.log(chalk.red(msg)));
    }

    // Resumo final
    console.log(
      chalk.cyan('\n════════════════════════════════════════════════'),
    );

    if (this.errors.length === 0) {
      if (this.warnings.length === 0) {
        console.log(chalk.green('🎉 Sistema totalmente funcional!'));
      } else {
        console.log(chalk.yellow('✅ Sistema funcional com avisos'));
      }
    } else {
      console.log(chalk.red('❌ Sistema com problemas - requer atenção'));
      console.log(chalk.yellow('\nAções recomendadas:'));

      if (this.errors.some(e => e.includes('Schema não existe'))) {
        console.log(
          chalk.yellow(
            '1. Execute o setup de admin: node libs/turso-admin-setup.js',
          ),
        );
      }
      if (this.errors.some(e => e.includes('conexão'))) {
        console.log(chalk.yellow('2. Verifique credenciais do Turso'));
      }
      if (this.errors.some(e => e.includes('permissão'))) {
        console.log(chalk.yellow('3. Verifique permissões do token'));
      }
    }
  }

  async run(): Promise<void> {
    console.log(
      chalk.blue('╔════════════════════════════════════════════════════╗'),
    );
    console.log(
      chalk.blue('║        VERIFICADOR DE SCHEMA TURSO             ║'),
    );
    console.log(
      chalk.blue('╚════════════════════════════════════════════════════╝'),
    );

    try {
      // Carregar configuração
      const configLoaded = await this.loadConfig();
      if (!configLoaded) {
        process.exit(1);
      }

      // Conectar ao banco
      const connected = await this.connectToDatabase();
      if (!connected) {
        await this.showReport();
        process.exit(1);
      }

      // Executar verificações
      await this.verifyTables();
      await this.verifyIndexes();
      await this.verifyPermissions();
      await this.verifyData();

      // Mostrar relatório
      await this.showReport();
    } catch (error) {
      console.error(chalk.red(`\n❌ Erro fatal: ${error.message}`));
      process.exit(1);
    } finally {
      if (this.client) {
        this.client.close();
      }
    }
  }
}

// Executar
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new TursoSchemaVerifier();
  verifier.run();
}

export default TursoSchemaVerifier;
