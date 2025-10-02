/**
 * StatusLine Component
 *
 * Compact status display that replaces verbose execution logs
 * Shows iteration progress, current action, and elapsed time
 *
 * IMPORTANT: This component follows strict TypeScript typing policy
 * - NO use of 'any' type
 * - All props and functions are explicitly typed
 * - Uses React.FC with explicit props interface
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import type { StatusLineProps, StatusState } from '../types/status.js';

/**
 * Maximum length for action text before truncation
 */
const DEFAULT_ACTION_MAX_LENGTH = 50;

/**
 * Get icon for current state
 * @param state - Current status state
 * @returns Emoji icon representing the state
 */
const getStateIcon = (state: StatusState): string => {
  switch (state) {
    case 'processing':
      return '🤖';
    case 'success':
      return '✓';
    case 'warning':
      return '⚠️';
    case 'error':
      return '❌';
    default:
      return '•';
  }
};

/**
 * Get border color for current state
 * @param state - Current status state
 * @returns Ink color name for the border
 */
const getBorderColor = (state: StatusState): string => {
  switch (state) {
    case 'processing':
      return 'cyan';
    case 'success':
      return 'green';
    case 'warning':
      return 'yellow';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
};

/**
 * Format elapsed time as human-readable string
 * @param seconds - Elapsed time in seconds
 * @returns Formatted time string (e.g., "2.5s" or "1m 30s")
 */
const formatTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m ${secs}s`;
};

/**
 * Truncate action text to fit terminal width
 * @param action - Action text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
const truncateAction = (action: string, maxLength: number = DEFAULT_ACTION_MAX_LENGTH): string => {
  if (action.length <= maxLength) return action;
  return action.substring(0, maxLength - 3) + '...';
};

/**
 * StatusLine Component
 *
 * Renders a compact 2-3 line status box showing:
 * - Line 1: Icon + Status text
 * - Line 2: Iteration progress + Current action + Elapsed time
 * - Line 3 (optional): Metrics (commands executed, success/failure counts)
 *
 * @example
 * ```tsx
 * <StatusLine
 *   iteration={3}
 *   maxIterations={10}
 *   action="fail2ban-client status sshd"
 *   elapsedTime={2.5}
 *   state="processing"
 * />
 * ```
 */
export const StatusLine: React.FC<StatusLineProps> = React.memo(({
  iteration,
  maxIterations,
  action,
  elapsedTime,
  metrics,
  state = 'processing'
}) => {
  const icon = getStateIcon(state);
  const borderColor = getBorderColor(state);
  const timeStr = formatTime(elapsedTime);
  const truncatedAction = truncateAction(action);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingLeft={1}
      paddingRight={1}
      marginTop={1}
      marginBottom={1}
    >
      {/* Line 1: Icon + Status */}
      <Box>
        <Text color={borderColor} bold>
          {icon} Processando
        </Text>
      </Box>

      {/* Line 2: Iteration + Action + Time */}
      <Box>
        <Text dimColor>
          Iteração {iteration}/{maxIterations} • {truncatedAction} • {timeStr}
        </Text>
      </Box>

      {/* Optional Line 3: Metrics (only if available) */}
      {metrics && metrics.commandsExecuted > 0 && (
        <Box marginTop={0}>
          <Text dimColor>
            {metrics.commandsExecuted} comandos •
            {metrics.successCount > 0 && ` ✓ ${metrics.successCount}`}
            {metrics.failureCount > 0 && ` ✗ ${metrics.failureCount}`}
          </Text>
        </Box>
      )}
    </Box>
  );
});

StatusLine.displayName = 'StatusLine';

export default StatusLine;
