# Comandos `/compact` e `/load` - Estratégia de Resumo Inteligente

## 📊 Análise do Problema

### Situação Atual

**Sistema de histórico hoje:**
- `useHistoryManager.ts` carrega **100 entradas** do Turso
- Envia **TODAS** as mensagens para API Claude (200 mensagens: user + assistant)
- Consumo estimado: **50k-100k tokens** só de histórico
- **Sem resumo**, desperdício massivo de tokens

**Arquitetura de Tabelas:**
- `history_user` - Histórico cross-machine (com user_id)
- `history_machine` - Histórico local da máquina (user_id opcional)
- `history_global` - Histórico compartilhado

**Flag --user atual:**
```typescript
// ipcom-chat-cli.ts:643
const effectiveUser = options.user || process.env.MCP_USER || 'default';
```
- **Com --user**: Valida usuário, usa `history_user` (cross-machine)
- **Sem --user**: Usa 'default', histórico apenas da máquina

---

## 💡 Solução: Três Comandos Complementares

### Comando 1: `/compact` - Compactar Sessão Atual

**Objetivo:** Gera resumo do histórico da **sessão atual** e salva em cache no Turso

**Comportamento:**
1. Pega mensagens da sessão atual (já carregadas em memória)
2. Verifica se tem mensagens suficientes (≥20)
3. Divide: últimas 2 completas + restante para resumir
4. Gera resumo via Claude API
5. **Salva** em `conversation_summaries` (Turso)
6. **NÃO muda** o contexto atual - continua conversando normalmente

**Quando usar:**
- Final de uma sessão longa
- Antes de sair do programa
- Quando quiser "salvar" progresso compactado

**Exemplo:**
```bash
# Sessão com 60 mensagens
> /compact
⏳ Compactando histórico da sessão atual...
✓ Resumo salvo! 58 mensagens compactadas em cache
# Contexto atual permanece inalterado
```

---

### Comando 2: `/load` - Carregar Últimas 50 Mensagens (Desta Máquina)

**Objetivo:** Carrega últimas 50 mensagens **APENAS desta máquina** e gera resumo **temporário**

**Comportamento:**
1. Busca últimas 50 mensagens filtrando por `user_id` + `machine_id`
2. Verifica se tem mensagens suficientes (≥20)
3. Divide: últimas 2 completas + restante para resumir
4. Gera resumo via Claude API
5. **NÃO salva** no Turso (resumo temporário apenas para esta sessão)
6. **SUBSTITUI** contexto atual (replace)

**Quando usar:**
- Retomar trabalho **nesta máquina específica**
- Contexto local (não quer misturar com outras máquinas)

**Exemplo:**
```bash
$ ipcom-chat --user fabio
> /load
⏳ Carregando últimas 50 mensagens desta máquina...
✓ Contexto carregado! (Resumo: 48 msgs + 2 recentes desta máquina)
# Apenas mensagens criadas nesta máquina
```

---

### Comando 3: `/load-all-machines` - Carregar de Todas as Máquinas

**Objetivo:** Carrega últimas 50 mensagens do usuário de **TODAS as máquinas** (cross-machine)

**Comportamento:**
1. Busca últimas 50 mensagens filtrando **APENAS** por `user_id` (ignora `machine_id`)
2. Verifica se tem mensagens suficientes (≥20)
3. Divide: últimas 2 completas + restante para resumir
4. Gera resumo via Claude API
5. **NÃO salva** no Turso (resumo temporário apenas para esta sessão)
6. **SUBSTITUI** contexto atual (replace)

**Quando usar:**
- Continuar trabalho de **outra máquina**
- Quer contexto completo cross-machine
- Mudou de máquina e quer retomar raciocínio

**Exemplo:**
```bash
# Máquina A (notebook)
$ ipcom-chat --user fabio
> Como configurar nginx?
> exit

# Máquina B (servidor)
$ ipcom-chat --user fabio
> /load-all-machines
⏳ Carregando últimas 50 mensagens de todas as máquinas...
✓ Contexto carregado! (Resumo: 48 msgs + 2 recentes - cross-machine)
# ← Inclui a pergunta sobre nginx da Máquina A!

> Como estava aquele problema do nginx?
← [responde baseado no contexto cross-machine]
```

---

## 🔄 Diferença Entre os Comandos

