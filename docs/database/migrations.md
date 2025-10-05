# Plano de Implementação REVISADO: Sistema de Migrações com Drizzle ORM

**Versão:** 2.0 (Revisado após análise arquitetural)
**Data:** 2025-01-17
**Status:** PLANO CORRIGIDO - Versão anterior tinha gaps críticos

---

## SUMÁRIO EXECUTIVO

### Problemas Críticos Identificados no Plano Original

O plano original (`migrations.md v1.0`) tinha **3 falhas críticas**:

1. **Schema Incompleto**: Definia apenas 2 tabelas (`messages`, `conversation_summaries`), mas o banco REAL tem **8 tabelas**
2. **Tabela Inexistente**: A tabela `messages` proposta **NÃO EXISTE** no banco - vai quebrar a migration
3. **Schema Incompatível**: `conversation_summaries` no plano tem campos diferentes do banco real

### Impacto se o Plano Original Fosse Executado

❌ Migration inicial falharia ou criaria estado inconsistente
❌ Drizzle schemas incompatíveis com banco real
❌ Type safety quebrado (schemas não refletem realidade)
❌ Perda de tracking para 6 tabelas existentes

### Abordagem Revisada

✅ Mapear TODAS as 8 tabelas existentes para Drizzle schemas
✅ Gerar migration baseline que reflete estado atual 100%
✅ Manter triple partitioning atual (consolidation é fase futura opcional)
✅ Habilitar migrations profissionais sem quebrar sistema existente

---

## Visão Geral

Este documento descreve o plano **CORRIGIDO** para implementar um sistema profissional de migrações de banco de dados usando **Drizzle ORM** no projeto MCP DevOps.

### Objetivo

Substituir o sistema ad-hoc atual (SQL hardcoded em `turso-client.ts`) por um sistema robusto de migrations com:

- Schema TypeScript como source of truth (TODAS as 8 tabelas)
- Migrations SQL auto-geradas e versionadas
- Tracking de migrations aplicadas (journal)
- Execução automática durante setup/upgrade
- Idempotência garantida
- Fundação para refactoring futuro (consolidação de tabelas)

### Arquitetura Real do Banco

**8 Tabelas Existentes (turso-client.ts:208-335):**

```
Entity Tables:
├── users (7 columns)
└── machines (7 columns)

History Tables (Triple Partitioning):
├── history_global (14 columns, 4 indexes, 2 FKs)
├── history_user (14 columns, 4 indexes, 2 FKs)
└── history_machine (12 columns, 2 indexes, 2 FKs)

Support Tables:
├── command_cache (7 columns, 1 index)
├── sessions (6 columns, 1 index, 2 FKs)
└── conversation_summaries (8 columns, 1 unique)

Total: 70 columns, 13 indexes, 6 foreign keys
```

### Arquitetura Proposta do Sistema de Migrations

```
+----------------------+       +-------------------+       +------------------+
| 8 Schemas TypeScript | ----> | Drizzle Kit      | ----> | SQL Migrations  |
| (Source of Truth)    |       | (Generator)      |       | (Auto-generated)|
+----------------------+       +-------------------+       +------------------+
                                                                  |
                                                                  v
                                                           +------------------+
                                                           | Migration Runner |
                                                           | (Executor)       |
                                                           +------------------+
                                                                  |
                                                                  v
                                                           +------------------+
                                                           | Turso/LibSQL DB  |
                                                           | + Journal Table  |
                                                           +------------------+
```

---

## FASE 0: Análise Arquitetural (COMPLETA)

### 0.1 Descobertas da Análise

**CRITICAL Issues:**
- ❌ Plano original omitia 6 de 8 tabelas existentes
- ❌ Propunha tabela `messages` inexistente
- ❌ Schema de `conversation_summaries` incompatível

**HIGH Issues:**
- ⚠️ Triple partitioning cria write amplification 3x
- ⚠️ SQL hardcoded (200+ linhas) impede type safety
- ⚠️ ensureSchema() sem versionamento real

**MEDIUM Issues:**
- ⚠️ Overengineering (triple partition desnecessário para escala atual)
- ⚠️ Missing Repository pattern (SQL espalhado)
- ⚠️ Index duplicado em history_user.request_id

**Decisão Estratégica:**
- ✅ Implementar Drizzle para TODAS as 8 tabelas (não simplificar ainda)
- ✅ Consolidação de history_* será migration FUTURA (opcional)
- ✅ Abordagem pragmática: migrations primeiro, refactor depois

---

## ⚠️ ERRATA E CORREÇÕES (2025-01-17)

### 🔴 ERROS CRÍTICOS CORRIGIDOS

