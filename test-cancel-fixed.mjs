import TursoAdapter from './interface-v2/bridges/adapters/TursoAdapter.js';

async function testCancellation() {
    console.log('=================================');
    console.log('  Verificando Correções do ESC');
    console.log('=================================\n');

    const adapter = new TursoAdapter({
        debug: false,
        userId: 'fabio'
    });

    try {
        await adapter.initialize();

        // Buscar últimos registros
        const history = await adapter.getHistory(5);

        console.log(`Últimos ${history.length} registros:\n`);

        history.forEach((entry, i) => {
            const command = entry.command?.substring(0, 40) || 'N/A';
            const status = entry.status || 'N/A';
            const hasResponse = entry.response ? 'Sim' : 'Não';
            const requestId = entry.request_id?.substring(0, 20) || 'N/A';

            // Highlight status with colors
            let statusDisplay = status;
            if (status === 'cancelled') {
                statusDisplay = `\x1b[33m${status}\x1b[0m`; // Yellow
            } else if (status === 'completed') {
                statusDisplay = `\x1b[32m${status}\x1b[0m`; // Green
            } else if (status === 'processing') {
                statusDisplay = `\x1b[31m${status}\x1b[0m`; // Red - problema!
            }

            console.log(`${i+1}. ${command}...`);
            console.log(`   Status: ${statusDisplay}`);
            console.log(`   Request: ${requestId}...`);
            console.log(`   Response: ${hasResponse}`);

            if (status === 'processing') {
                console.log(`   ⚠️  PROBLEMA: Este registro deveria estar 'cancelled' ou 'completed'`);
            }

            console.log('');
        });

        // Verificar registros problemáticos
        const processingCount = history.filter(h => h.status === 'processing').length;
        if (processingCount > 0) {
            console.log(`\n❌ PROBLEMA: ${processingCount} registro(s) ficaram em 'processing'`);
            console.log('   Isso indica que o cancelamento não está funcionando corretamente.\n');
        } else {
            console.log('✅ Todos os registros têm status final (completed ou cancelled)\n');
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await adapter.cleanup();
    }
}

console.log('Execute este script APÓS testar o cancelamento com ESC na interface.\n');
testCancellation().catch(console.error);