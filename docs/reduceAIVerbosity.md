# Plano de Redução de Verbosidade da IA

## Análise do Problema

### Comportamento Atual
A IA está gerando meta-observações desnecessárias sobre o comportamento do usuário:
- "Observação interessante: o usuário começou com 'eu' ao invés de 'Eu'"
- "Mudança de padrão detectada: pergunta mais concisa que o usual"
- "Padrão interessante: você mudou de 'vc' para 'você'"

### Causa Raiz Identificada
O contexto completo do histórico está sendo enviado para a IA em dois locais principais:

1. **mcp-ink-cli.mjs** (linhas 686-696 e 774-777):
   - Envia `fullHistory` com últimas 20 mensagens
   - Inclui todas mensagens de usuário e assistente

2. **ai_orchestrator.ts** (linhas 216-228):
   - Adiciona contexto de conversa anterior em prompts
   - Formata mensagens como "Usuário disse:" e "Assistente respondeu:"

3. **claude_model.ts** (linhas 103-123 e 149-155):
   - Processa todo histórico de mensagens
   - System prompt menciona histórico e mensagens canceladas

## Plano de Alteração

### Fase 1: Ajustes no System Prompt (Rápido)

**Arquivo:** `src/ai_models/claude_model.ts`
**Linhas:** 149-155

**Alteração:**
```javascript
// ANTES:
system: `Você é um assistente Linux especializado. Responda de forma concisa e precisa.

IMPORTANTE - HISTÓRICO E MENSAGENS CANCELADAS:
- Você tem acesso ao HISTÓRICO COMPLETO da conversa
- Mensagens marcadas com "[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]" indicam que o usuário cancelou o processamento, mas A MENSAGEM DO USUÁRIO AINDA EXISTE E DEVE SER CONSIDERADA
- Quando o usuário perguntar "o que eu escrevi antes?" ou "qual foi minha pergunta anterior?", você DEVE mencionar TODAS as mensagens anteriores, incluindo as que foram canceladas
- Trate mensagens canceladas como parte normal do histórico - elas foram escritas pelo usuário e devem ser reconhecidas`

// DEPOIS:
system: `Você é um assistente Linux especializado. Responda de forma concisa e precisa.

REGRAS IMPORTANTES:
- Foque APENAS em responder a pergunta atual
- NÃO faça observações sobre padrões de escrita, gramática ou mudanças de comportamento do usuário
- NÃO comente sobre diferenças entre mensagens anteriores e atuais
- Use o histórico APENAS quando explicitamente perguntado sobre mensagens anteriores
- Seja direto e objetivo nas respostas`
```

### Fase 2: Controle de Contexto (Médio)

**Arquivo:** `src/mcp-ink-cli.mjs`
**Linhas:** 686-696 e 774-777

**Alteração:**
Adicionar flag para controlar quando enviar histórico:

```javascript
// Detectar se a pergunta requer histórico
const needsHistory = command.toLowerCase().includes('anterior') ||
                     command.toLowerCase().includes('disse') ||
                     command.toLowerCase().includes('escrevi') ||
                     command.toLowerCase().includes('pergunt');

// Enviar histórico apenas quando necessário
const formattedHistory = needsHistory && fullHistory.length > 0
    ? fullHistory.slice(-20)  // Last 20 messages
    : [];  // Sem histórico para perguntas normais
```

### Fase 3: Filtro de Meta-Observações (Avançado)

**Arquivo:** `src/ai_models/claude_model.ts`
**Após linha 159:**

**Adicionar filtro de resposta:**
```javascript
// Filtrar meta-observações da resposta
const filterMetaObservations = (text) => {
    // Padrões de meta-observações a remover
    const metaPatterns = [
        /Observação interessante:[^.]+\./gi,
        /Mudança de padrão detectada:[^.]+\./gi,
        /Padrão interessante:[^.]+\./gi,
        /Notei que você[^.]+\./gi,
        /É interessante notar[^.]+\./gi,
        /Percebo que[^.]+\./gi
    ];

    let filtered = text;
    metaPatterns.forEach(pattern => {
        filtered = filtered.replace(pattern, '');
    });

    // Limpar espaços extras
    return filtered.replace(/\s+/g, ' ').trim();
};

// Aplicar filtro antes de retornar
return filterMetaObservations(response.content[0].text);
```

### Fase 4: Configuração Opcional (Futuro)

**Arquivo:** `~/.mcp-terminal/config.json`

**Adicionar opções:**
```json
{
    "ai_behavior": {
        "include_history": "smart",  // "always", "never", "smart"
        "meta_observations": false,   // true/false
        "verbosity_level": "concise"  // "verbose", "normal", "concise"
    }
}
```

## Ordem de Implementação Recomendada

1. **Imediato:** Fase 1 - Ajuste do system prompt
   - Impacto: Alto
   - Risco: Baixo
   - Tempo: 5 minutos

2. **Próximo:** Fase 2 - Controle de contexto
   - Impacto: Médio
   - Risco: Médio (pode afetar perguntas sobre histórico)
   - Tempo: 15 minutos

3. **Opcional:** Fase 3 - Filtro de meta-observações
   - Impacto: Alto
   - Risco: Médio (pode remover informações úteis)
   - Tempo: 20 minutos

4. **Futuro:** Fase 4 - Configuração
   - Impacto: Baixo
   - Risco: Baixo
   - Tempo: 30 minutos

## Testes Necessários

### Casos de Teste

1. **Pergunta normal:**
   - Input: "como ver logs do sistema?"
   - Esperado: Resposta direta sem observações

2. **Pergunta sobre histórico:**
   - Input: "o que eu perguntei antes?"
   - Esperado: Mostrar mensagens anteriores

3. **Múltiplas interações:**
   - Fazer 5 perguntas seguidas
   - Verificar se não aparecem meta-observações

### Métricas de Sucesso

- ✅ Zero meta-observações em respostas normais
- ✅ Histórico funciona quando explicitamente solicitado
- ✅ Respostas mais concisas e diretas
- ✅ Sem perda de funcionalidade

## Riscos e Mitigações

### Riscos
1. **Perda de contexto importante:** IA pode não entender referências implícitas
2. **Filtro muito agressivo:** Pode remover informações úteis
3. **Quebra de funcionalidade:** Perguntas sobre histórico podem parar de funcionar

### Mitigações
1. **Detecção inteligente:** Usar palavras-chave para identificar quando histórico é necessário
2. **Filtro configurável:** Permitir desabilitar filtro se necessário
3. **Testes extensivos:** Testar todos cenários antes de deploy

## Conclusão

O plano foca em reduzir verbosidade sem perder funcionalidade. A implementação em fases permite validar cada mudança incrementalmente. A Fase 1 sozinha já deve resolver a maior parte do problema com risco mínimo.
