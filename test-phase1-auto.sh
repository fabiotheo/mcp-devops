#!/bin/bash

# Test script for Phase 1 - Automated version

echo "Starting Phase 1 automated test..."
echo ""

# Start the app in the background with debug mode
echo "Starting app in debug mode..."
MCP_USER=fabio timeout 30 node interface-v2/mcp-ink-cli.mjs --debug > test-output.log 2>&1 <<EOF &
O brasil foi criado em que ano?
EOF

APP_PID=$!
sleep 3

# Send ESC to cancel
echo "Sending ESC to cancel..."
kill -INT $APP_PID 2>/dev/null

# Wait a bit and restart to ask the follow-up
sleep 2

echo "Starting app again to ask about previous message..."
MCP_USER=fabio timeout 20 node interface-v2/mcp-ink-cli.mjs --debug >> test-output.log 2>&1 <<EOF
O que eu disse na pergunta anterior?
exit
EOF

echo ""
echo "=== Test Results ==="
echo ""
echo "Checking for key indicators in the log:"
echo ""

# Check if cancelled message was added to fullHistory
if grep -q "Adding cancelled message to fullHistory" test-output.log; then
    echo "✅ Cancelled message was added to fullHistory"
else
    echo "❌ Cancelled message NOT added to fullHistory"
fi

if grep -q "Added user message to fullHistory" test-output.log; then
    echo "✅ User message was added to fullHistory"
else
    echo "❌ User message NOT added to fullHistory"
fi

if grep -q "Added cancellation marker to history" test-output.log; then
    echo "✅ Cancellation marker was added"
else
    echo "❌ Cancellation marker NOT added"
fi

# Check if AI recognized the cancelled message
echo ""
echo "=== AI Response ==="
if grep -i -E "(brasil|criado|ano|pergunt)" test-output.log | tail -5; then
    echo ""
    echo "✅ AI mentioned the cancelled question"
else
    echo "❌ AI did not recognize the cancelled question"
fi

echo ""
echo "Full log saved to test-output.log"
echo "To view: cat test-output.log"