| Aspecto | `/compact` | `/load` | `/load-all-machines` |
|---------|-----------|---------|---------------------|
| **Fonte** | Sessão atual (memória) | Turso (user_id + machine_id) | Turso (apenas user_id) |
| **Scope** | - | Esta máquina | Todas as máquinas |
| **Salva resumo?** | ✅ SIM | ❌ NÃO (temporário) | ❌ NÃO (temporário) |
| **Muda contexto?** | ❌ NÃO | ✅ SIM (replace) | ✅ SIM (replace) |
| **Filtro SQL** | - | `user_id=? AND machine_id=?` | `user_id=?` |
| **Uso típico** | Fim de sessão | Retomar local | Retomar cross-machine |

---

## 💾 Estrutura da Tabela

```sql
CREATE TABLE conversation_summaries (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
    user_id TEXT,
    machine_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    summarized_up_to_message_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    message_count INTEGER,
    UNIQUE(user_id, machine_id)
);

-- Índice para performance
CREATE INDEX idx_conv_summaries_user_machine
ON conversation_summaries(user_id, machine_id);
```

**Campos:**
- `user_id` + `machine_id` - Identificam contexto único
- `summary` - Texto do resumo gerado
- `summarized_up_to_message_id` - Última mensagem incluída no resumo
- `created_at` - Timestamp de criação inicial (nunca atualizado)
- `updated_at` - Timestamp da última atualização do resumo
- `message_count` - Quantas mensagens foram resumidas

**Índices:**
- `idx_conv_summaries_user_machine` - Acelera queries por user_id e machine_id

---

## 📐 Definições de Tipos TypeScript

```typescript
/**
 * Estrutura de uma entrada de histórico no contexto da aplicação
 * (usado para enviar à API Claude e manipular na memória)
 */
interface HistoryEntry {
  id: string;                    // UUID da mensagem (do Turso ou gerado temporariamente)
  role: 'user' | 'assistant';    // Papel da mensagem
  content: string;               // Conteúdo da mensagem
  timestamp?: number;            // Timestamp opcional (Unix epoch)
}

/**
 * Estrutura de um registro do banco de dados Turso
 * (formato retornado pelas queries SELECT)
 */
interface HistoryRecord {
  id: string;
  command: string;      // Mensagem do usuário
  response: string;     // Resposta do assistente
  timestamp: number;
  user_id: string | null;
  machine_id: string;
}

/**
 * Converte registros do Turso para o formato HistoryEntry
 */
function convertFromTurso(records: HistoryRecord[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];

  records.forEach(record => {
    // Adiciona mensagem do usuário
    entries.push({
      id: record.id,
      role: 'user',
      content: record.command,
      timestamp: record.timestamp
    });

    // Adiciona resposta do assistente (se existir)
    if (record.response) {
      entries.push({
        id: `${record.id}-response`,
        role: 'assistant',
        content: record.response,
        timestamp: record.timestamp
      });
    }
  });

  return entries;
}

/**
 * Valida e sanitiza identificadores (userId, machineId)
 */
function validateIdentifier(id: string, name: string): string {
  if (!id || id.trim().length === 0) {
    throw new Error(`${name} não pode ser vazio`);
  }
  if (id.length > 255) {
    throw new Error(`${name} muito longo (máximo 255 caracteres)`);
  }
  // Remove caracteres perigosos (defesa em profundidade)
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}
```

---

## 🤖 Prompt de Resumo

```typescript
const SUMMARY_PROMPT = `
Você é um assistente especializado em resumir conversas técnicas de CLI.
Crie um resumo DENSO e PRECISO das mensagens abaixo.

PRESERVE obrigatoriamente:
- Decisões técnicas tomadas
- Comandos executados e seus resultados
- Problemas identificados e soluções aplicadas
- Nomes de arquivos, paths, trechos de código mencionados
- Perguntas que ficaram sem resposta
- Contexto de debugging e investigação

IGNORE:
- Saudações e despedidas
- Mensagens de confirmação genéricas
- Repetições desnecessárias

FORMATO: Bullet points cronológicos, máximo 500 palavras

ORDEM CRONOLÓGICA: Mantenha a ordem temporal dos eventos

MENSAGENS PARA RESUMIR:
<histórico aqui>
`;

/**
 * Formata mensagens para o prompt de resumo
 */
function buildSummaryPrompt(messages: HistoryEntry[]): string {
  const historyText = messages
    .map((msg, index) => `[${index + 1}] ${msg.role}: ${msg.content}`)
    .join('\n\n');

  return `${SUMMARY_PROMPT}\n\nMENSAGENS:\n${historyText}`;
}
```

---

## 💻 Implementação: `/compact`

