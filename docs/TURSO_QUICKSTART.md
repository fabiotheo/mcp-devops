# IPCOM Chat - Turso Quick Start Guide

## ⚠️ IMPORTANTE: Processo Separado Admin vs Cliente

### Diferença Crítica
- **ADMINISTRADOR**: Cria schema (UMA vez apenas)
- **CLIENTES**: Apenas conectam (300+ máquinas)

## 🚀 Início Rápido

### 1. Configuração Inicial

#### Para ADMINISTRADOR (apenas UMA vez!):
```bash
# ⚠️ CUIDADO: Apenas o admin executa isso!
# Cria o schema do banco de dados
node libs/turso-admin-setup.js

# Após criar schema, gerar token de CLIENTE no Turso
# com permissões READ + WRITE (não admin!)
```

#### Para CLIENTES (todas as máquinas):
```bash
# Configurar conexão com banco existente
node libs/turso-client-setup.js

# Criar primeiro usuário (se necessário)
ipcom-chat user create --username USER --name "Nome" --email email@exemplo.com

# Registrar máquina (automático no setup)
ipcom-chat machine info
```

### 2. Uso Básico (Usuários)

```bash
# Modo interativo global (padrão)
ipcom-chat

# Modo usuário específico
ipcom-chat --user fabio

# Modo máquina local apenas
ipcom-chat --local

# Modo híbrido (todos os históricos)
ipcom-chat --hybrid
```

### 3. Comandos de Gerenciamento

#### Gerenciar Usuários
```bash
# Listar usuários
ipcom-chat user list

# Criar usuário
ipcom-chat user create --username USER --name "Nome Completo" --email email@exemplo.com

# Atualizar usuário
ipcom-chat user update USERNAME --name "Novo Nome" --email novo@email.com

# Ver estatísticas
ipcom-chat user stats USERNAME

# Desativar usuário
ipcom-chat user delete USERNAME
```

#### Gerenciar Histórico
```bash
# Ver estatísticas
ipcom-chat history stats
ipcom-chat history stats --user USERNAME
ipcom-chat history stats --days 7

# Buscar no histórico
ipcom-chat history search "termo de busca"
ipcom-chat history search "docker" --limit 50

# Exportar histórico
ipcom-chat history export --format json --output backup.json
ipcom-chat history export --format csv --output relatorio.csv
```

#### Gerenciar Máquinas
```bash
# Registrar máquina
ipcom-chat machine register

# Listar máquinas
ipcom-chat machine list

# Ver informações da máquina
ipcom-chat machine info
```

### 4. Verificação e Diagnóstico

```bash
# Verificar se schema está correto
node libs/turso-verify-schema.js

# Migrar histórico local para Turso
node libs/migrate-history.js

# Verificar status da migração
node libs/migrate-history.js verify
```

## 📊 Modos de Operação

### Modo Global (Padrão)
- Comandos salvos em `history_global`
- Visíveis para todos os usuários
- Ideal para conhecimento compartilhado
- Uso: `ipcom-chat`

### Modo Usuário
- Comandos salvos em `history_user`
- Privados por usuário
- Acessíveis de qualquer máquina
- Uso: `ipcom-chat --user USERNAME`

### Modo Máquina
- Comandos salvos em `history_machine`
- Específicos da máquina local
- Não sincronizados
- Uso: `ipcom-chat --local`

### Modo Híbrido
- Acessa todos os históricos
- Prioriza: user > machine > global
- Máxima inteligência
- Uso: `ipcom-chat --hybrid`

## 🔧 Configuração Avançada

### Arquivo de Configuração
Localização: `~/.mcp-terminal/turso-config.json`

```json
{
    "turso_url": "libsql://seu-banco.turso.io",
    "turso_token": "seu-token-aqui",
    "turso_sync_url": "libsql://seu-banco.turso.io",
    "turso_sync_interval": 60,
    "history_mode": "hybrid",
    "fallback_enabled": true,
    "cache_ttl": 3600,
    "max_retries": 5,
    "retry_interval": 60000
}
```

