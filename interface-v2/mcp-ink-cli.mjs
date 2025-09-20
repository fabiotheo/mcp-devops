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

import React, {useEffect, useRef, useState} from 'react';
import {Box, render, Text, useApp, useInput} from 'ink';
import Spinner from 'ink-spinner';
import MultilineInput from './components/MultilineInput.js';
import path from 'path';
import {fileURLToPath} from 'url';
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

// Process --user argument or use environment variable
const getUserFromArgs = () => {
    const userArgIndex = process.argv.indexOf('--user');
    if (userArgIndex !== -1 && process.argv[userArgIndex + 1]) {
        return process.argv[userArgIndex + 1];
    }
    return process.env.MCP_USER || 'default';
};

const user = getUserFromArgs();

if (isDebug) {
    console.log(`[Debug] User: ${user}`);
}

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
    const [isCancelled, setIsCancelled] = useState(false);
    const currentRequestId = useRef(null);
    const currentTursoEntryId = useRef(null);  // Track current Turso entry ID
    const activeRequests = useRef(new Map());  // Track active requests

    const { exit } = useApp();
    const orchestrator = useRef(null);
    const patternMatcher = useRef(null);
    const tursoAdapter = useRef(null);
    // Separate abort controllers for different operations
    const aiAbortControllerRef = useRef(null);  // For AI API calls (cancellable)
    const dbAbortControllerRef = useRef(null);  // For database operations (protected)

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
                    aiModel = await ModelFactory.createModel(loadedConfig);
                    if (isDebug) {
                        console.log('  ✓ AI Model initialized');
                    }
                } catch (error) {
                    console.error('Failed to initialize AI model:', error);
                    // Fall back to a simple wrapper
                    aiModel = {
                        askCommand: async (_prompt, _options = {}) => {
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
                        // Pass history and other options directly in the context that becomes systemContext
                        const contextWithHistory = {
                            ...options,  // Include all options (history, signal, etc)
                            patternInfo: options.patternInfo
                        };
                        // IMPORTANTE: passar options como terceiro parâmetro para propagar o signal
                        return await this.orchestrateExecution(command, contextWithHistory, options);
                    };
                } else {
                    // Use simple direct AI model without tools
                    orchestrator.current = {
                        askCommand: async function(command, options = {}) {
                            try {
                                // Simple conversation without tools
                                if (aiModel.askCommand) {
                                    return await aiModel.askCommand(command, options);
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
                const commands = [];

                // Process history to include cancellation markers
                userHistory.forEach(h => {
                    if (h.command && h.command.trim()) {
                        commands.push(h.command);

                        // Check if this was cancelled (no response or marked as cancelled)
                        if (!h.response || h.response === '[Cancelled by user]' ||
                            (h.context && typeof h.context === 'string' &&
                             h.context.includes('"status":"cancelled"'))) {
                            commands.push('[User pressed ESC - Previous message was interrupted]');
                        }
                    }
                });

                setCommandHistory(commands);
                if (isDebug) {
                    console.log(`[Debug] Loaded ${userHistory.length} entries from Turso for user ${user}`);
                    console.log(`[Debug] Processed into ${commands.length} command history items (including cancellation markers)`);
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

    // Save command to history (now only saves to file/Turso, not to commandHistory)
    const saveToHistory = async (command, response = null) => {
        // No longer update commandHistory here since it's done immediately in processCommand
        // This prevents duplicates when command is successful

        if (isDebug) {
            console.log(`[Debug] Saving to persistent history. Total commands in memory: ${commandHistory.length}`);
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

    // Helper function to ensure consistent cleanup of requests
    // IMPORTANT: This function is the single source of truth for request cleanup.
    // It handles both UI state and request lifecycle management.
    // Trade-offs:
    // - We use a Map (activeRequests) as primary source of truth for cancellation state
    // - Database updates are secondary and may lag behind local state
    // - This ensures immediate UI responsiveness at the cost of potential DB inconsistency
    // - The Map-first approach prevents race conditions between cancellation and API responses
    const cleanupRequest = async (requestId, reason, clearInput = false) => {
        if (isDebug) {
            console.log(`[Debug] Cleaning up request ${requestId}: ${reason}`);
        }

        // Get request data before any modifications
        const request = activeRequests.current.get(requestId);

        // 1. Mark as cancelled in Map (but don't delete yet)
        if (request) {
            request.status = 'cancelled';
        }

        // 2. Abort ONLY the AI controller (DB operations should continue)
        if (aiAbortControllerRef.current) {
            aiAbortControllerRef.current.abort();
            aiAbortControllerRef.current = null;
        }
        // Note: We intentionally don't abort dbAbortControllerRef here

        // 3. Reset UI state to ready
        setIsProcessing(false);
        setStatus('ready');
        setError(null);

        // 3.5. Clear input if requested (e.g., when ESC is pressed during processing)
        if (clearInput) {
            setInput('');
            if (isDebug) {
                console.log('[Debug] Input cleared due to cancellation');
            }
        }

        // 4. Restore bracketed paste mode if TTY (always restore when cleaning up)
        if (isTTY) {
            process.stdout.write('\x1b[?2004h');
            if (isDebug) {
                console.log('[Debug] Bracketed paste mode restored');
            }
        }

        // 5. Update Turso if this was a cancellation (not protected by abort)
        if (isDebug) {
            console.log(`[Debug] Cleanup - checking Turso update conditions:`);
            console.log(`  - reason: "${reason}"`);
            console.log(`  - reason.includes('cancel'): ${reason.includes('cancel')}`);
            console.log(`  - request exists: ${!!request}`);
            console.log(`  - request?.tursoId: ${request?.tursoId}`);
            console.log(`  - tursoAdapter connected: ${tursoAdapter.current?.isConnected()}`);
        }

        if (reason.includes('cancel') && request?.tursoId && tursoAdapter.current?.isConnected()) {
            try {
                if (isDebug) {
                    console.log(`[Debug] Updating Turso entry ${request.tursoId} to cancelled status`);
                }
                // Update the message status to 'cancelled' in Turso
                await tursoAdapter.current.updateStatusByRequestId(requestId, 'cancelled');
                if (isDebug) {
                    console.log(`[Debug] Turso entry marked as cancelled`);
                }
            } catch (err) {
                console.warn(`[Warning] Failed to update Turso status to cancelled: ${err.message}`);
            }
        }

        // 6. Clear references
        if (currentRequestId.current === requestId) {
            currentRequestId.current = null;
        }
        if (aiAbortControllerRef.current) {
            aiAbortControllerRef.current = null;
        }
        if (dbAbortControllerRef.current) {
            dbAbortControllerRef.current = null;
        }

        // 7. Finally remove from Map (do this LAST to ensure all operations can access request data)
        activeRequests.current.delete(requestId);
    };

    // Process command through backend
    const processCommand = async (command) => {
        if (isDebug) {
            console.log(`[Debug] processCommand called with: "${command}"`);
        }
        if (!command.trim()) return;

        // Generate unique request_id (timestamp + random for uniqueness)
        const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        currentRequestId.current = requestId;

        // Cancel any previous AI request (but not DB operations)
        if (aiAbortControllerRef.current) {
            aiAbortControllerRef.current.abort();
        }

        setIsProcessing(true);
        setResponse('');
        setError(null);
        setIsCancelled(false);

        // Create separate controllers for AI and DB operations
        const aiController = new AbortController();
        const dbController = new AbortController();
        aiAbortControllerRef.current = aiController;
        dbAbortControllerRef.current = dbController;

        activeRequests.current.set(requestId, {
            status: 'pending',
            aiController: aiController,
            dbController: dbController,
            command: command,
            tursoId: null
        });

        // Save question to Turso immediately with status 'pending' and request_id
        currentTursoEntryId.current = null;
        if (isDebug) {
            console.log(`[Debug] Checking Turso save conditions:`);
            console.log(`  - tursoAdapter.current: ${tursoAdapter.current ? 'exists' : 'null'}`);
            console.log(`  - isConnected: ${tursoAdapter.current?.isConnected() || false}`);
            console.log(`  - user: ${user}`);
            console.log(`  - user !== 'default': ${user !== 'default'}`);
        }

        if (tursoAdapter.current && tursoAdapter.current.isConnected() && user !== 'default') {
            currentTursoEntryId.current = await tursoAdapter.current.saveQuestionWithStatusAndRequestId(
                command,
                'pending',
                requestId
            );

            // Update Map with Turso ID
            const request = activeRequests.current.get(requestId);
            if (request) {
                request.tursoId = currentTursoEntryId.current;
            }

            if (isDebug) {
                console.log(`[Turso] Question saved with ID: ${currentTursoEntryId.current}, request_id: ${requestId}, status: pending`);
            }

            // CRITICAL: Check if cancelled AFTER save completes
            if (isCancelled || currentRequestId.current !== requestId) {
                if (isDebug) {
                    console.log(`[Debug] Request ${requestId} was cancelled during save. Updating status to cancelled.`);
                }
                // Update to cancelled status immediately
                await tursoAdapter.current.updateStatusByRequestId(requestId, 'cancelled');
                await cleanupRequest(requestId, 'cancelled during save');
                return;
            }
        }

        if (isDebug) {
            console.log(`[Debug] Starting request ${requestId}`);
        }

        // Add to display history (show only first line if multi-line)
        const displayCommand = command.includes('\n')
            ? `❯ ${command.split('\n')[0]}... (${command.split('\n').length} lines)`
            : `❯ ${command}`;
        setHistory(prev => [...prev.slice(-50), displayCommand]);

        // IMPORTANT: Add to command history immediately so it's available for context
        // even if the request is cancelled
        setCommandHistory(prev => {
            const newHistory = [...prev, command].slice(-100);
            if (isDebug) {
                console.log(`[Debug] Added to commandHistory: "${command.substring(0, 50)}..." (total: ${newHistory.length})`);
            }
            return newHistory;
        });
        setHistoryIndex(-1);

        try {
            let output = '';

            // First, check if pattern matcher can handle it
            const patternResult = patternMatcher.current.match(command);

            if (patternResult && patternResult.pattern) {
                // Pattern matcher recognized it - but we'll process through AI anyway
                // The pattern info can be used to enhance the AI response
                setStatus('processing');

                // Convert command history to proper format for AI (same as below)
                const formattedHistory = [];
                const recentCommands = commandHistory.slice(-10);
                recentCommands.forEach((cmd, index) => {
                    if (cmd.startsWith('[User pressed ESC')) {
                        return;
                    }
                    formattedHistory.push({
                        role: 'user',
                        content: cmd
                    });
                    if (index < recentCommands.length - 1 &&
                        recentCommands[index + 1] &&
                        recentCommands[index + 1].startsWith('[User pressed ESC')) {
                        formattedHistory.push({
                            role: 'assistant',
                            content: '[Message processing was interrupted by user]'
                        });
                    }
                });

                const result = await orchestrator.current.askCommand(command, {
                    history: formattedHistory,
                    verbose: isDebug,
                    patternInfo: patternResult,
                    signal: aiAbortControllerRef.current?.signal
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

                // Update Turso with response and status 'completed'
                if (currentTursoEntryId.current && tursoAdapter.current && tursoAdapter.current.isConnected()) {
                    await tursoAdapter.current.updateWithResponseAndStatus(currentTursoEntryId.current, output, 'completed');
                    if (isDebug) {
                        console.log(`[Turso] Updated entry ${currentTursoEntryId.current} with response and status: completed`);
                    }
                } else {
                    // Fallback to old method if no entry ID
                    if (requestId) {
                        await saveToHistory(command, output);
                    } else {
                        console.warn('[Warning] Cannot save to history: requestId is null');
                    }
                }
            } else {
                // Process through AI orchestrator
                setStatus('processing');

                // Check if request was cancelled before starting
                const request = activeRequests.current.get(requestId);
                if (!request || request.status === 'cancelled' || isCancelled || currentRequestId.current !== requestId) {
                    if (isDebug) {
                        console.log(`[Debug] Request ${requestId} cancelled before AI call`);
                    }
                    await cleanupRequest(requestId, 'cancelled before AI call');
                    return;
                }

                // Check again if cancelled before updating status
                if (isCancelled || currentRequestId.current !== requestId) {
                    if (isDebug) {
                        console.log(`[Debug] Request ${requestId} cancelled before updating status`);
                    }
                    await cleanupRequest(requestId, 'cancelled before status update');
                    return;
                }

                // Update status to 'processing' in Turso
                if (currentTursoEntryId.current && tursoAdapter.current) {
                    await tursoAdapter.current.updateStatus(currentTursoEntryId.current, 'processing');
                    request.status = 'processing';
                }

                try {
                    // Convert command history to proper format for AI
                    const formattedHistory = [];
                    const recentCommands = commandHistory.slice(-10); // Get last 10 items for context

                    recentCommands.forEach((cmd, index) => {
                        if (cmd.startsWith('[User pressed ESC')) {
                            // Skip cancellation markers - they're metadata
                            return;
                        }
                        // Add as user message
                        formattedHistory.push({
                            role: 'user',
                            content: cmd
                        });

                        // If this was a cancelled message (next item is cancellation marker)
                        if (index < recentCommands.length - 1 &&
                            recentCommands[index + 1] &&
                            recentCommands[index + 1].startsWith('[User pressed ESC')) {
                            // Add a note that this was interrupted
                            formattedHistory.push({
                                role: 'assistant',
                                content: '[Message processing was interrupted by user]'
                            });
                        }
                    });

                    // Final check before calling AI (prevent race condition)
                    const finalCheck = activeRequests.current.get(requestId);
                    if (!finalCheck || finalCheck.status === 'cancelled') {
                        if (isDebug) {
                            console.log(`[Debug] Request ${requestId} cancelled just before AI call. Aborting.`);
                        }
                        await cleanupRequest(requestId, 'cancelled before AI call');
                        return;
                    }

                    if (isDebug) {
                        console.log(`[Debug] Calling AI for request ${requestId}`);
                        console.log(`[Debug] Passing history with ${formattedHistory.length} formatted messages`);
                        console.log(`[Debug] Formatted history:`, formattedHistory);
                    }

                    const result = await orchestrator.current.askCommand(command, {
                        history: formattedHistory,
                        verbose: isDebug,
                        signal: aiAbortControllerRef.current?.signal
                    });

                    if (isDebug) {
                        console.log(`[Debug] AI responded for request ${requestId}, current: ${currentRequestId.current}`);
                    }

                    // CRITICAL: Use Map local as primary source of truth (no DB latency)
                    const currentRequest = activeRequests.current.get(requestId);
                    const isLocalCancelled = !currentRequest ||
                                              currentRequest.status === 'cancelled' ||
                                              isCancelled ||
                                              currentRequestId.current !== requestId;

                    if (isLocalCancelled) {
                        if (isDebug) {
                            console.log(`[Debug] Request ${requestId} cancelled (local check). Ignoring response.`);
                        }
                        await cleanupRequest(requestId, 'response after cancellation');
                        return;
                    }

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

                // Final check before setting response
                if (isCancelled || currentRequestId.current !== requestId) {
                    if (isDebug) {
                        console.log(`[Debug] Request ${requestId} cancelled before setting response`);
                    }
                    await cleanupRequest(requestId, 'cancelled before setting response');
                    return;
                }

                if (isDebug) {
                    console.log(`[Debug] Setting response for request ${requestId}`);
                }

                setResponse(output);
                setHistory(prev => [...prev, formatResponse(output)]);

                // Update Turso with response and status 'completed'
                if (currentTursoEntryId.current && tursoAdapter.current && tursoAdapter.current.isConnected()) {
                    await tursoAdapter.current.updateWithResponseAndStatus(currentTursoEntryId.current, output, 'completed');
                    if (isDebug) {
                        console.log(`[Turso] Updated entry ${currentTursoEntryId.current} with response and status: completed`);
                    }
                } else {
                    // Fallback to old method if no entry ID
                    if (requestId) {
                        await saveToHistory(command, output);
                    } else {
                        console.warn('[Warning] Cannot save to history: requestId is null');
                    }
                }
                } catch (abortErr) {
                    // If it's an abort error or was cancelled, just return silently
                    if (isCancelled || abortErr.name === 'AbortError' || aiAbortControllerRef.current?.signal.aborted) {
                        await cleanupRequest(currentRequestId.current || requestId, 'aborted');
                        return;
                    }
                    throw abortErr;
                }
            }

            setStatus('ready');
        } catch (err) {
            setError(`Error: ${err.message}`);
            setHistory(prev => [...prev, `✗ Error: ${err.message}`]);
            setStatus('ready');

            // Mark request as error in database
            if (tursoAdapter.current && tursoAdapter.current.isConnected() && currentRequestId.current) {
                await tursoAdapter.current.updateStatusByRequestId(currentRequestId.current, 'error');
                if (isDebug) {
                    console.log(`[Turso] Marked request ${currentRequestId.current} as error`);
                }
            }
        } finally {
            setIsProcessing(false);

            // Clean up the request from activeRequests Map to prevent memory leak
            if (currentRequestId.current && activeRequests.current.has(currentRequestId.current)) {
                activeRequests.current.delete(currentRequestId.current);
                if (isDebug) {
                    console.log(`[Debug] Cleaned up request ${currentRequestId.current} from activeRequests`);
                }
            }
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
        useInput(async (char, key) => {
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
                    return prev + processedContent + ' ';
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
                        if (isDebug) {
                            console.log(`[Debug] ESC pressed - cancelling request ${currentRequestId.current}`);
                        }
                        setIsCancelled(true);

                        // Save the request ID before clearing it
                        const requestIdToCancel = currentRequestId.current;

                        // IMMEDIATELY mark as cancelled in Map local (primary source)
                        const request = activeRequests.current.get(requestIdToCancel);
                        if (request) {
                            request.status = 'cancelled';
                        }

                        // Use unified cleanup function (it will handle aborting) - clear input on ESC
                        await cleanupRequest(requestIdToCancel, 'Operation cancelled by user', true);

                        // Add cancellation marker to command history for context
                        // This lets the AI know the previous message was interrupted
                        setCommandHistory(prev => {
                            const newHistory = [...prev, '[User pressed ESC - Previous message was interrupted]'].slice(-100);
                            if (isDebug) {
                                console.log('[Debug] Added cancellation marker to history');
                            }
                            return newHistory;
                        });

                        // Update DB async without blocking (it's not the source of truth)
                        if (requestIdToCancel && tursoAdapter.current && tursoAdapter.current.isConnected()) {
                            // Don't await - update DB in background
                            tursoAdapter.current.updateStatusByRequestId(requestIdToCancel, 'cancelled')
                                .then(updated => {
                                    if (!updated && currentTursoEntryId.current) {
                                        // Retry with entry ID if needed
                                        return tursoAdapter.current.updateStatus(currentTursoEntryId.current, 'cancelled');
                                    }
                                })
                                .then(() => {
                                    if (isDebug) {
                                        console.log(`[Turso] Marked request ${requestIdToCancel} as cancelled`);
                                    }
                                })
                                .catch(err => {
                                    if (isDebug) {
                                        console.error(`[Turso] Failed to update status:`, err);
                                    }
                                });
                        }

                        // Now clear the IDs
                        currentRequestId.current = null;
                        currentTursoEntryId.current = null;

                        // Reset cancellation flag after a short delay to allow cleanup
                        setTimeout(() => {
                            setIsCancelled(false);
                            if (isDebug) {
                                console.log('[Debug] Reset isCancelled flag');
                            }
                        }, 100);
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
                        await processCommand(command);
                    }
                } else if (command) {
                    await processCommand(command);
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
