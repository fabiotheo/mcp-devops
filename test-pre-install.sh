#!/bin/bash

echo "════════════════════════════════════════════════════════════════════"
echo "                    🧪 TESTE PRÉ-INSTALAÇÃO"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Contador de testes
TESTS_PASSED=0
TESTS_FAILED=0

# Função para testar
test_component() {
    local test_name="$1"
    local test_command="$2"

    echo -n "📋 Testando $test_name... "

    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "1️⃣  VERIFICANDO ARQUIVOS PRINCIPAIS"
echo "────────────────────────────────────────────"

# Testar arquivos da interface v2
test_component "interface-v2/mcp-ink-cli.mjs" "[ -f interface-v2/mcp-ink-cli.mjs ]"
test_component "interface-v2/bridges/adapters/TursoAdapter.js" "[ -f interface-v2/bridges/adapters/TursoAdapter.js ]"
test_component "interface-v2/bridges/CommandProcessor.js" "[ -f interface-v2/bridges/CommandProcessor.js ]"
test_component "interface-v2/components/CommandInput.js" "[ -f interface-v2/components/CommandInput.js ]"
test_component "interface-v2/components/HistorySearch.js" "[ -f interface-v2/components/HistorySearch.js ]"
test_component "interface-v2/components/LoadingSpinner.js" "[ -f interface-v2/components/LoadingSpinner.js ]"
test_component "interface-v2/components/ResponseDisplay.js" "[ -f interface-v2/components/ResponseDisplay.js ]"
test_component "interface-v2/components/SessionDisplay.js" "[ -f interface-v2/components/SessionDisplay.js ]"

echo ""
echo "2️⃣  VERIFICANDO SCRIPTS DE MIGRAÇÃO"
echo "────────────────────────────────────────────"

test_component "migrate-to-ink.js" "[ -f migrate-to-ink.js ]"
test_component "ipcom-ink launcher" "[ -f ipcom-ink ]"
test_component "setup.js atualizado" "grep -q 'interface-v2' setup.js"
test_component "setup.js com migrate-to-ink" "grep -q 'migrate-to-ink.js' setup.js"

echo ""
echo "3️⃣  TESTANDO SINTAXE DOS ARQUIVOS"
echo "────────────────────────────────────────────"

test_component "Sintaxe mcp-ink-cli.mjs" "node --check interface-v2/mcp-ink-cli.mjs"
test_component "Sintaxe TursoAdapter.js" "node --check interface-v2/bridges/adapters/TursoAdapter.js"
test_component "Sintaxe migrate-to-ink.js" "node --check migrate-to-ink.js"
test_component "Sintaxe ipcom-ink" "node --check ipcom-ink"

echo ""
echo "4️⃣  VERIFICANDO DEPENDÊNCIAS NPM"
echo "────────────────────────────────────────────"

# Verificar se package.json tem as dependências necessárias
test_component "ink no package.json" "grep -q '\"ink\"' package.json"
test_component "ink-text-input no package.json" "grep -q '\"ink-text-input\"' package.json"
test_component "@inkjs/ui no package.json" "grep -q '\"@inkjs/ui\"' package.json"
test_component "react no package.json" "grep -q '\"react\"' package.json"

echo ""
echo "5️⃣  TESTANDO INTERFACE (MODO RÁPIDO)"
echo "────────────────────────────────────────────"

# Teste rápido da interface
echo -e "${YELLOW}Iniciando teste rápido da interface...${NC}"
if timeout 2 node interface-v2/mcp-ink-cli.mjs --version > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Interface responde a comandos${NC}"
    ((TESTS_PASSED++))
else
    # Se --version não funcionar, tenta só carregar
    if timeout 3 bash -c "echo '' | MCP_USER=test node interface-v2/mcp-ink-cli.mjs" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Interface carrega corretamente${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Interface não carrega${NC}"
        ((TESTS_FAILED++))
    fi
fi

echo ""
echo "6️⃣  VERIFICANDO ESTRUTURA DE DIRETÓRIOS"
echo "────────────────────────────────────────────"

test_component "Diretório interface-v2" "[ -d interface-v2 ]"
test_component "Diretório interface-v2/bridges" "[ -d interface-v2/bridges ]"
test_component "Diretório interface-v2/components" "[ -d interface-v2/components ]"
test_component "Diretório interface-v2/bridges/adapters" "[ -d interface-v2/bridges/adapters ]"

echo ""
echo "7️⃣  TESTANDO SCRIPTS DE TESTE"
echo "────────────────────────────────────────────"

test_component "test-ink-paste.sh" "[ -f test-ink-paste.sh ]"
test_component "test-paste-detection.sh" "[ -f test-paste-detection.sh ]"
test_component "test-terminal-paste.js" "[ -f test-terminal-paste.js ]"

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "                         📊 RESULTADO FINAL"
echo "════════════════════════════════════════════════════════════════════"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ TODOS OS TESTES PASSARAM!${NC}"
    echo -e "${GREEN}   Testes aprovados: $TESTS_PASSED${NC}"
    echo ""
    echo "🎉 Sistema pronto para instalação!"
    echo ""
    echo "Próximos passos:"
    echo "  1. Para nova instalação:     node setup.js"
    echo "  2. Para migrar instalação:   node migrate-to-ink.js"
    echo "  3. Para testar interface:    ./test-ink-paste.sh"
else
    echo -e "${RED}⚠️  ALGUNS TESTES FALHARAM${NC}"
    echo -e "   Testes aprovados: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "   Testes falhados:  ${RED}$TESTS_FAILED${NC}"
    echo ""
    echo "Recomendações:"
    echo "  1. Verifique os arquivos que falharam"
    echo "  2. Execute: pnpm install"
    echo "  3. Rode o teste novamente"
fi

echo ""
echo "════════════════════════════════════════════════════════════════════"