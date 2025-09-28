import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  formatResponse,
  preprocessMarkdown,
  postprocessMarkdown
} from '../../src/utils/responseFormatter.ts';

describe('responseFormatter', () => {
  describe('formatResponse', () => {
    test('handles empty input', () => {
      assert.strictEqual(formatResponse(''), '');
      assert.strictEqual(formatResponse(null), '');
      assert.strictEqual(formatResponse(undefined), '');
    });

    test('converts non-strings to strings', () => {
      assert.strictEqual(formatResponse(123), '123');
      assert.strictEqual(formatResponse(true), 'true');
      assert.strictEqual(formatResponse({test: 1}), '[object Object]');
    });

    test('cleans up excessive newlines', () => {
      assert.strictEqual(formatResponse('line1\n\n\n\nline2'), 'line1\n\n\nline2');
      assert.strictEqual(formatResponse('text\n\n\n\n\n\nmore'), 'text\n\n\nmore');
    });

    test('trims whitespace', () => {
      assert.strictEqual(formatResponse('  hello  '), 'hello');
      assert.strictEqual(formatResponse('\n\ntext\n\n'), 'text');
    });

    test('calls debug function when provided', () => {
      let debugCalls = [];
      const debug = (label, data) => debugCalls.push({label, data});

      formatResponse('test input', debug);

      assert.strictEqual(debugCalls.length, 2);
      assert.strictEqual(debugCalls[0].label, 'formatResponse INPUT');
      assert.strictEqual(debugCalls[0].data, 'test input');
      assert.strictEqual(debugCalls[1].label, 'formatResponse OUTPUT');
      assert.strictEqual(debugCalls[1].data, 'test input');
    });
  });

  describe('preprocessMarkdown', () => {
    test('handles empty input', () => {
      assert.strictEqual(preprocessMarkdown(''), '');
      assert.strictEqual(preprocessMarkdown(null), '');
      assert.strictEqual(preprocessMarkdown(undefined), '');
    });

    test('replaces bold in lists', () => {
      const input = '- **bold text**';
      const expected = '- __BOLD__bold text__/BOLD__';
      assert.strictEqual(preprocessMarkdown(input), expected);
    });

    test('replaces bold with colon', () => {
      const input = '**Property**: value';
      const expected = '__BOLD__Property__/BOLD__: value';
      assert.strictEqual(preprocessMarkdown(input), expected);
    });

    test('cleans up excessive spacing', () => {
      const input = 'line1\n\n\nline2';
      const expected = 'line1\n\nline2';
      assert.strictEqual(preprocessMarkdown(input), expected);
    });
  });

  describe('postprocessMarkdown', () => {
    test('handles empty input', () => {
      assert.strictEqual(postprocessMarkdown(''), '');
      assert.strictEqual(postprocessMarkdown(null), '');
      assert.strictEqual(postprocessMarkdown(undefined), '');
    });

    test('restores bold markers', () => {
      const input = '__BOLD__text__/BOLD__';
      const expected = '**text**';
      assert.strictEqual(postprocessMarkdown(input), expected);
    });

    test('handles multiple bold markers', () => {
      const input = '__BOLD__first__/BOLD__ and __BOLD__second__/BOLD__';
      const expected = '**first** and **second**';
      assert.strictEqual(postprocessMarkdown(input), expected);
    });
  });
});
