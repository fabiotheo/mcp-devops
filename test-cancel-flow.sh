#!/bin/bash

echo "================================="
echo "  Teste de Cancelamento com ESC"
echo "================================="
echo ""

# Test 1: Send message and cancel
echo "1. Enviando mensagem e cancelando com ESC..."
(
    echo "Teste de cancelamento com ESC - mensagem longa que deve ser cancelada"
    sleep 0.5
    # Send ESC
    printf '\033'
    sleep 1
) | timeout 3 node interface-v2/mcp-ink-cli.mjs --user fabio --debug 2>&1 | grep -E "Turso|cancelled|request_id|saved"

echo ""
echo "2. Verificando no banco Turso..."
node -e "
import TursoAdapter from './interface-v2/bridges/adapters/TursoAdapter.js';

const adapter = new TursoAdapter({ debug: false, userId: 'fabio' });
await adapter.initialize();

const history = await adapter.getHistory(3);
console.log('Últimos 3 registros:');
history.forEach((entry, i) => {
    console.log(\`  \${i+1}. \${entry.command?.substring(0, 50) || 'N/A'}\`);
    console.log(\`     Status: \${entry.status || 'N/A'}\`);
    console.log(\`     Request ID: \${entry.request_id || 'N/A'}\`);
    console.log(\`     Response: \${entry.response ? entry.response.substring(0, 30) + '...' : 'Nenhuma'}\`);
    console.log('');
});

await adapter.cleanup();
"

echo "================================="
echo "         Teste concluído"
echo "================================="