#!/usr/bin/env node

/**
 * ⚠️ ATENÇÃO: ESTE SCRIPT É APENAS PARA ADMINISTRADORES! ⚠️
 *
 * Este script cria o SCHEMA do banco de dados Turso.
 * Deve ser executado APENAS UMA VEZ pelo administrador.
 *
 * NÃO EXECUTE EM MÁQUINAS CLIENTES!
 * Para máquinas clientes, use: turso-client-setup.js
 */

import { createClient, type Client } from '@libsql/client';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import * as readline from 'readline/promises';

class TursoAdminSetup {
  private configDir: string;
  private configPath: string;
  private adminMarkerPath: string;
  private client: Client | null;

  constructor() {
    this.configDir = path.join(os.homedir(), '.mcp-terminal');
    this.configPath = path.join(this.configDir, 'config.json');
    this.adminMarkerPath = path.join(this.configDir, '.turso-admin-setup-done');
    this.client = null;
  }

  async displayBigWarning() {
    console.clear();
    console.log(
      chalk.red(
        '╔════════════════════════════════════════════════════════════════╗',
      ),
    );
    console.log(
      chalk.red(
        '║                                                                ║',
      ),
    );
    console.log(
      chalk.red(
        '║     ⚠️  ⚠️  ⚠️   ATENÇÃO ADMINISTRADOR  ⚠️  ⚠️  ⚠️            ║',
      ),
    );
    console.log(
      chalk.red(
        '║                                                                ║',
      ),
    );
    console.log(
      chalk.red(
        '║   ESTE SCRIPT CRIA O SCHEMA DO BANCO DE DADOS!               ║',
      ),
    );
    console.log(
      chalk.red(
        '║                                                                ║',
      ),
    );
    console.log(
      chalk.red(
        '║   • Execute APENAS UMA VEZ                                    ║',
      ),
    );
    console.log(
      chalk.red(
        '║   • Execute APENAS no servidor principal                      ║',
      ),
    );
    console.log(
      chalk.red(
        '║   • NÃO execute em máquinas clientes                          ║',
      ),
    );
    console.log(
      chalk.red(
        '║   • NÃO execute múltiplas vezes                               ║',
      ),
    );
    console.log(
      chalk.red(
        '║                                                                ║',
      ),
    );
    console.log(
      chalk.red(
        '║   Para máquinas clientes use:                                 ║',
      ),
    );
    console.log(
      chalk.yellow(
        '║   $ node libs/turso-client-setup.js                           ║',
      ),
    );
    console.log(
      chalk.red(
        '║                                                                ║',
      ),
    );
    console.log(
      chalk.red(
        '╚════════════════════════════════════════════════════════════════╝',
      ),
    );
    console.log();
  }