```typescript
async function handleCompactCommand(
  userId: string | null,
  machineId: string,
  currentHistory: HistoryEntry[]
) {
  // Validação de inputs
  const safeUserId = userId ? validateIdentifier(userId, 'userId') : null;
  const safeMachineId = validateIdentifier(machineId, 'machineId');

  // Verifica se tem mensagens suficientes
  if (currentHistory.length < 20) {
    console.log(`ℹ️ Histórico da sessão muito pequeno (${currentHistory.length} mensagens), não precisa compactar`);
    return;
  }

  console.log('⏳ Compactando histórico da sessão atual...');

  // Divide: últimas 2 completas, resto para resumir
  const messagesToSummarize = currentHistory.slice(0, -2);
  const summary = await generateSummary(messagesToSummarize);

  // Verifica se resumo foi gerado com sucesso
  if (!summary) {
    console.log('❌ Falha ao gerar resumo, tente novamente');
    return;
  }

  // Salva ou atualiza no Turso
  const lastSummarizedId = messagesToSummarize[messagesToSummarize.length - 1].id;
  const now = Date.now();

  await tursoClient.execute(
    `INSERT INTO conversation_summaries
     (id, user_id, machine_id, summary, summarized_up_to_message_id, created_at, updated_at, message_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, machine_id) DO UPDATE SET
       summary = excluded.summary,
       summarized_up_to_message_id = excluded.summarized_up_to_message_id,
       updated_at = excluded.updated_at,
       message_count = excluded.message_count`,
    [
      generateUUID(),
      safeUserId,
      safeMachineId,
      summary,
      lastSummarizedId,
      now,
      now,
      messagesToSummarize.length
    ]
  );

  console.log(`✓ Resumo salvo! ${messagesToSummarize.length} mensagens compactadas em cache`);
}
```

---

## 💻 Implementação: `/load` (Esta Máquina)

```typescript
async function handleLoadCommand(userId: string | null, machineId: string) {
  // Validação de inputs
  const safeUserId = userId ? validateIdentifier(userId, 'userId') : null;
  const safeMachineId = validateIdentifier(machineId, 'machineId');

  console.log('⏳ Carregando últimas 50 mensagens desta máquina...');

  let recentHistory;

  // Busca mensagens filtrando por user_id + machine_id
  if (safeUserId && safeUserId !== 'default') {
    // COM --user: history_user filtrado por user_id + machine_id
    recentHistory = await tursoClient.execute(
      `SELECT * FROM history_user
       WHERE user_id = ? AND machine_id = ?
       ORDER BY timestamp DESC
       LIMIT 50`,
      [safeUserId, safeMachineId]
    );
  } else {
    // SEM --user: history_machine filtrado apenas por machine_id
    recentHistory = await tursoClient.execute(
      `SELECT * FROM history_machine
       WHERE machine_id = ? AND user_id IS NULL
       ORDER BY timestamp DESC
       LIMIT 50`,
      [safeMachineId]
    );
  }

  // Converte registros do Turso para HistoryEntry
  const historyEntries = convertFromTurso(recentHistory.rows.reverse());

  // Verifica se tem mensagens suficientes
  if (historyEntries.length === 0) {
    console.log('ℹ️ Nenhum histórico encontrado para carregar');
    return { messages: [] };
  }

  if (historyEntries.length < 20) {
    console.log(`ℹ️ Apenas ${historyEntries.length} mensagens desta máquina, carregando completo sem resumo`);
    return { messages: historyEntries };
  }

  // Divide: últimas 2 completas, resto para resumir
  const messagesToSummarize = historyEntries.slice(0, -2);
  const recentMessages = historyEntries.slice(-2);

  // Gera resumo temporário (NÃO salva no Turso)
  const summary = await generateSummary(messagesToSummarize);

  // Verifica se resumo foi gerado com sucesso
  if (!summary) {
    console.log('⚠️ Falha ao gerar resumo, carregando mensagens completas');
    return { messages: historyEntries };
  }

  console.log(`✓ Contexto carregado! (Resumo: ${messagesToSummarize.length} msgs + ${recentMessages.length} recentes desta máquina)`);

  // Retorna contexto para carregar (replace do fullHistory)
  return {
    summary,
    recentMessages
  };
}
```

---

## 💻 Implementação: `/load-all-machines` (Cross-Machine)

