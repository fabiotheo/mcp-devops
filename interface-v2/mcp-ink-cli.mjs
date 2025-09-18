#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Ink Interface with Real Backend
 * This is the production-ready interface that connects to the actual AI backend
 */

import React from 'react';
import { render, Text, Box, useInput, useApp, useStdout } from 'ink';
import { useState, useEffect, useRef } from 'react';
import Spinner from 'ink-spinner';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// Import backend modules
import AICommandOrchestratorBash from '../ai_orchestrator_bash.js';
import PatternMatcher from '../libs/pattern_matcher.js';
import ModelFactory from '../ai_models/model_factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Main MCP Ink Application Component
const MCPInkApp = () => {
    const [input, setInput] = useState('');
    const [history, setHistory] = useState([]);
    const [commandHistory, setCommandHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [status, setStatus] = useState('initializing');
    const [isProcessing, setIsProcessing] = useState(false);
    const [response, setResponse] = useState('');
    const [error, setError] = useState(null);
    const [pasteMode, setPasteMode] = useState(false);
    const [pasteBuffer, setPasteBuffer] = useState('');
    const [config, setConfig] = useState(null);

    const { exit } = useApp();
    const { stdout } = useStdout();
    const orchestrator = useRef(null);
    const patternMatcher = useRef(null);

    const isTTY = process.stdin.isTTY;
    const isDebug = process.argv.includes('--debug');

    // Initialize backend services
    useEffect(() => {
        const initBackend = async () => {
            try {
                setStatus('loading-config');

                // Load configuration
                const configPath = path.join(process.env.HOME, '.mcp-terminal/config.json');
                let loadedConfig;
                try {
                    const configData = await fs.readFile(configPath, 'utf8');
                    loadedConfig = JSON.parse(configData);
                    setConfig(loadedConfig);
                    console.log('  ✓ Configuration loaded');
                } catch (err) {
                    console.log('  ⚠ Using default configuration');
                    // Use default config if not found
                    loadedConfig = {
                        ai_provider: 'claude',
                        anthropic_api_key: process.env.ANTHROPIC_API_KEY,
                        claude_model: 'claude-3-5-sonnet-20241022',
                        use_native_tools: false,
                        max_tokens: 4096,
                        temperature: 0.7
                    };
                    setConfig(loadedConfig);
                }

                setStatus('initializing-ai');

                // Create real AI model using ModelFactory
                let aiModel;
                try {
                    // Use the loaded config
                    const modelConfig = loadedConfig;

                    aiModel = await ModelFactory.createModel(modelConfig);
                    console.log('  ✓ AI Model initialized');
                } catch (error) {
                    console.error('Failed to initialize AI model:', error);
                    // Fall back to a simple wrapper
                    aiModel = {
                        askCommand: async (prompt, options = {}) => {
                            return {
                                response: `Error: AI model not available - ${error.message}`,
                                success: false
                            };
                        }
                    };
                }

                // Initialize AI Orchestrator or simple wrapper based on tools support
                if (loadedConfig.use_native_tools === true || loadedConfig.enable_bash_tool === true) {
                    // Use full orchestrator with tools
                    orchestrator.current = new AICommandOrchestratorBash(aiModel, {
                        verboseLogging: isDebug,
                        enableBash: true,
                        bashConfig: {
                            timeout: 30000
                        }
                    });

                    // Add wrapper method for compatibility
                    orchestrator.current.askCommand = async function(command, options = {}) {
                        return await this.orchestrateExecution(command, {
                            history: options.history || [],
                            patternInfo: options.patternInfo
                        }, options);
                    };
                } else {
                    // Use simple direct AI model without tools
                    orchestrator.current = {
                        askCommand: async function(command, options = {}) {
                            try {
                                // Simple conversation without tools
                                if (aiModel.askCommand) {
                                    const result = await aiModel.askCommand(command, options);
                                    return result;
                                } else {
                                    // Fallback to a simple response
                                    return {
                                        response: `Olá! Sou o MCP Terminal Assistant. Você disse: "${command}"\n\nPara habilitar funcionalidades avançadas com execução de comandos, configure "use_native_tools" ou "enable_bash_tool" como true em ~/.mcp-terminal/config.json`,
                                        success: true
                                    };
                                }
                            } catch (error) {
                                return {
                                    response: `Erro ao processar comando: ${error.message}`,
                                    success: false,
                                    error: error.message
                                };
                            }
                        },
                        cleanup: async () => {}
                    };
                }

                // Initialize Pattern Matcher
                patternMatcher.current = new PatternMatcher();
                await patternMatcher.current.loadPatterns();

                setStatus('ready');

                // Load command history
                await loadCommandHistory();

            } catch (err) {
                setError(`Initialization failed: ${err.message}`);
                setStatus('error');
                console.error('Backend initialization error:', err);
            }
        };

        initBackend();

        // Cleanup on exit
        return () => {
            if (orchestrator.current) {
                orchestrator.current.cleanup().catch(console.error);
            }
        };
    }, []);

    // Load command history from file or Turso if user is set
    const loadCommandHistory = async () => {
        try {
            // Check if we have a Turso adapter with user
            if (tursoAdapter && tursoAdapter.isConnected() && tursoAdapter.userId) {
                // Load from Turso for the user
                const userHistory = await tursoAdapter.getHistory(100); // Get last 100 commands
                const commands = userHistory.map(h => h.command).filter(cmd => cmd && cmd.trim());
                setCommandHistory(commands);
                return;
            }

            // Fall back to local file
            const historyPath = path.join(process.env.HOME, '.mcp_terminal_history');
            const data = await fs.readFile(historyPath, 'utf8');
            const loadedHistory = data.split('\n').filter(line => line.trim());
            setCommandHistory(loadedHistory.slice(-100)); // Keep last 100 commands
        } catch (err) {
            // History file doesn't exist yet or Turso failed
            setCommandHistory([]);
        }
    };

    // Save command to history
    const saveToHistory = async (command) => {
        const newHistory = [...commandHistory, command].slice(-100);
        setCommandHistory(newHistory);
        setHistoryIndex(-1);

        try {
            const historyPath = path.join(process.env.HOME, '.mcp_terminal_history');
            await fs.appendFile(historyPath, command + '\n');
        } catch (err) {
            // Ignore save errors
        }
    };

    // Process command through backend
    const processCommand = async (command) => {
        if (!command.trim()) return;

        setIsProcessing(true);
        setResponse('');
        setError(null);

        // Add to display history
        setHistory(prev => [...prev.slice(-50), `❯ ${command}`]);

        // Save to command history
        await saveToHistory(command);

        try {
            // First, check if pattern matcher can handle it
            const patternResult = patternMatcher.current.match(command);

            if (patternResult && patternResult.pattern) {
                // Pattern matcher recognized it - but we'll process through AI anyway
                // The pattern info can be used to enhance the AI response
                setStatus('processing');
                const result = await orchestrator.current.askCommand(command, {
                    history: commandHistory.slice(-5),
                    verbose: isDebug,
                    patternInfo: patternResult
                });

                // Extract text from result
                let output = '';
                if (typeof result === 'string') {
                    output = result;
                } else if (result && typeof result === 'object') {
                    // Try to get the actual response text from various possible fields
                    output = result.directAnswer || result.response || result.message || result.output;

                    // If still no output but result has success and a response somewhere, try to extract it
                    if (!output && result.success === false && result.error) {
                        output = `Erro: ${result.error}`;
                    } else if (!output) {
                        // Last resort - show JSON if we can't find the actual response
                        output = JSON.stringify(result, null, 2);
                    }
                } else {
                    output = String(result);
                }

                setResponse(output);
                setHistory(prev => [...prev, formatResponse(output)]);
            } else {
                // Process through AI orchestrator
                setStatus('processing');
                const result = await orchestrator.current.askCommand(command, {
                    history: commandHistory.slice(-5),
                    verbose: isDebug
                });

                // Extract text from result
                let output = '';
                if (typeof result === 'string') {
                    output = result;
                } else if (result && typeof result === 'object') {
                    // Try to get the actual response text from various possible fields
                    output = result.directAnswer || result.response || result.message || result.output;

                    // If still no output but result has success and a response somewhere, try to extract it
                    if (!output && result.success === false && result.error) {
                        output = `Erro: ${result.error}`;
                    } else if (!output) {
                        // Last resort - show JSON if we can't find the actual response
                        output = JSON.stringify(result, null, 2);
                    }
                } else {
                    output = String(result);
                }

                setResponse(output);
                setHistory(prev => [...prev, formatResponse(output)]);
            }

            setStatus('ready');
        } catch (err) {
            setError(`Error: ${err.message}`);
            setHistory(prev => [...prev, `✗ Error: ${err.message}`]);
            setStatus('ready');
        } finally {
            setIsProcessing(false);
        }
    };

    // Format response for display
    const formatResponse = (text) => {
        if (!text) return '';
        // Ensure text is a string
        const textStr = typeof text === 'string' ? text : String(text);
        const lines = textStr.split('\n');
        return lines.slice(0, 3).join('\n') + (lines.length > 3 ? '...' : '');
    };

    // Handle special commands
    const handleSpecialCommand = (command) => {
        const cmd = command.slice(1).toLowerCase();

        switch(cmd) {
            case 'help':
                setResponse(`MCP Terminal Assistant - Commands:
/help     - Show this help
/clear    - Clear screen
/history  - Show command history
/status   - Show system status
/debug    - Toggle debug mode
/exit     - Exit application

For Linux/Unix help, just type your question!`);
                return true;

            case 'clear':
                setHistory([]);
                setResponse('');
                return true;

            case 'history':
                setResponse(commandHistory.slice(-20).join('\n'));
                return true;

            case 'status':
                setResponse(`Status: ${status}
AI Backend: ${orchestrator.current ? 'Connected' : 'Disconnected'}
Pattern Matcher: ${patternMatcher.current ? 'Loaded' : 'Not loaded'}
Debug Mode: ${isDebug ? 'ON' : 'OFF'}
Config: ${config ? 'Loaded' : 'Default'}`);
                return true;

            case 'exit':
            case 'quit':
                exit();
                return true;

            default:
                setResponse(`Unknown command: /${cmd}`);
                return true;
        }
    };

    // Handle paste detection
    const handlePasteStart = () => {
        setPasteMode(true);
        setPasteBuffer('');
    };

    const handlePasteEnd = () => {
        setPasteMode(false);
        setInput(pasteBuffer);
        setPasteBuffer('');
    };

    // Input handling for TTY mode
    if (isTTY) {
        useInput((char, key) => {
            // Handle paste mode
            if (char === '\x1b[200~') {
                handlePasteStart();
                return;
            }
            if (char === '\x1b[201~') {
                handlePasteEnd();
                return;
            }

            if (pasteMode) {
                setPasteBuffer(prev => prev + char);
                return;
            }

            // Normal input handling
            if (key.return) {
                const command = input.trim();

                if (command.startsWith('/')) {
                    if (!handleSpecialCommand(command)) {
                        processCommand(command);
                    }
                } else if (command) {
                    processCommand(command);
                }

                setInput('');
            } else if (key.upArrow) {
                // Navigate history up
                if (commandHistory.length > 0) {
                    const newIndex = historyIndex < commandHistory.length - 1
                        ? historyIndex + 1
                        : historyIndex;
                    setHistoryIndex(newIndex);
                    setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
                }
            } else if (key.downArrow) {
                // Navigate history down
                if (historyIndex > 0) {
                    const newIndex = historyIndex - 1;
                    setHistoryIndex(newIndex);
                    setInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
                } else if (historyIndex === 0) {
                    setHistoryIndex(-1);
                    setInput('');
                }
            } else if (key.backspace || key.delete) {
                setInput(prev => prev.slice(0, -1));
            } else if (key.ctrl && key.c) {
                exit();
            } else if (key.ctrl && key.l) {
                // Clear screen
                setHistory([]);
                setResponse('');
            } else if (char && !key.ctrl && !key.meta) {
                setInput(prev => prev + char);
            }
        });
    }

    // Render UI
    return React.createElement(Box, { flexDirection: 'column', padding: 1 },
        // Header
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { color: 'green', bold: true }, '✨ MCP Terminal Assistant'),
            React.createElement(Text, { color: 'gray' }, ' v3.0'),
            isDebug && React.createElement(Text, { color: 'magenta' }, ' [DEBUG]')
        ),

        // Status bar
        React.createElement(Box, null,
            React.createElement(Text, null, 'Status: '),
            React.createElement(Text, {
                color: status === 'ready' ? 'green' :
                       status === 'processing' ? 'yellow' :
                       status === 'error' ? 'red' :
                       'cyan'
            }, status),
            error && React.createElement(Text, { color: 'red' }, ` - ${error}`)
        ),

        // History display
        React.createElement(Box, {
            marginTop: 1,
            flexDirection: 'column',
            borderStyle: 'single',
            padding: 1,
            height: 15
        },
            React.createElement(Text, { dimColor: true }, 'Session:'),
            history.length === 0 ?
                React.createElement(Text, { color: 'gray' }, 'Ready for your questions...') :
                React.createElement(Box, { flexDirection: 'column' },
                    ...history.slice(-10).map((line, i) =>
                        React.createElement(Text, {
                            key: i,
                            color: line.startsWith('❯') ? 'cyan' :
                                   line.startsWith('✗') ? 'red' : 'white'
                        }, line)
                    )
                )
        ),

        // Response area
        response && React.createElement(Box, {
            marginTop: 1,
            borderStyle: 'round',
            padding: 1,
            borderColor: error ? 'red' : 'green'
        },
            React.createElement(Text, {
                color: error ? 'red' : 'white'
            }, response)
        ),

        // Input line
        React.createElement(Box, { marginTop: 1 },
            isProcessing ?
                React.createElement(Box, null,
                    React.createElement(Text, { color: 'yellow' }, 'Processing '),
                    React.createElement(Spinner, { type: 'dots' })
                ) :
                React.createElement(Box, null,
                    React.createElement(Text, { color: 'green', bold: true }, '❯ '),
                    React.createElement(Text, { color: 'white' }, input),
                    pasteMode ?
                        React.createElement(Text, { color: 'yellow' }, ' [PASTING...]') :
                        React.createElement(Text, { color: 'gray' }, '█')
                )
        ),

        // Footer
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { dimColor: true },
                'Type your question • /help for commands • ↑↓ for history • Ctrl+C to exit')
        )
    );
};

// Main execution
const main = async () => {
    console.clear();
    console.log('Initializing MCP Terminal Assistant...\n');

    const { waitUntilExit } = render(React.createElement(MCPInkApp));

    try {
        await waitUntilExit();
        console.log('\nThank you for using MCP Terminal Assistant! 👋');
        process.exit(0);
    } catch (error) {
        console.error('\nError:', error.message);
        process.exit(1);
    }
};

// Run the application
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});