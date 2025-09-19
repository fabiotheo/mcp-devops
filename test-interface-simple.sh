#!/bin/bash

echo "════════════════════════════════════════════════════════════════════"
echo "              🧪 TESTE SIMPLES DA INTERFACE INK"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# 1. Teste básico - a interface carrega?
echo "1️⃣  TESTE BÁSICO: A interface carrega?"
echo "────────────────────────────────────────────"
echo "Tentando carregar a interface por 3 segundos..."
echo ""

if timeout 3 bash -c "echo 'test' | MCP_USER=test node interface-v2/mcp-ink-cli.mjs" 2>&1 | grep -q "MCP Terminal Assistant"; then
    echo "✅ Interface carregou com sucesso!"
else
    echo "❌ Interface não carregou. Verificando erro..."
    echo ""
    echo "Saída do erro:"
    timeout 2 bash -c "echo '' | MCP_USER=test node interface-v2/mcp-ink-cli.mjs" 2>&1 | head -20
fi

echo ""
echo "2️⃣  TESTE DE HISTÓRICO: Turso está funcionando?"
echo "────────────────────────────────────────────"

# Verificar se Turso está configurado
if [ -f ~/.mcp-terminal/turso-config.json ]; then
    echo "✅ Configuração do Turso encontrada"

    # Testar com usuário específico
    echo "Testando com usuário 'fabio'..."
    if timeout 3 bash -c "echo '/exit' | MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs" 2>&1 | grep -q "MCP Terminal Assistant"; then
        echo "✅ Interface funciona com usuário específico"
    else
        echo "⚠️  Interface não respondeu corretamente com usuário"
    fi
else
    echo "ℹ️  Turso não configurado (opcional)"
fi

echo ""
echo "3️⃣  TESTE DE COMANDOS: Interface responde a comandos?"
echo "────────────────────────────────────────────"

# Testar comando /help
echo "Testando comando /help..."
if timeout 3 bash -c "echo '/help' | MCP_USER=test node interface-v2/mcp-ink-cli.mjs" 2>&1 | grep -q "help"; then
    echo "✅ Comando /help funciona"
else
    echo "⚠️  Comando /help não respondeu"
fi

echo ""
echo "4️⃣  TESTE DE PASTE: Multi-line paste funciona?"
echo "────────────────────────────────────────────"
echo "Para testar manualmente:"
echo "  1. Execute: ./test-ink-paste.sh"
echo "  2. Cole um texto multi-linha quando a interface abrir"
echo "  3. Verifique se o texto aparece corretamente"

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "                      📊 RESUMO DO TESTE"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Se todos os testes passaram, você pode:"
echo "  • Instalar normalmente: node setup.js"
echo "  • Ou migrar instalação existente: node migrate-to-ink.js"
echo ""
echo "Para teste manual completo:"
echo "  • Execute: MCP_USER=seu_usuario node interface-v2/mcp-ink-cli.mjs"
echo "  • Teste comandos, histórico (↑↓), e paste de múltiplas linhas"
echo ""
echo "════════════════════════════════════════════════════════════════════"