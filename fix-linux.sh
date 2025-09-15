#!/bin/bash
# Script para corrigir o erro do orchestration-animator.js no Linux

echo "🔧 Corrigindo erro do orchestration-animator.js no Linux..."

# Verifica se o diretório ~/.mcp-terminal existe
if [ ! -d "$HOME/.mcp-terminal" ]; then
    echo "❌ Diretório ~/.mcp-terminal não encontrado. Execute o setup primeiro."
    exit 1
fi

# Cria o diretório libs se não existir
mkdir -p $HOME/.mcp-terminal/libs

# Verifica se o arquivo orchestration-animator.js existe no código fonte
if [ -f "libs/orchestration-animator.js" ]; then
    echo "📦 Copiando orchestration-animator.js..."
    cp libs/orchestration-animator.js $HOME/.mcp-terminal/libs/
    echo "✅ Arquivo copiado com sucesso!"
else
    echo "❌ Arquivo libs/orchestration-animator.js não encontrado no código fonte."
    echo "   Certifique-se de estar no diretório correto do projeto."
    exit 1
fi

# Verifica se foi copiado corretamente
if [ -f "$HOME/.mcp-terminal/libs/orchestration-animator.js" ]; then
    echo "✅ Correção aplicada com sucesso!"
    echo ""
    echo "🎉 Agora você pode executar o mcp-chat normalmente."
else
    echo "❌ Erro ao copiar o arquivo."
    exit 1
fi