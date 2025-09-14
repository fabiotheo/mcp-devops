# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Terminal Assistant is a command-line tool for Linux/Unix systems that provides AI-powered assistance for terminal users. It monitors failed commands, analyzes errors using pattern matching and AI, and helps users find the right commands for specific tasks. The system supports multiple AI providers (Claude, GPT, Gemini) and includes web search and website scraping capabilities.

## Architecture

### Iterative Refinement System (NEW - 2025)
- **AI Orchestrator**: Enhanced `ai_orchestrator.js` with iterative command execution loop
- **Pattern Matcher**: `libs/pattern_matcher.js` recognizes common command patterns (fail2ban, docker, disk usage)
- **Progressive Execution**: System continues executing commands until it has complete answer
- **Data Extraction**: Extracts real data from command outputs instead of generic responses
- **Goal Tracking**: Maintains context of what information is needed to answer the question

### AI Model System
- **Model Factory Pattern**: `ai_models/model_factory.js` creates appropriate AI model instances based on configuration
- **Base Model Interface**: `ai_models/base_model.js` defines the contract for all AI providers
- **Provider Implementations**: Separate files for Claude (`claude_model.js`), OpenAI (`openai_model.js`), and Gemini (`gemini_model.js`)
- **Multi-Provider Support**: Configuration-driven selection between Claude, GPT, and Gemini models

### Error Analysis Pipeline
1. **Command Capture**: Zsh integration captures failed commands with exit codes
2. **Pattern Matching**: Local JSON patterns in `patterns/` directory provide fast, offline error detection
3. **System Detection**: `system_detector.js` identifies OS/distribution for tailored solutions
4. **Web Enhancement**: Optional web search integration for real-time documentation and solutions
5. **AI Analysis**: Complex errors are analyzed by selected AI provider with enhanced context

### Core Components
- **Command Orchestrator** (`ai_orchestrator.js`): Orchestrates iterative command execution with goal tracking
- **Pattern Matcher** (`libs/pattern_matcher.js`): Detects common patterns and executes predefined command sequences
- **Command Monitoring** (`mcp-client.js`): Captures and analyzes failed terminal commands
- **Assistant Interface** (`mcp-assistant.js`): Handles natural language queries about Linux commands
- **Web Search** (`web_search/`): Enhances responses with real-time information from the internet
- **Web Scraping** (`web_scraper/`): Extracts content from websites using Firecrawl API
- **Pattern System** (`patterns/`): JSON-based error patterns for different tools (npm, git, docker, linux)

## Commands

### Development and Testing

```bash
# Test the assistant with a query
node mcp-assistant.js "query"

# Test iterative refinement system
node test-simple.js

# Test with system information display
node mcp-assistant.js --system-info

# Manual command monitoring
node mcp-client.js --command "failed command" --exit-code 1

# Test web search functionality
node mcp-assistant.js --web-status

# Test different AI providers
node mcp-assistant.js "test query" --provider claude
```

### Installation and Setup

```bash
# Interactive installation
node setup.js

# Automatic installation with defaults
node setup.js --auto

# Upgrade existing installation
node setup.js --upgrade

# Upgrade automatically (preserving settings)
node setup.js --upgrade --auto
```

### Package Management

```bash
# Update all packages to latest versions
pnpm update --latest

# Install dependencies
pnpm install
```

## Configuration

### Main Configuration (`~/.mcp-terminal/config.json`)
The system supports extensive configuration including:
- Multiple AI provider API keys (`anthropic_api_key`, `openai_api_key`, `gemini_api_key`)
- Model selection per provider
- Rate limiting and monitoring preferences
- Web search configuration with cache settings and priority sources
- Firecrawl API integration for website scraping

### Pattern System
Error patterns are stored as JSON files in `patterns/` directory:
- `git_errors.json`: Git-specific error patterns
- `npm_errors.json`: NPM/package manager errors
- `docker_errors.json`: Docker-related issues
- `linux_errors.json`: General Linux command errors

Each pattern includes:
- `pattern`: Regex pattern to match errors
- `message`: Human-readable error description
- `fix`: Suggested command to resolve the issue
- `confidence`: Confidence level (0.0-1.0)

