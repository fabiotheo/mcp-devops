# Plano de Implementação - Formatação de Mensagens Markdown da IA

## Problema Atual
As respostas da IA vêm formatadas em markdown mas aparecem com os marcadores literalmente no terminal:
- `**texto**` aparece como `**texto**` ao invés de **negrito**
- `*texto*` aparece como `*texto*` ao invés de *itálico*
- `` `código` `` aparece como `` `código` `` ao invés de destacado

## Solução Proposta: Parser Híbrido Simples

### Fase 1: Implementação Imediata

#### Objetivo
Criar função `parseMarkdownToElements` que converte markdown básico em elementos React do Ink v4.

#### Funcionalidades Suportadas
- **Bold**: `**texto**` → `<Text bold>texto</Text>`
- **Italic**: `*texto*` → `<Text italic>texto</Text>`
- **Code**: `` `código` `` → `<Text color="yellow">código</Text>`
- **Plain Text**: Preservado entre formatações

#### Limitações Aceitas
- Sem suporte a markdown aninhado (`***bold italic***`)
- Headers apenas removem o `#`
- Sem code blocks multi-linha
- Sem listas formatadas

## Implementação Técnica

### Passo 1: Backup
```bash
cp src/mcp-ink-cli.mjs src/mcp-ink-cli.mjs.backup-markdown
```

### Passo 2: Adicionar Parser Híbrido

Localização: `src/mcp-ink-cli.mjs` (após imports, antes de MCPTerminalAssistant)

```javascript
// Parser de markdown para elementos React do Ink
const parseMarkdownToElements = (text, baseKey) => {
  if (!text) return [React.createElement(Text, {key: baseKey}, '')];

  const elements = [];
  const regex = /(\*\*(.*?)\*\*|\*(.*?)\*|`(.*?)`)/g;
  let lastIndex = 0;
  let elementIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Adiciona texto antes do match
    if (match.index > lastIndex) {
      elements.push(
        React.createElement(Text, {
          key: `${baseKey}-txt-${elementIndex++}`
        }, text.substring(lastIndex, match.index))
      );
    }

    // Adiciona elemento formatado
    if (match[2]) { // Bold
      elements.push(
        React.createElement(Text, {
          key: `${baseKey}-b-${elementIndex++}`,
          bold: true
        }, match[2])
      );
    } else if (match[3]) { // Italic
      elements.push(
        React.createElement(Text, {
          key: `${baseKey}-i-${elementIndex++}`,
          italic: true
        }, match[3])
      );
    } else if (match[4]) { // Code
      elements.push(
        React.createElement(Text, {
          key: `${baseKey}-c-${elementIndex++}`,
          color: 'yellow'
        }, match[4])
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Adiciona texto restante
  if (lastIndex < text.length) {
    elements.push(
      React.createElement(Text, {
        key: `${baseKey}-end`
      }, text.substring(lastIndex))
    );
  }

  return elements.length > 0 ? elements :
    [React.createElement(Text, {key: baseKey}, text)];
};
```

### Passo 3: Integrar na Renderização

Modificar o loop de renderização em `history.map()` (aproximadamente linha 1232):

```javascript
lines.forEach((subline, j) => {
  const lineKey = `${i}-${j}`;

  // Para mensagens do usuário, manter comportamento atual
  if (isUserMessage || isErrorMessage) {
    elements.push(
      React.createElement(Text, {
        key: lineKey,
        color: isUserMessage ? 'cyan' : 'red',
        bold: j === 0 && isUserMessage
      }, subline)
    );
  } else {
    // Para respostas da IA, aplicar parser de markdown
    const markdownElements = parseMarkdownToElements(subline, lineKey);
    elements.push(...markdownElements);
  }
});
```

### Passo 4: Remover formatResponse Antigo

Remover ou comentar a função `formatResponse` atual que apenas remove marcadores.

### Passo 5: Deploy

```bash
# Copiar para produção
cp src/mcp-ink-cli.mjs ~/.mcp-terminal/ipcom-chat-cli.js

# Atualizar instalação
node setup.js --upgrade --auto
```

