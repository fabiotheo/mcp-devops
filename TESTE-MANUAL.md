# 🧪 Guia de Teste Manual - Interface Ink

## Antes de Instalar

### 1. Teste Básico da Interface
```bash
# Teste rápido (com seu usuário)
MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs

# Ou teste com usuário genérico
MCP_USER=test node interface-v2/mcp-ink-cli.mjs
```

### 2. Funcionalidades para Testar

#### ✅ Teste de Inicialização
- A interface deve mostrar uma tela de loading com spinner
- Depois deve aparecer "MCP Terminal Assistant v3.0"
- Status deve mudar para "ready"

#### ✅ Teste de Comandos
- Digite uma pergunta simples: `"como ver processos?"`
- A interface deve processar e retornar uma resposta

#### ✅ Teste de Histórico
- Use as setas ↑↓ para navegar pelo histórico
- Com Turso configurado, deve mostrar comandos anteriores do usuário

#### ✅ Teste de Multi-line Paste
1. Copie este texto (3 linhas):
```
linha 1
linha 2
linha 3
```

2. Cole na interface (Cmd+V ou Ctrl+V)
3. O texto deve aparecer como:
   - Uma única entrada
   - Com quebras de linha preservadas
   - Sem caracteres estranhos como `[200~`

#### ✅ Teste de Comandos Especiais
- `/help` - Deve mostrar ajuda
- `/clear` - Deve limpar a tela
- `/exit` ou Ctrl+C - Deve sair

### 3. Scripts de Teste Automatizados

```bash
# Teste completo pré-instalação
./test-pre-install.sh

# Teste simples da interface
./test-interface-simple.sh

# Teste específico de paste
./test-ink-paste.sh
```

## Instalação

### Para Nova Instalação
```bash
node setup.js
```

### Para Migrar Instalação Existente
```bash
node migrate-to-ink.js
```

## Estrutura de Arquivos

### Arquivos Principais
- `interface-v2/mcp-ink-cli.mjs` - Interface principal
- `interface-v2/bridges/adapters/TursoAdapter.js` - Integração com Turso
- `interface-v2/bridges/CommandProcessor.js` - Processador de comandos

### Scripts de Suporte
- `migrate-to-ink.js` - Script de migração
- `ipcom-ink` - Launcher para nova interface
- `setup.js` - Instalador (já atualizado)

## Status Atual

✅ **Funcionalidades Implementadas:**
- Interface Ink responsiva
- Tela de loading durante inicialização
- Suporte a Turso com mapeamento de usuário
- Multi-line paste funcionando
- Histórico de comandos
- Processamento de comandos AI

⚠️ **Observações:**
- Alguns componentes estão como .jsx (funcionam normalmente)
- Dependência ink-text-input foi adicionada
- Interface carrega e funciona corretamente

## Problemas Conhecidos e Soluções

### Problema: Multi-line paste mostra caracteres estranhos
**Solução:** Já corrigido - a interface detecta e processa bracketed paste mode

### Problema: Histórico não carrega
**Solução:** Já corrigido - TursoAdapter mapeia usuário corretamente

### Problema: Logs aparecem durante inicialização
**Solução:** Já corrigido - tela de loading limpa

## Próximos Passos

1. **Teste Manual Completo**
   - Execute a interface com seu usuário
   - Teste todas as funcionalidades listadas

2. **Se Tudo Funcionar**
   - Execute `node setup.js` para instalar
   - Ou `node migrate-to-ink.js` para migrar

3. **Após Instalação**
   - Reinicie o terminal
   - Use `ipcom "sua pergunta"` normalmente