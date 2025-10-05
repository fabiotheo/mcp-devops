# Guia Prático: Baseline Migration para Banco Existente

**Data:** 2025-01-17
**Projeto:** MCP DevOps - Migração Drizzle ORM
**Status:** ✅ GUIA OPERACIONAL (Atualizado com correções críticas)
**Última Revisão:** 2025-01-17 - Correções aplicadas após code review

---

## ⚠️ AVISOS CRÍTICOS - LEIA ANTES DE COMEÇAR

### 🚨 Correções Aplicadas no Plano

Este guia está sincronizado com `migrations-REVISED.md` que contém **2 correções críticas**:

1. **✅ CORRIGIDO**: Campo `users.email` deve ser `.notNull()` (não nullable)
2. **✅ CORRIGIDO**: Index `idx_conv_summaries_user_machine` adicionado ao schema

### ⚠️ VALIDAÇÃO OBRIGATÓRIA

**ANTES** de executar qualquer comando deste guia, você **DEVE**:

```bash
# Verificar indexes no banco real
turso db shell ipcom-chat << 'EOF'
-- Verificar indexes de command_cache e sessions
SELECT name, tbl_name, sql
FROM sqlite_master
WHERE type='index'
  AND tbl_name IN ('command_cache', 'sessions')
ORDER BY tbl_name, name;
EOF
```

**Por quê?** Os schemas propõem indexes que podem não existir no banco real. Se não existirem:
- ❌ Migration baseline **NÃO será vazia**
- ❌ Vai quebrar a estratégia de baseline
- ✅ **Solução**: Criar indexes manualmente ANTES ou remover dos schemas

---

## 🎯 Objetivo Deste Guia

Este documento fornece **instruções passo-a-passo executáveis** para criar uma migration baseline no Drizzle quando você já tem um banco de dados em produção com tabelas criadas.

**Use este guia se:**
- ✅ Você tem um banco Turso/LibSQL com tabelas já criadas
- ✅ Quer adotar Drizzle ORM sem quebrar nada
- ✅ Precisa começar a rastrear migrations a partir de agora
- ✅ Não quer recriar as tabelas existentes

---

## 📋 Pré-requisitos

Antes de começar, você precisa ter:

```bash
# 1. Node.js 18+ instalado
node --version  # v18.0.0 ou superior

# 2. pnpm instalado
pnpm --version  # 8.0.0 ou superior

# 3. Credenciais do Turso
echo $TURSO_URL      # libsql://your-db.turso.io
echo $TURSO_TOKEN    # eyJ... (seu token)

# 4. Acesso ao banco de dados
turso db show ipcom-chat  # Deve mostrar info do banco
```

---

## 🚀 Método 1: Introspection Automática (RECOMENDADO)

### Passo 1: Instalar Drizzle

```bash
cd /Users/fabiotheodoro/IPCOM/DEV/mcp-devops

# Instalar dependências
pnpm add drizzle-orm drizzle-kit @libsql/client

# Verificar instalação
npx drizzle-kit --version
```

### Passo 2: Criar Configuração Drizzle

```bash
# Criar arquivo de configuração
cat > drizzle.config.ts << 'EOF'
import type { Config } from 'drizzle-kit';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Ler config.json do usuário
const configPath = path.join(os.homedir(), '.mcp-terminal', 'config.json');
let tursoUrl = process.env.TURSO_URL || '';
let tursoToken = process.env.TURSO_TOKEN || '';

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  tursoUrl = config.turso_url || tursoUrl;
  tursoToken = config.turso_token || tursoToken;
}

if (!tursoUrl || !tursoToken) {
  throw new Error('TURSO_URL e TURSO_TOKEN são obrigatórios!');
}

export default {
  dialect: 'sqlite',
  driver: 'turso',
  schema: './src/database/schema/*',
  out: './src/database/migrations',
  dbCredentials: {
    url: tursoUrl,
    authToken: tursoToken
  },
  verbose: true,
  strict: true
} satisfies Config;
EOF
```

### Passo 3: Criar Estrutura de Diretórios

```bash
# Criar diretórios necessários
mkdir -p src/database/schema
mkdir -p src/database/migrations
mkdir -p scripts

echo "✅ Estrutura criada"
tree src/database
```

### Passo 4: Executar Introspection (PULL)

```bash
# Extrair schemas do banco Turso
npx drizzle-kit pull

# ⏳ Aguarde... Drizzle vai:
# 1. Conectar no Turso
# 2. Ler todas as tabelas
# 3. Gerar arquivos TypeScript em src/database/schema/
```

