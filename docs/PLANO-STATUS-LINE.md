# Plano de Implementação: Status Line Interface

**Data**: 2025-10-02
**Versão**: 1.1
**Status**: Aprovado para implementação

## Changelog

### v1.1 (2025-10-02)
- **IMPORTANTE**: Removido todo uso de `any` do código
- Adicionadas tipagens explícitas e seguras em todos os componentes
- `ProgressEvent` já está tipado corretamente em `ai_orchestrator_bash.ts`
- Política de tipagem: Nunca usar `any`, apenas com aprovação explícita do usuário

---

## Política de Tipagem TypeScript

### Regras Obrigatórias

1. **NUNCA usar `any`** - Todo código deve ter tipagem explícita e segura
2. **Usar `unknown` quando o tipo é desconhecido** - E fazer type narrowing apropriado
3. **Tipos explícitos sempre** - Evitar inferência implícita em APIs públicas
4. **Type guards** - Usar type guards (typeof, instanceof, in) para narrowing seguro
5. **Exceção única**: Uso de `any` SOMENTE com aprovação explícita e documentada do usuário

### Tipos Disponíveis no Projeto

- `ProgressEvent`: Já definido em `src/ai_orchestrator_bash.ts` (linha 109)
  ```typescript
  interface ProgressEvent {
    id: string;
    timestamp: number;
    type: 'iteration-start' | 'command-execute' | 'command-complete' |
          'iteration-complete' | 'timeout' | 'error';
    message: string;
    iteration?: number;
    totalIterations?: number;
    command?: string;
    result?: string;
    duration?: number;
  }
  ```

- `React.ReactElement`: Para elementos React
- `React.FC<Props>`: Para componentes funcionais
- `Record<string, unknown>`: Para objetos genéricos (ao invés de `any`)

---

## Sumário Executivo

Este documento detalha o plano completo para substituir os logs de execução verbosos do MCP Terminal Assistant por uma interface compacta de Status Line, melhorando significativamente a experiência do usuário (UX).

### Objetivo

Substituir a área de logs de execução atual:
```
🔄 Iteração 1/10 iniciada
🔧 Executando comando: fail2ban-client status
✓ Comando executado (16ms)
🔄 Iteração 2/10 iniciada
🔧 Executando comando: fail2ban-client status sshd
✓ Comando executado (23ms)
[... muitas linhas mais ...]
```

Por uma interface compacta de Status Line:
```
┌─ 🤖 Processando ─────────────────────────┐
│ Iteração 3/10 • Executando comando • 2.3s │
└──────────────────────────────────────────┘
```

### Benefícios

- **UX Melhorada**: Interface mais limpa e profissional
- **Economia de Espaço**: Redução de ~10-20 linhas para 2-3 linhas
- **Informação Concentrada**: Todas as informações relevantes em um só lugar
- **Feedback em Tempo Real**: Atualizações suaves de progresso, ação e tempo decorrido
- **Estados Visuais**: Cores e ícones indicam estado atual (processando, sucesso, erro, warning)

---

## Arquitetura da Solução

### Componentes Principais

```
┌─────────────────────────────────────────────────────────┐
│                   mcp-ink-cli.tsx                       │
│  ┌───────────────────────────────────────────────────┐ │
│  │              executionLog: ProgressEvent[]        │ │
│  └──────────────────┬────────────────────────────────┘ │
│                     │                                   │
│                     v                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │         useStatusProcessor Hook                   │ │
│  │  - Processa eventos ProgressEvent                 │ │
│  │  - Extrai iteração, ação, tempo                   │ │
│  │  - Calcula métricas                               │ │
│  └──────────────────┬────────────────────────────────┘ │
│                     │                                   │
│                     v                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │         StatusLine Component                      │ │
│  │  - Renderiza interface compacta                   │ │
│  │  - 2-3 linhas com borda                           │ │
│  │  - Cores e ícones por estado                      │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

```
ProgressEvent Stream
       │
       v
useStatusProcessor
       │
       ├─> iteration: number
       ├─> action: string
       ├─> elapsedTime: number
       ├─> metrics: StatusMetrics
       └─> state: StatusState
       │
       v
  StatusLine Component
       │
       v
  Terminal Rendering
