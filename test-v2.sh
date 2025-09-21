#!/bin/bash
# Teste da interface v2
echo "🧪 Testando interface v2..."
echo "Para sair: Ctrl+C"
echo ""
node interface-v2/mcp-ink-cli.mjs --user "${1:-$USER}"
