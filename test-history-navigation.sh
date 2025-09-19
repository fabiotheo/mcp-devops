#!/bin/bash

echo "=== Teste de Navegação no Histórico ==="
echo ""
echo "Para testar a navegação no histórico:"
echo "1. Digite alguns comandos"
echo "2. Use ↑ (seta para cima) para navegar no histórico"
echo "3. Use ↓ (seta para baixo) para voltar"
echo ""
echo "Iniciando com DEBUG ativado para ver logs..."
echo ""

# Executa com debug ativado
MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs --debug