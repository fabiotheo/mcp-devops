import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, useStdin } from 'ink';
import PasteManager from './PasteManager.jsx';
import InputHandler from './InputHandler.jsx';

const App = () => {
    const [input, setInput] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isPasting, setIsPasting] = useState(false);
    const [output, setOutput] = useState([]);

    const { exit } = useApp();
    const { isRawModeSupported, setRawMode } = useStdin();

    useEffect(() => {
        if (isRawModeSupported) {
            setRawMode(true);
            // Enable bracketed paste mode
            process.stdout.write('\x1b[?2004h');

            return () => {
                // Disable bracketed paste mode on cleanup
                process.stdout.write('\x1b[?2004l');
                setRawMode(false);
            };
        }
    }, [isRawModeSupported, setRawMode]);

    const handleSubmit = (line) => {
        if (line.trim()) {
            setHistory(prev => [...prev, line]);
            setOutput(prev => [...prev, { type: 'command', text: line }]);

            // Here we'll integrate with AI orchestrator later
            setOutput(prev => [...prev, {
                type: 'response',
                text: `Received: "${line}" (Will process with AI in Phase 3)`
            }]);
        }
        setInput('');
        setCursorPosition(0);
        setHistoryIndex(history.length + 1); // Reset to end of history
    };

    const handlePasteComplete = (pastedText) => {
        // Paste complete - DO NOT auto-execute
        const newText = input.slice(0, cursorPosition) + pastedText + input.slice(cursorPosition);
        const newCursorPosition = cursorPosition + pastedText.length;

        setInput(newText);
        setCursorPosition(newCursorPosition);
        setIsPasting(false);
    };

    useInput((inputKey, key) => {
        // Ctrl+C to exit
        if (inputKey === 'c' && key.ctrl) {
            exit();
            return;
        }

        // Don't process input while pasting
        if (isPasting) return;

        // Enter key - submit
        if (key.return) {
            handleSubmit(input);
            return;
        }

        // Backspace
        if (key.backspace || key.delete) {
            if (cursorPosition > 0) {
                setInput(prev => prev.slice(0, cursorPosition - 1) + prev.slice(cursorPosition));
                setCursorPosition(prev => prev - 1);
            }
            return;
        }

        // Arrow keys - Left/Right for cursor, Up/Down for history
        if (key.leftArrow && cursorPosition > 0) {
            setCursorPosition(prev => prev - 1);
            return;
        }
        if (key.rightArrow && cursorPosition < input.length) {
            setCursorPosition(prev => prev + 1);
            return;
        }
        if (key.upArrow && history.length > 0) {
            const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(newIndex);
            setInput(history[newIndex] || '');
            setCursorPosition((history[newIndex] || '').length);
            return;
        }
        if (key.downArrow && historyIndex !== -1) {
            const newIndex = historyIndex + 1;
            if (newIndex >= history.length) {
                setHistoryIndex(-1);
                setInput('');
                setCursorPosition(0);
            } else {
                setHistoryIndex(newIndex);
                setInput(history[newIndex]);
                setCursorPosition(history[newIndex].length);
            }
            return;
        }

        // Regular character input
        if (inputKey && !key.ctrl && !key.meta) {
            const newText = input.slice(0, cursorPosition) + inputKey + input.slice(cursorPosition);
            setInput(newText);
            setCursorPosition(cursorPosition + 1);
        }
    });

    return (
        <Box flexDirection="column">
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    MCP Terminal Assistant v2 (Ink Interface)
                </Text>
            </Box>

            {/* Output history */}
            <Box flexDirection="column" marginBottom={1}>
                {output.map((item, index) => (
                    <Box key={index}>
                        {item.type === 'command' ? (
                            <Text color="green">❯ {item.text}</Text>
                        ) : (
                            <Text color="gray">  {item.text}</Text>
                        )}
                    </Box>
                ))}
            </Box>

            {/* Input line */}
            <Box>
                <Text color="green">❯ </Text>
                <InputHandler
                    value={input}
                    cursorPosition={cursorPosition}
                />
                {isPasting && <Text color="yellow"> [PASTING...]</Text>}
            </Box>

            {/* Help text */}
            <Box marginTop={1}>
                <Text dimColor>
                    Ctrl+C to exit | Enter to submit | Paste detection enabled
                </Text>
            </Box>

            {/* Paste Manager - handles bracketed paste */}
            <PasteManager
                onPasteStart={() => setIsPasting(true)}
                onPasteComplete={handlePasteComplete}
            />
        </Box>
    );
};

export default App;