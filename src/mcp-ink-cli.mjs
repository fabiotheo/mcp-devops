#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Ink Interface with Real Backend
 * Migrated to use AppContext for centralized state management
 *
 * Features:
 * - Multi-line input support with elegant rendering
 * - Turso distributed history with user mapping
 * - Clean loading screen during initialization
 * - Bracketed paste mode support
 * - Centralized state with Context API (NEW)
 */

import React, { useEffect, useRef, useState } from 'react';
import { Box, render, Text, useApp, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import MultilineInput from './components/MultilineInput.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
import { createDebugLogger } from './utils/debugLogger.js';
import {
  enableBracketedPasteMode,
  disableBracketedPasteMode
} from './utils/pasteDetection.js';
import { CANCELLATION_MARKER } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Module-level variables
const isDebug = process.argv.includes('--debug');
const debug = createDebugLogger(isDebug);

// Process --user argument or use environment variable
const getUserFromArgs = () => {
  // Check for --user=value format
  const userArg = process.argv.find(arg => arg.startsWith('--user='));
  if (userArg) {
    return userArg.split('=')[1];
  }

  // Check for --user value format (separate arguments)
  const userArgIndex = process.argv.indexOf('--user');
  if (userArgIndex !== -1 && process.argv[userArgIndex + 1]) {
    return process.argv[userArgIndex + 1];
  }

  return process.env.MCP_USER || 'default';
};

const user = getUserFromArgs();
debug('User', user);

// Inner component that uses the context
const MCPInkAppInner = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Get everything from context
  const { state, actions, services, config } = useAppContext();

  // Destructure state
  const { input, status, response, error, isProcessing } = state.core;
  const { history, commandHistory, fullHistory } = state.history;

  // Destructure actions
  const { setConfig, setStatus, setError, setInput, setResponse } = actions.core;
  const { setHistory, setCommandHistory, setFullHistory } = actions.history;

  // Destructure services
  const { orchestrator, patternMatcher, tursoAdapter } = services;

  // Destructure config
  const { isDebug: debugMode, isTTY, user: currentUser } = config;

  // Debug: Log the currentUser value
  if (debugMode) {
    debug('[MCPInkAppInner] currentUser from config:', currentUser);
  }

  const terminalWidth = stdout?.columns || 80;

  // Initialize history manager
  const { loadCommandHistory, saveToHistory } = useHistoryManager({
    tursoAdapter,
    setCommandHistory,
    setFullHistory,
    commandHistory,
    user: currentUser,
    isDebug: debugMode
  });

  // Initialize request manager
  const requestManager = useRequestManager({
    setFullHistory,
    setInput,
    setIsProcessing: actions.core.setIsProcessing,
    setStatus,
    setError,
    tursoAdapter,
    isDebug: debugMode,
    isTTY,
  });

  const { cleanupRequest, currentRequestId, activeRequests, isCancelled, setIsCancelled } = requestManager;

  // Initialize command processor
  // Debug: Log before calling useCommandProcessor
  if (debugMode) {
    debug(`[MCPInkAppInner] About to call useCommandProcessor with user: ${currentUser}`);
  }

  const { processCommand } = useCommandProcessor({
    input,
    commandHistory,
    fullHistory,
    orchestrator,
    patternMatcher,
    tursoAdapter,
    saveToHistory,
    setCommandHistory,
    setFullHistory,
    setHistory,
    setResponse,
    setIsProcessing: actions.core.setIsProcessing,
    requestManager, // Pass the whole requestManager object
    isDebug: debugMode,
    user: currentUser,
    formatResponse,
    isProcessing,
    response,
    error,
    status,
    setStatus,
    setError,
    debug
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
    user: currentUser,
    isDebug: debugMode
  });

  // Initialize input handler with minimal parameters
  useInputHandler({
    processCommand,
    cleanupRequest,
    formatResponse,
    exit
  });

  // Enable bracketed paste mode on mount
  useEffect(() => {
    if (isTTY) {
      enableBracketedPasteMode(isTTY, debugMode);
      return () => {
        disableBracketedPasteMode(isTTY, debugMode);
      };
    }
  }, [isTTY, debugMode]);

  // Clear Ctrl+C message after timeout
  useEffect(() => {
    if (response === 'Press Ctrl+C again to exit') {
      const timer = setTimeout(() => {
        setResponse('');
        actions.ui.setLastCtrlC(0);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [response, setResponse, actions.ui]);

  // Show loading screen during initialization - centered and beautiful
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
          '✨ MCP Terminal Assistant'
        )
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Spinner, { type: 'dots' }),
        React.createElement(Text, { color: 'cyan' }, ' Initializing...')
      ),
      React.createElement(
        Box,
        { flexDirection: 'column', alignItems: 'center' },
        status === 'loading-config' && React.createElement(
          Text,
          { color: 'gray' },
          'Loading configuration...'
        ),
        status === 'initializing-ai' && React.createElement(
          Text,
          { color: 'gray' },
          'Connecting to AI...'
        ),
        status === 'initializing' && React.createElement(
          Text,
          { color: 'gray' },
          'Setting up environment...'
        )
      )
    );
  }

  // Render error screen
  if (status === 'error') {
    return React.createElement(
      Box,
      { flexDirection: 'column', paddingTop: 1 },
      React.createElement(
        Text,
        { color: 'red' },
        '❌ ', error || 'An error occurred during initialization'
      ),
      React.createElement(
        Text,
        { dimColor: true },
        'Please check your configuration and try again.'
      )
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
      // Compact professional header with border
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
          '✻ Terminal Assistant IPCOM'
        ),
        // Version and status line
        React.createElement(
          Box,
          null,
          React.createElement(Text, { color: 'gray' }, '  Powered by AI • '),
          React.createElement(
            Text,
            { color: 'green', bold: true },
            'IPCOM TECNOLOGIA'
          ),
          React.createElement(Text, { color: 'gray' }, ' • v1.0'),
          debugMode && React.createElement(
            Text,
            { color: 'magenta', bold: true },
            ' [DEBUG]'
          )
        ),
        // Developer credits - elegant 3 lines
        React.createElement(
          Box,
          { flexDirection: 'column', marginTop: 0 },
          React.createElement(
            Text,
            { dimColor: true, italic: true },
            '  Developed by Fábio F. Theodoro'
          ),
          React.createElement(
            Text,
            { dimColor: true, italic: true },
            '  https://github.com/fabiotheo'
          ),
          React.createElement(
            Text,
            { dimColor: true, italic: true },
            '  https://ipcom.com.br'
          )
        )
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
                'Ready for your questions...'
              )
            )
          : React.createElement(
              Box,
              { flexDirection: 'column' },
              // Show ALL history - no slicing, no truncation
              ...history.map((line, i) => {
      if (line.startsWith('❯')) {
        return React.createElement(
          Box,
          { key: i, marginBottom: 0 },
          React.createElement(
            Text,
            { color: 'cyan', bold: true },
            line
          )
        );
      } else if (line.startsWith('─')) {
        return React.createElement(
          Box,
          { key: i, width: '100%' },
          React.createElement(
            Text,
            { dimColor: true },
            line
          )
        );
      } else {
        // Check if line is an error message to avoid markdown parsing issues
        if (line.includes('❌') || line.includes('⏳') || line.includes('Error:')) {
          return React.createElement(
            Box,
            { key: i, flexDirection: 'column', marginBottom: 0 },
            React.createElement(Text, { color: 'red' }, line)
          );
        } else {
          const elements = parseMarkdownToElements(line);
          return React.createElement(
            Box,
            { key: i, flexDirection: 'column', marginBottom: 0 },
            elements
          );
        }
      }
              })
            )
      )
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
          '─'.repeat(terminalWidth)
        )
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
              React.createElement(Spinner, { type: 'dots' })
            )
          : React.createElement(MultilineInput, {
              value: input,
              onChange: setInput,
              placeholder: 'Type your question...',
              showCursor: true,
              isActive: status === 'ready',
            })
      ),
      // Bottom separator line
      React.createElement(
        Box,
        null,
        React.createElement(
          Text,
          { dimColor: true },
          '─'.repeat(terminalWidth)
        )
      ),
      // Clean footer
      React.createElement(
        Box,
        { paddingLeft: 1, marginTop: 1 },
        React.createElement(
          Text,
          { dimColor: true, italic: true },
          '/help for commands • ↑↓ for history • Ctrl+C to exit'
        )
      )
    )
  );
};

// Main component wrapped with AppProvider
const MCPInkApp = () => {
  const isTTY = process.stdin.isTTY;

  // Debug: Log the user value being passed to AppProvider
  if (isDebug) {
    debug('[MCPInkApp] Passing user to AppProvider:', user);
  }

  return React.createElement(
    AppProvider,
    { config: { isDebug, isTTY, user } },
    React.createElement(MCPInkAppInner)
  );
};

// Start the application
const app = render(React.createElement(MCPInkApp), {
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

      // Wait a bit for the app to initialize
      setTimeout(async () => {
        // Get the processCommand function from the app context
        // For now, we'll just exit after processing
        // TODO: Properly integrate with the app's processCommand
        console.log('[Non-TTY] Command received but not processed - non-TTY mode needs implementation');
        app.unmount();
        process.exit(0);
      }, 5000); // Give more time for initialization
    }
  });
}

export default MCPInkApp;