```typescript
async function handleLoadAllMachinesCommand(userId: string | null) {
  // Validação: só funciona com --user
  if (!userId || userId === 'default') {
    console.log('❌ /load-all-machines requer --user flag');
    return { messages: [] };
  }

  const safeUserId = validateIdentifier(userId, 'userId');

  console.log('⏳ Carregando últimas 50 mensagens de todas as máquinas...');

  // Busca mensagens filtrando APENAS por user_id (ignora machine_id)
  const recentHistory = await tursoClient.execute(
    `SELECT * FROM history_user
     WHERE user_id = ?
     ORDER BY timestamp DESC
     LIMIT 50`,
    [safeUserId]
  );

  // Converte registros do Turso para HistoryEntry
  const historyEntries = convertFromTurso(recentHistory.rows.reverse());

  // Verifica se tem mensagens suficientes
  if (historyEntries.length === 0) {
    console.log('ℹ️ Nenhum histórico encontrado para carregar');
    return { messages: [] };
  }

  if (historyEntries.length < 20) {
    console.log(`ℹ️ Apenas ${historyEntries.length} mensagens do usuário ${safeUserId}, carregando completo sem resumo`);
    return { messages: historyEntries };
  }

  // Divide: últimas 2 completas, resto para resumir
  const messagesToSummarize = historyEntries.slice(0, -2);
  const recentMessages = historyEntries.slice(-2);

  // Gera resumo temporário (NÃO salva no Turso)
  const summary = await generateSummary(messagesToSummarize);

  // Verifica se resumo foi gerado com sucesso
  if (!summary) {
    console.log('⚠️ Falha ao gerar resumo, carregando mensagens completas');
    return { messages: historyEntries };
  }

  console.log(`✓ Contexto carregado! (Resumo: ${messagesToSummarize.length} msgs + ${recentMessages.length} recentes - cross-machine)`);

  // Retorna contexto para carregar (replace do fullHistory)
  return {
    summary,
    recentMessages
  };
}

/**
 * Gera resumo de mensagens usando Claude API
 * Retorna null em caso de erro
 */
async function generateSummary(messages: HistoryEntry[]): Promise<string | null> {
  try {
    const prompt = buildSummaryPrompt(messages);

    const response = await claude.messages.create({
      model: 'claude-3-haiku-20240307',  // Modelo barato para resumos
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    // Valida resposta
    if (!response.content || response.content.length === 0) {
      throw new Error('Resposta vazia da API Claude');
    }

    return response.content[0].text;
  } catch (error) {
    console.error('❌ Erro ao gerar resumo:', error.message);
    return null;
  }
}
```

---

## 🔧 Decisões de Design

### 1. Por Que Três Comandos?

**Separação de responsabilidades:**
- `/compact` = Salvar progresso (persistência)
- `/load` = Carregar contexto local (desta máquina)
- `/load-all-machines` = Carregar contexto global (cross-machine)

**Clareza:**
- Usuário escolhe explicitamente: local vs cross-machine
- Sem "magia" - comportamento óbvio pelo nome do comando

**Flexibilidade:**
- Trabalho local: usa `/load`
- Continuação em outra máquina: usa `/load-all-machines`
- Fim de sessão: usa `/compact`

---

### 2. Por Que `/load` NÃO Salva?

**Razões:**
1. **Evita cache poluído**: Resumos de 50 msgs não são úteis para salvar
2. **Performance**: Não gasta write no Turso desnecessariamente
3. **Propósito claro**: `/load` é para **carregar**, `/compact` é para **salvar**
4. **Flexibilidade**: Usuário pode fazer `/load` várias vezes sem side effects

---

### 3. Limite de 50 Mensagens

**Por quê 50?**
- ✅ Contexto recente suficiente (últimas ~25 perguntas/respostas)
- ✅ Rápido de carregar do Turso
- ✅ Gera resumo de ~48 msgs = ~12k tokens input (barato)
- ✅ Resultado final: ~1.5k tokens (resumo + 2 recentes)

**Economia:**
```
Sem /load: 50 msgs × 2 = 100 msgs × 250 tokens = 25k tokens
Com /load: Resumo (500) + 2 msgs × 2 × 250 = 1.5k tokens
Economia: 94% de redução
```

---

### 4. Threshold Mínimo: 20 Mensagens

**Por quê?**
- Evita gerar resumo de históricos muito pequenos
- 20 mensagens = ~10 perguntas/respostas (razoável para resumir)
- Abaixo disso: carrega completo (mais simples)

---

### 5. Comportamento Local vs Cross-Machine

**`/load` - Apenas Esta Máquina:**
```bash
# Máquina A
$ ipcom-chat --user fabio
> Como configurar nginx?
> exit

# Máquina B
$ ipcom-chat --user fabio
> /load
ℹ️ Nenhum histórico desta máquina
# ← NÃO vê pergunta da Máquina A (filtra por machine_id)
```

**`/load-all-machines` - Cross-Machine:**
```bash
# Máquina A
$ ipcom-chat --user fabio
> Como configurar nginx?
> exit

# Máquina B
$ ipcom-chat --user fabio
> /load-all-machines
✓ Contexto carregado! (48 msgs + 2 recentes - cross-machine)
# ← VÊ a pergunta da Máquina A! (ignora machine_id)
```

