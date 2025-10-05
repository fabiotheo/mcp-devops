# Database Documentation

**Projeto:** MCP Terminal Assistant - DevOps
**Última Atualização:** 2025-01-17

---

## 📚 Índice da Documentação

Esta pasta contém toda a documentação relacionada ao banco de dados Turso/LibSQL do projeto.

### 📖 Documentos Principais

| Documento | Descrição | Status | Use Quando |
|-----------|-----------|--------|------------|
| [**INSTALLATION-FLOW.md**](./INSTALLATION-FLOW.md) | Fluxo completo de como migrations são executadas durante instalação | ✅ Operacional | **COMEÇAR AQUI - Entender o fluxo** |
| [**migrations.md**](./migrations.md) | Plano completo de implementação Drizzle ORM (v2.0 - REVISADO E CORRIGIDO) | ✅ Atualizado | Planejar implementação completa |
| [**baseline-workflow-guide.md**](./baseline-workflow-guide.md) | Guia prático passo-a-passo para criar baseline migration | ✅ Operacional | Executar a migração para Drizzle |
| [**tables/README.md**](./tables/README.md) | Overview de todas as tabelas com ER diagram | ✅ Completo | Entender arquitetura atual |
| [**CHANGELOG-MIGRATIONS.md**](./CHANGELOG-MIGRATIONS.md) | Histórico de mudanças e correções aplicadas | ✅ Atualizado | Rastrear revisões do plano |

### 🗂️ Documentação de Tabelas

Documentação detalhada de cada tabela do banco:

```
tables/
├── README.md                     # Overview geral + ER diagram
├── users.md                      # Tabela de usuários (7 colunas)
├── machines.md                   # Tabela de máquinas (7 colunas)
├── history_global.md             # Histórico global (14 colunas, 4 indexes)
├── history_user.md               # Histórico por usuário (14 colunas, 4 indexes)
├── history_machine.md            # Histórico por máquina (12 colunas, 2 indexes)
├── command_cache.md              # Cache de comandos (7 colunas, 1 index)
└── sessions.md                   # Sessões de usuários (6 colunas, 1 index)
```

---

## 🎯 Quick Start: Qual Documento Ler?

### Se você quer...

#### 1. **Entender a arquitetura atual do banco**
→ Leia: [`tables/README.md`](./tables/README.md)
- ER diagram visual
- Relacionamentos entre tabelas
- Padrões de queries comuns

#### 2. **Implementar Drizzle ORM no projeto**
→ Leia nesta ordem:
1. [`migrations-REVISED.md`](./migrations-REVISED.md) - Entenda o plano completo
2. [`baseline-workflow-guide.md`](./baseline-workflow-guide.md) - Execute passo-a-passo

#### 3. **Trabalhar com uma tabela específica**
→ Leia: `tables/<nome-da-tabela>.md`
- Schema completo (CREATE TABLE)
- Todos os indexes
- Foreign keys
- Queries de exemplo
- Casos de uso

#### 4. **Adicionar nova migration no futuro**
→ Leia: [`migrations-REVISED.md`](./migrations-REVISED.md) Fase 2-7
- Como gerar migrations
- Como validar antes de aplicar
- Como executar em produção

---

## 🏗️ Arquitetura do Banco de Dados

### Resumo Executivo

**Total de Tabelas:** 8
**Total de Colunas:** 70
**Total de Indexes:** 13
**Total de Foreign Keys:** 6

### Categorias de Tabelas

```
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE: ipcom-chat                     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  ┌─────▼─────┐      ┌────────▼────────┐    ┌──────▼──────┐
  │  ENTITIES │      │ HISTORY TABLES  │    │   SUPPORT   │
  └───────────┘      │  (Partitioned)  │    └─────────────┘
        │            └─────────────────┘           │
   ┌────┴────┐              │               ┌──────┴──────┐
   │         │         ┌────┼────┐          │             │
 users   machines      │    │    │      sessions    command_cache
  (7)       (7)        │    │    │        (6)            (7)
                       │    │    │
              history_ │    │    │ _user
               global  │    │    │  (14)
                (14)   │    │
                       │    └──> history_machine
                       │              (12)
                       │
           conversation_summaries
                    (8)

Legenda: (n) = número de colunas
```