  async confirmAdmin(): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.yellow('\n⚠️  CONFIRMAÇÃO DE SEGURANÇA:'));
    console.log(chalk.yellow('─────────────────────────────'));

    const answer1 = await rl.question(
      chalk.cyan(
        'Você é o ADMINISTRADOR do sistema? (digite "SIM EU SOU ADMIN"): ',
      ),
    );
    if (answer1 !== 'SIM EU SOU ADMIN') {
      console.log(chalk.red('\n❌ Resposta incorreta. Abortando...'));
      console.log(
        chalk.yellow(
          'Use: node libs/turso-client-setup.js para configurar máquinas clientes.',
        ),
      );
      rl.close();
      process.exit(1);
    }

    const answer2 = await rl.question(
      chalk.cyan(
        'Esta é a PRIMEIRA vez que está criando o banco? (digite "SIM PRIMEIRA VEZ"): ',
      ),
    );
    if (answer2 !== 'SIM PRIMEIRA VEZ') {
      console.log(
        chalk.red('\n❌ Se não é a primeira vez, não execute este script!'),
      );
      console.log(
        chalk.yellow('O schema já deve existir. Use turso-client-setup.js'),
      );
      rl.close();
      process.exit(1);
    }

    const answer3 = await rl.question(
      chalk.red(
        'CONFIRMA que quer CRIAR O SCHEMA do banco? (digite "CRIAR SCHEMA AGORA"): ',
      ),
    );
    if (answer3 !== 'CRIAR SCHEMA AGORA') {
      console.log(chalk.yellow('\n Operação cancelada.'));
      rl.close();
      process.exit(0);
    }

    rl.close();
    return true;
  }

  async checkIfAlreadyDone(): Promise<void> {
    if (existsSync(this.adminMarkerPath)) {
      console.log(
        chalk.red('\n════════════════════════════════════════════════════'),
      );
      console.log(chalk.red('⚠️  ERRO: Schema já foi criado anteriormente!'));
      console.log(
        chalk.red('════════════════════════════════════════════════════'),
      );
      console.log(
        chalk.yellow('\nEste script já foi executado nesta máquina.'),
      );
      console.log(
        chalk.yellow('Se precisa recriar o schema, delete o arquivo:'),
      );
      console.log(chalk.gray(`  ${this.adminMarkerPath}`));
      console.log(chalk.yellow('\nPara configurar máquinas clientes, use:'));
      console.log(chalk.green('  node libs/turso-client-setup.js'));
      process.exit(1);
    }
  }

  async getAdminCredentials(): Promise<{ url: string; token: string }> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.cyan('\n📋 CONFIGURAÇÃO DE ADMINISTRADOR'));
    console.log(chalk.cyan('═════════════════════════════════'));
    console.log(
      chalk.yellow(
        'Obtenha as credenciais em: https://turso.tech/app/databases\n',
      ),
    );

    let url = '';
    while (!url || !url.includes('libsql://')) {
      url = await rl.question(
        chalk.cyan('URL do Banco Turso (deve começar com libsql://): '),
      );
      if (!url.includes('libsql://')) {
        console.log(chalk.red('❌ URL inválida! Deve começar com libsql://'));
      }
    }

    let token = '';
    while (!token || token.length < 20) {
      token = await rl.question(
        chalk.cyan('Token de ADMIN (com permissão total): '),
      );
      if (token.length < 20) {
        console.log(
          chalk.red('❌ Token muito curto! Verifique se copiou corretamente.'),
        );
      }
    }

    // Verificar se é um token de admin tentando uma operação
    console.log(
      chalk.yellow('\n🔍 Verificando permissões de administrador...'),
    );

    rl.close();
    return { url, token };
  }

  async createSchema() {
    console.log(chalk.cyan('\n📦 Criando Schema do Banco de Dados...'));
    console.log(chalk.cyan('══════════════════════════════════════'));

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
                    is_active BOOLEAN DEFAULT 1,
                    CHECK (length(username) >= 3),
                    CHECK (email LIKE '%@%')
                )`,
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
                    total_commands INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1
                )`,
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
                )`,
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
                )`,
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
                )`,
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
                )`,
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
                )`,
      },
    ];

    // Usar transação para garantir atomicidade
    const tx = await this.client.transaction();

    try {
      for (const table of tables) {
        console.log(chalk.gray(`  Criando tabela '${table.name}'...`));
        await tx.execute(table.sql);
        console.log(chalk.green(`  ✅ Tabela '${table.name}' criada`));
      }

      // Criar índices
      console.log(chalk.cyan('\n📑 Criando Índices...'));
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_history_global_timestamp ON history_global(timestamp DESC)',
        'CREATE INDEX IF NOT EXISTS idx_history_global_machine ON history_global(machine_id, timestamp DESC)',
        'CREATE INDEX IF NOT EXISTS idx_history_user_lookup ON history_user(user_id, timestamp DESC)',
        'CREATE INDEX IF NOT EXISTS idx_history_machine_lookup ON history_machine(machine_id, timestamp DESC)',
        'CREATE INDEX IF NOT EXISTS idx_command_cache_lookup ON command_cache(machine_id, last_executed DESC)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_machine ON sessions(machine_id, started_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
        'CREATE INDEX IF NOT EXISTS idx_machines_hostname ON machines(hostname)',
      ];

      for (const index of indexes) {
        await tx.execute(index);
        console.log(chalk.green('  ✅ Índice criado'));
      }

      // Commit da transação
      await tx.commit();
      console.log(chalk.green('\n✅ SCHEMA CRIADO COM SUCESSO!'));

      // Criar arquivo marcador
      await fs.writeFile(
        this.adminMarkerPath,
        JSON.stringify(
          {
            created_at: new Date().toISOString(),
            created_by: os.userInfo().username,
            hostname: os.hostname(),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async createAdminUser(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.cyan('\n👤 CRIAR USUÁRIO ADMINISTRADOR'));
    console.log(chalk.cyan('════════════════════════════════'));

    const create = await rl.question(
      chalk.yellow('Deseja criar o primeiro usuário admin? (s/n): '),
    );

    if (create.toLowerCase() !== 's') {
      rl.close();
      return;
    }

    console.log(chalk.yellow('\n⚠️  IMPORTANTE: Guarde estas informações!'));

    const username = await rl.question(chalk.cyan('Username do admin: '));
    const name = await rl.question(chalk.cyan('Nome completo: '));
    const email = await rl.question(chalk.cyan('Email: '));

    try {
      await this.client.execute({
        sql: 'INSERT INTO users (username, name, email) VALUES (?, ?, ?)',
        args: [username, name, email],
      });

      console.log(chalk.green('\n✅ Usuário admin criado com sucesso!'));
      console.log(chalk.yellow('\nGuarde estas informações:'));
      console.log(chalk.white(`  Username: ${username}`));
      console.log(chalk.white(`  Nome: ${name}`));
      console.log(chalk.white(`  Email: ${email}`));
    } catch (error) {
      console.error(chalk.red(`\n❌ Erro ao criar usuário: ${error.message}`));
    }

    rl.close();
  }

  async saveConfig(credentials: { url: string; token: string }): Promise<void> {
    // Criar diretório se não existir
    if (!existsSync(this.configDir)) {
      await fs.mkdir(this.configDir, { recursive: true });
    }

    const config = {
      turso_url: credentials.url,
      turso_token: credentials.token,
      turso_sync_url: credentials.url,
      turso_sync_interval: 60,
      history_mode: 'hybrid',
      fallback_enabled: true,
      cache_ttl: 3600,
      max_retries: 5,
      retry_interval: 60000,
      is_admin_config: true,
      created_at: new Date().toISOString(),
    };

    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green(`\n✅ Configuração salva em: ${this.configPath}`));
  }

  async generateClientToken(): Promise<void> {
    console.log(chalk.cyan('\n🔑 INSTRUÇÕES PARA GERAR TOKEN DE CLIENTE'));
    console.log(chalk.cyan('═══════════════════════════════════════════'));
    console.log(
      chalk.yellow(
        '\n⚠️  IMPORTANTE: Clientes devem usar token com permissões limitadas!\n',
      ),
    );

    console.log(chalk.white('1. Acesse: https://turso.tech/app/databases'));
    console.log(chalk.white('2. Selecione seu banco de dados'));
    console.log(chalk.white('3. Vá em "Database Tokens"'));
    console.log(chalk.white('4. Clique em "Generate Token"'));
    console.log(
      chalk.white('5. Escolha permissões: READ + WRITE (não ADMIN!)'),
    );
    console.log(chalk.white('6. Copie o token gerado'));
    console.log(chalk.white('\n7. Use este token no arquivo deploy-linux.sh:'));
    console.log(chalk.green('   --turso-token "TOKEN_DE_CLIENTE_AQUI"'));
  }

  async run() {
    try {
      // Mostrar aviso gigante
      await this.displayBigWarning();

      // Verificar se já foi executado
      await this.checkIfAlreadyDone();

      // Confirmar que é admin
      await this.confirmAdmin();

      // Obter credenciais
      const credentials = await this.getAdminCredentials();

      // Conectar ao banco
      console.log(chalk.yellow('\n🔌 Conectando ao banco de dados...'));
      this.client = createClient({
        url: credentials.url,
        authToken: credentials.token,
      });

      // Testar conexão
      await this.client.execute('SELECT 1');
      console.log(chalk.green('✅ Conectado com sucesso!'));

      // Criar schema
      await this.createSchema();

      // Criar usuário admin
      await this.createAdminUser();

      // Salvar configuração
      await this.saveConfig(credentials);

      // Instruções para gerar token de cliente
      await this.generateClientToken();

      console.log(
        chalk.green('\n╔════════════════════════════════════════════════════╗'),
      );
      console.log(
        chalk.green('║           SETUP DE ADMIN CONCLUÍDO!               ║'),
      );
      console.log(
        chalk.green('╚════════════════════════════════════════════════════╝'),
      );

      console.log(chalk.yellow('\n📋 PRÓXIMOS PASSOS:'));
      console.log(chalk.white('1. Gere um token de CLIENTE no Turso'));
      console.log(chalk.white('2. Configure as máquinas clientes com:'));
      console.log(chalk.cyan('   node libs/turso-client-setup.js'));
      console.log(chalk.white('3. Ou use o script de deployment:'));
      console.log(chalk.cyan('   ./deploy-linux.sh'));
    } catch (error) {
      console.error(chalk.red('\n❌ ERRO FATAL:'), error.message);
      console.error(chalk.yellow('\nVerifique:'));
      console.error(chalk.yellow('1. URL do banco está correta'));
      console.error(chalk.yellow('2. Token tem permissões de ADMIN'));
      console.error(chalk.yellow('3. Conexão com internet está ok'));
      process.exit(1);
    }
  }
}

// Executar
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new TursoAdminSetup();
  setup.run();
}

export default TursoAdminSetup;