**SEM `--user` flag:**
```bash
$ ipcom-chat
> /load
✓ Contexto carregado! (mensagens desta máquina)

> /load-all-machines
❌ /load-all-machines requer --user flag
```

---

## 📋 Fluxos de Uso Típicos

### Fluxo 1: Sessão Longa

```bash
# Início
$ ipcom-chat --user fabio
> /load
✓ Contexto carregado! (48 msgs + 2 recentes)

> Como configurar nginx?
← [resposta]
> Como resolver erro 502?
← [resposta]
# ... muitas perguntas ...

# Antes de sair
> /compact
✓ Resumo salvo! 78 mensagens compactadas em cache

> exit
```

---

### Fluxo 2: Continuação em Outra Máquina

```bash
# Servidor de produção
$ ipcom-chat --user fabio
> /load-all-machines
✓ Contexto carregado! (48 msgs + 2 recentes - cross-machine)
# ← Inclui conversa de todas as máquinas!

> Qual era aquela config do nginx mesmo?
← [responde baseado nas últimas 50 msgs de todas as máquinas]
```

---

### Fluxo 3: Sessão Rápida (Sem Compactar)

```bash
$ ipcom-chat --user fabio
> Como fazer backup do PostgreSQL?
← [resposta]
> exit
# NÃO precisa /compact (sessão pequena)
```

---

## 🔍 Feedback ao Usuário

### `/compact`

```bash
# Sucesso
> /compact
✓ Resumo salvo! 58 mensagens compactadas em cache

# Histórico pequeno
> /compact
ℹ️ Histórico da sessão muito pequeno (12 mensagens), não precisa compactar
```

---

### `/load` (Local)

```bash
# Com --user
$ ipcom-chat --user fabio
> /load
⏳ Carregando últimas 50 mensagens desta máquina...
✓ Contexto carregado! (Resumo: 48 msgs + 2 recentes desta máquina)

# Sem --user
$ ipcom-chat
> /load
⏳ Carregando últimas 50 mensagens desta máquina...
✓ Contexto carregado! (Resumo: 48 msgs + 2 recentes desta máquina)

# Histórico pequeno
> /load
ℹ️ Apenas 15 mensagens desta máquina, carregando completo sem resumo

# Sem histórico
> /load
ℹ️ Nenhum histórico encontrado para carregar
```

---

### `/load-all-machines` (Cross-Machine)

```bash
# Com --user (OK)
$ ipcom-chat --user fabio
> /load-all-machines
⏳ Carregando últimas 50 mensagens de todas as máquinas...
✓ Contexto carregado! (Resumo: 48 msgs + 2 recentes - cross-machine)

# Sem --user (ERRO)
$ ipcom-chat
> /load-all-machines
❌ /load-all-machines requer --user flag

# Histórico pequeno
> /load-all-machines
ℹ️ Apenas 15 mensagens do usuário fabio, carregando completo sem resumo
```

---

## 📋 Roadmap de Implementação (Faseado)

**Estimativa Total:** 3-4 dias

---

### **Fase 1: Fundação e Infraestrutura** (Dia 1 - Manhã)

**Objetivo:** Preparar base de dados e tipos TypeScript

**Tarefas:**

1. **Criar tipos TypeScript**
   - Criar: `src/types/history.ts`
   - Adicionar interfaces: `HistoryEntry`, `HistoryRecord`
   - Adicionar funções: `convertFromTurso()`, `validateIdentifier()`

2. **Criar tabela no Turso**
   - Modificar: `src/libs/turso-client.ts` (método `ensureSchema`)
   - Adicionar criação da tabela `conversation_summaries`
   - Adicionar índice `idx_conv_summaries_user_machine`

3. **Testar migrações**
   - Rodar aplicação e verificar criação da tabela
   - Validar schema com `turso db shell`

**Critério de Sucesso:**
- ✅ Tabela `conversation_summaries` criada no Turso
- ✅ Tipos TypeScript compilando sem erro
- ✅ Função `convertFromTurso()` testada manualmente

**Tempo Estimado:** 2-3 horas

**Status:** ✅ **COMPLETA + REVISADA (Code Review 8.5/10)**

**Implementado:**
- ✅ `src/types/history.ts` criado com interfaces e funções
  - Interface `HistoryEntry` (formato API Claude)
  - Interface `HistoryRecord` completa com todos os campos opcionais do DB
  - Função `convertFromTurso()` para conversão
  - Função `validateIdentifier()` para segurança SQL
