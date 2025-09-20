#!/usr/bin/env node

import { Anthropic } from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

// Caminhos importantes
const CONFIG_PATH = '/root/.mcp-terminal/config.json';
const HISTORY_PATH = '/root/.mcp-terminal/command-history.json';

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
        
        // Salvar no histórico
        try {
          let history = [];
          try {
            const histData = await fs.readFile(HISTORY_PATH, 'utf8');
            history = JSON.parse(histData);
          } catch (err) {}
          
          history.unshift({
            timestamp: new Date().toISOString(),
            question,
            command,
            system: systemInfo,
            provider: 'Anthropic Claude',
          });
          
          history = history.slice(0, 100); // Manter apenas os últimos 100
          await fs.writeFile(HISTORY_PATH, JSON.stringify(history, null, 2));
        } catch (err) {
          console.error('⚠️ Erro ao salvar histórico:', err.message);
        }
        
        // Perguntar se o usuário quer executar o comando usando o módulo readline diretamente
        process.stdout.write(`\n❓ Deseja executar o comando sugerido: \`${command}\` ? (y/N): `);
        
        // Leitura síncrona para garantir que o processo não termine antes da resposta
        const answer = await new Promise(resolve => {
          const onData = (data) => {
            const input = data.toString().trim().toLowerCase();
            process.stdin.removeListener('data', onData);
            process.stdin.pause();
            resolve(input);
          };
          
          process.stdin.resume();
          process.stdin.setEncoding('utf8');
          process.stdin.on('data', onData);
        });
        
        if (answer === 'y' || answer === 'yes') {
          console.log(`\n▶️  Executando: ${command}\n`);
          try {
            execSync(command, { stdio: 'inherit' });
          } catch (execError) {
            console.error(`\n❌ Erro ao executar comando: ${execError.message}`);
          }
        } else {
          console.log('Comando não executado.');
        }
      }
    } else {
      console.log('❌ Resposta vazia ou inválida da API.');
    }
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    if (error.stack) console.error('Detalhes:', error.stack.split('\n')[1]);
  }
}

// Processar argumentos
const args = process.argv.slice(2);

// Verificar comandos especiais
if (args[0] === '--help' || args[0] === '-h' || args.length === 0) {
  console.log(`
🔍 MCP Terminal Assistant (Versão Simplificada)

USO:
  mcp-ask "sua pergunta sobre comando linux"
  mcp-ask --history                    # Ver histórico dos últimos 10 comandos

EXEMPLOS:
  mcp-ask "como listar arquivos por data de modificação"
  mcp-ask "encontrar arquivos maiores que 1GB em /var/log"
  `);
  process.exit(0);
}

// Verificar se é para mostrar histórico
if (args[0] === '--history') {
  try {
    const historyData = await fs.readFile(HISTORY_PATH, 'utf8');
    const history = JSON.parse(historyData);
    console.log('\n📚 Últimos comandos sugeridos (até 10 mais recentes):\n');
    history.slice(0, 10).forEach((entry, i) => {
      console.log(`${i + 1}. Pergunta: ${entry.question}`);
      console.log(`   💻 Comando: ${entry.command}`);
      console.log(`   📅 Data: ${new Date(entry.timestamp).toLocaleString()}`);
      console.log('');
    });
  } catch (err) {
    if (err.code === 'ENOENT') console.log('Nenhum histórico encontrado.');
    else console.error('❌ Erro ao ler histórico:', err.message);
  }
  process.exit(0);
}

// Processar pergunta normal
const question = args.join(' ');
simpleAsk(question).catch(console.error);