```

---

## Fases de Implementação

### FASE 1: Criação de Componentes

**Duração Estimada**: 2-3 horas

#### Tarefa 1.1: Criar Tipos TypeScript

**Arquivo**: `src/types/status.ts`

Criar interfaces e types para:
- `StatusState`: 'processing' | 'success' | 'warning' | 'error' | 'idle'
- `StatusMetrics`: métricas de execução (comandos executados, sucessos, falhas)
- `StatusLineProps`: props do componente StatusLine

**Entregável**: Arquivo `src/types/status.ts` completo com todas as definições de tipos

---

#### Tarefa 1.2: Criar Componente StatusLine

**Arquivo**: `src/components/StatusLine.tsx`

Implementar:
- Componente React funcional com React.memo para otimização
- Renderização de caixa com borda usando Ink Box
- Linha 1: Ícone + Status "Processando"
- Linha 2: Iteração + Ação + Tempo decorrido
- Linha 3 (opcional): Métricas de comandos executados

Funções auxiliares:
- `getStateIcon()`: retorna ícone baseado no estado
- `getBorderColor()`: retorna cor da borda baseado no estado
- `formatTime()`: formata segundos em formato legível (2.5s, 1m 30s)
- `truncateAction()`: trunca texto longo com elipses

**Esquema de Cores**:
```
Processing: cyan border + 🤖 icon
Success:    green border + ✓ icon
Warning:    yellow border + ⚠️ icon
Error:      red border + ❌ icon
```

**Entregável**: Componente StatusLine completo e funcional

---

#### Tarefa 1.3: Testes do Componente (Opcional)

**Arquivo**: `src/components/__tests__/StatusLine.test.tsx`

Criar testes unitários básicos:
- Teste de renderização com props básicas
- Verificação de texto renderizado
- Verificação de formatação de tempo

**Entregável**: Suite de testes unitários (opcional)

---

### FASE 2: Camada de Processamento de Dados

**Duração Estimada**: 1-2 horas

#### Tarefa 2.1: Criar Hook useStatusProcessor

**Arquivo**: `src/hooks/useStatusProcessor.ts`

Implementar hook que:
1. Recebe `executionLog`, `isProcessing`, `maxIterations`
2. Processa eventos ProgressEvent sequencialmente
3. Extrai iteração atual de mensagens como "Iteração 3/10 iniciada"
4. Extrai comando de mensagens como "Executando: comando"
5. Calcula tempo decorrido desde o início
6. Computa métricas (comandos executados, sucessos, falhas)
7. Determina estado atual (processing, warning, error)
8. Retorna dados processados para o StatusLine

**Processamento de Eventos**:
```
iteration-start  → Extrai número da iteração
command-execute  → Extrai comando, incrementa contador
command-complete → Incrementa sucessos, acumula duração
timeout          → Define estado como 'warning'
error            → Define estado como 'error', incrementa falhas
```

**Otimizações**:
- Usar `useMemo` para evitar reprocessamento desnecessário
- Usar `useRef` para rastrear tempo inicial
- Usar `useEffect` para resetar tempo quando processamento inicia

**Entregável**: Hook useStatusProcessor completo e otimizado

---

### FASE 3: Integração na UI

**Duração Estimada**: 1-2 horas

#### Tarefa 3.1: Modificar mcp-ink-cli.tsx

**Arquivo**: `src/mcp-ink-cli.tsx`

**Passo 1**: Adicionar imports
```typescript
import { StatusLine } from './components/StatusLine.js';
import { useStatusProcessor } from './hooks/useStatusProcessor.js';
```

**Passo 2**: Remover import do Static
```typescript
// ANTES
import { Box, render, Text, useApp, useStdout, Static } from 'ink';

// DEPOIS
import { Box, render, Text, useApp, useStdout } from 'ink';
```

**Passo 3**: Adicionar hook useStatusProcessor (após useHistoryManager)
```typescript
const statusData = useStatusProcessor({
  executionLog,
  isProcessing,
  maxIterations: 10
});
```

**Passo 4**: Substituir Static execution log (linhas 405-440)
```typescript
// REMOVER seção Static completa