**Output esperado:**

```
🚀 Pulling schema from database...
✅ Successfully pulled schema from libsql://ipcom-chat.turso.io

Generated files:
  src/database/schema/users.ts
  src/database/schema/machines.ts
  src/database/schema/history_global.ts
  src/database/schema/history_user.ts
  src/database/schema/history_machine.ts
  src/database/schema/command_cache.ts
  src/database/schema/sessions.ts
  src/database/schema/conversation_summaries.ts
  src/database/schema/index.ts

✨ Done in 3.2s
```

### Passo 5: Revisar e Ajustar Schemas Gerados

```bash
# Inspecionar os schemas gerados
ls -la src/database/schema/

# Abrir e revisar cada arquivo
code src/database/schema/  # No VSCode
# ou
vim src/database/schema/users.ts
```

**Ajustes comuns necessários:**

1. **Tipos de timestamp**: Adicionar `{ mode: 'timestamp' }`
2. **Foreign keys**: Adicionar explicitamente (pull pode não detectar)
3. **Defaults SQL**: Converter para syntax Drizzle
4. **Naming**: Converter snake_case → camelCase

**Exemplo de ajuste:**

```typescript
// ❌ ANTES (gerado pelo pull)
export const users = sqliteTable('users', {
  created_at: integer('created_at'),  // Tipo genérico
  updated_at: integer('updated_at')
});

// ✅ DEPOIS (ajustado manualmente)
export const users = sqliteTable('users', {
  createdAt: integer('created_at', { mode: 'timestamp' })  // Tipo específico
    .notNull()
    .default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(strftime('%s', 'now'))`)
});
```

### Passo 6: Criar Script de Validação

```bash
cat > scripts/validate-baseline.ts << 'EOF'
#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

console.log('🔍 Validando migration baseline...\n');

// Encontrar migration mais recente
const migrationsDir = path.join(process.cwd(), 'src/database/migrations');
const migrationFiles = glob.sync('*.sql', { cwd: migrationsDir });

if (migrationFiles.length === 0) {
  console.error('❌ Nenhuma migration encontrada!');
  process.exit(1);
}

const latestMigration = migrationFiles.sort().pop()!;
const migrationPath = path.join(migrationsDir, latestMigration);

console.log(`📄 Analisando: ${latestMigration}\n`);

const content = fs.readFileSync(migrationPath, 'utf8');

