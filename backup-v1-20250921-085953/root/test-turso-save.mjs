import TursoAdapter from './interface-v2/bridges/adapters/TursoAdapter.js';

async function testTursoSave() {
    console.log('=================================');
    console.log('  Teste de Salvamento no Turso');
    console.log('=================================\n');

    const adapter = new TursoAdapter({
        debug: true,
        userId: 'fabio'
    });

    try {
        console.log('1. Inicializando TursoAdapter...');
        await adapter.initialize();

        if (!adapter.isConnected()) {
            console.log('❌ TursoAdapter não conseguiu conectar');
            return;
        }
        console.log('✅ TursoAdapter conectado\n');

        // Gerar request_id único
        const requestId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        console.log('2. Salvando pergunta com status e request_id...');
        console.log('   Request ID:', requestId);
        console.log('   Command: "Teste de salvamento direto"');
        console.log('   Status: pending\n');

        const entryId = await adapter.saveQuestionWithStatusAndRequestId(
            'Teste de salvamento direto',
            'pending',
            requestId
        );

        if (entryId) {
            console.log('✅ Pergunta salva com ID:', entryId);
        } else {
            console.log('❌ Falha ao salvar pergunta');
            return;
        }

        console.log('\n3. Atualizando status para processing...');
        await adapter.updateStatus(entryId, 'processing');
        console.log('✅ Status atualizado');

        console.log('\n4. Simulando resposta...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        await adapter.updateWithResponseAndStatus(
            entryId,
            'Esta é uma resposta de teste',
            'completed'
        );
        console.log('✅ Resposta salva e status atualizado para completed');

        console.log('\n5. Verificando no banco...');
        const history = await adapter.getHistory(5);
        console.log(`✅ Últimos ${history.length} registros no histórico:`);

        history.forEach((entry, i) => {
            console.log(`\n   ${i + 1}. ${entry.command?.substring(0, 50) || 'N/A'}`);
            console.log(`      Status: ${entry.status || 'N/A'}`);
            console.log(`      Request ID: ${entry.request_id || 'N/A'}`);
            console.log(`      Response: ${entry.response ? 'Sim' : 'Não'}`);
        });

        console.log('\n6. Verificando status por request_id...');
        const status = await adapter.getStatusByRequestId(requestId);
        console.log(`   Status do request ${requestId}: ${status}`);

    } catch (error) {
        console.error('❌ Erro durante teste:', error);
        console.error(error.stack);
    } finally {
        await adapter.cleanup();
        console.log('\n✅ Teste concluído');
    }
}

testTursoSave().catch(console.error);