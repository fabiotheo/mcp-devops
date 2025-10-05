# Implementação de Slash Commands no ipcom-chat

## Objetivo
Quando o usuário digitar "/" no ipcom-chat, exibir uma lista de comandos disponíveis com navegação por setas (↑/↓) e breve descrição de cada comando, similar ao Claude Code CLI.

## Solução Recomendada

### 1. Usar ink-ui Components

Instalar a biblioteca `ink-ui` que já possui componentes prontos:

```bash
npm install ink-ui
# ou
pnpm add ink-ui
```

### 2. Componentes Necessários

**TextInput**: Para capturar a entrada do usuário e detectar "/"
**Select**: Para mostrar a lista de comandos com navegação por setas

### 3. Implementação

#### 3.1 Estrutura de Dados dos Comandos

```typescript
interface Command {
  label: string;      // Nome do comando exibido
  value: string;      // Valor do comando (ex: /help)
  description: string; // Breve descrição
}

const availableCommands: Command[] = [
  {
    label: '/help',
    value: 'help',
    description: 'Mostra ajuda sobre comandos disponíveis'
  },
  {
    label: '/clear',
    value: 'clear',
    description: 'Limpa o histórico da conversa'
  },
  {
    label: '/history',
    value: 'history',
    description: 'Mostra histórico de conversas'
  },
  // ... outros comandos
];
```

#### 3.2 Lógica de Detecção do "/"

```typescript
import { TextInput, Select } from 'ink-ui';
import { useState, useEffect } from 'react';

function ChatInput() {
  const [inputValue, setInputValue] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<string | undefined>();

  // Detecta quando usuário digita "/"
  useEffect(() => {
    if (inputValue === '/') {
      setShowCommands(true);
    } else if (!inputValue.startsWith('/') || inputValue.includes(' ')) {
      setShowCommands(false);
    }
  }, [inputValue]);

  return (
    <Box flexDirection="column" gap={1}>
      {/* Input principal */}
      {!showCommands && (
        <TextInput
          placeholder="Digite sua mensagem ou / para comandos..."
          onChange={setInputValue}
          value={inputValue}
        />
      )}

      {/* Lista de comandos quando "/" é digitado */}
      {showCommands && (
        <>
          <Text>Selecione um comando:</Text>
          <Select
            options={availableCommands.map(cmd => ({
              label: `${cmd.label} - ${cmd.description}`,
              value: cmd.value
            }))}
            onChange={(value) => {
              setSelectedCommand(value);
              setShowCommands(false);
              // Executar o comando selecionado
              executeCommand(value);
            }}
          />
        </>
      )}
    </Box>
  );
}
```

#### 3.3 Navegação por Setas

O componente `Select` do ink-ui já implementa automaticamente:
- **↑ (seta para cima)**: Move para o comando anterior
- **↓ (seta para baixo)**: Move para o próximo comando
- **Enter**: Seleciona o comando atual
- **Esc**: Cancela a seleção (pode ser adicionado)

Código fonte do hook `useSelect` (ink-ui):

```typescript
export const useSelect = ({isDisabled = false, state}: UseSelectProps) => {
  useInput(
    (_input, key) => {
      if (key.downArrow) {
        state.focusNextOption();  // Próximo comando
      }

      if (key.upArrow) {
        state.focusPreviousOption();  // Comando anterior
      }

      if (key.return) {
        state.selectFocusedOption();  // Seleciona comando
      }
    },
    {isActive: !isDisabled},
  );
};
```

### 4. Autocomplete com Filtragem (Opcional)

Para uma experiência ainda melhor, pode-se filtrar os comandos enquanto o usuário digita:

```typescript
const [filterText, setFilterText] = useState('');

const filteredCommands = useMemo(() => {
  return availableCommands.filter(cmd =>
    cmd.label.toLowerCase().includes(filterText.toLowerCase())
  );
}, [filterText]);

// No componente
<TextInput onChange={setFilterText} />
<Select
  highlightText={filterText}  // Destaca o texto filtrado
  options={filteredCommands}
  onChange={executeCommand}
/>
```

### 5. Exemplo Completo de Implementação

