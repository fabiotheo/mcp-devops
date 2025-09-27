/**
 * Debug Logger Utility
 *
 * Handles debug logging to file when debug mode is active.
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

import { appendFileSync } from 'fs';

/**
 * Log debug information to file
 * Only logs when debug mode is active
 *
 * @param {string} label - Label for the log entry
 * @param {any} data - Data to log
 * @param {boolean} isDebug - Whether debug mode is active
 * @param {string} logFile - Path to log file (default: /tmp/mcp-debug.log)
 */
export function debugLog(label, data, isDebug = false, logFile = '/tmp/mcp-debug.log') {
  if (!isDebug) return; // Only log if debug is active

  const timestamp = new Date().toISOString();
  const logContent = `\n[${timestamp}] ${label}\n${
    typeof data === 'object' ? JSON.stringify(data, null, 2) : data
  }\n${'='.repeat(60)}\n`;

  try {
    appendFileSync(logFile, logContent);
  } catch (err) {
    // If can't write to file, at least log to console
    console.error('[DEBUG]', label, data);
  }
}

/**
 * Create a debug logger with preset configuration
 *
 * @param {boolean} isDebug - Whether debug mode is active
 * @param {string} logFile - Path to log file
 * @returns {Function} Configured debug log function
 */
export function createDebugLogger(isDebug = false, logFile = '/tmp/mcp-debug.log') {
  return (label, data) => debugLog(label, data, isDebug, logFile);
}

// All functions are already exported as named exports above