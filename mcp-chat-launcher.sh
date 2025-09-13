#!/bin/bash
# MCP Chat Launcher Script - Universal (Mac/Linux)

# Diretório de instalação do MCP (funciona em Mac e Linux)
MCP_DIR="$HOME/.mcp-terminal"

# Verifica se o mcp-interactive.js existe no diretório de instalação
if [ -f "$MCP_DIR/mcp-interactive.js" ]; then
    # Muda para o diretório do MCP para garantir que os módulos sejam encontrados
    cd "$MCP_DIR" || exit 1

    # Verifica se o node_modules existe localmente
    if [ -d "$MCP_DIR/node_modules" ]; then
        # Usa os módulos locais
        exec node mcp-interactive.js "$@"
    else
        # Tenta usar os módulos do diretório pai se existir
        echo "Aviso: node_modules não encontrado em $MCP_DIR"
        echo "Tentando executar mesmo assim..."
        exec node mcp-interactive.js "$@"
    fi
else
    echo "Erro: MCP Interactive não encontrado em $MCP_DIR"
    echo "Execute: node setup.js --upgrade --auto"
    echo "Ou instale com: curl -sSL https://raw.githubusercontent.com/fabiotheo/mcp-devops/master/install.sh | bash"
    exit 1
fi