### Variáveis de Ambiente
```bash
export TURSO_DATABASE_URL="libsql://seu-banco.turso.io"
export TURSO_AUTH_TOKEN="seu-token"
export IPCOM_HISTORY_MODE="hybrid"
export IPCOM_USER="fabio"
```

## 🚨 Troubleshooting

### Erro de Conexão com Turso
```bash
# Verificar configuração
cat ~/.mcp-terminal/turso-config.json

# Verificar integridade do schema
node libs/turso-verify-schema.js

# Re-configurar (cliente)
node libs/turso-client-setup.js
```

### Usuário não encontrado
```bash
# Listar usuários existentes
ipcom-chat user list

# Criar novo usuário
ipcom-chat user create --username USER --name "Nome" --email email
```

### Histórico não sincronizando
```bash
# Verificar status
ipcom-chat history stats

# Forçar sincronização
node libs/turso-client.js sync

# Ver logs
tail -f ~/.mcp-terminal/turso.log
```

## 🏢 Deployment Empresarial

### Para 300+ Máquinas Linux

#### ⚠️ PASSO CRÍTICO: Setup do Admin PRIMEIRO!

1. **No servidor principal (APENAS UMA VEZ!):**
```bash
# Criar schema do banco
node libs/turso-admin-setup.js

# Seguir instruções para gerar token de CLIENTE no Turso
# Token deve ter apenas READ + WRITE (não admin!)
```

2. **Preparar arquivo de hosts para clientes:**
```bash
cat > hosts.txt << EOF
server1.ipcom.local
server2.ipcom.local
server3.ipcom.local
# ... até 300+ máquinas
EOF
```

3. **Executar deployment nas máquinas clientes:**
```bash
# Usa TOKEN DE CLIENTE, não de admin!
./deploy-linux.sh hosts.txt \
    --turso-url "libsql://ipcom.turso.io" \
    --turso-token "TOKEN-DE-CLIENTE-AQUI" \
    --user deploy \
    --parallel
```

4. **Criar usuários em massa:**
```bash
# Script para criar múltiplos usuários
for user in $(cat users.txt); do
    ipcom-chat user create --username $user \
        --name "$user" \
        --email "$user@ipcom.com.br"
done
```

## 📈 Métricas e Monitoramento

### Dashboard de Uso
```bash
# Estatísticas gerais
ipcom-chat history stats

# Top comandos
ipcom-chat history stats --top-commands

# Usuários ativos
ipcom-chat user list --active

# Máquinas ativas
ipcom-chat machine list
```

### Exportar para Análise
```bash
# Exportar últimos 30 dias
ipcom-chat history export \
    --format json \
    --days 30 \
    --output analytics.json

# Importar no Excel/Tableau/PowerBI
ipcom-chat history export \
    --format csv \
    --output relatorio.csv
```

## 🔐 Segurança

### Boas Práticas
1. **Nunca compartilhe o token Turso**
2. **Use HTTPS para o banco Turso**
3. **Rotacione tokens periodicamente**
4. **Monitore acessos não autorizados**

### Auditoria
```bash
# Ver todos os acessos
ipcom-chat history search "*" --limit 1000

# Filtrar por usuário
ipcom-chat history search "*" --user USERNAME

# Filtrar por máquina
ipcom-chat history search "*" --machine MACHINE_ID
```

## 📚 Recursos Adicionais

- [Documentação Turso](https://docs.turso.tech)
- [Guia de Migração](./migration-guide.md)
- [API Reference](./api-reference.md)
- [Troubleshooting Guide](./troubleshooting.md)

## 💬 Suporte

Para suporte e dúvidas:
- Email: suporte@ipcom.com.br
- Slack: #ipcom-chat
- GitHub Issues: github.com/ipcom/mcp-devops