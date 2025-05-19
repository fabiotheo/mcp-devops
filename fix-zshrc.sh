#!/bin/bash
# Script para corrigir o arquivo .zshrc

# Backup do arquivo original
cp ~/.zshrc ~/.zshrc.bak
echo "✅ Backup criado em ~/.zshrc.bak"

# Remover linhas duplicadas de integração do MCP
sed -i '/# MCP Terminal Integration/,+1{//!d;/# MCP Terminal Integration/d;}' ~/.zshrc
echo "✅ Linhas duplicadas removidas"

# Certificar-se de que apenas uma linha de integração está presente
LINE_COUNT=$(grep -c "source ~/.mcp-terminal/zsh_integration.sh" ~/.zshrc)
if [ "$LINE_COUNT" -gt 1 ]; then
  # Se ainda houver mais de uma linha, manter apenas a primeira
  sed -i '0,/source ~\/.mcp-terminal\/zsh_integration.sh/!{/source ~\/.mcp-terminal\/zsh_integration.sh/d;}' ~/.zshrc
  echo "✅ Linhas de source duplicadas removidas"
fi

# Verificar a linha final de integração
if ! grep -q "source ~/.mcp-terminal/zsh_integration.sh" ~/.zshrc; then
  # Se não houver nenhuma linha de integração, adicionar uma
  echo -e "\n# MCP Terminal Integration\nsource ~/.mcp-terminal/zsh_integration.sh" >> ~/.zshrc
  echo "✅ Linha de integração adicionada"
fi

echo "✅ Correção do .zshrc concluída com sucesso"
echo ""
echo "📋 Próximos passos:"
echo "1. Reinicie seu terminal ou execute: source ~/.zshrc"
echo "2. Teste com: ask \"como listar arquivos por tamanho\""