### Padrão de Particionamento Triplo (History Tables)

O sistema usa **3 tabelas de histórico** para diferentes padrões de query:

| Tabela | Partição | Uso Principal | Queries Otimizadas |
|--------|----------|---------------|-------------------|
| `history_global` | Nenhuma | Analytics, visão geral | Cross-user/machine |
| `history_user` | `user_id` | Histórico pessoal do usuário | User-specific |
| `history_machine` | `machine_id` | Diagnósticos de máquina | Machine-specific |

**Trade-off:**
- ✅ Queries ultra-rápidas em cada partição
- ⚠️ Write amplification 3x (cada comando grava em 3 tabelas)

**Nota:** Fase 8 opcional do plano de migrations prevê consolidação futura.

---

## 🔄 Status da Migração Drizzle

### Estado Atual (Janeiro 2025)

- ❌ **Drizzle ORM**: Não implementado
- ✅ **Schema Atual**: SQL hardcoded em `src/libs/turso-client.ts:208-401`
- ✅ **Documentação**: Completa e atualizada
- ✅ **Plano de Migração**: Revisado e validado

### Próximos Passos

1. **Fase 1**: Setup inicial Drizzle + Criação de schemas TypeScript
2. **Fase 2**: Gerar baseline migration
3. **Fase 3**: Implementar migration runner
4. **Fase 4**: Integrar com setup.js
5. **Fase 5-7**: Migrar código para usar Drizzle schemas
6. **Fase 8** (opcional): Consolidar history tables

**Timeline Estimado:** Q1 2025

---

## 📊 Estatísticas do Banco

### Por Tabela

| Tabela | Colunas | Indexes | FKs | Estimativa de Rows | Write Frequency |
|--------|---------|---------|-----|-------------------|-----------------|
| `users` | 7 | 1 (unique) | 0 | 10-1K | Low (10s/dia) |
| `machines` | 7 | 0 | 0 | 1-100 | Low (10s/dia) |
| `history_global` | 14 | 4 | 2 | 10K-1M | High (1000s/dia) |
| `history_user` | 14 | 4 | 2 | 10K-1M | High (1000s/dia) |
| `history_machine` | 12 | 2 | 2 | 10K-1M | High (1000s/dia) |
| `command_cache` | 7 | 1 | 0 | 100-10K | Medium (100s/dia) |
| `sessions` | 6 | 1 | 2 | 100-10K | Medium (100s/dia) |
| `conversation_summaries` | 8 | 1 (unique) | 0 | 100-10K | Low (10s/dia) |

### Performance Considerations

**Hot Queries** (executadas frequentemente):
- Recent history (último 24h)
- User-specific history
- Active sessions

**Indexes Críticos:**
- `idx_history_global_timestamp` (DESC) - Queries recentes
- `idx_history_user_lookup` (user_id, timestamp DESC) - História do usuário
- `idx_history_machine_lookup` (machine_id, timestamp DESC) - História da máquina

---

## 🔍 Queries Comuns

### 1. Histórico Recente Global

```sql
SELECT command, response, datetime(timestamp, 'unixepoch') as date
FROM history_global
ORDER BY timestamp DESC
LIMIT 50;
```

**Index usado:** `idx_history_global_timestamp`

### 2. Histórico de um Usuário

```sql
SELECT command, response, datetime(timestamp, 'unixepoch') as date
FROM history_user
WHERE user_id = ?
ORDER BY timestamp DESC
LIMIT 50;
```

**Index usado:** `idx_history_user_lookup`

### 3. Encontrar Requests Pendentes

```sql
SELECT request_id, command, timestamp
FROM history_global
WHERE status = 'pending'
ORDER BY timestamp ASC;
```

**Index usado:** `idx_history_global_status`

### 4. Verificar Cache de Comando

```sql
SELECT output FROM command_cache
WHERE command_hash = ?
  AND machine_id = ?
  AND last_executed > unixepoch() - 3600;  -- TTL 1 hora
```

**Index usado:** `idx_command_cache_lookup`

---

## 🛠️ Manutenção

### Cleanup Periódico Recomendado

