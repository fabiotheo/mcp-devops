# Documentação do Comportamento Atual - mcp-ink-cli.mjs

## Estados Críticos (Não Alterar)

### Estados React com useState
```javascript
const [input, setInput] = useState('');                    // Input atual do usuário
const [history, setHistory] = useState([]);               // Mensagens exibidas na tela
const [commandHistory, setCommandHistory] = useState([]); // Histórico navegável (setas)
const [fullHistory, setFullHistory] = useState([]);       // Contexto completo para IA
const [historyIndex, setHistoryIndex] = useState(-1);     // Índice navegação histórico
const [status, setStatus] = useState('initializing');     // Estado da aplicação
const [isProcessing, setIsProcessing] = useState(false);  // Flag de processamento
const [response, setResponse] = useState('');             // Última resposta da IA
const [error, setError] = useState(null);                 // Erro atual
const [config, setConfig] = useState(null);               // Configuração carregada

// Estados de controle especiais
const [lastCtrlC, setLastCtrlC] = useState(0);            // Timestamp último Ctrl+C
const [lastEsc, setLastEsc] = useState(0);                // Timestamp último ESC
const [isCancelled, setIsCancelled] = useState(false);    // Flag cancelamento
```

### Referências com useRef (Críticas)
```javascript
const currentRequestId = useRef(null);           // ID do request ativo
const currentTursoEntryId = useRef(null);        // ID da entrada Turso atual
const activeRequests = useRef(new Map());        // Map de requests ativos

// Abort Controllers (Sistema de Cancelamento)
const aiAbortControllerRef = useRef(null);       // Cancela chamadas IA
const dbAbortControllerRef = useRef(null);       // Protege operações DB

// Serviços Backend
const orchestrator = useRef(null);               // AI Orchestrator
const patternMatcher = useRef(null);             // Pattern Matcher
const tursoAdapter = useRef(null);               // Turso Adapter
```

## Fluxo de Estados Críticos

### 1. Inicialização (L94-275)
```
status: 'initializing' → 'loading-config' → 'initializing-ai' → 'ready'

Sequência:
1. Carrega configuração (~/.mcp-terminal/config.json ou default)
2. Inicializa AI Model via ModelFactory
3. Cria AI Orchestrator (com ou sem tools)
4. Inicializa Pattern Matcher
5. Inicializa Turso Adapter
6. Carrega histórico (Turso ou arquivo local)
7. status = 'ready'
```

### 2. Processamento de Comando (L560-1010)
```
Estado Inicial → isProcessing=true → Processamento → isProcessing=false
              ↓                    ↓                ↓
         Cria Request         Pattern/AI        Salva Turso
         Salva Turso         Gera Response     Status: completed
         Status: pending     Status: processing
```

### 3. Sistema de Cancelamento (ESC) - CRÍTICO
```
ESC pressionado → setIsCancelled(true) →
activeRequests Map status='cancelled' →
aiAbortController.abort() →
cleanupRequest() →
Turso update status='cancelled' →
fullHistory += CANCELLATION_MARKER →
UI reset (isProcessing=false, status='ready')
```

## Funções Críticas (Preservar Exatamente)

### cleanupRequest() - Linha ~406
**Responsabilidade:** Única função de limpeza de requests. Handle de cancelamento.

**Entradas:**
- `requestId` - ID do request a limpar
- `reason` - Motivo do cleanup
- `clearInput` - Se deve limpar input (default: false)

**Comportamento Crítico:**
1. Marca request como 'cancelled' no Map
2. Aborta APENAS aiAbortController (não DB)
3. Reset UI (isProcessing=false, status='ready')
4. Restaura bracketed paste mode se TTY
5. Adiciona CANCELLATION_MARKER ao fullHistory
6. Atualiza Turso com status 'cancelled'
7. Limpa referências

### processCommand() - Linha ~560
**Responsabilidade:** Processa comando do usuário através do backend.

**Fluxo Crítico:**
1. Gera requestId único
2. Cria AbortControllers (AI e DB separados)
3. Adiciona a activeRequests Map
4. Salva pergunta no Turso (status: 'pending')
5. Verifica cancelamento antes de cada etapa
6. Processa via Pattern Matcher ou AI Orchestrator
7. Salva resposta no Turso (status: 'completed')
8. Limpa request do Map

### Sistema de Histórico
**commandHistory:** Para navegação com setas (filtrado, sem markers)
**fullHistory:** Para contexto IA (completo, com markers de cancelamento)

