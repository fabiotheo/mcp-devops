#!/usr/bin/env node

/**
 * ℹ️ SETUP PARA MÁQUINAS CLIENTES ℹ️
 *
 * Este script configura máquinas CLIENTES para usar o Turso.
 * NÃO cria schema - apenas configura a conexão.
 *
 * Para criar o schema (APENAS ADMINISTRADORES):
 *   Use: turso-admin-setup.js
 */

import { createClient, type Client } from '@libsql/client';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import * as readline from 'readline/promises';
import * as crypto from 'crypto';

/**
 * Turso configuration
 */
interface TursoConfig {
  turso_url?: string;
  turso_token?: string;
  turso_sync_url?: string;
  turso_sync_interval?: number;
  history_mode?: string;
  [key: string]: unknown;
}

/**
 * Machine information
 */
interface MachineInfo {
  id: string;
  hostname: string;
  platform: string;
  arch: string;
  username: string;
}

class TursoClientSetup {
  private configDir: string;
  private configPath: string;
  private machineIdPath: string;
  private client: Client | null;

  constructor() {
    this.configDir = path.join(os.homedir(), '.mcp-terminal');
    this.configPath = path.join(this.configDir, 'turso-config.json');
    this.machineIdPath = path.join(this.configDir, 'machine.json');
    this.client = null;
  }

  async displayClientBanner(): Promise<void> {
    console.clear();
    console.log(
      chalk.blue(
        '╔════════════════════════════════════════════════════════════════╗',
      ),
    );
    console.log(
      chalk.blue(
        '║                                                                ║',
      ),
    );
    console.log(
      chalk.blue(
        '║            CONFIGURAÇÃO DE MÁQUINA CLIENTE                    ║',
      ),
    );
    console.log(
      chalk.blue(
        '║                                                                ║',
      ),
    );
    console.log(
      chalk.blue(
        '║   Este script configura a conexão com Turso                   ║',
      ),
    );
    console.log(
      chalk.blue(
        '║   NÃO cria schema - apenas conecta ao banco existente         ║',
      ),
    );
    console.log(
      chalk.blue(
        '║                                                                ║',
      ),
    );
    console.log(
      chalk.blue(
        '╚════════════════════════════════════════════════════════════════╝',
      ),
    );
    console.log();
  }

  async checkExistingConfig(): Promise<void> {
    if (existsSync(this.configPath)) {
      const config = JSON.parse(await fs.readFile(this.configPath, 'utf8'));

      if (config.is_admin_config) {
        console.log(
          chalk.red('\n⚠️  ATENÇÃO: Esta máquina tem configuração de ADMIN!'),
        );
        console.log(
          chalk.red('════════════════════════════════════════════════════'),
        );
        console.log(
          chalk.yellow('\nEsta máquina já foi configurada como administrador.'),
        );
        console.log(
          chalk.yellow('Não é necessário executar o setup de cliente.'),
        );
        console.log(
          chalk.green('\n✅ Sistema já está configurado e pronto para uso.'),
        );
        process.exit(0);
      }

      console.log(chalk.yellow('\n⚠️  Configuração existente detectada'));
      console.log(chalk.gray(`  Arquivo: ${this.configPath}`));

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await rl.question(
        chalk.cyan('Deseja sobrescrever a configuração existente? (s/n): '),
      );
      rl.close();

      if (answer.toLowerCase() !== 's') {
        console.log(chalk.yellow('\nConfiguração cancelada.'));
        process.exit(0);
      }
    }
  }

