#!/bin/bash

# Script de teste manual do Turso com usuário fabio

echo "=== Teste Manual do Turso ==="
echo ""
echo "Este script vai abrir a interface com o usuário 'fabio'"
echo "Você pode fazer perguntas e elas serão salvas no histórico do Turso"
echo ""
echo "Para sair, use Ctrl+C"
echo ""
echo "Iniciando em 3 segundos..."
sleep 3

# Executa a interface com o usuário fabio
MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs