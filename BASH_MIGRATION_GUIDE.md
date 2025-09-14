# Guia de Migração para Ferramenta Bash

## 📋 Visão Geral

Este guia ajuda na migração do sistema MCP Terminal Assistant para usar a nova ferramenta Bash com sessão persistente, substituindo gradualmente o `execute_command` genérico.

## 🎯 Benefícios da Migração

### Antes (execute_command)
- ❌ Sem estado entre comandos
- ❌ Variáveis perdidas
- ❌ Diretório resetado
- ❌ Comandos complexos limitados

### Depois (Ferramenta Bash)
- ✅ Sessão persistente
- ✅ Variáveis mantidas
- ✅ Diretório preservado
- ✅ Scripts completos suportados

## 🚀 Processo de Migração

### Fase 1: Preparação (Atual)
```bash
# 1. Atualizar instalação
git pull
node setup.js --upgrade

# 2. Verificar configuração
cat ~/.mcp-terminal/config.json
```

### Fase 2: Ativação Opcional
```json
{
  "anthropic_api_key": "sua-chave",
  "use_native_tools": true,
  "enable_bash_tool": false,  // Começa desabilitado
  "bash_config": {
    "timeout": 30000,
    "maxOutputSize": 100000
  }
}
```

### Fase 3: Teste Paralelo
```json
{
  "enable_bash_tool": true,   // Ativa bash
  "use_native_tools": true    // Mantém tools nativas
}
```

Nesta fase, o sistema usará preferencialmente a ferramenta bash quando configurada.

### Fase 4: Migração Completa
```json
{
  "enable_bash_tool": true,
  "bash_config": {
    "timeout": 30000,
    "maxOutputSize": 100000,
    "workingDir": "/home/user/projetos",
    "env": {
      "CUSTOM_VAR": "value"
    }
  }
}
```

## 📝 Exemplos de Uso

### Comando Simples
**Antes:**
```javascript
execute_command("ls -la")
execute_command("cd /tmp")  // Não funciona como esperado
execute_command("pwd")       // Ainda no diretório original
```

**Depois:**
```javascript
bash: { command: "ls -la" }
bash: { command: "cd /tmp" }
bash: { command: "pwd" }     // Mostra /tmp corretamente
```

### Scripts Complexos
**Antes:**
```javascript
// Não suportado diretamente
execute_command("for i in {1..5}; do echo $i; done")  // Pode falhar
```

**Depois:**
```javascript
bash: {
  command: `
    for i in {1..5}; do
      echo "Processando $i"
      sleep 1
    done
  `
}
```

### Variáveis de Ambiente
**Antes:**
```javascript
execute_command("export MY_VAR=test")
execute_command("echo $MY_VAR")  // Vazio - variável perdida
```

**Depois:**
```javascript
bash: { command: "export MY_VAR=test" }
bash: { command: "echo $MY_VAR" }  // Mostra "test"
```

## 🔒 Segurança

### Comandos Bloqueados Automaticamente
- `rm -rf /`
- Fork bombs (`:(){:|:&};:`)
- Formatação de disco (`mkfs`)
- Escrita direta em dispositivos (`dd of=/dev/sda`)

### Sanitização de Saída
- Credenciais removidas automaticamente
- Tokens mascarados
- Senhas ocultadas

## 🧪 Testando a Migração

### 1. Teste Manual
```bash
# Testar ferramenta bash isoladamente
node test-bash.js

# Testar integração completa
mcp-chat
> crie um arquivo teste.txt, adicione conteúdo e liste o diretório
```

### 2. Verificar Funcionalidade
```bash
mcp-chat
> Execute os seguintes comandos:
> 1. Vá para /tmp
> 2. Crie uma variável TEST=123
> 3. Crie um arquivo com o valor da variável
> 4. Mostre o conteúdo do arquivo
```

### 3. Comparar Resultados
Com `enable_bash_tool: false`:
- Comandos executados independentemente
- Variáveis e estado perdidos

Com `enable_bash_tool: true`:
- Sessão mantida
- Todos os comandos funcionam como esperado

## 📊 Monitoramento

### Logs de Uso
```bash
# Ver logs do sistema
tail -f ~/.mcp-terminal/logs/mcp.log

# Verificar comandos bash executados
grep "Bash:" ~/.mcp-terminal/logs/mcp.log
```

### Métricas
- Tempo de execução reduzido (sessão persistente)
- Menos erros de contexto
- Maior taxa de sucesso em tarefas complexas

## ⚠️ Possíveis Problemas

### Problema 1: Sessão Travada
**Sintoma:** Comandos não respondem
**Solução:**
```javascript
bash: { restart: true }  // Reinicia a sessão
```

### Problema 2: Saída Muito Grande
**Sintoma:** Resposta truncada
**Solução:**
```json
{
  "bash_config": {
    "maxOutputSize": 500000  // Aumentar limite
  }
}
```

### Problema 3: Timeout em Comandos Longos
**Sintoma:** Comando interrompido
**Solução:**
```json
{
  "bash_config": {
    "timeout": 60000  // Aumentar para 60 segundos
  }
}
```

## 📅 Cronograma Recomendado

### Semana 1-2: Teste
- Manter `enable_bash_tool: false`
- Testar manualmente com `test-bash.js`

### Semana 3-4: Piloto
- Ativar para alguns usuários
- Coletar feedback
- Ajustar configurações

### Semana 5-6: Rollout
- Ativar gradualmente para todos
- Monitorar logs e métricas

### Semana 7-8: Otimização
- Ajustar timeouts e limites
- Remover `execute_command` legacy

## 🔄 Rollback

Se necessário reverter:
```json
{
  "enable_bash_tool": false,
  "use_native_tools": true
}
```

O sistema voltará a usar o orquestrador de Tools sem bash.

## 📚 Documentação Adicional

- [BASH_TOOL_IMPLEMENTATION.md](./BASH_TOOL_IMPLEMENTATION.md) - Detalhes técnicos
- [test-bash.js](./test-bash.js) - Script de teste
- [ai_orchestrator_bash.js](./ai_orchestrator_bash.js) - Implementação

## 💡 Dicas

1. **Comece conservador:** Use timeouts maiores inicialmente
2. **Monitor logs:** Acompanhe os primeiros dias após ativação
3. **Feedback rápido:** Colete impressões dos usuários
4. **Ajuste incremental:** Refine configurações baseado no uso real

## ✅ Checklist de Migração

- [ ] Backup da configuração atual
- [ ] Atualização do código (`git pull`)
- [ ] Instalação atualizada (`node setup.js --upgrade`)
- [ ] Teste manual com `test-bash.js`
- [ ] Configuração ajustada em `config.json`
- [ ] Teste no ambiente real
- [ ] Monitoramento ativo por 24h
- [ ] Coleta de feedback
- [ ] Ajustes finais
- [ ] Documentação atualizada

---

**Status:** Pronto para Migração
**Versão:** 1.0.0
**Data:** Janeiro 2025