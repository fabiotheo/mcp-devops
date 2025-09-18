#!/usr/bin/env node

/**
 * Test script for basic Ink interface functionality
 * Tests:
 * 1. Basic input/output
 * 2. Paste detection (critical - must NOT auto-execute)
 * 3. Multi-line paste handling
 */

import { spawn } from 'child_process';
import path from 'path';

const interfacePath = path.join(process.cwd(), 'interface-v2', 'index.mjs');

console.log('🧪 Testing Ink Interface - Basic Functionality\n');

// Test 1: Basic execution
console.log('Test 1: Starting interface...');
const proc = spawn('node', [interfacePath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' }
});

let output = '';
proc.stdout.on('data', (data) => {
    output += data.toString();
    process.stdout.write(data);
});

proc.stderr.on('data', (data) => {
    console.error('Error:', data.toString());
});

// Test 2: Send regular input
setTimeout(() => {
    console.log('\n\nTest 2: Sending regular text...');
    proc.stdin.write('hello world');
}, 1000);

// Test 3: Simulate paste with bracketed paste mode
setTimeout(() => {
    console.log('\n\nTest 3: Simulating paste (should NOT auto-execute)...');
    // Send bracketed paste sequence
    proc.stdin.write('\x1b[200~This is\nmulti-line\npasted text\x1b[201~');
}, 2000);

// Test 4: Check that paste didn't auto-execute
setTimeout(() => {
    console.log('\n\nTest 4: Verifying paste is in buffer (not executed)...');
    // The pasted text should be visible but NOT executed
    // Now press Enter to execute
    proc.stdin.write('\n');
}, 3000);

// Test 5: Exit
setTimeout(() => {
    console.log('\n\nTest 5: Sending Ctrl+C to exit...');
    proc.stdin.write('\x03'); // Ctrl+C
}, 4000);

proc.on('exit', (code) => {
    console.log(`\n✅ Interface exited with code: ${code}`);

    // Analyze results
    console.log('\n📊 Test Results:');
    if (output.includes('[PASTING...]')) {
        console.log('✅ Paste detection working');
    } else {
        console.log('❌ Paste detection may not be working');
    }

    if (!output.includes('Received: "This is"')) {
        console.log('✅ Multi-line paste NOT auto-executed (correct behavior)');
    } else {
        console.log('❌ Multi-line paste was auto-executed (BUG!)');
    }

    process.exit(code);
});