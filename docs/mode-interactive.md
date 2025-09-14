# MCP Terminal Assistant - Modo Interativo

## Visão Geral

Implementação de um modo conversacional interativo para o MCP Terminal Assistant, similar ao Claude Code, permitindo conversas contínuas com manutenção de contexto.

## Objetivos

- Criar experiência conversacional com prompt permanente (mcp>)
- Manter contexto entre perguntas
- Permitir comandos especiais e sessões persistentes
- Integração suave com terminal

## Arquitetura

### Abordagem Escolhida

**Novo arquivo dedicado (mcp-interactive.js)** com compartilhamento inteligente de código existente.

### Componentes Principais

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Interactive                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐     ┌──────────────┐                 │
│  │ REPLInterface│────>│   Command    │                 │
│  │              │     │  Processor   │                 │
│  └──────────────┘     └──────────────┘                 │
│         │                     │                         │
│         v                     v                         │
│  ┌──────────────┐     ┌──────────────┐                 │
│  │   Context    │<────│   Session    │                 │
│  │   Manager    │     │ Persistence  │                 │
│  └──────────────┘     └──────────────┘                 │
│         │                                               │
│         v                                               │
│  ┌──────────────────────────────────┐                 │
│  │        AI Model (via Factory)     │                 │
│  └──────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

```
Input → REPLInterface → CommandProcessor → ContextManager → AI Model → Output
                               ↓
                      SessionPersistence (auto-save)
```

## Implementação Detalhada

### 1. Arquivo Principal (mcp-interactive.js)

```javascript
class MCPInteractive extends EventEmitter {
    constructor(config) {
        // Inicializa componentes
        this.contextManager = new ContextManager();
        this.sessionPersistence = new SessionPersistence();
        this.commandProcessor = new CommandProcessor();
        this.replInterface = new REPLInterface();
    }

    async start() {
        // Inicia loop REPL
        this.showWelcome();
        this.replInterface.on('line', this.processInput.bind(this));
    }

    async processInput(input) {
        if (input.startsWith('/')) {
            return this.commandProcessor.execute(input);
        }
        return this.handleQuestion(input);
    }

    async handleQuestion(question) {
        // Adiciona ao contexto
        this.contextManager.addMessage('user', question);

        // Obtém resposta da IA com contexto
        const context = this.contextManager.getContext();
        const response = await this.aiModel.ask(question, context);

        // Adiciona resposta ao contexto
        this.contextManager.addMessage('assistant', response);

        return response;
    }
}
```

### 2. Gerenciamento de Contexto

```javascript
class ContextManager {
    constructor(maxTokens = 100000) {
        this.messages = [];
        this.maxTokens = maxTokens;
        this.summary = null;
    }

    addMessage(role, content) {
        this.messages.push({
            role,
            content,
            timestamp: new Date()
        });
        this.optimizeIfNeeded();
    }

    getContext(format = 'array') {
        // Retorna contexto otimizado
        if (this.summary) {
            return [this.summary, ...this.messages.slice(-10)];
        }
        return this.messages;
    }

    optimizeIfNeeded() {
        const tokenCount = this.getTokenCount();
        if (tokenCount > this.maxTokens * 0.8) {
            this.summarizeOldMessages();
        }
    }

    summarizeOldMessages() {
        // Mantém últimas N mensagens + cria summary das antigas
        const toSummarize = this.messages.slice(0, -20);
        this.summary = this.createSummary(toSummarize);
        this.messages = this.messages.slice(-20);
    }
}
```

### 3. Processador de Comandos

```javascript
class CommandProcessor {
    constructor(mcpInteractive) {
        this.mcp = mcpInteractive;
        this.commands = {
            '/help': this.showHelp,
            '/clear': this.clearScreen,
            '/reset': this.resetContext,
            '/save': this.saveSession,
            '/load': this.loadSession,
            '/model': this.changeModel,
            '/exec': this.executeCommand,
            '/history': this.showHistory,
            '/exit': this.exit,
            '/quit': this.exit
        };
    }

    async execute(input) {
        const [command, ...args] = input.split(' ');
        const handler = this.commands[command];

        if (!handler) {
            return `Comando desconhecido: ${command}. Digite /help para ajuda.`;
        }

        return handler.call(this, args.join(' '));
    }
}
```

### 4. Interface REPL

```javascript
class REPLInterface {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'mcp> ',
            completer: this.autoComplete.bind(this)
        });

        this.multilineBuffer = '';
        this.inMultiline = false;
    }

    autoComplete(line) {
        const completions = [
            '/help', '/clear', '/reset', '/save', '/load',
            '/model', '/exec', '/history', '/exit'
        ];
        const hits = completions.filter((c) => c.startsWith(line));
        return [hits.length ? hits : completions, line];
    }

    handleMultiline(line) {
        if (line === '"""') {
            if (this.inMultiline) {
                // Fim do multi-linha
                const result = this.multilineBuffer;
                this.multilineBuffer = '';
                this.inMultiline = false;
                return result;
            } else {
                // Início do multi-linha
                this.inMultiline = true;
                this.rl.setPrompt('... ');
                return null;
            }
        }

        if (this.inMultiline) {
            this.multilineBuffer += line + '\n';
            return null;
        }

        return line;
    }
}
```

### 5. Persistência de Sessões

