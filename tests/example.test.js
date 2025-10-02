/**
 * Example test to validate the test helpers are working
 * This demonstrates how to use the helpers for testing the MCP Ink CLI
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderInkApp, simulateSession, validateStateConsistency } from './helpers/index.js';
import { createSnapshot, matchSnapshot, loadSnapshot } from './helpers/snapshot-helpers.js';

describe('Test Helpers Validation', () => {
  let app;

  afterEach(async () => {
    if (app && app.cleanup) {
      await app.cleanup();
    }
  });

  test('renderInkApp creates app with correct initial state', async () => {
    app = await renderInkApp({
      user: 'testuser',
      isDebug: false,
    });

    // Check initial state
    assert.equal(app.getState('status'), 'initializing');
    assert.equal(app.getState('input'), '');
    assert.deepEqual(app.getState('commandHistory'), []);
    assert.equal(app.getState('isProcessing'), false);
    assert.equal(app.getState('isCancelled'), false);
  });

  test('can simulate typing and command submission', async () => {
    app = await renderInkApp();

    // Type a command
    app.typeCommand('test command');
    assert.equal(app.getState('input'), 'test command');

    // Submit command
    app.pressEnter();
    assert.equal(app.getState('input'), '');
    assert.equal(app.getState('isProcessing'), true);
    assert.includes(app.getState('commandHistory'), 'test command');
  });

  test('can simulate ESC cancellation', async () => {
    app = await renderInkApp();

    // Start a command
    app.typeCommand('long running command');
    app.pressEnter();

    // Wait for processing
    await app.waitFor('isProcessing', true);

    // Press ESC to cancel
    app.pressEsc();

    // Check cancellation state
    assert.equal(app.getState('isCancelled'), true);
    assert.ok(app.getState('lastEsc') > 0);
  });

  test('can navigate command history', async () => {
    app = await renderInkApp({
      initialState: {
        commandHistory: ['command1', 'command2', 'command3'],
      },
    });

    // Press up to navigate history
    app.pressUp();
    assert.equal(app.getState('input'), 'command3');

    app.pressUp();
    assert.equal(app.getState('input'), 'command2');

    app.pressUp();
    assert.equal(app.getState('input'), 'command1');

    // Press down to go back
    app.pressDown();
    assert.equal(app.getState('input'), 'command2');
  });

  test('validateStateConsistency detects invalid states', async () => {
    app = await renderInkApp();

    // Create invalid state
    app.setState('isProcessing', true);
    app.setState('isCancelled', true);

    const errors = validateStateConsistency(app);
    assert.ok(errors.length > 0);
    assert.includes(errors[0], 'Cannot be processing and cancelled simultaneously');
  });

  test('simulateSession can run complex sequences', async () => {
    const { app: sessionApp, results } = await simulateSession([
      'command1',
      { type: 'cancel', command: 'command2' },
      'command3',
    ]);

    app = sessionApp; // Store for cleanup

    assert.equal(results.length, 3);
    assert.equal(results[0].command, 'command1');
    assert.equal(results[1].cancelled, true);
    assert.equal(results[2].command, 'command3');
  });
});

describe('Snapshot Helpers Validation', () => {
  test('can create and match snapshots', async () => {
    const testData = {
      commands: ['cmd1', 'cmd2'],
      state: {
        status: 'ready',
        count: 5,
      },
    };

    // Create snapshot
    const createResult = await createSnapshot(testData, 'test-snapshot', {
      update: true,
    });
    assert.ok(createResult.updated);

    // Match snapshot
    const matchResult = await matchSnapshot(testData, 'test-snapshot');
    assert.ok(matchResult.match);
    assert.equal(matchResult.message, 'Snapshot matched: test-snapshot');
  });

  test('detects snapshot mismatches', async () => {
    const originalData = {
      value: 'original',
      count: 1,
    };

    const modifiedData = {
      value: 'modified',
      count: 2,
    };

    // Create original snapshot
    await createSnapshot(originalData, 'mismatch-test', { update: true });

    // Try to match with modified data
    const matchResult = await matchSnapshot(modifiedData, 'mismatch-test');
    assert.equal(matchResult.match, false);
    assert.ok(matchResult.diff.length > 0);
    assert.includes(matchResult.message, 'Snapshot mismatch');
  });

  test('sanitizes timestamps and IDs', async () => {
    const dataWithTimestamps = {
      id: 'abc123',
      createdAt: new Date().toISOString(),
      command: 'test',
      requestId: 'req-456',
      timestamp: Date.now(),
    };

    // Create snapshot with sanitization
    await createSnapshot(dataWithTimestamps, 'sanitized-test', {
      update: true,
      removeTimestamps: true,
      removeIds: true,
    });

    // Load and check sanitization
    const snapshot = await loadSnapshot('sanitized-test');
    assert.equal(snapshot.data.id, '[ID]');
    assert.equal(snapshot.data.createdAt, '[TIMESTAMP]');
    assert.equal(snapshot.data.requestId, '[ID]');
    assert.equal(snapshot.data.timestamp, '[TIMESTAMP]');
    assert.equal(snapshot.data.command, 'test'); // Not sanitized
  });

  test('fullHistory snapshot for complex cancellation sequence', async () => {
    // Simulate complex fullHistory structure
    const fullHistory = [
      {
        role: 'user',
        content: 'first command',
        timestamp: '2024-01-01T00:00:00Z',
        requestId: 'req-1',
      },
      {
        role: 'assistant',
        content: 'first response',
        timestamp: '2024-01-01T00:00:01Z',
      },
      {
        role: 'user',
        content: 'second command',
        timestamp: '2024-01-01T00:00:02Z',
        requestId: 'req-2',
      },
      {
        role: 'system',
        content: '[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]',
        timestamp: '2024-01-01T00:00:03Z',
      },
      {
        role: 'user',
        content: 'third command',
        timestamp: '2024-01-01T00:00:04Z',
        requestId: 'req-3',
      },
      {
        role: 'assistant',
        content: 'third response',
        timestamp: '2024-01-01T00:00:05Z',
      },
    ];

    // Create snapshot with sanitization
    const result = await createSnapshot(fullHistory, 'complex-cancellation-sequence', {
      update: true,
      removeTimestamps: true,
      removeIds: true,
    });

    assert.ok(result.updated);

    // Verify snapshot can be matched
    const matchResult = await matchSnapshot(fullHistory, 'complex-cancellation-sequence', {
      removeTimestamps: true,
      removeIds: true,
    });

    assert.ok(matchResult.match);
  });
});

// Helper for assertions
assert.includes = function(actual, expected) {
  assert.ok(
    actual.includes(expected),
    `Expected "${actual}" to include "${expected}"`
  );
};