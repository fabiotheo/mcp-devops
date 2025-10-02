#!/bin/bash

echo "Testing ipcom-chat configure command..."
echo "======================================"
echo ""
echo "Available commands:"
./ipcom-chat --help | grep -E "(user|history|machine|configure)" | head -10
echo ""
echo "To test the configure command, run:"
echo "  ./ipcom-chat configure"
echo ""
echo "This will open the interactive AI configuration menu."