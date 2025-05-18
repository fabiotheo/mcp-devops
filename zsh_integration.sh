# ~/.mcp-terminal/zsh-integration.sh
# Integração do MCP com Zsh

# Variáveis globais para o MCP
MCP_COMMAND=""
MCP_START_TIME=""
MCP_PID=""

# Função para capturar comando antes da execução
mcp_preexec() {
    MCP_COMMAND="$1"
    MCP_START_TIME=$(date +%s.%N)
}

# Função para analisar após execução
mcp_precmd() {
    local exit_code=$?
    
    # Só processa se houve um comando e ele falhou
    if [[ -n "$MCP_COMMAND" ]] && [[ $exit_code -ne 0 ]]; then
        local end_time=$(date +%s.%N)
        local duration=$(echo "$end_time - $MCP_START_TIME" | bc 2>/dev/null || echo "0")
        
        # Captura stdout/stderr dos últimos comandos (usando history)
        local stdout=""
        local stderr=""
        
        # Envia para análise em background (não bloqueia terminal)
        (
            node ~/.mcp-terminal/mcp-client.js \
                --command "$MCP_COMMAND" \
                --exit-code "$exit_code" \
                --stdout "$stdout" \
                --stderr "$stderr" \
                --duration "$duration" 2>/dev/null
        ) &
        
        MCP_PID=$!
    fi
    
    # Limpa variáveis
    unset MCP_COMMAND
    unset MCP_START_TIME
}

# Hook para o Zsh
autoload -Uz add-zsh-hook
add-zsh-hook preexec mcp_preexec
add-zsh-hook precmd mcp_precmd

# Comando ask para assistente
ask() {
    if [[ $# -eq 0 ]]; then
        echo "Uso: ask \"sua pergunta sobre Linux\""
        echo "Exemplo: ask \"como listar arquivos por tamanho\""
        return 1
    fi
    
    node ~/.mcp-terminal/mcp-assistant.js "$@"
}

# Alias úteis com MCP
alias mcp-setup='node ~/.mcp-terminal/setup.js'
alias mcp-config='cat ~/.mcp-terminal/config.json'
alias mcp-clean='node ~/.mcp-terminal/mcp-client.js --clean'
alias mcp-stats='node ~/.mcp-terminal/mcp-client.js --stats'

# Função para monitorar comando específico manualmente
mcp-run() {
    if [[ $# -eq 0 ]]; then
        echo "Uso: mcp-run <comando>"
        return 1
    fi
    
    local cmd="$*"
    local output_file="/tmp/mcp_output_$$"
    local start_time=$(date +%s.%N)
    
    echo "🔍 MCP monitorando: $cmd"
    
    # Executa comando e captura output
    script -q -e -c "$cmd" "$output_file" >/dev/null 2>&1
    local exit_code=$?
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    
    # Lê output capturado
    local output=""
    if [[ -f "$output_file" ]]; then
        output=$(cat "$output_file")
        rm -f "$output_file"
    fi
    
    # Mostra output original
    echo "$output"
    
    # Analisa se houve erro
    if [[ $exit_code -ne 0 ]]; then
        echo ""
        node ~/.mcp-terminal/mcp-client.js \
            --command "$cmd" \
            --exit-code "$exit_code" \
            --stdout "$output" \
            --stderr "$output" \
            --duration "$duration"
    fi
    
    return $exit_code
}

# Função para perguntas rápidas
q() {
    ask "$@"
}

# Auto-completar para comandos MCP
_mcp_complete() {
    local context state line
    _arguments \
        '1:question:()' \
        '*:args:()'
}

compdef _mcp_complete ask
compdef _mcp_complete q

# Indicador no prompt (opcional)
mcp_prompt_info() {
    local pending=$(find /tmp -name "mcp_analysis_*" 2>/dev/null | wc -l)
    if [[ $pending -gt 0 ]]; then
        echo " %F{yellow}[MCP: $pending]%f"
    fi
}

# Adiciona ao prompt (descomente se quiser)
# RPROMPT='$(mcp_prompt_info)'$RPROMPT

echo "✅ MCP Terminal Integration carregado!"
echo "💡 Use 'ask \"sua pergunta\"' para obter ajuda com comandos Linux"
echo "🔧 Use 'mcp-run comando' para monitorar comandos específicos"