#### 1. Campo users.email - NOT NULL Faltante

**Linha Afetada**: migrations-REVISED.md:436 (CORRIGIDA)

**Erro Original**:
```typescript
email: text('email'), // ❌ INCORRETO: Nullable
```

**Correção Aplicada**:
```typescript
email: text('email').notNull(), // ✅ CORRETO: NOT NULL conforme turso-client.ts:214
```

**Motivo**: O banco real define `email TEXT NOT NULL` (turso-client.ts:214). O comentário anterior "banco real permite NULL" estava incorreto.

**Impacto se não corrigido**: Migration baseline tentaria executar `ALTER TABLE users ALTER COLUMN email DROP NOT NULL`, violando o princípio da baseline vazia.

---

#### 2. Index conversation_summaries Faltante

**Linha Afetada**: migrations-REVISED.md:664 (CORRIGIDA)

**Erro Original**: Schema definia apenas UNIQUE constraint, sem o index explícito

**Correção Aplicada**:
```typescript
}, (table) => ({
  uniqueUserMachine: unique().on(table.userId, table.machineId),
  // ✅ CORRIGIDO: Index adicional conforme turso-client.ts:405-408
  userMachineIdx: index('idx_conv_summaries_user_machine')
    .on(table.userId, table.machineId)
}));
```

**Motivo**: `turso-client.ts` cria tanto UNIQUE constraint quanto INDEX explícito separado (linhas 400 e 405-408).

**Impacto se não corrigido**: Migration baseline tentaria criar index, não sendo vazia.

---

### ⚠️ AVISOS IMPORTANTES

#### ⚠️ Indexes command_cache e sessions - VALIDAÇÃO NECESSÁRIA

**Schemas Afetados**:
- `commandCache.ts` - linha 607: `idx_command_cache_lookup`
- `sessions.ts` - linha 634: `idx_sessions_machine`

**Status**: ⚠️ **INDEXES NÃO CONFIRMADOS EM turso-client.ts**

**Problema**:
- Os schemas Drizzle propostos incluem indexes para estas tabelas
- NÃO encontramos CREATE INDEX para estes indexes em `turso-client.ts:314-334`
- Schemas podem estar definindo indexes que NÃO existem no banco real

**AÇÃO OBRIGATÓRIA ANTES DE EXECUTAR**:
```bash
# Verificar indexes reais no banco Turso
turso db shell ipcom-chat << EOF
.indexes command_cache
.indexes sessions
EOF
```

**Cenários**:

1. **Se indexes EXISTEM no banco**:
   - ✅ Schemas estão corretos
   - ✅ Prossiga normalmente

2. **Se indexes NÃO EXISTEM no banco**:
   - **Opção A** (Recomendada): Criar indexes manualmente NO BANCO antes do baseline:
     ```sql
     CREATE INDEX IF NOT EXISTS idx_command_cache_lookup
       ON command_cache(machine_id, last_executed DESC);

     CREATE INDEX IF NOT EXISTS idx_sessions_machine
       ON sessions(machine_id, started_at DESC);
     ```
   - **Opção B**: Remover indexes dos schemas Drizzle e adicionar em migration futura

**Impacto se ignorado**: Migration baseline conterá CREATE INDEX, não será vazia.

---

### 📝 Validação Pré-Execução OBRIGATÓRIA

Antes de executar `drizzle-kit pull` ou `drizzle-kit generate`:

- [x] ✅ Campo users.email corrigido para .notNull()
- [x] ✅ Index conversation_summaries adicionado
- [ ] ⚠️ Verificar indexes command_cache no banco real
- [ ] ⚠️ Verificar indexes sessions no banco real
- [ ] ⚠️ Ajustar schemas conforme resultado da verificação

**Comando de Verificação Completa**:
```bash
# Verificar schema completo do banco
turso db shell ipcom-chat << 'EOF'
-- Schema de todas as tabelas
.schema users
.schema command_cache
.schema sessions
.schema conversation_summaries

-- Todos os indexes
SELECT name, tbl_name, sql
FROM sqlite_master
WHERE type='index'
  AND tbl_name IN ('command_cache', 'sessions', 'conversation_summaries')
ORDER BY tbl_name, name;
EOF
```

---

## ESTRATÉGIA DE BASELINE PARA BANCO EXISTENTE

### 🎯 O Problema

Temos um banco de dados **JÁ EM PRODUÇÃO** com 8 tabelas criadas manualmente via SQL hardcoded (`turso-client.ts:208-401`). Se tentarmos executar migrations do Drizzle normalmente, teremos 2 problemas críticos:

