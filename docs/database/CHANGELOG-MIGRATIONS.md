# Changelog - Plano de Migrations Drizzle ORM

## 2025-01-17 - Code Review e Correções Críticas

### 🔴 ERROS CRÍTICOS CORRIGIDOS

#### 1. Campo users.email - NOT NULL Faltante

**Status**: ✅ CORRIGIDO

**Arquivo**: `migrations-REVISED.md:436`

**Problema Identificado**:
```typescript
// ❌ ANTES (INCORRETO)
email: text('email'), // Comentário dizia "banco real permite NULL"
```

**Correção Aplicada**:
```typescript
// ✅ DEPOIS (CORRETO)
email: text('email').notNull(), // Conforme turso-client.ts:214
```

**Descoberta**: Code review revelou que o banco REAL define `email TEXT NOT NULL` em `turso-client.ts:214`, contradizendo o comentário no schema proposto.

**Impacto Evitado**:
- ❌ Migration baseline teria tentado `ALTER TABLE users ALTER COLUMN email DROP NOT NULL`
- ❌ Não seria vazia (violando princípio da baseline)
- ❌ Type safety incorreto (TypeScript aceitaria null quando DB rejeita)

**Validação**:
```bash
# Confirmar no banco real:
turso db shell ipcom-chat ".schema users"
# Output esperado: email TEXT NOT NULL,
```

---

#### 2. Index conversation_summaries - Index Faltante

**Status**: ✅ CORRIGIDO

**Arquivo**: `migrations-REVISED.md:664-668`

**Problema Identificado**:
Schema definia apenas UNIQUE constraint, mas não o INDEX explícito criado em `turso-client.ts:405-408`.

**Correção Aplicada**:
```typescript
// ✅ Import adicionado
import { sqliteTable, text, integer, unique, index } from 'drizzle-orm/sqlite-core';

// ✅ Index adicionado
}, (table) => ({
  uniqueUserMachine: unique().on(table.userId, table.machineId),
  // NOVO: Index adicional conforme turso-client.ts:405-408
  userMachineIdx: index('idx_conv_summaries_user_machine')
    .on(table.userId, table.machineId)
}));
```

**Descoberta**: `turso-client.ts` cria TANTO a constraint UNIQUE (linha 400) QUANTO um INDEX explícito (linhas 405-408).

**Impacto Evitado**:
- ❌ Migration baseline teria gerado `CREATE INDEX idx_conv_summaries_user_machine`
- ❌ Não seria vazia

---

### ⚠️ AVISOS ADICIONADOS

#### ⚠️ Indexes command_cache e sessions - VALIDAÇÃO PENDENTE

**Status**: ⚠️ REQUER VALIDAÇÃO MANUAL

**Arquivos Afetados**:
- `commandCache.ts:607` - `idx_command_cache_lookup`
- `sessions.ts:634` - `idx_sessions_machine`

**Problema Identificado**:
- Schemas propõem indexes que **NÃO foram encontrados** em `turso-client.ts:314-334`
- Pode ser que:
  1. Indexes foram criados separadamente (não estão no schema hardcoded)
  2. Indexes NÃO existem e schemas estão propostos incorretamente

**Ação Requerida ANTES de Executar**:
```bash
# Verificar se indexes existem no banco real
turso db shell ipcom-chat << 'EOF'
.indexes command_cache
.indexes sessions

-- Ou query detalhada:
SELECT name, tbl_name, sql
FROM sqlite_master
WHERE type='index'
  AND tbl_name IN ('command_cache', 'sessions')
ORDER BY tbl_name, name;
EOF
```

**Cenários e Ações**:

**Cenário A: Indexes EXISTEM no banco**
```bash
# Output esperado:
# idx_command_cache_lookup
# idx_sessions_machine
```
→ ✅ Schemas estão corretos, prossiga normalmente

**Cenário B: Indexes NÃO EXISTEM no banco**
```bash
# Output: (vazio ou apenas indexes automáticos do SQLite)
```
→ ⚠️ **Escolha uma opção**:

**Opção 1 (Recomendada)**: Criar indexes NO BANCO antes do baseline
```sql
-- Executar no Turso ANTES de drizzle-kit generate
CREATE INDEX IF NOT EXISTS idx_command_cache_lookup
  ON command_cache(machine_id, last_executed DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_machine
  ON sessions(machine_id, started_at DESC);
```

**Opção 2**: Remover indexes dos schemas Drizzle
- Editar `commandCache.ts` e `sessions.ts`
- Remover definições de indexes
- Adicionar em migration futura

**Impacto se Ignorado**:
- ❌ Migration baseline conterá `CREATE INDEX` statements
- ❌ Não será vazia
- ❌ Viola princípio da baseline

