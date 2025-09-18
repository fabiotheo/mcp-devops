#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import AppV3 from './components/AppV3.jsx';

// Parse command line arguments
const debugMode = process.argv.includes('--debug') || process.env.DEBUG === 'true';

// Clear console and show app
console.clear();

console.log('Starting MCP Terminal Assistant v3...\n');

const { waitUntilExit } = render(<AppV3 debugMode={debugMode} />);

waitUntilExit().then(() => {
    console.log('\nGoodbye! 👋');
    process.exit(0);
}).catch(error => {
    console.error('\nError:', error);
    process.exit(1);
});