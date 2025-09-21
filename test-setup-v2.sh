#!/bin/bash
# Teste do setup.js atualizado para v2

echo "🧪 TESTE DO SETUP.JS PARA V2"
echo "============================"
echo ""
echo "Este script irá:"
echo "  1. Verificar as mudanças no setup.js"
echo "  2. Mostrar quais arquivos serão copiados"
echo ""

# Verificar mudanças
echo "📝 Mudanças no setup.js:"
grep -n "interface-v2/mcp-ink-cli.mjs" setup.js | head -1
echo ""

echo "📦 Diretórios que serão copiados:"
echo "  - libs/ ($(ls libs/ 2>/dev/null | wc -l) arquivos)"
echo "  - ai_models/ ($(ls ai_models/ 2>/dev/null | wc -l) arquivos)"
echo "  - interface-v2/ ($(ls interface-v2/ 2>/dev/null | wc -l) arquivos)"
echo ""

echo "⚠️  Para executar a instalação real:"
echo "  node setup.js --upgrade --auto"
echo ""
echo "💡 Recomendado: Teste em modo dry-run primeiro"
