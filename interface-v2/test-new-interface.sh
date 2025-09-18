#!/bin/bash

# Test script for new Ink interface
# This runs the new interface in isolation without affecting production

echo "═══════════════════════════════════════════════════════════════"
echo "       MCP Terminal Assistant - New Interface Test"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "This script will test the new Ink interface without affecting"
echo "the current production system."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Test Options:${NC}"
echo "1) Basic Interface Test (FASE 1)"
echo "2) Advanced Features Test (FASE 2)"
echo "3) Full Integration Test (FASE 3)"
echo "4) Interactive Test Session"
echo "5) Run All Automated Tests"
echo "6) Integrated Backend Test (FASE 4)"
echo ""
read -p "Select test option (1-6): " option

case $option in
    1)
        echo -e "\n${GREEN}▶ Running Basic Interface Test...${NC}"
        node interface-v2/index.mjs
        ;;
    2)
        echo -e "\n${GREEN}▶ Running Advanced Features Test...${NC}"
        node interface-v2/indexV2.mjs
        ;;
    3)
        echo -e "\n${GREEN}▶ Running Full Integration Test...${NC}"
        echo -e "${YELLOW}Note: This connects to real backend services${NC}"
        node interface-v2/indexV3.mjs
        ;;
    4)
        echo -e "\n${GREEN}▶ Starting Interactive Test Session...${NC}"
        echo -e "${BLUE}Instructions:${NC}"
        echo "- Type any command to test"
        echo "- Try pasting multi-line text"
        echo "- Test /help, /status, /debug commands"
        echo "- Use Ctrl+C to exit"
        echo ""
        sleep 2
        node interface-v2/indexV3.mjs --debug
        ;;
    5)
        echo -e "\n${GREEN}▶ Running All Automated Tests...${NC}"
        echo -e "\n${BLUE}Test 1/3: Basic Interface${NC}"
        timeout 5 node interface-v2/tests/test-ink-basic.js
        echo -e "\n${BLUE}Test 2/3: Advanced Features${NC}"
        timeout 5 node interface-v2/tests/test-ink-advanced.js
        echo -e "\n${BLUE}Test 3/3: Integration${NC}"
        timeout 10 node interface-v2/tests/test-integration.js
        ;;
    6)
        echo -e "\n${GREEN}▶ Running Integrated Backend Test (FASE 4)...${NC}"
        echo -e "${YELLOW}Note: This connects to the real MCP Assistant backend${NC}"
        node interface-v2/indexV4-integrated.mjs
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}✅ Test completed${NC}"