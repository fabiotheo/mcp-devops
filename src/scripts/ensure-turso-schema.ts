#!/usr/bin/env node

/**
 * Script para garantir que o schema do Turso está atualizado
 * Roda automaticamente após setup/upgrade
 */

import TursoHistoryClient from '../libs/turso-client.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function ensureTursoSchema() {
  console.log('📊 Verificando schema do Turso...');

  // Ler configuração
  const configPath = path.join(os.homedir(), '.mcp-terminal', 'config.json');

  if (!fs.existsSync(configPath)) {
    console.log('   ⚠️  Configuração não encontrada - pulando verificação do Turso');
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
    console.log('   ℹ️  Turso não configurado - pulando verificação do schema');
    return;
  }

  // Inicializar cliente Turso (isso criará as tabelas)
  try {
    console.log('   🔄 Conectando ao Turso e verificando tabelas...');

    const tursoClient = new TursoHistoryClient({
      turso_url: config.turso_url,
      turso_token: config.turso_token,
      debug: false
    });

    await tursoClient.initialize();

    console.log('   ✅ Schema do Turso atualizado com sucesso');

    await tursoClient.close();

  } catch (error: any) {
    console.log(`   ⚠️  Erro ao atualizar schema: ${error.message}`);
    console.log('   💡 O schema será criado automaticamente na primeira execução');
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  ensureTursoSchema()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Erro:', error.message);
      process.exit(1);
    });
}

export default ensureTursoSchema;
