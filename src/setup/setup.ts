#!/usr/bin/env node
// setup.ts - Entrada principal simplificada (~200 linhas vs 620+ do orchestrator)

import { SetupOptions, SetupConfig, APIConfig } from './setup-types.js';
import { loadConfig, saveConfig } from './setup-config-functions.js';
import { createDirectories, installFiles } from './setup-install.js';
import { configureShell } from './setup-shell.js';
import { validateInstallation } from './setup-validate.js';
import { getUserHome, detectShell, detectPlatform } from './setup-system.js';
import * as path from 'path';

/**
 * Configuração padrão do setup
 */
function createSetupConfig(options: SetupOptions = {}): SetupConfig {
  const homeDir = getUserHome();
  const mcpDir = path.join(homeDir, '.mcp-terminal');

  return {
    mcpDir,
    configDir: path.join(mcpDir, 'config'),
    homeDir,
    platform: detectPlatform(),
    shell: detectShell(),
    version: '1.0.0', // TODO: ler do package.json
    isRoot: process.getuid ? process.getuid() === 0 : false,
    verbose: options.verbose || false
  };
}

/**
 * Função principal de setup - substituindo as 5 classes complexas
 */
export async function setup(options: SetupOptions = {}): Promise<void> {
  const config = createSetupConfig(options);

  if (config.verbose) {
    console.log('🚀 Iniciando setup do MCP Terminal Assistant...');
    console.log(`📁 Diretório: ${config.mcpDir}`);
    console.log(`🖥️  Sistema: ${config.platform}`);
    console.log(`🐚 Shell: ${config.shell}`);
  }

  try {
    // 1. Criar diretórios essenciais
    await createDirectories(config);
    if (config.verbose) console.log('✅ Diretórios criados');

    // 2. Carregar/criar configuração
    let apiConfig: APIConfig;
    try {
      apiConfig = await loadConfig(config);
      if (config.verbose) console.log('✅ Configuração carregada');
    } catch {
      if (options.auto) {
        // Configuração padrão para modo automático
        apiConfig = {
          ai_provider: 'claude',
          version: '1.0.0',
          created: new Date().toISOString()
        };
      } else {
        // TODO: Implementar prompt interativo
        throw new Error('Configuração não encontrada. Use --auto para configuração padrão');
      }
      await saveConfig(config, apiConfig);
      if (config.verbose) console.log('✅ Configuração criada');
    }

    // 3. Instalar arquivos
    await installFiles(config, options);
    if (config.verbose) console.log('✅ Arquivos instalados');

    // 4. Configurar shell
    await configureShell(config);
    if (config.verbose) console.log('✅ Shell configurado');

    // 5. Validar instalação
    const isValid = await validateInstallation(config);
    if (!isValid) {
      throw new Error('Validação da instalação falhou');
    }

    console.log('🎉 Setup completo com sucesso!');

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Erro no setup:', err.message);
    if (config.verbose) {
      console.error('Stack trace:', err.stack);
    }
    process.exit(1);
  }
}

/**
 * Parse de argumentos da linha de comando
 */
function parseArgs(args: string[]): SetupOptions {
  const options: SetupOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--auto':
        options.auto = true;
        break;
      case '--upgrade':
        options.upgrade = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
Uso: node setup.ts [opções]

Opções:
  --auto      Instalação automática sem prompts
  --upgrade   Atualizar instalação existente
  --force     Forçar sobrescrita de arquivos
  --verbose   Modo verboso com mais detalhes
  --help      Mostrar esta ajuda
`);
        process.exit(0);
        break;
    }
  }

  return options;
}

/**
 * Entry point para execução direta
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  setup(options);
}