// Remove comentários SQL
const withoutComments = content
  .replace(/--.*$/gm, '')              // Comentários de linha
  .replace(/\/\*[\s\S]*?\*\//g, '')    // Comentários de bloco
  .trim();

// Detectar DDL perigoso
const hasCREATE = /CREATE\s+TABLE/gi.test(withoutComments);
const hasALTER = /ALTER\s+TABLE/gi.test(withoutComments);
const hasDROP = /DROP\s+TABLE/gi.test(withoutComments);
const hasINSERT = /INSERT\s+INTO/gi.test(withoutComments);
const hasUPDATE = /UPDATE\s+/gi.test(withoutComments);
const hasDELETE = /DELETE\s+FROM/gi.test(withoutComments);

const hasDangerousSQL =
  hasCREATE || hasALTER || hasDROP ||
  hasINSERT || hasUPDATE || hasDELETE;

// Relatório
console.log('📊 Análise de Conteúdo:');
console.log('─'.repeat(50));
console.log(`CREATE TABLE statements: ${hasCREATE ? '❌ ENCONTRADO' : '✅ Não encontrado'}`);
console.log(`ALTER TABLE statements:  ${hasALTER ? '❌ ENCONTRADO' : '✅ Não encontrado'}`);
console.log(`DROP TABLE statements:   ${hasDROP ? '❌ ENCONTRADO' : '✅ Não encontrado'}`);
console.log(`INSERT/UPDATE/DELETE:    ${hasINSERT || hasUPDATE || hasDELETE ? '❌ ENCONTRADO' : '✅ Não encontrado'}`);
console.log('─'.repeat(50));

if (hasDangerousSQL) {
  console.error('\n❌ FALHA: Migration baseline contém DDL/DML perigoso!\n');
  console.error('🔍 Conteúdo detectado (sem comentários):');
  console.error('─'.repeat(50));
  console.error(withoutComments.substring(0, 500));
  console.error('─'.repeat(50));
  console.error('\n⚠️  AÇÃO NECESSÁRIA:');
  console.error('1. Volte ao passo 5 (Revisar Schemas)');
  console.error('2. Corrija diferenças entre schemas TS e banco real');
  console.error('3. Execute `npx drizzle-kit generate` novamente');
  console.error('4. A migration DEVE estar vazia ou 100% comentada\n');
  process.exit(1);
}

console.log('\n✅ VALIDAÇÃO PASSOU!');
console.log('Migration baseline está segura para execução.');
console.log('A migration está vazia ou totalmente comentada.\n');

process.exit(0);
EOF

chmod +x scripts/validate-baseline.ts
```

### Passo 7: Gerar Migration Baseline

```bash
# Gerar migration comparando schemas TS com banco real
npx drizzle-kit generate

# ⏳ Drizzle vai:
# 1. Ler seus schemas TypeScript
# 2. Conectar no banco Turso
# 3. Comparar diferenças
# 4. Gerar SQL migration
```

**Output esperado (IDEAL):**

```
📦 Generating SQL migration...
✅ Migration generated: 0000_baseline.sql

⚠️  No schema changes detected.
   Migration file is empty (baseline).
```

**Output esperado (PROBLEMA):**

```
📦 Generating SQL migration...
✅ Migration generated: 0000_baseline.sql

⚠️  Schema changes detected:
   - CREATE TABLE users (...)
   - CREATE INDEX idx_users_username (...)

🚨 WARNING: Your schemas don't match the database!
```

### Passo 8: Validar Migration Baseline

```bash
# Executar script de validação
npx tsx scripts/validate-baseline.ts

# Se PASSAR ✅: Prossiga para Passo 9
# Se FALHAR ❌: Volte ao Passo 5 e corrija schemas
```

### Passo 9: Aplicar Baseline (Criar Tracking)

```bash
# Fazer backup primeiro
turso db shell ipcom-chat ".backup /tmp/ipcom-chat-backup-$(date +%Y%m%d).db"

# Aplicar migration baseline
npx drizzle-kit migrate

# ⏳ Drizzle vai:
# 1. Criar tabela __drizzle_migrations
# 2. Registrar 0000_baseline como aplicada
# 3. NÃO executar DDL (migration vazia)
```

**Output esperado:**

```
🚀 Running migrations...
✅ Created table __drizzle_migrations
✅ Applied migration: 0000_baseline.sql

🎉 All migrations applied successfully!
```

### Passo 10: Verificar Resultado

```bash
# Conectar no banco e verificar tracking table
turso db shell ipcom-chat "SELECT * FROM __drizzle_migrations;"

# Output esperado:
# id | hash          | created_at
# 1  | abc123def456  | 1737134400
```

**🎉 SUCESSO!** Agora você tem:
- ✅ Schemas TypeScript refletindo banco real
- ✅ Migration baseline registrada
- ✅ Tracking table criada
- ✅ Sistema pronto para migrations futuras

---

## 🔧 Método 2: Criação Manual de Schemas (Avançado)

### Quando Usar?

Use este método se:
- Você quer controle total sobre os schemas TypeScript
- Prefere escrever schemas idiomáticos desde o início
- Tem tempo para validação manual exaustiva

### Processo

1. **Criar schemas manualmente** baseados em `docs/database/tables/*.md`
2. **Comparar com código** existente em `src/libs/turso-client.ts:208-401`
3. **Executar generate** e validar migration vazia
4. **Corrigir diferenças** iterativamente até migration ficar vazia

**Exemplo de schema manual:**

```typescript
// src/database/schema/users.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .default(sql`(hex(randomblob(16)))`),

  username: text('username')
    .unique()
    .notNull(),

  name: text('name')
    .notNull(),

  email: text('email'),  // Nullable

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

---

## 🐛 Troubleshooting

### Problema 1: "Migration contém CREATE TABLE"

**Sintoma:**
```
❌ FALHA: Migration baseline contém DDL/DML perigoso!
CREATE TABLE statements: ❌ ENCONTRADO
```

**Causa:** Schemas TypeScript não refletem 100% o banco real.

**Solução:**
```bash
# 1. Comparar schema TS com banco
turso db shell ipcom-chat ".schema users"

# 2. Ajustar schema TypeScript para corresponder EXATAMENTE
# 3. Regenerar migration
npx drizzle-kit generate

# 4. Validar novamente
npx tsx scripts/validate-baseline.ts
```

### Problema 2: "Cannot find module 'drizzle-kit'"

**Sintoma:**
```
Error: Cannot find module 'drizzle-kit'
```

**Solução:**
```bash
# Reinstalar dependências
pnpm add drizzle-orm drizzle-kit @libsql/client

# Verificar instalação
npx drizzle-kit --version
```

### Problema 3: "TURSO_URL is required"

**Sintoma:**
```
Error: TURSO_URL e TURSO_TOKEN são obrigatórios!
```

**Solução:**
```bash
# Opção 1: Exportar variáveis
export TURSO_URL="libsql://ipcom-chat.turso.io"
export TURSO_TOKEN="eyJ..."

# Opção 2: Criar .env
cat > .env << EOF
TURSO_URL=libsql://ipcom-chat.turso.io
TURSO_TOKEN=eyJ...
EOF

# Opção 3: Usar config.json existente
# drizzle.config.ts já lê de ~/.mcp-terminal/config.json
```

### Problema 4: "Foreign keys não detectadas no pull"

**Sintoma:** `drizzle-kit pull` não gera `.references()` nos schemas.

**Solução:** Adicione manualmente após o pull:

```typescript
// Antes
machineId: text('machine_id'),

// Depois
machineId: text('machine_id')
  .references(() => machines.machineId),
```

### Problema 5: "Indexes não aparecem nos schemas"

**Sintoma:** Pull gera schemas sem `.index()`.

**Solução:** Adicione indexes manualmente:

```typescript
export const historyGlobal = sqliteTable('history_global', {
  // ... columns
}, (table) => ({
  timestampIdx: index('idx_history_global_timestamp')
    .on(table.timestamp.desc()),
  machineIdx: index('idx_history_global_machine')
    .on(table.machineId, table.timestamp.desc())
}));
```

---

## 📊 Checklist Final de Validação

Antes de considerar o baseline completo:

- [ ] ✅ `npx tsx scripts/validate-baseline.ts` passou
- [ ] ✅ Migration `0000_baseline.sql` está vazia ou comentada
- [ ] ✅ Tabela `__drizzle_migrations` criada no banco
- [ ] ✅ Query `SELECT * FROM __drizzle_migrations` retorna 1 registro
- [ ] ✅ Backup do banco foi feito
- [ ] ✅ Todas as 8 tabelas têm schemas TypeScript
- [ ] ✅ Todos os 13 indexes estão definidos
- [ ] ✅ Todas as 6 foreign keys estão definidas
- [ ] ✅ `npx drizzle-kit studio` abre corretamente
- [ ] ✅ Type checking passa: `pnpm typecheck`

---

## 🎯 Próximos Passos

Após completar o baseline:

1. **Testar Drizzle Client**:
   ```typescript
   // src/database/client.ts
   import { drizzle } from 'drizzle-orm/libsql';
   import { createClient } from '@libsql/client';
   import * as schema from './schema';

   const client = createClient({
     url: process.env.TURSO_URL!,
     authToken: process.env.TURSO_TOKEN!
   });

   export const db = drizzle(client, { schema });
   ```

2. **Primeira Query TypeSafe**:
   ```typescript
   import { db } from './database/client';
   import { users } from './database/schema';

   // Query com type safety completo!
   const allUsers = await db.select().from(users);
   ```

3. **Criar Primeira Migration Real**:
   ```bash
   # Adicionar novo campo ao schema
   # Gerar migration
   npx drizzle-kit generate

   # Aplicar
   npx drizzle-kit migrate
   ```

4. **Integrar com Setup.js**:
   - Adicionar dependências ao `requiredDeps`
   - Executar migrations durante `setup.js --upgrade`

---

## 📚 Referências

- [Drizzle Kit Pull Documentation](https://orm.drizzle.team/docs/drizzle-kit-pull)
- [Drizzle Kit Generate Documentation](https://orm.drizzle.team/docs/drizzle-kit-generate)
- [Drizzle with Turso Tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-with-turso)
- [Database Tables Documentation](./tables/README.md)
- [Migration Plan REVISED](./migrations-REVISED.md)

---

## 🆘 Suporte

Se encontrar problemas:

1. Verificar logs detalhados: `npx drizzle-kit pull --verbose`
2. Consultar [Drizzle Discord](https://discord.gg/drizzle)
3. Revisar [migrations-REVISED.md](./migrations-REVISED.md) seção troubleshooting
4. Abrir issue com:
   - Output completo do comando que falhou
   - Conteúdo de `drizzle.config.ts`
   - Versão do Drizzle: `npx drizzle-kit --version`
