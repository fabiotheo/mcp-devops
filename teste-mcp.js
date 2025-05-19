#!/usr/bin/env node

// Importações usando ESM (ECMAScript Modules)
import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { Anthropic } from '@anthropic-ai/sdk';
import { spawnSync, execSync } from 'child_process';

// Função para ler a configuração
async function lerConfig() {
  try {
    const configPath = '/root/.mcp-terminal/config.json';
    const conteudo = await fs.readFile(configPath, 'utf8');
    return JSON.parse(conteudo);
  } catch (err) {
    console.error('❌ Erro ao ler configuração:', err.message);
    process.exit(1);
  }
}

// Função simples para testar a API do Anthropic
async function testarAPI() {
  try {
    console.log('🔍 Testando conexão com API Anthropic Claude...');
    
    // Ler a configuração para obter a API key
    const config = await lerConfig();
    
    if (!config.anthropic_api_key || config.anthropic_api_key === 'YOUR_API_KEY_HERE') {
      console.error('❌ API key não configurada.');
      console.log('Execute: sudo node /home/ipcom/mcp/mcp-devops/configurar-api.js');
      process.exit(1);
    }
    
    // Criar cliente Anthropic com a API key da configuração
    const client = new Anthropic({
      apiKey: config.anthropic_api_key,
    });
    
    // Fazer uma consulta simples para testar
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: 'Como listar arquivos por tamanho no Linux? Responda em português brevemente.'
        }
      ]
    });
    
    console.log('\n✅ Conexão bem sucedida!\n');
    console.log('🤖 Resposta do Claude:');
    console.log('-------------------------------------------');
    console.log(response.content[0].text);
    console.log('-------------------------------------------');
    console.log('\nAgora você pode usar o comando "ask" para fazer perguntas ao MCP Terminal Assistant.');
    
  } catch (error) {
    console.error('\n❌ Erro ao conectar com a API:', error.message);
    console.log('\nVerifique sua chave API ou conexão com a internet.');
    console.log('Para configurar novamente, execute: sudo node /home/ipcom/mcp/mcp-devops/configurar-api.js');
  }
}

// Executar o teste
testarAPI();