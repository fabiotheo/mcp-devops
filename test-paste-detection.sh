#!/bin/bash

# Test paste detection with debug mode
echo "Testing paste detection with debug mode..."
echo ""
echo "Paste the following multi-line text when prompted:"
echo "---"
echo "Linha 1"
echo "Linha 2"
echo "Linha 3"
echo "---"
echo ""

# Create test input with bracketed paste sequences
cat << 'EOF' > /tmp/test-paste.txt
[200~Linha 1
Linha 2
Linha 3
Linha 4
Linha 5[201~
Exit
EOF

# Run with debug to see what's happening
export MCP_USER=testpaste
cat /tmp/test-paste.txt | node src/mcp-ink-cli.mjs --debug 2>&1 | tail -50

rm -f /tmp/test-paste.txt