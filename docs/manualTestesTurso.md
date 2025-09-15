⏺ 📋 MANUAL DE TESTES EM PRODUÇÃO - SISTEMA TURSO

🎯 PRÉ-REQUISITOS

# 1. Verificar se Turso está configurado
cat ~/.mcp-terminal/turso-config.json

# 2. Verificar versão do Node
node --version  # Deve ser >= 18

# 3. Verificar se pnpm está instalado
pnpm --version

  ---
🧪 FASE 1: TESTES LOCAIS (Máquina de Desenvolvimento)

1.1 - Setup Inicial

# Executar setup do Turso
node libs/turso-setup.js

# Verificar se tabelas foram criadas
# (Deve criar users, machines, history_global, history_user, history_machine, etc)

1.2 - Gerenciamento de Usuários

# Criar usuário admin
ipcom-chat user create --username admin --name "Administrador" --email admin@ipcom.com.br

# Criar usuário de teste
ipcom-chat user create --username teste --name "Usuario Teste" --email teste@ipcom.com.br

# Listar usuários (deve mostrar os 2 criados)
ipcom-chat user list

# Ver estatísticas do usuário
ipcom-chat user stats admin

# Atualizar email do usuário teste
ipcom-chat user update teste --email novo@ipcom.com.br

# Verificar atualização
ipcom-chat user list

1.3 - Registro de Máquina

# Registrar máquina atual
ipcom-chat machine register

# Ver informações da máquina
ipcom-chat machine info

# Listar máquinas registradas
ipcom-chat machine list

1.4 - Modo Interativo

# Teste 1: Modo global (padrão)
ipcom-chat
# Digite: Como verificar uso de disco?
# Digite: /exit

# Teste 2: Modo usuário
ipcom-chat --user admin
# Digite: Qual comando para listar processos?
# Digite: /exit

# Teste 3: Modo local
ipcom-chat --local
# Digite: Como reiniciar nginx?
# Digite: /exit

# Teste 4: Modo híbrido
ipcom-chat --hybrid
# Digite: Teste de comando
# Digite: /exit

1.5 - Histórico e Busca

# Ver estatísticas do histórico
ipcom-chat history stats

# Buscar comandos anteriores
ipcom-chat history search "disco"
ipcom-chat history search "processo"

# Exportar histórico
ipcom-chat history export --format json --output teste.json
ipcom-chat history export --format csv --output teste.csv

# Verificar arquivos exportados
ls -la teste.*
cat teste.json | head -20

1.6 - Migração de Histórico Local

# Se houver histórico antigo
ls ~/.mcp-terminal/history.json

# Executar migração
node libs/migrate-history.js
# Escolher opção 1 (global)

# Verificar migração
node libs/migrate-history.js verify

# Ver estatísticas após migração
ipcom-chat history stats

  ---
🚀 FASE 2: TESTE DE DEPLOYMENT (1-2 Máquinas Piloto)

2.1 - Preparar Deployment

# Criar arquivo com máquinas de teste
cat > test-hosts.txt << EOF
servidor-teste1.ipcom.local
servidor-teste2.ipcom.local
EOF

# Teste dry-run primeiro (simula sem executar)
./deploy-linux.sh test-hosts.txt \
--turso-url "libsql://ipcom-linux-fabioipcom.aws-us-east-1.turso.io" \
--turso-token "SEU_TOKEN_AQUI" \
--user seu_usuario \
--dry-run

2.2 - Deployment Real

# Executar deployment real
./deploy-linux.sh test-hosts.txt \
--turso-url "libsql://ipcom-linux-fabioipcom.aws-us-east-1.turso.io" \
--turso-token "SEU_TOKEN_AQUI" \
--user seu_usuario

# Verificar logs de instalação
# Deve mostrar:
# ✅ Instalação concluída para cada host

2.3 - Validar nas Máquinas Remotas

# SSH em cada máquina de teste
ssh usuario@servidor-teste1.ipcom.local

# Verificar instalação
which ipcom-chat
ls ~/.mcp-terminal/

# Verificar configuração Turso
cat ~/.mcp-terminal/turso-config.json

# Testar comando
ipcom-chat --version
ipcom-chat machine info

# Sair do SSH
exit

  ---
🏢 FASE 3: TESTES CROSS-MACHINE

3.1 - Teste de Sincronização Entre Máquinas

Na Máquina A:
# Logar como usuário admin
ipcom-chat --user admin

# Executar comando único para teste
# Digite: echo "TESTE_MAQUINA_A_$(date +%s)"
# Digite: /exit

# Ver histórico
ipcom-chat history search "TESTE_MAQUINA_A"

