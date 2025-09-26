/**
 * Paste Detection Utility
 *
 * Handles detection and cleaning of pasted content in the terminal.
 * Manages bracketed paste mode sequences.
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

/**
 * Enable bracketed paste mode in the terminal
 *
 * @param {boolean} isTTY - Whether running in a TTY
 * @param {boolean} isDebug - Whether debug mode is active
 */
export function enableBracketedPasteMode(isTTY, isDebug = false) {
  if (isTTY) {
    process.stdout.write('\x1b[?2004h');
    if (isDebug) {
      console.log('[Debug] Bracketed paste mode enabled');
    }
  }
}

/**
 * Disable bracketed paste mode in the terminal
 *
 * @param {boolean} isTTY - Whether running in a TTY
 * @param {boolean} isDebug - Whether debug mode is active
 */
export function disableBracketedPasteMode(isTTY, isDebug = false) {
  if (isTTY) {
    process.stdout.write('\x1b[?2004l');
    if (isDebug) {
      console.log('[Debug] Bracketed paste mode disabled');
    }
  }
}

/**
 * Detect if input is pasted content
 *
 * @param {string} char - The input character(s)
 * @returns {boolean} True if content appears to be pasted
 */
export function isPastedContent(char) {
  // Content is likely pasted if:
  // 1. Multiple characters received at once
  // 2. Contains newlines
  // 3. Contains bracketed paste markers
  return char && (
    char.length > 1 ||
    char.includes('\n') ||
    char.includes('200~') ||
    char.includes('201~')
  );
}

/**
 * Clean pasted content by removing control sequences
 *
 * @param {string} content - The raw pasted content
 * @returns {string} Cleaned content
 */
export function cleanPastedContent(content) {
  let cleaned = content;

  // Remove bracketed paste markers
  cleaned = cleaned.replace(/\x1b\[200~/g, '');
  cleaned = cleaned.replace(/\x1b\[201~/g, '');
  cleaned = cleaned.replace(/~$/g, '');

  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\r/g, '\n');

  return cleaned;
}

/**
 * Process pasted content for input field
 *
 * @param {string} currentInput - Current input value
 * @param {string} pastedContent - The pasted content
 * @returns {string} Combined input
 */
export function processPastedInput(currentInput, pastedContent) {
  const cleaned = cleanPastedContent(pastedContent);

  if (!currentInput) {
    // Empty input - just return the cleaned pasted content
    return cleaned;
  }

  // Combine with existing input
  return currentInput + cleaned;
}

export default {
  enableBracketedPasteMode,
  disableBracketedPasteMode,
  isPastedContent,
  cleanPastedContent,
  processPastedInput
};