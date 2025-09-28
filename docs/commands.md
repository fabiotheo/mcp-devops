# MCP Terminal Assistant - Enhanced Commands Documentation

## Overview
Este documento detalha as melhorias de comandos e atalhos de teclado para o MCP Terminal Assistant, trazendo uma experiência similar ao Claude Code.

## Atalhos de Teclado

### Comandos Básicos
| Atalho | Ação | Descrição |
|--------|------|-----------|
| `ESC` | Cancelar | Cancela o input atual ou operação em andamento |
| `Ctrl+C` | Interromper | Force quit da aplicação |
| `Ctrl+D` | EOF | Finaliza input multi-linha |
| `Ctrl+L` | Limpar Tela | Limpa o terminal mantendo contexto |
| `Ctrl+U` | Limpar Linha | Apaga toda a linha atual |
| `Ctrl+K` | Apagar até Fim | Apaga do cursor até o fim da linha |
| `Ctrl+W` | Apagar Palavra | Apaga palavra anterior |

### Navegação
| Atalho | Ação | Descrição |
|--------|------|-----------|
| `↑` / `↓` | Histórico | Navega pelo histórico de comandos |
| `Ctrl+A` | Início da Linha | Move cursor para início |
| `Ctrl+E` | Fim da Linha | Move cursor para o fim |
| `Ctrl+←` / `Ctrl+→` | Pular Palavra | Navega palavra por palavra |
| `Tab` | Autocomplete | Completa comandos e sugestões |

### Multi-linha
| Atalho | Ação | Descrição |
|--------|------|-----------|
| `Shift+Enter` | Nova Linha | Adiciona linha sem executar |
| `"""` | Bloco Multi-linha | Inicia/termina bloco de texto |
| `\` no fim | Continuação | Continua comando na próxima linha |

## Histórico Persistente

### Características
- **Arquivo**: `~/.mcp-terminal/history.json`
- **Limite**: 1000 comandos
- **Deduplicação**: Automática
- **Sincronização**: Entre sessões

### Configuração
```json
{
  "history": {
    "enabled": true,
    "maxEntries": 1000,
    "deduplicate": true,
    "syncBetweenSessions": true
  }
}
```

## Exemplos de Uso

### Cancelamento com ESC
```bash
mcp> quantos arquivos tem no sis[ESC]
# Limpa o input atual
mcp>
```

### Multi-linha com """
```bash
mcp> """
... Escreva um script Python que
... faça backup dos logs do sistema
... e comprima em um arquivo tar.gz
... """
```

### Histórico entre Sessões
```bash
# Sessão 1
mcp> quantos IPs bloqueados no fail2ban?
# [fecha terminal]