// ADICIONAR
{statusData.shouldShow && (
  <StatusLine
    iteration={statusData.iteration}
    maxIterations={statusData.maxIterations}
    action={statusData.action}
    elapsedTime={statusData.elapsedTime}
    metrics={statusData.metrics}
    state={statusData.state}
  />
)}
```

**Entregável**: mcp-ink-cli.tsx modificado com StatusLine integrado

---

#### Tarefa 3.2: Testar Integração

**Procedimento de Teste**:
1. Build do projeto: `pnpm run build`
2. Executar CLI: `MCP_USER=testuser node src/mcp-ink-cli.tsx --debug`
3. Testar com query que gera iterações: "Quantos IPs estão bloqueados no fail2ban?"

**Verificações**:
- [ ] Status Line aparece quando processamento inicia
- [ ] Contador de iteração atualiza corretamente
- [ ] Texto da ação atualiza para cada comando
- [ ] Tempo decorrido aumenta em tempo real
- [ ] Status Line desaparece quando processamento completa

**Entregável**: Integração funcionando e verificada

---

### FASE 4: Polimento Visual e Casos Edge

**Duração Estimada**: 1 hora

#### Tarefa 4.1: Tratar Casos Edge

**Cenários a Testar**:
1. Log de execução vazio → não mostrar StatusLine
2. Comando único → mostrar iteração 1/10
3. Nome de comando muito longo → truncar com ...
4. Erro durante execução → borda vermelha + ícone de erro
5. Timeout → borda amarela + ícone de warning

**Verificações**:
- Comandos longos são truncados corretamente
- Sem execution log, StatusLine não renderiza
- Processamento finalizado, StatusLine oculta
- Estados de erro e warning mostram cores corretas

**Entregável**: Todos os casos edge tratados corretamente

---

#### Tarefa 4.2: Responsividade para Largura do Terminal

**Teste de Larguras**:
```bash
# Terminal estreito (80 colunas)
resize -s 24 80 && MCP_USER=testuser node src/mcp-ink-cli.tsx

# Terminal largo (120 colunas)
resize -s 40 120 && MCP_USER=testuser node src/mcp-ink-cli.tsx
```

**Ajustes se Necessário**:
Se houver problemas com layout em terminais estreitos, ajustar `truncateAction` para usar largura do terminal:

```typescript
import { useStdout } from 'ink';

const { stdout } = useStdout();
const terminalWidth = stdout?.columns || 80;
const maxActionLength = Math.max(30, terminalWidth - 50);
const truncatedAction = truncateAction(action, maxActionLength);
```

**Entregável**: StatusLine responsivo funcionando em diferentes larguras de terminal

---

### FASE 5: Testes e Limpeza

**Duração Estimada**: 0.5-1 hora

#### Tarefa 5.1: Testes de Integração

**Cenários de Teste**:

1. **Query fail2ban**: "Quantos IPs estão bloqueados no fail2ban?"
   - Deve mostrar múltiplas iterações
   - Deve atualizar texto de ação para cada comando

2. **Query docker**: "Liste todos os containers docker"
   - Deve mostrar progresso
   - Deve completar com sucesso

3. **Query simples**: "Qual é o meu IP?"
   - Deve mostrar iterações mínimas
   - Deve completar rapidamente

4. **Cenário de erro**: Perguntar sobre serviço inexistente
   - Deve mostrar estado de erro
   - Deve exibir mensagem de erro

5. **Query longa**: Pergunta complexa multi-etapas
   - Verificar que tempo decorrido atualiza
   - Verificar que contador de iteração incrementa

**Checklist de Verificação**:
- [ ] Status Line aparece quando processamento inicia
- [ ] Contador de iteração atualiza corretamente
- [ ] Texto da ação atualiza para cada comando
- [ ] Tempo decorrido aumenta em tempo real
- [ ] Status Line desaparece quando processamento completa
- [ ] Estado de erro mostra borda vermelha
- [ ] Visibilidade de comandos ainda funciona (mostrar imediatamente após ENTER)
- [ ] Histórico exibe corretamente
- [ ] Sem regressões em funcionalidade existente

**Entregável**: Todos os testes passando, sem regressões

---

#### Tarefa 5.2: Limpeza de Código

**Ações**:
1. Remover imports não utilizados
2. Remover código comentado
3. Garantir tipos TypeScript consistentes
4. Adicionar comentários JSDoc para novas funções
5. Formatar código com prettier/eslint

**Arquivos para Revisar**:
- `src/components/StatusLine.tsx`
- `src/types/status.ts`
- `src/hooks/useStatusProcessor.ts`
- `src/mcp-ink-cli.tsx`

**Entregável**: Código limpo e bem documentado

---

#### Tarefa 5.3: Documentação (Opcional)

Atualizar `CLAUDE.md` ou criar `docs/STATUS-LINE-IMPLEMENTATION.md`:

**Conteúdo**:
- Overview da implementação
- Componentes criados
- Como usar
- Cenários de teste recomendados

**Entregável**: Documentação atualizada (opcional)

---

## Critérios de Sucesso

A implementação está completa quando:

- [x] Componente StatusLine renderiza corretamente
- [x] useStatusProcessor processa eventos com precisão
- [x] Status Line substitui log de execução Static em mcp-ink-cli.tsx
- [x] Status Line atualiza em tempo real durante processamento
- [x] Contador de iteração incrementa corretamente
- [x] Texto da ação reflete comando atual
- [x] Tempo decorrido aumenta suavemente
- [x] Status Line oculta quando processamento completa
- [x] Casos edge tratados (erros, timeouts, comandos longos)
- [x] Responsivo para largura do terminal
- [x] Sem regressões em funcionalidade existente
- [x] Código limpo e bem documentado

---

## Plano de Rollback

Se surgirem problemas:

1. Reverter mudanças em `src/mcp-ink-cli.tsx`
2. Restaurar renderização de log de execução Static
3. Remover imports de StatusLine
4. Manter novos arquivos para uso futuro mas não integrá-los

**Comando Git**:
```bash
git checkout HEAD -- src/mcp-ink-cli.tsx
```

---

## Estimativa de Tempo

### Por Fase

```
Fase 1: Criação de Componentes     → 2-3 horas
Fase 2: Camada de Processamento    → 1-2 horas
Fase 3: Integração na UI           → 1-2 horas
Fase 4: Polimento Visual           → 1 hora
Fase 5: Testes e Limpeza           → 0.5-1 hora
──────────────────────────────────────────────
Total: 5.5 - 9 horas
```

### MVP (Versão Mínima Viável)

Fases 1-3 apenas: **4-7 horas** para versão básica funcionando

---

## Próximos Passos

Após aprovação do plano:

1. ✅ **Criar** `src/types/status.ts`
2. ✅ **Criar** `src/components/StatusLine.tsx`
3. ✅ **Criar** `src/hooks/useStatusProcessor.ts`
4. ✅ **Modificar** `src/mcp-ink-cli.tsx`
5. ✅ **Testar** integração
6. ✅ **Polir** e tratar casos edge
7. ✅ **Testar** e limpar código final

---

## Referências Técnicas

### Dependências Existentes

- **Ink Framework**: v4+ (já instalado)
- **React**: v18+ (já em uso)
- **TypeScript**: ES2022, Node18 (já configurado)
- **ProgressEvent Type**: Já definido em `ai_orchestrator_bash.ts`

### Arquivos de Referência

- `src/ai_orchestrator_bash.ts`: Tipo ProgressEvent
- `src/types/services.ts`: Convenções de tipos existentes
- `src/contexts/AppContext.js`: Padrões de acesso ao estado

### Novos Arquivos a Criar

```
src/
├── components/
│   └── StatusLine.tsx          [NOVO]
├── hooks/
│   └── useStatusProcessor.ts   [NOVO]
└── types/
    └── status.ts               [NOVO]
