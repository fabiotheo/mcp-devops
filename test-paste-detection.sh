#!/bin/bash

echo "=== Teste de Detecção de Paste ==="
echo ""
echo "Instruções:"
echo "1. Quando a interface abrir, cole este texto multi-linha:"
echo ""
echo "linha 1"
echo "linha 2"
echo "linha 3"
echo ""
echo "2. O texto deve aparecer completo no campo de input"
echo "3. Pressione Enter para processar"
echo ""
echo "Iniciando interface em 3 segundos..."
sleep 3

# Executa a interface
MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs