# PLANO DE MIGRAÇÃO V1 → V2 - MCP Terminal Assistant

## OBJETIVO
Tornar `interface-v2/mcp-ink-cli.mjs` a interface oficial do sistema, substituindo completamente a v1, preservando todos os arquivos antigos em backups e garantindo migração segura sem quebrar funcionalidades.

## ESTRUTURA DE FASES

### FASE 1: PREPARAÇÃO E INVENTÁRIO
**Objetivo:** Mapear completamente o sistema atual sem modificar nada

#### Comandos de Inventário
```bash
# 1.1 Criar inventário completo
find . -type f -name "*.js" -o -name "*.mjs" | grep -v node_modules | grep -v backup > inventory-v1.txt

# 1.2 Verificar arquivos principais em uso
- mcp-client.js (monitoramento de comandos)
- mcp-assistant.js (interface principal v1)
- ai_orchestrator.js (orquestrador compartilhado)
- libs/turso-client.js (cliente Turso)
- setup.js (instalador atual)

# 1.3 Checklist de testes funcionais
□ Comando falha → análise de erro funciona
□ mcp-assistant "query" funciona
□ Histórico local é salvo
□ Integração Turso funciona
□ Integração zsh funciona
```

#### GATE 1 - Aprovação do Usuário
- [ ] Verifique inventory-v1.txt - todos os arquivos importantes estão listados?
- [ ] Teste: `node mcp-assistant.js 'como listar arquivos?'` funciona?
- [ ] Teste: um comando com erro é capturado pelo zsh?

---

### FASE 2: BACKUP COMPLETO
**Objetivo:** Preservar estado atual antes de qualquer mudança

#### Comandos de Backup
```bash
# 2.1 Criar estrutura de backup datada
mkdir -p backup-v1-$(date +%Y%m%d)/{root,libs,patterns,web_search,web_scraper,ai_models}

# 2.2 Copiar arquivos principais
cp mcp-assistant.js backup-v1-*/root/
cp mcp-client.js backup-v1-*/root/
cp -r libs/*.js backup-v1-*/libs/
cp package.json backup-v1-*/root/

# 2.3 Criar script de rollback
cat > rollback-to-v1.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=$(ls -d backup-v1-* | sort -r | head -n1)
if [ -z "$BACKUP_DIR" ]; then
    echo "Erro: Nenhum backup encontrado!"
    exit 1
fi
echo "Restaurando de $BACKUP_DIR..."
cp $BACKUP_DIR/root/* .
cp -r $BACKUP_DIR/libs/* libs/
echo "Rollback completo!"
EOF
chmod +x rollback-to-v1.sh
```

#### GATE 2 - Aprovação do Usuário
- [ ] Verifique backup-v1-*/ - tudo foi preservado?
- [ ] Teste: ./rollback-to-v1.sh restauraria o sistema se necessário?
- [ ] O sistema v1 continua funcionando normalmente?

---

### FASE 3: PREPARAÇÃO DA V2
**Objetivo:** Garantir que v2 está 100% pronta

#### Validações da V2
```bash
# 3.1 Testar v2 isoladamente
node interface-v2/mcp-ink-cli.mjs --user $USER
node interface-v2/mcp-ink-cli.mjs "test query"

# 3.2 Verificar compatibilidade
- AIOrchestrator em interface-v2/bridges/
- TursoAdapter em interface-v2/bridges/adapters/
- Dependências npm instaladas

# 3.3 Criar aliases temporários para teste
alias mcp-v2="node $(pwd)/interface-v2/mcp-ink-cli.mjs"
```

#### GATE 3 - Aprovação do Usuário
- [ ] Teste: `node interface-v2/mcp-ink-cli.mjs --user SEU_USUARIO`
- [ ] Histórico com ↑↓ funciona corretamente?
- [ ] Ctrl+C cancela comandos adequadamente?
- [ ] Respostas da IA estão chegando?

---

### FASE 4: MIGRAÇÃO DO SETUP.JS
**Objetivo:** Atualizar instalador para usar v2

#### Modificações no setup.js
```javascript
// 4.1 Modificar makeExecutable() para copiar v2
const filesToCopy = [
    { src: 'interface-v2/mcp-ink-cli.mjs', dest: 'mcp-assistant.js' },
    { src: 'mcp-assistant.js', dest: 'mcp-assistant-v1.js' }, // backup
    { src: 'mcp-client.js', dest: 'mcp-client.js' }, // manter
    // copiar também interface-v2/bridges/ completo
];

// 4.2 Copiar diretório interface-v2 completo
const interfaceV2Dir = path.join(process.cwd(), 'interface-v2');
const destInterfaceV2Dir = path.join(this.mcpDir, 'interface-v2');
// ... código de cópia recursiva

// 4.3 Atualizar comando principal
// /usr/local/bin/ipcom-chat → aponta para mcp-assistant.js (que agora é v2)
```

