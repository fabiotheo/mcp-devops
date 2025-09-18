#!/usr/bin/env node

import React from 'react';
import { render, Text, Box } from 'ink';
import { useState, useEffect } from 'react';

// Simple test app component
const App = () => {
    const [counter, setCounter] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCounter(prev => prev + 1);
        }, 1000);

        // Stop after 5 seconds
        setTimeout(() => {
            clearInterval(timer);
            process.exit(0);
        }, 5000);

        return () => clearInterval(timer);
    }, []);

    return React.createElement(Box, { flexDirection: 'column', padding: 1 },
        React.createElement(Text, { color: 'green' }, '✨ MCP Terminal Assistant - New Interface Test'),
        React.createElement(Text, { color: 'yellow' }, 'FASE 1: Basic Interface Working!'),
        React.createElement(Text, null, `Counter: ${counter}`),
        React.createElement(Text, { dimColor: true }, 'Test will exit in 5 seconds...')
    );
};

// Clear console and show app
console.clear();

const { waitUntilExit } = render(React.createElement(App));

waitUntilExit().then(() => {
    console.log('\nTest completed successfully! ✅');
    process.exit(0);
}).catch(error => {
    console.error('Error:', error);
    process.exit(1);
});