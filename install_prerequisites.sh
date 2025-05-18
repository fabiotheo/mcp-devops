#!/bin/bash
# MCP Terminal Assistant - Script de Instalação de Pré-Requisitos
# Este script instala Node.js, NPM e Zsh em vários sistemas Linux

set -e

# Cores para mensagens
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m" # No Color

# Função para imprimir mensagens com cores
print_message() {
    echo -e "${BLUE}[MCP Setup]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Detectar sistema operacional
detect_os() {
    if [ -f /etc/os-release ]; then
        # freedesktop.org and systemd
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
        ID=$ID
    elif type lsb_release >/dev/null 2>&1; then
        # linuxbase.org
        OS=$(lsb_release -si)
        VER=$(lsb_release -sr)
    elif [ -f /etc/lsb-release ]; then
        # Para algumas versões do Ubuntu/Debian
        . /etc/lsb-release
        OS=$DISTRIB_ID
        VER=$DISTRIB_RELEASE
    elif [ -f /etc/debian_version ]; then
        # Versões antigas do Debian
        OS=Debian
        VER=$(cat /etc/debian_version)
    elif [ -f /etc/redhat-release ]; then
        # Red hat/CentOS/etc.
        OS=$(cat /etc/redhat-release | cut -d ' ' -f 1)
        VER=$(cat /etc/redhat-release | grep -o '[0-9]\+\.[0-9]\+')
    else
        # Fall back para uname, e.g. "Linux <versão>", também funciona para BSD etc.
        OS=$(uname -s)
        VER=$(uname -r)
    fi
    
    print_message "Sistema detectado: $OS $VER ($ID)"
}

# Verificar se um comando está disponível
command_exists() {
    command -v "$@" >/dev/null 2>&1
}

# Instalar Zsh
install_zsh() {
    if command_exists zsh; then
        print_success "Zsh já está instalado: $(zsh --version | head -n1)"
        return 0
    fi
    
    print_message "Instalando Zsh..."
    
    case $ID in
        debian|ubuntu|pop|mint|kali)
            sudo apt-get update
            sudo apt-get install -y zsh
            ;;
        fedora|rhel|centos|rocky|almalinux)
            sudo dnf install -y zsh
            ;;
        amzn)
            sudo yum install -y zsh
            ;;
        arch|manjaro|endeavouros)
            sudo pacman -Sy --noconfirm zsh
            ;;
        opensuse*|suse*)
            sudo zypper install -y zsh
            ;;
        *)
            print_error "Não foi possível identificar o gerenciador de pacotes para instalar Zsh."
            print_error "Por favor, instale manualmente: https://github.com/ohmyzsh/ohmyzsh/wiki/Installing-ZSH"
            return 1
            ;;
    esac
    
    if [ $? -eq 0 ]; then
        print_success "Zsh instalado com sucesso: $(zsh --version | head -n1)"
    else
        print_error "Ocorreu um erro ao instalar o Zsh."
        return 1
    fi
}

# Instalar Node.js LTS e NPM
install_nodejs() {
    if command_exists node && command_exists npm; then
        NODE_VER=$(node -v)
        NPM_VER=$(npm -v)
        print_success "Node.js já está instalado: $NODE_VER (npm $NPM_VER)"
        
        # Verificar se é LTS
        if [[ "$NODE_VER" =~ ^v[0-9]*\.[0-9]*\.[0-9]*$ ]]; then
            NODE_MAJOR=$(echo $NODE_VER | cut -d. -f1 | tr -d 'v')
            if [ $NODE_MAJOR -lt 18 ]; then
                print_warning "Sua versão do Node.js ($NODE_VER) pode ser antiga."
                print_warning "Recomendamos atualizar para a versão LTS mais recente."
                read -p "Deseja instalar a versão LTS mais recente? (s/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Ss]$ ]]; then
                    # Continuar com a instalação
                    :
                else
                    return 0
                fi
            else
                return 0
            fi
        fi
    fi
    
    print_message "Instalando Node.js LTS..."
    
    case $ID in
        debian|ubuntu|pop|mint|kali)
            # Instalar Node.js usando NodeSource
            if ! command_exists curl; then
                sudo apt-get update
                sudo apt-get install -y curl
            fi
            
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        fedora)
            # Fedora tem versões de Node.js nos repos oficiais, mas podemos usar o NodeSource
            if ! command_exists curl; then
                sudo dnf install -y curl
            fi
            
            curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
            sudo dnf install -y nodejs
            ;;
        rhel|centos|rocky|almalinux)
            # RHEL/CentOS
            if ! command_exists curl; then
                sudo yum install -y curl
            fi
            
            curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
            sudo yum install -y nodejs
            ;;
        amzn)
            # Amazon Linux 2023
            if ! command_exists curl; then
                sudo dnf install -y curl
            fi
            
            curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
            sudo dnf install -y nodejs
            ;;
        arch|manjaro|endeavouros)
            # Arch Linux
            sudo pacman -Sy --noconfirm nodejs npm
            ;;
        opensuse*|suse*)
            # openSUSE
            sudo zypper install -y nodejs npm
            ;;
        *)
            print_error "Não foi possível identificar o gerenciador de pacotes para instalar Node.js."
            print_error "Por favor, instale Node.js LTS manualmente: https://nodejs.org/"
            return 1
            ;;
    esac
    
    if command_exists node && command_exists npm; then
        print_success "Node.js instalado com sucesso: $(node -v) (npm $(npm -v))"
    else
        print_error "Ocorreu um erro ao instalar o Node.js."
        return 1
    fi
}

