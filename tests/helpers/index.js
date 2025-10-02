/**
 * Test Helpers for MCP Ink CLI
 *
 * Provides utilities to simulate and test the Ink-based CLI application
 * without requiring actual terminal interaction.
 */

import { render } from 'ink-testing-library';
import { EventEmitter } from 'events';
import path from 'path';
import React from 'react';
import { Box, Text } from 'ink';

/**
 * Mock application state manager
 */
class MockAppState {
  constructor() {
    this.state = {
      input: '',
      history: [],
      commandHistory: [],
      fullHistory: [],
      historyIndex: -1,
      status: 'initializing',
      isProcessing: false,
      response: '',
      error: null,
      config: null,
      lastCtrlC: 0,
      lastEsc: 0,
      isCancelled: false,
      activeRequests: new Map(),
    };

    this.refs = {
      currentRequestId: null,
      currentTursoEntryId: null,
      orchestrator: null,
      patternMatcher: null,
      tursoAdapter: null,
      aiAbortControllerRef: null,
      dbAbortControllerRef: null,
    };

    this.events = new EventEmitter();
  }

  getState(key) {
    return key ? this.state[key] : this.state;
  }

  setState(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;
    this.events.emit('stateChange', { key, oldValue, newValue: value });
  }

  getRef(key) {
    return key ? this.refs[key] : this.refs;
  }

  setRef(key, value) {
    this.refs[key] = value;
  }

  reset() {
    // Create a new instance to get initial values
    const initial = new MockAppState();
    Object.keys(this.state).forEach(key => {
      this.state[key] = initial.state[key];
    });
    Object.keys(this.refs).forEach(key => {
      this.refs[key] = null;
    });
  }
}

/**
 * Render the Ink application for testing
 * @param {Object} options - Rendering options
 * @returns {Object} Test interface
 */
