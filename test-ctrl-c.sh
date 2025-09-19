#!/bin/bash

echo "════════════════════════════════════════════════════════════════════"
echo "              🔍 TESTE DE CTRL+C"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Teste simples do Ctrl+C duplo:"
echo ""
echo "1. Pressione Ctrl+C uma vez"
echo "   - Deve mostrar: 'Press Ctrl+C again to exit'"
echo "   - A mensagem deve desaparecer após 2 segundos"
echo ""
echo "2. Pressione Ctrl+C duas vezes rapidamente"
echo "   - Deve sair do programa"
echo ""
echo "Iniciando interface em modo DEBUG para diagnóstico..."
echo ""
sleep 2

# Run in debug mode to see any errors
MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs --debug