# Configurar Zsh como shell padrão
set_zsh_default() {
    if [ "$SHELL" != "$(which zsh)" ]; then
        print_message "Configurando Zsh como shell padrão..."
        
        # Verificar se o arquivo /etc/shells contém o path do zsh
        ZSH_PATH=$(which zsh)
        if ! grep -Fxq "$ZSH_PATH" /etc/shells; then
            print_message "Adicionando $ZSH_PATH ao /etc/shells..."
            echo "$ZSH_PATH" | sudo tee -a /etc/shells > /dev/null
        fi
        
        # Mudar shell padrão
        chsh -s "$ZSH_PATH"
        
        print_success "Zsh configurado como shell padrão. Por favor, reinicie sua sessão de terminal."
        print_warning "Você precisará fazer login novamente para que a mudança tenha efeito."
    else
        print_success "Zsh já é o shell padrão."
    fi
}

# Verificar se é root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        print_error "Este script não deve ser executado como root diretamente."
        print_error "Utilize um usuário normal. O script usará sudo quando necessário."
        exit 1
    fi
}

# Verificar sudo
check_sudo() {
    if ! command_exists sudo; then
        print_error "O comando 'sudo' não está disponível. Instale-o antes de continuar."
        exit 1
    fi
}

# Instalar pacotes adicionais úteis
install_additional_packages() {
    local packages=()
    
    # Verificar se git está instalado
    if ! command_exists git; then
        packages+=("git")
    fi
    
    # Verificar se bc está instalado (usado em scripts para cálculos)
    if ! command_exists bc; then
        packages+=("bc")
    fi
    
    # Se nenhum pacote adicional é necessário, sair
    if [ ${#packages[@]} -eq 0 ]; then
        print_success "Todos os pacotes adicionais necessários já estão instalados."
        return 0
    fi
    
    print_message "Instalando pacotes adicionais: ${packages[*]}..."
    
    case $ID in
        debian|ubuntu|pop|mint|kali)
            sudo apt-get update
            sudo apt-get install -y "${packages[@]}"
            ;;
        fedora|rhel|centos|rocky|almalinux|amzn)
            if [ "$ID" = "fedora" ] || [ "$ID" = "amzn" ]; then
                sudo dnf install -y "${packages[@]}"
            else
                sudo yum install -y "${packages[@]}"
            fi
            ;;
        arch|manjaro|endeavouros)
            sudo pacman -Sy --noconfirm "${packages[@]}"
            ;;
        opensuse*|suse*)
            sudo zypper install -y "${packages[@]}"
            ;;
        *)
            print_warning "Não foi possível instalar pacotes adicionais automaticamente."
            print_warning "Considere instalar manualmente: ${packages[*]}"
            return 1
            ;;
    esac
    
    print_success "Pacotes adicionais instalados com sucesso."
}

# Função principal
main() {
    print_message "============================================="
    print_message "   MCP Terminal Assistant - Pré-requisitos   "
    print_message "============================================="
    print_message "Este script instalará os pré-requisitos necessários:"
    print_message "- Node.js LTS e NPM"
    print_message "- Zsh (shell interativo)"
    print_message "- Pacotes adicionais necessários"
    echo
    
    # Verificações iniciais
    check_root
    check_sudo
    detect_os
    
    # Instalar componentes
    install_additional_packages
    install_nodejs || { print_error "Falha ao instalar Node.js. Abortando."; exit 1; }
    install_zsh || { print_error "Falha ao instalar Zsh. Abortando."; exit 1; }
    
    echo
    print_message "============================================="
    print_message "   Todos os pré-requisitos foram instalados  "
    print_message "============================================="
    
    # Perguntar se o usuário quer mudar o shell padrão
    read -p "Deseja configurar Zsh como seu shell padrão? (s/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        set_zsh_default
    else
        print_warning "Zsh não foi configurado como shell padrão."
        print_warning "Para usar o MCP Terminal Assistant, você precisará iniciar o Zsh manualmente."
    fi
    
    echo
    print_success "Instalação de pré-requisitos concluída!"
    print_message "Agora você pode instalar o MCP Terminal Assistant com:"
    print_message "  node setup.js"
    echo
}

# Executar o script
main