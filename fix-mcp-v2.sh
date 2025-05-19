#!/bin/bash

# Script para correção final do MCP Terminal Assistant
echo "🔧 Corrigindo MCP Terminal Assistant (v2)..."

# Configurar ambiente
MCP_DIR="/root/.mcp-terminal"
CONFIG_PATH="$MCP_DIR/config.json"

# Verificar se o diretório existe
if [ ! -d "$MCP_DIR" ]; then
  echo "❌ Diretório MCP não encontrado. Criando..."
  sudo mkdir -p $MCP_DIR
  sudo mkdir -p $MCP_DIR/cache
  sudo mkdir -p $MCP_DIR/logs
  sudo mkdir -p $MCP_DIR/patterns
  sudo mkdir -p $MCP_DIR/ai_models
  echo "✅ Diretórios criados."
fi

# Verificar e atualizar comandos shell
echo "📝 Criando scripts executáveis..."

# Script para comandos ask
echo '#!/bin/bash
cd /root && NODE_DEBUG=system,module NODE_PATH=/root/.mcp-terminal/node_modules exec node /root/.mcp-terminal/mcp-assistant.js "$@"
' | sudo tee /usr/local/bin/ask > /dev/null
sudo chmod +x /usr/local/bin/ask

echo "✅ Script ask criado em /usr/local/bin/ask"

# Verificar e reinstalar dependências
echo "📦 Reinstalando dependências do Node.js..."
sudo mkdir -p "$MCP_DIR/node_modules"
cd "$MCP_DIR"
sudo bash -c "cd $MCP_DIR && npm install @anthropic-ai/sdk minimist chalk"
echo "✅ Dependências reinstaladas."

# Criar script para executar a IA diretamente
echo "🤖 Criando script para teste direto da API..."
echo '#!/usr/bin/env node

import { Anthropic } from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

// Caminho para o arquivo de configuração
const CONFIG_PATH = "/root/.mcp-terminal/config.json";

async function main() {
  try {
    console.log("🔍 Testando conexão com API Anthropic Claude...");
    
    // Ler a configuração
    const configContent = await fs.readFile(CONFIG_PATH, "utf8");
    const config = JSON.parse(configContent);
    
    if (!config.anthropic_api_key) {
      console.error("❌ API key não configurada em:", CONFIG_PATH);
      process.exit(1);
    }
    
    // Criar cliente Anthropic
    const client = new Anthropic({
      apiKey: config.anthropic_api_key,
    });
    
    console.log("📡 Enviando requisição para API...");
    
    // Testar com uma consulta simples
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: "Como listar arquivos por tamanho no Linux? Responda em português."
        }
      ]
    });
    
    console.log("\n✅ Teste bem sucedido! Resposta:\n");
    console.log("-------------------------------------------");
    console.log(response.content[0].text);
    console.log("-------------------------------------------");
    
  } catch (error) {
    console.error("\n❌ Erro na API:", error.message);
    if (error.stack) console.error(error.stack);
  }
}

main();
' | sudo tee "$MCP_DIR/api-test.js" > /dev/null
sudo chmod +x "$MCP_DIR/api-test.js"

echo "📊 Adicionando comando simplificado..."
echo '#!/bin/bash
echo "🔍 MCP Terminal - Assistente Linux"
cd /root && node '$MCP_DIR'/api-test.js "$@"
' | sudo tee /usr/local/bin/mcp-test > /dev/null
sudo chmod +x /usr/local/bin/mcp-test

echo -e "\n✅ Correção concluída!"
echo -e "\n📋 Instruções:"
echo "1. Para testar a conexão com a API: sudo mcp-test"
echo "2. Para usar o assistente completo: sudo ask \"como listar arquivos por tamanho\""
echo -e "\nSe o problema persistir, verifique os logs com:"
echo "sudo NODE_DEBUG=module,timer,net node $MCP_DIR/mcp-assistant.js \"como listar arquivos por tamanho\""