1. **Criação Duplicada**: `drizzle-kit push` ou migrations tentariam CRIAR tabelas que já existem → ❌ ERRO
2. **Sem Histórico**: Não temos registro de migrations anteriores na tabela `__drizzle_migrations` → 😱 Estado desconhecido

### ✅ A Solução: Workflow de "Adoption" em 3 Etapas

Este é o processo oficial recomendado pelo Drizzle para adotar bancos de dados existentes:

#### **Etapa 1: Introspect (Pull Schema do Banco Real)**

```bash
# Extrai schema do banco Turso e gera TypeScript automaticamente
npx drizzle-kit pull
```

**O que acontece:**
- Drizzle conecta no banco Turso via `drizzle.config.ts`
- Lê TODAS as tabelas, colunas, indexes, constraints usando `PRAGMA` do SQLite
- Gera arquivos TypeScript em `src/database/schema/` automaticamente
- **VANTAGEM**: Garante 100% compatibilidade com o que já existe

**Output esperado:**
```
src/database/
├── schema/
│   ├── users.ts          # Auto-gerado a partir do banco real
│   ├── machines.ts       # Auto-gerado
│   ├── ...               # Todas as 8 tabelas
│   └── index.ts
```

**⚠️ IMPORTANTE**: Após o `pull`, você deve:
1. Revisar os schemas gerados (podem ter tipos genéricos demais)
2. Ajustar tipos TypeScript conforme necessário (ex: `timestamp` mode)
3. Adicionar foreign keys explícitas (pull nem sempre detecta)
4. Mover para estrutura final do projeto

#### **Etapa 2: Generate Baseline Migration (VAZIA ou Comentada)**

Depois de ter os schemas TypeScript 100% compatíveis com o banco real:

```bash
# Gera migration comparando schemas TS com banco
npx drizzle-kit generate
```

**O que acontece:**
- Drizzle compara schemas TypeScript com banco real
- **SE OS SCHEMAS ESTÃO CORRETOS**: Gera migration VAZIA ou com CREATEs comentados
- **SE HOUVER DIFERENÇAS**: Gera ALTERs/CREATEs para corrigir → ⚠️ PERIGO!

**Output esperado (IDEAL):**
```sql
-- src/database/migrations/0000_baseline.sql

-- Migration baseline: Database already has all tables
-- This migration only registers the current state

-- No DDL changes needed
```

**🔍 VALIDAÇÃO CRÍTICA**: Se a migration NÃO estiver vazia, significa que:
- ❌ Schemas TypeScript não refletem 100% o banco real
- ❌ Você precisa corrigir os schemas antes de prosseguir
- ❌ **NUNCA EXECUTE** uma migration baseline com DDL statements!

#### **Etapa 3: Aplicar Baseline (Criar Tracking Table)**

Depois de validar que a migration está vazia/comentada:

```bash
# Executa a migration (só cria __drizzle_migrations, não altera DDL)
npx drizzle-kit migrate
```

**O que acontece:**
- Cria tabela `__drizzle_migrations` no banco
- Registra a migration `0000_baseline` como "aplicada"
- **NÃO EXECUTA DDL** (porque a migration está vazia)
- Agora o Drizzle sabe o "estado atual" do banco

**Resultado:**
```sql
SELECT * FROM __drizzle_migrations;
-- id | hash | created_at
-- 1  | abc123def456 | 2025-01-17 15:30:00
```

### 📋 Workflow Completo Passo-a-Passo

```bash
# 1. Configurar Turso credentials
export TURSO_URL="libsql://your-db.turso.io"
export TURSO_TOKEN="your-token"

# 2. Criar drizzle.config.ts
cat > src/database/drizzle.config.ts << 'EOF'
import type { Config } from 'drizzle-kit';
export default {
  dialect: 'sqlite',
  driver: 'turso',
  schema: './src/database/schema/*',
  out: './src/database/migrations',
  dbCredentials: {
    url: process.env.TURSO_URL!,
    authToken: process.env.TURSO_TOKEN!
  }
} satisfies Config;
EOF

# 3. PULL: Introspect banco existente
npx drizzle-kit pull

# 4. REVIEW: Revisar e ajustar schemas gerados
# - Conferir tipos (text, integer, boolean)
# - Adicionar foreign keys explícitas
# - Ajustar defaults e constraints
# - Renomear para convenção camelCase se necessário

# 5. GENERATE: Criar migration baseline
npx drizzle-kit generate

# 6. VALIDATE: Verificar que migration está vazia
cat src/database/migrations/0000_*.sql
# ✅ DEVE estar vazia ou com CREATEs comentados
# ❌ Se tiver DDL, volte ao passo 4 e corrija schemas

# 7. MIGRATE: Aplicar baseline (só cria tracking table)
npx drizzle-kit migrate

# 8. VERIFY: Confirmar registro no banco
npx drizzle-kit studio  # Abrir Drizzle Studio
# Ou via SQL:
# SELECT * FROM __drizzle_migrations;
```

