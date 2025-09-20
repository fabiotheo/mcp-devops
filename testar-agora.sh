#!/bin/bash

clear
echo "════════════════════════════════════════════════════════════════════"
echo "         🚀 TESTE MANUAL DA PRESERVAÇÃO DE CONTEXTO"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Vamos testar se o contexto é preservado após cancelar com ESC."
echo ""
echo "📝 INSTRUÇÕES:"
echo ""
echo "1️⃣  PRIMEIRA MENSAGEM:"
echo "    Digite: Oi, sou o Fábio, teste"
echo "    Aperte ENTER"
echo "    Quando começar a processar, aperte ESC para cancelar"
echo ""
echo "2️⃣  SEGUNDA MENSAGEM:"
echo "    Digite: O que eu disse antes?"
echo "    Aperte ENTER e deixe processar"
echo ""
echo "✅ SUCESSO: Se a IA mencionar 'Fábio' e 'teste'"
echo "❌ FALHA: Se disser que não houve interação anterior"
echo ""
echo "Iniciando em 3 segundos..."
echo ""
sleep 3

# Rodar com debug para ver os logs
MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs --debug