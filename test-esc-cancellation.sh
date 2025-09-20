#!/bin/bash

echo "════════════════════════════════════════════════════════════════════"
echo "           🔍 TESTE DE CANCELAMENTO COM ESC"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Este teste verifica se o ESC cancela corretamente as requisições à IA"
echo ""
echo "INSTRUÇÕES:"
echo ""
echo "1. Digite uma pergunta que demora para processar, como:"
echo "   'explique em detalhes o que é machine learning'"
echo ""
echo "2. Assim que aparecer '⠋ Processing...', pressione ESC"
echo ""
echo "3. Deve aparecer: 'Operation cancelled by user'"
echo ""
echo "4. IMPORTANTE: A IA NÃO deve responder depois do cancelamento"
echo ""
echo "5. Se a IA responder mesmo após o cancelamento, o teste FALHOU"
echo ""
echo "6. Para sair, pressione Ctrl+C duas vezes rapidamente"
echo ""
echo "Iniciando interface em 3 segundos..."
echo ""
sleep 3

echo "INICIANDO COM DEBUG PARA VER LOGS DETALHADOS:"
echo ""

MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs --debug