export async function renderInkApp(options = {}) {
  const {
    initialState = {},
    mockOrchestrator = true,
    mockTurso = true,
    user = 'testuser',
    isDebug = false,
  } = options;

  // Create app state
  const appState = new MockAppState();

  // Apply initial state
  Object.entries(initialState).forEach(([key, value]) => {
    appState.setState(key, value);
  });

  // Mock orchestrator if needed
  if (mockOrchestrator) {
    appState.setRef('orchestrator', {
      processCommand: async () => ({
        output: 'Mock response',
        error: null,
      }),
      initialize: async () => true,
    });
  }

  // Mock Turso adapter if needed
  if (mockTurso) {
    appState.setRef('tursoAdapter', {
      isConnected: () => true,
      saveCommand: async () => ({ id: 1 }),
      updateResponse: async () => true,
      updateStatusByRequestId: async () => true,
      getHistory: async () => [],
    });
  }

  // For now, we'll create a simplified test component
  // This will be replaced when we modularize the actual component
  const TestComponent = ({ user, isDebug }) => {
    const [state, setState] = React.useState({
      input: appState.getState('input') || '',
      isProcessing: appState.getState('isProcessing') || false,
      status: appState.getState('status') || 'initializing',
      response: appState.getState('response') || '',
      error: appState.getState('error') || null,
    });

    // Connect to our mock app state
    React.useEffect(() => {
      // Don't override initial status

      // Listen for state changes
      appState.events.on('stateChange', ({ key, newValue }) => {
        if (key === 'input') {
          setState(prev => ({ ...prev, input: newValue }));
        } else if (key === 'isProcessing') {
          setState(prev => ({ ...prev, isProcessing: newValue }));

          // Simulate response after processing
          if (newValue === true) {
            setTimeout(() => {
              appState.setState('response', 'Mock response');
              appState.setState('isProcessing', false);
            }, 100);
          }
        }
      });
    }, []);

    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, {}, `MCP Terminal Assistant (Test Mode)`),
      React.createElement(Text, {}, `User: ${user} | Debug: ${isDebug}`),
      React.createElement(Text, {}, `Status: ${state.status}`),
      React.createElement(Text, {}, `Input: ${state.input}`),
      state.isProcessing && React.createElement(Text, {}, 'Processing...'),
      state.response && React.createElement(Text, {}, `Response: ${state.response}`),
    );
  };

  const { stdin, stdout, stderr, ...rest } = render(
    React.createElement(TestComponent, { user, isDebug })
  );

  return {
    // Input simulation
    type: (text) => {
      stdin.write(text);
      appState.setState('input', appState.getState('input') + text);
    },

    typeCommand: (command) => {
      stdin.write(command);
      appState.setState('input', command);
    },

    pressEnter: () => {
      stdin.write('\r');
      const command = appState.getState('input');
      appState.setState('commandHistory', [...appState.getState('commandHistory'), command]);
      appState.setState('input', '');
      appState.setState('isProcessing', true);
    },

    pressEsc: () => {
      stdin.write('\x1B');
      appState.setState('lastEsc', Date.now());
      appState.setState('isCancelled', true);
      if (appState.getRef('aiAbortControllerRef')) {
        appState.getRef('aiAbortControllerRef').abort();
      }
    },

    pressCtrlC: () => {
      stdin.write('\x03');
      const now = Date.now();
      const lastCtrlC = appState.getState('lastCtrlC');
      if (now - lastCtrlC < 500) {
        // Double Ctrl+C - exit
        process.exit(0);
      }
      appState.setState('lastCtrlC', now);
    },

    pressUp: () => {
      stdin.write('\x1B[A');
      const historyIndex = appState.getState('historyIndex');
      const commandHistory = appState.getState('commandHistory');
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        appState.setState('historyIndex', newIndex);
        appState.setState('input', commandHistory[commandHistory.length - 1 - newIndex]);
      }
    },

    pressDown: () => {
      stdin.write('\x1B[B');
      const historyIndex = appState.getState('historyIndex');
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        appState.setState('historyIndex', newIndex);
        const commandHistory = appState.getState('commandHistory');
        appState.setState('input', commandHistory[commandHistory.length - 1 - newIndex]);
      }
    },

    // State access
    getState: (key) => appState.getState(key),
    setState: (key, value) => appState.setState(key, value),
    getRef: (key) => appState.getRef(key),

    // Waiting helpers
    waitFor: (stateKey, value, timeout = 5000) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for ${stateKey} to be ${value}`));
        }, timeout);

        const check = () => {
          if (appState.getState(stateKey) === value) {
            clearTimeout(timer);
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    },

    waitForResponse: (timeout = 5000) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timeout waiting for response'));
        }, timeout);

        const checkResponse = () => {
          if (!appState.getState('isProcessing')) {
            clearTimeout(timer);
            resolve(appState.getState('response'));
          } else {
            setTimeout(checkResponse, 50);
          }
        };

        // Start checking after a brief delay to allow processing to start
        setTimeout(checkResponse, 100);
      });
    },

    // Output access
    stdout,
    stderr,
    output: stdout.lastFrame(),

    // Cleanup
    unmount: rest.unmount,
    cleanup: () => {
      rest.unmount();
      appState.reset();
    },
  };
}


/**
 * Helper to simulate complex interaction sequences
 */
export async function simulateSession(commands, options = {}) {
  const app = await renderInkApp(options);
  const results = [];

  for (const command of commands) {
    if (typeof command === 'string') {
      // Simple command
      app.typeCommand(command);
      app.pressEnter();
      const response = await app.waitForResponse();
      results.push({ command, response });
    } else if (command.type === 'cancel') {
      // Cancel operation
      app.typeCommand(command.command);
      app.pressEnter();
      await app.waitFor('isProcessing', true);
      app.pressEsc();
      await app.waitFor('isCancelled', true);
      results.push({ command: command.command, cancelled: true });
    } else if (command.type === 'navigation') {
      // History navigation
      for (let i = 0; i < command.up; i++) {
        app.pressUp();
      }
      for (let i = 0; i < command.down; i++) {
        app.pressDown();
      }
      results.push({ navigation: true, input: app.getState('input') });
    }
  }

  return { app, results };
}

/**
 * Mock the AbortController for testing cancellation
 */
export function createMockAbortController() {
  const listeners = [];
  const controller = {
    signal: {
      aborted: false,
      addEventListener: (event, listener) => {
        if (event === 'abort') listeners.push(listener);
      },
      removeEventListener: (event, listener) => {
        if (event === 'abort') {
          const index = listeners.indexOf(listener);
          if (index > -1) listeners.splice(index, 1);
        }
      },
    },
    abort: () => {
      controller.signal.aborted = true;
      listeners.forEach(listener => listener());
    },
  };
  return controller;
}

/**
 * Helper to validate state consistency
 */
export function validateStateConsistency(app) {
  const errors = [];
  const state = app.getState();

  // Check for invalid state combinations
  if (state.isProcessing && state.isCancelled) {
    errors.push('Cannot be processing and cancelled simultaneously');
  }

  if (state.historyIndex >= state.commandHistory.length) {
    errors.push('History index out of bounds');
  }

  if (state.activeRequests.size > 0 && !state.isProcessing) {
    errors.push('Active requests exist but not processing');
  }

  return errors;
}

// Remove global exports - use ES modules only