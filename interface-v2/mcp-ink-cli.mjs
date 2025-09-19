#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Ink Interface with Real Backend
 * This is the production-ready interface that connects to the actual AI backend
 *
 * Features:
 * - Multi-line input support with elegant rendering
 * - Turso distributed history with user mapping
 * - Clean loading screen during initialization
 * - Bracketed paste mode support
 */

import React from 'react';
import { render, Text, Box, useInput, useApp, useStdout } from 'ink';
import { useState, useEffect, useRef, useCallback } from 'react';
import Spinner from 'ink-spinner';
import MultilineInput from './components/MultilineInput.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// Import backend modules
import AICommandOrchestratorBash from '../ai_orchestrator_bash.js';
import PatternMatcher from '../libs/pattern_matcher.js';
import ModelFactory from '../ai_models/model_factory.js';
import TursoAdapter from './bridges/adapters/TursoAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Module-level variables
const isDebug = process.argv.includes('--debug');
const user = process.env.MCP_USER || 'default';

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
    const [config, setConfig] = useState(null);

    // New state for enhanced controls
    const [lastCtrlC, setLastCtrlC] = useState(0);
    const [lastEsc, setLastEsc] = useState(0);
    const [cancelToken, setCancelToken] = useState(null);

    const { exit } = useApp();
    const { stdout } = useStdout();
    const orchestrator = useRef(null);
    const patternMatcher = useRef(null);
    const tursoAdapter = useRef(null);

    const isTTY = process.stdin.isTTY;


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
                    if (isDebug) {
                        console.log('  ✓ Configuration loaded');
                    }
                } catch (err) {
                    if (isDebug) {
                        console.log('  ⚠ Using default configuration');
                    }
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
                    if (isDebug) {
                        console.log('  ✓ AI Model initialized');
                    }
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

                // Initialize Turso Adapter
                try {
                    tursoAdapter.current = new TursoAdapter({
                        debug: isDebug,
                        userId: user
                    });
                    await tursoAdapter.current.initialize();
                    if (isDebug) {
                        if (tursoAdapter.current.isConnected()) {
                            if (isDebug) {
                                console.log(`  ✓ Turso connected for user: ${user}`);
                            }
                        } else {
                            if (isDebug) {
                                console.log('  ⚠ Turso offline mode (local history only)');
                            }
                        }
                    }
                } catch (err) {
                    if (isDebug) {
                        console.log('  ⚠ Turso initialization failed, using local history');
                        console.error('Turso error:', err);
                    }
                }

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
            if (tursoAdapter.current && tursoAdapter.current.isConnected() && user !== 'default') {
                // Load from Turso for the user
                const userHistory = await tursoAdapter.current.getHistory(100); // Get last 100 commands
                const commands = userHistory.map(h => h.command).filter(cmd => cmd && cmd.trim());
                setCommandHistory(commands);
                if (isDebug) {
                    console.log(`[Debug] Loaded ${commands.length} commands from Turso for user ${user}`);
                }
                return;
            }

            // Fall back to local file
            const historyPath = path.join(process.env.HOME, '.mcp_terminal_history');
            const data = await fs.readFile(historyPath, 'utf8');
            const loadedHistory = data.split('\n').filter(line => line.trim());
            setCommandHistory(loadedHistory.slice(-100)); // Keep last 100 commands
            if (isDebug) {
                console.log(`[Debug] Loaded ${loadedHistory.length} commands from local file`);
            }
        } catch (err) {
            // History file doesn't exist yet or Turso failed
            setCommandHistory([]);
            if (isDebug) {
                console.log('[Debug] No history found, starting fresh');
            }
        }
    };

    // Save command to history
    const saveToHistory = async (command, response = null) => {
        const newHistory = [...commandHistory, command].slice(-100);
        setCommandHistory(newHistory);
        setHistoryIndex(-1);

        if (isDebug) {
            console.log(`[Debug] Saved command to history. Total commands: ${newHistory.length}`);
        }

        try {
            // Save to Turso if connected
            if (tursoAdapter.current && tursoAdapter.current.isConnected() && user !== 'default') {
                await tursoAdapter.current.addToHistory(command, response);
                if (isDebug) {
                    console.log(`[Turso] Saved command for user ${user}`);
                }
            }

            // Also save to local file as backup
            const historyPath = path.join(process.env.HOME, '.mcp_terminal_history');
            await fs.appendFile(historyPath, command + '\n');
        } catch (err) {
            // Ignore save errors
            if (isDebug) {
                console.error('History save error:', err);
            }
        }
    };

    // Process command through backend
    const processCommand = async (command) => {
        if (!command.trim()) return;

        setIsProcessing(true);
        setResponse('');
        setError(null);

        // Add to display history (show only first line if multi-line)
        const displayCommand = command.includes('\n')
            ? `❯ ${command.split('\n')[0]}... (${command.split('\n').length} lines)`
            : `❯ ${command}`;
        setHistory(prev => [...prev.slice(-50), displayCommand]);

        try {
            let output = '';

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

                // Save to history with response
                await saveToHistory(command, output);
            } else {
                // Process through AI orchestrator
                setStatus('processing');
                const result = await orchestrator.current.askCommand(command, {
                    history: commandHistory.slice(-5),
                    verbose: isDebug
                });

                // Extract text from result
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

                // Save to history with response
                await saveToHistory(command, output);
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

    // Enable bracketed paste mode
    useEffect(() => {
        if (isTTY && status === 'ready') {
            // Enable bracketed paste mode
            process.stdout.write('\x1b[?2004h');

            if (isDebug) {
                console.log('[Debug] Bracketed paste mode enabled');
            }

            return () => {
                process.stdout.write('\x1b[?2004l');
                // Don't use isDebug in cleanup as it might not be available
                if (process.argv.includes('--debug')) {
                    console.log('[Debug] Bracketed paste mode disabled');
                }
            };
        }
    }, [status, isTTY, isDebug]);

    // Clear Ctrl+C message after timeout
    useEffect(() => {
        if (response === 'Press Ctrl+C again to exit') {
            const timer = setTimeout(() => {
                setResponse('');
                setLastCtrlC(0);
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [response]);

    // Input handling for TTY mode
    if (isTTY) {
        useInput((char, key) => {
            // Only accept input when ready
            if (status !== 'ready' && status !== 'processing') {
                return;
            }

            // Debug all input
            if (isDebug && char) {
                console.log('[Debug] Raw input received:', JSON.stringify(char));
                console.log('[Debug] Char codes:', Array.from(char).map(c => c.charCodeAt(0)));
            }

            // Handle complete bracketed paste (comes in one chunk)
            // Note: Ink seems to strip the \x1b from the beginning
            if (char && (
                (char.includes('\x1b[200~') && char.includes('\x1b[201~')) ||
                (char.includes('[200~') && char.includes('\x1b[201~'))
            )) {
                let start, end;

                // Check which format we have
                if (char.includes('\x1b[200~')) {
                    start = char.indexOf('\x1b[200~') + 6;
                } else if (char.includes('[200~')) {
                    start = char.indexOf('[200~') + 5;
                }

                end = char.indexOf('\x1b[201~');

                const pastedContent = char.substring(start, end);
                // Convert \r to \n for multi-line
                const processedContent = pastedContent.replace(/\r/g, '\n');

                // Update input with pasted content and add a space at the end
                setInput(prev => {
                    const newContent = prev + processedContent + ' ';
                    return newContent;
                });

                if (isDebug) {
                    console.log('[Debug] Bracketed paste detected!');
                    console.log('[Debug] Paste content:', processedContent);
                    console.log('[Debug] Lines:', processedContent.split('\n').length);
                }
                return;
            }

            // Skip partial bracketed paste sequences
            // Commented out to test if this is blocking paste
            // if (char && (char.includes('\x1b[200~') || char.includes('\x1b[201~'))) {
            //     return;
            // }

            // Handle ESC key
            if (key.escape) {
                const now = Date.now();
                const timeSinceLastEsc = now - lastEsc;

                if (timeSinceLastEsc < 500) {
                    // Double ESC - clear input
                    setInput('');
                    setLastEsc(0);
                    if (isDebug) {
                        console.log('[Debug] Double ESC - Input cleared');
                    }
                } else {
                    // Single ESC
                    if (isProcessing) {
                        // Cancel current operation
                        setIsProcessing(false);
                        setResponse('Operation cancelled by user');
                        setError(null);
                        if (isDebug) {
                            console.log('[Debug] ESC - Operation cancelled');
                        }
                    }
                    setLastEsc(now);
                }
                return;
            }

            // Normal input handling
            if (key.return) {
                // Check if input ends with backslash (for multi-line)
                if (input.endsWith('\\')) {
                    // Remove backslash and add newline
                    setInput(prev => prev.slice(0, -1) + '\n');
                    return;
                }

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
                if (isDebug) {
                    console.log(`[Debug] History navigation UP - Current index: ${historyIndex}, History length: ${commandHistory.length}`);
                }
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
            } else if (key.ctrl && char === 'c') {
                // Handle Ctrl+C (double tap to exit)
                const now = Date.now();

                if (lastCtrlC > 0 && (now - lastCtrlC) < 2000) {
                    // Second Ctrl+C within 2 seconds - exit
                    if (!isDebug) {
                        console.clear();
                    }
                    console.log('\n\x1b[33mGoodbye!\x1b[0m\n');
                    exit();
                } else {
                    // First Ctrl+C - show message
                    setLastCtrlC(now);
                    setResponse('Press Ctrl+C again to exit');
                    setError(false);

                    // Clear message after 2 seconds
                    setTimeout(() => {
                        setResponse('');
                        setLastCtrlC(0);
                    }, 2000);
                }
                return;
            } else if (key.backspace || key.delete) {
                setInput(prev => prev.slice(0, -1));
            } else if (key.ctrl && key.l) {
                // Clear screen
                setHistory([]);
                setResponse('');
            } else if (char && !key.ctrl && !key.meta) {
                // Don't add the char if it contains paste sequences
                if (!char.includes('[200~') && !char.includes('\x1b[201~') &&
                    !char.includes('\x1b[200~')) {
                    setInput(prev => prev + char);
                }
            }
        });
    }

    // Show loading screen during initialization
    if (status !== 'ready' && status !== 'error' && status !== 'processing') {
        return React.createElement(Box, {
            flexDirection: 'column',
            padding: 1,
            alignItems: 'center',
            justifyContent: 'center',
            height: 20
        },
            React.createElement(Box, { marginBottom: 2 },
                React.createElement(Text, { color: 'green', bold: true }, '✨ MCP Terminal Assistant')
            ),
            React.createElement(Box, { marginBottom: 1 },
                React.createElement(Spinner, { type: 'dots' }),
                React.createElement(Text, { color: 'cyan' }, ' Initializing...')
            ),
            React.createElement(Box, { flexDirection: 'column', alignItems: 'center' },
                status === 'loading-config' && React.createElement(Text, { color: 'gray' }, 'Loading configuration...'),
                status === 'initializing-ai' && React.createElement(Text, { color: 'gray' }, 'Connecting to AI...'),
                status === 'initializing' && React.createElement(Text, { color: 'gray' }, 'Setting up environment...')
            )
        );
    }

    // Render main UI
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
                React.createElement(MultilineInput, {
                    value: input,
                    onChange: setInput,
                    placeholder: 'Type your question...',
                    showCursor: true,
                    isActive: status === 'ready'
                })
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

    const { waitUntilExit } = render(React.createElement(MCPInkApp), {
        exitOnCtrlC: false  // Disable default Ctrl+C exit to use our custom handler
    });

    try {
        await waitUntilExit();
        if (isDebug) {
            console.log('[DEBUG] Application exiting normally');
        }
        if (!isDebug) {
            console.log('\nThank you for using MCP Terminal Assistant! 👋');
        }
        process.exit(0);
    } catch (error) {
        if (isDebug) {
            console.log('[DEBUG] Application exiting with error:', error);
        }
        console.error('\nError:', error.message);
        process.exit(1);
    }
};

// Run the application
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});