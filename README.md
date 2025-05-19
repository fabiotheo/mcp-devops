# MCP Terminal Assistant

<div align="center">

![MCP Terminal Assistant Logo](https://placehold.co/600x400?text=MCP+Terminal+Assistant)

*A CLI AI assistant for Linux terminals that monitors, analyzes, and helps fix failed commands*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS-lightgrey)

</div>

## 🚀 Introduction

MCP Terminal Assistant is an AI-powered tool designed to make Linux/Unix command line usage more productive by analyzing failed commands and providing helpful suggestions. It integrates directly with your shell to monitor commands, identify issues when they occur, and offer targeted solutions tailored to your specific Linux distribution.

No more searching StackOverflow or Reddit for error solutions - MCP Terminal Assistant brings AI assistance directly to your terminal!

## ✨ Features

- **Command Monitoring**: Automatically captures failed commands and their errors
- **Intelligent Error Analysis**: Uses pattern matching and AI to diagnose issues
- **System-Specific Solutions**: Tailored fixes based on your specific Linux distribution
- **Natural Language Interface**: Ask questions about Linux commands in plain English
- **Smart Command Suggestions**: Get the right command for specific tasks
- **Web Search Integration**: Enhances responses with real-time information from the internet
- **Website Scraping**: Extract content from websites using Firecrawl
- **Distribution-Aware**: Adapts to different package managers and system configurations
- **Performance Optimized**: Uses local caching to provide fast responses
- **Privacy Conscious**: Processes data locally when possible
- **Resource Efficient**: Minimal overhead on your system

## 📋 Examples

### Command Assistance

```
$ ask "how to find the largest directories in my filesystem"

🔧 COMANDO:
`du -h / --max-depth=1 2>/dev/null | sort -hr`

📝 EXPLICAÇÃO:
Este comando usa `du` (disk usage) para mostrar o tamanho dos diretórios
no seu sistema de arquivos raiz, limitando a profundidade da busca a 1 
nível e ordenando os resultados do maior para o menor.

💡 OPÇÕES ÚTEIS:
- `--max-depth=2` - Para ver mais níveis de diretórios
- `-x` - Para limitar a busca apenas ao sistema de arquivos atual
- Adicione `| head -10` para mostrar apenas os 10 maiores diretórios

⚠️ OBSERVAÇÕES:
Você precisa de permissões de sudo para verificar algumas pastas do sistema.
Para uma visão mais completa, tente: `sudo du -h / --max-depth=1 2>/dev/null | sort -hr`
```

### Error Resolution

```
$ docker ps
Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?

=============================================================
🔍 MCP Terminal Analysis
=============================================================
🤖 Análise IA:

🔍 PROBLEMA: Docker daemon não está em execução.
🛠️ SOLUÇÃO: O serviço Docker não está rodando. Você precisa iniciar o serviço Docker.
💻 COMANDO: sudo systemctl start docker
⚠️ PREVENÇÃO: Para iniciar o Docker automaticamente na inicialização do sistema, execute: sudo systemctl enable docker

=============================================================
```

## 🔧 Installation

### Prerequisites

First, run the prerequisites installer, which will set up Node.js, Zsh, and other dependencies:

```bash
# Make the script executable
chmod +x install_prerequisites.sh

# Run the prerequisites installer
./install_prerequisites.sh
```

### Installation Process

```bash
# Interactive installation (recommended for first-time users)
node setup.js

# Automatic installation with default settings
node setup.js --auto

# This will:
# 1. Request your Anthropic API key (interactive mode)
#    Note: In automatic mode, you'll need to manually configure your API key after installation
# 2. Configure your Zsh shell
# 3. Set up required directories and permissions
# 4. Install necessary dependencies
```

### Updating to a New Version

When updating to a new version, you don't need to remove any files or directories. Just use the upgrade option:

```bash
# Interactive update preserving your settings (recommended for most users)
# This will guide you through the upgrade process with prompts
node setup.js --upgrade

# Automatic update preserving your settings (for scripted/unattended upgrades)
# This will upgrade without prompts, using your existing configuration
node setup.js --upgrade --auto

# Or use the quick update script (simplest option)
# This is a convenience wrapper around the automatic upgrade
./upgrade.sh
```

This will:
1. Preserve your API keys and configuration
2. Update only the necessary files
3. Apply any needed migrations automatically
4. Register the new version

The upgrade process is designed to be safe and non-destructive, ensuring your personal settings and history are maintained while updating the core functionality.

### Post-Installation

After installation or update, restart your terminal or run:

```bash
source ~/.zshrc
```

If you used automatic installation, you'll need to configure your API key by editing `~/.mcp-terminal/config.json` and replacing the placeholder with your actual API key.

## 🔍 Usage

### Command Assistance

```bash
# Ask for command help in natural language
ask "how to find files modified in the last 24 hours"

# Short form for quick questions
q "how to find and kill a process by name"
```

### Command Monitoring

MCP Terminal Assistant automatically monitors commands in your terminal. When a command fails, it will analyze the error and suggest possible solutions.

### Additional Commands

