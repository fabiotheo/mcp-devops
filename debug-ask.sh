#!/bin/bash

# Script para depurar o comando ask
echo "🔍 Iniciando diagnóstico do MCP Terminal Assistant..."

# Verificar a versão do Node.js
echo "📊 Versão do Node.js:"
node -v

# Verificar existência e permissões do script
echo -e "\n📄 Verificando script principal:"
ls -la /root/.local/bin/ask
ls -la /root/.mcp-terminal/mcp-assistant.js

# Testar carregamento de módulos
echo -e "\n🧪 Testando carregamento de módulos:"
cd /root/.mcp-terminal
NODE_DEBUG=module node -e "import { Anthropic } from '@anthropic-ai/sdk'; console.log('✅ Módulo @anthropic-ai/sdk carregado com sucesso');" 2>&1

# Depurar com maior nível de detalhes
echo -e "\n🔎 Executando ask em modo detalhado:"
cd /root
DEBUG=* node /root/.mcp-terminal/mcp-assistant.js "como listar arquivos por tamanho" --debug

# Verificar conteúdo da pasta node_modules
echo -e "\n📂 Verificando módulos instalados:"
ls -la /root/.mcp-terminal/node_modules/@anthropic-ai 2>/dev/null || echo "❌ Diretório @anthropic-ai não encontrado"

# Verificar saída script para linha de comando
echo -e "\n📝 Verificando configuração do ask:"
cat /root/.local/bin/ask

# Sugestão de correção
echo -e "\n🔧 Criando versão corrigida do comando ask:"
cat > /tmp/fixed-ask << 'EOF'
#!/bin/bash
cd /root
node /root/.mcp-terminal/mcp-assistant.js "$@"
EOF

echo "✅ Diagnóstico concluído!"
echo "Para instalar a versão corrigida do comando ask, execute:"
echo "sudo cp /tmp/fixed-ask /usr/local/bin/ask && sudo chmod +x /usr/local/bin/ask"