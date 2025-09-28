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

import * as React from 'react';
import { Box, render, Text, useApp, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import MultilineInput from './components/MultilineInput.js';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

// Import Context and Provider
import { AppProvider, useAppContext } from './contexts/AppContext.js';

// Type definitions for AppProvider config
interface AppConfig {
  isDebug?: boolean;
  isTTY?: boolean;
  user?: string;
  [key: string]: unknown;
}

// Import hooks
import { useRequestManager } from './hooks/useRequestManager.js';
import { useCommandProcessor } from './hooks/useCommandProcessor.js';
import { useInputHandler } from './hooks/useInputHandler.js';
import { useBackendInitialization } from './hooks/useBackendInitialization.js';
import { useHistoryManager } from './hooks/useHistoryManager.js';

// Import utilities
import { parseMarkdownToElements } from './components/MarkdownParser.tsx';
import { formatResponse } from './utils/responseFormatter.js';
import { createDebugLogger } from './utils/debugLogger.js';
import { enableBracketedPasteMode, disableBracketedPasteMode } from './utils/pasteDetection.js';

// @ts-ignore - import.meta is available in ES modules
const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

// Process command line arguments
const getUserFromArgs = (): string => {
  const userArgIndex = process.argv.indexOf('--user');
  if (userArgIndex !== -1 && process.argv[userArgIndex + 1]) {
    return process.argv[userArgIndex + 1];
  }
  return process.env.MCP_USER || 'default';
};

// Inner component that uses the context
const MCPInkAppInner: React.FC = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Get everything from context
  const { state, actions, services, config } = useAppContext();
  const { input, status, response, error } = state.core;
  const { history } = state.history;
  const { setConfig, setStatus, setError } = actions.core;
  const { orchestrator, patternMatcher, tursoAdapter } = services;
  const { isDebug, isTTY, user } = config;

  const terminalWidth: number = stdout?.columns || 80;

  // Initialize history manager with proper typing
  const { loadCommandHistory, saveToHistory } = useHistoryManager({
    tursoAdapter: tursoAdapter as any, // Type mismatch with ref - safe to cast
    setCommandHistory: actions.history.setCommandHistory,
    setFullHistory: actions.history.setFullHistory as any, // Type mismatch between hooks - safe to cast
    commandHistory: state.history.commandHistory,
    user,
    isDebug
  });

  // Initialize request manager for handling async operations
  const requestManager = useRequestManager({
    setFullHistory: actions.history.setFullHistory as any, // Type mismatch between hooks - safe to cast
    setInput: actions.core.setInput,
    setIsProcessing: actions.core.setIsProcessing,
    setStatus,
    setError,
    tursoAdapter: tursoAdapter as any, // Type mismatch with ref - safe to cast
    isDebug,
    isTTY,
  });

  const { cleanupRequest, currentRequestId, activeRequests, isCancelled, setIsCancelled } = requestManager;

  // Initialize command processor for handling user commands
  const { processCommand } = useCommandProcessor({
    // Core state
    input: state.core.input,
    commandHistory: state.history.commandHistory,
    fullHistory: state.history.fullHistory,
    // Services
    orchestrator,
    patternMatcher,
    tursoAdapter: tursoAdapter as any, // Type mismatch with ref - safe to cast
    // Functions
    saveToHistory,
    setCommandHistory: actions.history.setCommandHistory,
    setFullHistory: actions.history.setFullHistory as any, // Type mismatch between hooks - safe to cast
    setHistory: actions.history.setHistory,
    setResponse: actions.core.setResponse,
    setIsProcessing: actions.core.setIsProcessing,
    // Request management
    activeRequests,
    currentRequestId,
    cleanupRequest,
    isCancelled,
    setIsCancelled,
    // Other
    isDebug,
    user,
    formatResponse
  } as any);

  // Initialize backend services with type casting for incompatible types
  useBackendInitialization({
    setConfig: setConfig as any, // Type mismatch between AppConfig and BackendConfig
    setStatus: setStatus as any, // Type mismatch between status types
    setError,
    loadCommandHistory,
    orchestrator: orchestrator as any, // Ref type mismatch
    patternMatcher: patternMatcher as any, // Ref type mismatch
    tursoAdapter: tursoAdapter as any, // Ref type mismatch
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
    return React.createElement(
      Box,
      { flexDirection: 'column', paddingTop: 1 },
      React.createElement(
        Box,
        null,
        React.createElement(
          Text,
          { color: 'cyan' },
          React.createElement(Spinner, { type: 'dots' }),
          ' Initializing MCP Terminal Assistant...'
        )
      ),
      status === 'loading-config' && React.createElement(
        Text,
        { dimColor: true },
        '  Loading configuration...'
      ),
      status === 'initializing-ai' && React.createElement(
        Text,
        { dimColor: true },
        '  Initializing AI backend...'
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

  // Render main interface
  return React.createElement(
    Box,
    { flexDirection: 'column', width: '100%' },
    // History display
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
        const elements = parseMarkdownToElements(line);
        return React.createElement(
          Box,
          { key: i, flexDirection: 'column', marginBottom: 0 },
          React.createElement(Text, null, elements)
        );
      }
    }),
    // Current response
    response && React.createElement(
      Box,
      { flexDirection: 'column', marginTop: 1 },
      parseMarkdownToElements(response)
    ),
    // Input area
    React.createElement(
      Box,
      { marginTop: 1, flexDirection: 'column' },
      React.createElement(
        Box,
        null,
        React.createElement(
          Text,
          { color: 'cyan', bold: true },
          '❯ '
        ),
        React.createElement(MultilineInput, {
          value: input,
          onChange: actions.core.setInput,
          placeholder: 'Type a command or question...'
        })
      ),
      // Status line
      isTTY && React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(
          Text,
          { dimColor: true },
          state.core.isProcessing
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement(Spinner, { type: 'dots' }),
                ' Processing... (Press ESC to cancel)'
              )
            : '/help for commands • ↑↓ for history • Ctrl+C to exit'
        )
      )
    )
  );
};

// Main component wrapped with provider
const MCPInkApp: React.FC = () => {
  const isDebug: boolean = process.argv.includes('--debug');
  const isTTY: boolean = !!process.stdin.isTTY;
  const user: string = getUserFromArgs();

  const config: AppConfig = {
    isDebug,
    isTTY,
    user
  };

  return React.createElement(
    AppProvider,
    { config, children: React.createElement(MCPInkAppInner) }
  );
};

// Start the application
// Note: In Ink v6, render options are not supported as a second argument
// The exitOnCtrlC behavior is handled within the app using useApp hook
const app: ReturnType<typeof render> = render(React.createElement(MCPInkApp));

// Handle non-TTY mode
if (!process.stdin.isTTY) {
  let inputBuffer: string = '';

  process.stdin.on('data', (data: Buffer) => {
    inputBuffer += data.toString();
  });

  process.stdin.on('end', async (): Promise<void> => {
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
