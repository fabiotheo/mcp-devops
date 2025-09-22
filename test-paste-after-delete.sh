#!/bin/bash

echo "Testing paste after deleting all input..."
echo ""
echo "This test will:"
echo "1. Start the app with debug mode"
echo "2. You should type something"
echo "3. Delete everything with backspace"
echo "4. Try to paste again"
echo ""

export MCP_USER=testpaste
node src/mcp-ink-cli.mjs --debug