import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { debugLog, createDebugLogger } from '../../src/utils/debugLogger.js';

describe('debugLogger', () => {
  const testLogFile = '/tmp/test-debug.log';

  // Clean up test file before and after tests
  const cleanup = () => {
    if (existsSync(testLogFile)) {
      unlinkSync(testLogFile);
    }
  };

  describe('debugLog', () => {
    test('does not log when debug is false', () => {
      cleanup();

      debugLog('Test Label', 'Test Data', false, testLogFile);

      assert.strictEqual(existsSync(testLogFile), false);
    });

    test('logs when debug is true', () => {
      cleanup();

      debugLog('Test Label', 'Test Data', true, testLogFile);

      assert.strictEqual(existsSync(testLogFile), true);
      const content = readFileSync(testLogFile, 'utf8');
      assert.ok(content.includes('Test Label'));
      assert.ok(content.includes('Test Data'));
      assert.ok(content.includes('='.repeat(60)));

      cleanup();
    });

    test('logs objects as JSON', () => {
      cleanup();

      const testObj = { key: 'value', number: 123 };
      debugLog('Object Test', testObj, true, testLogFile);

      const content = readFileSync(testLogFile, 'utf8');
      assert.ok(content.includes('"key": "value"'));
      assert.ok(content.includes('"number": 123'));

      cleanup();
    });

    test('appends to existing file', () => {
      cleanup();

      debugLog('First Entry', 'Data 1', true, testLogFile);
      debugLog('Second Entry', 'Data 2', true, testLogFile);

      const content = readFileSync(testLogFile, 'utf8');
      assert.ok(content.includes('First Entry'));
      assert.ok(content.includes('Data 1'));
      assert.ok(content.includes('Second Entry'));
      assert.ok(content.includes('Data 2'));

      cleanup();
    });
  });

  describe('createDebugLogger', () => {
    test('creates logger that respects debug flag', () => {
      cleanup();

      const debugLogger = createDebugLogger(true, testLogFile);
      debugLogger('Created Logger', 'Test Data');

      assert.strictEqual(existsSync(testLogFile), true);
      const content = readFileSync(testLogFile, 'utf8');
      assert.ok(content.includes('Created Logger'));
      assert.ok(content.includes('Test Data'));

      cleanup();
    });

    test('creates logger that does not log when debug is false', () => {
      cleanup();

      const debugLogger = createDebugLogger(false, testLogFile);
      debugLogger('Should Not Log', 'No Data');

      assert.strictEqual(existsSync(testLogFile), false);
    });

    test('uses default log file when not specified', () => {
      const defaultLogFile = '/tmp/mcp-debug.log';
      const defaultCleanup = () => {
        if (existsSync(defaultLogFile)) {
          unlinkSync(defaultLogFile);
        }
      };

      defaultCleanup();

      const debugLogger = createDebugLogger(true);
      debugLogger('Default File', 'Test');

      assert.strictEqual(existsSync(defaultLogFile), true);

      defaultCleanup();
    });
  });
});