#!/bin/bash

echo "════════════════════════════════════════════════════════════════════"
echo "      🔍 DEBUG: RASTREANDO O HISTÓRICO"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Vamos ver os logs de debug do orchestrator"
echo ""
echo "Digite algo e veja se aparece:"
echo "🔍 [Orchestrator] Received context with history?"
echo "🟡 CLAUDE RECEIVED HISTORY:"
echo ""
sleep 2

MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs --debug 2>&1 | grep -E "(🔍|\[Debug\]|🟡|HISTORY)"