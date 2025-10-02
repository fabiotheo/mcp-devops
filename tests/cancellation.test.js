/**
 * Cancellation Test Suite for MCP Ink CLI
 *
 * Critical tests to ensure ESC cancellation works correctly
 * in all scenarios during the refactoring process.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderInkApp, simulateSession, validateStateConsistency } from './helpers/index.js';
import { matchSnapshot } from './helpers/snapshot-helpers.js';

describe('Cancellation System Tests', () => {
  let app;

  afterEach(async () => {
    if (app && app.cleanup) {
      await app.cleanup();
    }
  });

  test('ESC during backend initialization cancels startup', async () => {
    app = await renderInkApp({
      initialState: {
        status: 'initializing',
        isProcessing: false,
      }
    });

    // Simulate ESC during initialization
    app.pressEsc();

    // Verify cancellation state
    assert.equal(app.getState('isCancelled'), true);
    assert.ok(app.getState('lastEsc') > 0);

    // Verify no active requests remain
    const activeRequests = app.getState('activeRequests');
    assert.equal(activeRequests.size, 0);
  });

  test.skip('ESC during AI call cancels request before response', async () => {
    // TODO: Re-enable when useRequestManager is implemented in FASE 3
    // This test requires real AbortController implementation
    app = await renderInkApp();

    // Start a command
    app.typeCommand('test command');
    app.pressEnter();

    // Wait for processing to start
    await app.waitFor('isProcessing', true, 1000);

    // Press ESC to cancel
    app.pressEsc();

    // Verify cancellation
    assert.equal(app.getState('isCancelled'), true);
    assert.equal(app.getState('isProcessing'), false);

    // Verify abort controller was triggered
    const aiAbortRef = app.getRef('aiAbortControllerRef');
    if (aiAbortRef) {
      assert.equal(aiAbortRef.signal.aborted, true);
    }
  });

  test.skip('ESC after command adds cancellation marker to fullHistory', async () => {
    // TODO: Re-enable when useHistory hook is implemented in FASE 4
    // This test requires the real fullHistory management logic
    app = await renderInkApp();

    // Setup initial history
    app.setState('fullHistory', [
      { role: 'user', content: 'previous command' },
      { role: 'assistant', content: 'previous response' }
    ]);

    // Type and cancel a command
    app.typeCommand('cancelled command');
    app.pressEnter();
    await app.waitFor('isProcessing', true, 1000);
    app.pressEsc();

    // Check fullHistory for cancellation marker
    const fullHistory = app.getState('fullHistory');
    const lastEntry = fullHistory[fullHistory.length - 1];

    // Should have the cancellation marker
    assert.ok(
      lastEntry.content.includes('[A mensagem anterior foi cancelada') ||
      lastEntry.role === 'system',
      'Should add cancellation marker to fullHistory'
    );
  });

  test('Multiple ESC presses do not create duplicate markers', async () => {
    app = await renderInkApp();

    app.typeCommand('test command');
    app.pressEnter();
    await app.waitFor('isProcessing', true, 1000);

    // Press ESC multiple times
    app.pressEsc();
    app.pressEsc();
    app.pressEsc();

    // Wait a bit for any async updates
    await new Promise(resolve => setTimeout(resolve, 200));

    // Count cancellation markers in fullHistory
    const fullHistory = app.getState('fullHistory');
    const cancellationMarkers = fullHistory.filter(entry =>
      entry.content?.includes('[A mensagem anterior foi cancelada')
    );

    // Should only have one marker despite multiple ESC presses
    assert.ok(cancellationMarkers.length <= 1, 'Should not duplicate cancellation markers');
  });

  test.skip('ESC during Turso write operation cancels database operation', async () => {
    // TODO: Re-enable when useRequestManager is implemented in FASE 3
    // This test requires real dbAbortController implementation
    app = await renderInkApp({
      mockTurso: true
    });

    // Start a command that would trigger Turso write
    app.typeCommand('save this to database');
    app.pressEnter();
    await app.waitFor('isProcessing', true, 1000);

    // Cancel during processing
    app.pressEsc();

    // Verify DB abort controller
    const dbAbortRef = app.getRef('dbAbortControllerRef');
    if (dbAbortRef) {
      assert.equal(dbAbortRef.signal.aborted, true);
    }

    // Verify no pending database operations
    assert.equal(app.getState('isProcessing'), false);
  });

  test('Command history navigation preserves cancelled commands', async () => {
    app = await renderInkApp();

    // Execute and cancel multiple commands
    const commands = ['command1', 'command2', 'command3'];

    for (const cmd of commands) {
      app.typeCommand(cmd);
      app.pressEnter();
      await app.waitFor('isProcessing', true, 1000);
      app.pressEsc();
      await app.waitFor('isProcessing', false, 1000);
    }

    // Navigate history
    app.pressUp(); // Should get command3
    assert.equal(app.getState('input'), 'command3');

    app.pressUp(); // Should get command2
    assert.equal(app.getState('input'), 'command2');

    app.pressUp(); // Should get command1
    assert.equal(app.getState('input'), 'command1');
  });

  test('State consistency after cancellation', async () => {
    app = await renderInkApp();

    app.typeCommand('test command');
    app.pressEnter();
    await app.waitFor('isProcessing', true, 1000);
    app.pressEsc();

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 200));

    // Validate state consistency
    const errors = validateStateConsistency(app);
    assert.equal(errors.length, 0, `State inconsistency: ${errors.join(', ')}`);

    // Specific checks
    assert.equal(app.getState('isProcessing'), false);
    assert.equal(app.getState('activeRequests').size, 0);
    assert.equal(app.getState('input'), ''); // Input should be cleared
  });

  test('Rapid command-cancel sequences maintain state integrity', async () => {
    app = await renderInkApp();

    // Rapid fire commands and cancellations
    for (let i = 0; i < 5; i++) {
      app.typeCommand(`rapid command ${i}`);
      app.pressEnter();

      // Very quick cancel
      await new Promise(resolve => setTimeout(resolve, 50));
      app.pressEsc();

      // Brief pause
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Final state check
    assert.equal(app.getState('isProcessing'), false);
    assert.equal(app.getState('activeRequests').size, 0);

    // History should have all commands
    const commandHistory = app.getState('commandHistory');
    assert.equal(commandHistory.length, 5);
  });

  test.skip('ESC during multi-line input clears input correctly', async () => {
    // TODO: Re-enable when useInputHandler is implemented in FASE 5
    // This test requires the real input handling logic with ESC clearing
    app = await renderInkApp();

    // Simulate multi-line input
    app.type('line1\n');
    app.type('line2\n');
    app.type('line3');

    // Cancel before submitting
    app.pressEsc();

    // Input should be cleared
    assert.equal(app.getState('input'), '');
    assert.equal(app.getState('isCancelled'), true);
  });

  test('Cancellation preserves fullHistory structure for AI context', async () => {
    app = await renderInkApp();

    // Create a complex interaction sequence
    const sequence = [
      { type: 'command', text: 'first command' },
      { type: 'wait', ms: 100 },
      { type: 'command', text: 'second command' },
      { type: 'cancel' },
      { type: 'command', text: 'third command' },
      { type: 'wait', ms: 100 }
    ];

    for (const action of sequence) {
      if (action.type === 'command') {
        app.typeCommand(action.text);
        app.pressEnter();
        await app.waitFor('isProcessing', true, 1000);
      } else if (action.type === 'cancel') {
        app.pressEsc();
        await app.waitFor('isProcessing', false, 1000);
      } else if (action.type === 'wait') {
        await new Promise(resolve => setTimeout(resolve, action.ms));
      }
    }

    // Snapshot the fullHistory to ensure structure is preserved
    const fullHistory = app.getState('fullHistory');
    await matchSnapshot(fullHistory, 'cancellation-preserves-context', {
      removeTimestamps: true,
      removeIds: true
    });
  });
});

describe('Double Ctrl+C Exit Tests', () => {
  test('Double Ctrl+C within 500ms exits application', async () => {
    const app = await renderInkApp();

    // Store original process.exit
    const originalExit = process.exit;
    let exitCalled = false;
    process.exit = () => { exitCalled = true; };

    try {
      // First Ctrl+C
      app.pressCtrlC();
      const firstPress = app.getState('lastCtrlC');
      assert.ok(firstPress > 0);

      // Second Ctrl+C within 500ms
      await new Promise(resolve => setTimeout(resolve, 100));
      app.pressCtrlC();

      // Should trigger exit
      assert.ok(exitCalled, 'Double Ctrl+C should exit');
    } finally {
      // Restore process.exit
      process.exit = originalExit;
    }
  });

  test('Single Ctrl+C does not exit', async () => {
    const app = await renderInkApp();

    const originalExit = process.exit;
    let exitCalled = false;
    process.exit = () => { exitCalled = true; };

    try {
      app.pressCtrlC();

      // Wait more than 500ms
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should not exit with single press
      assert.ok(!exitCalled, 'Single Ctrl+C should not exit');
    } finally {
      process.exit = originalExit;
    }
  });
});

// Add custom assertion helper
assert.includes = function(actual, expected) {
  assert.ok(
    actual.includes(expected),
    `Expected "${actual}" to include "${expected}"`
  );
};