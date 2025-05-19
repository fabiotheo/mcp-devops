#!/bin/bash
# Script para corrigir o problema globalmente usando um link simbólico

# Verifica se o script mcp-ask existe
if [ ! -f /home/ipcom/mcp/mcp-devops/mcp-ask ]; then
  echo "❌ Erro: O script mcp-ask não existe."
  echo "Por favor, execute primeiro o script para criar o mcp-ask."
  exit 1
fi

# Garantir que o script é executável
chmod +x /home/ipcom/mcp/mcp-devops/mcp-ask
echo "✅ Script mcp-ask configurado como executável"

# Criar um link simbólico no diretório /usr/local/bin
sudo ln -sf /home/ipcom/mcp/mcp-devops/mcp-ask /usr/local/bin/ask
echo "✅ Link simbólico para o comando 'ask' criado"

# Criar o mesmo link para o comando 'q'
sudo ln -sf /home/ipcom/mcp/mcp-devops/mcp-ask /usr/local/bin/q
echo "✅ Link simbólico para o comando 'q' criado"

echo "✅ Correção global concluída com sucesso"
echo ""
echo "📋 Agora você pode usar o comando 'ask' ou 'q' diretamente:"
echo "   ask \"como listar arquivos por tamanho\""
echo "   q \"como listar processos\""