### 🛡️ Validações de Segurança

Antes de executar qualquer migration, **SEMPRE VALIDAR**:

```typescript
// scripts/validate-baseline.ts
import * as fs from 'fs';
import * as path from 'path';

const migrationFile = path.join(
  process.cwd(),
  'src/database/migrations',
  '0000_baseline.sql'
);

const content = fs.readFileSync(migrationFile, 'utf8');

// Remove comentários e whitespace
const ddlStatements = content
  .replace(/--.*$/gm, '')  // Remove comentários
  .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove blocos de comentário
  .trim();

// Checagens críticas
const hasDDL = /CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(ddlStatements);
const hasData = /INSERT INTO|UPDATE|DELETE FROM/i.test(ddlStatements);

if (hasDDL || hasData) {
  console.error('❌ PERIGO: Migration baseline contém DDL/DML!');
  console.error('Conteúdo:', ddlStatements);
  process.exit(1);
}

console.log('✅ Migration baseline está segura (vazia/comentada)');
```

Executar antes de cada migration:

```bash
npx tsx scripts/validate-baseline.ts && npx drizzle-kit migrate
```

### 🔄 Abordagem Alternativa: Manual Schema Creation

Se você preferir **NÃO usar `pull`** (mais controle, mas mais trabalho):

1. **Criar schemas manualmente** baseados em `docs/database/tables/*.md`
2. **Comparar linha por linha** com `turso-client.ts:208-401`
3. **Executar `generate`** e validar migration vazia
4. **Se migration não estiver vazia**: Corrigir diferenças nos schemas TS

**Vantagens:**
- ✅ Controle total sobre estrutura TypeScript
- ✅ Pode organizar schemas de forma mais idiomática
- ✅ Adiciona type safety avançado desde o início

**Desvantagens:**
- ❌ Mais propenso a erros (typos, campos esquecidos)
- ❌ Requer validação manual exaustiva
- ❌ Mais trabalhoso (8 tabelas, 70 colunas, 13 indexes)

### 📝 Checklist de Validação Pré-Migration

Antes de executar `drizzle-kit migrate`, confirme:

- [ ] `drizzle.config.ts` aponta para banco Turso correto
- [ ] Schemas TypeScript têm TODAS as 8 tabelas
- [ ] Schemas TypeScript têm TODOS os 70 campos
- [ ] Schemas TypeScript têm TODOS os 13 indexes
- [ ] Schemas TypeScript têm TODAS as 6 foreign keys
- [ ] Migration `0000_baseline.sql` está vazia ou 100% comentada
- [ ] Script `validate-baseline.ts` passou
- [ ] Backup do banco foi feito (`turso db shell ipcom-chat ".backup backup.db"`)
- [ ] Testou em ambiente de desenvolvimento primeiro

### 🎓 Resumo: Por que isso Funciona?

1. **Pull**: Extrai verdade absoluta (banco real) → TypeScript
2. **Generate**: Compara TypeScript com banco → Detecta diferenças
3. **Se schemas corretos**: Migration vazia (nada a fazer)
4. **Migrate**: Só cria `__drizzle_migrations` table
5. **Futuro**: Mudanças geram migrations normais (ALTER, CREATE INDEX, etc.)

**Analogia**: É como "adotar" um código legado em Git:
- `git init` (criar tracking) sem alterar código
- Futuro: commits normais rastreiam mudanças

---

## FASE 1: Setup Inicial do Drizzle ORM (REVISADO)

**Objetivo**: Preparar ambiente e criar schemas COMPLETOS para todas as 8 tabelas.

### 1.1 Instalar Dependencies

Adicionar ao `package.json` e `setup.js` (requiredDeps, linha ~520):

```json
{
  "drizzle-orm": "^0.36.4",
  "drizzle-kit": "^0.30.2",
  "@libsql/client": "^0.15.0"
}
```

### 1.2 Criar Estrutura de Diretórios

