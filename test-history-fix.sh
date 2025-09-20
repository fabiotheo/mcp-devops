#!/bin/bash

echo "════════════════════════════════════════════════════════════════════"
echo "      🔍 TESTE FINAL: CONTEXTO COM ORCHESTRATOR"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Este é o teste definitivo do contexto após todas as correções"
echo ""
echo "INSTRUÇÕES:"
echo ""
echo "1. Digite: 'Oi, sou o Fábio, teste final'"
echo "   Pressione ENTER e depois ESC para cancelar"
echo ""
echo "2. Digite: 'O que eu disse antes?'"
echo "   Pressione ENTER"
echo ""
echo "✅ SUCESSO: A IA deve mencionar 'Fábio' e 'teste final'"
echo "❌ FALHA: Se disser que não houve interação anterior"
echo ""
echo "Iniciando em 3 segundos..."
sleep 3

MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs --debug