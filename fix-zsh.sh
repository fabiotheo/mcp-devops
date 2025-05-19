#!/bin/bash
# Script para corrigir a integração Zsh

# Diretório de instalação do MCP
MCP_DIR=~/.mcp-terminal

# Backup do arquivo original
cp $MCP_DIR/zsh_integration.sh $MCP_DIR/zsh_integration.sh.bak
echo "✅ Backup criado em $MCP_DIR/zsh_integration.sh.bak"

# Modificar a função ask() para usar o script simplificado
sed -i 's/node ~\/.mcp-terminal\/mcp-assistant.js/node ~\/.mcp-terminal\/mcp-simple.js/g' $MCP_DIR/zsh_integration.sh
echo "✅ Função ask() atualizada para usar mcp-simple.js"

echo "✅ Correção concluída com sucesso"
echo ""
echo "📋 Próximos passos:"
echo "1. Reinicie seu terminal ou execute: source ~/.zshrc"
echo "2. Teste com: ask \"como listar arquivos por tamanho\""