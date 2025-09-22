# Pre-Migration Test Checklist

## 🎯 Test Strategy Overview

Before migrating from the old interface to the new Ink-based interface, complete all tests in this checklist to ensure production readiness.

## 📋 Test Categories

### 1. ✅ Critical Bug Fix Validation
**Purpose**: Verify the main issue (automatic paste execution) is resolved

- [ ] **Paste without execution**
  - Test: Paste multi-line text
  - Expected: Text appears but doesn't execute until Enter pressed
  - Command: `echo "line1\nline2\nline3"` (paste this)

- [ ] **Bracketed paste mode detection**
  - Test: Monitor for `[PASTING...]` indicator
  - Expected: Visual feedback during paste operation
  - Verify: Check that paste sequences are properly captured

- [ ] **Large paste handling**
  - Test: Paste 100+ lines of text
  - Expected: No UI freezing, proper handling
  - Performance: Should complete within 2 seconds

### 2. 🔧 Core Functionality Tests

#### Input Handling
- [ ] **Single character input** - Type individual characters
- [ ] **Word input** - Type complete words
- [ ] **Special characters** - Test @, #, $, %, &, etc.
- [ ] **Unicode/emoji support** - Test 😀, ñ, ü, etc.
- [ ] **Backspace/delete** - Character removal works
- [ ] **Cursor movement** - Arrow keys work correctly
- [ ] **Home/End keys** - Jump to line start/end

#### Command Execution
- [ ] **Simple commands** - `ls`, `pwd`, `date`
- [ ] **Commands with arguments** - `ls -la`, `echo "test"`
- [ ] **Piped commands** - `ls | grep test`
- [ ] **Background commands** - `sleep 10 &`
- [ ] **Command with errors** - Test error handling

#### History Management
- [ ] **History navigation** - Up/down arrows work
- [ ] **History persistence** - Survives restart
- [ ] **History search** - Ctrl+R functionality (if implemented)
- [ ] **History limit** - Doesn't grow indefinitely

### 3. 🎨 UI Features

#### Visual Elements
- [ ] **Syntax highlighting** - Commands are colored
- [ ] **Status indicators** - Show connection state
- [ ] **Error highlighting** - Failed commands visible
- [ ] **Loading states** - Show during processing
- [ ] **Debug mode** - Toggle with Ctrl+D

#### Autocomplete
- [ ] **Tab completion** - Shows suggestions
- [ ] **Navigation** - Arrow keys in suggestions
- [ ] **Selection** - Enter selects suggestion
- [ ] **Escape** - Closes autocomplete
- [ ] **Fuzzy matching** - Partial matches work

### 4. 🔌 Integration Tests

#### AI Orchestrator
- [ ] **Connection established** - AI backend connects
- [ ] **Command processing** - AI processes queries
- [ ] **Response streaming** - Real-time response display
- [ ] **Error handling** - Graceful failure handling
- [ ] **Timeout handling** - Long requests handled

#### Pattern Matching
- [ ] **fail2ban patterns** - "How many IPs blocked?"
- [ ] **Docker patterns** - "Show containers"
- [ ] **Disk usage patterns** - "Check disk space"
- [ ] **System patterns** - "Show system status"

#### Built-in Commands
- [ ] **/help** - Shows available commands
- [ ] **/status** - Shows system status
- [ ] **/clear** - Clears screen
- [ ] **/debug** - Toggles debug mode
- [ ] **/exit** - Exits cleanly

### 5. 🚀 Performance Tests

Run: `node interface-v2/tests/test-performance.js`

- [ ] **Startup time** - < 500ms
- [ ] **Input latency** - < 50ms
- [ ] **Memory usage** - < 50MB initial
- [ ] **Memory growth** - < 10% after 100 commands
- [ ] **Large paste** - 500 lines < 2.5s

### 6. 🔄 Side-by-Side Comparison

Run: `./interface-v2/test-side-by-side.sh`

Compare old vs new interface:
- [ ] **Feature parity** - All old features work
- [ ] **Performance** - New is as fast or faster
- [ ] **Visual consistency** - Similar look/feel
- [ ] **Behavior consistency** - Same command handling

