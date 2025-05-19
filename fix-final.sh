#!/bin/bash
# Script final para corrigir o problema do MCP Assistant

# Diretório de instalação do MCP
MCP_DIR=~/.mcp-terminal

# Backup do arquivo original
if [ ! -f $MCP_DIR/mcp-assistant.js.original ]; then
  cp $MCP_DIR/mcp-assistant.js $MCP_DIR/mcp-assistant.js.original
  echo "✅ Backup original criado como mcp-assistant.js.original"
fi

# Copiar o script simplificado para o diretório de instalação
cp /home/ipcom/mcp/mcp-devops/mcp-simple.js $MCP_DIR/mcp-simple.js
chmod +x $MCP_DIR/mcp-simple.js
echo "✅ Script mcp-simple.js copiado e configurado"

# Substituir o conteúdo do mcp-assistant.js por um redirecionador
cat > $MCP_DIR/mcp-assistant.js << 'EOF'
#!/usr/bin/env node
// Script para redirecionar para o mcp-simple.js

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const simplePath = path.join(__dirname, 'mcp-simple.js');

// Obter os argumentos da linha de comando
const args = process.argv.slice(2);

// Executar o script simplificado com os mesmos argumentos
const child = spawn('node', [simplePath, ...args], {
  stdio: 'inherit', // Importante para mostrar saída corretamente
});

// Aguardar a conclusão
child.on('exit', (code) => {
  process.exit(code);
});
EOF

chmod +x $MCP_DIR/mcp-assistant.js
echo "✅ Script mcp-assistant.js substituído por um redirecionador"

echo "✅ Correção final concluída com sucesso"
echo ""
echo "📋 Teste com: ask \"como listar arquivos por tamanho\""
echo "📋 Se você quiser restaurar o original, execute:"
echo "   cp $MCP_DIR/mcp-assistant.js.original $MCP_DIR/mcp-assistant.js"