---

## Documentos Atualizados

### ✅ migrations-REVISED.md

**Mudanças**:
1. ✅ Linha 436: Campo `email` corrigido para `.notNull()`
2. ✅ Linha 646: Import `index` adicionado a conversationSummaries
3. ✅ Linhas 666-668: Index `idx_conv_summaries_user_machine` adicionado
4. ✅ Linhas 121-241: **NOVA SEÇÃO** "ERRATA E CORREÇÕES" com:
   - Detalhamento dos erros corrigidos
   - Avisos sobre indexes pendentes de validação
   - Checklist pré-execução obrigatório
   - Comando de verificação completa do banco

### ✅ baseline-workflow-guide.md

**Mudanças**:
1. ✅ Linhas 5-6: Status atualizado indicando correções aplicadas
2. ✅ Linhas 10-39: **NOVA SEÇÃO** "AVISOS CRÍTICOS - LEIA ANTES DE COMEÇAR":
   - Resumo das correções aplicadas
   - Validação obrigatória de indexes
   - Comandos de verificação

### ✅ CHANGELOG-MIGRATIONS.md (NOVO)

**Criado**: Documento de rastreamento de todas as mudanças no plano de migrations.

---

## Checklist de Validação Pré-Execução

Antes de executar `drizzle-kit pull` ou `drizzle-kit generate`:

- [x] ✅ Campo users.email corrigido para .notNull()
- [x] ✅ Index conversation_summaries adicionado ao schema
- [x] ✅ Seção ERRATA adicionada ao plano principal
- [x] ✅ Avisos críticos adicionados ao guia prático
- [ ] ⚠️ **PENDENTE**: Verificar indexes command_cache no banco real
- [ ] ⚠️ **PENDENTE**: Verificar indexes sessions no banco real
- [ ] ⚠️ **PENDENTE**: Ajustar schemas conforme resultado da verificação

---

## Comandos de Verificação Completa

### Verificar Schema Real de Todas as Tabelas

```bash
turso db shell ipcom-chat << 'EOF'
-- Schema completo de cada tabela
.schema users
.schema machines
.schema history_global
.schema history_user
.schema history_machine
.schema command_cache
.schema sessions
.schema conversation_summaries
EOF
```

### Verificar Todos os Indexes

```bash
turso db shell ipcom-chat << 'EOF'
SELECT
  name,
  tbl_name,
  sql
FROM sqlite_master
WHERE type='index'
  AND name NOT LIKE 'sqlite_%'  -- Exclui indexes internos do SQLite
ORDER BY tbl_name, name;
EOF
```

### Comparar com Schemas Propostos

Após executar os comandos acima, compare manualmente:
1. Tipos de colunas (TEXT, INTEGER, etc.)
2. Constraints (NOT NULL, UNIQUE, PRIMARY KEY)
3. Defaults (valores padrão)
4. Foreign Keys
5. **Indexes** (CRÍTICO - foco da validação pendente)

---

## Histórico de Code Review

### Review Executado

**Data**: 2025-01-17
**Ferramenta**: zen/codereview + Validação manual
**Arquivos Analisados**:
- `src/libs/turso-client.ts:208-417`
- `docs/database/migrations-REVISED.md:422-886`
- `docs/database/baseline-workflow-guide.md`
- `docs/database/tables/*.md`

**Metodologia**:
1. Comparação linha por linha entre schemas propostos e código SQL real
2. Grep de CREATE TABLE, CREATE INDEX, constraints
3. Validação de tipos, nullability, defaults
4. Cross-reference com documentação de tabelas

**Issues Encontrados**:
- 1 CRITICAL (email NOT NULL)
- 2 HIGH (indexes não confirmados)
- 1 MEDIUM (index faltante)

**Issues Corrigidos**: 2/4
**Issues Pendentes de Validação**: 2/4 (command_cache e sessions indexes)

---

## Próximos Passos

1. **Executar validação de indexes** (comandos acima)
2. **Ajustar schemas** conforme resultado
3. **Executar** `drizzle-kit pull` para validação automática
4. **Comparar** schemas gerados pelo pull com schemas manuais
5. **Gerar** migration baseline
6. **Validar** que migration está 100% vazia
7. **Aplicar** baseline com confiança

---

## Referências

- [migrations-REVISED.md](./migrations-REVISED.md) - Plano completo atualizado
- [baseline-workflow-guide.md](./baseline-workflow-guide.md) - Guia prático atualizado
- [turso-client.ts](../../src/libs/turso-client.ts) - Schema SQL real (linhas 208-417)
- [Code Review Report](#) - Relatório detalhado do zen/codereview
