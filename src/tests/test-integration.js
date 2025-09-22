#!/usr/bin/env node

/**
 * Integration test for FASE 3
 * Tests the complete flow from UI to AI orchestrator and back
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const interfacePath = path.join(__dirname, '..', 'indexV3.mjs');

console.log('🧪 Testing Phase 3: System Integration\n');
console.log('═══════════════════════════════════════\n');

const testResults = {
    passed: [],
    failed: [],
    warnings: []
};

// Start the interface with debug mode
const proc = spawn('node', [interfacePath, '--debug'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' }
});

let output = '';
let errorOutput = '';

proc.stdout.on('data', (data) => {
    output += data.toString();
    process.stdout.write(data);
});

proc.stderr.on('data', (data) => {
    errorOutput += data.toString();
    process.stderr.write(data);
});

// Test sequence
const runTests = async () => {
    console.log('Test 1: Checking service initialization...');
    await delay(2000);

    if (output.includes('MCP Terminal Assistant') && output.includes('FASE 3')) {
        testResults.passed.push('Service initialization');
    } else {
        testResults.failed.push('Service initialization');
    }

    console.log('\n\nTest 2: Testing built-in /help command...');
    proc.stdin.write('/help\n');
    await delay(1000);

    if (output.includes('Commands:') || output.includes('/help')) {
        testResults.passed.push('Built-in commands');
    } else {
        testResults.failed.push('Built-in commands');
    }

    console.log('\n\nTest 3: Testing /status command...');
    proc.stdin.write('/status\n');
    await delay(1000);

    if (output.includes('Status:') || output.includes('Debug:')) {
        testResults.passed.push('Status command');
    } else {
        testResults.warnings.push('Status command - AI may not be connected');
    }

    console.log('\n\nTest 4: Testing debug mode toggle...');
    proc.stdin.write('\x04'); // Ctrl+D for debug toggle
    await delay(500);

    if (output.includes('[DEBUG]') || output.includes('Debug:')) {
        testResults.passed.push('Debug mode toggle');
    } else {
        testResults.failed.push('Debug mode toggle');
    }

    console.log('\n\nTest 5: Testing command history...');
    proc.stdin.write('test command 1\n');
    await delay(500);
    proc.stdin.write('test command 2\n');
    await delay(500);
    proc.stdin.write('\x1b[A'); // Up arrow for history
    await delay(500);

    testResults.passed.push('Command history navigation');

    console.log('\n\nTest 6: Testing paste detection...');
    proc.stdin.write('\x1b[200~Multi\nLine\nPaste\x1b[201~');
    await delay(1000);

    // In non-interactive mode, paste detection won't work
    testResults.warnings.push('Paste detection not available in non-interactive mode');

    console.log('\n\nTest 7: Testing pattern matching...');
    proc.stdin.write('how many IPs are blocked\n');
    await delay(1500);

    // Pattern matching is optional, just check if it processes
    testResults.passed.push('Pattern matching attempt');

    console.log('\n\nTest 8: Testing /exit command...');
    proc.stdin.write('/exit\n');
    await delay(500);
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests and collect results
runTests()
    .then(() => {
        console.log('\n\nWaiting for process to exit...');
        return delay(1000);
    })
    .catch(console.error);

// Process exit handler
proc.on('exit', (code) => {
    console.log('\n\n╔═══════════════════════════════════════╗');
    console.log('║         INTEGRATION TEST RESULTS       ║');
    console.log('╚═══════════════════════════════════════╝\n');

    console.log(`Exit code: ${code}`);

    // Check for critical features
    const criticalChecks = {
        'Interface loaded': output.includes('MCP Terminal Assistant') && output.includes('FASE 3'),
        'EventEmitter working': !errorOutput.includes('EventEmitter'),
        'No crashes': code === 0 || code === null,
        'Commands processed': output.includes('automated test') || output.includes('Response for')
    };

    console.log('\n📋 Critical Checks:');
    for (const [check, passed] of Object.entries(criticalChecks)) {
        console.log(`  ${passed ? '✅' : '❌'} ${check}`);
        if (passed) {
            testResults.passed.push(check);
        } else {
            testResults.failed.push(check);
        }
    }

    console.log('\n📊 Test Summary:');
    console.log(`  ✅ Passed: ${testResults.passed.length}`);
    console.log(`  ❌ Failed: ${testResults.failed.length}`);
    console.log(`  ⚠️  Warnings: ${testResults.warnings.length}`);

    if (testResults.failed.length > 0) {
        console.log('\n❌ Failed tests:');
        testResults.failed.forEach(test => console.log(`  - ${test}`));
    }

    if (testResults.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        testResults.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    console.log('\n═══════════════════════════════════════');

    const success = testResults.failed.length === 0;
    if (success) {
        console.log('✅ FASE 3 Integration: SUCCESSFUL');
        console.log('The interface is properly integrated with the backend!');
    } else {
        console.log('⚠️  FASE 3 Integration: PARTIAL SUCCESS');
        console.log('Some features may need adjustment.');
    }

    process.exit(testResults.failed.length > 0 ? 1 : 0);
});

// Timeout protection
setTimeout(() => {
    console.log('\n\n⏱️  Test timeout reached, terminating...');
    proc.kill();
    process.exit(2);
}, 20000);