```typescript
import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text } from 'ink';
import { TextInput, Select } from 'ink-ui';

interface Command {
  label: string;
  value: string;
  description: string;
}

const COMMANDS: Command[] = [
  { label: '/help', value: 'help', description: 'Mostra ajuda' },
  { label: '/clear', value: 'clear', description: 'Limpa histórico' },
  { label: '/history', value: 'history', description: 'Mostra histórico' },
  { label: '/exit', value: 'exit', description: 'Sai do programa' },
];

export function CommandInput() {
  const [inputValue, setInputValue] = useState('');
  const [showCommands, setShowCommands] = useState(false);

  const filteredCommands = useMemo(() => {
    if (!inputValue.startsWith('/')) return COMMANDS;

    const filter = inputValue.slice(1); // Remove o "/"
    return COMMANDS.filter(cmd =>
      cmd.label.toLowerCase().includes(filter.toLowerCase())
    );
  }, [inputValue]);

  useEffect(() => {
    if (inputValue === '/') {
      setShowCommands(true);
    } else if (inputValue === '' || !inputValue.startsWith('/')) {
      setShowCommands(false);
    }
  }, [inputValue]);

  const handleCommandSelect = (value: string) => {
    setShowCommands(false);
    setInputValue('');

    // Executar o comando
    switch (value) {
      case 'help':
        // Mostrar ajuda
        break;
      case 'clear':
        // Limpar histórico
        break;
      case 'history':
        // Mostrar histórico
        break;
      case 'exit':
        // Sair
        process.exit(0);
        break;
    }
  };

  return (
    <Box flexDirection="column" gap={1}>
      {!showCommands && (
        <Box>
          <Text color="cyan">➜ </Text>
          <TextInput
            placeholder="Digite / para ver comandos"
            value={inputValue}
            onChange={setInputValue}
          />
        </Box>
      )}

      {showCommands && (
        <Box flexDirection="column">
          <Text color="yellow">📋 Comandos disponíveis:</Text>
          <Select
            defaultLimit={5}  // Mostra até 5 comandos por vez
            highlightText={inputValue.slice(1)}
            options={filteredCommands.map(cmd => ({
              label: `${cmd.label.padEnd(12)} ${cmd.description}`,
              value: cmd.value
            }))}
            onChange={handleCommandSelect}
          />
          <Text dimColor>Use ↑/↓ para navegar, Enter para selecionar, Esc para cancelar</Text>
        </Box>
      )}
    </Box>
  );
}
```

## Recursos Adicionais

### Componentes ink-ui Utilizados

1. **Select**:
   - Navegação automática com setas
   - Suporte a highlight de texto
   - Limite de itens visíveis (`defaultLimit`)
   - Callbacks de onChange

2. **TextInput**:
   - Captura de entrada do usuário
   - Placeholder
   - onChange callback
   - Suporte a suggestions (autocomplete)

### Referências

- [ink-ui no GitHub](https://github.com/vadimdemedes/ink-ui)
- [Documentação Select](https://github.com/vadimdemedes/ink-ui/blob/master/docs/select.md)
- [Documentação TextInput](https://github.com/vadimdemedes/ink-ui/blob/master/docs/text-input.md)
- [Exemplo de Autocomplete](https://github.com/vadimdemedes/ink-ui/blob/master/examples/autocomplete.tsx)

## Padrões Encontrados em Outros CLIs

### Detecção de "/"

```typescript
// Padrão 1: Detecção exata
if (inputValue === '/') {
  setShowCommands(true);
}

// Padrão 2: Detecção com filtragem
if (inputValue.startsWith('/')) {
  const filter = inputValue.slice(1);
  setFilteredCommands(commands.filter(c => c.label.includes(filter)));
  setShowCommands(true);
}

// Padrão 3: Esconder quando não é mais comando
if (!inputValue.startsWith('/') || inputValue.includes(' ')) {
  setShowCommands(false);
}
```

### Navegação por Teclado

Todos os exemplos analisados usam o hook `useInput` do Ink:

```typescript
import { useInput } from 'ink';

useInput((input, key) => {
  if (key.downArrow) {
    // Próximo item
  }
  if (key.upArrow) {
    // Item anterior
  }
  if (key.return) {
    // Selecionar item
  }
  if (key.escape) {
    // Cancelar
  }
});
```

## Próximos Passos

1. Instalar `ink-ui`: `pnpm add ink-ui`
2. Criar arquivo `src/components/CommandInput.tsx` com a implementação
3. Definir lista de comandos disponíveis
4. Integrar com o sistema atual do ipcom-chat
5. Testar navegação por setas
6. Adicionar mais comandos conforme necessário

## Benefícios da Solução

✅ Usa componentes testados e mantidos (ink-ui)
✅ Navegação por setas funcionando automaticamente
✅ Fácil de estender com novos comandos
✅ UX similar ao Claude Code CLI
✅ Suporte a filtragem/autocomplete
✅ Código limpo e manutenível
