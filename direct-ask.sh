#!/bin/bash
# Script para chamar o assistente diretamente com redirecionamento completo

echo "🔍 Executando mcp-assistant.js diretamente..."
LOG_FILE="/tmp/mcp-output-$(date +%s).log"

# Executar com redirecionamento completo para um arquivo de log
node ~/.mcp-terminal/mcp-assistant.js "$*" > "$LOG_FILE" 2>&1

# Mostrar resultado
echo "📝 Saída salva em: $LOG_FILE"
echo "📋 Primeiras 20 linhas da saída:"
echo "---------------------------------------"
head -n 20 "$LOG_FILE"
echo "---------------------------------------"
echo "📋 Últimas 20 linhas da saída:"
echo "---------------------------------------"
tail -n 20 "$LOG_FILE"
echo "---------------------------------------"
echo "📊 Total de linhas: $(wc -l < "$LOG_FILE")"