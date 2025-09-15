# Turso Quick Start Guide

## 1. Criar Conta no Turso

1. Acesse https://turso.tech e crie uma conta gratuita
2. Você terá 500 databases e 9GB de storage grátis

## 2. Instalar Turso CLI

```bash
# macOS/Linux
curl -sSfL https://get.tur.so/install.sh | bash

# Verificar instalação
turso --version
```

## 3. Fazer Login

```bash
turso auth login
```

## 4. Criar Database

```bash
# Criar database na região Brasil (São Paulo)
turso db create ipcom-history --region gru

# Listar databases
turso db list

# Obter URL da database
turso db show ipcom-history --url

# Criar token de acesso
turso db tokens create ipcom-history
```

## 5. Configurar Replicas (Opcional)

```bash
# Adicionar replica em Virginia (US)
turso db replicate ipcom-history iad

# Adicionar replica em Amsterdam (EU)
turso db replicate ipcom-history ams

# Verificar replicas
turso db show ipcom-history
```

## 6. Executar Setup do MCP

```bash
# Executar o script de setup
node libs/turso-setup.js
```

O script irá:
- Pedir suas credenciais do Turso (URL e Token)
- Criar todas as tabelas necessárias
- Criar índices para performance
- Opcionalmente criar um usuário inicial

## 7. Testar a Conexão

```bash
# Testar o cliente Turso
node libs/turso-client.js

# Testar geração de ID da máquina
node libs/machine-identity.js generate

# Ver informações da máquina
node libs/machine-identity.js info
```

## 8. Configurar Variáveis de Ambiente (Opcional)

Se preferir usar variáveis de ambiente ao invés do arquivo de configuração:

```bash
# Adicionar ao seu .bashrc ou .zshrc
export TURSO_DATABASE_URL="libsql://ipcom-history-seu-usuario.turso.io"
export TURSO_AUTH_TOKEN="eyJhbGc..."
export TURSO_SYNC_URL="libsql://ipcom-history-seu-usuario.turso.io"
```

## 9. Usar o Sistema

### Modo Global (padrão)
```bash
ipcom-chat
# Histórico compartilhado por todos
```

### Modo Usuário
```bash
# Criar usuário
node libs/turso-setup.js
# Escolher opção de criar usuário

# Usar com usuário específico
ipcom-chat --user fabio
```

### Modo Máquina (local apenas)
```bash
ipcom-chat --local
```

### Modo Híbrido
```bash
ipcom-chat --hybrid
```

## Comandos Úteis do Turso CLI

```bash
# Ver uso de storage
turso db inspect ipcom-history

# Ver estatísticas
turso db show ipcom-history --stats

# Executar SQL diretamente
turso db shell ipcom-history

# Dentro do shell:
.tables                    # Listar tabelas
.schema users             # Ver schema de uma tabela
SELECT COUNT(*) FROM history_global;  # Contar registros
.quit                     # Sair
```

## Troubleshooting

### Erro de Conexão
- Verifique se o URL e token estão corretos
- Teste com: `turso db shell ipcom-history`

### Erro de Permissão
- Certifique-se que o token tem permissões de leitura e escrita
- Recrie o token se necessário: `turso db tokens create ipcom-history`

### Sincronização Lenta
- Ajuste o `sync_interval` na configuração (padrão: 60 segundos)
- Considere usar menos replicas se a latência for alta

### Reset do Database
```bash
# CUIDADO: Isso apagará todos os dados!
node libs/turso-setup.js reset
```

## Monitoramento

Para monitorar o uso e performance:

```bash
# No Turso Dashboard
https://turso.tech/app/databases

# Via CLI
turso db inspect ipcom-history --verbose
```

## Custos

Com o plano gratuito você tem:
- 500 databases
- 9GB total de storage
- 1 bilhão de row reads por mês

Para uso corporativo com 300 máquinas, o custo estimado seria:
- ~$0.02/GB de storage
- ~$1/mês para 1TB de row reads

Muito mais barato que PostgreSQL ou MongoDB!