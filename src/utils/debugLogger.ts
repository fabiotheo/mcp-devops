/**
 * Debug Logger Utility
 *
 * Handles debug logging to file when debug mode is active.
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

import { appendFileSync } from 'fs';

/**
 * Type for debug log function
 */
export type DebugLogFunction = (label: string, data: unknown) => void;

/**
 * Log debug information to file
 * Only logs when debug mode is active
 *
 * @param label - Label for the log entry
 * @param data - Data to log
 * @param isDebug - Whether debug mode is active
 * @param logFile - Path to log file (default: /tmp/mcp-debug.log)
 */
export function debugLog(
  label: string,
  data: unknown,
  isDebug: boolean = false,
  logFile: string = '/tmp/mcp-debug.log'
): void {
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
 * @param isDebug - Whether debug mode is active
 * @param logFile - Path to log file
 * @returns Configured debug log function
 */
export function createDebugLogger(
  isDebug: boolean = false,
  logFile: string = '/tmp/mcp-debug.log'
): DebugLogFunction {
  return (label: string, data: unknown): void => debugLog(label, data, isDebug, logFile);
}

// All functions are already exported as named exports above