- ✅ Tabela `conversation_summaries` com schema centralizado
  - Definição única em `ensureConversationSummariesTable()`
  - `machine_id TEXT NOT NULL` (integridade de dados)
  - Defaults para id, created_at, updated_at
  - UNIQUE constraint em (user_id, machine_id)
- ✅ Índice `idx_conv_summaries_user_machine` criado
- ✅ Migração incremental robusta e idempotente
- ✅ 10 testes automatizados passando (100% cobertura de funções utilitárias)
- ✅ Documentação sincronizada com código

**Como funciona a criação da tabela:**

**Para novas instalações:**
- `ensureSchema()` executa schema base
- Chama `ensureConversationSummariesTable()` (fonte única de verdade)
- Tabela criada com todos os defaults SQL

**Para instalações existentes (migração):**
- `ensureConversationSummariesTable()` chamado automaticamente
- Verifica se tabela já existe via sqlite_master
- Se não existir, cria tabela + índice
- Idempotente: pode rodar múltiplas vezes sem erro
- Log: `[TursoClient] ✅ Table conversation_summaries created successfully`

**Melhorias aplicadas após code review:**
1. ✅ Schema centralizado (eliminada duplicação)
2. ✅ `HistoryRecord` completo com campos opcionais
3. ✅ `machine_id NOT NULL` para integridade
4. ✅ Documentação atualizada com DEFAULTs SQL

---

### **Fase 2: Serviço de Resumo (MVP)** (Dia 1 - Tarde)

**Objetivo:** Implementar geração de resumos sem integração completa

**Tarefas:**

1. **Criar serviço base**
   - Criar: `src/services/historySummarizer.ts`
   - Implementar apenas `generateSummary()` e `buildSummaryPrompt()`
   - Adicionar constante `SUMMARY_PROMPT`

2. **Testar geração de resumo isoladamente**
   - Criar script de teste: `test-summarizer.ts`
   - Usar histórico fake (5-10 mensagens)
   - Validar qualidade do resumo gerado

3. **Ajustar prompt se necessário**
   - Testar com diferentes tipos de conversas técnicas
   - Verificar se preserva informações essenciais

**Critério de Sucesso:**
- ✅ `generateSummary()` gera resumos coerentes
- ✅ Resumo preserva comandos, paths, decisões técnicas
- ✅ Error handling funcionando (testa com API key inválida)

**Tempo Estimado:** 3-4 horas

**Status:** ✅ **COMPLETA + REVISADA (Code Review 9.0/10)**

**Implementado:**
- ✅ `src/services/historySummarizer.ts` criado
  - Classe `HistorySummarizer` com configuração flexível
  - **Modelo:** `claude-sonnet-4-5-20250929` (mais recente, não depreciado)
  - **Validação:** API key obrigatória no constructor (fail-fast)
  - `SUMMARY_PROMPT` otimizado para conversas técnicas
  - `generateSummary()` com tratamento robusto de erros
  - `buildSummaryPrompt()` formata histórico com timestamps
  - `canSummarize()` valida tamanho mínimo
  - `calculateSavings()` estima economia (±30% precisão documentada)
- ✅ Testes automatizados
  - `test-phase2-summarizer.js`: 7 testes funcionais (100% passando)
  - `test-api-key-validation.js`: 4 testes de validação (100% passando)
  - Validação de qualidade: 5/5 checks ✅

**Resultados dos Testes:**
- ✅ Resumo gerado com sucesso (736 chars)
- ✅ Economia: 50.9% de redução (~191 tokens)
- ✅ Qualidade: preserva comandos, paths, tecnologias
- ✅ Formato: bullets, sem saudações genéricas
- ✅ API usage: 1123 input tokens, 234 output tokens
- ✅ Error handling validado (histórico vazio, API key inválida)
- ✅ Sem warnings de depreciação

**Correções Aplicadas Pós-Review:**
1. ✅ Modelo atualizado para Sonnet 4.5 (não depreciado)
2. ✅ Validação de API key no constructor
3. ✅ Documentação da precisão da estimativa de tokens (±30%)

---

### **Fase 3: Comando `/compact`** (Dia 2 - Manhã)

**Objetivo:** Implementar primeiro comando funcional

**Tarefas:**

1. **Adicionar comando aos slash commands**
   - Modificar: `src/constants/slashCommands.ts`
   - Adicionar apenas `/compact`

2. **Implementar handler**
   - Adicionar `handleCompactCommand()` em `historySummarizer.ts`
   - Integrar validação e error handling

3. **Integrar com UI**
   - Modificar componente principal para detectar `/compact`
   - Chamar `handleCompactCommand()` passando `fullHistory`

4. **Testar end-to-end**
   - Criar sessão com 30+ mensagens
   - Executar `/compact`
   - Verificar registro no Turso

