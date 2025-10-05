# 🚀 GUIA DE INSTALAÇÃO - MCP TERMINAL ASSISTANT

## 📋 VISÃO GERAL

O MCP Terminal Assistant agora possui **dois sistemas de instalação**:
- **Setup Simplificado**: Versão otimizada (883 linhas, 83% redução)
- **Sistema de Migração**: Para transição segura entre versões

## 🔧 PRÉ-REQUISITOS

### Sistema Operacional
- ✅ **macOS** (testado em macOS 14+)
- ✅ **Linux** (Ubuntu, Debian, CentOS, RedHat)
- ⚠️ **Windows** (suporte básico via WSL)

### Software
- **Node.js**: Versão 16+ (recomendado 18+)
- **npm/pnpm**: Para gerenciamento de dependências
- **Shell**: bash, zsh, ou fish

### Verificação de Pré-requisitos
```bash
# Verificar Node.js
node --version  # Deve ser >= 16.0.0

# Verificar npm
npm --version

# Verificar shell atual
echo $SHELL
```

## 🎯 MÉTODO 1: INSTALAÇÃO FRESH (Nova Instalação)

### 1.1 Setup Interativo
```bash
# Navegar para diretório do projeto
cd /path/to/mcp-devops

# Executar setup simplificado
node ~/.mcp-terminal/setup.js

# Seguir prompts interativos:
# - Configurar API keys (Claude, OpenAI, Gemini)
# - Escolher shell de integração
# - Definir configurações personalizadas
```

### 1.2 Setup Automático
```bash
# Instalação sem prompts (usa defaults)
node ~/.mcp-terminal/setup.js --auto

# Instalação automática com configurações personalizadas
node ~/.mcp-terminal/setup.js --auto --verbose
```

### 1.3 Verificar Instalação
```bash
# Verificar status da instalação
node migration-cli.js status

# Resultado esperado:
# 🔍 Versão: simplified
# ✅ mcp-client.js
# ✅ mcp-assistant.js
# ✅ setup.js
# ✅ config.json
```

## 🔄 MÉTODO 2: MIGRAÇÃO (Atualizar Instalação Existente)

### 2.1 Detectar Versão Atual
```bash
# Identificar versão instalada
node migration-cli.js detect

# Resultado esperado:
# ✅ Versão detectada: 1.0.1
# 📁 Instalação em: ~/.mcp-terminal
# 📅 Modificado: 2025-09-29T00:27:07.303Z
```

### 2.2 Criar Backup Manual (Opcional)
```bash
# Backup com tag personalizada
node migration-cli.js backup "pre-upgrade-$(date +%Y%m%d)"

# Resultado:
# ✅ Backup criado com sucesso!
# 📁 Localização: ~/.mcp-terminal.backup-pre-upgrade-20250929-...
# 📊 Tamanho: ~40MB
# 📄 Arquivos: 5000+
```

### 2.3 Executar Migração
```bash
# Migrar para versão simplificada
node migration-cli.js migrate simplified

# Confirmar quando solicitado:
# ⚠️  Um backup será criado automaticamente. Continuar? (Y/n): Y

# Resultado esperado:
# ✅ Migração concluída com sucesso!
# 🎉 Versão atual: simplified
```

### 2.4 Verificar Migração
```bash
# Confirmar migração bem-sucedida
node migration-cli.js status

# Testar funcionalidade
node ~/.mcp-terminal/setup.js --help
```

## 🔙 ROLLBACK (Reverter Instalação)

### 3.1 Listar Backups Disponíveis
```bash
# Ver todos os backups
node migration-cli.js list-backups

# Resultado esperado:
# 1. 📦 Backup (Versão: 1.0.1, Data: 2025-09-29...)
# 2. 📦 Backup (Versão: simplified, Data: 2025-09-29...)
```

### 3.2 Restaurar Backup Específico
```bash
# Restaurar versão anterior
node migration-cli.js restore /Users/username/.mcp-terminal.backup-[TIMESTAMP]

# Confirmar quando solicitado:
# ⚠️  Esta operação substituirá a instalação atual. Continuar? (y/N): y

# Resultado:
# ✅ Backup restaurado com sucesso!
```

## 🧹 MANUTENÇÃO E LIMPEZA

### 4.1 Limpeza de Backups Antigos
```bash
# Manter apenas 5 backups mais recentes
node migration-cli.js cleanup

# Resultado:
# 🧹 Limpando backups antigos...
# ✅ Limpeza concluída
```

