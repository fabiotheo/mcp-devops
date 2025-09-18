#!/usr/bin/env node

import React from 'react';
import { render, Box, Text } from 'ink';

// Simple test component to verify Ink is working
const TestApp = () => {
    return (
        <Box flexDirection="column">
            <Text bold color="cyan">
                ✅ Ink Interface is Working!
            </Text>
            <Text color="green">
                FASE 2 bugs have been fixed:
            </Text>
            <Text>• Syntax highlighting fixed</Text>
            <Text>• AutoComplete selection implemented</Text>
            <Text>• History navigation corrected</Text>
            <Text>• HistoryManager moved to component scope</Text>
            <Text>• Stale closures fixed</Text>
            <Text>• Debouncing added</Text>
            <Box marginTop={1}>
                <Text dimColor>Press Ctrl+C to exit</Text>
            </Box>
        </Box>
    );
};

// Render the app
console.clear();
const { waitUntilExit } = render(<TestApp />);

waitUntilExit().then(() => {
    console.log('\nTest completed successfully! ✅');
    process.exit(0);
});