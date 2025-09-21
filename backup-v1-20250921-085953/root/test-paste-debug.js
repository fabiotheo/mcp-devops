#!/usr/bin/env node

/**
 * Debug script para entender o problema do paste
 */

console.log('=== Debug de Paste na Interface ===\n');
console.log('Este script vai mostrar exatamente o que é recebido quando você cola.\n');
console.log('Habilitando bracketed paste mode...');

// Enable bracketed paste mode
process.stdout.write('\x1b[?2004h');

console.log('Modo de paste habilitado.\n');
console.log('1. Cole algum texto agora (Cmd+V ou Ctrl+V)');
console.log('2. Pressione Ctrl+C para sair\n');

// Set raw mode
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

let buffer = '';
let charCount = 0;

process.stdin.on('data', (chunk) => {
    charCount++;

    // Mostra o que foi recebido
    console.log(`\n[Recebido #${charCount}]:`);
    console.log('  Raw:', JSON.stringify(chunk));
    console.log('  Bytes:', Array.from(chunk).map(c => {
        const code = c.charCodeAt(0);
        return `0x${code.toString(16).padStart(2, '0')}`;
    }).join(' '));

    // Detecta bracketed paste
    if (chunk.includes('\x1b[200~')) {
        console.log('  >>> INÍCIO DE PASTE DETECTADO!');
    }
    if (chunk.includes('\x1b[201~')) {
        console.log('  >>> FIM DE PASTE DETECTADO!');
    }

    // Processa paste completo em um chunk
    if (chunk.includes('\x1b[200~') && chunk.includes('\x1b[201~')) {
        console.log('\n✅ PASTE COMPLETO EM UM CHUNK!');
        const start = chunk.indexOf('\x1b[200~') + 6;
        const end = chunk.indexOf('\x1b[201~');
        const content = chunk.substring(start, end);

        console.log('Conteúdo extraído:');
        console.log('---');
        console.log(content.replace(/\r/g, '\\r\n').replace(/\n/g, '\\n\n'));
        console.log('---');

        console.log('\nConteúdo processado (\\r → \\n):');
        console.log('---');
        console.log(content.replace(/\r/g, '\n'));
        console.log('---');
    }

    // Exit on Ctrl+C
    if (chunk === '\x03') {
        console.log('\nDesabilitando bracketed paste mode...');
        process.stdout.write('\x1b[?2004l');
        process.exit(0);
    }
});

process.on('exit', () => {
    process.stdout.write('\x1b[?2004l');
});