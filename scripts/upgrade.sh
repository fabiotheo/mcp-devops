#!/bin/bash
# Script de atualização rápida para o MCP Terminal Assistant

echo "🔄 Iniciando atualização do MCP Terminal Assistant..."

# Verifica se estamos no diretório correto
if [ ! -f "setup.js" ]; then
  echo "❌ Erro: Este script deve ser executado do diretório principal do projeto MCP"
  exit 1
fi

# Executa o script de atualização
echo "📦 Executando atualização automática..."
node setup.js --upgrade --auto

# Verifica se a atualização foi bem-sucedida
if [ $? -eq 0 ]; then
  echo "✅ Atualização concluída com sucesso!"
  echo "📋 Lembre-se de reiniciar seu terminal ou executar: source ~/.zshrc"
else
  echo "❌ Erro durante a atualização. Verifique as mensagens acima."
  exit 1
fi