```sql
-- 1. Limpar histórico antigo (90+ dias)
DELETE FROM history_global
WHERE status = 'completed' AND timestamp < unixepoch() - 7776000;

DELETE FROM history_user
WHERE status = 'completed' AND timestamp < unixepoch() - 7776000;

DELETE FROM history_machine
WHERE status = 'completed' AND timestamp < unixepoch() - 7776000;

-- 2. Limpar cache expirado (24+ horas)
DELETE FROM command_cache
WHERE last_executed < unixepoch() - 86400;

-- 3. Fechar sessões inativas (1+ hora)
UPDATE sessions
SET ended_at = unixepoch()
WHERE ended_at IS NULL AND started_at < unixepoch() - 3600;

-- 4. Limpar summaries antigos (30+ dias)
DELETE FROM conversation_summaries
WHERE created_at < unixepoch() - 2592000;
```

**Recomendação:** Executar semanalmente via cron job.

---

## 📖 Convenções e Padrões

### Naming Conventions

- **Tabelas**: `snake_case` (ex: `history_global`)
- **Colunas**: `snake_case` (ex: `user_id`, `created_at`)
- **Indexes**: `idx_<table>_<columns>` (ex: `idx_users_username`)
- **Foreign Keys**: Não nomeadas explicitamente (SQLite padrão)

### Tipos de Dados

- **IDs**: `TEXT` com `hex(randomblob(16))` (32 chars hex)
- **Timestamps**: `INTEGER` (Unix epoch seconds)
- **Booleans**: `INTEGER` (0/1) com `mode: 'boolean'` no Drizzle
- **JSON**: `TEXT` (parse em application layer)

### Padrão Async Processing

Todas as history tables usam:

```
INSERT → status='pending', request_id=UUID
  ↓
AI Processing
  ↓
UPDATE → status='completed', response='...', completed_at=now()
```

---

## 🚨 Avisos Importantes

### ⚠️ NUNCA Execute Diretamente

```sql
-- ❌ PERIGO: Vai quebrar foreign keys
DROP TABLE users;

-- ❌ PERIGO: Vai perder histórico
TRUNCATE history_global;

-- ❌ PERIGO: Migration sem validação
-- Execute sempre via drizzle-kit migrate
```

### ✅ Sempre Faça

```bash
# Antes de qualquer DDL:
turso db shell ipcom-chat ".backup backup-$(date +%Y%m%d).db"

# Antes de migration:
npx tsx scripts/validate-baseline.ts

# Teste em dev primeiro:
TURSO_URL=libsql://dev-db.turso.io npx drizzle-kit migrate
```

---

## 📝 Changelog

### 2025-01-17
- ✅ Criada documentação completa de todas as 8 tabelas
- ✅ Adicionado plano de migrations REVISADO (v2.0)
- ✅ Criado guia prático de baseline workflow
- ✅ Identificados e corrigidos gaps críticos no plano original

### 2025-01-05 (Estimado - Criação Original)
- Criação inicial de `migrations.md` (v1.0)
- Schema hardcoded em `turso-client.ts`

---

## 🔗 Links Úteis

### Documentação Externa
- [Turso Documentation](https://docs.turso.tech/)
- [LibSQL Documentation](https://github.com/tursodatabase/libsql)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Drizzle with Turso Guide](https://orm.drizzle.team/docs/tutorials/drizzle-with-turso)

### Código Relacionado
- `src/libs/turso-client.ts` - Schema atual (SQL hardcoded)
- `src/contexts/mcp-context.tsx` - Uso do TursoAdapter
- `setup.js` - Installation/upgrade logic

---

## 🆘 Precisa de Ajuda?

### Para Problemas com:

**Schemas/Estrutura:**
→ Consulte [`tables/README.md`](./tables/README.md) ou tabela específica

**Implementação Drizzle:**
→ Consulte [`migrations-REVISED.md`](./migrations-REVISED.md) ou [`baseline-workflow-guide.md`](./baseline-workflow-guide.md)

**Queries/Performance:**
→ Consulte [`tables/README.md`](./tables/README.md) seção "Common Query Patterns"

**Erros de Migration:**
→ Consulte [`baseline-workflow-guide.md`](./baseline-workflow-guide.md) seção "Troubleshooting"

---

## 📄 License

Este projeto é parte do MCP Terminal Assistant.
Documentação mantida por Anthropic Claude Code.
