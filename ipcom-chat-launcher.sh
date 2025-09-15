#!/bin/bash
# IPCOM Chat Launcher Script - Universal (Mac/Linux)

# Diretório de instalação do MCP (funciona em Mac e Linux)
MCP_DIR="$HOME/.mcp-terminal"

# Verifica se o ipcom-chat existe no diretório de instalação
if [ -f "$MCP_DIR/ipcom-chat" ]; then
    # Muda para o diretório do MCP para garantir que os módulos sejam encontrados
    cd "$MCP_DIR" || exit 1

    # Verifica se o node_modules existe localmente
    if [ -d "$MCP_DIR/node_modules" ]; then
        # Usa os módulos locais
        exec node ipcom-chat "$@"
    else
        # Tenta usar os módulos do diretório pai se existir
        echo "Aviso: node_modules não encontrado em $MCP_DIR"
        echo "Tentando executar mesmo assim..."
        exec node ipcom-chat "$@"
    fi
else
    echo "Erro: IPCOM Chat não encontrado em $MCP_DIR"
    echo "Execute: node setup.js --upgrade --auto"
    echo "Ou instale com: curl -sSL https://raw.githubusercontent.com/fabiotheo/mcp-devops/master/install.sh | bash"
    exit 1
fi