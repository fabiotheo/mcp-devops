/**
 * Response Formatter Utility
 *
 * Handles formatting of AI responses for display in the terminal.
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

import { appendFileSync } from 'fs';

/**
 * Format response text for display
 * Minimal processing to avoid breaking text structure
 *
 * @param {string|any} text - The text to format
 * @param {boolean} isDebug - Whether debug mode is active
 * @returns {string} Formatted text
 */
export function formatResponse(text, isDebug = false) {
  if (!text) return '';

  // Ensure text is a string
  const textStr = typeof text === 'string' ? text : String(text);

  if (isDebug) {
    appendFileSync(
      '/tmp/mcp-debug.log',
      `\n==== formatResponse INPUT ====\n${textStr}\n${'='.repeat(60)}\n`,
    );
  }

  // Minimal formatting - just clean up excessive newlines
  // Don't try to reformat or wrap text as that causes issues
  const formatted = textStr
    // Clean up excessive newlines but preserve structure
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  if (isDebug) {
    appendFileSync(
      '/tmp/mcp-debug.log',
      `\n==== formatResponse OUTPUT ====\n${formatted}\n${'='.repeat(60)}\n`,
    );
  }

  return formatted;
}

export default formatResponse;