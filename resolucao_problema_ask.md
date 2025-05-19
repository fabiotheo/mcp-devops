# Guia para resolver o problema do comando 'ask' no MCP Terminal Assistant

## Problema

O comando `ask` não exibe a resposta da IA após a execução. O usuário observa que ao executar `ask "como listar arquivos por tamanho"`, o script é iniciado mas nenhuma resposta é exibida, mesmo que o script esteja se comunicando corretamente com a API.

## Causa do problema

A investigação revelou as seguintes causas:

1. **Problema de fluxo assíncrono**: O código em `mcp-assistant.js` usa operações assíncronas para processar a resposta e apresentar o resultado.

2. **Interrupção prematura**: O programa pode estar terminando antes que todas as saídas sejam exibidas no console ou interrompendo o fluxo normal quando tenta interagir com o usuário para executar comandos.

3. **Conflito de callbacks**: O uso de `readline` para interagir com o usuário após obter a resposta pode estar interferindo com a exibição da resposta principal.

## Arquivos de correção disponíveis

Criamos várias soluções para este problema:

### 1. `fix-mcp.sh`

Este script cria um wrapper simples para o comando `ask` que garante a exibição correta da saída, sem modificar o código original.

**Funcionamento**:
- Faz backup do arquivo original como `mcp-assistant.js.bak`
- Cria um novo script wrapper (`mcp-client-wrapper.js`) que executa o original com a configuração correta de stdio
- Atualiza o link simbólico para apontar para o wrapper em vez do original
- Mantém o código original intacto, apenas muda como ele é chamado

**Como executar**:
```bash
chmod +x /home/ipcom/mcp/mcp-devops/fix-mcp.sh
sudo /home/ipcom/mcp/mcp-devops/fix-mcp.sh
```

### 3. `mcp-simple.js`

Uma versão simplificada do assistente para testar a funcionalidade básica, útil para confirmar se o problema está no código ou na configuração.

**Funcionamento**:
- Implementa uma versão simplificada do assistente
- Utiliza uma abordagem síncrona para garantir que a resposta seja exibida
- Usa leitura síncrona de entrada para confirmar a execução de comandos
- Útil para testes e diagnóstico

**Como executar**:
```bash
node /home/ipcom/mcp/mcp-devops/mcp-simple.js "como listar arquivos por tamanho"
```

### 4. `teste-mcp.js`

Script para testar a conexão com a API e diagnosticar problemas.

**Funcionamento**:
- Testa a conexão com a API do Anthropic Claude
- Verifica se a chave API está configurada corretamente
- Executa um teste simples para confirmar que a API responde

**Como executar**:
```bash
node /home/ipcom/mcp/mcp-devops/teste-mcp.js
```

### 5. `debug-ask.sh`

Script para executar o comando `ask` com saída detalhada para diagnóstico.

**Funcionamento**:
- Executa o `mcp-assistant.js` diretamente com redirecionamento de erro
- Salva a saída completa em arquivo de log para análise
- Exibe informações de diagnóstico

**Como executar**:
```bash
chmod +x /home/ipcom/mcp/mcp-devops/debug-ask.sh
/home/ipcom/mcp/mcp-devops/debug-ask.sh "como listar arquivos por tamanho"
```

## Comparação das soluções

| Solução | Prós | Contras |
|---------|------|---------|
| `fix-mcp.sh` | Não modifica o código original; Solução limpa com wrapper | Adiciona uma camada extra de indireção |
| `mcp-simple.js` | Versão simplificada para testes | Não é uma solução completa, apenas para diagnóstico |
| `teste-mcp.js` | Testa a API e configuração | Apenas para diagnóstico |
| `debug-ask.sh` | Ajuda a identificar a causa do problema | Apenas para diagnóstico |

## Solução recomendada

**A melhor solução é o `fix-mcp.sh`** pelas seguintes razões:

1. **Não modifica o código original**: Isso evita problemas em atualizações futuras
2. **Solução simples e robusta**: O wrapper garante que todas as saídas sejam capturadas
3. **Fácil de reverter**: Se necessário, basta restaurar o link simbólico
4. **Não requer dependências adicionais**: Funciona com a instalação existente

## Passos para implementar a solução

1. Execute o script de correção:
   ```bash
   chmod +x /home/ipcom/mcp/mcp-devops/fix-mcp.sh
   sudo /home/ipcom/mcp/mcp-devops/fix-mcp.sh
   ```

2. Reinicie o terminal ou atualize o ambiente:
   ```bash
   source ~/.zshrc
   ```

3. Teste o comando:
   ```bash
   ask "como listar arquivos por tamanho"
   ```

## Solução de problemas adicionais

Se a solução recomendada não funcionar, você pode:

1. **Verificar a API key**:
   ```bash
   node /home/ipcom/mcp/mcp-devops/teste-mcp.js
   ```

2. **Reconfigurar a API key**:
   ```bash
   node /home/ipcom/mcp/mcp-devops/configurar-api.js
   ```

3. **Tentar a versão simplificada**:
   ```bash
   node /home/ipcom/mcp/mcp-devops/mcp-simple.js "como listar arquivos por tamanho"
   ```

4. **Executar com diagnóstico**:
   ```bash
   /home/ipcom/mcp/mcp-devops/debug-ask.sh "como listar arquivos por tamanho"
   ```

5. **Restaurar o backup** (caso tenha problemas):
   ```bash
   cp ~/.mcp-terminal/mcp-assistant.js.bak ~/.mcp-terminal/mcp-assistant.js
   ```

## Verificação final

Após aplicar a correção, execute os seguintes comandos para garantir que o ambiente está funcionando corretamente:

```bash
# Verificar link simbólico
ls -la /root/.local/bin/ask

# Testar versão simplificada 
node /home/ipcom/mcp/mcp-devops/mcp-simple.js "como listar arquivos por tamanho"

# Testar comando completo
ask "como listar arquivos por tamanho"
```