import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  parseSpecialCommand,
  formatStatusMessage,
  formatHistoryMessage
} from '../../src/utils/specialCommands.js';

describe('specialCommands', () => {
  describe('parseSpecialCommand', () => {
    test('returns null for non-commands', () => {
      assert.strictEqual(parseSpecialCommand('hello'), null);
      assert.strictEqual(parseSpecialCommand('test'), null);
      assert.strictEqual(parseSpecialCommand(''), null);
    });

    test('handles /help command', () => {
      const action = parseSpecialCommand('/help');
      assert.strictEqual(action.type, 'SHOW_HELP');
      assert.ok(action.payload.text.includes('MCP Terminal Assistant'));
      assert.ok(action.payload.text.includes('/help'));
      assert.ok(action.payload.text.includes('/clear'));
    });

    test('handles /clear command', () => {
      const action = parseSpecialCommand('/clear');
      assert.strictEqual(action.type, 'CLEAR_HISTORY');
      assert.strictEqual(action.payload, undefined);
    });

    test('handles /history command', () => {
      const data = {
        commandHistory: ['cmd1', 'cmd2', 'cmd3']
      };
      const action = parseSpecialCommand('/history', data);
      assert.strictEqual(action.type, 'SHOW_HISTORY');
      assert.deepStrictEqual(action.payload.commands, ['cmd1', 'cmd2', 'cmd3']);
    });

    test('limits history to last 20 commands', () => {
      const commands = Array.from({length: 25}, (_, i) => `cmd${i}`);
      const data = { commandHistory: commands };
      const action = parseSpecialCommand('/history', data);
      assert.strictEqual(action.payload.commands.length, 20);
      assert.strictEqual(action.payload.commands[0], 'cmd5');
      assert.strictEqual(action.payload.commands[19], 'cmd24');
    });

    test('handles /status command', () => {
      const data = {
        status: 'ready',
        hasOrchestrator: true,
        hasPatternMatcher: false,
        isDebug: true,
        hasConfig: true
      };
      const action = parseSpecialCommand('/status', data);
      assert.strictEqual(action.type, 'SHOW_STATUS');
      assert.strictEqual(action.payload.status, 'ready');
      assert.strictEqual(action.payload.aiBackend, 'Connected');
      assert.strictEqual(action.payload.patternMatcher, 'Not loaded');
      assert.strictEqual(action.payload.debugMode, 'ON');
      assert.strictEqual(action.payload.config, 'Loaded');
    });

    test('handles /debug command', () => {
      const action = parseSpecialCommand('/debug');
      assert.strictEqual(action.type, 'TOGGLE_DEBUG');
    });

    test('handles /exit and /quit commands', () => {
      let action = parseSpecialCommand('/exit');
      assert.strictEqual(action.type, 'EXIT_APPLICATION');

      action = parseSpecialCommand('/quit');
      assert.strictEqual(action.type, 'EXIT_APPLICATION');
    });

    test('handles unknown commands', () => {
      const action = parseSpecialCommand('/unknown');
      assert.strictEqual(action.type, 'UNKNOWN_COMMAND');
      assert.strictEqual(action.payload.command, 'unknown');
    });

    test('uses default values when data not provided', () => {
      const action = parseSpecialCommand('/status');
      assert.strictEqual(action.payload.status, 'ready');
      assert.strictEqual(action.payload.aiBackend, 'Disconnected');
      assert.strictEqual(action.payload.patternMatcher, 'Not loaded');
      assert.strictEqual(action.payload.debugMode, 'OFF');
      assert.strictEqual(action.payload.config, 'Default');
    });
  });

  describe('formatStatusMessage', () => {
    test('formats status payload correctly', () => {
      const payload = {
        status: 'ready',
        aiBackend: 'Connected',
        patternMatcher: 'Loaded',
        debugMode: 'ON',
        config: 'Custom'
      };
      const result = formatStatusMessage(payload);
      assert.ok(result.includes('Status: ready'));
      assert.ok(result.includes('AI Backend: Connected'));
      assert.ok(result.includes('Pattern Matcher: Loaded'));
      assert.ok(result.includes('Debug Mode: ON'));
      assert.ok(result.includes('Config: Custom'));
    });
  });

  describe('formatHistoryMessage', () => {
    test('formats command history', () => {
      const commands = ['cmd1', 'cmd2', 'cmd3'];
      const result = formatHistoryMessage(commands);
      assert.strictEqual(result, 'cmd1\ncmd2\ncmd3');
    });

    test('handles empty history', () => {
      const result = formatHistoryMessage([]);
      assert.strictEqual(result, 'No command history');
    });
  });
});