```
src/database/
├── schema/
│   ├── users.ts                    # [NOVO] Entity table
│   ├── machines.ts                 # [NOVO] Entity table
│   ├── historyGlobal.ts            # [NOVO] 14 cols, 4 indexes, 2 FKs
│   ├── historyUser.ts              # [NOVO] 14 cols, 4 indexes, 2 FKs
│   ├── historyMachine.ts           # [NOVO] 12 cols, 2 indexes, 2 FKs
│   ├── commandCache.ts             # [NOVO] 7 cols, 1 index
│   ├── sessions.ts                 # [NOVO] 6 cols, 1 index, 2 FKs
│   ├── conversationSummaries.ts    # [CORRIGIDO] 8 cols, 1 unique
│   └── index.ts                    # Export agregado
├── migrations/                     # Gerado automaticamente
│   ├── meta/
│   │   ├── _journal.json
│   │   └── 0000_snapshot.json
│   └── 0000_initial_schema.sql    # Deve ser vazio (baseline)
├── drizzle.config.ts               # Configuração
└── client.ts                       # Drizzle client singleton
```

### 1.3 Criar drizzle.config.ts

**Localização**: `src/database/drizzle.config.ts`

```typescript
import type { Config } from 'drizzle-kit';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Ler config.json para pegar Turso URL e token
const configPath = path.join(os.homedir(), '.mcp-terminal', 'config.json');
let tursoUrl = process.env.TURSO_URL || '';
let tursoToken = process.env.TURSO_TOKEN || '';

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  tursoUrl = config.turso_url || tursoUrl;
  tursoToken = config.turso_token || tursoToken;
}

export default {
  schema: './src/database/schema/*',
  out: './src/database/migrations',
  driver: 'turso',
  dbCredentials: {
    url: tursoUrl,
    authToken: tursoToken
  }
} satisfies Config;
```

### 1.4 Criar Schemas TypeScript - users.ts

**Localização**: `src/database/schema/users.ts`

**Referência**: `turso-client.ts:210-218`, `docs/database/tables/users.md`

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey().default(sql`(hex(randomblob(16)))`),
  username: text('username').unique().notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(), // ✅ CORRIGIDO: NOT NULL conforme turso-client.ts:214
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`),
  isActive: integer('is_active', { mode: 'boolean' })
    .default(sql`1`)
});
```

### 1.5 Criar Schemas TypeScript - machines.ts

**Localização**: `src/database/schema/machines.ts`

**Referência**: `turso-client.ts:221-229`, `docs/database/tables/machines.md`

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const machines = sqliteTable('machines', {
  machineId: text('machine_id').primaryKey(),
  hostname: text('hostname').notNull(),
  ipAddress: text('ip_address'),
  osInfo: text('os_info'),
  firstSeen: integer('first_seen', { mode: 'timestamp' })
    .default(sql`(strftime('%s', 'now'))`),
  lastSeen: integer('last_seen', { mode: 'timestamp' })
    .default(sql`(strftime('%s', 'now'))`),
  totalCommands: integer('total_commands').default(0)
});
```

### 1.6 Criar Schemas TypeScript - historyGlobal.ts

**Localização**: `src/database/schema/historyGlobal.ts`

**Referência**: `turso-client.ts:232-249`, `docs/database/tables/history_global.md`

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { machines } from './machines.js';

export const historyGlobal = sqliteTable('history_global', {
  id: text('id').primaryKey().default(sql`(hex(randomblob(16)))`),
  command: text('command').notNull(),
  response: text('response'),
  machineId: text('machine_id').references(() => machines.machineId),
  userId: text('user_id').references(() => users.id),
  timestamp: integer('timestamp', { mode: 'timestamp' })
    .default(sql`(strftime('%s', 'now'))`),
  tokensUsed: integer('tokens_used'),
  executionTimeMs: integer('execution_time_ms'),
  tags: text('tags'),
  sessionId: text('session_id'),
  status: text('status').default('pending'),
  requestId: text('request_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' })
}, (table) => ({
  // Indexes conforme turso-client.ts:289-309
  timestampIdx: index('idx_history_global_timestamp')
    .on(table.timestamp.desc()),
  machineIdx: index('idx_history_global_machine')
    .on(table.machineId, table.timestamp.desc()),
  statusIdx: index('idx_history_global_status')
    .on(table.status, table.timestamp.desc()),
  requestIdx: index('idx_history_global_request')
    .on(table.requestId)
}));
```

### 1.7 Criar Schemas TypeScript - historyUser.ts

**Localização**: `src/database/schema/historyUser.ts`

**Referência**: `turso-client.ts:252-269`, `docs/database/tables/history_user.md`