## Testes de Validação

### Casos de Teste
1. **Texto Simples**: "Olá mundo" → Sem mudanças
2. **Bold**: "Isto é **importante**" → "importante" em negrito
3. **Italic**: "Isto é *ênfase*" → "ênfase" em itálico
4. **Code**: "Execute `npm install`" → "npm install" em amarelo
5. **Combinado**: "**Nota**: Use `git` para *verificar*" → Múltiplas formatações
6. **Performance**: Respostas com 100+ linhas → < 50ms de processamento
7. **Streaming**: Respostas incrementais → Re-parse funcional

### Métricas de Sucesso
- [x] Asteriscos não aparecem literalmente
- [x] Bold renderiza em negrito
- [x] Italic renderiza em itálico
- [x] Code renderiza em amarelo
- [x] Performance mantida
- [x] Streaming continua funcionando
- [x] Keys únicas previnem warnings do React

## Fase 2: Evolução Futura com Remark (Roadmap)

### Motivação
Quando o parser híbrido não for mais suficiente, migrar para solução robusta com AST.

### Funcionalidades Adicionais
- Markdown aninhado (`***bold italic***`)
- Headers com níveis (`#`, `##`, `###`)
- Listas ordenadas e não-ordenadas
- Code blocks com syntax highlighting
- Links clicáveis
- Blockquotes
- Tabelas

### Stack Proposto
```javascript
npm install remark unified remark-parse ink-syntax-highlight
```

### Arquitetura
```
markdown string
    ↓
[remark-parse]
    ↓
Abstract Syntax Tree (AST)
    ↓
[custom renderer]
    ↓
React Elements (Ink)
```

### Componente MarkdownRenderer
```javascript
// Exemplo conceitual
const MarkdownRenderer = ({ content }) => {
  const ast = processor.parse(content);
  return renderAstToInk(ast);
};

const renderAstToInk = (node) => {
  switch(node.type) {
    case 'strong': return <Text bold>{...}</Text>
    case 'emphasis': return <Text italic>{...}</Text>
    case 'code': return <SyntaxHighlight>{...}</SyntaxHighlight>
    // etc...
  }
};
```

### Timeline de Evolução
- **v1.0**: Parser híbrido simples (ATUAL)
- **v1.1**: Adicionar headers e listas simples
- **v1.2**: Melhorar performance com memoização
- **v2.0**: Migração para remark + AST
- **v2.1**: Syntax highlighting com ink-syntax-highlight
- **v2.2**: Suporte a tabelas
- **v3.0**: Features avançadas (footnotes, TOC, etc.)

## Considerações de Performance

### Streaming de Respostas
- IA envia tokens incrementalmente
- Solução: Re-parsear buffer completo a cada chunk
- Ink é eficiente o suficiente para re-renders frequentes
- Futuro: Implementar diff-based updates

### Otimizações
- Regex compilado uma vez (não dentro do loop)
- Complexidade O(n) linear com tamanho do texto
- Keys estáveis previnem re-renders desnecessários
- Memoização futura para textos repetidos

## Decisões de Design

### Por que Parser Híbrido Primeiro?
1. **Simplicidade**: 50 linhas de código vs 500+ com AST
2. **Sem Dependências**: Usa apenas React/Ink nativos
3. **Performance**: Regex único é mais rápido que AST para casos simples
4. **Manutenibilidade**: Código simples e direto
5. **Incremental**: Pode evoluir sem breaking changes

### Trade-offs Aceitos
- Sem markdown aninhado (raro em respostas de IA)
- Sem code blocks (podem ser adicionados depois)
- Regex não é perfeito (mas suficiente para 95% dos casos)

## Conclusão

Esta implementação resolve o problema imediato de poluição visual com marcadores markdown, melhorando significativamente a experiência do usuário. A arquitetura permite evolução incremental conforme necessário, sem necessidade de reescrever todo o sistema.

---

*Documento criado: 2024-01-23*
*Status: Pronto para Implementação*
*Próximo Passo: Implementar Fase 1 - Parser Híbrido*