#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Ink Interface with Context API
 * Refactored version using AppContext to eliminate prop drilling
 *
 * Features:
 * - Centralized state management with React Context
 * - Reduced coupling between components
 * - Cleaner hook interfaces
 */

import React from 'react';
import { Box, render, Text, useApp, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import MultilineInput from './components/MultilineInput.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Import Context and Provider
import { AppProvider, useAppContext } from './contexts/AppContext.js';

// Import hooks
import { useRequestManager } from './hooks/useRequestManager.js';
import { useCommandProcessor } from './hooks/useCommandProcessor.js';
import { useInputHandler } from './hooks/useInputHandler.js';
import { useBackendInitialization } from './hooks/useBackendInitialization.js';
import { useHistoryManager } from './hooks/useHistoryManager.js';

// Import utilities
import { parseMarkdownToElements } from './components/MarkdownParser.js';
import { formatResponse } from './utils/responseFormatter.js';
import { enableBracketedPasteMode, disableBracketedPasteMode } from './utils/pasteDetection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Process command line arguments
const getUserFromArgs = () => {
  const userArgIndex = process.argv.indexOf('--user');
  if (userArgIndex !== -1 && process.argv[userArgIndex + 1]) {
    return process.argv[userArgIndex + 1];
  }
  return process.env.MCP_USER || 'default';
};

// Inner component that uses the context
const MCPInkAppInner = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Get everything from context
  const { state, actions, services, config } = useAppContext();
  const { input, status, response, error } = state.core;
  const { history } = state.history;
  const { setConfig, setStatus, setError } = actions.core;
  const { orchestrator, patternMatcher, tursoAdapter } = services;
  const { isDebug, isTTY, user } = config;

  const terminalWidth = stdout?.columns || 80;

  // Initialize history manager
  const { loadCommandHistory, saveToHistory } = useHistoryManager({
    tursoAdapter,
    setCommandHistory: actions.history.setCommandHistory,
    setFullHistory: actions.history.setFullHistory,
    commandHistory: state.history.commandHistory,
    user,
    isDebug
  });

  // Initialize request manager
  const requestManager = useRequestManager({
    setFullHistory: actions.history.setFullHistory,
    setInput: actions.core.setInput,
    setIsProcessing: actions.core.setIsProcessing,
    setStatus,
    setError,
    tursoAdapter,
    isDebug,
    isTTY,
  });

  const { cleanupRequest, currentRequestId, activeRequests, isCancelled, setIsCancelled } = requestManager;

  // Initialize command processor
  const { processCommand } = useCommandProcessor({
    input: state.core.input,
    commandHistory: state.history.commandHistory,
    fullHistory: state.history.fullHistory,
    orchestrator,
    patternMatcher,
    tursoAdapter,
    saveToHistory,
    setCommandHistory: actions.history.setCommandHistory,
    setFullHistory: actions.history.setFullHistory,
    setHistory: actions.history.setHistory,
    setResponse: actions.core.setResponse,
    setIsProcessing: actions.core.setIsProcessing,
    activeRequests,
    currentRequestId,
    cleanupRequest,
    isCancelled,
    setIsCancelled,
    isDebug,
    user,
    formatResponse
  });

  // Initialize backend services
  useBackendInitialization({
    setConfig,
    setStatus,
    setError,
    loadCommandHistory,
    orchestrator,
    patternMatcher,
    tursoAdapter,
    user,
    isDebug
  });

  // Initialize input handler (now with only 4 parameters!)
  useInputHandler({
    processCommand,
    cleanupRequest,
    formatResponse,
    exit
  });

  // Enable bracketed paste mode on mount
  React.useEffect(() => {
    if (isTTY) {
      enableBracketedPasteMode(isTTY, isDebug);
      return () => {
        disableBracketedPasteMode(isTTY, isDebug);
      };
    }
  }, [isTTY, isDebug]);

  // Clear Ctrl+C message after timeout
  React.useEffect(() => {
    if (response === 'Press Ctrl+C again to exit') {
      const timer = setTimeout(() => {
        actions.core.setResponse('');
        actions.ui.setLastCtrlC(0);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [response]);

  // Render loading screen
  if (status === 'initializing' || status === 'loading-config' || status === 'initializing-ai') {
    return (
      <Box flexDirection="column" paddingTop={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" /> Initializing MCP Terminal Assistant...
          </Text>
        </Box>
        {status === 'loading-config' && (
          <Text dimColor>  Loading configuration...</Text>
        )}
        {status === 'initializing-ai' && (
          <Text dimColor>  Initializing AI backend...</Text>
        )}
      </Box>
    );
  }

  // Render error screen
  if (status === 'error') {
    return (
      <Box flexDirection="column" paddingTop={1}>
        <Text color="red">❌ {error || 'An error occurred during initialization'}</Text>
        <Text dimColor>Please check your configuration and try again.</Text>
      </Box>
    );
  }

  // Render main interface
  return (
    <Box flexDirection="column" width="100%">
      {/* History display */}
      {history.map((line, i) => {
        if (line.startsWith('❯')) {
          return (
            <Box key={i} marginBottom={0}>
              <Text color="cyan" bold>
                {line}
              </Text>
            </Box>
          );
        } else if (line.startsWith('─')) {
          return (
            <Box key={i} width="100%">
              <Text dimColor>{line}</Text>
            </Box>
          );
        } else {
          const elements = parseMarkdownToElements(line);
          return (
            <Box key={i} flexDirection="column" marginBottom={0}>
              <Text>{elements}</Text>
            </Box>
          );
        }
      })}

      {/* Current response */}
      {response && (
        <Box flexDirection="column" marginTop={1}>
          {parseMarkdownToElements(response)}
        </Box>
      )}

      {/* Input area */}
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color="cyan" bold>
            ❯{' '}
          </Text>
          <MultilineInput
            value={input}
            onChange={actions.core.setInput}
            placeholder="Type a command or question..."
          />
        </Box>

        {/* Status line */}
        {isTTY && (
          <Box marginTop={1}>
            <Text dimColor>
              {state.core.isProcessing ? (
                <>
                  <Spinner type="dots" /> Processing... (Press ESC to cancel)
                </>
              ) : (
                '/help for commands • ↑↓ for history • Ctrl+C to exit'
              )}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

// Main component wrapped with provider
const MCPInkApp = () => {
  const isDebug = process.argv.includes('--debug');
  const isTTY = process.stdin.isTTY;
  const user = getUserFromArgs();

  return (
    <AppProvider config={{ isDebug, isTTY, user }}>
      <MCPInkAppInner />
    </AppProvider>
  );
};

// Start the application
const app = render(<MCPInkApp />, {
  exitOnCtrlC: false, // Disable default Ctrl+C exit to use our custom handler
});

// Handle non-TTY mode
if (!process.stdin.isTTY) {
  let inputBuffer = '';

  process.stdin.on('data', (data) => {
    inputBuffer += data.toString();
  });

  process.stdin.on('end', async () => {
    const trimmedInput = inputBuffer.trim();
    if (trimmedInput) {
      // In non-TTY mode, we need to handle the command directly
      console.log(`Processing: ${trimmedInput}`);
      // Note: In production, you'd need to properly handle this
      // For now, we'll just exit
      setTimeout(() => {
        app.unmount();
        process.exit(0);
      }, 1000);
    }
  });
}

export default MCPInkApp;