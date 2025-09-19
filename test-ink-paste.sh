#!/bin/bash

echo "=== Teste de Multi-line Paste na Interface Ink ==="
echo ""
echo "Para testar o paste de múltiplas linhas:"
echo "1. A interface vai abrir em 3 segundos"
echo "2. Cole este texto:"
echo ""
echo -e "\033[32mLinha 1"
echo "Linha 2"
echo -e "Linha 3\033[0m"
echo ""
echo "3. O texto deve aparecer como uma única entrada com quebras de linha"
echo "4. Pressione Enter para processar"
echo "5. Pressione Ctrl+C para sair"
echo ""
echo "Iniciando interface..."
sleep 3

# Run the interface
MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs