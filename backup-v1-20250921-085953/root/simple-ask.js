#!/usr/bin/env node

import { Anthropic } from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';

// Caminhos importantes
const CONFIG_PATH = '/root/.mcp-terminal/config.json';

async function simpleAsk(question) {
  try {
    console.log(`\n🤔 Processando pergunta: "${question}"\n`);
    
    // Ler configuração
    const configData = await fs.readFile(CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);
    
    if (!config.anthropic_api_key || config.anthropic_api_key === 'YOUR_API_KEY_HERE') {
      console.error('❌ Chave API não configurada corretamente em config.json');
      process.exit(1);
    }
    
    // Criar cliente Anthropic
    const client = new Anthropic({
      apiKey: config.anthropic_api_key
    });
    
    // Obter informações do sistema
    let systemInfo = "Linux";
    try {
      const osRelease = await fs.readFile('/etc/os-release', 'utf8');
      const nameMatch = osRelease.match(/PRETTY_NAME="(.+?)"/);
      if (nameMatch) systemInfo = nameMatch[1];
    } catch (err) {}
    
    // Criar prompt
    const prompt = `Você é um assistente especializado em Linux/Unix que ajuda usuários a encontrar o comando correto para suas tarefas.

INFORMAÇÕES DO SISTEMA:
- OS: ${systemInfo}

PERGUNTA DO USUÁRIO: ${question}

FORMATO DA RESPOSTA:
🔧 COMANDO:
\`\`\`bash
comando exato aqui
\`\`\`

📝 EXPLICAÇÃO:
[Explicação clara do que faz]

💡 OPÇÕES ÚTEIS:
[Variações ou opções importantes]

Responda de forma direta e prática.`;
    
    // Enviar para a API
    console.log('🔄 Consultando API Anthropic...');
    const response = await client.messages.create({
      model: config.model || 'claude-3-5-haiku-20241022',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });
    
    if (response && response.content && response.content.length > 0) {
      // Exibir resposta
      console.log('\n');
      console.log('='.repeat(70));
      console.log('📋 RESPOSTA DO ASSISTENTE:');
      console.log('='.repeat(70));
      console.log(response.content[0].text);
      console.log('='.repeat(70));
      
      // Encontrar comando se existir
      const bashBlockMatch = response.content[0].text.match(/```bash\s*([\s\S]+?)\s*```/m);
      if (bashBlockMatch && bashBlockMatch[1]) {
        const command = bashBlockMatch[1].trim();
        // Perguntar se o usuário quer executar o comando
        console.log(`\n💻 Comando sugerido: ${command}`);
        console.log(`\nPara executá-lo, copie e cole no terminal.`);
      }
    } else {
      console.log('❌ Resposta vazia ou inválida da API.');
    }
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    if (error.stack) console.error('Detalhes:', error.stack.split('\n')[1]);
  }
}

// Obter pergunta da linha de comando
const question = process.argv.slice(2).join(' ');

if (!question) {
  console.log('\n❌ Uso: node simple-ask.js "sua pergunta aqui"');
  process.exit(1);
}

simpleAsk(question).catch(console.error);