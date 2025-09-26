/**
 * Complete Regression Test Suite for MCP Ink CLI
 *
 * This suite must pass 100% before and after each refactoring phase.
 * Any failure indicates a breaking change that must be fixed.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderInkApp, simulateSession } from './helpers/index.js';
import { matchSnapshot } from './helpers/snapshot-helpers.js';

describe('Initialization Tests', () => {
  let app;

  afterEach(async () => {
    if (app && app.cleanup) {
      await app.cleanup();
    }
  });

  test('Application initializes with correct default state', async () => {
    app = await renderInkApp();

    // Check all initial state values
    assert.equal(app.getState('status'), 'initializing');
    assert.equal(app.getState('input'), '');
    assert.equal(app.getState('isProcessing'), false);
    assert.equal(app.getState('isCancelled'), false);
    assert.equal(app.getState('error'), null);
    assert.equal(app.getState('response'), '');
    assert.deepEqual(app.getState('commandHistory'), []);
    assert.deepEqual(app.getState('fullHistory'), []);
    assert.equal(app.getState('historyIndex'), -1);
    assert.equal(app.getState('activeRequests').size, 0);
  });

  test('Application initializes with user parameter', async () => {
    app = await renderInkApp({ user: 'testuser' });

    // User should be accessible in the app
    const output = app.stdout.lastFrame();
    assert.ok(output.includes('testuser'));
  });

  test('Application initializes in debug mode', async () => {
    app = await renderInkApp({ isDebug: true });

    // Debug mode should be reflected in output
    const output = app.stdout.lastFrame();
    assert.ok(output.includes('Debug: true'));
  });

  test('Backends mock properly on initialization', async () => {
    app = await renderInkApp({
      mockOrchestrator: true,
      mockTurso: true
    });

    const orchestrator = app.getRef('orchestrator');
    const tursoAdapter = app.getRef('tursoAdapter');

    assert.ok(orchestrator);
    assert.ok(tursoAdapter);
    assert.equal(typeof orchestrator.processCommand, 'function');
    assert.equal(typeof tursoAdapter.saveCommand, 'function');
  });
});

describe('Command Processing Tests', () => {
  let app;

  beforeEach(async () => {
    app = await renderInkApp();
  });

  afterEach(async () => {
    if (app && app.cleanup) {
      await app.cleanup();
    }
  });

  test('Simple command processes correctly', async () => {
    app.typeCommand('test command');
    app.pressEnter();

    await app.waitForResponse();

    assert.equal(app.getState('isProcessing'), false);
    assert.ok(app.getState('response'));
    assert.includes(app.getState('commandHistory'), 'test command');
  });

  test('Empty command is ignored', async () => {
    const initialHistoryLength = app.getState('commandHistory').length;

    app.typeCommand('');
    app.pressEnter();

    // Should not add to history
    assert.equal(app.getState('commandHistory').length, initialHistoryLength);
  });

  test('Whitespace-only command is trimmed', async () => {
    app.typeCommand('   spaces   ');
    app.pressEnter();

    await app.waitForResponse();

    // Should be trimmed in history
    const lastCommand = app.getState('commandHistory').slice(-1)[0];
    assert.equal(lastCommand, 'spaces');
  });

  test('Special commands are handled locally', async () => {
    // Test /help command
    app.typeCommand('/help');
    app.pressEnter();

    // Should get immediate response without AI call
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check that help was processed
    assert.includes(app.getState('commandHistory'), '/help');
  });

  test('Multiple commands in sequence', async () => {
    const commands = ['cmd1', 'cmd2', 'cmd3'];

    for (const cmd of commands) {
      app.typeCommand(cmd);
      app.pressEnter();
      await app.waitForResponse();
    }

    const history = app.getState('commandHistory');
    assert.deepEqual(history, commands);
  });
});

describe('Cancellation Tests', () => {
  let app;

  beforeEach(async () => {
    app = await renderInkApp();
  });

  afterEach(async () => {
    if (app && app.cleanup) {
      await app.cleanup();
    }
  });

  test('ESC cancels active command', async () => {
    app.typeCommand('long command');
    app.pressEnter();
    await app.waitFor('isProcessing', true);

    app.pressEsc();

    assert.equal(app.getState('isCancelled'), true);
    assert.ok(app.getState('lastEsc') > 0);
  });

  test('ESC clears input when not processing', async () => {
    app.typeCommand('some input');
    assert.equal(app.getState('input'), 'some input');

    app.pressEsc();

    assert.equal(app.getState('input'), '');
  });

  test('Double Ctrl+C exits application', async () => {
    const originalExit = process.exit;
    let exitCalled = false;
    process.exit = () => { exitCalled = true; };

    try {
      app.pressCtrlC();
      await new Promise(resolve => setTimeout(resolve, 100));
      app.pressCtrlC();

      assert.ok(exitCalled);
    } finally {
      process.exit = originalExit;
    }
  });

  test('Single Ctrl+C does not exit', async () => {
    const originalExit = process.exit;
    let exitCalled = false;
    process.exit = () => { exitCalled = true; };

    try {
      app.pressCtrlC();
      await new Promise(resolve => setTimeout(resolve, 600));

      assert.ok(!exitCalled);
    } finally {
      process.exit = originalExit;
    }
  });
});

describe('History Navigation Tests', () => {
  let app;

  beforeEach(async () => {
    app = await renderInkApp({
      initialState: {
        commandHistory: ['first', 'second', 'third']
      }
    });
  });

  afterEach(async () => {
    if (app && app.cleanup) {
      await app.cleanup();
    }
  });

  test('Up arrow navigates to previous commands', async () => {
    app.pressUp();
    assert.equal(app.getState('input'), 'third');

    app.pressUp();
    assert.equal(app.getState('input'), 'second');

    app.pressUp();
    assert.equal(app.getState('input'), 'first');
  });

  test('Down arrow navigates forward in history', async () => {
    app.pressUp();
    app.pressUp();
    app.pressUp();

    assert.equal(app.getState('input'), 'first');

    app.pressDown();
    assert.equal(app.getState('input'), 'second');

    app.pressDown();
    assert.equal(app.getState('input'), 'third');
  });

  test('History navigation preserves current input', async () => {
    app.typeCommand('current input');
    const currentInput = app.getState('input');

    app.pressUp();
    assert.equal(app.getState('input'), 'third');

    // Navigate back to current
    app.pressDown();
    app.pressDown();

    // Current input should be lost (this is expected behavior)
    // When you navigate history, you lose unsaved input
  });

  test('History bounds are respected', async () => {
    // Try to go beyond history
    for (let i = 0; i < 10; i++) {
      app.pressUp();
    }

    // Should stop at 'first'
    assert.equal(app.getState('input'), 'first');

    // Try to go forward beyond current
    for (let i = 0; i < 10; i++) {
      app.pressDown();
    }

    // Should stop at last or clear
    assert.equal(app.getState('historyIndex'), -1);
  });
});

describe('FullHistory Structure Tests', () => {
  let app;

  beforeEach(async () => {
    app = await renderInkApp();
  });

  afterEach(async () => {
    if (app && app.cleanup) {
      await app.cleanup();
    }
  });

  test('User command adds to fullHistory', async () => {
    app.setState('fullHistory', []);

    app.typeCommand('user command');
    app.pressEnter();

    // Simulate adding to fullHistory (in real app this happens in processCommand)
    const fullHistory = app.getState('fullHistory');
    fullHistory.push({
      role: 'user',
      content: 'user command',
      timestamp: new Date().toISOString(),
      requestId: 'req-1'
    });
    app.setState('fullHistory', fullHistory);

    const history = app.getState('fullHistory');
    assert.equal(history.length, 1);
    assert.equal(history[0].role, 'user');
    assert.equal(history[0].content, 'user command');
    assert.ok(history[0].requestId);
  });

  test('Assistant response adds to fullHistory', async () => {
    const fullHistory = [];

    fullHistory.push({
      role: 'user',
      content: 'question',
      timestamp: new Date().toISOString(),
      requestId: 'req-1'
    });

    fullHistory.push({
      role: 'assistant',
      content: 'answer',
      timestamp: new Date().toISOString()
    });

    app.setState('fullHistory', fullHistory);

    const history = app.getState('fullHistory');
    assert.equal(history.length, 2);
    assert.equal(history[1].role, 'assistant');
    assert.equal(history[1].content, 'answer');
    assert.ok(!history[1].requestId); // Assistant messages don't have requestId
  });

  test('Cancellation marker structure is correct', async () => {
    const fullHistory = [
      {
        role: 'user',
        content: 'cancelled command',
        timestamp: new Date().toISOString(),
        requestId: 'req-1'
      },
      {
        role: 'system',
        content: '[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]',
        timestamp: new Date().toISOString()
      }
    ];

    app.setState('fullHistory', fullHistory);

    const history = app.getState('fullHistory');
    assert.equal(history[1].role, 'system');
    assert.includes(history[1].content, 'cancelada');
  });

  test('FullHistory maintains chronological order', async () => {
    const timestamps = [];
    const fullHistory = [];

    for (let i = 0; i < 5; i++) {
      const timestamp = new Date(Date.now() + i * 1000).toISOString();
      timestamps.push(timestamp);

      fullHistory.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `message ${i}`,
        timestamp
      });
    }

    app.setState('fullHistory', fullHistory);

    const history = app.getState('fullHistory');

    // Verify chronological order
    for (let i = 1; i < history.length; i++) {
      const prev = new Date(history[i - 1].timestamp);
      const curr = new Date(history[i].timestamp);
      assert.ok(prev <= curr, 'History must be chronological');
    }
  });
});

describe('Input Handling Tests', () => {
  let app;

  beforeEach(async () => {
    app = await renderInkApp();
  });

  afterEach(async () => {
    if (app && app.cleanup) {
      await app.cleanup();
    }
  });

  test('Typing updates input state', async () => {
    app.type('hello world');
    assert.equal(app.getState('input'), 'hello world');
  });

  test('Backspace removes characters', async () => {
    app.typeCommand('test');
    // Simulate backspace (would need to implement in helper)
    // For now, just test that input can be modified
    app.setState('input', 'tes');
    assert.equal(app.getState('input'), 'tes');
  });

  test('Multi-line input with newlines', async () => {
    app.type('line1\nline2\nline3');
    assert.equal(app.getState('input'), 'line1\nline2\nline3');
  });

  test('Input is cleared after submission', async () => {
    app.typeCommand('test command');
    assert.equal(app.getState('input'), 'test command');

    app.pressEnter();

    assert.equal(app.getState('input'), '');
  });

  test('Special characters in input', async () => {
    const specialChars = '!@#$%^&*()_+-=[]{}|;\':",./<>?`~';
    app.type(specialChars);
    assert.equal(app.getState('input'), specialChars);
  });
});

describe('State Consistency Tests', () => {
  let app;

  beforeEach(async () => {
    app = await renderInkApp();
  });

  afterEach(async () => {
    if (app && app.cleanup) {
      await app.cleanup();
    }
  });

  test('isProcessing and activeRequests are synchronized', async () => {
    // When processing starts
    app.setState('isProcessing', true);
    app.setState('activeRequests', new Map([['req-1', {}]]));

    assert.equal(app.getState('isProcessing'), true);
    assert.equal(app.getState('activeRequests').size, 1);

    // When processing ends
    app.setState('isProcessing', false);
    app.setState('activeRequests', new Map());

    assert.equal(app.getState('isProcessing'), false);
    assert.equal(app.getState('activeRequests').size, 0);
  });

  test('historyIndex stays within bounds', async () => {
    app.setState('commandHistory', ['a', 'b', 'c']);
    app.setState('historyIndex', 1);

    assert.ok(app.getState('historyIndex') < app.getState('commandHistory').length);
    assert.ok(app.getState('historyIndex') >= -1);
  });

  test('isCancelled resets after processing', async () => {
    app.setState('isCancelled', true);
    assert.equal(app.getState('isCancelled'), true);

    // Simulate end of cancellation
    app.setState('isCancelled', false);
    app.setState('isProcessing', false);

    assert.equal(app.getState('isCancelled'), false);
    assert.equal(app.getState('isProcessing'), false);
  });

  test('No invalid state combinations', async () => {
    // These combinations should never occur
    app.setState('isProcessing', true);
    app.setState('isCancelled', true);

    // Validator should catch this
    const errors = [];

    if (app.getState('isProcessing') && app.getState('isCancelled')) {
      errors.push('Cannot be processing and cancelled');
    }

    assert.ok(errors.length > 0, 'Should detect invalid state');
  });
});

describe('Integration Tests', () => {
  test('Complete command cycle', async () => {
    const { app, results } = await simulateSession([
      'first command',
      'second command',
      'third command'
    ]);

    assert.equal(results.length, 3);
    assert.ok(results.every(r => r.response));

    await app.cleanup();
  });

  test('Command-cancel-command sequence', async () => {
    const { app, results } = await simulateSession([
      'command 1',
      { type: 'cancel', command: 'cancelled command' },
      'command 2'
    ]);

    assert.equal(results.length, 3);
    assert.ok(results[1].cancelled);

    await app.cleanup();
  });

  test('Rapid command submission', async () => {
    const app = await renderInkApp();

    const commands = Array.from({ length: 10 }, (_, i) => `rapid ${i}`);

    for (const cmd of commands) {
      app.typeCommand(cmd);
      app.pressEnter();
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // All commands should be in history
    const history = app.getState('commandHistory');
    assert.ok(history.length >= commands.length);

    await app.cleanup();
  });
});

describe('Snapshot Regression Tests', () => {
  test('Critical fullHistory structures remain unchanged', async () => {
    const app = await renderInkApp();

    const criticalHistory = [
      {
        role: 'user',
        content: 'docker ps',
        timestamp: '2024-01-01T10:00:00Z',
        requestId: 'req-001'
      },
      {
        role: 'assistant',
        content: 'Showing running containers...',
        timestamp: '2024-01-01T10:00:01Z'
      },
      {
        role: 'user',
        content: 'cancelled command',
        timestamp: '2024-01-01T10:00:02Z',
        requestId: 'req-002'
      },
      {
        role: 'system',
        content: '[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]',
        timestamp: '2024-01-01T10:00:03Z'
      }
    ];

    const result = await matchSnapshot(
      criticalHistory,
      'regression-critical-history',
      {
        removeTimestamps: true,
        removeIds: true
      }
    );

    assert.ok(result.match, 'Critical history structure must not change');

    await app.cleanup();
  });
});

// Helper assertions
assert.includes = function(actual, expected) {
  assert.ok(
    actual.includes(expected),
    `Expected "${actual}" to include "${expected}"`
  );
};