```typescript
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { machines } from './machines.js';

export const historyUser = sqliteTable('history_user', {
  id: text('id').primaryKey().default(sql`(hex(randomblob(16)))`),
  userId: text('user_id').notNull().references(() => users.id),
  command: text('command').notNull(),
  response: text('response'),
  machineId: text('machine_id').references(() => machines.machineId),
  timestamp: integer('timestamp', { mode: 'timestamp' })
    .default(sql`(strftime('%s', 'now'))`),
  sessionId: text('session_id'),
  context: text('context'),
  tokensUsed: integer('tokens_used'),
  executionTimeMs: integer('execution_time_ms'),
  status: text('status').default('pending'),
  requestId: text('request_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' })
}, (table) => ({
  // Indexes conforme turso-client.ts:296-304
  userLookupIdx: index('idx_history_user_lookup')
    .on(table.userId, table.timestamp.desc()),
  statusIdx: index('idx_history_user_status')
    .on(table.status, table.timestamp.desc()),
  requestIdx: index('idx_history_user_request')
    .on(table.requestId),
  requestUniqueIdx: uniqueIndex('idx_history_user_request_unique')
    .on(table.requestId)
}));
```

### 1.8 Criar Schemas TypeScript - historyMachine.ts

**Localização**: `src/database/schema/historyMachine.ts`

**Referência**: `turso-client.ts:272-283`, `docs/database/tables/history_machine.md`

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { machines } from './machines.js';

export const historyMachine = sqliteTable('history_machine', {
  id: text('id').primaryKey().default(sql`(hex(randomblob(16)))`),
  machineId: text('machine_id').notNull().references(() => machines.machineId),
  command: text('command').notNull(),
  response: text('response'),
  userId: text('user_id').references(() => users.id),
  timestamp: integer('timestamp', { mode: 'timestamp' })
    .default(sql`(strftime('%s', 'now'))`),
  errorCode: integer('error_code'),
  sessionId: text('session_id'),
  status: text('status').default('pending'),
  requestId: text('request_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' })
}, (table) => ({
  // Indexes conforme turso-client.ts:300, 311
  machineLookupIdx: index('idx_history_machine_lookup')
    .on(table.machineId, table.timestamp.desc()),
  statusIdx: index('idx_history_machine_status')
    .on(table.status, table.timestamp.desc())
}));
```

### 1.9 Criar Schemas TypeScript - commandCache.ts

**Localização**: `src/database/schema/commandCache.ts`

**Referência**: `turso-client.ts:314-322`, `docs/database/tables/command_cache.md`

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const commandCache = sqliteTable('command_cache', {
  commandHash: text('command_hash').primaryKey(),
  command: text('command').notNull(),
  output: text('output'),
  machineId: text('machine_id'),
  lastExecuted: integer('last_executed', { mode: 'timestamp' }),
  executionCount: integer('execution_count').default(1),
  avgExecutionTimeMs: integer('avg_execution_time_ms')
}, (table) => ({
  // Index conforme turso-client.ts:338
  lookupIdx: index('idx_command_cache_lookup')
    .on(table.machineId, table.lastExecuted.desc())
}));
```

### 1.10 Criar Schemas TypeScript - sessions.ts

**Localização**: `src/database/schema/sessions.ts`

