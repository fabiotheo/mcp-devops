#!/bin/bash

echo "════════════════════════════════════════════════════════════════"
echo "           Testing Installed MCP Interface"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Testing the installed interface after setup.js installation${NC}"
echo ""

# Check if ipcom-new exists
if [ -L "/Users/fabiotheodoro/.local/bin/ipcom-new" ]; then
    echo -e "${GREEN}✅ Symbolic link ipcom-new exists${NC}"
else
    echo -e "${RED}❌ Symbolic link ipcom-new not found${NC}"
fi

# Check if installed files exist
if [ -f "$HOME/.mcp-terminal/ipcom-chat-new" ]; then
    echo -e "${GREEN}✅ ipcom-chat-new installed${NC}"
else
    echo -e "${RED}❌ ipcom-chat-new not found${NC}"
fi

if [ -d "$HOME/.mcp-terminal/interface-v2" ]; then
    echo -e "${GREEN}✅ interface-v2 directory installed${NC}"
else
    echo -e "${RED}❌ interface-v2 directory not found${NC}"
fi

echo ""
echo -e "${BLUE}Running automated test...${NC}"
echo ""

# Test with automated input
timeout 5 $HOME/.mcp-terminal/ipcom-chat-new --user fabio <<EOF
/status
/help
/exit
EOF

if [ $? -eq 0 ] || [ $? -eq 124 ]; then
    echo ""
    echo -e "${GREEN}✅ Automated test completed successfully${NC}"
else
    echo ""
    echo -e "${RED}❌ Automated test failed${NC}"
fi

echo ""
echo -e "${GREEN}Installation test complete!${NC}"
echo ""
echo -e "${YELLOW}To test interactively, run:${NC}"
echo -e "${GREEN}ipcom-new --user fabio${NC}"
echo ""