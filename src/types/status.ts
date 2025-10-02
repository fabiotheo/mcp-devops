/**
 * Status Line Types
 *
 * Types for the compact status line that replaces verbose execution logs
 *
 * IMPORTANT: This file follows strict TypeScript typing policy
 * - NO use of 'any' type
 * - All types are explicit and safe
 * - Uses type guards for narrowing when needed
 */

/**
 * Status line state
 * Represents the current state of the AI processing
 */
export type StatusState = 'processing' | 'success' | 'warning' | 'error' | 'idle';

/**
 * Metrics displayed in status line
 * Tracks execution statistics during AI processing
 */
export interface StatusMetrics {
  /** Number of commands executed in current session */
  commandsExecuted: number;

  /** Number of successfully completed commands */
  successCount: number;

  /** Number of failed commands */
  failureCount: number;

  /** Total duration of all commands in milliseconds */
  totalDuration?: number;
}

/**
 * Props for StatusLine component
 * All properties are explicitly typed for type safety
 */
export interface StatusLineProps {
  /** Current iteration (1-based) */
  iteration: number;

  /** Maximum iterations allowed */
  maxIterations: number;

  /** Current action being performed */
  action: string;

  /** Elapsed time in seconds */
  elapsedTime: number;

  /** Optional metrics */
  metrics?: StatusMetrics;

  /** Current state */
  state?: StatusState;
}

/**
 * Type guard to check if a value is a valid StatusState
 */
export function isStatusState(value: unknown): value is StatusState {
  return typeof value === 'string' &&
    ['processing', 'success', 'warning', 'error', 'idle'].includes(value);
}

/**
 * Type guard to check if an object is valid StatusMetrics
 * Validates both the presence/type of required properties and rejects extra properties
 */
export function isStatusMetrics(value: unknown): value is StatusMetrics {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);

  // Define allowed keys
  const allowedKeys = ['commandsExecuted', 'successCount', 'failureCount', 'totalDuration'];

  // Check for unexpected keys (extra properties not in interface)
  const hasUnexpectedKeys = keys.some(key => !allowedKeys.includes(key));
  if (hasUnexpectedKeys) {
    return false;
  }

  // Validate required properties and their types
  return (
    typeof obj.commandsExecuted === 'number' &&
    typeof obj.successCount === 'number' &&
    typeof obj.failureCount === 'number' &&
    (obj.totalDuration === undefined || typeof obj.totalDuration === 'number')
  );
}
