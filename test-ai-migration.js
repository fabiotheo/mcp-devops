#!/usr/bin/env node

// Test AI models migration
import ModelFactory from './interface-v2/ai_models/model_factory.js';
import fs from 'fs/promises';
import path from 'path';

async function test() {
    console.log('🧪 Testing AI models migration...\n');

    // Load config
    const configPath = path.join(process.env.HOME, '.mcp-terminal/config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    console.log('1. Configuration:');
    console.log(`   Provider: ${config.provider}`);
    console.log(`   Model: ${config.claude_model}`);
    console.log(`   Use native tools: ${config.use_native_tools}`);
    console.log(`   Enable bash tool: ${config.enable_bash_tool}\n`);

    // Create model
    console.log('2. Creating AI model...');
    try {
        const model = await ModelFactory.createModel(config);
        console.log(`   ✓ Model created: ${model.constructor.name}`);

        // Check tools support
        if (model.supportsTools) {
            const supports = model.supportsTools();
            console.log(`   ✓ Supports tools: ${supports}`);
        } else {
            console.log(`   ✗ No supportsTools method`);
        }

        // Test basic ask
        console.log('\n3. Testing basic ask...');
        if (model.askCommand) {
            const result = await model.askCommand('Say "Hello from test"', {});
            console.log(`   ✓ Response received: ${result.response ? result.response.substring(0, 50) + '...' : 'No response'}`);
        }

        console.log('\n✅ All tests passed!');
    } catch (error) {
        console.error(`   ✗ Error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

test().catch(console.error);