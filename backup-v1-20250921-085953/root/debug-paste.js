#!/usr/bin/env node

// Debug script to understand paste behavior

console.log('PASTE DEBUG - Cole seu texto de múltiplas linhas:');
console.log('=========================================');
console.log('');

process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');

let buffer = '';
let inputCount = 0;

process.stdin.on('data', (key) => {
    inputCount++;

    // Ctrl+C to exit
    if (key === '\x03') {
        console.log('\n\nBye!');
        process.exit(0);
    }

    // Analyze the input
    console.log(`\n=== Input #${inputCount} ===`);
    console.log('Length:', key.length);
    console.log('Raw:', JSON.stringify(key));
    console.log('Contains \\n:', key.includes('\n'));
    console.log('Contains \\r:', key.includes('\r'));
    console.log('Contains \\r\\n:', key.includes('\r\n'));

    // Show character codes
    console.log('Char codes:', Array.from(key).map(c => c.charCodeAt(0)));

    // Try to split by different line endings
    const linesByN = key.split('\n');
    const linesByR = key.split('\r');
    const linesByRN = key.split('\r\n');

    console.log('Split by \\n:', linesByN.length, 'parts');
    console.log('Split by \\r:', linesByR.length, 'parts');
    console.log('Split by \\r\\n:', linesByRN.length, 'parts');

    // Show first few "lines" if split works
    if (linesByR.length > 1) {
        console.log('First 3 lines (split by \\r):');
        linesByR.slice(0, 3).forEach((line, i) => {
            console.log(`  ${i}: "${line}"`);
        });
    }

    buffer += key;
});

console.log('Press Ctrl+C to exit\n');