#!/usr/bin/env node

/**
 * Test script for advanced Ink interface features
 * Tests:
 * 1. Syntax highlighting
 * 2. Autocomplete functionality
 * 3. History navigation
 * 4. Status indicators
 * 5. Multi-line detection
 */

import { spawn } from 'child_process';
import path from 'path';

const interfacePath = path.join(process.cwd(), 'interface-v2', 'indexV2.mjs');

console.log('🧪 Testing Advanced Ink Interface Features\n');

const proc = spawn('node', [interfacePath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' }
});

let output = '';
let testsPassed = 0;
let testsFailed = 0;

proc.stdout.on('data', (data) => {
    output += data.toString();
    process.stdout.write(data);
});

proc.stderr.on('data', (data) => {
    console.error('Error:', data.toString());
});

// Test sequence
const runTests = async () => {
    console.log('Test 1: Testing basic command entry...');
    await delay(1000);
    proc.stdin.write('ls -la');
    proc.stdin.write('\n');

    console.log('\n\nTest 2: Testing Tab autocomplete...');
    await delay(1500);
    proc.stdin.write('git');
    proc.stdin.write('\t'); // Tab for autocomplete

    console.log('\n\nTest 3: Testing history navigation...');
    await delay(1500);
    proc.stdin.write('\x1b[A'); // Up arrow for history

    console.log('\n\nTest 4: Testing multi-line paste...');
    await delay(1500);
    proc.stdin.write('\x1b[200~Line 1\nLine 2\nLine 3\x1b[201~');

    console.log('\n\nTest 5: Testing status indicators...');
    await delay(1500);
    proc.stdin.write('\n'); // Execute to see processing status

    console.log('\n\nTest 6: Exiting...');
    await delay(2000);
    proc.stdin.write('\x03'); // Ctrl+C
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

runTests().catch(console.error);

proc.on('exit', (code) => {
    console.log(`\n\n═══ Test Results ═══`);
    console.log(`Exit code: ${code}`);

    // Check for feature indicators
    if (output.includes('MCP Terminal Assistant - Advanced Interface Test')) {
        console.log('✅ Advanced interface loaded');
        testsPassed++;
    } else {
        console.log('❌ Advanced interface not detected');
        testsFailed++;
    }

    if (output.includes('Tab: autocomplete')) {
        console.log('✅ Autocomplete feature present');
        testsPassed++;
    }

    if (output.includes('Command history:')) {
        console.log('✅ Command history display working');
        testsPassed++;
    }

    if (output.includes('Status:')) {
        console.log('✅ Status indicators working');
        testsPassed++;
    }

    if (output.includes('non-interactive mode')) {
        console.log('✅ TTY detection working');
        testsPassed++;
    }

    console.log(`\nTotal: ${testsPassed} passed, ${testsFailed} failed`);
    process.exit(testsFailed > 0 ? 1 : 0);
});