  async getClientCredentials(): Promise<{ url: string; token: string }> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.cyan('\n📋 CONFIGURAÇÃO DE CLIENTE'));
    console.log(chalk.cyan('═════════════════════════════════'));
    console.log(chalk.yellow('\n⚠️  Use um token de CLIENTE (não admin)!'));
    console.log(
      chalk.gray('Token de cliente tem apenas permissões READ + WRITE\n'),
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
      token = await rl.question(chalk.cyan('Token de CLIENTE (não admin): '));
      if (token.length < 20) {
        console.log(
          chalk.red('❌ Token muito curto! Verifique se copiou corretamente.'),
        );
      }
    }

    rl.close();
    return { url, token };
  }

  async testConnection(credentials: { url: string; token: string }): Promise<boolean> {
    console.log(chalk.yellow('\n🔌 Testando conexão com o banco...'));

    try {
      this.client = createClient({
        url: credentials.url,
        authToken: credentials.token,
      });

      // Tentar uma query simples
      await this.client.execute('SELECT 1');
      console.log(chalk.green('✅ Conexão estabelecida com sucesso!'));

      // Verificar se o schema existe
      console.log(chalk.yellow('\n🔍 Verificando schema do banco...'));
      const result = await this.client.execute(`
                SELECT name FROM sqlite_master 
                WHERE type='table' 
                AND name IN ('users', 'machines', 'history_global')
            `);

      if (result.rows.length === 0) {
        console.log(chalk.red('\n❌ ERRO: Schema não encontrado no banco!'));
        console.log(chalk.red('════════════════════════════════════════════'));
        console.log(
          chalk.yellow(
            '\nO banco está vazio. O administrador precisa criar o schema primeiro.',
          ),
        );
        console.log(chalk.yellow('\nPeça ao administrador para executar:'));
        console.log(chalk.green('  node libs/turso-admin-setup.js'));
        process.exit(1);
      }

      console.log(chalk.green('✅ Schema encontrado! Tabelas principais:'));
      for (const row of result.rows) {
        console.log(chalk.gray(`  - ${row.name}`));
      }

      return true;
    } catch (error) {
      if (error.message.includes('PERMISSION_DENIED')) {
        console.log(chalk.red('\n❌ Token sem permissões adequadas!'));
        console.log(
          chalk.yellow(
            'Certifique-se de usar um token de CLIENTE com READ + WRITE.',
          ),
        );
      } else {
        console.log(chalk.red(`\n❌ Erro na conexão: ${error.message}`));
      }
      return false;
    }
  }

  async generateMachineId(): Promise<string> {
    // Verificar se já existe
    if (existsSync(this.machineIdPath)) {
      const data = JSON.parse(await fs.readFile(this.machineIdPath, 'utf8'));
      console.log(chalk.gray(`\n🔑 Machine ID existente: ${data.machine_id}`));
      return data.machine_id;
    }

    // Gerar novo ID
    const hostname = os.hostname();
    const username = os.userInfo().username;
    const platform = os.platform();
    const arch = os.arch();
    const timestamp = Date.now();

    const uniqueString = `${hostname}-${username}-${platform}-${arch}-${timestamp}`;
    const machineId = crypto
      .createHash('sha256')
      .update(uniqueString)
      .digest('hex');

    const machineData = {
      machine_id: machineId,
      hostname: hostname,
      username: username,
      platform: platform,
      arch: arch,
      created_at: new Date().toISOString(),
    };

    await fs.writeFile(
      this.machineIdPath,
      JSON.stringify(machineData, null, 2),
    );
    console.log(chalk.green(`\n🔑 Machine ID gerado: ${machineId}`));

    return machineId;
  }

  async registerMachine(machineId: string): Promise<void> {
    console.log(chalk.yellow('\n📊 Registrando máquina no banco...'));

    try {
      const hostname = os.hostname();
      const osInfo = `${os.type()} ${os.release()} ${os.arch()}`;
      const ipAddress = this.getLocalIP();

      // Verificar se já está registrada
      const existing = await this.client!.execute({
        sql: 'SELECT machine_id FROM machines WHERE machine_id = ?',
        args: [machineId],
      });

      if (existing.rows.length > 0) {
        // Atualizar last_seen
        await this.client!.execute({
          sql: `UPDATE machines 
                          SET last_seen = unixepoch(), 
                              hostname = ?,
                              ip_address = ?,
                              os_info = ?
                          WHERE machine_id = ?`,
          args: [hostname, ipAddress, osInfo, machineId],
        });
        console.log(
          chalk.green('✅ Máquina já registrada - informações atualizadas'),
        );
      } else {
        // Inserir nova máquina
        await this.client!.execute({
          sql: `INSERT INTO machines 
                          (machine_id, hostname, ip_address, os_info) 
                          VALUES (?, ?, ?, ?)`,
          args: [machineId, hostname, ipAddress, osInfo],
        });
        console.log(chalk.green('✅ Máquina registrada com sucesso!'));
      }

      console.log(chalk.gray(`  Hostname: ${hostname}`));
      console.log(chalk.gray(`  IP: ${ipAddress || 'N/A'}`));
      console.log(chalk.gray(`  OS: ${osInfo}`));
    } catch (error) {
      console.log(
        chalk.yellow(
          `\n⚠️  Não foi possível registrar máquina: ${error.message}`,
        ),
      );
      console.log(
        chalk.gray(
          'A máquina será registrada automaticamente no primeiro uso.',
        ),
      );
    }
  }

  getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return null;
  }

  async saveConfig(credentials: { url: string; token: string }, machineId: string): Promise<void> {
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
      machine_id: machineId,
      is_admin_config: false,
      created_at: new Date().toISOString(),
    };

    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green(`\n✅ Configuração salva em: ${this.configPath}`));
  }

  async askForUsername(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.cyan('\n👤 CONFIGURAÇÃO DE USUÁRIO'));
    console.log(chalk.cyan('════════════════════════════════'));
    console.log(
      chalk.yellow('Para usar o sistema, você precisa de um usuário.\n'),
    );

    const hasUser = await rl.question(
      chalk.cyan('Você já tem um usuário cadastrado? (s/n): '),
    );

    if (hasUser.toLowerCase() === 's') {
      const username = await rl.question(chalk.cyan('Qual seu username? '));
      console.log(
        chalk.green(
          `\n✅ Use o comando: ${chalk.white(`ipcom-chat --user ${username}`)}`,
        ),
      );
    } else {
      console.log(
        chalk.yellow(
          '\n📝 Para criar um usuário, peça ao administrador ou execute:',
        ),
      );
      console.log(
        chalk.green(
          '  ipcom-chat user create --username SEU_USER --name "Seu Nome" --email seu@email.com',
        ),
      );
    }

    rl.close();
  }

  async showNextSteps(): Promise<void> {
    console.log(
      chalk.green('\n╔════════════════════════════════════════════════════╗'),
    );
    console.log(
      chalk.green('║         CONFIGURAÇÃO DE CLIENTE CONCLUÍDA!        ║'),
    );
    console.log(
      chalk.green('╚════════════════════════════════════════════════════╝'),
    );

    console.log(chalk.yellow('\n📋 PRÓXIMOS PASSOS:'));
    console.log(chalk.white('\n1. Se você não tem usuário:'));
    console.log(
      chalk.gray(
        '   ipcom-chat user create --username USER --name "Nome" --email email@example.com',
      ),
    );

    console.log(chalk.white('\n2. Para usar o sistema:'));
    console.log(chalk.gray('   ipcom-chat                    # Modo global'));
    console.log(chalk.gray('   ipcom-chat --user USERNAME    # Modo usuário'));
    console.log(chalk.gray('   ipcom-chat --local            # Modo local'));
    console.log(chalk.gray('   ipcom-chat --hybrid           # Modo híbrido'));

    console.log(chalk.white('\n3. Comandos úteis:'));
    console.log(chalk.gray('   ipcom-chat history            # Ver histórico'));
    console.log(
      chalk.gray('   ipcom-chat history search TERMO  # Buscar no histórico'),
    );
    console.log(
      chalk.gray('   ipcom-chat machine info       # Informações da máquina'),
    );
    console.log(
      chalk.gray('   ipcom-chat user list          # Listar usuários'),
    );

    console.log(
      chalk.blue('\n💡 Dica: O histórico será sincronizado automaticamente!'),
    );
  }

  async run(): Promise<void> {
    try {
      // Verificar modo automático
      const isAuto = process.argv.includes('--auto');

      if (!isAuto) {
        // Mostrar banner apenas no modo interativo
        await this.displayClientBanner();
      }

      // No modo auto, verificar se já há configuração
      if (isAuto && existsSync(this.configPath)) {
        console.log('✅ Configuração Turso já existe, pulando setup...');
        return;
      }

      if (!isAuto) {
        // Verificar configuração existente apenas no modo interativo
        await this.checkExistingConfig();
      }

      // Obter credenciais
      let credentials;
      if (isAuto) {
        // No modo auto, verificar variáveis de ambiente ou arquivo de config
        if (!existsSync(this.configPath)) {
          console.log('⚠️  Modo automático: Configuração Turso não encontrada');
          console.log(
            '   Execute manualmente: node libs/turso-client-setup.js',
          );
          return;
        }
        const config = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
        credentials = { url: config.turso_url, token: config.turso_token };
      } else {
        credentials = await this.getClientCredentials();
      }

      // Testar conexão e verificar schema
      const connected = await this.testConnection(credentials);
      if (!connected) {
        console.log(
          chalk.red('\n❌ Falha na configuração. Verifique as credenciais.'),
        );
        process.exit(1);
      }

      // Gerar/obter Machine ID
      const machineId = await this.generateMachineId();

      // Registrar máquina
      await this.registerMachine(machineId);

      // Salvar configuração
      await this.saveConfig(credentials, machineId);

      if (!isAuto) {
        // Perguntar sobre usuário apenas no modo interativo
        await this.askForUsername();

        // Mostrar próximos passos
        await this.showNextSteps();
      } else {
        console.log('✅ Cliente Turso configurado com sucesso!');
      }
    } catch (error) {
      console.error(chalk.red('\n❌ ERRO FATAL:'), error.message);
      console.error(chalk.yellow('\nVerifique:'));
      console.error(chalk.yellow('1. URL do banco está correta'));
      console.error(
        chalk.yellow('2. Token tem permissões de CLIENTE (READ + WRITE)'),
      );
      console.error(chalk.yellow('3. Schema foi criado pelo administrador'));
      console.error(chalk.yellow('4. Conexão com internet está ok'));
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
  const setup = new TursoClientSetup();
  setup.run();
}

export default TursoClientSetup;