### 4.2 Upgrade de Instalação Existente
```bash
# Atualizar preservando configurações
node ~/.mcp-terminal/setup.js --upgrade

# Atualização forçada (sobrescreve tudo)
node ~/.mcp-terminal/setup.js --upgrade --force
```

## 🔍 SOLUÇÃO DE PROBLEMAS

### Erro: "Module not found"
```bash
# Verificar se Node.js suporta ES modules
node --version  # >= 16.0.0

# Verificar se package.json tem "type": "module"
cat package.json | grep '"type"'

# Recompilar módulos TypeScript se necessário
npx tsc src/setup/setup-migration.ts --target ES2022 --module ES2022
```

### Erro: "Permission denied"
```bash
# Dar permissões de execução
chmod +x migration-cli.js
chmod +x ~/.mcp-terminal/setup.js

# Verificar proprietário dos arquivos
ls -la ~/.mcp-terminal/
```

### Erro: "Symbolic link failed"
```bash
# Executar com modo verboso para diagnóstico
node migration-cli.js backup "debug-test" --verbose

# Verificar links simbólicos problemáticos
ls -la ~/.mcp-terminal/ | grep "^l"

# Resolver links quebrados manualmente se necessário
```

### Backup Corrompido ou Incompleto
```bash
# Verificar integridade do backup
node migration-cli.js list-backups

# Criar novo backup fresco
node migration-cli.js backup "recovery-$(date +%H%M%S)"

# Se necessário, reinstalar do zero
rm -rf ~/.mcp-terminal
# Seguir MÉTODO 1: INSTALAÇÃO FRESH
```

## ⚡ COMANDOS RÁPIDOS

### Setup Completo (Nova Instalação)
```bash
# One-liner para instalação automática
node ~/.mcp-terminal/setup.js --auto && node migration-cli.js status
```

### Migração Expressa
```bash
# Backup + Migração + Verificação em uma sequência
node migration-cli.js backup "pre-simplified" && \
echo "Y" | node migration-cli.js migrate simplified && \
node migration-cli.js status
```

### Verificação Rápida de Saúde
```bash
# Status + Backup count + Funcionalidade
node migration-cli.js status && \
echo "Backups: $(node migration-cli.js list-backups 2>/dev/null | grep -c "📦 Backup")" && \
node ~/.mcp-terminal/setup.js --help >/dev/null 2>&1 && echo "✅ Setup funcional" || echo "❌ Setup com problema"
```

## 📊 BENCHMARKS ESPERADOS

### Performance de Instalação
- **Setup Fresh**: < 10 segundos
- **Migração**: < 20 segundos
- **Backup**: < 15 segundos (5000+ arquivos)
- **Rollback**: < 25 segundos

### Uso de Recursos
- **Memória durante instalação**: < 50MB
- **Espaço em disco**: ~50MB instalação + ~40MB por backup
- **CPU**: Baixo impacto, sem picos prolongados

### Compatibilidade Testada
- ✅ **macOS 14+** com Node.js 18-22
- ✅ **Ubuntu 20.04+** com Node.js 16+
- ✅ **Shell integration**: bash, zsh
- ✅ **Symbolic links**: Tratamento correto

## 📞 SUPORTE

### Logs de Diagnóstico
```bash
# Executar com maximum verbosity
node migration-cli.js [comando] --verbose

# Para setup
node ~/.mcp-terminal/setup.js --verbose
```

### Informações do Sistema
```bash
# Coletar info para suporte
echo "Node: $(node --version)"
echo "OS: $(uname -a)"
echo "Shell: $SHELL"
echo "PWD: $(pwd)"
node migration-cli.js status
```

### Arquivos de Log
- **Setup logs**: `~/.mcp-terminal/logs/setup.log`
- **Migration logs**: Console output (usar `--verbose`)
- **Backup metadata**: `~/.mcp-terminal.backup-*/backup-info.json`

---

## ✅ CHECKLIST PÓS-INSTALAÇÃO

- [ ] Comando `node migration-cli.js detect` funciona
- [ ] Comando `node ~/.mcp-terminal/setup.js --help` funciona
- [ ] Arquivo `~/.mcp-terminal/.version` existe
- [ ] Configuração `~/.mcp-terminal/config.json` válida
- [ ] Shell integration funcionando (testar comando que falha)
- [ ] Pelo menos 1 backup disponível

---

*Guia atualizado em: 29 Set 2025*
*Versão: 1.0 - Setup Simplificado + Migração*