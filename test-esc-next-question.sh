#!/bin/bash

echo "════════════════════════════════════════════════════════════════════"
echo "      🔍 TESTE: NOVA PERGUNTA APÓS CANCELAMENTO COM ESC"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Este teste verifica se perguntas funcionam após cancelar com ESC"
echo ""
echo "INSTRUÇÕES DO TESTE:"
echo ""
echo "1. Digite uma pergunta longa, como:"
echo "   'explique em detalhes o que é machine learning'"
echo ""
echo "2. Quando aparecer '⠋ Processing...', pressione ESC"
echo "   → Deve mostrar: 'Operation cancelled by user'"
echo ""
echo "3. IMEDIATAMENTE digite uma nova pergunta simples:"
echo "   'que horas são?'"
echo ""
echo "4. Pressione ENTER"
echo ""
echo "✅ SUCESSO: A nova pergunta deve ser processada normalmente"
echo "❌ FALHA: Se a pergunta não for enviada na primeira vez"
echo ""
echo "Iniciando interface com DEBUG em 3 segundos..."
echo ""
sleep 3

MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs --debug