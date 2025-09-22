#!/bin/bash

# Setup test environment for new interface
# Prepares isolated testing without affecting production

echo "═══════════════════════════════════════════════════════════════"
echo "              Test Environment Setup Script"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}📁 Setting up test environment...${NC}\n"

# Step 1: Check Node.js
echo -e "${YELLOW}Step 1: Checking Node.js installation${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js first: https://nodejs.org"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION} detected${NC}\n"

# Step 2: Check package manager
echo -e "${YELLOW}Step 2: Checking package manager${NC}"
if command -v pnpm &> /dev/null; then
    PKG_MANAGER="pnpm"
    echo -e "${GREEN}✓ Using pnpm${NC}"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
    echo -e "${GREEN}✓ Using npm${NC}"
else
    echo -e "${RED}❌ No package manager found${NC}"
    exit 1
fi
echo ""

# Step 3: Install dependencies if needed
echo -e "${YELLOW}Step 3: Checking dependencies${NC}"
cd "$BASE_DIR"

MISSING_DEPS=()
# Check for required packages
for pkg in ink react @inkjs/ui cli-highlight external-editor fuse.js; do
    if [ ! -d "node_modules/$pkg" ]; then
        MISSING_DEPS+=($pkg)
    fi
done

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Missing dependencies: ${MISSING_DEPS[@]}${NC}"
    read -p "Install missing dependencies? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        $PKG_MANAGER install
        echo -e "${GREEN}✓ Dependencies installed${NC}"
    fi
else
    echo -e "${GREEN}✓ All dependencies installed${NC}"
fi
echo ""

# Step 4: Create test data directory
echo -e "${YELLOW}Step 4: Setting up test data${NC}"
TEST_DATA_DIR="$SCRIPT_DIR/test-data"
mkdir -p "$TEST_DATA_DIR"

# Create sample history file
cat > "$TEST_DATA_DIR/test-history.json" << 'EOF'
{
  "commands": [
    "ls -la",
    "docker ps",
    "git status",
    "npm install",
    "fail2ban-client status",
    "df -h",
    "ps aux | grep node",
    "tail -f /var/log/syslog"
  ]
}
EOF

# Create test patterns file
cat > "$TEST_DATA_DIR/test-patterns.json" << 'EOF'
{
  "patterns": [
    {
      "pattern": "fail2ban",
      "commands": ["fail2ban-client status", "fail2ban-client status sshd"],
      "description": "Check fail2ban blocked IPs"
    },
    {
      "pattern": "docker",
      "commands": ["docker ps", "docker ps -a"],
      "description": "List Docker containers"
    },
    {
      "pattern": "disk",
      "commands": ["df -h", "du -sh /*"],
      "description": "Check disk usage"
    }
  ]
}
EOF

echo -e "${GREEN}✓ Test data created${NC}\n"

# Step 5: Setup test configuration
echo -e "${YELLOW}Step 5: Creating test configuration${NC}"
cat > "$SCRIPT_DIR/test-config.json" << EOF
{
  "testMode": true,
  "mockAI": true,
  "debugMode": true,
  "historyFile": "$TEST_DATA_DIR/test-history.json",
  "patternsFile": "$TEST_DATA_DIR/test-patterns.json",
  "maxHistory": 100,
  "features": {
    "syntaxHighlight": true,
    "autocomplete": true,
    "aiIntegration": false,
    "webSearch": false,
    "patternMatching": true
  }
}
EOF
echo -e "${GREEN}✓ Test configuration created${NC}\n"

# Step 6: Create test runner script
echo -e "${YELLOW}Step 6: Creating test runner${NC}"
cat > "$SCRIPT_DIR/run-tests.sh" << 'EOF'
#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Running all tests..."
echo "===================="
echo ""

# Test 1: Basic Interface
echo "Test 1: Basic Interface"
timeout 5 node "$SCRIPT_DIR/tests/test-ink-basic.js"
TEST1=$?

# Test 2: Advanced Features
echo -e "\nTest 2: Advanced Features"
timeout 5 node "$SCRIPT_DIR/tests/test-ink-advanced.js"
TEST2=$?

# Test 3: Integration
echo -e "\nTest 3: Integration"
timeout 10 node "$SCRIPT_DIR/tests/test-integration.js"
TEST3=$?

