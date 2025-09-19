#!/bin/bash

echo "════════════════════════════════════════════════════════════════════"
echo "           🔍 TESTE DE PASTE COM DEBUG HABILITADO"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Instruções:"
echo "1. A interface vai abrir com DEBUG habilitado"
echo "2. Cole este texto (Cmd+V ou Ctrl+V):"
echo ""
echo -e "\033[32mLinha 1"
echo "Linha 2"
echo -e "Linha 3\033[0m"
echo ""
echo "3. Observe os logs de debug"
echo "4. O texto deve aparecer no campo de input"
echo "5. Pressione Ctrl+C para sair"
echo ""
echo "Iniciando interface com DEBUG em 3 segundos..."
sleep 3

# Run with debug
MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs --debug