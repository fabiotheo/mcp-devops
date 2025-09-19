#!/bin/bash

echo "=== Teste de Bracketed Paste Mode ==="
echo ""
echo "Para testar o paste de múltiplas linhas:"
echo "1. Cole este texto de exemplo:"
echo ""
echo "linha 1"
echo "linha 2"
echo "linha 3"
echo ""
echo "2. O texto deve aparecer como:"
echo "   linha 1\\nlinha 2\\nlinha 3"
echo ""
echo "3. Ao pressionar Enter, será processado corretamente"
echo ""
echo "Iniciando interface com DEBUG..."
echo ""

# Executa com debug para ver os logs de paste
MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs --debug