Na Máquina B:
# Logar como mesmo usuário
ipcom-chat --user admin

# Buscar comando da Máquina A
ipcom-chat history search "TESTE_MAQUINA_A"
# DEVE encontrar o comando!

# Executar novo comando
# Digite: echo "TESTE_MAQUINA_B_$(date +%s)"
# Digite: /exit

Voltar na Máquina A:
# Verificar se vê comando da Máquina B
ipcom-chat history search "TESTE_MAQUINA_B"
# DEVE encontrar!

3.2 - Teste de Modos de Histórico

# Máquina A - Modo Global
ipcom-chat
# Digite: COMANDO_GLOBAL_TEST
# /exit

# Máquina B - Verificar se vê comando global
ipcom-chat history search "COMANDO_GLOBAL_TEST"

# Máquina A - Modo Local
ipcom-chat --local
# Digite: COMANDO_LOCAL_TEST
# /exit

# Máquina B - NÃO deve ver comando local
ipcom-chat history search "COMANDO_LOCAL_TEST"
# Não deve encontrar!

  ---
📊 FASE 4: MONITORAMENTO E MÉTRICAS

4.1 - Dashboard de Uso

# Estatísticas gerais do sistema
ipcom-chat history stats

# Deve mostrar:
# - Comandos globais: X
# - Comandos de usuário: Y
# - Comandos de máquina: Z
# - Máquinas ativas: N
# - Usuários ativos: M

4.2 - Análise por Usuário

# Para cada usuário importante
ipcom-chat user stats admin
ipcom-chat user stats teste

# Verificar:
# - Total de comandos
# - Dias ativos
# - Último comando
# - Comandos mais usados

4.3 - Análise por Máquina

# Listar todas as máquinas
ipcom-chat machine list

# Verificar:
# - Quantas máquinas registradas
# - Último acesso de cada uma
# - Total de comandos por máquina

  ---
🔥 FASE 5: TESTES DE STRESS E RECUPERAÇÃO

5.1 - Teste de Volume

# Script para gerar múltiplos comandos
for i in {1..100}; do
echo "teste comando $i" | ipcom-chat --user admin
done

# Verificar performance
ipcom-chat history stats

5.2 - Teste de Falha de Rede

# Desconectar internet temporariamente
# (ou bloquear acesso ao Turso no firewall)

# Tentar usar o sistema
ipcom-chat --user admin
# Deve funcionar em modo offline/cache

# Reconectar
# Verificar se sincroniza automaticamente

5.3 - Teste de Concorrência

# Em 3 terminais simultâneos na mesma máquina
# Terminal 1:
ipcom-chat --user user1

# Terminal 2:
ipcom-chat --user user2

# Terminal 3:
ipcom-chat --user user3

# Executar comandos simultaneamente
# Verificar se não há conflitos

  ---
✅ CHECKLIST FINAL DE VALIDAÇÃO

Funcionalidades Core

- Criação e listagem de usuários funciona
- Registro de máquinas funciona
- Modo interativo responde corretamente
- Histórico é salvo no Turso
- Busca no histórico retorna resultados
- Exportação gera arquivos válidos

Sincronização Multi-Máquina

- Comandos globais visíveis em todas as máquinas
- Comandos de usuário sincronizam entre máquinas
- Comandos locais ficam apenas na máquina
- Modo híbrido acessa todos os históricos

Performance

- Resposta rápida (< 2 segundos)
- Funciona offline com cache
- Suporta múltiplos usuários simultâneos
- Não há vazamento de memória

Deployment

- Script de deployment funciona
- Máquinas são registradas automaticamente
- Configuração Turso é aplicada corretamente
- Comandos ficam disponíveis no PATH

  ---
🚨 PROBLEMAS COMUNS E SOLUÇÕES

Erro: "Turso não configurado"

node libs/turso-setup.js

Erro: "Usuário não encontrado"

ipcom-chat user create --username USER --name "Nome" --email email@ipcom.com.br

Erro: "Comando não encontrado"

# Verificar instalação
ls ~/.mcp-terminal/
which ipcom-chat

# Re-executar setup se necessário
node setup.js

Erro de Conexão com Turso

# Verificar token e URL
cat ~/.mcp-terminal/turso-config.json

# Testar conexão
node libs/turso-client.js test

  ---
📝 RELATÓRIO DE TESTES

Após completar todos os testes, documente:

1. Quantas máquinas testadas: ___
2. Quantos usuários criados: ___
3. Total de comandos executados: ___
4. Tempo médio de resposta: ___
5. Problemas encontrados: ___
6. Problemas resolvidos: ___
7. Status final: [ ] Aprovado [ ] Reprovado

Data: //___
Responsável: _______________
