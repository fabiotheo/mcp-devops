#!/bin/bash

echo "═══════════════════════════════════════════════════════════════"
echo "       MCP Terminal Assistant - Real Backend Integration Test"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}This test will connect to the real AI backend.${NC}"
echo ""

# Check if required files exist
echo "Checking required files..."

if [ ! -f "interface-v2/mcp-ink-cli.mjs" ]; then
    echo -e "${RED}❌ mcp-ink-cli.mjs not found${NC}"
    exit 1
fi

if [ ! -f "ai_orchestrator_bash.js" ]; then
    echo -e "${RED}❌ ai_orchestrator_bash.js not found${NC}"
    exit 1
fi

if [ ! -f "src/libs/pattern_matcher.js" ]; then
    echo -e "${RED}❌ pattern_matcher.js not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All required files found${NC}"
echo ""

# Test modes
echo -e "${BLUE}Select test mode:${NC}"
echo "1) Quick test (automated, non-interactive)"
echo "2) Interactive mode (full TTY)"
echo "3) Debug mode (verbose output)"
echo ""
read -p "Select option (1-3): " option

case $option in
    1)
        echo -e "\n${GREEN}▶ Running quick automated test...${NC}"
        # Run in non-TTY mode with timeout
        timeout 10 node interface-v2/mcp-ink-cli.mjs <<EOF
/status
/help
How do I list files?
/exit
EOF
        ;;
    2)
        echo -e "\n${GREEN}▶ Starting interactive mode...${NC}"
        echo -e "${YELLOW}You can now interact with the real MCP Assistant${NC}"
        echo -e "${YELLOW}Type /help for commands or ask any Linux/Unix question${NC}"
        echo ""
        node interface-v2/mcp-ink-cli.mjs
        ;;
    3)
        echo -e "\n${GREEN}▶ Starting debug mode...${NC}"
        echo -e "${YELLOW}Verbose output enabled${NC}"
        node interface-v2/mcp-ink-cli.mjs --debug
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}✅ Test completed${NC}"