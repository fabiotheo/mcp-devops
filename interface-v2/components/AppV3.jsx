import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdin } from 'ink';
import PasteManager from './PasteManager.jsx';
import InputHandler from './InputHandler.jsx';
import AutoComplete from './AutoComplete.jsx';
import StatusIndicator from './StatusIndicator.jsx';
import HighlightedText from './HighlightedText.jsx';
import HistoryManager from '../utils/historyManager.js';
import AIConnector from '../bridges/AIConnector.js';
import CommandProcessor from '../bridges/CommandProcessor.js';
import PatternAdapter from '../bridges/adapters/PatternAdapter.js';
import TursoAdapter from '../bridges/adapters/TursoAdapter.js';

const AppV3 = ({ debugMode = false }) => {
    // Core state
    const [input, setInput] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isPasting, setIsPasting] = useState(false);
    const [output, setOutput] = useState([]);
    const [status, setStatus] = useState('idle');
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [lineCount, setLineCount] = useState(1);
    const [debug, setDebug] = useState(debugMode);
    const [isConnected, setIsConnected] = useState(false);

    const { exit } = useApp();
    const { isRawModeSupported, setRawMode } = useStdin();

    // Initialize services
    const historyManager = useMemo(() => new HistoryManager(), []);
    const aiConnector = useMemo(() => new AIConnector({ debug }), [debug]);
    const commandProcessor = useMemo(
        () => new CommandProcessor(aiConnector, { debug }),
        [aiConnector, debug]
    );
    const patternAdapter = useMemo(() => new PatternAdapter({ debug }), [debug]);
    const tursoAdapter = useMemo(() => new TursoAdapter({ debug }), [debug]);

    // Initialize all services
    useEffect(() => {
        const initServices = async () => {
            try {
                setStatus('processing');
                setOutput(prev => [...prev, {
                    type: 'system',
                    text: 'Initializing services...'
                }]);

                // Initialize services in parallel
                await Promise.all([
                    historyManager.initialize(),
                    aiConnector.initialize(),
                    patternAdapter.initialize(),
                    tursoAdapter.initialize()
                ]);

                // Load history
                const localHistory = historyManager.getHistory();
                const tursoHistory = await tursoAdapter.getHistory(50);
                const combinedHistory = [...new Set([...localHistory, ...tursoHistory])];
                setHistory(combinedHistory);

                // Sync local history to Turso if needed
                if (localHistory.length > 0) {
                    tursoAdapter.syncHistory(localHistory);
                }

                setIsConnected(true);
                setStatus('success');
                setOutput(prev => [...prev, {
                    type: 'system',
                    text: '✓ Services initialized successfully'
                }]);

                setTimeout(() => setStatus('idle'), 2000);
            } catch (error) {
                console.error('Failed to initialize services:', error);
                setStatus('error');
                setOutput(prev => [...prev, {
                    type: 'error',
                    text: `Failed to initialize: ${error.message}`
                }]);
            }
        };

        initServices();

        // Cleanup on unmount
        return () => {
            aiConnector.cleanup();
            commandProcessor.cleanup();
            tursoAdapter.cleanup();
        };
    }, [historyManager, aiConnector, patternAdapter, tursoAdapter, commandProcessor]);

    // Setup event listeners
    useEffect(() => {
        // CommandProcessor events
        commandProcessor.on('clear-screen', () => {
            setOutput([]);
        });

        commandProcessor.on('exit-request', () => {
            exit();
        });

        commandProcessor.on('processing-start', (command) => {
            setStatus('processing');
            if (debug) {
                setOutput(prev => [...prev, {
                    type: 'debug',
                    text: `[DEBUG] Processing: ${command}`
                }]);
            }
        });

        commandProcessor.on('processing-complete', (result) => {
            setStatus('idle');
        });

        commandProcessor.on('processing-error', (error) => {
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        });

        return () => {
            commandProcessor.removeAllListeners();
        };
    }, [commandProcessor, debug, exit]);

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
        if (!line.trim()) return;

        // Add to output
        setOutput(prev => [...prev, { type: 'command', text: line }]);

        // Save to history
        setHistory(prev => [...prev, line]);
        await historyManager.addCommand(line);
        await tursoAdapter.saveCommand(line);

        // Check for patterns first
        const patternMatch = await patternAdapter.checkPatterns(line);
        if (patternMatch) {
            setStatus('processing');
            const patternResult = await patternAdapter.executePattern(patternMatch);

            setOutput(prev => [...prev, {
                type: 'response',
                text: `Pattern matched: ${patternMatch.name}`,
                data: patternResult
            }]);

            setStatus('success');
            setTimeout(() => setStatus('idle'), 2000);
        } else {
            // Process through CommandProcessor
            const result = await commandProcessor.processInput(line);

            if (result.type === 'exit') {
                exit();
                return;
            }

            setOutput(prev => [...prev, {
                type: result.success ? 'response' : 'error',
                text: result.message || result.error || 'Command processed',
                data: result.data
            }]);

            setStatus(result.success ? 'success' : 'error');
            setTimeout(() => setStatus('idle'), 2000);
        }

        // Reset input
        setInput('');
        setCursorPosition(0);
        setHistoryIndex(-1);
        setShowAutocomplete(false);
    };

    const handlePasteComplete = (pastedText) => {
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

        // Ctrl+D for debug toggle
        if (inputKey === 'd' && key.ctrl) {
            setDebug(!debug);
            aiConnector.setDebugMode(!debug);
            commandProcessor.debug = !debug;
            setOutput(prev => [...prev, {
                type: 'system',
                text: `Debug mode ${!debug ? 'enabled' : 'disabled'}`
            }]);
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

    // Get suggestions for autocomplete
    const getSuggestions = async () => {
        const suggestions = [];

        // Get command processor suggestions
        const cmdSuggestions = await commandProcessor.getSuggestions(input);
        suggestions.push(...cmdSuggestions);

        // Get pattern suggestions
        const patternSuggestions = await patternAdapter.getPatternSuggestions(input);
        suggestions.push(...patternSuggestions);

        // Add history
        suggestions.push(...history);

        return [...new Set(suggestions)];
    };

    return (
        <Box flexDirection="column">
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    MCP Terminal Assistant v3 (Integrated)
                </Text>
                <Text color="gray"> | </Text>
                <StatusIndicator status={status} />
                {isConnected && <Text color="green"> ✓ Connected</Text>}
                {debug && <Text color="yellow"> [DEBUG]</Text>}
            </Box>

            {/* Output history */}
            <Box flexDirection="column" marginBottom={1}>
                {output.slice(-20).map((item, index) => (
                    <Box key={index}>
                        {item.type === 'command' ? (
                            <Box>
                                <Text color="green">❯ </Text>
                                <HighlightedText text={item.text} />
                            </Box>
                        ) : item.type === 'error' ? (
                            <Text color="red">  ✗ {item.text}</Text>
                        ) : item.type === 'system' ? (
                            <Text color="blue">  ℹ {item.text}</Text>
                        ) : item.type === 'debug' ? (
                            <Text color="yellow">  ⚙ {item.text}</Text>
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
                    Ctrl+C: exit | Ctrl+D: debug | Tab: autocomplete | /help: commands
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

export default AppV3;