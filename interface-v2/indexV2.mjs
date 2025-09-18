#!/usr/bin/env node

import React from 'react';
import { render, Text, Box, useInput, useApp } from 'ink';
import { useState, useEffect } from 'react';

// Advanced test app with input handling
const AppV2 = () => {
    const [input, setInput] = useState('');
    const [history, setHistory] = useState([]);
    const [status, setStatus] = useState('ready');
    const [isTTY] = useState(process.stdin.isTTY);
    const { exit } = useApp();

    // Only use input handler if we're in TTY mode
    if (isTTY) {
        useInput((input, key) => {
            if (key.return) {
                if (input === 'exit' || input === 'quit') {
                    exit();
                }
                setHistory(prev => [...prev, `> ${input}`]);
                setInput('');
            } else if (key.backspace || key.delete) {
                setInput(prev => prev.slice(0, -1));
            } else if (key.ctrl && key.c) {
                exit();
            } else if (input) {
                setInput(prev => prev + input);
            }
        });
    }

    useEffect(() => {
        // Auto-exit after 5 seconds for testing (shorter for automated tests)
        const timer = setTimeout(() => {
            setStatus('Auto-exiting...');
            setTimeout(() => exit(), 1000);
        }, isTTY ? 10000 : 5000);

        // Simulate some activity if not in TTY mode
        if (!isTTY) {
            setTimeout(() => {
                setHistory(['> test command 1', '< response 1']);
                setStatus('processing');
            }, 1000);
            setTimeout(() => {
                setHistory(prev => [...prev, '> test command 2', '< response 2']);
                setStatus('ready');
            }, 2500);
        }

        return () => clearTimeout(timer);
    }, [exit, isTTY]);

    return React.createElement(Box, { flexDirection: 'column', padding: 1 },
        React.createElement(Text, { color: 'green', bold: true }, '✨ MCP Terminal Assistant - Advanced Interface Test'),
        React.createElement(Text, { color: 'yellow' }, 'FASE 2: Advanced Features with Input Handling'),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, null, 'Status: '),
            React.createElement(Text, { color: 'cyan' }, status),
            !isTTY && React.createElement(Text, { color: 'gray' }, ' (non-interactive mode)')
        ),
        React.createElement(Box, { marginTop: 1, flexDirection: 'column' },
            React.createElement(Text, { dimColor: true }, 'Command history:'),
            history.length === 0 ?
                React.createElement(Text, { color: 'gray' }, 'No commands yet...') :
                history.map((line, i) =>
                    React.createElement(Text, { key: i }, line)
                )
        ),
        isTTY ?
            React.createElement(Box, { marginTop: 1 },
                React.createElement(Text, null, '$ '),
                React.createElement(Text, { color: 'white' }, input),
                React.createElement(Text, { color: 'gray' }, '█')
            ) :
            React.createElement(Box, { marginTop: 1 },
                React.createElement(Text, { dimColor: true }, 'Running in non-interactive mode...')
            ),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { dimColor: true },
                isTTY ? 'Type "exit" to quit, or wait 10 seconds for auto-exit' :
                       'Auto-exit in 5 seconds')
        )
    );
};

// Clear console and show app
console.clear();

const { waitUntilExit } = render(React.createElement(AppV2));

waitUntilExit().then(() => {
    console.log('\nFASE 2 test completed successfully! ✅');
    process.exit(0);
}).catch(error => {
    console.error('Error:', error);
    process.exit(1);
});