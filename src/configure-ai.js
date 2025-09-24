#!/usr/bin/env node

import readline from 'node:readline';
import fs from 'fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const CONFIG_PATH = path.join(process.env.HOME, '.mcp-terminal/config.json');

class AIConfigurator {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.config = {};
  }

  async question(prompt) {
    return new Promise(resolve => {
      this.rl.question(prompt, answer => {
        resolve(answer);
      });
    });
  }

  async loadExistingConfig() {
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

  async selectProvider() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     🤖 CONFIGURAÇÃO DE IA DO MCP      ║');
    console.log('╚════════════════════════════════════════╝\n');

    console.log('Escolha seu provedor de IA:\n');
    console.log('  1) Claude (Anthropic) - Recomendado');
    console.log('  2) GPT (OpenAI)');
    console.log('  3) Gemini (Google)');
    console.log('  4) Manter configuração atual');
    console.log('  5) Sair\n');

    const choice = await this.question(
      'Digite o número da sua escolha (1-5): ',
    );

    switch (choice) {
      case '1':
        return 'anthropic';
      case '2':
        return 'openai';
      case '3':
        return 'gemini';
      case '4':
        return 'keep';
      case '5':
        return 'exit';
      default:
        console.log('❌ Opção inválida. Tente novamente.');
        return await this.selectProvider();
    }
  }

  async selectModel(provider) {
    console.log('\n📋 Modelos disponíveis:');
    console.log('────────────────────────────────────────\n');

    const models = {
      anthropic: [
        {
          id: 'claude-opus-4-1-20250805',
          name: 'Claude Opus 4.1 (Mais poderoso e inteligente)',
          premium: true,
        },
        {
          id: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4 (Alto desempenho)',
          recommended: true,
        },
        {
          id: 'claude-3-7-sonnet-20250219',
          name: 'Claude Sonnet 3.7 (Excelente custo-benefício)',
        },
        {
          id: 'claude-3-5-haiku-20241022',
          name: 'Claude Haiku 3.5 (Mais rápido)',
          fast: true,
        },
        { id: 'claude-3-haiku-20240307', name: 'Claude Haiku 3 (Econômico)' },
      ],
      openai: [
        { id: 'gpt-4o', name: 'GPT-4o (Mais recente)', recommended: true },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
        { id: 'gpt-4', name: 'GPT-4' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Mais econômico)' },
      ],
      gemini: [
        { id: 'gemini-pro', name: 'Gemini Pro', recommended: true },
        { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' },
      ],
    };

    const providerModels = models[provider];
    providerModels.forEach((model, index) => {
      let badge = '';
      if (model.premium) badge = ' 👑 PREMIUM';
      else if (model.recommended) badge = ' ⭐ RECOMENDADO';
      else if (model.fast) badge = ' ⚡ RÁPIDO';
      console.log(`  ${index + 1}) ${model.name}${badge}`);
    });

    console.log(
      `  ${providerModels.length + 1}) Digitar ID do modelo manualmente`,
    );
    console.log('\n────────────────────────────────────────');

    if (provider === 'anthropic') {
      console.log('\n💡 Dicas sobre os modelos Claude:');
      console.log(
        '  • Opus 4.1: Máxima inteligência, ideal para tarefas complexas',
      );
      console.log('  • Sonnet 4: Melhor equilíbrio entre performance e custo');
      console.log('  • Sonnet 3.7: Ótimo custo-benefício para uso geral');
      console.log(
        '  • Haiku 3.5: Respostas rápidas, ideal para comandos simples',
      );
    }

    console.log('');

    const choice = await this.question(
      `Escolha o modelo (1-${providerModels.length + 1}): `,
    );
    const choiceNum = parseInt(choice);

    if (choiceNum > 0 && choiceNum <= providerModels.length) {
      return providerModels[choiceNum - 1].id;
    } else if (choiceNum === providerModels.length + 1) {
      const customModel = await this.question('Digite o ID do modelo: ');
      return customModel.trim();
    } else {
      console.log('❌ Opção inválida. Tente novamente.');
      return await this.selectModel(provider);
    }
  }

  async getApiKey(provider) {
    const providerNames = {
      anthropic: 'Anthropic (Claude)',
      openai: 'OpenAI (GPT)',
      gemini: 'Google (Gemini)',
    };

    const apiUrls = {
      anthropic: 'https://console.anthropic.com/',
      openai: 'https://platform.openai.com/api-keys',
      gemini: 'https://ai.google.dev/',
    };

    console.log(
      `\n🔑 Configuração da API Key para ${providerNames[provider]}\n`,
    );
    console.log(`📌 Obtenha sua API key em: ${apiUrls[provider]}\n`);

    // Check if there's an existing key
    const existingKeyField = `${provider}_api_key`;
    if (
      this.config[existingKeyField] &&
      this.config[existingKeyField] !== `YOUR_${provider.toUpperCase()}_API_KEY`
    ) {
      const keepExisting = await this.question(
        'Já existe uma API key configurada. Deseja mantê-la? (S/n): ',
      );
      if (keepExisting.toLowerCase() !== 'n') {
        return this.config[existingKeyField];
      }
    }

    const apiKey = await this.question(
      'Cole sua API key aqui (será ocultada): ',
    );

    if (!apiKey || apiKey.trim().length < 10) {
      console.log('❌ API key inválida. Tente novamente.');
      return await this.getApiKey(provider);
    }

    return apiKey.trim();
  }

  async configureWebSearch() {
    console.log('\n🌐 Configuração de Web Search\n');

    const currentStatus = this.config.web_search?.enabled
      ? 'ativada'
      : 'desativada';
    console.log(`Status atual: ${currentStatus}\n`);

    const enable = await this.question(
      'Deseja ativar a busca na web para melhorar as respostas? (S/n): ',
    );

    return enable.toLowerCase() !== 'n';
  }

  async saveConfig() {
    // Ensure directory exists
    const configDir = path.dirname(CONFIG_PATH);
    if (!existsSync(configDir)) {
      await fs.mkdir(configDir, { recursive: true });
    }

    // Save configuration
    await fs.writeFile(CONFIG_PATH, JSON.stringify(this.config, null, 2));
    console.log(`\n✅ Configuração salva em: ${CONFIG_PATH}`);
  }

  async testConfiguration() {
    console.log('\n🧪 Testando configuração...\n');

    try {
      // Try to run a simple test
      const testCommand = `node ${path.join(path.dirname(import.meta.url.replace('file://', '')), 'mcp-assistant.js')} --model`;
      const result = execSync(testCommand, { encoding: 'utf8' });

      if (result.includes('Modelo de IA:')) {
        console.log('✅ Configuração testada com sucesso!');
        console.log(result);
        return true;
      }
    } catch (error) {
      console.log('⚠️  Não foi possível testar automaticamente.');
    }

    console.log('\n💡 Teste manualmente com: ask --model');
    return false;
  }

  async run() {
    console.clear();

    // Load existing config
    const hasExisting = await this.loadExistingConfig();
    if (hasExisting) {
      console.log('✅ Configuração existente carregada.\n');
    }

    // Select provider
    const provider = await this.selectProvider();

    if (provider === 'exit') {
      console.log('\n👋 Configuração cancelada.');
      this.rl.close();
      return;
    }

    if (provider === 'keep') {
      console.log('\n✅ Mantendo configuração atual.');
      this.rl.close();
      return;
    }

    // Select model
    const model = await this.selectModel(provider);

    // Get API key
    const apiKey = await this.getApiKey(provider);

    // Configure web search
    const webSearchEnabled = await this.configureWebSearch();

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
    if (!this.config.enable_assistant) {
      this.config.enable_assistant = true;
    }

    // Save configuration
    await this.saveConfig();

    // Test configuration
    await this.testConfiguration();

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     ✅ CONFIGURAÇÃO CONCLUÍDA!         ║');
    console.log('╚════════════════════════════════════════╝\n');

    console.log('📝 Resumo da configuração:');
    console.log(`   • Provedor: ${provider}`);
    console.log(`   • Modelo: ${model}`);
    console.log(
      `   • Web Search: ${webSearchEnabled ? 'Ativado' : 'Desativado'}`,
    );
    console.log('\n🚀 Comandos úteis:');
    console.log('   ask "sua pergunta"       # Fazer uma pergunta');
    console.log('   ask --model              # Ver modelo atual');
    console.log('   ask --provider-info      # Ver configuração completa');
    console.log('   ask --help               # Ver todos os comandos\n');

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
