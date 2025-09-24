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

import React, { useEffect, useRef, useState } from 'react';
import { Box, render, Text, useApp, useInput, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import MultilineInput from './components/MultilineInput.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs/promises';
import { appendFileSync, writeFileSync } from 'node:fs';

// Import backend modules
import AICommandOrchestratorBash from './ai_orchestrator_bash.js';
import PatternMatcher from './libs/pattern_matcher.js';
import ModelFactory from './ai_models/model_factory.js';
import TursoAdapter from './bridges/adapters/TursoAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Note: Removed marked-terminal processing as it was causing text wrapping issues
// Using simplified text rendering instead

// Simplified markdown parser - avoid complex processing that breaks layout
const parseMarkdownToElements = (text, baseKey) => {
  if (!text) return [React.createElement(Text, { key: baseKey }, '')];

  // Return plain text with wrap disabled to prevent breaking lines
  return [React.createElement(Text, { key: baseKey, wrap: 'truncate-end' }, text)];
};

// Module-level variables
const isDebug = process.argv.includes('--debug');

// Constant for cancellation marker
const CANCELLATION_MARKER =
  '[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]';

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
  const [fullHistory, setFullHistory] = useState([]); // Full conversation with responses
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
  const currentTursoEntryId = useRef(null); // Track current Turso entry ID
  const activeRequests = useRef(new Map()); // Track active requests

  const { exit } = useApp();
  const { stdout } = useStdout();
  const orchestrator = useRef(null);

  // Get terminal width for separator lines
  const terminalWidth = stdout?.columns || 80;
  const patternMatcher = useRef(null);
  const tursoAdapter = useRef(null);
  // Separate abort controllers for different operations
  const aiAbortControllerRef = useRef(null); // For AI API calls (cancellable)
  const dbAbortControllerRef = useRef(null); // For database operations (protected)

  const isTTY = process.stdin.isTTY;

  // Initialize backend services
  useEffect(() => {
    const initBackend = async () => {
      try {
        // Clear debug log if debug mode is active
        if (isDebug) {
          try {
            const debugHeader = `===== MCP DEBUG LOG =====\nStarted: ${new Date().toISOString()}\nUser: ${user}\n=========================\n`;
            writeFileSync('/tmp/mcp-debug.log', debugHeader);
            console.log('[Debug] Log file initialized at /tmp/mcp-debug.log');
          } catch (err) {
            console.log('[Debug] Could not initialize log file:', err.message);
          }
        }

        setStatus('loading-config');

        // Load configuration
        const configPath = path.join(
          process.env.HOME,
          '.mcp-terminal/config.json',
        );
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
            temperature: 0.7,
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
                success: false,
              };
            },
          };
        }

        // Initialize AI Orchestrator or simple wrapper based on tools support
        if (
          loadedConfig.use_native_tools === true ||
          loadedConfig.enable_bash_tool === true
        ) {
          // Use full orchestrator with tools
          orchestrator.current = new AICommandOrchestratorBash(aiModel, {
            verboseLogging: isDebug,
            enableBash: true,
            bashConfig: {
              timeout: 30000,
            },
          });

          // Add wrapper method for compatibility
          orchestrator.current.askCommand = async function (
            command,
            options = {},
          ) {
            if (isDebug) {
              console.log(
                '[Debug] askCommand wrapper called, using orchestrateExecution',
              );
            }
            // Pass history and other options directly in the context that becomes systemContext
            const contextWithHistory = {
              ...options, // Include all options (history, signal, etc)
              patternInfo: options.patternInfo,
            };
            // IMPORTANTE: passar options como terceiro parâmetro para propagar o signal
            return await this.orchestrateExecution(
              command,
              contextWithHistory,
              options,
            );
          };
        } else {
          // Use simple direct AI model without tools
          orchestrator.current = {
            askCommand: async function (command, options = {}) {
              try {
                // Simple conversation without tools
                if (aiModel.askCommand) {
                  return await aiModel.askCommand(command, options);
                } else {
                  // Fallback to a simple response
                  return {
                    response: `Olá! Sou o MCP Terminal Assistant. Você disse: "${command}"\n\nPara habilitar funcionalidades avançadas com execução de comandos, configure "use_native_tools" ou "enable_bash_tool" como true em ~/.mcp-terminal/config.json`,
                    success: true,
                  };
                }
              } catch (error) {
                return {
                  response: `Erro ao processar comando: ${error.message}`,
                  success: false,
                  error: error.message,
                };
              }
            },
            cleanup: async () => {},
          };
        }

        // Initialize Pattern Matcher
        patternMatcher.current = new PatternMatcher();
        await patternMatcher.current.loadPatterns();

        // Initialize Turso Adapter
        try {
          tursoAdapter.current = new TursoAdapter({
            debug: isDebug,
            userId: user,
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
            console.log(
              '  ⚠ Turso initialization failed, using local history',
            );
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
      // Check if we have a Turso adapter
      if (
        tursoAdapter.current &&
        tursoAdapter.current.isConnected()
      ) {
        // Load from Turso (user history if user is set, machine history if default)
        const userHistory = await tursoAdapter.current.getHistory(100); // Get last 100 commands
        const commands = [];

        // Store full conversation history (not just commands)
        const fullConversationHistory = [];

        // Process history to include both questions and responses
        userHistory.forEach(h => {
          if (h.command && h.command.trim()) {
            // Add the user's command
            commands.push(h.command);
            fullConversationHistory.push({
              role: 'user',
              content: h.command,
            });

            // Add the response or cancellation marker
            if (h.status === 'cancelled') {
              // For cancelled messages, only add to fullConversationHistory for AI context
              // Don't add to commands array to keep navigation clean
              fullConversationHistory.push({
                role: 'assistant',
                content:
                  '[Message processing was interrupted - no response generated]',
              });
            } else if (h.response && h.response.trim()) {
              // Add the actual response
              fullConversationHistory.push({
                role: 'assistant',
                content: h.response,
              });
            }
          }
        });

        // Store both for different uses
        setCommandHistory(commands);

        // Store full conversation for AI context (we'll need to add this state)
        setFullHistory(fullConversationHistory);
        if (isDebug) {
          console.log(
            `[Debug] Loaded ${userHistory.length} entries from Turso for user ${user}`,
          );
          console.log(
            `[Debug] Processed into ${commands.length} command history items (including cancellation markers)`,
          );
          console.log(
            `[Debug] Full conversation history has ${fullConversationHistory.length} messages`,
          );
          console.log(
            `[Debug] Full history:`,
            JSON.stringify(fullConversationHistory, null, 2),
          );
        }
        return;
      }

      // Fall back to local file
      const historyPath = path.join(process.env.HOME, '.mcp_terminal_history');
      const data = await fs.readFile(historyPath, 'utf8');
      const loadedHistory = data.split('\n').filter(line => line.trim());
      setCommandHistory(loadedHistory.slice(-100)); // Keep last 100 commands
      if (isDebug) {
        console.log(
          `[Debug] Loaded ${loadedHistory.length} commands from local file`,
        );
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
      console.log(
        `[Debug] Saving to persistent history. Total commands in memory: ${commandHistory.length}`,
      );
    }

    try {
      // Save to Turso if connected
      if (
        tursoAdapter.current &&
        tursoAdapter.current.isConnected() &&
        user !== 'default'
      ) {
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

    // 5. CRITICAL: Add cancelled message to fullHistory IMMEDIATELY
    if (reason.includes('cancel') && request?.command) {
      if (isDebug) {
        console.log('[Debug] Adding cancelled message to fullHistory');
      }

      // Add the user's cancelled message and cancellation marker to fullHistory
      setFullHistory(prev => {
        const updated = [...prev];

        // Check if the user message is already in history
        const lastMessage = updated[updated.length - 1];
        const secondLastMessage = updated[updated.length - 2];
        const userMessageExists =
          (lastMessage?.role === 'user' &&
            lastMessage?.content === request.command) ||
          (secondLastMessage?.role === 'user' &&
            secondLastMessage?.content === request.command);

        // Check if cancellation marker already exists
        const hasMarker =
          lastMessage?.role === 'assistant' &&
          lastMessage?.content === CANCELLATION_MARKER;

        // Add user message if it doesn't exist
        if (!userMessageExists) {
          updated.push({
            role: 'user',
            content: request.command,
          });
          if (isDebug) {
            console.log('[Debug] Added user message to fullHistory');
          }
        }

        // Add cancellation marker if it doesn't exist
        if (!hasMarker) {
          updated.push({
            role: 'assistant',
            content: CANCELLATION_MARKER,
          });
          if (isDebug) {
            console.log('[Debug] Added cancellation marker to history');
          }
        }

        if (isDebug) {
          console.log(
            '[Debug] fullHistory now has',
            updated.length,
            'messages',
          );
        }

        return updated;
      });
    }

    // 6. Update Turso if this was a cancellation (not protected by abort)
    if (isDebug) {
      console.log(`[Debug] Cleanup - checking Turso update conditions:`);
      console.log(`  - reason: "${reason}"`);
      console.log(
        `  - reason.includes('cancel'): ${reason.includes('cancel')}`,
      );
      console.log(`  - request exists: ${!!request}`);
      console.log(`  - request?.tursoId: ${request?.tursoId}`);
      console.log(
        `  - tursoAdapter connected: ${tursoAdapter.current?.isConnected()}`,
      );
    }

    if (
      reason.includes('cancel') &&
      request?.tursoId &&
      tursoAdapter.current?.isConnected()
    ) {
      try {
        if (isDebug) {
          console.log(
            `[Debug] Updating Turso entry ${request.tursoId} to cancelled status`,
          );
        }
        // Update the message status to 'cancelled' in Turso
        await tursoAdapter.current.updateStatusByRequestId(
          requestId,
          'cancelled',
        );
        if (isDebug) {
          console.log(`[Debug] Turso entry marked as cancelled`);
        }
      } catch (err) {
        console.warn(
          `[Warning] Failed to update Turso status to cancelled: ${err.message}`,
        );
      }
    }

    // 7. Clear references
    if (currentRequestId.current === requestId) {
      currentRequestId.current = null;
    }
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current = null;
    }
    if (dbAbortControllerRef.current) {
      dbAbortControllerRef.current = null;
    }

    // 8. Finally remove from Map (do this LAST to ensure all operations can access request data)
    activeRequests.current.delete(requestId);
  };

  // Process command through backend
  const processCommand = async command => {
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
      tursoId: null,
    });

    // Save question to Turso immediately with status 'pending' and request_id
    currentTursoEntryId.current = null;
    if (isDebug) {
      console.log(`[Debug] Checking Turso save conditions:`);
      console.log(
        `  - tursoAdapter.current: ${tursoAdapter.current ? 'exists' : 'null'}`,
      );
      console.log(
        `  - isConnected: ${tursoAdapter.current?.isConnected() || false}`,
      );
      console.log(`  - user: ${user}`);
      console.log(`  - user !== 'default': ${user !== 'default'}`);
    }

    if (
      tursoAdapter.current &&
      tursoAdapter.current.isConnected()
    ) {
      currentTursoEntryId.current =
        await tursoAdapter.current.saveQuestionWithStatusAndRequestId(
          command,
          'pending',
          requestId,
        );

      // Update Map with Turso ID
      const request = activeRequests.current.get(requestId);
      if (request) {
        request.tursoId = currentTursoEntryId.current;
      }

      if (isDebug) {
        console.log(
          `[Turso] Question saved with ID: ${currentTursoEntryId.current}, request_id: ${requestId}, status: pending`,
        );
      }

      // CRITICAL: Check if cancelled AFTER save completes
      if (isCancelled || currentRequestId.current !== requestId) {
        if (isDebug) {
          console.log(
            `[Debug] Request ${requestId} was cancelled during save. Updating status to cancelled.`,
          );
        }
        // Update to cancelled status immediately
        await tursoAdapter.current.updateStatusByRequestId(
          requestId,
          'cancelled',
        );
        await cleanupRequest(requestId, 'cancelled during save');
        return;
      }
    }

    if (isDebug) {
      console.log(`[Debug] Starting request ${requestId}`);
    }

    // Add to display history (show complete command, including multi-line)
    const displayCommand = `❯ ${command}`;
    setHistory(prev => [...prev.slice(-200), displayCommand]);

    // IMPORTANT: Add to command history immediately so it's available for context
    // even if the request is cancelled
    setCommandHistory(prev => {
      const newHistory = [...prev, command].slice(-100);
      if (isDebug) {
        console.log(
          `[Debug] Added to commandHistory: "${command.substring(0, 50)}..." (total: ${newHistory.length})`,
        );
      }
      return newHistory;
    });
    setHistoryIndex(-1);

    // Also add to full history as user message
    setFullHistory(prev => [...prev, { role: 'user', content: command }]);

    try {
      let output = '';

      // First, check if pattern matcher can handle it
      const patternResult = patternMatcher.current.match(command);

      if (patternResult && patternResult.pattern) {
        // Pattern matcher recognized it - but we'll process through AI anyway
        // The pattern info can be used to enhance the AI response
        setStatus('processing');

        // Use full history if available, otherwise convert command history
        const formattedHistory =
          fullHistory.length > 0
            ? fullHistory.slice(-20) // Last 20 messages (10 exchanges)
            : [];

        const result = await orchestrator.current.askCommand(command, {
          history: formattedHistory,
          verbose: isDebug,
          patternInfo: patternResult,
          signal: aiAbortControllerRef.current?.signal,
        });

        // Log para arquivo temporário apenas se --debug ativo
        const debugLog = (label, data) => {
          if (!isDebug) return; // Só loga se debug estiver ativo
          const logContent = `\n${label}\n${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}\n${'='.repeat(60)}\n`;
          appendFileSync('/tmp/mcp-debug.log', logContent);
        };

        debugLog('==== RESPOSTA BRUTA DA IA ====', result);

        // Extract text from result
        if (typeof result === 'string') {
          output = result;
        } else if (result && typeof result === 'object') {
          // Try to get the actual response text from various possible fields
          output =
            result.directAnswer ||
            result.response ||
            result.message ||
            result.output;
          debugLog('==== TEXTO EXTRAÍDO ====', output);

          // If still no output but result has success and a response somewhere, try to extract it
          if (!output && result.success === false && result.error) {
            // Don't show error message for cancelled operations
            if (result.error === 'CANCELLED') {
              // Silently ignore - the cancellation is already handled
              return;
            }
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

        // Add response to full history
        setFullHistory(prev => [
          ...prev,
          { role: 'assistant', content: output },
        ]);

        // Update Turso with response and status 'completed'
        if (
          currentTursoEntryId.current &&
          tursoAdapter.current &&
          tursoAdapter.current.isConnected()
        ) {
          if (isDebug) {
            console.log(
              `[Debug] About to update Turso entry ${currentTursoEntryId.current} to completed (should not happen for cancelled requests!)`,
            );
          }
          await tursoAdapter.current.updateWithResponseAndStatus(
            currentTursoEntryId.current,
            output,
            'completed',
          );
          if (isDebug) {
            console.log(
              `[Turso] Updated entry ${currentTursoEntryId.current} with response and status: completed`,
            );
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
        if (
          !request ||
          request.status === 'cancelled' ||
          isCancelled ||
          currentRequestId.current !== requestId
        ) {
          if (isDebug) {
            console.log(
              `[Debug] Request ${requestId} cancelled before AI call`,
            );
          }
          await cleanupRequest(requestId, 'cancelled before AI call');
          return;
        }

        // Check again if cancelled before updating status
        if (isCancelled || currentRequestId.current !== requestId) {
          if (isDebug) {
            console.log(
              `[Debug] Request ${requestId} cancelled before updating status`,
            );
          }
          await cleanupRequest(requestId, 'cancelled before status update');
          return;
        }

        // Update status to 'processing' in Turso
        if (currentTursoEntryId.current && tursoAdapter.current) {
          await tursoAdapter.current.updateStatus(
            currentTursoEntryId.current,
            'processing',
          );
          request.status = 'processing';
        }

        try {
          // Use full history if available, otherwise empty
          const formattedHistory =
            fullHistory.length > 0
              ? fullHistory.slice(-20) // Last 20 messages (10 exchanges)
              : [];

          // Final check before calling AI (prevent race condition)
          const finalCheck = activeRequests.current.get(requestId);
          if (!finalCheck || finalCheck.status === 'cancelled') {
            if (isDebug) {
              console.log(
                `[Debug] Request ${requestId} cancelled just before AI call. Aborting.`,
              );
            }
            await cleanupRequest(requestId, 'cancelled before AI call');
            return;
          }

          if (isDebug) {
            console.log(`[Debug] Calling AI for request ${requestId}`);
            console.log(
              `[Debug] Passing history with ${formattedHistory.length} formatted messages`,
            );
            console.log(`[Debug] Formatted history:`, formattedHistory);
          }

          const result = await orchestrator.current.askCommand(command, {
            history: formattedHistory,
            verbose: isDebug,
            signal: aiAbortControllerRef.current?.signal,
          });

          if (isDebug) {
            console.log(
              `[Debug] AI responded for request ${requestId}, current: ${currentRequestId.current}`,
            );
          }

          // CRITICAL: Use Map local as primary source of truth (no DB latency)
          const currentRequest = activeRequests.current.get(requestId);
          const isLocalCancelled =
            !currentRequest ||
            currentRequest.status === 'cancelled' ||
            isCancelled ||
            currentRequestId.current !== requestId;

          if (isLocalCancelled) {
            if (isDebug) {
              console.log(
                `[Debug] Request ${requestId} cancelled (local check). Ignoring response.`,
              );
            }
            await cleanupRequest(requestId, 'response after cancellation');
            return;
          }

          // Extract text from result
          if (typeof result === 'string') {
            output = result;
          } else if (result && typeof result === 'object') {
            // Try to get the actual response text from various possible fields
            output =
              result.directAnswer ||
              result.response ||
              result.message ||
              result.output;

            // If still no output but result has success and a response somewhere, try to extract it
            if (!output && result.success === false && result.error) {
              // Don't show error message for cancelled operations
              if (result.error === 'CANCELLED') {
                // Silently ignore - the cancellation is already handled
                return;
              }
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
              console.log(
                `[Debug] Request ${requestId} cancelled before setting response`,
              );
            }
            await cleanupRequest(
              requestId,
              'cancelled before setting response',
            );
            return;
          }

          if (isDebug) {
            console.log(`[Debug] Setting response for request ${requestId}`);
          }

          setResponse(output);
          setHistory(prev => [...prev, formatResponse(output)]);

          // Add response to full history
          setFullHistory(prev => [
            ...prev,
            { role: 'assistant', content: output },
          ]);

          // Update Turso with response and status 'completed'
          if (
            currentTursoEntryId.current &&
            tursoAdapter.current &&
            tursoAdapter.current.isConnected()
          ) {
            if (isDebug) {
              console.log(
                `[Debug] About to update Turso entry ${currentTursoEntryId.current} to completed (should not happen for cancelled requests!)`,
              );
            }
            await tursoAdapter.current.updateWithResponseAndStatus(
              currentTursoEntryId.current,
              output,
              'completed',
            );
            if (isDebug) {
              console.log(
                `[Turso] Updated entry ${currentTursoEntryId.current} with response and status: completed`,
              );
            }
          } else {
            // Fallback to old method if no entry ID
            if (requestId) {
              await saveToHistory(command, output);
            } else {
              console.warn(
                '[Warning] Cannot save to history: requestId is null',
              );
            }
          }
        } catch (abortErr) {
          // If it's an abort error or was cancelled, just return silently
          if (
            isCancelled ||
            abortErr.name === 'AbortError' ||
            aiAbortControllerRef.current?.signal.aborted
          ) {
            await cleanupRequest(
              currentRequestId.current || requestId,
              'aborted',
            );
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
      if (
        tursoAdapter.current &&
        tursoAdapter.current.isConnected() &&
        currentRequestId.current
      ) {
        await tursoAdapter.current.updateStatusByRequestId(
          currentRequestId.current,
          'error',
        );
        if (isDebug) {
          console.log(
            `[Turso] Marked request ${currentRequestId.current} as error`,
          );
        }
      }
    } finally {
      setIsProcessing(false);

      // Clean up the request from activeRequests Map to prevent memory leak
      if (
        currentRequestId.current &&
        activeRequests.current.has(currentRequestId.current)
      ) {
        activeRequests.current.delete(currentRequestId.current);
        if (isDebug) {
          console.log(
            `[Debug] Cleaned up request ${currentRequestId.current} from activeRequests`,
          );
        }
      }
    }
  };

  // Pre-process markdown to fix known formatting issues
  const preprocessMarkdown = text => {
    if (!text) return '';

    // Fix patterns that cause issues with marked-terminal
    return (
      text
        // Prevent line breaks after bold in lists
        .replace(/^(\s*-\s+)\*\*([^*]+)\*\*/gm, '$1__BOLD__$2__/BOLD__')
        // Prevent line breaks in bold:colon patterns
        .replace(/\*\*([^*]+)\*\*\s*:/g, '__BOLD__$1__/BOLD__:')
        // Clean up spacing
        .replace(/\n{3,}/g, '\n\n')
    );
  };

  // Post-process after marked to restore bold formatting
  const postprocessMarkdown = text => {
    if (!text) return '';

    return (
      text
        // Restore bold markers
        .replace(/__BOLD__/g, '**')
        .replace(/__\/BOLD__/g, '**')
    );
  };

  // Format response for display - minimal processing to avoid breaking text
  const formatResponse = text => {
    if (!text) return '';

    // Ensure text is a string
    const textStr = typeof text === 'string' ? text : String(text);

    if (isDebug) {
      appendFileSync(
        '/tmp/mcp-debug.log',
        `\n==== formatResponse INPUT ====\n${textStr}\n${'='.repeat(60)}\n`,
      );
    }

    // Minimal formatting - just clean up excessive newlines
    // Don't try to reformat or wrap text as that causes issues
    const formatted = textStr
      // Clean up excessive newlines but preserve structure
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();

    if (isDebug) {
      appendFileSync(
        '/tmp/mcp-debug.log',
        `\n==== formatResponse OUTPUT ====\n${formatted}\n${'='.repeat(60)}\n`,
      );
    }

    return formatted;
  };

  // Handle special commands
  const handleSpecialCommand = command => {
    const cmd = command.slice(1).toLowerCase();

    switch (cmd) {
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
      if (isDebug) {
        if (char) {
          console.log('[Debug] Raw input received:', JSON.stringify(char));
          console.log('[Debug] Current input state:', JSON.stringify(input));
          console.log('[Debug] Input length:', input.length);
          console.log(
            '[Debug] Char codes:',
            Array.from(char).map(c => c.charCodeAt(0)),
          );
          // Check for paste markers
          if (char.includes('200~') || char.includes('201~')) {
            console.log('[Debug] Paste marker detected in char!');
          }
        }
        if (key) {
          console.log('[Debug] Key event:', key);
        }
      }

      // SIMPLE paste detection - if we get multiple chars at once, it's a paste
      if (char && (char.length > 1 || char.includes('\n'))) {
        if (isDebug) {
          console.log(
            '[Debug] Paste detected! Length:',
            char.length,
            'Has newline:',
            char.includes('\n'),
          );
          console.log('[Debug] Raw paste content:', JSON.stringify(char));
        }

        // Clean any bracketed paste markers if they leaked through
        let cleanContent = char;
        cleanContent = cleanContent.replace(/\x1b\[200~/g, '');
        cleanContent = cleanContent.replace(/\x1b\[201~/g, '');
        cleanContent = cleanContent.replace(/\[200~/g, '');
        cleanContent = cleanContent.replace(/\[201~/g, '');

        // Convert \r to \n for multi-line
        cleanContent = cleanContent.replace(/\r/g, '\n');

        // Update input with pasted content
        setInput(prev => {
          if (prev === '') {
            // Empty input - just set the pasted content
            return cleanContent;
          }
          // Otherwise append to existing input
          return prev + cleanContent;
        });

        if (isDebug) {
          console.log(
            '[Debug] Clean pasted content:',
            JSON.stringify(cleanContent),
          );
        }

        return;
      }

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
              console.log(
                `[Debug] ESC pressed - cancelling request ${currentRequestId.current}`,
              );
            }
            setIsCancelled(true);

            // Save the request ID before clearing it
            const requestIdToCancel = currentRequestId.current;

            // IMMEDIATELY mark as cancelled in Map local (primary source)
            const request = activeRequests.current.get(requestIdToCancel);
            if (request) {
              request.status = 'cancelled';
            }

            // Use unified cleanup function (it will handle everything including fullHistory update)
            await cleanupRequest(
              requestIdToCancel,
              'Operation cancelled by user',
              true,
            );

            // Add cancellation marker to command history for context
            // This lets the AI know the previous message was interrupted
            setCommandHistory(prev => {
              const newHistory = [
                ...prev,
                '[User pressed ESC - Previous message was interrupted]',
              ].slice(-100);
              if (isDebug) {
                console.log(
                  '[Debug] Added cancellation marker to command history',
                );
              }
              return newHistory;
            });

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
        // Force re-enable bracketed paste mode after clearing input
        if (isTTY) {
          process.stdout.write('\x1b[?2004h');
        }
      } else if (key.upArrow) {
        // Navigate history up
        if (isDebug) {
          console.log(
            `[Debug] History navigation UP - Current index: ${historyIndex}, History length: ${commandHistory.length}`,
          );
        }
        // Filter out ESC markers from navigation
        const navigableHistory = commandHistory.filter(
          cmd =>
            !cmd.includes('[User pressed ESC') &&
            !cmd.includes('Previous message was interrupted'),
        );
        if (navigableHistory.length > 0) {
          const newIndex =
            historyIndex < navigableHistory.length - 1
              ? historyIndex + 1
              : historyIndex;
          setHistoryIndex(newIndex);
          setInput(
            navigableHistory[navigableHistory.length - 1 - newIndex] || '',
          );
        }
      } else if (key.downArrow) {
        // Navigate history down
        // Filter out ESC markers from navigation
        const navigableHistory = commandHistory.filter(
          cmd =>
            !cmd.includes('[User pressed ESC') &&
            !cmd.includes('Previous message was interrupted'),
        );
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setInput(
            navigableHistory[navigableHistory.length - 1 - newIndex] || '',
          );
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setInput('');
        }
      } else if (key.ctrl && char === 'c') {
        // Handle Ctrl+C (double tap to exit)
        const now = Date.now();

        if (lastCtrlC > 0 && now - lastCtrlC < 2000) {
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
        setInput(prev => {
          const newValue = prev.slice(0, -1);
          if (isDebug && newValue === '') {
            console.log('[Debug] Input cleared via backspace - now empty');
          }
          return newValue;
        });
      } else if (key.ctrl && key.l) {
        // Clear screen
        setHistory([]);
        setResponse('');
      } else if (char && !key.ctrl && !key.meta) {
        // Regular single character input
        setInput(prev => prev + char);
      }
    });
  }

  // Show loading screen during initialization
  if (status !== 'ready' && status !== 'error' && status !== 'processing') {
    return React.createElement(
      Box,
      {
        flexDirection: 'column',
        padding: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: 20,
      },
      React.createElement(
        Box,
        { marginBottom: 2 },
        React.createElement(
          Text,
          { color: 'green', bold: true },
          '✨ MCP Terminal Assistant',
        ),
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Spinner, { type: 'dots' }),
        React.createElement(Text, { color: 'cyan' }, ' Initializing...'),
      ),
      React.createElement(
        Box,
        { flexDirection: 'column', alignItems: 'center' },
        status === 'loading-config' &&
          React.createElement(
            Text,
            { color: 'gray' },
            'Loading configuration...',
          ),
        status === 'initializing-ai' &&
          React.createElement(Text, { color: 'gray' }, 'Connecting to AI...'),
        status === 'initializing' &&
          React.createElement(
            Text,
            { color: 'gray' },
            'Setting up environment...',
          ),
      ),
    );
  }

  // Render main UI - let terminal handle scrolling naturally
  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      minHeight: stdout ? stdout.rows : 24, // Use minHeight instead of height
    },
    // Top section: Header + History (grows to push input down)
    React.createElement(
      Box,
      {
        flexDirection: 'column',
        flexGrow: 1, // This pushes the input to bottom
      },
      // Compact professional header
      React.createElement(
        Box,
        {
          flexDirection: 'column',
          borderStyle: 'round',
          borderColor: 'cyan',
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
          marginTop: 1,
          marginLeft: 1,
          width: 55, // Fixed width for compact design
        },
        // Title line
        React.createElement(
          Text,
          { color: 'cyan', bold: true },
          '✻ Terminal Assistant IPCOM',
        ),

        // Version and status line
        React.createElement(
          Box,
          null,
          React.createElement(Text, { color: 'gray' }, '  Powered by AI • '),
          React.createElement(
            Text,
            { color: 'green', bold: true },
            'IPCOM TECNOLOGIA',
          ),
          React.createElement(Text, { color: 'gray' }, ' • v1.0'),
          isDebug &&
            React.createElement(
              Text,
              { color: 'magenta', bold: true },
              ' [DEBUG]',
            ),
        ),

        // Developer credits - elegant 3 lines
        React.createElement(
          Box,
          { flexDirection: 'column', marginTop: 0 },
          React.createElement(
            Text,
            { dimColor: true, italic: true },
            '  Developed by Fábio F. Theodoro',
          ),
          React.createElement(
            Text,
            { dimColor: true, italic: true },
            '  https://github.com/fabiotheo',
          ),
          React.createElement(
            Text,
            { dimColor: true, italic: true },
            '  https://ipcom.com.br',
          ),
          // https://x.com/real_fftheodoro
        ),
      ),

      // Conversation history
      React.createElement(
        Box,
        {
          paddingLeft: 1,
          paddingRight: 1,
          marginTop: 1,
          flexDirection: 'column',
        },
        history.length === 0
          ? React.createElement(
              Box,
              null,
              React.createElement(
                Text,
                { color: 'gray', italic: true },
                'Ready for your questions...',
              ),
            )
          : React.createElement(
              Box,
              { flexDirection: 'column' },
              // Show ALL history - no slicing, no truncation
              ...history
                .map((line, i) => {
                  const elements = [];

                  // Add spacing before ALL messages (both questions and answers)
                  if (i > 0) {
                    // Add an actual empty line (with a space to ensure it renders)
                    elements.push(
                      React.createElement(Text, { key: `space-${i}` }, ' '),
                    );
                  }

                  // Handle multi-line content properly
                  const lines = line.split('\n');
                  const isUserMessage = line.startsWith('❯');
                  const isErrorMessage = line.startsWith('✗');

                  lines.forEach((subline, j) => {
                    const lineKey = `${i}-${j}`;

                    // Para mensagens do usuário e erros, manter comportamento atual
                    if (isUserMessage || isErrorMessage) {
                      elements.push(
                        React.createElement(
                          Text,
                          {
                            key: lineKey,
                            color: isUserMessage ? 'cyan' : 'red',
                            bold: j === 0 && isUserMessage,
                          },
                          subline,
                        ),
                      );
                    } else {
                      // Para linhas vazias, adicionar um espaço para garantir que renderize
                      if (subline.trim() === '') {
                        elements.push(
                          React.createElement(
                            Text,
                            {
                              key: lineKey,
                            },
                            ' ',
                          ), // Espaço para garantir que a linha vazia apareça
                        );
                      } else {
                        // Para respostas da IA, aplicar parser de markdown diretamente
                        // Sem usar marked-terminal para evitar quebras de linha
                        const markdownElements = parseMarkdownToElements(
                          subline,
                          lineKey,
                        );

                        // Agrupar elementos em um Box com flexDirection row
                        // para manter tudo na mesma linha
                        if (markdownElements.length > 1) {
                          elements.push(
                            React.createElement(
                              Box,
                              {
                                key: lineKey,
                                flexDirection: 'row',
                              },
                              ...markdownElements,
                            ),
                          );
                        } else {
                          elements.push(...markdownElements);
                        }
                      }
                    }
                  });
                  return elements;
                })
                .flat(),
            ),
      ),
    ),

    // Bottom section: Input area
    React.createElement(
      Box,
      {
        flexDirection: 'column',
      },
      // Top separator line
      React.createElement(
        Box,
        null,
        React.createElement(
          Text,
          { dimColor: true },
          '─'.repeat(terminalWidth),
        ),
      ),

      // Input prompt
      React.createElement(
        Box,
        {
          paddingLeft: 1,
        },
        isProcessing
          ? React.createElement(
              Box,
              null,
              React.createElement(Text, { color: 'yellow' }, '❯ Processing '),
              React.createElement(Spinner, { type: 'dots' }),
            )
          : React.createElement(MultilineInput, {
              value: input,
              onChange: setInput,
              placeholder: 'Type your question...',
              showCursor: true,
              isActive: status === 'ready',
            }),
      ),

      // Bottom separator line
      React.createElement(
        Box,
        null,
        React.createElement(
          Text,
          { dimColor: true },
          '─'.repeat(terminalWidth),
        ),
      ),

      // Clean footer
      React.createElement(
        Box,
        { paddingLeft: 1, marginTop: 1 },
        React.createElement(
          Text,
          { dimColor: true, italic: true },
          '/help for commands • ↑↓ for history • Ctrl+C to exit',
        ),
      ),
    ),
  );
};

// Main execution
const main = async () => {
  console.clear();

  const { waitUntilExit } = render(React.createElement(MCPInkApp), {
    exitOnCtrlC: false, // Disable default Ctrl+C exit to use our custom handler
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