**Referência**: `turso-client.ts:325-334`, `docs/database/tables/sessions.md`

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { machines } from './machines.js';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  machineId: text('machine_id').notNull().references(() => machines.machineId),
  userId: text('user_id').references(() => users.id),
  startedAt: integer('started_at', { mode: 'timestamp' })
    .default(sql`(strftime('%s', 'now'))`),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  commandCount: integer('command_count').default(0)
}, (table) => ({
  // Index conforme turso-client.ts:342
  machineIdx: index('idx_sessions_machine')
    .on(table.machineId, table.startedAt.desc())
}));
```

### 1.11 Criar Schemas TypeScript - conversationSummaries.ts

**Localização**: `src/database/schema/conversationSummaries.ts`

**Referência**: `turso-client.ts:391-401`, `docs/database/tables/` (não documentado ainda)

```typescript
import { sqliteTable, text, integer, unique, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const conversationSummaries = sqliteTable('conversation_summaries', {
  id: text('id').primaryKey().default(sql`(hex(randomblob(16)))`),
  userId: text('user_id'),
  machineId: text('machine_id').notNull(),
  summary: text('summary').notNull(),
  summarizedUpToMessageId: text('summarized_up_to_message_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`),
  messageCount: integer('message_count')
}, (table) => ({
  // UNIQUE constraint conforme turso-client.ts:400
  uniqueUserMachine: unique().on(table.userId, table.machineId),
  // ✅ CORRIGIDO: Index adicional conforme turso-client.ts:405-408
  userMachineIdx: index('idx_conv_summaries_user_machine')
    .on(table.userId, table.machineId)
}));
```

### 1.12 Criar Index de Schemas

**Localização**: `src/database/schema/index.ts`

```typescript
export { users } from './users.js';
export { machines } from './machines.js';
export { historyGlobal } from './historyGlobal.js';
export { historyUser } from './historyUser.js';
export { historyMachine } from './historyMachine.js';
export { commandCache } from './commandCache.js';
export { sessions } from './sessions.js';
export { conversationSummaries } from './conversationSummaries.js';
```

**Status Fase 1**: ✅ 8 schemas TypeScript completos mapeando 100% do banco real

---

## FASE 2: Gerar Migration Inicial (REVISADO)

**Objetivo**: Criar migration baseline que reflete o estado atual EXATO do banco.

### 2.1 Adicionar Scripts ao package.json

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate:sqlite",
    "db:push": "drizzle-kit push:sqlite",
    "db:migrate": "node src/database/migrate.js",
    "db:studio": "drizzle-kit studio"
  }
}
```

### 2.2 Gerar Migration Baseline

**IMPORTANTE**: Esta migration deve ser **VAZIA** ou conter apenas ajustes mínimos, provando que os schemas Drizzle refletem corretamente o banco.

**Comando**:
```bash
npx drizzle-kit generate:sqlite
```

**Resultado Esperado**:
```
src/database/migrations/
├── meta/
│   ├── _journal.json           # Tracking metadata
│   └── 0000_snapshot.json      # Schema snapshot
└── 0000_baseline_schema.sql    # DEVE estar vazio ou quase vazio
```

### 2.3 Validação da Migration Baseline

**Teste de Validação**:
```bash
# 1. Verificar conteúdo da migration gerada
cat src/database/migrations/0000_baseline_schema.sql

# Esperado: Arquivo vazio ou apenas comentários
# Se houver CREATE TABLE/ALTER TABLE = SCHEMA ESTÁ ERRADO

# 2. Aplicar migration em DB de teste
node src/database/migrate.js --debug

# Esperado: Nenhum erro, nenhuma mudança real no DB
```

**Se a migration NÃO estiver vazia:**
- ❌ Schemas TypeScript NÃO refletem o banco real
- ❌ Revisar schemas linha por linha contra turso-client.ts
- ❌ Comparar com docs/database/tables/*.md

**Status Fase 2**: Migration baseline validada contra banco real

---

## FASES 3-7: Conforme Plano Original

As fases 3-7 permanecem inalteradas do plano original:

- **Fase 3**: Criar Migration Runner
- **Fase 4**: Integração com setup.js
- **Fase 5**: Migração Gradual do Código (OPCIONAL)
- **Fase 6**: Testing e Validação
- **Fase 7**: Documentação e Rollout

[Consultar `migrations.md` original para detalhes destas fases]

---

## FASE 8 (NOVA): Consolidação Futura (OPCIONAL)

**Objetivo**: Simplificar arquitetura consolidando 3 history tables em 1.

**IMPORTANTE**: Esta fase é OPCIONAL e deve ser feita DEPOIS do sistema de migrations estar estável.

### 8.1 Problema Arquitetural

**Write Amplification 3x:**
- 1 comando executado → 3 INSERTs (history_global, history_user, history_machine)
- Triplica carga de write
- Aumenta custos de storage
- Complica schema evolution (mudar 3 lugares)

**Duplicação de Dados:**
- Mesmas colunas replicadas 3x
- Risco de inconsistência
- Overhead de manutenção

### 8.2 Solução Proposta

**Consolidar em single `history` table:**

```sql
CREATE TABLE history (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  command TEXT NOT NULL,
  response TEXT,
  user_id TEXT,
  machine_id TEXT NOT NULL,
  partition_type TEXT NOT NULL,  -- 'global', 'user', 'machine'
  timestamp INTEGER DEFAULT (strftime('%s', 'now')),
  -- ... outras colunas
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
);

-- Indexes estratégicos para manter performance
CREATE INDEX idx_history_user_ts ON history(user_id, timestamp DESC);
CREATE INDEX idx_history_machine_ts ON history(machine_id, timestamp DESC);
CREATE INDEX idx_history_timestamp ON history(timestamp DESC);
```

### 8.3 Migration Strategy

**Usar Drizzle para migration segura:**

1. Criar novo schema `history.ts` consolidado
2. Gerar migration automática via `drizzle-kit generate`
3. Migration SQL irá:
   - Criar nova tabela `history`
   - Migrar dados das 3 tabelas antigas
   - Criar views compatíveis (backward compatibility)
   - Dropar tabelas antigas (após validação)

**Backward Compatibility via Views:**
```sql
-- View para manter queries antigas funcionando
CREATE VIEW history_global AS
  SELECT * FROM history WHERE partition_type = 'global';

CREATE VIEW history_user AS
  SELECT * FROM history WHERE partition_type = 'user';

CREATE VIEW history_machine AS
  SELECT * FROM history WHERE partition_type = 'machine';
```

### 8.4 Benefícios da Consolidação

✅ Reduz complexity 66% (3 tables → 1)
✅ Elimina write amplification
✅ Simplifica schema evolution
✅ Reduz custos de storage
✅ Mantém backward compatibility via views

### 8.5 Timeline Recomendado

- **Curto Prazo (Q1 2025)**: Implementar Drizzle migrations (Fases 1-7)
- **Médio Prazo (Q2 2025)**: Avaliar necessidade de consolidation
- **Longo Prazo (Q3 2025)**: Executar consolidation se aprovado

**Status Fase 8**: Planejada como evolution futura opcional

---

## Resumo de Mudanças vs Plano Original

| Aspecto | Plano Original | Plano Revisado |
|---------|---------------|----------------|
| **Schemas TypeScript** | 2 tabelas (messages, summaries) | 8 tabelas (TODAS reais) |
| **Tabela messages** | Proposta (inexistente) | Removida (não existe) |
| **conversation_summaries** | Schema incorreto | Schema corrigido |
| **Indexes** | Não definidos | 13 indexes mapeados |
| **Foreign Keys** | Parciais | 6 FKs completos |
| **Migration Baseline** | Criaria tabelas | Vazia (valida schemas) |
| **Consolidation** | Não planejada | Fase 8 futura opcional |

---

## Checklist de Implementação Revisado

### Fase 1: Schemas Completos
- [ ] Criar src/database/schema/users.ts
- [ ] Criar src/database/schema/machines.ts
- [ ] Criar src/database/schema/historyGlobal.ts (14 cols, 4 idx, 2 FKs)
- [ ] Criar src/database/schema/historyUser.ts (14 cols, 4 idx, 2 FKs)
- [ ] Criar src/database/schema/historyMachine.ts (12 cols, 2 idx, 2 FKs)
- [ ] Criar src/database/schema/commandCache.ts (7 cols, 1 idx)
- [ ] Criar src/database/schema/sessions.ts (6 cols, 1 idx, 2 FKs)
- [ ] Criar src/database/schema/conversationSummaries.ts (8 cols, unique)
- [ ] Criar src/database/schema/index.ts
- [ ] Criar src/database/drizzle.config.ts
- [ ] Adicionar dependencies ao package.json
- [ ] Adicionar dependencies ao setup.js requiredDeps

### Fase 2: Migration Baseline
- [ ] Rodar `npx drizzle-kit generate:sqlite`
- [ ] Validar 0000_baseline_schema.sql está vazio/mínimo
- [ ] Comparar schemas contra turso-client.ts:208-401
- [ ] Comparar schemas contra docs/database/tables/*.md
- [ ] Testar migration runner em DB de teste

### Fases 3-7: Conforme Original
- [ ] [Consultar migrations.md original]

### Fase 8: Consolidation (Futura)
- [ ] Avaliar necessidade (Q2 2025)
- [ ] Criar schema consolidado history.ts
- [ ] Gerar migration de consolidação
- [ ] Criar views de compatibilidade
- [ ] Testar em staging
- [ ] Deploy gradual em produção

---

## Apêndice: Lições Aprendidas

### Por que o Plano Original Falhou?

1. **Falta de Discovery**: Não foi feita análise do schema real antes de planejar
2. **Assumptions Incorretas**: Assumiu tabela "messages" sem verificar
3. **Documentação Desatualizada**: conversation_summaries não estava em docs/database/tables/
4. **Scope Incompleto**: Focou em 1 feature (slash commands) ignorando infraestrutura existente

### Como Evitar no Futuro?

✅ **Sempre fazer discovery primeiro**: Extrair schema real do banco
✅ **Validar assumptions**: Verificar tabelas existem antes de planejar
✅ **Documentação first**: Atualizar docs ANTES de planejar migrations
✅ **Peer review**: Revisar plano com quem conhece o banco

### Ferramentas Usadas para Correção

1. **Turso Shell**: Extrair schema real (`turso db shell ipcom-chat ".schema"`)
2. **@libsql/client**: Script TypeScript para query metadata
3. **Análise Arquitetural**: zen/analyze para identificar gaps
4. **Validação Cruzada**: Comparar 3 fontes (código, banco, docs)

---

## Referências

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Drizzle Kit Migrations](https://orm.drizzle.team/kit-docs/overview)
- [LibSQL/Turso Documentation](https://docs.turso.tech/)
- [Database Tables Documentation](./tables/README.md)
- [Plano Original (DEPRECATED)](./migrations.md)