#### GATE 4 - Aprovação do Usuário
- [ ] Rode: `node setup.js --upgrade --auto`
- [ ] Teste: `ipcom-chat 'teste após migração'`
- [ ] Histórico anterior foi preservado?
- [ ] Integração zsh continua capturando erros?

---

### FASE 5: EXECUÇÃO FINAL E VALIDAÇÃO

## ESTRUTURA FINAL APÓS MIGRAÇÃO

```
~/.mcp-terminal/
├── mcp-assistant.js (→ interface v2)
├── mcp-assistant-v1.js (backup da v1)
├── mcp-client.js (mantido para captura de erros)
├── interface-v2/
│   ├── mcp-ink-cli.mjs (código real)
│   ├── bridges/
│   │   ├── AIOrchestrator.js
│   │   └── adapters/
│   │       └── TursoAdapter.js
│   └── components/
├── libs/ (compartilhado)
├── patterns/ (compartilhado)
├── ai_models/ (compartilhado)
└── backup-v1-[data]/ (preservação completa)
```

## RISCOS IDENTIFICADOS E MITIGAÇÕES

### RISCO 1: Quebrar captura de erros do zsh
- **Mitigação:** Manter mcp-client.js intacto
- **Teste:** Forçar erro e verificar captura

### RISCO 2: Perder histórico do usuário
- **Mitigação:** Backup do .mcp_terminal_history e database Turso
- **Teste:** Comparar histórico antes/depois

### RISCO 3: Dependências npm incompatíveis
- **Mitigação:** Verificar package.json da v2
- **Teste:** npm install limpo em ambiente teste

### RISCO 4: Setup.js mal configurado
- **Mitigação:** Testar em modo dry-run primeiro
- **Teste:** Instalação em diretório temporário

## COMANDOS DE VERIFICAÇÃO PÓS-MIGRAÇÃO

```bash
# Verificar que v2 está ativa
ps aux | grep mcp-ink-cli

# Verificar symlinks
ls -la /usr/local/bin/ipcom-chat
ls -la ~/.mcp-terminal/

# Verificar histórico preservado
sqlite3 ~/.mcp-terminal/history.db "SELECT COUNT(*) FROM history_user"

# Verificar integração zsh
tail -f ~/.mcp-terminal/debug.log

# Teste completo funcional
ipcom-chat "como ver uso de disco?"

# Força erro para testar captura
fakecmd --invalid

# Verificar se erro foi capturado
cat ~/.mcp-terminal/debug.log | tail -20
```

## PROCEDIMENTO DE ROLLBACK EMERGENCIAL

Se algo der errado em qualquer fase:

```bash
# 1. Parar qualquer processo v2
pkill -f mcp-ink-cli

# 2. Restaurar v1 dos backups
./rollback-to-v1.sh

# 3. Reinstalar v1 original
cd backup-v1-*/
node setup.js --upgrade --auto

# 4. Verificar funcionamento
ipcom-chat --version
ipcom-chat "teste após rollback"

# 5. Se necessário, restaurar histórico
cp ~/.mcp_terminal_history.backup ~/.mcp_terminal_history
```

## CHECKLIST FINAL DE MIGRAÇÃO

### Pré-Migração
- [ ] Todos os testes da v1 passando
- [ ] Backup completo criado
- [ ] Script de rollback testado
- [ ] V2 testada isoladamente

### Durante Migração
- [ ] Cada GATE aprovado pelo usuário
- [ ] Logs salvos de cada etapa
- [ ] Testes incrementais executados

### Pós-Migração
- [ ] Interface v2 respondendo
- [ ] Histórico navegável com ↑↓
- [ ] Captura de erros zsh funcionando
- [ ] Turso sincronizando corretamente
- [ ] Comandos AI respondendo
- [ ] Cancelamento com Ctrl+C funcional

## NOTAS IMPORTANTES

1. **NUNCA** pule um GATE de aprovação
2. **SEMPRE** teste o rollback antes de prosseguir
3. **DOCUMENTE** qualquer desvio do plano
4. **PRESERVE** logs de cada etapa
5. **COMUNIQUE** ao usuário o status de cada fase

## ALTERAÇÕES NECESSÁRIAS NO CÓDIGO

### 1. Correções já implementadas
- [x] ORDER BY timestamp ASC no turso-client.js
- [x] Remoção de marcadores de cancelamento do histórico de navegação

### 2. Pendentes para migração
- [ ] Atualizar setup.js para copiar interface-v2
- [ ] Criar estrutura de backup datada
- [ ] Ajustar paths no package.json se necessário
- [ ] Verificar compatibilidade de dependências

---

**Data de criação do plano:** Janeiro 2025
**Versão:** 1.0
**Status:** AGUARDANDO EXECUÇÃO

---

## INÍCIO DA EXECUÇÃO

Para começar a migração, execute:

```bash
# Começar pela FASE 1
echo "=== INICIANDO MIGRAÇÃO V1 → V2 ==="
echo "FASE 1: Criando inventário..."
```

**IMPORTANTE:** Cada fase deve ser aprovada antes de continuar!