**Critério de Sucesso:**
- ✅ `/compact` aparece na lista de comandos
- ✅ Resumo é salvo na tabela `conversation_summaries`
- ✅ Feedback visual correto ao usuário
- ✅ Tratamento de históricos pequenos (<20 msgs)

**Tempo Estimado:** 3-4 horas

---

### **Fase 4: Comando `/load` (Local)** (Dia 2 - Tarde)

**Objetivo:** Implementar carregamento de histórico local

**Tarefas:**

1. **Adicionar comando `/load`**
   - Modificar: `src/constants/slashCommands.ts`

2. **Implementar handler**
   - Adicionar `handleLoadCommand()` em `historySummarizer.ts`
   - Implementar lógica de filtragem por `machine_id`

3. **Integrar com histórico**
   - Modificar `useHistoryManager.ts` ou componente principal
   - Substituir `fullHistory` com resultado de `/load`

4. **Testar cenários**
   - Teste 1: Carregar com >20 mensagens (deve resumir)
   - Teste 2: Carregar com <20 mensagens (carrega completo)
   - Teste 3: Sem histórico (mensagem de erro)

**Critério de Sucesso:**
- ✅ `/load` carrega histórico desta máquina
- ✅ Resumo temporário gerado corretamente
- ✅ Contexto substituído (replace) funciona
- ✅ Todos os cenários de borda testados

**Tempo Estimado:** 3-4 horas

---

### **Fase 5: Comando `/load-all-machines` (Cross-Machine)** (Dia 3 - Manhã)

**Objetivo:** Implementar carregamento cross-machine

**Tarefas:**

1. **Adicionar comando `/load-all-machines`**
   - Modificar: `src/constants/slashCommands.ts`

2. **Implementar handler**
   - Adicionar `handleLoadAllMachinesCommand()` em `historySummarizer.ts`
   - Implementar validação de `--user` flag

3. **Testar cross-machine**
   - Teste 1: Criar histórico em máquina A com `--user fabio`
   - Teste 2: Carregar em máquina B com `/load-all-machines`
   - Teste 3: Tentar sem `--user` flag (deve falhar)

**Critério de Sucesso:**
- ✅ `/load-all-machines` requer `--user` flag
- ✅ Carrega mensagens de todas as máquinas
- ✅ Feedback claro quando flag ausente
- ✅ Contexto cross-machine funciona

**Tempo Estimado:** 2-3 horas

---

### **Fase 6: Testes de Qualidade e Ajustes** (Dia 3 - Tarde)

**Objetivo:** Validar qualidade dos resumos e ajustar

**Tarefas:**

1. **Testes com históricos reais**
   - Usar conversas longas (50-100 mensagens)
   - Validar se resumo preserva contexto essencial
   - Testar diferentes tipos de conteúdo (debugging, configuração, código)

2. **Medir economia de tokens**
   - Comparar tokens antes/depois do resumo
   - Validar estimativa de 94% de redução

3. **Ajustar prompt se necessário**
   - Se resumo perder informações importantes, ajustar `SUMMARY_PROMPT`
   - Testar iterativamente até qualidade aceitável

4. **Testes de erro**
   - API Claude offline
   - Rate limit
   - Resumo muito grande (>1000 tokens)

**Critério de Sucesso:**
- ✅ Resumos preservam >90% do contexto essencial
- ✅ Economia de tokens confirmada (>90%)
- ✅ Error handling robusto

**Tempo Estimado:** 3-4 horas

---

### **Fase 7: Refinamentos e Documentação** (Dia 4)

**Objetivo:** Polir UX e documentar

**Tarefas:**

1. **Melhorar feedback visual**
   - Adicionar spinners/loading states
   - Melhorar mensagens de erro
   - Adicionar progresso (ex: "Resumindo 48 mensagens...")

2. **Adicionar help text**
   - Atualizar `/help` com descrição dos 3 comandos
   - Adicionar exemplos de uso

3. **Criar documentação de uso**
   - Criar: `docs/SLASH-COMMANDS-USAGE.md`
   - Documentar casos de uso típicos
   - Adicionar troubleshooting

4. **Testes finais**
   - Teste completo do fluxo: `/compact` → sair → `/load` → continuar
   - Teste cross-machine completo
   - Teste com múltiplos usuários

**Critério de Sucesso:**
- ✅ UX polida e intuitiva
- ✅ Documentação completa
- ✅ Todos os fluxos testados end-to-end

**Tempo Estimado:** 4-6 horas

---

## 📊 Resumo das Fases

