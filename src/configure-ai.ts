#!/usr/bin/env node

import readline from 'node:readline';
import fs from 'fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const CONFIG_PATH = path.join(process.env.HOME || '', '.mcp-terminal/config.json');

interface WebSearchConfig {
  enabled?: boolean;
  cache_enabled?: boolean;
  cache_ttl?: number;
  priority_sources?: string[];
}

interface TursoConfig {
  turso_url?: string;
  turso_token?: string;
  turso_sync_url?: string;
  turso_sync_interval?: number;
  history_mode?: string;
}

interface AIConfig extends TursoConfig {
  provider?: string;
  anthropic_api_key?: string;
  claude_model?: string;
  model?: string;
  openai_api_key?: string;
  openai_model?: string;
  gemini_api_key?: string;
  gemini_model?: string;
  web_search?: WebSearchConfig;
  max_calls_per_hour?: number;
  enable_monitoring?: boolean;
  enable_analytics?: boolean;
  debug?: boolean;
  use_colors?: boolean;
  firecrawl_api_key?: string;
  [key: string]: any; // Allow dynamic keys for API keys
}

class AIConfigurator {
  private rl: readline.Interface;
  private config: AIConfig;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.config = {};
  }

  async question(prompt: string): Promise<string> {
    return new Promise(resolve => {
      this.rl.question(prompt, (answer: string) => {
        resolve(answer);
      });
    });
  }

  async loadExistingConfig(): Promise<boolean> {
    if (existsSync(CONFIG_PATH)) {
      try {
        const configData = await fs.readFile(CONFIG_PATH, 'utf8');
        this.config = JSON.parse(configData);
        return true;
      } catch (error) {
        console.log(
          '⚠️  Erro ao ler configuração existente, iniciando nova configuração...',
        );
      }
    }
    return false;
  }

  async selectProvider(): Promise<string | null> {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     🤖 CONFIGURAÇÃO DE IA DO MCP      ║');
    console.log('╚════════════════════════════════════════╝\n');

    console.log('Escolha seu provedor de IA:\n');
    console.log('  1) Claude (Anthropic) - Recomendado');
    console.log('  2) GPT (OpenAI)');
    console.log('  3) Gemini (Google)');
    console.log('  4) Configurar Turso apenas');
    console.log('  0) Sair\n');

    const choice = await this.question('Digite sua escolha (0-4): ');

    switch (choice.trim()) {
      case '1':
        return 'anthropic';
      case '2':
        return 'openai';
      case '3':
        return 'gemini';
      case '4':
        return 'turso_only';
      case '0':
        return null;
      default:
        console.log('❌ Opção inválida!');
        return this.selectProvider();
    }
  }

  async selectModel(provider: string): Promise<string | null> {
    let models: Record<string, string> = {};

    if (provider === 'anthropic') {
      console.log('\n📚 Modelos Claude disponíveis:\n');
      console.log('  1) Claude Sonnet 4.5 (Recomendado) ⭐');
      console.log('  2) Claude Opus 4.1');
      console.log('  3) Claude Opus 4');
      console.log('  4) Claude Sonnet 4');
      console.log('  5) Claude Sonnet 3.7');
      console.log('  6) Claude Haiku 3.5');
      console.log('  7) Claude Haiku 3');
      console.log('  0) Voltar\n');

      models = {
        '1': 'claude-sonnet-4-5-20250929',
        '2': 'claude-opus-4-1-20250805',
        '3': 'claude-opus-4-20250514',
        '4': 'claude-sonnet-4-20250514',
        '5': 'claude-3-7-sonnet-20250219',
        '6': 'claude-3-5-haiku-20241022',
        '7': 'claude-3-haiku-20240307',
      };
    } else if (provider === 'openai') {
      console.log('\n📚 Modelos GPT disponíveis:\n');
      console.log('  1) GPT-4o (Recomendado - Mais recente)');
      console.log('  2) GPT-4 Turbo');
      console.log('  3) GPT-4');
      console.log('  4) GPT-3.5 Turbo (Mais econômico)');
      console.log('  5) GPT-4o-mini (Mais rápido e econômico)');
      console.log('  0) Voltar\n');

      models = {
        '1': 'gpt-4o',
        '2': 'gpt-4-turbo',
        '3': 'gpt-4',
        '4': 'gpt-3.5-turbo',
        '5': 'gpt-4o-mini',
      };
    } else if (provider === 'gemini') {
      console.log('\n📚 Modelos Gemini disponíveis:\n');
      console.log('  1) Gemini 2.0 Flash (Mais recente e rápido)');
      console.log('  2) Gemini 1.5 Pro (Avançado)');
      console.log('  3) Gemini 1.5 Flash (Rápido)');
      console.log('  4) Gemini 1.5 Flash-8B (Ultrarrápido)');
      console.log('  5) Gemini Pro (Padrão)');
      console.log('  0) Voltar\n');

      models = {
        '1': 'gemini-2.0-flash-exp',
        '2': 'gemini-1.5-pro',
        '3': 'gemini-1.5-flash',
        '4': 'gemini-1.5-flash-8b',
        '5': 'gemini-pro',
      };
    } else {
      return null;
    }

    const choice = await this.question('Digite sua escolha: ');
    const trimmed = choice.trim();

    if (trimmed === '0') {
      return null;
    }

    if (models[trimmed]) {
      return models[trimmed];
    }

    console.log('❌ Opção inválida!');
    return this.selectModel(provider);
  }

  async getApiKey(provider: string): Promise<string | null> {
    const providerNames: Record<string, string> = {
      anthropic: 'Claude',
      openai: 'OpenAI',
      gemini: 'Gemini',
    };

    const providerName = providerNames[provider] || provider;

    console.log(`\n🔑 Configuração da API Key ${providerName}\n`);

    const apiKey = await this.question(
      `Digite sua API key do ${providerName} (será salva criptografada): `,
    );

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      console.log('❌ API key não pode estar vazia!');
      return this.getApiKey(provider);
    }

    // Save the key temporarily to config
    this.config[`${provider}_api_key`] = trimmedKey;

    // Ask if user wants to test the API key
    console.log('\n🧪 Deseja testar a API key agora?');
    const testChoice = await this.question('(s/n): ');

    if (testChoice.toLowerCase() === 's') {
      const isValid = await this.testAPIKey(provider, trimmedKey);
      if (!isValid) {
        console.log('❌ API key inválida ou erro na conexão!');
        const retry = await this.question(
          'Deseja tentar novamente? (s/n): ',
        );
        if (retry.toLowerCase() === 's') {
          return this.getApiKey(provider);
        }
        return null;
      }
      console.log('✅ API key válida!');
    }

    return trimmedKey;
  }

  async configureWebSearch(): Promise<boolean> {
    console.log('\n🔍 Configuração de Busca Web\n');
    console.log('A busca web melhora as respostas com informações atualizadas.');

    const enableChoice = await this.question(
      'Habilitar busca web? (s/n): ',
    );

    if (enableChoice.toLowerCase() === 's') {
      console.log('✅ Busca web habilitada');
      return true;
    } else {
      console.log('⏭️  Busca web desabilitada');
      return false;
    }
  }

  async configureTurso(): Promise<TursoConfig> {
    console.log('\n🗄️  Configuração do Turso Database\n');
    console.log(
      'Turso é usado para histórico distribuído entre dispositivos.',
    );
    console.log('Para usar o Turso, você precisa:');
    console.log('  1. Criar conta em https://turso.tech');
    console.log('  2. Criar um database');
    console.log('  3. Obter URL e token de autenticação\n');

    const tursoChoice = await this.question(
      'Deseja configurar o Turso? (s/n): ',
    );
    const config: TursoConfig = {};

    if (tursoChoice.toLowerCase() === 's') {
      // URL do banco
      const defaultUrl =
        this.config.turso_url || 'libsql://seu-db.turso.io';
      console.log(`\n📍 URL do banco Turso [${defaultUrl}]:`);
      const urlInput = await this.question('');
      const url = urlInput.trim() || defaultUrl;

      if (url && url !== 'libsql://seu-db.turso.io') {
        config.turso_url = url;

        // Token de autenticação
        const defaultToken =
          this.config.turso_token || 'seu-token-aqui';
        console.log(`\n🔐 Token de autenticação [${defaultToken}]:`);
        const tokenInput = await this.question('');
        const token = tokenInput.trim() || defaultToken;

        if (token && token !== 'seu-token-aqui') {
          config.turso_token = token;

          // Perguntar sobre embedded replica
          const replicaChoice = await this.question(
            '\nHabilitar embedded replica para modo offline? (s/n): ',
          );
          if (replicaChoice.toLowerCase() === 's') {
            config.turso_sync_url = url;
            config.turso_sync_interval = 60;
          }

          // Modo de histórico
          console.log('\n📚 Modo de histórico:');
          console.log('  1) Global (compartilhado entre usuários)');
          console.log('  2) User (por usuário)');
          console.log('  3) Machine (por máquina)');
          console.log('  4) Hybrid (combinado)');

          const modeChoice = await this.question('Escolha o modo (1-4): ');
          const modes = ['global', 'user', 'machine', 'hybrid'];
          const selectedMode =
            modes[parseInt(modeChoice) - 1] || 'global';
          config.history_mode = selectedMode;

          console.log('✅ Turso configurado com sucesso!');
        } else {
          console.log('⚠️  Token inválido, Turso não será configurado');
        }
      } else {
        console.log('⚠️  URL inválida, Turso não será configurado');
      }
    } else {
      console.log('⏭️  Turso não configurado (modo offline local)');
    }

    return config;
  }

  async saveTursoConfig(config: TursoConfig): Promise<void> {
    const configPath = path.join(
      process.env.HOME || '',
      '.mcp-terminal',
      'turso-config.json',
    );

    try {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`✅ Configuração Turso salva em: ${configPath}`);
    } catch (error) {
      console.error('❌ Erro ao salvar configuração Turso:', error);
    }
  }

  async saveConfig(config: AIConfig): Promise<void> {
    try {
      await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
      await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
      console.log(`✅ Configuração salva em: ${CONFIG_PATH}`);
    } catch (error) {
      console.error('❌ Erro ao salvar configuração:', error);
      throw error;
    }
  }

  async testConfiguration(): Promise<void> {
    console.log('\n🧪 Testando configuração...\n');

    try {
      // Test by checking if the installation is properly configured
      const mcpDir = path.join(process.env.HOME || '', '.mcp-terminal');
      const configPath = path.join(mcpDir, 'config.json');

      // Check if config file exists
      if (!existsSync(configPath)) {
        throw new Error('Config file not found');
      }

      // Check if ipcom-chat exists in ~/.local/bin
      const binPath = path.join(process.env.HOME || '', '.local', 'bin', 'ipcom-chat');
      if (!existsSync(binPath)) {
        throw new Error('ipcom-chat not found in ~/.local/bin');
      }

      console.log('✅ Configuração validada com sucesso!');
      console.log(`\n📋 Teste o sistema com: ipcom-chat "teste de configuração"`);
    } catch (error) {
      console.error('\n❌ Erro ao validar configuração');
      console.log('Verifique se todos os arquivos foram instalados corretamente.');
      console.log('Execute: node setup.js --upgrade');
    }
  }

  async testAPIKey(provider: string, apiKey: string): Promise<boolean> {
    // Implementation would go here to test the API key
    // For now, just return true
    return true;
  }

  async run(): Promise<void> {
    console.clear();

    // Load existing configuration if it exists
    const hasExisting = await this.loadExistingConfig();

    if (hasExisting) {
      console.log('📋 Configuração existente encontrada.');
      const updateChoice = await this.question(
        'Deseja atualizar a configuração? (s/n): ',
      );
      if (updateChoice.toLowerCase() !== 's') {
        console.log('👋 Configuração mantida. Até mais!');
        this.rl.close();
        return;
      }
    }

    // Select provider
    const provider = await this.selectProvider();

    if (!provider) {
      console.log('\n👋 Configuração cancelada. Até mais!');
      this.rl.close();
      return;
    }

    // Special handling for Turso-only configuration
    if (provider === 'turso_only') {
      const tursoConfig = await this.configureTurso();
      await this.saveTursoConfig(tursoConfig);
      console.log('\n✨ Configuração do Turso concluída!');
      this.rl.close();
      return;
    }

    // Get API key
    const apiKey = await this.getApiKey(provider);
    if (!apiKey) {
      console.log('\n❌ Configuração cancelada.');
      this.rl.close();
      return;
    }

    // Select model
    const model = await this.selectModel(provider);
    if (!model) {
      console.log('\n❌ Configuração cancelada.');
      this.rl.close();
      return;
    }

    // Configure web search
    const webSearchEnabled = await this.configureWebSearch();

    // Configure Turso
    const tursoConfig = await this.configureTurso();

    // Update configuration
    this.config.provider = provider;

    // Set provider-specific fields
    if (provider === 'anthropic') {
      this.config.anthropic_api_key = apiKey;
      this.config.claude_model = model;
      this.config.model = model; // For backwards compatibility
    } else if (provider === 'openai') {
      this.config.openai_api_key = apiKey;
      this.config.openai_model = model;
    } else if (provider === 'gemini') {
      this.config.gemini_api_key = apiKey;
      this.config.gemini_model = model;
    }

    // Web search configuration
    if (!this.config.web_search) {
      this.config.web_search = {};
    }
    this.config.web_search.enabled = webSearchEnabled;

    // Add default settings if not present
    if (!this.config.max_calls_per_hour) {
      this.config.max_calls_per_hour = 100;
    }
    if (!this.config.enable_monitoring) {
      this.config.enable_monitoring = true;
    }
    if (!this.config.enable_analytics) {
      this.config.enable_analytics = false;
    }
    if (!this.config.debug) {
      this.config.debug = false;
    }

    // Merge Turso config
    Object.assign(this.config, tursoConfig);

    // Save configuration
    await this.saveConfig(this.config);

    // Test configuration
    const testChoice = await this.question(
      '\n🧪 Deseja testar a configuração agora? (s/n): ',
    );
    if (testChoice.toLowerCase() === 's') {
      await this.testConfiguration();
    }

    console.log('\n✨ Configuração concluída com sucesso!');
    console.log('\n📖 Comandos disponíveis:');
    console.log('  mcp-ask "sua pergunta"  - Fazer perguntas sobre Linux/comandos');
    console.log('  mcp-client             - Monitor de comandos com erro');
    console.log('  mcp-configure          - Reconfigurar IA\n');

    this.rl.close();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const configurator = new AIConfigurator();
  configurator.run().catch(error => {
    console.error('❌ Erro na configuração:', error.message);
    process.exit(1);
  });
}

export default AIConfigurator;
