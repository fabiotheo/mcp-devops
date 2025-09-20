#!/usr/bin/env node

import AICommandOrchestrator from './ai_orchestrator.js';
import chalk from 'chalk';

// Mock AI Model
class MockAIModel {
    async initialize() {
        console.log('Mock AI initialized');
    }

    async askCommand(prompt, context, options) {
        console.log(chalk.blue('AI called with prompt'));

        // Simulate delay for cancellation
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if aborted
        if (context?.signal?.aborted) {
            throw new Error('Request aborted');
        }

        return '{"commands": ["echo test"]}';
    }
}

// Mock Command Executor
class MockCommandExecutor {
    async executeCommand(command) {
        console.log(chalk.gray(`Executing: ${command}`));
        return { output: 'test output', success: true };
    }
}

// Test function
async function testCancellation() {
    console.log(chalk.yellow('\n=== Testing Cancellation Support ===\n'));

    const ai = new MockAIModel();
    const executor = new MockCommandExecutor();
    const orchestrator = new AICommandOrchestrator(ai, executor);

    // Create AbortController
    const abortController = new AbortController();

    // Set up context with signal
    const context = {
        signal: abortController.signal,
        os: 'Linux',
        distro: 'Ubuntu',
        history: []
    };

    // Start orchestration
    const promise = orchestrator.orchestrateExecution(
        'Test question',
        context
    );

    // Cancel after a short delay
    setTimeout(() => {
        console.log(chalk.red('\n🛑 Triggering abort...\n'));
        abortController.abort();
    }, 50);

    // Wait for result
    try {
        const result = await promise;

        // Check if result shows cancellation
        if (result.success === false && result.error && result.error.toLowerCase().includes('abort')) {
            console.log(chalk.green('\n✅ SUCCESS: Orchestration was properly cancelled'));
            console.log('Error in result:', result.error);
            process.exit(0);
        } else {
            console.log(chalk.red('\n❌ FAIL: Orchestration completed when it should have been cancelled'));
            console.log('Result:', result);
            process.exit(1);
        }
    } catch (error) {
        if (error.message.toLowerCase().includes('abort')) {
            console.log(chalk.green('\n✅ SUCCESS: Orchestration was properly cancelled (via exception)'));
            console.log('Error message:', error.message);
            process.exit(0);
        } else {
            console.log(chalk.red('\n❌ FAIL: Unexpected error'));
            console.log('Error:', error);
            process.exit(1);
        }
    }
}

// Run test
testCancellation().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});