| Fase | Descrição | Tempo | Dependências |
|------|-----------|-------|--------------|
| **Fase 1** | Fundação (tipos + tabela) | 2-3h | Nenhuma |
| **Fase 2** | Serviço de resumo (MVP) | 3-4h | Fase 1 |
| **Fase 3** | `/compact` | 3-4h | Fase 1, 2 |
| **Fase 4** | `/load` (local) | 3-4h | Fase 1, 2 |
| **Fase 5** | `/load-all-machines` | 2-3h | Fase 1, 2 |
| **Fase 6** | Testes de qualidade | 3-4h | Fase 3, 4, 5 |
| **Fase 7** | Refinamentos + docs | 4-6h | Todas anteriores |

**Total:** 20-28 horas (~3-4 dias)

---

## 🎯 Estratégia de Rollout

### Abordagem Incremental

**Vantagens de implementar em fases:**

1. **Testabilidade**: Cada fase pode ser testada isoladamente
2. **Rollback fácil**: Se algo der errado, pode reverter apenas uma fase
3. **Validação progressiva**: Pode validar qualidade dos resumos antes de implementar todos os comandos
4. **Feedback antecipado**: Pode testar `/compact` primeiro e ajustar antes de `/load`

### Possível Rollout em Produção

**Opção A - All-in (Recomendado):**
- Implementar todas as 7 fases
- Deploy completo de uma vez
- Usuários têm acesso aos 3 comandos

**Opção B - Incremental:**
- **Release 1**: Apenas Fases 1-3 (somente `/compact`)
- **Release 2**: Adicionar Fase 4 (`/load` local)
- **Release 3**: Adicionar Fase 5 (`/load-all-machines`)

**Recomendação:** Opção A, pois os 3 comandos são complementares e a experiência é melhor com todos disponíveis.

---

## ✅ Vantagens da Solução

✅ **Separação clara**: `/compact` salva, `/load` local, `/load-all-machines` global
✅ **Economia de tokens**: 94-97% de redução
✅ **Simples e previsível**: Sem lógica complexa de cache
✅ **Controle explícito**: Usuário escolhe local vs cross-machine
✅ **Flexível**: Usuário controla quando compactar
✅ **Sem side effects**: Comandos `/load*` não poluem cache
✅ **Performance**: Sempre rápido (só 50 msgs)
✅ **Sem magia**: Nome do comando deixa claro o que faz

---

## ⚠️ Considerações

⚠️ `/compact` gasta API call para gerar resumo
⚠️ `/load` gasta API call (mas é rápido - só 50 msgs)
⚠️ `/load-all-machines` gasta API call (mas é rápido - só 50 msgs)
⚠️ Históricos pequenos (<20 msgs) não são resumidos
⚠️ Comandos `/load*` NÃO usam cache salvo por `/compact` (sempre geram novo resumo)
⚠️ `/load-all-machines` requer `--user` flag
⚠️ **Limite de Contexto da API**: Claude Sonnet suporta até 200k tokens de contexto. Com resumo de ~1.5k tokens por sessão carregada, você pode carregar aproximadamente ~133 sessões antes de atingir o limite (cenário improvável na prática, pois cada `/load` carrega apenas 1 sessão)

---

## 📊 Economia Estimada de Tokens

### Sem Resumo (Carregar 50 msgs completas)
- 50 mensagens × 2 (user + assistant) = 100 mensagens
- ~250 tokens/mensagem em média
- **Total: ~25.000 tokens**

### Com `/load` (Resumo temporário)
- Resumo: ~500 tokens
- 2 mensagens recentes × 2 = 4 mensagens × 250 tokens = 1.000 tokens
- **Total: ~1.500 tokens**

### Economia
- **Redução: 94% menos tokens**
- **Custo por sessão:** $0.075 → $0.0045 (Claude Sonnet)
- **ROI:** Economia de ~$0.07 por sessão com histórico

---

## 🔍 Arquivos Afetados

### Criar:
- `src/services/historySummarizer.ts` - Lógica de resumo

### Modificar:
- `src/constants/slashCommands.ts` - Adicionar `/compact`, `/load`, `/load-all-machines`
- `src/hooks/useHistoryManager.ts` - Integrar com resumo
- `src/libs/turso-client.ts` - Criar tabela `conversation_summaries`
- Componente principal (InputHandler ou App) - Handlers dos 3 comandos

---

## 📚 Referências

- **Análise original:** Comando /load com sistema de resumo inteligente
- **Evolução:** Separação em `/compact`, `/load` e `/load-all-machines` para máximo controle
- **Baseado em:** Comportamento do Claude Code CLI
- **Data da análise:** 2025-01-05
- **Última atualização:** 2025-01-05 (abordagem final com 3 comandos distintos)
