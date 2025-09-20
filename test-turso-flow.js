#!/usr/bin/env node

import TursoAdapter from './interface-v2/bridges/adapters/TursoAdapter.js';

async function test() {
    console.log('Testing Turso save flow...\n');

    const adapter = new TursoAdapter({
        debug: true,
        userId: 'fabio'
    });

    try {
        // Initialize
        console.log('1. Initializing Turso adapter...');
        await adapter.initialize();

        if (!adapter.isConnected()) {
            console.log('❌ Turso not connected');
            return;
        }

        // Save question immediately
        console.log('\n2. Saving question without response...');
        const entryId = await adapter.saveQuestion('Test question: What is the weather?');
        console.log(`   Entry ID: ${entryId}`);

        if (!entryId) {
            console.log('❌ Failed to save question');
            return;
        }

        // Simulate processing delay
        console.log('\n3. Simulating AI processing (2 seconds)...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Update with response
        console.log('\n4. Updating with response...');
        const updateSuccess = await adapter.updateWithResponse(entryId, 'The weather is sunny today.');
        console.log(`   Update success: ${updateSuccess}`);

        // Test cancellation flow
        console.log('\n5. Testing cancellation flow...');
        const cancelId = await adapter.saveQuestion('Test cancelled question');
        console.log(`   Saved question with ID: ${cancelId}`);

        console.log('   Marking as cancelled...');
        const cancelSuccess = await adapter.markAsCancelled(cancelId);
        console.log(`   Cancel success: ${cancelSuccess}`);

        // Get history to verify
        console.log('\n6. Fetching recent history...');
        const history = await adapter.getHistory(5);
        console.log(`   Found ${history.length} entries:`);
        history.forEach(h => {
            console.log(`   - ${h.command.substring(0, 50)}... | Response: ${h.response ? h.response.substring(0, 30) + '...' : 'null'}`);
        });

        console.log('\n✅ Test complete!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await adapter.cleanup();
    }
}

test();