#!/bin/bash
# script simple-ask.sh - Utiliza a versão simplificada do MCP Assistant

# Verifica se foi fornecido um argumento
if [ $# -eq 0 ]; then
  echo "❌ Erro: Nenhuma pergunta fornecida"
  echo "Uso: simple-ask.sh \"como listar arquivos por tamanho\""
  exit 1
fi

# Executa o mcp-simple.js com os argumentos fornecidos
node /home/ipcom/mcp/mcp-devops/mcp-simple.js "$*"