# Test 4: Performance
echo -e "\nTest 4: Performance"
node "$SCRIPT_DIR/tests/test-performance.js"
TEST4=$?

echo ""
echo "===================="
echo "Test Results:"
[ $TEST1 -eq 0 ] && echo "✓ Basic Interface" || echo "✗ Basic Interface"
[ $TEST2 -eq 0 ] && echo "✓ Advanced Features" || echo "✗ Advanced Features"
[ $TEST3 -eq 0 ] && echo "✓ Integration" || echo "✗ Integration"
[ $TEST4 -eq 0 ] && echo "✓ Performance" || echo "✗ Performance"

TOTAL=$((TEST1 + TEST2 + TEST3 + TEST4))
if [ $TOTAL -eq 0 ]; then
    echo -e "\n✅ All tests passed!"
    exit 0
else
    echo -e "\n❌ Some tests failed"
    exit 1
fi
EOF

chmod +x "$SCRIPT_DIR/run-tests.sh"
echo -e "${GREEN}✓ Test runner created${NC}\n"

# Step 7: Create mock server for AI testing
echo -e "${YELLOW}Step 7: Setting up mock AI server${NC}"
cat > "$SCRIPT_DIR/mock-server.js" << 'EOF'
#!/usr/bin/env node

import http from 'http';
import { URL } from 'url';

const PORT = 3456;

const mockResponses = {
    '/analyze': {
        result: 'Command analyzed successfully',
        suggestions: ['Try using sudo', 'Check permissions']
    },
    '/complete': {
        completions: ['ls -la', 'ls -lh', 'ls -lt']
    },
    '/pattern': {
        matched: true,
        pattern: 'fail2ban',
        commands: ['fail2ban-client status']
    }
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    console.log(`Mock AI: ${req.method} ${url.pathname}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });

    if (mockResponses[url.pathname]) {
        res.end(JSON.stringify(mockResponses[url.pathname]));
    } else {
        res.end(JSON.stringify({ status: 'ok', message: 'Mock response' }));
    }
});

server.listen(PORT, () => {
    console.log(`Mock AI server running on port ${PORT}`);
    console.log('Press Ctrl+C to stop');
});
EOF

echo -e "${GREEN}✓ Mock server created${NC}\n"

# Step 8: Create environment file
echo -e "${YELLOW}Step 8: Creating test environment file${NC}"
cat > "$SCRIPT_DIR/.env.test" << EOF
# Test Environment Variables
NODE_ENV=test
DEBUG=true
TEST_MODE=true
USE_MOCK_AI=true
MOCK_AI_URL=http://localhost:3456
HISTORY_FILE=$TEST_DATA_DIR/test-history.json
PATTERNS_FILE=$TEST_DATA_DIR/test-patterns.json
LOG_LEVEL=debug
EOF
echo -e "${GREEN}✓ Environment file created${NC}\n"

# Step 9: Make all scripts executable
echo -e "${YELLOW}Step 9: Setting permissions${NC}"
chmod +x "$SCRIPT_DIR"/*.sh
chmod +x "$SCRIPT_DIR"/tests/*.js
chmod +x "$SCRIPT_DIR"/mock-server.js
echo -e "${GREEN}✓ Permissions set${NC}\n"

# Step 10: Final summary
echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Test Environment Setup Complete!${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo -e "${BLUE}📚 Quick Start Guide:${NC}"
echo ""
echo "1. Run individual tests:"
echo "   ./test-new-interface.sh     # Interactive test menu"
echo "   ./test-side-by-side.sh      # Compare old vs new"
echo "   ./run-tests.sh              # Run all automated tests"
echo ""
echo "2. Start mock AI server (optional):"
echo "   node mock-server.js"
echo ""
echo "3. Test with mock data:"
echo "   export $(cat .env.test | xargs)"
echo "   node indexV3.js"
echo ""
echo "4. Performance benchmark:"
echo "   node tests/test-performance.js"
echo ""
echo "5. Check test checklist:"
echo "   cat TEST-CHECKLIST.md"
echo ""
echo -e "${YELLOW}📝 Notes:${NC}"
echo "• All test data is isolated in test-data/"
echo "• Mock AI server runs on port 3456"
echo "• Test config is in test-config.json"
echo "• Environment vars in .env.test"
echo ""
echo -e "${GREEN}Ready to test! Start with: ./test-new-interface.sh${NC}"