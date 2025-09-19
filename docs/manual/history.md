# Manual do Sistema de Histórico - Turso Integration

## Visão Geral

O sistema de histórico utiliza o Turso Database para persistir conversas entre sessões, permitindo acesso ao histórico de comandos e respostas de múltiplas perspectivas.

## Arquitetura de Salvamento

### Modo Hybrid (Padrão)
O sistema está configurado em modo `hybrid`, salvando automaticamente em múltiplas tabelas:

- **`history_global`** - Histórico compartilhado entre todas as máquinas
- **`history_machine`** - Histórico específico desta máquina
- **`history_user`** - Histórico por usuário (quando configurado)

### Status de Conversas
- **`completed`** - Conversa finalizada com sucesso
- **`cancelled`** - Conversa interrompida com ESC

## Comandos de Histórico

### Comando Básico (Padrão)
```bash
./ipcom-chat history --limit 5
```
**Comportamento:** Mostra histórico da tabela `history_machine` (local desta máquina)
**Sem duplicação:** Exibe apenas registros locais

### Histórico Global
```bash
./ipcom-chat history --global --limit 5
```
**Comportamento:** Mostra histórico compartilhado entre todas as máquinas
**Uso:** Ver comandos executados em qualquer máquina

### Histórico da Máquina
```bash
./ipcom-chat history --machine --limit 5
```
**Comportamento:** Explicitamente mostra histórico local
**Equivalente ao padrão**

### Histórico por Usuário
```bash
./ipcom-chat history --user <username> --limit 5
```
**Exemplo:** `./ipcom-chat history --user fabio --limit 5`
**Comportamento:** Mostra histórico de um usuário específico

### Histórico Combinado (Todas as Tabelas)
```bash
./ipcom-chat history --all --limit 5
```
**Comportamento:** Modo hybrid - combina todas as tabelas
**Atenção:** Pode mostrar duplicação (mesma conversa de diferentes tabelas)

## Opções Adicionais

### Formato de Saída

#### Formato Tabela (Padrão)
```bash
./ipcom-chat history --limit 5
```

#### Formato JSON
```bash
./ipcom-chat history --format json --limit 5
```
**Útil para:** Processar dados programaticamente

### Limitar Resultados
```bash
./ipcom-chat history --limit 10  # Últimos 10 registros
./ipcom-chat history --limit 50  # Últimos 50 registros
```

## Busca no Histórico

### Buscar por Texto
```bash
./ipcom-chat history search "docker" --limit 10
```
**Comportamento:** Busca "docker" em comandos e respostas

### Estatísticas
```bash
./ipcom-chat history stats
```
**Mostra:**
- Total de comandos
- Comandos hoje
- Tempo médio de resposta
- Comandos mais usados

## Exportação

### Exportar para JSON
```bash
./ipcom-chat history export --format json > historico.json
```

### Exportar para CSV
```bash
./ipcom-chat history export --format csv > historico.csv
```

## Estrutura das Tabelas

### history_global
```sql
- id: Identificador único
- command: Pergunta do usuário
- response: Resposta da IA
- machine_id: ID da máquina que executou
- user_id: ID do usuário (quando disponível)
- timestamp: Momento da execução
- session_id: ID da sessão
```

### history_machine
```sql
- id: Identificador único
- machine_id: ID desta máquina
- command: Pergunta do usuário
- response: Resposta da IA
- user_id: ID do usuário (quando disponível)
- timestamp: Momento da execução
- session_id: ID da sessão
```

## Políticas de Salvamento

### Conversas Completas
- Salvas automaticamente após resposta da IA
- Status: `completed`
- Inclui pergunta e resposta completas

### Conversas Canceladas (ESC)
- Salva apenas a pergunta quando ESC é pressionado
- Status: `cancelled`
- Response: `null`
- Útil para análise de padrões de cancelamento

## Troubleshooting

### Problema: Duplicação no Histórico
**Causa:** Usando modo hybrid sem especificar tabela
**Solução:** Use flags específicas (`--global`, `--machine`) ou padrão sem flags

### Problema: Histórico Vazio
**Verificar:**
1. Turso está configurado: `~/.mcp-terminal/turso-config.json`
2. Conexão ativa: Procure por "✓ Turso conectado" na inicialização
3. Tabela correta: Tente `--all` para ver todas as tabelas

### Debug Mode
Para ver logs de salvamento, edite `~/.mcp-terminal/config.json`:
```json
{
  "debug": true
}
```

Com debug ativo, você verá:
- `[DEBUG] Background Turso save failed` - Erros de salvamento
- `[DEBUG] Duplicate save prevented` - Prevenção de duplicatas

## Configuração

### Arquivo de Configuração Turso
**Local:** `~/.mcp-terminal/turso-config.json`
```json
{
  "turso_url": "libsql://...",
  "turso_token": "...",
  "history_mode": "hybrid"
}
```

### Modos Disponíveis
- **`global`** - Salva apenas em history_global
- **`machine`** - Salva apenas em history_machine
- **`user`** - Salva apenas em history_user
- **`hybrid`** - Salva em múltiplas tabelas (padrão)

## Exemplos de Uso

### Ver últimas 3 conversas locais
```bash
./ipcom-chat history --limit 3
```

### Ver histórico global em JSON
```bash
./ipcom-chat history --global --format json --limit 5
```

### Buscar comandos sobre Docker
```bash
./ipcom-chat history search "docker" --limit 10
```

### Ver estatísticas de uso
```bash
./ipcom-chat history stats
```

### Exportar todo histórico local
```bash
./ipcom-chat history export --format json > backup.json
```

## Notas Importantes

1. **Padrão sem duplicação:** Comando sem flags mostra apenas `history_machine`
2. **Salvamento automático:** Toda conversa é salva automaticamente
3. **Modo offline:** Sistema funciona sem Turso (apenas memória)
4. **Performance:** Uso de `setImmediate` garante UI responsiva
5. **Deduplicação:** Sistema previne salvamentos duplicados via `pendingSaves`

## Atualizações Recentes (Phase 1)

- ✅ Integração Turso funcionando
- ✅ Política ESC implementada (salva como `cancelled`)
- ✅ Flags para seleção de tabelas
- ✅ Prevenção de duplicação no histórico padrão
- ✅ Error handling robusto com `.catch()`
- ✅ Tracking de query atual para ESC correto