```bash
# View system information detected by MCP
ask --system-info

# View command history
ask --history

# Enable or disable web search
ask --web-search on
ask --web-search off

# Check web search status and configuration
ask --web-status

# Configure Firecrawl API key
ask --firecrawl-key YOUR_API_KEY

# Scrape a website
ask --scrape https://example.com

# Crawl a website (with optional limit)
ask --crawl https://example.com --limit 20

# Clean the cache
mcp-clean

# See usage statistics
mcp-stats

# Manually monitor a specific command
mcp-run <command>
```

## ⚙️ Configuration

MCP Terminal Assistant can be configured by editing `~/.mcp-terminal/config.json`:

```json
{
  "anthropic_api_key": "YOUR_API_KEY",
  "firecrawl_api_key": "YOUR_FIRECRAWL_API_KEY",
  "model": "claude-3-5-sonnet-20240229",
  "max_calls_per_hour": 100,
  "enable_monitoring": true,
  "enable_assistant": true,
  "monitor_commands": ["npm", "yarn", "git", "docker", "make", "cargo", "go"],
  "quick_fixes": true,
  "auto_detect_fixes": false,
  "log_level": "info",
  "cache_duration_hours": 24,
  "web_search": {
    "enabled": true,
    "cache_settings": {
      "documentation": 7,
      "error_solutions": 1,
      "package_info": 0.04,
      "man_pages": 30
    },
    "priority_sources": [
      "man_pages",
      "official_docs",
      "github_issues",
      "stackoverflow"
    ],
    "rate_limit_per_hour": 50
  }
}
```

## 🔒 Security & Privacy

- Your commands are analyzed locally first using pattern matching
- Only failed commands are processed
- Personal information is not collected or stored
- API calls are made only when necessary to analyze complex errors
- All data is stored locally in `~/.mcp-terminal/`

## 🤖 AI Providers

MCP Terminal Assistant é compatível com múltiplos provedores de IA:

### Claude (Anthropic)
- Modelos disponíveis: claude-3-7-sonnet, claude-3-5-sonnet, claude-3-haiku
- Requer uma [chave de API Anthropic](https://console.anthropic.com/)
- Precisa: `anthropic_api_key`

### GPT (OpenAI)
- Modelos disponíveis: gpt-4o, gpt-4-turbo, gpt-3.5-turbo
- Requer uma [chave de API OpenAI](https://platform.openai.com/api-keys)
- Precisa: `openai_api_key`

### Gemini (Google)
- Modelos disponíveis: gemini-pro, gemini-pro-vision
- Requer uma [chave de API Google AI](https://ai.google.dev/)
- Precisa: `gemini_api_key`

Durante a instalação, você será solicitado a escolher o provedor de IA e fornecer a chave API correspondente.

## 🧠 How It Works

MCP Terminal Assistant uses a combination of techniques:

1. **Command Capture**: Zsh hooks capture commands and their exit status
2. **Local Pattern Analysis**: Fast pattern matching identifies common errors
3. **System Detection**: Identifies your specific Linux distribution for tailored solutions
4. **Web Search**: When enabled, searches the internet for documentation, solutions, and other information
5. **Website Scraping**: When configured with a Firecrawl API key, can extract content from websites in markdown format
6. **AI Analysis**: For complex errors, Claude AI provides targeted solutions enhanced with web search results
7. **Hierarchical Caching**: Common solutions, web search results, and scraped content are cached to reduce API usage and speed up responses

## 🔄 Uninstallation

```bash
# Run the uninstaller (preserves configuration and data)
node setup.js --uninstall

# To completely remove all data and configuration
node setup.js --uninstall --remove-all-data
```

## 🛠️ Development

### Project Structure

```
mcp-terminal/
├── mcp-client.js      # Command monitoring and analysis
├── mcp-assistant.js   # Natural language command assistant
├── mcp-server.js      # Optional API server for integration
├── system_detector.js # System information detection
├── setup.js           # Installation and configuration
├── patterns/          # Error patterns for different tools
│   ├── npm_errors.json
│   ├── git_errors.json
│   └── ...
├── web_search/        # Web search functionality
│   ├── index.js
│   └── web_searcher.js
├── web_scraper/       # Website scraping functionality
│   ├── index.js
│   └── firecrawl_wrapper.js
├── ai_models/         # AI model implementations
│   ├── base_model.js
│   ├── claude_model.js
│   ├── model_factory.js
│   └── ...
├── zsh_integration.sh # Shell integration
└── config.json        # Configuration file
```

### Extending Error Patterns

You can add custom error patterns in the `~/.mcp-terminal/patterns/` directory. Each file should follow the format in the existing pattern files.

## 📝 License

MIT License © 2023 [Fabio Theodoro](https://github.com/fabiotheo)

## 👨‍💻 Author

- **Fabio Theodoro** - [GitHub](https://github.com/fabiotheo) - [Email](mailto:fabio@ipcom.com.br)

## 🙏 Acknowledgments

- Powered by [Anthropic's Claude](https://www.anthropic.com/claude)
- Inspired by command-line tools like [tldr](https://tldr.sh/), [howdoi](https://github.com/gleitz/howdoi), and [explainshell](https://explainshell.com/)

---

<div align="center">
  <i>If you found this tool helpful, please consider giving it a star! ⭐</i>
</div>