### 7. 🐛 Edge Cases

- [ ] **Empty input** - Pressing Enter with no text
- [ ] **Very long input** - 1000+ character lines
- [ ] **Rapid input** - Fast typing doesn't lose characters
- [ ] **Simultaneous operations** - Paste while processing
- [ ] **Terminal resize** - Handle window size changes
- [ ] **Interrupted operations** - Ctrl+C handling
- [ ] **Network disconnection** - Graceful degradation
- [ ] **Invalid UTF-8** - Binary data handling

### 8. 🔒 Security Tests

- [ ] **Command injection** - Test with `; rm -rf`
- [ ] **Path traversal** - Test with `../../etc/passwd`
- [ ] **Environment leakage** - No API keys in output
- [ ] **Input sanitization** - HTML/script tags handled
- [ ] **Rate limiting** - Spam protection works

### 9. 🖥️ Platform Compatibility

- [ ] **macOS** - Terminal.app
- [ ] **macOS** - iTerm2
- [ ] **Linux** - GNOME Terminal
- [ ] **Linux** - Konsole
- [ ] **Linux** - xterm
- [ ] **SSH sessions** - Remote connections
- [ ] **tmux/screen** - Multiplexers

### 10. 📊 Stress Testing

- [ ] **1000 commands** - History performance
- [ ] **100 rapid pastes** - Paste queue handling
- [ ] **24-hour run** - Memory leaks check
- [ ] **Concurrent users** - Multiple instances
- [ ] **Large responses** - 10MB+ AI responses

## 🚦 Test Execution Commands

```bash
# Quick validation
npm run test:ink

# Full test suite
./interface-v2/test-new-interface.sh

# Performance benchmark
node interface-v2/tests/test-performance.js

# Side-by-side comparison
./interface-v2/test-side-by-side.sh

# Integration test
npm run test:integration

# Mock AI test
node interface-v2/mocks/mock-ai-orchestrator.js

# Manual interactive test
npm run ink:debug
```

## 📈 Success Criteria

### Must Pass (Critical)
- ✅ Paste doesn't auto-execute
- ✅ Basic input/output works
- ✅ Commands execute properly
- ✅ No crashes in 1-hour usage
- ✅ Memory usage stable

### Should Pass (Important)
- ⚠️ All built-in commands work
- ⚠️ History persists
- ⚠️ Autocomplete functions
- ⚠️ Performance benchmarks pass

### Nice to Have (Optional)
- 💫 Syntax highlighting perfect
- 💫 All edge cases handled
- 💫 100% feature parity

## 🎬 Migration Steps

Once all critical tests pass:

1. **Backup current setup**
   ```bash
   cp ~/.mcp-terminal ~/.mcp-terminal.backup
   ```

2. **Deploy new interface**
   ```bash
   cp interface-v2/* ~/.mcp-terminal/
   ```

3. **Update entry point**
   ```bash
   # In ~/.mcp-terminal/mcp-assistant.js
   # Change to use new interface
   ```

4. **Test in production**
   - Run for 24 hours
   - Monitor for issues
   - Collect user feedback

5. **Rollback if needed**
   ```bash
   cp ~/.mcp-terminal.backup ~/.mcp-terminal
   ```

## 📝 Test Results Log

| Date | Tester | Version | Pass | Fail | Notes |
|------|--------|---------|------|------|-------|
| | | | | | |
| | | | | | |
| | | | | | |

## 🔍 Known Issues

Document any issues found during testing:

1. **Issue**: [Description]
   - **Severity**: Critical/High/Medium/Low
   - **Workaround**: [If any]
   - **Status**: Open/Fixed/Won't Fix

## ✅ Sign-off

- [ ] Development team approval
- [ ] QA testing complete
- [ ] Performance acceptable
- [ ] Documentation updated
- [ ] Rollback plan ready
- [ ] **Ready for production**

---

**Last Updated**: [Date]
**Version**: 1.0.0
**Status**: TESTING