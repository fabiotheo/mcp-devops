#!/usr/bin/env node

/**
 * Script para executar migrations do Drizzle
 * Roda automaticamente após setup/upgrade
 */

import { createClient } from '@libsql/client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  console.log('📊 Executando migrations do banco de dados...');

  // Ler configuração
  const configPath = path.join(os.homedir(), '.mcp-terminal', 'config.json');

  if (!fs.existsSync(configPath)) {
    console.log('   ⚠️  Configuração não encontrada - pulando migrations');
    return;
  }

  let config;
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configContent);
  } catch (error: any) {
    console.log(`   ⚠️  Erro ao ler configuração: ${error.message}`);
    return;
  }

  // Verificar se Turso está configurado
  if (!config.turso_url || !config.turso_token) {
    console.log('   ℹ️  Turso não configurado - pulando migrations');
    return;
  }

  try {
    const client = createClient({
      url: config.turso_url,
      authToken: config.turso_token,
    });

    console.log('   🔄 Conectando ao banco de dados...');

    // Verificar se já existe a tabela de migrations
    const migrationsTableExists = await client.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='__drizzle_migrations'
    `);

    if (migrationsTableExists.rows.length === 0) {
      console.log('   📝 Primeira instalação - executando migrations iniciais...');

      // Localizar diretório de migrations (pode estar em diferentes lugares)
      const possiblePaths = [
        path.join(__dirname, '../../drizzle/migrations'),
        path.join(os.homedir(), '.mcp-terminal', 'drizzle', 'migrations'),
        path.join(process.cwd(), 'drizzle', 'migrations'),
      ];

      let migrationsDir: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          migrationsDir = p;
          break;
        }
      }

      if (!migrationsDir) {
        throw new Error('Diretório de migrations não encontrado');
      }

      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      if (migrationFiles.length === 0) {
        throw new Error('Nenhuma migration encontrada');
      }

      const migrationFile = migrationFiles[0];
      const migrationPath = path.join(migrationsDir, migrationFile);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

      // Executar migration
      const statements = migrationSQL
        .split('--> statement-breakpoint')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        await client.execute(statement);
      }

      console.log(`   ✅ ${statements.length} statements executados`);

      // Criar tabela de tracking
      await client.execute(`
        CREATE TABLE __drizzle_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL UNIQUE,
          created_at INTEGER DEFAULT (unixepoch())
        )
      `);

      // Registrar migration
      const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
      if (fs.existsSync(journalPath)) {
        const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
        const migrationEntry = journal.entries[0];

        await client.execute({
          sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
          args: [migrationEntry.tag, migrationEntry.when]
        });
      }

      console.log('   ✅ Banco de dados inicializado com sucesso');
    } else {
      console.log('   ✅ Banco de dados já inicializado');

      // TODO: Verificar se há migrations pendentes e executá-las
      // Por enquanto só verifica se existe
    }

    await client.close();

  } catch (error: any) {
    console.log(`   ⚠️  Erro ao executar migrations: ${error.message}`);
    console.log('   💡 As migrations serão executadas automaticamente na primeira execução');
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Erro:', error.message);
      process.exit(1);
    });
}

export default runMigrations;
