/**
 * Response Formatter Utility
 *
 * Handles formatting of AI responses for display in the terminal.
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

// Type for debug function
type DebugFunction = (label: string, data: unknown) => void;

/**
 * Format response text for display
 * Minimal processing to avoid breaking text structure
 *
 * @param {string|any} text - The text to format
 * @param {Function} debug - Optional debug function for logging
 * @returns {string} Formatted text
 */
export function formatResponse(text: string | unknown, debug: DebugFunction | null = null): string {
  if (!text) return '';

  // Ensure text is a string
  const textStr = typeof text === 'string' ? text : String(text);

  if (debug) {
    debug('formatResponse INPUT', textStr);
  }

  // Minimal formatting - just clean up excessive newlines
  // Don't try to reformat or wrap text as that causes issues
  const formatted = textStr
    // Clean up excessive newlines but preserve structure
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  if (debug) {
    debug('formatResponse OUTPUT', formatted);
  }

  return formatted;
}

/**
 * Pre-process markdown to fix known formatting issues
 *
 * @param {string} text - The markdown text to preprocess
 * @returns {string} Preprocessed text
 */
export function preprocessMarkdown(text: string): string {
  if (!text) return '';

  // Fix patterns that cause issues with marked-terminal
  return (
    text
      // Prevent line breaks after bold in lists
      .replace(/^(\s*-\s+)\*\*([^*]+)\*\*/gm, '$1__BOLD__$2__/BOLD__')
      // Prevent line breaks in bold:colon patterns
      .replace(/\*\*([^*]+)\*\*\s*:/g, '__BOLD__$1__/BOLD__:')
      // Clean up spacing
      .replace(/\n{3,}/g, '\n\n')
  );
}

/**
 * Post-process after marked to restore bold formatting
 *
 * @param {string} text - The text to postprocess
 * @returns {string} Postprocessed text
 */
export function postprocessMarkdown(text: string): string {
  if (!text) return '';

  return (
    text
      // Restore bold markers
      .replace(/__BOLD__/g, '**')
      .replace(/__\/BOLD__/g, '**')
  );
}

// All functions are already exported as named exports above