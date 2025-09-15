#!/bin/bash
# Script de teste rápido do IPCOM Chat

echo "🧪 TESTE COMPLETO DO IPCOM CHAT"
echo "================================"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para testar comando
test_command() {
    echo -e "\n${YELLOW}▶ Testando: $1${NC}"
    if eval "$1"; then
        echo -e "${GREEN}✅ OK${NC}"
    else
        echo -e "${RED}❌ FALHOU${NC}"
    fi
}

echo -e "\n${YELLOW}1. TESTANDO COMANDOS BÁSICOS${NC}"
echo "--------------------------------"
test_command "ipcom-chat --help"
test_command "ipcom-chat --version"

echo -e "\n${YELLOW}2. TESTANDO GERENCIAMENTO DE USUÁRIOS${NC}"
echo "---------------------------------------"
test_command "ipcom-chat user list"

# Criar usuário de teste se não existir
echo -e "\n${YELLOW}▶ Criando usuário de teste...${NC}"
ipcom-chat user create --username teste --name "Usuario Teste" --email teste@ipcom.com.br 2>/dev/null || echo "Usuário já existe"

test_command "ipcom-chat user stats teste"

echo -e "\n${YELLOW}3. TESTANDO COMANDOS DE HISTÓRICO${NC}"
echo "-----------------------------------"
test_command "ipcom-chat history --limit 3"
test_command "ipcom-chat history --user teste --limit 3"
test_command "ipcom-chat history stats --days 7"

echo -e "\n${YELLOW}4. TESTANDO COMANDOS DE MÁQUINA${NC}"
echo "---------------------------------"
test_command "ipcom-chat machine info"
test_command "ipcom-chat machine list"

echo -e "\n${YELLOW}5. TESTANDO BUSCA NO HISTÓRICO${NC}"
echo "--------------------------------"
test_command "ipcom-chat history search 'test' --limit 5"

echo -e "\n${YELLOW}6. VERIFICANDO INTEGRIDADE DO BANCO${NC}"
echo "-------------------------------------"
if [ -f ~/.mcp-terminal/libs/turso-verify-schema.js ]; then
    node ~/.mcp-terminal/libs/turso-verify-schema.js
else
    echo -e "${RED}Script de verificação não encontrado${NC}"
fi

echo -e "\n${GREEN}================================${NC}"
echo -e "${GREEN}TESTE COMPLETO FINALIZADO!${NC}"
echo -e "${GREEN}================================${NC}"

echo -e "\n${YELLOW}💡 Próximos passos:${NC}"
echo "1. Entre no modo interativo: ipcom-chat"
echo "2. Digite alguns comandos"
echo "3. Use a seta ↑ para navegar no histórico"
echo "4. Digite /help para ver comandos disponíveis"
echo "5. Digite /exit para sair"