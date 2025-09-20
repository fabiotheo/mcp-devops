#!/bin/bash

echo "Testing Turso interface..."
(
    sleep 2
    echo "Teste de salvamento no Turso"
    sleep 1
    echo "exit"
) | node interface-v2/mcp-ink-cli.mjs --user fabio --debug 2>&1 | tee /tmp/turso-test.log

echo ""
echo "=== Checking for Turso-related logs ==="
grep -i turso /tmp/turso-test.log || echo "No Turso logs found"

echo ""
echo "=== Checking for save-related logs ==="
grep -i "save\|request_id\|status" /tmp/turso-test.log || echo "No save logs found"