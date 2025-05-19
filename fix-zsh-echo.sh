#!/bin/bash
# Script para corrigir a mensagem da integração Zsh

# Diretório de instalação do MCP
MCP_DIR=~/.mcp-terminal

# Modificar a mensagem de echo para usar o script simplificado
sed -i 's/echo "🚀 Executando: node ~\/.mcp-terminal\/mcp-assistant.js/echo "🚀 Executando: node ~\/.mcp-terminal\/mcp-simple.js/g' $MCP_DIR/zsh_integration.sh
echo "✅ Mensagem de echo atualizada"

echo "✅ Correção concluída com sucesso"
echo ""
echo "📋 Próximos passos:"
echo "1. Reinicie seu terminal ou execute: source ~/.zshrc"
echo "2. Teste com: ask \"como listar arquivos por tamanho\""