```

### Arquivo a Modificar

```
src/
└── mcp-ink-cli.tsx            [MODIFICAR]
    - Remover: Static log rendering (linhas 405-440)
    - Adicionar: StatusLine component
    - Adicionar: useStatusProcessor hook
```

---

## Conclusão

Este plano fornece um roteiro completo e detalhado para implementar a interface de Status Line, substituindo os logs de execução verbosos por uma solução compacta, elegante e profissional que melhora significativamente a experiência do usuário.

A implementação é modular, testável e reversível, com riscos minimizados através de um plano de rollback claro.

**Status**: Pronto para execução ✅

---

## Verificação de Tipos

### Checklist de Tipagem

Antes de finalizar cada arquivo, verificar:

- [ ] **Nenhum uso de `any`** - Buscar por `: any` ou `as any`
- [ ] **Props tipadas explicitamente** - Todas as props de componentes têm interface
- [ ] **Hooks com tipos de retorno** - Todos os hooks exportam interfaces de params e return
- [ ] **Event handlers tipados** - Callbacks e handlers têm assinaturas explícitas
- [ ] **Sem `@ts-ignore` ou `@ts-nocheck`** - Resolver problemas de tipo adequadamente

### Comando de Verificação

```bash
# Verificar se há uso de 'any' nos novos arquivos
grep -n ": any\|as any" src/components/StatusLine.tsx
grep -n ": any\|as any" src/hooks/useStatusProcessor.ts
grep -n ": any\|as any" src/types/status.ts

# Verificar compilação TypeScript
npx tsc --noEmit

# Deve retornar 0 erros
```

### Ferramentas de Validação

- **ESLint**: Configurar regra `@typescript-eslint/no-explicit-any: error`
- **TypeScript Strict**: Garantir que `strict: true` no tsconfig.json
- **VS Code**: Usar "Problems" panel para verificar erros de tipo em tempo real

---

*Documento criado em 2025-10-02*
*Versão 1.1 - Atualizado com política de tipagem estrita*