# Sessão 2
mcp> [↑] # Mostra: quantos IPs bloqueados no fail2ban?
```

## Configurações Avançadas

### Customização de Keybindings
Edite `~/.mcp-terminal/config.json`:
```json
{
  "keybindings": {
    "cancel": "escape",
    "clearLine": "ctrl+u",
    "clearScreen": "ctrl+l",
    "multiline": "shift+enter"
  }
}
```

## Comparação com Claude Code

| Feature | Claude Code | MCP Terminal | Status |
|---------|------------|--------------|--------|
| ESC para cancelar | ✅ | ⏳ | Planejado |
| Histórico persistente | ✅ | ⏳ | Planejado |
| Multi-linha com Shift+Enter | ✅ | ⏳ | Planejado |
| Autocomplete | ✅ | ✅ | Implementado |
| Syntax highlighting | ✅ | ⚠️ | Parcial |
| Markdown rendering | ✅ | ✅ | Implementado |

## Troubleshooting

### Problema: ESC não funciona
**Solução**: Verifique se o terminal suporta raw mode:
```bash
stty -a | grep -i raw
```

### Problema: Histórico não salva
**Solução**: Verifique permissões:
```bash
ls -la ~/.mcp-terminal/
chmod 755 ~/.mcp-terminal
```

### Problema: Atalhos conflitam com terminal
**Solução**: Configure o terminal para passar atalhos:
- iTerm2: Preferences → Keys → "Send Escape Sequence"
- GNOME Terminal: Edit → Preferences → Shortcuts

## Plano de Implementação

### FASE 1: Preparação
1. **Backup do código atual**
   - Criar branch `feature/enhanced-commands`
   - Documentar comportamento atual

2. **Criar estrutura de arquivos**
   - `libs/keybinding-manager.js` - Gerenciador de teclas
   - `libs/persistent-history.ts` - Histórico persistente
   - `libs/multiline-input.ts` - Input multi-linha

### FASE 2: Implementação Core

#### 2.1 KeybindingManager
```javascript
// Prioridade: ALTA
- [ ] ESC para cancelar input
- [ ] Ctrl+U para limpar linha
- [ ] Ctrl+L para limpar tela
- [ ] Ctrl+K para apagar até o fim
- [ ] Ctrl+A/E para início/fim da linha
```

#### 2.2 PersistentHistory
```javascript
// Prioridade: ALTA
- [ ] Carregar histórico na inicialização
- [ ] Salvar cada comando executado
- [ ] Deduplicação automática
- [ ] Limite de 1000 entradas
- [ ] Sincronização entre sessões
```

#### 2.3 MultilineInput
```javascript
// Prioridade: MÉDIA
- [ ] Detectar necessidade de multi-linha
- [ ] Shift+Enter para nova linha
- [ ] Visual indicator "..."
- [ ] Suporte a """ para blocos
```

### FASE 3: Integração

#### Modificações em mcp-interactive.js:
1. **REPLInterface.initialize()**
   - Adicionar keybinding manager
   - Configurar raw mode quando necessário

2. **MCPInteractive.initialize()**
   - Carregar histórico persistente
   - Configurar auto-save do histórico

3. **processInput()**
   - Detectar modo multi-linha
   - Processar buffer acumulado

4. **Novo método: handleKeypress()**
   - Centralizar tratamento de teclas
   - Implementar cancelamento com ESC

### FASE 4: Testing & Polish

#### Testes Essenciais:
- [ ] ESC cancela input corretamente
- [ ] Histórico persiste entre sessões
- [ ] Multi-linha funciona com """
- [ ] Atalhos não conflitam
- [ ] Performance não degradada

#### Melhorias UX:
- [ ] Feedback visual para modo multi-linha
- [ ] Indicador de comando sendo processado
- [ ] Help atualizado com novos atalhos

### Ordem de Implementação Recomendada:
1. Histórico Persistente (mais valor imediato)
2. Keybindings básicos (ESC, Ctrl+U)
3. Multi-linha melhorado
4. Keybindings avançados
5. Polish e documentação

## Arquitetura Técnica

### Sistema de Keybindings
```javascript
class KeybindingManager {
    constructor(rl) {
        this.rl = rl;
        this.setupKeybindings();
    }

    setupKeybindings() {
        // ESC - Cancelar input
        process.stdin.on('keypress', (str, key) => {
            if (key.name === 'escape') {
                this.handleEscape();
            }
            if (key.ctrl && key.name === 'u') {
                this.clearLine();
            }
            if (key.ctrl && key.name === 'l') {
                this.clearScreen();
            }
        });
    }
}
```

### Histórico Persistente
```javascript
class PersistentHistory {
    constructor(historyFile) {
        this.historyFile = '~/.mcp-terminal/history.json';
        this.maxEntries = 1000;
        this.history = [];
    }

    async load() {
        // Carregar histórico do arquivo
        // Mesclar com histórico da sessão
    }

    async save(command) {
        // Adicionar ao histórico
        // Remover duplicatas
        // Limitar tamanho
        // Salvar em arquivo
    }
}
```

### Multi-line Input System
```javascript
class MultilineInput {
    constructor() {
        this.mode = 'single';
        this.buffer = [];
        this.continuationPrompt = '... ';
    }

    detectMultiLine(input) {
        // Detectar se precisa continuar
        return input.endsWith('\\') ||
               input.includes('"""') ||
               this.hasOpenBrackets(input);
    }
}
```

## Roadmap Futuro

- [ ] Syntax highlighting para código
- [ ] Snippets customizáveis
- [ ] Undo/Redo com Ctrl+Z/Y
- [ ] Search no histórico com Ctrl+R
- [ ] Export de sessão para Markdown

## Licença
MIT © 2024 IPCOM

---
*Última atualização: 2024*
