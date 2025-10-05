# Fluxo de Instalação - Database Migrations

## Resumo

Este documento explica como as migrations do Drizzle são executadas durante a instalação/upgrade do MCP Terminal.

---

## 🔄 Fluxo para Nova Instalação

### 1. Usuário executa `node setup.js` (ou `npm run install-script`)

### 2. Setup compila o código
```bash
npm run build  # TypeScript → JavaScript
```

### 3. Setup copia arquivos para `~/.mcp-terminal/`
- ✅ Código compilado (`dist/` → `src/`)
- ✅ **Diretório `drizzle/`** (schemas + migrations)
- ✅ Scripts, patterns, etc.

### 4. Setup solicita credenciais do Turso
```
TURSO_URL: libsql://ipcom-linux-xxx.turso.io
TURSO_AUTH_TOKEN: eyJ...
```

### 5. Setup executa `src/scripts/run-migrations.js`

O script faz:
- ✅ Verifica se `__drizzle_migrations` existe
- ❌ **Não existe** (primeira instalação)
- ✅ Lê `drizzle/migrations/0000_*.sql`
- ✅ Executa todos os CREATE TABLE
- ✅ Cria tabela `__drizzle_migrations`
- ✅ Registra migration executada

### 6. Banco criado com sucesso! ✨

**Tabelas criadas:**
- users
- machines
- history_global
- history_user
- history_machine
- command_cache
- sessions
- conversation_summaries
- __drizzle_migrations

---

## 🔄 Fluxo para Upgrade (Banco já existe)

### 1. Usuário executa `node setup.js --upgrade`

### 2. Setup detecta instalação existente

### 3. Setup copia novos arquivos
- ✅ Código atualizado
- ✅ **Novas migrations** (se houver)

### 4. Setup executa `src/scripts/run-migrations.js`

O script faz:
- ✅ Verifica se `__drizzle_migrations` existe
- ✅ **Existe** (instalação prévia)
- ✅ Lê migrations pendentes
- ✅ Compara com registro em `__drizzle_migrations`
- ✅ Executa apenas migrations novas
- ✅ Registra novas migrations

### 5. Banco atualizado! ✨

---

## 📁 Arquivos Importantes

### `/drizzle/`
```
drizzle/
├── schemas/
│   ├── users.ts
│   ├── machines.ts
│   ├── historyGlobal.ts
│   ├── historyUser.ts
│   ├── historyMachine.ts
│   ├── commandCache.ts
│   ├── sessions.ts
│   ├── conversationSummaries.ts
│   └── index.ts
├── migrations/
│   ├── 0000_fast_reaper.sql      # Migration inicial
│   ├── 0001_*.sql                # Futuras migrations
│   └── meta/
│       ├── _journal.json
│       └── 0000_snapshot.json
```

### `src/scripts/run-migrations.ts`
Script executado automaticamente pelo `setup.js`:
- ✅ Detecta primeira instalação vs upgrade
- ✅ Executa migrations pendentes
- ✅ Registra migrations executadas
- ✅ Lida com erros graciosamente

### `setup.js` (linhas 482-502)
```javascript
console.log('   🔄 Executando migrations do banco de dados...');
const scriptPath = path.join(this.mcpDir, 'src', 'scripts', 'run-migrations.js');
await execAsync(`node ${scriptPath}`, { cwd: this.mcpDir });
console.log('   ✅ Schema do Turso atualizado');
```

---

## 🛠️ Scripts de Desenvolvimento

### Para gerar nova migration:
```bash
npm run db:generate
```

### Para executar migration manualmente:
```bash
npm run db:migrate
```

### Para fazer backup e recriar tudo (uso único):
```bash
npm run db:backup-and-migrate
```

### Para explorar banco com interface visual:
```bash
npm run db:studio
```

---

## ✅ Checklist de Validação

Após instalação/upgrade, verificar:

```bash
# 1. Verificar se migrations foram registradas
turso db shell ipcom-linux "SELECT * FROM __drizzle_migrations"

# 2. Verificar tabelas criadas
turso db shell ipcom-linux ".tables"

# 3. Verificar schema de uma tabela
turso db shell ipcom-linux ".schema conversation_summaries"
```

---

## 🚨 Troubleshooting

### "Script de migrations não encontrado"
**Causa**: Diretório `drizzle/` não foi copiado durante instalação
**Solução**: Executar `npm run build` e depois `node setup.js --upgrade`

### "Erro ao executar migrations"
**Causa**: Credenciais do Turso inválidas ou problema de rede
**Solução**: Verificar `~/.mcp-terminal/config.json`:
```json
{
  "turso_url": "libsql://...",
  "turso_token": "eyJ..."
}
```

### "FOREIGN KEY constraint failed"
**Causa**: Tentando dropar tabelas com relacionamentos
**Solução**: Use o script `db:backup-and-migrate` que desabilita FK checks

---

## 📚 Referências

- [Plano de Migrations Completo](./migrations.md)
- [Baseline Workflow Guide](./baseline-workflow-guide.md)
- [Documentação das Tabelas](./tables/README.md)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
