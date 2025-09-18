#!/usr/bin/env node

import React from 'react';
import { render, Text, Box, useInput, useApp } from 'ink';
import { useState, useEffect, useRef } from 'react';
import Spinner from 'ink-spinner';

// Full integration test app
const AppV3 = () => {
    const [input, setInput] = useState('');
    const [history, setHistory] = useState([]);
    const [status, setStatus] = useState('initializing');
    const [isLoading, setIsLoading] = useState(false);
    const [response, setResponse] = useState('');
    const [isTTY] = useState(process.stdin.isTTY);
    const { exit } = useApp();
    const isDebug = process.argv.includes('--debug');

    // Only use input handler if we're in TTY mode
    if (isTTY) {
        useInput((input, key) => {
            if (key.return) {
                const command = input.trim();
                if (command === 'exit' || command === 'quit' || command === '/exit') {
                    exit();
                } else if (command === '/help') {
                    setResponse('Commands: /help, /status, /debug, /exit');
                } else if (command === '/status') {
                    setResponse(`Status: ${status}, Debug: ${isDebug}`);
                } else if (command === '/debug') {
                    setResponse('Debug mode: ' + (isDebug ? 'ON' : 'OFF'));
                } else if (command) {
                    setHistory(prev => [...prev, `> ${command}`]);
                    simulateProcessing(command);
                }
                setInput('');
            } else if (key.backspace || key.delete) {
                setInput(prev => prev.slice(0, -1));
            } else if (key.ctrl && key.c) {
                exit();
            } else if (input && !key.ctrl && !key.meta) {
                setInput(prev => prev + input);
            }
        });
    }

    const simulateProcessing = (command) => {
        setIsLoading(true);
        setStatus('processing');
        setResponse('');

        setTimeout(() => {
            setResponse(`Processed: "${command}" - Response would come from backend here`);
            setHistory(prev => [...prev, `< Response for: ${command}`]);
            setIsLoading(false);
            setStatus('ready');
        }, 1500);
    };

    useEffect(() => {
        setTimeout(() => {
            setStatus('ready');
        }, 1000);

        // Simulate automated test if not in TTY mode
        if (!isTTY) {
            setTimeout(() => {
                setHistory(['> automated test 1']);
                simulateProcessing('automated test 1');
            }, 1500);

            setTimeout(() => {
                setHistory(prev => [...prev, '> automated test 2']);
                simulateProcessing('automated test 2');
            }, 3500);
        }

        // Auto-exit after different times based on mode
        const exitTime = isTTY ? 15000 : 7000;
        const timer = setTimeout(() => {
            setStatus('Auto-exiting...');
            setTimeout(() => exit(), 1000);
        }, exitTime);

        return () => clearTimeout(timer);
    }, [exit, isTTY]);

    return React.createElement(Box, { flexDirection: 'column', padding: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { color: 'green', bold: true }, '✨ MCP Terminal Assistant'),
            React.createElement(Text, { color: 'gray' }, ' - '),
            React.createElement(Text, { color: 'yellow' }, 'FASE 3: Full Integration Test')
        ),

        React.createElement(Box, null,
            React.createElement(Text, null, 'Status: '),
            React.createElement(Text, {
                color: status === 'ready' ? 'green' :
                       status === 'processing' ? 'yellow' :
                       status === 'initializing' ? 'cyan' : 'gray'
            }, status),
            isDebug && React.createElement(Text, { color: 'magenta' }, ' [DEBUG]'),
            !isTTY && React.createElement(Text, { color: 'gray' }, ' (non-interactive)')
        ),

        React.createElement(Box, { marginTop: 1, flexDirection: 'column', borderStyle: 'single', padding: 1 },
            React.createElement(Text, { dimColor: true }, 'Session History:'),
            history.length === 0 ?
                React.createElement(Text, { color: 'gray' }, 'No commands yet...') :
                React.createElement(Box, { flexDirection: 'column' },
                    ...history.slice(-5).map((line, i) =>
                        React.createElement(Text, { key: i }, line)
                    )
                )
        ),

        response && React.createElement(Box, { marginTop: 1, borderStyle: 'round', padding: 1 },
            React.createElement(Text, { color: 'cyan' }, response)
        ),

        React.createElement(Box, { marginTop: 1 },
            isLoading ?
                React.createElement(Box, null,
                    React.createElement(Text, null, 'Processing '),
                    React.createElement(Spinner, { type: 'dots' })
                ) :
                isTTY ?
                    React.createElement(Box, null,
                        React.createElement(Text, { color: 'green' }, '$ '),
                        React.createElement(Text, { color: 'white' }, input),
                        React.createElement(Text, { color: 'gray' }, '█')
                    ) :
                    React.createElement(Text, { dimColor: true }, 'Running automated tests...')
        ),

        React.createElement(Box, { marginTop: 1, flexDirection: 'column' },
            isTTY && React.createElement(Text, { dimColor: true }, 'Commands: /help, /status, /debug, /exit'),
            React.createElement(Text, { dimColor: true },
                isTTY ? 'Auto-exit in 15 seconds • Ctrl+C to exit now' :
                       'Auto-exit in 7 seconds')
        )
    );
};

// Clear console and show app
console.clear();

const { waitUntilExit } = render(React.createElement(AppV3));

waitUntilExit().then(() => {
    console.log('\nFASE 3 integration test completed successfully! ✅');
    process.exit(0);
}).catch(error => {
    console.error('Error:', error);
    process.exit(1);
});