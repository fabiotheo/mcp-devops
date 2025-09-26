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
import { parseMarkdownToElements } from './components/MarkdownParser.js';
import { formatResponse, preprocessMarkdown, postprocessMarkdown } from './utils/responseFormatter.js';
import { handleSpecialCommand } from './utils/specialCommands.js';
import { createDebugLogger } from './utils/debugLogger.js';
import {
  enableBracketedPasteMode,
  disableBracketedPasteMode,
  isPastedContent,
  cleanPastedContent,
  processPastedInput
} from './utils/pasteDetection.js';
import { useRequestManager } from './hooks/useRequestManager.js';
import { useCommandProcessor } from './hooks/useCommandProcessor.js';
import { CANCELLATION_MARKER } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Note: Using custom MarkdownParser for proper markdown rendering
// The parser handles bold, code, lists and other markdown elements

// Module-level variables
const isDebug = process.argv.includes('--debug');
const debug = createDebugLogger(isDebug);

// Process --user argument or use environment variable
const getUserFromArgs = () => {
  const userArgIndex = process.argv.indexOf('--user');
  if (userArgIndex !== -1 && process.argv[userArgIndex + 1]) {
    return process.argv[userArgIndex + 1];
  }
  return process.env.MCP_USER || 'default';
};

const user = getUserFromArgs();
debug('User', user);

// Main MCP Ink Application Component
const MCPInkApp = () => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [commandHistory, setCommandHistory] = useState([]);
  const [fullHistory, setFullHistory] = useState([]); // Full conversation with responses
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [status, setStatus] = useState('initializing');
  const [config, setConfig] = useState(null);

  // New state for enhanced controls
  const [lastCtrlC, setLastCtrlC] = useState(0);
  const [lastEsc, setLastEsc] = useState(0);

  const { exit } = useApp();
  const { stdout } = useStdout();
  const orchestrator = useRef(null);

  // Get terminal width for separator lines
  const terminalWidth = stdout?.columns || 80;
  const patternMatcher = useRef(null);
  const tursoAdapter = useRef(null);

  const isTTY = process.stdin.isTTY;

  // First create state for command processor
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState('');
  const [error, setError] = useState(null);

  // Use the request manager hook
  const requestManager = useRequestManager({
    setFullHistory,
    setInput,
    setIsProcessing,
    setStatus,
    setError,
    tursoAdapter,
    isDebug,
    isTTY,
    enableBracketedPasteMode
  });

  const {
    currentRequestId,
    currentTursoEntryId,
    activeRequests,
    aiAbortControllerRef,
    dbAbortControllerRef,
    cleanupRequest,
    isCancelled,
    setIsCancelled
  } = requestManager;

  // Use the command processor hook
  const { processCommand } = useCommandProcessor({
    orchestrator,
    patternMatcher,
    tursoAdapter,
    fullHistory,
    setFullHistory,
    setHistory,
    setCommandHistory,
    requestManager,
    user,
    isDebug,
    formatResponse,
    debug,
    isProcessing,
    setIsProcessing,
    response,
    setResponse,
    error,
    setError,
    status,
    setStatus
  });

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





  // Enable bracketed paste mode
  useEffect(() => {
    if (isTTY && status === 'ready') {
      enableBracketedPasteMode(isTTY, isDebug);

      return () => {
        disableBracketedPasteMode(isTTY, process.argv.includes('--debug'));
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
      if (isPastedContent(char)) {
        if (isDebug) {
          console.log(
            '[Debug] Paste detected! Length:',
            char.length,
            'Has newline:',
            char.includes('\n'),
          );
          console.log('[Debug] Raw paste content:', JSON.stringify(char));
        }

        // Process the pasted content
        const newInput = processPastedInput(input, char);
        setInput(newInput);

        if (isDebug) {
          console.log(
            '[Debug] Clean pasted content:',
            JSON.stringify(cleanPastedContent(char)),
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
          const specialCommandContext = {
            setResponse,
            setHistory,
            commandHistory,
            status,
            orchestrator,
            patternMatcher,
            isDebug,
            config,
            exit,
            formatResponse
          };
          if (!handleSpecialCommand(command, specialCommandContext)) {
            await processCommand(command);
          }
        } else if (command) {
          await processCommand(command);
        }

        setInput('');
        // Force re-enable bracketed paste mode after clearing input
        enableBracketedPasteMode(isTTY, false);
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
                        // O novo parser já retorna elementos prontos do Ink
                        const markdownElements = parseMarkdownToElements(
                          subline,
                          lineKey,
                        );

                        // Adicionar elementos diretamente (o parser já gerencia Box quando necessário)
                        elements.push(...markdownElements);
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
