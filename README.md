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
# Install MCP Terminal Assistant
node setup.js

# This will:
# 1. Request your Anthropic API key
# 2. Configure your Zsh shell
# 3. Set up required directories and permissions
# 4. Install necessary dependencies
```

### Post-Installation

After installation, restart your terminal or run:

```bash
source ~/.zshrc
```

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
  "model": "claude-3-5-sonnet-20240229",
  "max_calls_per_hour": 100,
  "enable_monitoring": true,
  "enable_assistant": true,
  "monitor_commands": ["npm", "yarn", "git", "docker", "make", "cargo", "go"],
  "quick_fixes": true,
  "auto_detect_fixes": false,
  "log_level": "info",
  "cache_duration_hours": 24
}
```

## 🔒 Security & Privacy

- Your commands are analyzed locally first using pattern matching
- Only failed commands are processed
- Personal information is not collected or stored
- API calls are made only when necessary to analyze complex errors
- All data is stored locally in `~/.mcp-terminal/`

## 🧠 How It Works

MCP Terminal Assistant uses a combination of techniques:

1. **Command Capture**: Zsh hooks capture commands and their exit status
2. **Local Pattern Analysis**: Fast pattern matching identifies common errors
3. **System Detection**: Identifies your specific Linux distribution for tailored solutions
4. **AI Analysis**: For complex errors, Claude AI provides targeted solutions
5. **Caching**: Common solutions are cached to reduce API usage and speed up responses

## 🔄 Uninstallation

```bash
# Run the uninstaller
node setup.js --uninstall
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