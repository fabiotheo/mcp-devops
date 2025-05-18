# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Terminal Assistant is a command-line tool for Linux/Unix systems that provides AI-powered assistance for terminal users. It monitors failed commands and helps users find the right commands for specific tasks.

### Core Components

- **Command Monitoring**: Monitors and analyzes failed terminal commands
- **Terminal Assistant**: Provides command suggestions for user queries
- **System Detection**: Identifies OS and provides system-specific recommendations

## Key Files

- `mcp-client.js`: Monitors terminal commands and analyzes failures
- `mcp-assistant.js`: Handles user queries about Linux commands
- `system_detector.js`: Detects OS, distribution, and available tools
- `setup.js`: Installation script for setting up the tool
- `zsh_integration.sh`: Shell integration for Zsh

## Commands

### Setup and Installation

```bash
# Install MCP Terminal Assistant
node setup.js

# Uninstall
node setup.js --uninstall
```

### User Commands

These are commands available to the end-user after installation:

```bash
# Ask for command suggestions
ask "how to list directories by size"

# Alternative short form
q "how to list directories by size"

# Manually monitor a command
mcp-run <command>

# View configuration
mcp-config

# Clean the cache
mcp-clean

# View usage statistics
mcp-stats
```

### Development

```bash
# Run the assistant to test
node mcp-assistant.js "query"

# Test system detection
node mcp-assistant.js --system-info

# Run the client manually
node mcp-client.js --command "failed command" --exit-code 1
```

## Configuration

The configuration file is located at `~/.mcp-terminal/config.json` and contains:

- Anthropic API key
- Model selection
- Rate limiting settings
- Monitoring preferences
- Command patterns to monitor
- Caching configuration

## Architecture Notes

1. **Zsh Integration**: The tool integrates with Zsh via hooks that capture commands before execution (`preexec`) and after execution (`precmd`).

2. **Error Analysis Flow**:
   - Failed command is captured with its exit code
   - System information is collected
   - The command and error are analyzed using pattern matching or AI
   - Solutions are presented to the user

3. **Caching System**: Common solutions are cached to reduce API usage and provide faster responses.

4. **System-Specific Commands**: The `system_detector.js` provides system-specific command recommendations based on the detected OS distribution.

## Development Guidelines

1. **Error Patterns**: When adding new error patterns, place them in the `patterns/` directory with appropriate categorization.

2. **API Usage**: Ensure all API calls include proper error handling and respect rate limits.

3. **Testing**: Test new features with various Linux distributions to ensure compatibility.

4. **Command Filtering**: Be careful with the monitored commands list to avoid excessive API usage.