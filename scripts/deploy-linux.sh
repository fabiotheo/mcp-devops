#!/bin/bash

# =============================================================================
# IPCOM Chat - Deployment Script para Múltiplas Máquinas Linux
# =============================================================================
# Este script automatiza o deployment do IPCOM Chat em múltiplas máquinas Linux
# Suporta instalação via SSH e configuração automática do Turso
#
# Uso:
#   ./deploy-linux.sh <arquivo-hosts> [opções]
#
# Opções:
#   --turso-url URL      URL do banco Turso
#   --turso-token TOKEN  Token de autenticação Turso
#   --user USERNAME      Usuário SSH (padrão: current user)
#   --parallel           Executar em paralelo (máx 10 por vez)
#   --dry-run           Apenas simular, não executar
# =============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações padrão
SSH_USER=${USER}
PARALLEL=false
DRY_RUN=false
MAX_PARALLEL=10
TURSO_URL=""
TURSO_TOKEN=""
HOSTS_FILE=""

# Função de ajuda
show_help() {
    echo "Uso: $0 <arquivo-hosts> [opções]"
    echo ""
    echo "Opções:"
    echo "  --turso-url URL      URL do banco Turso"
    echo "  --turso-token TOKEN  Token de autenticação Turso"
    echo "  --user USERNAME      Usuário SSH (padrão: $USER)"
    echo "  --parallel           Executar em paralelo"
    echo "  --dry-run           Apenas simular"
    echo "  --help              Mostrar esta ajuda"
    echo ""
    echo "Formato do arquivo de hosts:"
    echo "  hostname1.exemplo.com"
    echo "  hostname2.exemplo.com"
    echo "  192.168.1.100"
    exit 0
}

# Processar argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        --turso-url)
            TURSO_URL="$2"
            shift 2
            ;;
        --turso-token)
            TURSO_TOKEN="$2"
            shift 2
            ;;
        --user)
            SSH_USER="$2"
            shift 2
            ;;
        --parallel)
            PARALLEL=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            ;;
        *)
            if [[ -z "$HOSTS_FILE" ]]; then
                HOSTS_FILE="$1"
            fi
            shift
            ;;
    esac
done

# Validar argumentos
if [[ -z "$HOSTS_FILE" ]]; then
    echo -e "${RED}❌ Erro: Arquivo de hosts não especificado${NC}"
    show_help
fi

if [[ ! -f "$HOSTS_FILE" ]]; then
    echo -e "${RED}❌ Erro: Arquivo de hosts não encontrado: $HOSTS_FILE${NC}"
    exit 1
fi

if [[ -z "$TURSO_URL" ]] || [[ -z "$TURSO_TOKEN" ]]; then
    echo -e "${YELLOW}⚠️  Aviso: Turso não configurado. Usando modo local apenas.${NC}"
fi

# Função para verificar conectividade SSH
check_ssh() {
    local host=$1
    ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=no \
        ${SSH_USER}@${host} "echo 'SSH OK'" >/dev/null 2>&1
}

# Função para instalar em uma máquina
install_on_host() {
    local host=$1
    local index=$2
    local total=$3

    echo -e "${BLUE}[$index/$total] Processando ${host}...${NC}"

    # Verificar conectividade
    if ! check_ssh "$host"; then
        echo -e "${RED}  ❌ Falha na conexão SSH com ${host}${NC}"
        return 1
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}  [DRY-RUN] Instalaria em ${host}${NC}"
        return 0
    fi

    # Criar script de instalação temporário
    cat > /tmp/ipcom-install-${host}.sh << 'INSTALL_SCRIPT'
#!/bin/bash
set -e

# Instalar dependências
echo "📦 Instalando dependências..."
if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq nodejs npm git curl
elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y nodejs npm git curl
else
    echo "Sistema de pacotes não suportado"
    exit 1
fi

# Instalar pnpm se não existir
if ! command -v pnpm >/dev/null 2>&1; then
    echo "📦 Instalando pnpm..."
    npm install -g pnpm
fi

# Clonar repositório
echo "📥 Clonando repositório..."
if [[ -d ~/mcp-devops ]]; then
    cd ~/mcp-devops
    git pull
