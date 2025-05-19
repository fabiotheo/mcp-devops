#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

// Setup readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Função para configurar a API key
async function configurarAPI() {
  console.log('🔑 Configuração da API Key do Anthropic (Claude)');
  console.log('===============================================');
  console.log();
  console.log('Esta ferramenta configurará sua chave API do Anthropic para o MCP Terminal Assistant.');
  console.log();
  console.log('Você pode obter uma chave API no site:');
  console.log('https://console.anthropic.com/settings/keys');
  console.log();

  // Solicitar a chave API do usuário
  const apiKey = await new Promise(resolve => {
    rl.question('Digite sua Anthropic API key: ', resolve);
  });

  // Verificar se a chave API foi fornecida
  if (!apiKey || apiKey.trim().length < 10 || !apiKey.startsWith('sk-')) {
    console.log('❌ API key inválida. Deve começar com "sk-" e ter pelo menos 10 caracteres.');
    process.exit(1);
  }

  // Configuração para o usuário root
  try {
    const rootConfigPath = '/root/.mcp-terminal/config.json';
    let config = {};
    
    try {
      const content = await fs.readFile(rootConfigPath, 'utf8');
      config = JSON.parse(content);
    } catch (err) {
      // Se o arquivo não existir, cria uma configuração padrão
      config = {
        "ai_provider": "claude",
        "model": "claude-3-5-haiku-20241022",
        "max_calls_per_hour": 100,
        "enable_monitoring": true,
        "enable_assistant": true,
        "monitor_commands": ["npm", "yarn", "git", "docker", "make", "cargo", "go"],
        "quick_fixes": true,
        "auto_detect_fixes": false,
        "log_level": "info",
        "cache_duration_hours": 24
      };
    }
    
    // Atualiza a API key
    config.anthropic_api_key = apiKey;
    
    // Salva o arquivo de configuração
    await fs.mkdir('/root/.mcp-terminal', { recursive: true });
    await fs.writeFile(rootConfigPath, JSON.stringify(config, null, 2));
    console.log('✅ API key configurada com sucesso para o usuário root.');
  } catch (err) {
    console.log(`❌ Erro ao configurar API key para root: ${err.message}`);
  }

  console.log();
  console.log('🚀 Configuração concluída!');
  console.log();
  console.log('Para testar seu MCP Terminal Assistant, execute:');
  console.log('  sudo /home/ipcom/mcp/mcp-devops/teste-mcp.js');
  console.log();
  console.log('Para usar o assistente normalmente:');
  console.log('  1. Abra um novo terminal ou execute: source ~/.zshrc');
  console.log('  2. Digite: ask "como listar arquivos por tamanho"');
  console.log();

  rl.close();
}

// Executar a função principal
configurarAPI().catch(err => {
  console.error('❌ Erro durante a configuração:', err);
  rl.close();
});