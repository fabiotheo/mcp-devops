#!/bin/bash

echo "Testing ipcom-chat --configure flag"
echo "===================================="
echo ""

# Show that the flag exists
echo "1. Checking if --configure flag is available:"
./ipcom-chat --help | grep configure
echo ""

echo "2. To configure AI settings, run:"
echo "   ./ipcom-chat --configure"
echo ""

echo "3. This will open the interactive AI configuration menu:"
echo "   - Choose AI provider (Claude, GPT, Gemini)"
echo "   - Select model"
echo "   - Configure API key"
echo "   - Enable/disable web search"
echo ""

# Test that it actually triggers configuration (with timeout for safety)
echo "4. Testing that flag triggers configuration (will timeout in 2 seconds):"
echo "5" | timeout 2 ./ipcom-chat --configure 2>&1 | head -10 || true
echo ""

echo "Test completed!"