else
    git clone https://github.com/ipcom/mcp-devops.git ~/mcp-devops
    cd ~/mcp-devops
fi

# Instalar dependências do projeto
echo "📦 Instalando dependências do projeto..."
pnpm install

# Executar setup
echo "🚀 Executando setup..."
node setup.js --auto

# Configurar Turso para cliente (NÃO cria schema!)
echo "📊 Configurando cliente Turso..."
node libs/turso-client-setup.js --auto

echo "✅ Instalação concluída!"
INSTALL_SCRIPT

    # Copiar e executar script
    scp -q /tmp/ipcom-install-${host}.sh ${SSH_USER}@${host}:/tmp/

    # Configurar Turso se disponível
    if [[ -n "$TURSO_URL" ]] && [[ -n "$TURSO_TOKEN" ]]; then
        ssh ${SSH_USER}@${host} << EOF
mkdir -p ~/.mcp-terminal
cat > ~/.mcp-terminal/turso-config.json << CONFIG
{
    "turso_url": "$TURSO_URL",
    "turso_token": "$TURSO_TOKEN",
    "turso_sync_url": "$TURSO_URL",
    "turso_sync_interval": 60,
    "history_mode": "hybrid",
    "fallback_enabled": true,
    "cache_ttl": 3600,
    "max_retries": 5,
    "retry_interval": 60000
}
CONFIG
EOF
    fi

    # Executar instalação
    ssh ${SSH_USER}@${host} "bash /tmp/ipcom-install-${host}.sh"

    # Limpar
    ssh ${SSH_USER}@${host} "rm /tmp/ipcom-install-${host}.sh"
    rm /tmp/ipcom-install-${host}.sh

    echo -e "${GREEN}  ✅ ${host} instalado com sucesso${NC}"
    return 0
}

# Função para instalação paralela
install_parallel() {
    local hosts=("$@")
    local pids=()
    local results=()
    local batch_size=$MAX_PARALLEL
    local total=${#hosts[@]}

    for ((i=0; i<$total; i+=$batch_size)); do
        # Processar batch
        for ((j=i; j<i+$batch_size && j<$total; j++)); do
            install_on_host "${hosts[$j]}" $((j+1)) $total &
            pids+=($!)
        done

        # Aguardar batch completar
        for pid in "${pids[@]}"; do
            wait $pid
            results+=($?)
        done
        pids=()
    done

    return 0
}

# Função principal
main() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}       IPCOM Chat - Deployment para Linux              ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""

    # Ler hosts do arquivo
    mapfile -t HOSTS < "$HOSTS_FILE"
    TOTAL_HOSTS=${#HOSTS[@]}

    echo -e "${GREEN}📋 Hosts para instalação: ${TOTAL_HOSTS}${NC}"
    echo -e "${GREEN}👤 Usuário SSH: ${SSH_USER}${NC}"
    echo -e "${GREEN}🔄 Modo: $([ "$PARALLEL" == "true" ] && echo "Paralelo" || echo "Sequencial")${NC}"

    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}⚠️  MODO DRY-RUN ATIVADO${NC}"
    fi

    echo ""
    echo "Hosts:"
    for host in "${HOSTS[@]}"; do
        echo "  - $host"
    done

    echo ""
    read -p "Continuar com a instalação? (s/N) " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        echo -e "${YELLOW}Instalação cancelada${NC}"
        exit 0
    fi

    echo ""
    echo -e "${BLUE}🚀 Iniciando deployment...${NC}"
    echo ""

    # Executar instalação
    if [[ "$PARALLEL" == "true" ]]; then
        install_parallel "${HOSTS[@]}"
    else
        local index=1
        for host in "${HOSTS[@]}"; do
            install_on_host "$host" $index $TOTAL_HOSTS
            ((index++))
        done
    fi

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ Deployment concluído!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Próximos passos:"
    echo "1. Criar usuários: ipcom-chat user create --username USER --name 'Nome' --email email"
    echo "2. Migrar histórico: node libs/migrate-history.js"
    echo "3. Usar o sistema: ipcom-chat ou ipcom-chat --user USERNAME"
}

# Executar
main