import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdin } from 'ink';
import PasteManager from './PasteManager.jsx';
import InputHandler from './InputHandler.jsx';
import AutoComplete from './AutoComplete.jsx';
import StatusIndicator from './StatusIndicator.jsx';
import HighlightedText from './HighlightedText.jsx';
import HistoryManager from '../utils/historyManager.js';

const AppV2 = () => {
    // Create HistoryManager instance inside component
    const historyManager = useMemo(() => new HistoryManager(), []);
    const [input, setInput] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isPasting, setIsPasting] = useState(false);
    const [output, setOutput] = useState([]);
    const [status, setStatus] = useState('idle');
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [lineCount, setLineCount] = useState(1);

    const { exit } = useApp();
    const { isRawModeSupported, setRawMode } = useStdin();

    // Initialize history manager
    useEffect(() => {
        const initHistory = async () => {
            await historyManager.initialize();
            const loadedHistory = historyManager.getHistory();
            setHistory(loadedHistory);
        };
        initHistory();
    }, [historyManager]);

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

    // Track line count for multi-line indicator
    useEffect(() => {
        const lines = input.split('\n').length;
        setLineCount(lines);
    }, [input]);

    const handleSubmit = async (line) => {
        if (line.trim()) {
            setHistory(prev => [...prev, line]);
            await historyManager.addCommand(line);

            setOutput(prev => [...prev, { type: 'command', text: line }]);

            // Simulate processing
            setStatus('processing');

            setTimeout(() => {
                setOutput(prev => [...prev, {
                    type: 'response',
                    text: `Received: "${line}" (Will process with AI in Phase 3)`
                }]);
                setStatus('success');

                setTimeout(() => setStatus('idle'), 2000);
            }, 1000);
        }
        setInput('');
        setCursorPosition(0);
        setHistoryIndex(-1); // Reset to "new line" state
        setShowAutocomplete(false);
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

        // Tab for autocomplete - handled by AutoComplete component when active
        if (key.tab && !showAutocomplete) {
            setShowAutocomplete(true);
            return;
        }

        // Escape to hide autocomplete
        if (key.escape) {
            setShowAutocomplete(false);
            return;
        }

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

        // Arrow keys - Left/Right for cursor, Up/Down for history (only when autocomplete is not active)
        if (key.leftArrow && cursorPosition > 0) {
            setCursorPosition(prev => prev - 1);
            return;
        }
        if (key.rightArrow && cursorPosition < input.length) {
            setCursorPosition(prev => prev + 1);
            return;
        }
        // Don't handle up/down arrows if autocomplete is active
        if (key.upArrow && history.length > 0 && !showAutocomplete) {
            const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(newIndex);
            setInput(history[newIndex] || '');
            setCursorPosition((history[newIndex] || '').length);
            setShowAutocomplete(false);
            return;
        }
        if (key.downArrow && historyIndex !== -1 && !showAutocomplete) {
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
            setShowAutocomplete(false);
            return;
        }

        // Regular character input
        if (inputKey && !key.ctrl && !key.meta) {
            const newText = input.slice(0, cursorPosition) + inputKey + input.slice(cursorPosition);
            setInput(newText);
            setCursorPosition(prev => prev + 1);

            // Show autocomplete for commands (first word)
            if (newText.split(' ').length === 1 && newText.length > 1) {
                setShowAutocomplete(true);
            }
        }
    });

    return (
        <Box flexDirection="column">
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    MCP Terminal Assistant v2 (Ink Interface - Advanced)
                </Text>
                <Text color="gray"> | </Text>
                <StatusIndicator status={status} />
            </Box>

            {/* Output history */}
            <Box flexDirection="column" marginBottom={1}>
                {output.map((item, index) => (
                    <Box key={index}>
                        {item.type === 'command' ? (
                            <Box>
                                <Text color="green">❯ </Text>
                                <HighlightedText text={item.text} />
                            </Box>
                        ) : (
                            <Text color="gray">  {item.text}</Text>
                        )}
                    </Box>
                ))}
            </Box>

            {/* Input line with line counter */}
            <Box>
                <Text color="green">❯ </Text>
                <InputHandler
                    value={input}
                    cursorPosition={cursorPosition}
                />
                {isPasting && <Text color="yellow"> [PASTING...]</Text>}
                {lineCount > 1 && <Text color="gray"> [{lineCount} lines]</Text>}
            </Box>

            {/* Autocomplete suggestions */}
            <AutoComplete
                input={input.split(' ')[0]}
                suggestions={history}
                isActive={showAutocomplete}
                onSelect={(suggestion) => {
                    // Replace first word with suggestion
                    const words = input.split(' ');
                    words[0] = suggestion;
                    const newInput = words.join(' ');
                    setInput(newInput);
                    setCursorPosition(newInput.length);
                    setShowAutocomplete(false);
                }}
            />

            {/* Help text */}
            <Box marginTop={1}>
                <Text dimColor>
                    Ctrl+C: exit | Tab: autocomplete | ↑↓: history | Paste detection enabled
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

export default AppV2;