## Recent Improvements (Iterative Refinement - January 2025)

### Problem Solved
The system previously would execute only the first command and stop, providing incomplete answers. For example, when asked "How many IPs are blocked in fail2ban?", it would only run `fail2ban-client status` and not check individual jails.

### Solution Implemented
1. **Iterative Execution Loop**: System now continues executing commands until it has complete information
2. **Pattern Recognition**: Common patterns (fail2ban, docker, disk usage) are recognized and handled automatically
3. **Real Data Extraction**: System extracts actual data from command outputs instead of providing generic explanations
4. **Progress Evaluation**: After each command, system evaluates if more information is needed

### Key Files Modified/Added
- `ai_orchestrator.js`: Added iterative loop, progress evaluation, and data extraction
- `libs/pattern_matcher.js`: New file for pattern recognition and command sequencing
- `docs/repairFlux.md`: Detailed plan for the improvement implementation

### Example Flow
```
Question: "How many IPs are blocked in fail2ban?"
1. Execute: fail2ban-client status
   → Extract: jail list (sshd, apache, nginx)
2. Execute: fail2ban-client status sshd
   → Extract: 3 blocked IPs
3. Execute: fail2ban-client status apache
   → Extract: 2 blocked IPs
4. Execute: fail2ban-client status nginx
   → Extract: 1 blocked IP
Answer: "6 IPs are blocked: 3 in sshd, 2 in apache, 1 in nginx"
```

## Development Guidelines

### Adding New Files to Installation
**IMPORTANT**: When creating new files that need to be deployed to `~/.mcp-terminal/`, you MUST update `setup.js`:

1. **For individual files**: Add to the `filesToCopy` array in `makeExecutable()` method (around line 805):
```javascript
const filesToCopy = [
    { src: 'your-new-file.js', dest: 'your-new-file.js' },
    // ... existing files
];
```

2. **For new directories**: Add copying logic after the patterns section (around line 855):
```javascript
// Copy your new directory
try {
    const yourDir = path.join(process.cwd(), 'your-dir');
    const destYourDir = path.join(this.mcpDir, 'your-dir');
    // ... copy logic
}
```

3. **Remember**: The system runs on both Mac (development) and Linux (production), so files must be properly copied during installation.

**Note**: The `libs/` directory is already configured in `setup.js` to be automatically copied during installation (lines 855-880).

### Adding New AI Providers
1. Create new provider class extending `BaseAIModel` in `ai_models/`
2. Implement required methods: `initialize()`, `analyzeCommand()`, `askCommand()`
3. Update `model_factory.js` to include the new provider
4. Add configuration options for API keys and model selection
5. **Add the new file to `setup.js` for deployment**

### Error Pattern Development
- Add new patterns to appropriate JSON files in `patterns/`
- Test patterns with various error scenarios
- Ensure patterns are specific enough to avoid false positives
- Include confidence scores based on pattern reliability

### Web Integration Features
- Web search results are cached based on content type (documentation, error solutions, package info)
- Priority sources can be configured (man pages, official docs, GitHub issues, Stack Overflow)
- Rate limiting prevents API abuse
- Firecrawl integration allows content extraction from websites in markdown format

### Adding Pattern Recognition
To add new command patterns, edit `libs/pattern_matcher.js`:
1. Add pattern to the `loadPatterns()` method
2. Define matcher regex, command sequence, and data extraction logic
3. Each pattern should include:
   - `matcher`: Regex to match user questions
   - `sequence`: Array of command steps to execute
   - `parseOutput`: Function to extract data from command output
   - `aggregator`: Function to combine data from multiple commands
4. Test with `node test-simple.js`

### Pattern Matcher Capabilities
The Pattern Matcher (`libs/pattern_matcher.js`) supports:
- **Dynamic Commands**: Commands can be functions that generate based on previous results
- **Data Extraction**: Each step can extract and store data for use in later steps
- **Aggregation**: Combine results from multiple commands into a final answer
- **Built-in Patterns**: fail2ban, disk usage, docker, network, systemd, logs, processes