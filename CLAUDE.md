# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Terminal Assistant is a command-line tool for Linux/Unix systems that provides AI-powered assistance for terminal users. It monitors failed commands, analyzes errors using pattern matching and AI, and helps users find the right commands for specific tasks. The system supports multiple AI providers (Claude, GPT, Gemini) and includes web search and website scraping capabilities.

## Architecture

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

## Development Guidelines

### Adding New AI Providers
1. Create new provider class extending `BaseAIModel` in `ai_models/`
2. Implement required methods: `initialize()`, `analyzeCommand()`, `askCommand()`
3. Update `model_factory.js` to include the new provider
4. Add configuration options for API keys and model selection

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