```javascript
class SessionPersistence {
    constructor(sessionDir = '~/.mcp-terminal/sessions') {
        this.sessionDir = path.expand(sessionDir);
        this.ensureDir();
        this.autoSaveTimer = null;
    }

    async save(sessionName, context) {
        const filePath = path.join(this.sessionDir, `${sessionName}.json`);
        const data = {
            version: '1.0',
            timestamp: new Date(),
            context: context,
            metadata: {
                model: this.getCurrentModel(),
                messageCount: context.length
            }
        };
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    async load(sessionName) {
        const filePath = path.join(this.sessionDir, `${sessionName}.json`);
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
        return data.context;
    }

    enableAutoSave(sessionName, interval = 300000) {
        this.autoSaveTimer = setInterval(() => {
            this.save(sessionName, this.mcp.contextManager.getContext());
        }, interval);
    }
}
```

## Comandos Especiais

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/help` | Mostra ajuda | `/help` |
| `/clear` | Limpa tela (mantém contexto) | `/clear` |
| `/reset` | Reinicia contexto | `/reset` |
| `/save [nome]` | Salva sessão | `/save projeto-debug` |
| `/load [nome]` | Carrega sessão | `/load projeto-debug` |
| `/model` | Troca modelo de IA | `/model claude-opus-4-1` |
| `/exec` | Executa último comando sugerido | `/exec` |
| `/history` | Mostra histórico da sessão | `/history` |
| `/exit` ou `/quit` | Sai do modo interativo | `/exit` |

## Configuração

Adicionar ao `~/.mcp-terminal/config.json`:

```json
{
  "interactive": {
    "max_context_tokens": 100000,
    "auto_save_interval": 300000,
    "prompt_style": "minimal",
    "multiline_trigger": "\"\"\"",
    "command_prefix": "/",
    "theme": "default",
    "enable_autocomplete": true,
    "history_size": 1000
  }
}
```

## Uso

### Iniciar Modo Interativo

```bash
# Comando principal
mcp-chat

# Alternativas
ask --interactive
mcp

# Com sessão nomeada
mcp-chat --session projeto-x

# Retomar sessão
mcp-chat --resume projeto-x

# Com modelo específico
mcp-chat --model claude-opus-4-1
```

### Exemplo de Sessão

```
╔════════════════════════════════════════════╗
║     MCP Terminal Assistant v1.0.8          ║
║         Modo Interativo Ativado            ║
╚════════════════════════════════════════════╝

Sistema: Debian 10, 8GB RAM, Docker, Nginx
Modelo: Claude Sonnet 4

Digite /help para comandos, /exit para sair

mcp> como verificar portas abertas?

Para verificar portas abertas, você pode usar:

1. `ss -tuln` - Mostra todas as portas TCP/UDP em escuta
2. `netstat -tuln` - Alternativa ao ss
3. `lsof -i -P -n` - Mostra processos usando portas

mcp> /exec ss -tuln | head -5

Executando: ss -tuln | head -5

Netid  State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port
udp    UNCONN  0       0        127.0.0.53:53        0.0.0.0:*
tcp    LISTEN  0       128      0.0.0.0:22           0.0.0.0:*
tcp    LISTEN  0       128      127.0.0.1:631        0.0.0.0:*

mcp> qual processo está na porta 22?

Para verificar qual processo está usando a porta 22:

`sudo lsof -i :22` ou `sudo ss -tlnp | grep :22`

mcp> /save session-networking

Sessão salva como 'session-networking'

mcp> /exit

Até logo! Sessão salva automaticamente.
```

## Fases de Implementação

### Fase 1: MVP Básico
- [x] Estrutura base e REPL funcionando
- [x] Integração com ModelFactory
- [x] Context Manager básico

### Fase 2: Comandos e Persistência
- [ ] CommandProcessor completo
- [ ] SessionPersistence
- [ ] Auto-save

### Fase 3: Features Avançadas
- [ ] Auto-complete
- [ ] Multi-linha
- [ ] Otimizações de contexto

## Métricas de Sucesso

- **Performance**
  - Latência < 100ms para comandos locais
  - Memória < 100MB para sessões de 1 hora

- **Confiabilidade**
  - 0 crashes em sessões de 24 horas
  - Recovery automático de sessões corrompidas

- **Usabilidade**
  - Taxa de satisfação > 90%
  - Curva de aprendizado < 5 minutos

## Tratamento de Erros

| Erro | Tratamento |
|------|------------|
| Timeout de API | Retry com exponential backoff |
| Contexto muito longo | Auto-summarização |
| Sessão corrompida | Fallback para nova sessão |
| Comando inválido | Sugestão de correção |
| Crash inesperado | Auto-save e recovery |

## Testes

```bash
# Testes unitários
npm test -- --grep "interactive"

# Testes de integração
npm run test:interactive

# Testes de performance
npm run test:perf:interactive
```

## Próximos Passos

1. **Criar branch**: `git checkout -b feature/interactive-mode`
2. **Implementar MVP**: Começar com mcp-interactive.js básico
3. **Testes unitários**: Cobertura mínima de 80%
4. **Documentação**: Atualizar README.md
5. **Beta testing**: Liberar para grupo de teste

## Notas de Implementação

- Usar EventEmitter para comunicação entre componentes
- Implementar graceful shutdown (Ctrl+C)
- Adicionar logging estruturado
- Considerar WebSocket para futuro modo web
- Preparar para internacionalização (i18n)

## Referências

- [Node.js Readline](https://nodejs.org/api/readline.html)
- [REPL Design Patterns](https://nodejs.org/api/repl.html)
- [Token Counting](https://github.com/openai/tiktoken)
- [Claude API Context](https://docs.anthropic.com/claude/docs/context-windows)