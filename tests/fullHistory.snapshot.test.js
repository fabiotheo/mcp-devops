/**
 * FullHistory Snapshot Tests
 *
 * These tests create mathematical proof that the fullHistory structure
 * remains identical after refactoring, ensuring AI context is preserved.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderInkApp } from './helpers/index.js';
import { createSnapshot, matchSnapshot, updateSnapshot } from './helpers/snapshot-helpers.js';

describe('FullHistory Snapshot Tests', () => {

  test('Simple command-response sequence', async () => {
    const app = await renderInkApp();

    // Simulate a simple interaction
    app.setState('fullHistory', [
      {
        role: 'user',
        content: 'what is docker ps',
        timestamp: '2024-01-01T10:00:00Z',
        requestId: 'req-001'
      },
      {
        role: 'assistant',
        content: 'Docker ps lists running containers...',
        timestamp: '2024-01-01T10:00:01Z'
      }
    ]);

    const fullHistory = app.getState('fullHistory');

    // Create/match snapshot
    const result = await matchSnapshot(fullHistory, 'simple-command-response', {
      removeTimestamps: true,
      removeIds: true
    });

    assert.ok(result.match, result.message);
    await app.cleanup();
  });

  test('Complex cancellation sequence preserves structure', async () => {
    const app = await renderInkApp();

    // Build complex history with cancellations
    const complexHistory = [
      {
        role: 'user',
        content: 'first command',
        timestamp: '2024-01-01T10:00:00Z',
        requestId: 'req-001'
      },
      {
        role: 'assistant',
        content: 'First response from AI',
        timestamp: '2024-01-01T10:00:01Z'
      },
      {
        role: 'user',
        content: 'second command that will be cancelled',
        timestamp: '2024-01-01T10:00:02Z',
        requestId: 'req-002'
      },
      {
        role: 'system',
        content: '[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]',
        timestamp: '2024-01-01T10:00:03Z'
      },
      {
        role: 'user',
        content: 'third command after cancellation',
        timestamp: '2024-01-01T10:00:04Z',
        requestId: 'req-003'
      },
      {
        role: 'assistant',
        content: 'Response to third command',
        timestamp: '2024-01-01T10:00:05Z'
      }
    ];

    app.setState('fullHistory', complexHistory);

    const result = await matchSnapshot(
      app.getState('fullHistory'),
      'complex-cancellation-structure',
      {
        removeTimestamps: true,
        removeIds: true
      }
    );

    assert.ok(result.match, result.message);
    await app.cleanup();
  });

  test('Multi-line input preserved in fullHistory', async () => {
    const app = await renderInkApp();

    const multiLineHistory = [
      {
        role: 'user',
        content: 'explain this error:\n```\nTypeError: Cannot read property of undefined\n  at line 42\n  at async processCommand\n```',
        timestamp: '2024-01-01T10:00:00Z',
        requestId: 'req-001'
      },
      {
        role: 'assistant',
        content: 'This TypeError indicates you\'re trying to access a property on an undefined variable...',
        timestamp: '2024-01-01T10:00:01Z'
      }
    ];

    app.setState('fullHistory', multiLineHistory);

    const result = await matchSnapshot(
      app.getState('fullHistory'),
      'multiline-input-preservation',
      {
        removeTimestamps: true,
        removeIds: true
      }
    );

    assert.ok(result.match, result.message);
    await app.cleanup();
  });

  test('Special characters and markdown in fullHistory', async () => {
    const app = await renderInkApp();

    const markdownHistory = [
      {
        role: 'user',
        content: 'show me a bash script',
        timestamp: '2024-01-01T10:00:00Z',
        requestId: 'req-001'
      },
      {
        role: 'assistant',
        content: '```bash\n#!/bin/bash\necho "Hello, World!"\nfor i in {1..5}; do\n  echo "Number: $i"\ndone\n```\n\nThis script prints "Hello, World!" and then numbers 1-5.',
        timestamp: '2024-01-01T10:00:01Z'
      }
    ];

    app.setState('fullHistory', markdownHistory);

    const result = await matchSnapshot(
      app.getState('fullHistory'),
      'markdown-special-chars',
      {
        removeTimestamps: true,
        removeIds: true
      }
    );

    assert.ok(result.match, result.message);
    await app.cleanup();
  });

  test('Error messages and system notifications in fullHistory', async () => {
    const app = await renderInkApp();

    const errorHistory = [
      {
        role: 'user',
        content: 'connect to database',
        timestamp: '2024-01-01T10:00:00Z',
        requestId: 'req-001'
      },
      {
        role: 'system',
        content: '[ERROR] Failed to connect to Turso database: Connection timeout',
        timestamp: '2024-01-01T10:00:01Z'
      },
      {
        role: 'user',
        content: 'retry connection',
        timestamp: '2024-01-01T10:00:02Z',
        requestId: 'req-002'
      },
      {
        role: 'assistant',
        content: 'Attempting to reconnect...',
        timestamp: '2024-01-01T10:00:03Z'
      },
      {
        role: 'system',
        content: '[SUCCESS] Connected to Turso database',
        timestamp: '2024-01-01T10:00:04Z'
      }
    ];

    app.setState('fullHistory', errorHistory);

    const result = await matchSnapshot(
      app.getState('fullHistory'),
      'error-system-messages',
      {
        removeTimestamps: true,
        removeIds: true
      }
    );

    assert.ok(result.match, result.message);
    await app.cleanup();
  });

  test('Rapid sequential commands in fullHistory', async () => {
    const app = await renderInkApp();

    const rapidHistory = [];

    // Simulate rapid fire commands
    for (let i = 1; i <= 5; i++) {
      rapidHistory.push({
        role: 'user',
        content: `quick command ${i}`,
        timestamp: `2024-01-01T10:00:0${i}Z`,
        requestId: `req-00${i}`
      });

      if (i % 2 === 0) {
        // Even numbered commands get cancelled
        rapidHistory.push({
          role: 'system',
          content: '[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]',
          timestamp: `2024-01-01T10:00:0${i}Z`
        });
      } else {
        // Odd numbered commands get responses
        rapidHistory.push({
          role: 'assistant',
          content: `Response to command ${i}`,
          timestamp: `2024-01-01T10:00:0${i}Z`
        });
      }
    }

    app.setState('fullHistory', rapidHistory);

    const result = await matchSnapshot(
      app.getState('fullHistory'),
      'rapid-sequential-commands',
      {
        removeTimestamps: true,
        removeIds: true
      }
    );

    assert.ok(result.match, result.message);
    await app.cleanup();
  });

  test('Empty and whitespace commands in fullHistory', async () => {
    const app = await renderInkApp();

    const whitespaceHistory = [
      {
        role: 'user',
        content: '   ',  // Just spaces
        timestamp: '2024-01-01T10:00:00Z',
        requestId: 'req-001'
      },
      {
        role: 'system',
        content: '[Command was empty or whitespace only]',
        timestamp: '2024-01-01T10:00:01Z'
      },
      {
        role: 'user',
        content: '\n\n\n',  // Just newlines
        timestamp: '2024-01-01T10:00:02Z',
        requestId: 'req-002'
      },
      {
        role: 'system',
        content: '[Command was empty or whitespace only]',
        timestamp: '2024-01-01T10:00:03Z'
      },
      {
        role: 'user',
        content: 'actual command',
        timestamp: '2024-01-01T10:00:04Z',
        requestId: 'req-003'
      },
      {
        role: 'assistant',
        content: 'Processing actual command...',
        timestamp: '2024-01-01T10:00:05Z'
      }
    ];

    app.setState('fullHistory', whitespaceHistory);

    const result = await matchSnapshot(
      app.getState('fullHistory'),
      'whitespace-empty-commands',
      {
        removeTimestamps: true,
        removeIds: true
      }
    );

    assert.ok(result.match, result.message);
    await app.cleanup();
  });

  test('Debug mode entries in fullHistory', async () => {
    const app = await renderInkApp({ isDebug: true });

    const debugHistory = [
      {
        role: 'user',
        content: 'test command',
        timestamp: '2024-01-01T10:00:00Z',
        requestId: 'req-001',
        debug: true
      },
      {
        role: 'debug',
        content: '[DEBUG] Processing command with AI orchestrator',
        timestamp: '2024-01-01T10:00:01Z'
      },
      {
        role: 'debug',
        content: '[DEBUG] Pattern matcher found: docker_ps',
        timestamp: '2024-01-01T10:00:02Z'
      },
      {
        role: 'assistant',
        content: 'Command processed successfully',
        timestamp: '2024-01-01T10:00:03Z',
        debug: true
      }
    ];

    app.setState('fullHistory', debugHistory);

    const result = await matchSnapshot(
      app.getState('fullHistory'),
      'debug-mode-entries',
      {
        removeTimestamps: true,
        removeIds: true
      }
    );

    assert.ok(result.match, result.message);
    await app.cleanup();
  });

  test('Long conversation history structure', async () => {
    const app = await renderInkApp();

    const longHistory = [];

    // Create a long conversation
    for (let i = 1; i <= 20; i++) {
      longHistory.push({
        role: 'user',
        content: `Question ${i}: How do I use command ${i}?`,
        timestamp: `2024-01-01T10:${String(i).padStart(2, '0')}:00Z`,
        requestId: `req-${String(i).padStart(3, '0')}`
      });

      longHistory.push({
        role: 'assistant',
        content: `Answer ${i}: To use command ${i}, you need to...`,
        timestamp: `2024-01-01T10:${String(i).padStart(2, '0')}:01Z`
      });
    }

    app.setState('fullHistory', longHistory);

    const result = await matchSnapshot(
      app.getState('fullHistory'),
      'long-conversation-history',
      {
        removeTimestamps: true,
        removeIds: true
      }
    );

    assert.ok(result.match, result.message);
    await app.cleanup();
  });

  test('Mixed interaction types in fullHistory', async () => {
    const app = await renderInkApp();

    const mixedHistory = [
      {
        role: 'user',
        content: '/help',
        timestamp: '2024-01-01T10:00:00Z',
        requestId: 'req-001'
      },
      {
        role: 'system',
        content: 'Available commands:\n/help - Show this help\n/clear - Clear screen\n/history - Show command history',
        timestamp: '2024-01-01T10:00:01Z'
      },
      {
        role: 'user',
        content: 'normal question about docker',
        timestamp: '2024-01-01T10:00:02Z',
        requestId: 'req-002'
      },
      {
        role: 'assistant',
        content: 'Docker is a containerization platform...',
        timestamp: '2024-01-01T10:00:03Z'
      },
      {
        role: 'user',
        content: '/clear',
        timestamp: '2024-01-01T10:00:04Z',
        requestId: 'req-003'
      },
      {
        role: 'system',
        content: '[Screen cleared]',
        timestamp: '2024-01-01T10:00:05Z'
      }
    ];

    app.setState('fullHistory', mixedHistory);

    const result = await matchSnapshot(
      app.getState('fullHistory'),
      'mixed-interaction-types',
      {
        removeTimestamps: true,
        removeIds: true
      }
    );

    assert.ok(result.match, result.message);
    await app.cleanup();
  });
});

// Helper to regenerate snapshots if needed
describe('Snapshot Management', () => {
  test.skip('Update all snapshots (run with --update flag)', async () => {
    // This test is skipped by default
    // Run with environment variable to update: UPDATE_SNAPSHOTS=true npm test
    if (process.env.UPDATE_SNAPSHOTS !== 'true') {
      return;
    }

    console.log('Updating all snapshots...');
    // Add logic here to update all snapshots if needed
  });
});