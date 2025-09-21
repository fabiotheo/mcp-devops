#!/usr/bin/env node

/**
 * Test terminal paste capabilities
 */

console.log('=== Terminal Paste Test ===\n');
console.log('Enabling bracketed paste mode...');

// Enable bracketed paste mode
process.stdout.write('\x1b[?2004h');

console.log('Paste mode enabled.\n');
console.log('Try pasting some text with multiple lines.\n');
console.log('Press Ctrl+C to exit.\n');

// Set raw mode
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

let buffer = '';
let inPaste = false;

process.stdin.on('data', (chunk) => {
    // Show raw bytes
    console.log('Received:', Array.from(chunk).map(c => {
        const code = c.charCodeAt(0);
        if (code < 32 || code > 126) {
            return `\\x${code.toString(16).padStart(2, '0')}`;
        }
        return c;
    }).join(''));

    // Process the paste in one chunk
    if (chunk.includes('\x1b[200~') && chunk.includes('\x1b[201~')) {
        console.log('>>> COMPLETE PASTE DETECTED');
        const start = chunk.indexOf('\x1b[200~') + 6;
        const end = chunk.indexOf('\x1b[201~');
        const content = chunk.substring(start, end);

        // Convert \r to \n for display
        const displayContent = content.replace(/\r/g, '\n');
        console.log('Pasted content:');
        console.log(displayContent);
        console.log('---');
        return;
    }

    // Check for paste markers (multi-chunk paste)
    if (chunk.includes('\x1b[200~')) {
        console.log('>>> PASTE START DETECTED');
        inPaste = true;
        const start = chunk.indexOf('\x1b[200~') + 6;
        buffer = chunk.substring(start);
    } else if (chunk.includes('\x1b[201~')) {
        console.log('>>> PASTE END DETECTED');
        const end = chunk.indexOf('\x1b[201~');
        buffer += chunk.substring(0, end);
        const displayContent = buffer.replace(/\r/g, '\n');
        console.log('Pasted content:');
        console.log(displayContent);
        console.log('---');
        inPaste = false;
        buffer = '';
    } else if (inPaste) {
        buffer += chunk;
    }

    // Exit on Ctrl+C
    if (chunk === '\x03') {
        console.log('\nDisabling bracketed paste mode...');
        process.stdout.write('\x1b[?2004l');
        process.exit(0);
    }
});

process.on('exit', () => {
    // Cleanup
    process.stdout.write('\x1b[?2004l');
});