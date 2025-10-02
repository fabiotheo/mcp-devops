import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  enableBracketedPasteMode,
  disableBracketedPasteMode,
  isPastedContent,
  cleanPastedContent,
  processPastedInput
} from '../../src/utils/pasteDetection.ts';

describe('pasteDetection', () => {
  describe('isPastedContent', () => {
    test('detects multi-character input as paste', () => {
      assert.strictEqual(isPastedContent('hello'), true);
      assert.strictEqual(isPastedContent('ab'), true);
    });

    test('detects newlines as paste', () => {
      assert.strictEqual(isPastedContent('hello\nworld'), true);
      assert.strictEqual(isPastedContent('\n'), true);
    });

    test('detects bracketed paste markers', () => {
      assert.strictEqual(isPastedContent('200~'), true);
      assert.strictEqual(isPastedContent('201~'), true);
      assert.strictEqual(isPastedContent('[200~test'), true);
    });

    test('single character is not paste', () => {
      assert.strictEqual(isPastedContent('a'), false);
      assert.strictEqual(isPastedContent('1'), false);
    });

    test('handles null/undefined', () => {
      // isPastedContent returns falsy (not strictly false) for null/undefined
      assert.strictEqual(!!isPastedContent(null), false);
      assert.strictEqual(!!isPastedContent(undefined), false);
      assert.strictEqual(!!isPastedContent(''), false);
    });
  });

  describe('cleanPastedContent', () => {
    test('removes bracketed paste markers', () => {
      assert.strictEqual(cleanPastedContent('\x1b[200~test\x1b[201~'), 'test');
      assert.strictEqual(cleanPastedContent('test~'), 'test');
    });

    test('normalizes line endings', () => {
      assert.strictEqual(cleanPastedContent('line1\r\nline2'), 'line1\nline2');
      assert.strictEqual(cleanPastedContent('line1\rline2'), 'line1\nline2');
    });

    test('handles clean content', () => {
      assert.strictEqual(cleanPastedContent('hello world'), 'hello world');
      assert.strictEqual(cleanPastedContent(''), '');
    });
  });

  describe('processPastedInput', () => {
    test('appends to existing input', () => {
      assert.strictEqual(
        processPastedInput('existing', 'new'),
        'existingnew'
      );
    });

    test('handles empty existing input', () => {
      assert.strictEqual(
        processPastedInput('', 'pasted'),
        'pasted'
      );
    });

    test('cleans pasted content', () => {
      assert.strictEqual(
        processPastedInput('test', '\x1b[200~pasted\x1b[201~'),
        'testpasted'
      );
    });
  });

  describe('bracketedPasteMode', () => {
    test('enableBracketedPasteMode sends correct escape sequence', () => {
      let output = '';
      const originalWrite = process.stdout.write;
      process.stdout.write = (data) => { output += data; return true; };

      enableBracketedPasteMode(true, false);
      assert.strictEqual(output, '\x1b[?2004h');

      process.stdout.write = originalWrite;
    });

    test('disableBracketedPasteMode sends correct escape sequence', () => {
      let output = '';
      const originalWrite = process.stdout.write;
      process.stdout.write = (data) => { output += data; return true; };

      disableBracketedPasteMode(true, false);
      assert.strictEqual(output, '\x1b[?2004l');

      process.stdout.write = originalWrite;
    });

    test('does nothing when not TTY', () => {
      let output = '';
      const originalWrite = process.stdout.write;
      process.stdout.write = (data) => { output += data; return true; };

      enableBracketedPasteMode(false, false);
      assert.strictEqual(output, '');

      disableBracketedPasteMode(false, false);
      assert.strictEqual(output, '');

      process.stdout.write = originalWrite;
    });
  });
});
