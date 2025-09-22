#!/bin/bash

# Test script for new interface design

echo "Testing new MCP Terminal Assistant interface..."
echo ""

# Create temporary test input
cat << 'EOF' > /tmp/test-input.txt
How many files are in the current directory?
Exit
EOF

# Run the interface with test input
export MCP_USER=testui
cat /tmp/test-input.txt | node src/mcp-ink-cli.mjs 2>&1 | tail -30

echo ""
echo "Interface test complete!"

# Cleanup
rm -f /tmp/test-input.txt