## Debug System (Preservar)

### Condicionais de Debug
```javascript
const isDebug = process.argv.includes('--debug');

if (isDebug) {
    console.log('[Debug] ...');
    appendFileSync('/tmp/mcp-debug.log', ...);
}
```

### Arquivo de Debug
- Localização: `/tmp/mcp-debug.log`
- Inicializado no useEffect de inicialização
- Contém: respostas brutas da IA, inputs, estados

## Sistema de Input (TTY) - Linha ~1158

### Eventos Críticos
```javascript
// Paste Detection (SIMPLES - char.length > 1)
if (char && (char.length > 1 || char.includes('\n'))) {
    // Limpa markers bracketed paste
    // Converte \r → \n
    // Atualiza input
}

// ESC Key (Cancelamento)
if (key.escape) {
    if (timeSinceLastEsc < 500) {
        // Double ESC - clear input
        setInput('');
    } else if (isProcessing) {
        // Single ESC - cancel operation
        // Chama cleanupRequest()
    }
}

// Ctrl+C (Double-tap to exit)
if (key.ctrl && char === 'c') {
    if (now - lastCtrlC < 2000) {
        // Double Ctrl+C - exit
        exit();
    } else {
        // Single Ctrl+C - show warning
        setResponse('Press Ctrl+C again to exit');
    }
}
```

### Navegação Histórico
```javascript
// Up Arrow - navegar para trás no histórico
if (key.upArrow) {
    // Filtra markers ESC do commandHistory
    const navigableHistory = commandHistory.filter(cmd =>
        !cmd.includes('[User pressed ESC') &&
        !cmd.includes('Previous message was interrupted')
    );
    // Navega no histórico filtrado
}
```

## Integrações Externas

### Turso Adapter
- **Método:** `addToHistory(command, response)`
- **Método:** `saveQuestionWithStatusAndRequestId(command, status, requestId)`
- **Método:** `updateStatusByRequestId(requestId, status)`
- **Estados:** 'pending' → 'processing' → 'completed' | 'cancelled' | 'error'

### AI Orchestrator
- **Método:** `askCommand(command, options)`
- **Options:** `{ history, verbose, patternInfo, signal }`
- **Retorno:** `{ response, success, error }` ou string direta

### Pattern Matcher
- **Método:** `match(command)`
- **Retorno:** `{ pattern, commands, confidence }` ou null

## Componentes UI

### Estrutura Principal
```
<Box flexDirection="column" minHeight={stdout.rows}>
  // Header (fixed)
  // History (grows)
  // Input Area (bottom)
  // Footer (fixed)
</Box>
```

### Markdown Parser
- **Arquivo:** `src/components/MarkdownParser.js`
- **Função:** `parseMarkdownToElements(text, key)`
- **Usado:** Para renderizar respostas da IA

## Bracketed Paste Mode

### Ativação
```javascript
useEffect(() => {
    if (isTTY && status === 'ready') {
        process.stdout.write('\x1b[?2004h'); // Enable
        return () => process.stdout.write('\x1b[?2004l'); // Disable
    }
}, [status, isTTY]);
```

### Restauração após Cancelamento
Sempre restaurado no `cleanupRequest()` para manter funcionalidade.

## Comandos Especiais (handleSpecialCommand)

### Comandos Suportados
- `/help` - Mostra ajuda
- `/clear` - Limpa tela
- `/history` - Mostra histórico
- `/status` - Status do sistema
- `/exit` | `/quit` - Sair

## Markers Especiais

### Cancelamento
```javascript
const CANCELLATION_MARKER =
  '[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]';
```

### Interrupção
```
'[User pressed ESC - Previous message was interrupted]'
```

## Comportamentos Críticos a Preservar

1. **Zero alteração no sistema de cancelamento**
2. **Estados e refs mantidos exatamente iguais**
3. **Debug logs preservados em todos os pontos**
4. **Fluxo Turso mantido (pending → processing → completed)**
5. **Sistema de AbortController intacto**
6. **Bracketed paste mode funcionando**
7. **Navegação histórico com filtros**
8. **Comportamento de double-tap (Ctrl+C e ESC)**
9. **Renderização markdown via MarkdownParser**
10. **Integração completa com todos os backends**

---
**IMPORTANTE:** Qualquer alteração que modifique esses comportamentos deve ser considerada um ERRO CRÍTICO que requer correção imediata.