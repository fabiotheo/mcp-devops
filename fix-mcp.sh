#!/bin/bash

# Fix MCP Terminal Assistant - Script para corrigir problemas
echo "🔧 Corrigindo instalação do MCP Terminal Assistant..."

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Este script precisa ser executado como root (sudo)."
  exit 1
fi

# Configurar diretório MCP
MCP_DIR="/root/.mcp-terminal"
mkdir -p $MCP_DIR/cache
mkdir -p $MCP_DIR/logs
mkdir -p $MCP_DIR/patterns
mkdir -p $MCP_DIR/ai_models

# Atualizar arquivo de configuração
echo '{
  "ai_provider": "claude",
  "anthropic_api_key": "sk-ant-api03-X_PrP_I8YQ0j4Eu8_RoWEA",
  "model": "claude-3-5-haiku-20241022",
  "max_calls_per_hour": 100,
  "enable_monitoring": true,
  "enable_assistant": true,
  "monitor_commands": ["npm", "yarn", "git", "docker", "make", "cargo", "go"],
  "quick_fixes": true,
  "auto_detect_fixes": false,
  "log_level": "info",
  "cache_duration_hours": 24
}' > $MCP_DIR/config.json

# Copiar arquivos necessários
echo "📂 Copiando arquivos..."
cp -f /home/ipcom/mcp/mcp-devops/mcp-assistant.js $MCP_DIR/
cp -f /home/ipcom/mcp/mcp-devops/mcp-client.js $MCP_DIR/
cp -f /home/ipcom/mcp/mcp-devops/system_detector.js $MCP_DIR/
cp -f /home/ipcom/mcp/mcp-devops/zsh_integration.sh $MCP_DIR/

# Copiar modelos de IA
cp -f /home/ipcom/mcp/mcp-devops/ai_models/*.js $MCP_DIR/ai_models/

# Tornar executáveis
chmod +x $MCP_DIR/mcp-assistant.js
chmod +x $MCP_DIR/mcp-client.js

# Instalar dependências
echo "📦 Instalando dependências..."
cd $MCP_DIR
npm init -y >/dev/null 2>&1
npm install @anthropic-ai/sdk minimist chalk >/dev/null 2>&1

# Criar links para execução fácil
mkdir -p /usr/local/bin
ln -sf $MCP_DIR/mcp-assistant.js /usr/local/bin/mcp-ask
echo '#!/bin/bash
node /root/.mcp-terminal/mcp-assistant.js "$@"
' > /usr/local/bin/ask
chmod +x /usr/local/bin/ask

# Adicionar integração do Zsh
if [ -f "/root/.zshrc" ]; then
  if ! grep -q "source $MCP_DIR/zsh_integration.sh" /root/.zshrc; then
    echo -e "\n# MCP Terminal Integration\nsource $MCP_DIR/zsh_integration.sh\n" >> /root/.zshrc
  fi
fi

echo "✅ MCP Terminal Assistant corrigido com sucesso!"
echo ""
echo "📋 Instruções de uso:"
echo "1. Use o comando 'ask \"sua pergunta\"' para fazer perguntas"
echo "2. Exemplo: ask \"como listar arquivos por tamanho\""
echo ""
echo "🔄 Reinicie seu terminal ou execute 'source ~/.zshrc' para ativar completamente"