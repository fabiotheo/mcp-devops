#!/usr/bin/env node

/**
 * Wrapper aprimorado para o MCP Assistant
 * Este script chama o assistant com configurações otimizadas para garantir
 * que toda a saída seja capturada e exibida corretamente
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Obter argumentos da linha de comando
const args = process.argv.slice(2);

// Verificar se o usuário forneceu algum argumento
if (args.length === 0) {
  console.log("❌ Erro: Nenhuma pergunta fornecida");
  console.log("Uso: enhanced-ask \"como listar arquivos por tamanho\"");
  process.exit(1);
}

// Caminho para o script do assistente
const mcpAssistantPath = path.join(process.env.HOME, '.mcp-terminal/mcp-assistant.js');

// Verificar se o script do assistente existe
if (!fs.existsSync(mcpAssistantPath)) {
  console.log(`❌ Erro: Script do assistente não encontrado em ${mcpAssistantPath}`);
  process.exit(1);
}

console.log("🚀 Inicializando MCP Assistant...");
console.log(`📝 Pergunta: "${args.join(' ')}"`);
console.log("⏳ Aguardando resposta...");

// Executar o script do assistente com stdio herdado para garantir captura correta
const child = spawn('node', [mcpAssistantPath, ...args], {
  stdio: 'inherit',  // Herda entrada/saída padrão
  env: {
    ...process.env,
    NODE_OPTIONS: '--no-warnings --no-deprecation'  // Reduzir ruído na saída
  }
});

// Capturar código de saída
child.on('exit', (code) => {
  if (code !== 0) {
    console.log(`\n❌ O assistente encerrou com código de erro: ${code}`);
  }
  process.exit(code);
});

// Capturar erros do processo
child.on('error', (err) => {
  console.log(`\n❌ Erro ao executar o assistente: ${err.message}`);
  process.exit(1);
});