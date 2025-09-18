#!/bin/bash

# Side-by-side comparison test for old vs new interface
# Runs both interfaces simultaneously for direct comparison

echo "═══════════════════════════════════════════════════════════════"
echo "          Side-by-Side Interface Comparison Test"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "This test will run both interfaces for direct comparison."
echo "You can test the same commands in both to see differences."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if tmux is installed
if command -v tmux &> /dev/null; then
    echo -e "${GREEN}✓ tmux detected - creating split-screen view${NC}"

    # Kill existing session if it exists
    tmux kill-session -t interface-test 2>/dev/null

    # Create new tmux session with split panes
    tmux new-session -d -s interface-test -n comparison

    # Split window vertically
    tmux split-window -h -t interface-test:comparison

    # Run old interface in left pane
    tmux send-keys -t interface-test:comparison.0 'echo -e "\033[1;33m═══ OLD INTERFACE ═══\033[0m"' Enter
    tmux send-keys -t interface-test:comparison.0 'cd "$(dirname "$0")/.." && node mcp-assistant.js' Enter

    # Run new interface in right pane
    tmux send-keys -t interface-test:comparison.1 'echo -e "\033[1;32m═══ NEW INTERFACE ═══\033[0m"' Enter
    tmux send-keys -t interface-test:comparison.1 'cd "$(dirname "$0")" && node indexV3.js' Enter

    # Add status bar
    tmux set -t interface-test status on
    tmux set -t interface-test status-left "[OLD vs NEW]"
    tmux set -t interface-test status-right "Ctrl+B,D to detach | Ctrl+B,← → to switch"

    # Attach to session
    echo ""
    echo -e "${BLUE}Instructions:${NC}"
    echo "• Left pane: OLD interface (production)"
    echo "• Right pane: NEW interface (Ink-based)"
    echo "• Ctrl+B, ← or → : Switch between panes"
    echo "• Ctrl+B, D : Detach from session"
    echo "• Ctrl+C : Exit each interface"
    echo ""
    echo -e "${YELLOW}Test suggestions:${NC}"
    echo "1. Try pasting multi-line text in both"
    echo "2. Test /help command"
    echo "3. Test command history (↑/↓)"
    echo "4. Try autocomplete (Tab)"
    echo "5. Test error handling"
    echo ""
    read -p "Press Enter to start comparison..."

    tmux attach-session -t interface-test

elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS without tmux - use Terminal app
    echo -e "${YELLOW}Opening two Terminal windows...${NC}"

    # Get current directory
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    BASE_DIR="$(dirname "$SCRIPT_DIR")"

    # Create temporary scripts
    cat > /tmp/test-old-interface.sh << EOF
#!/bin/bash
cd "$BASE_DIR"
echo -e "\033[1;33m═══════════════════════════════════════\033[0m"
echo -e "\033[1;33m         OLD INTERFACE (Production)     \033[0m"
echo -e "\033[1;33m═══════════════════════════════════════\033[0m"
echo ""
node mcp-assistant.js
EOF

    cat > /tmp/test-new-interface.sh << EOF
#!/bin/bash
cd "$SCRIPT_DIR"
echo -e "\033[1;32m═══════════════════════════════════════\033[0m"
echo -e "\033[1;32m         NEW INTERFACE (Ink-based)      \033[0m"
echo -e "\033[1;32m═══════════════════════════════════════\033[0m"
echo ""
node indexV3.js
EOF

    chmod +x /tmp/test-old-interface.sh
    chmod +x /tmp/test-new-interface.sh

    # Open in Terminal windows
    osascript -e 'tell app "Terminal" to do script "/tmp/test-old-interface.sh"'
    sleep 0.5
    osascript -e 'tell app "Terminal" to do script "/tmp/test-new-interface.sh"'

    echo ""
    echo -e "${GREEN}Two terminal windows opened!${NC}"
    echo ""
    echo -e "${BLUE}Test both interfaces side by side:${NC}"
    echo "• Window 1: OLD interface"
    echo "• Window 2: NEW interface"

else
    # Linux without tmux - manual setup
    echo -e "${YELLOW}tmux not found. For best experience, install tmux:${NC}"
    echo "  sudo apt-get install tmux  # Debian/Ubuntu"
    echo "  sudo yum install tmux       # RHEL/CentOS"
    echo ""
    echo -e "${BLUE}Manual testing:${NC}"
    echo "1. Open two terminal windows"
    echo "2. In first terminal, run:"
    echo "   cd $(dirname "$0")/.."
    echo "   node mcp-assistant.js"
    echo ""
    echo "3. In second terminal, run:"
    echo "   cd $(dirname "$0")"
    echo "   node indexV3.js"
    echo ""
    echo "Then compare the behavior between both interfaces."
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  Comparison test setup complete!       ${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"