/**
 * Special Commands Handler Utility
 *
 * Handles special slash commands like /help, /clear, /history, etc.
 * Refactored to be a pure function that returns actions.
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

/**
 * Parse special slash commands and return actions
 * Pure function - no side effects
 *
 * @param {string} command - The command to handle (including the /)
 * @param {Object} data - Read-only data for command processing
 * @param {Array} data.commandHistory - Command history array (read-only)
 * @param {string} data.status - Current status (read-only)
 * @param {boolean} data.hasOrchestrator - Whether orchestrator is available
 * @param {boolean} data.hasPatternMatcher - Whether pattern matcher is available
 * @param {boolean} data.isDebug - Debug mode flag
 * @param {boolean} data.hasConfig - Whether config is loaded
 * @returns {Object|null} Action object or null if not a special command
 */
export function parseSpecialCommand(command, data = {}) {
  const {
    commandHistory = [],
    status = 'ready',
    hasOrchestrator = false,
    hasPatternMatcher = false,
    isDebug = false,
    hasConfig = false
  } = data;

  if (!command.startsWith('/')) {
    return null;
  }

  const cmd = command.slice(1).toLowerCase();

  switch (cmd) {
    case 'help':
      return {
        type: 'SHOW_HELP',
        payload: {
          text: `MCP Terminal Assistant - Commands:
/help     - Show this help
/clear    - Clear screen
/history  - Show command history
/status   - Show system status
/debug    - Toggle debug mode
/exit     - Exit application

For Linux/Unix help, just type your question!`
        }
      };

    case 'clear':
      return {
        type: 'CLEAR_HISTORY'
      };

    case 'history':
      return {
        type: 'SHOW_HISTORY',
        payload: {
          commands: commandHistory.slice(-20)
        }
      };

    case 'status':
      return {
        type: 'SHOW_STATUS',
        payload: {
          status,
          aiBackend: hasOrchestrator ? 'Connected' : 'Disconnected',
          patternMatcher: hasPatternMatcher ? 'Loaded' : 'Not loaded',
          debugMode: isDebug ? 'ON' : 'OFF',
          config: hasConfig ? 'Loaded' : 'Default'
        }
      };

    case 'debug':
      return {
        type: 'TOGGLE_DEBUG'
      };

    case 'exit':
    case 'quit':
      return {
        type: 'EXIT_APPLICATION'
      };

    default:
      return {
        type: 'UNKNOWN_COMMAND',
        payload: {
          command: cmd
        }
      };
  }
}

/**
 * Format status message from status payload
 *
 * @param {Object} statusPayload - Status information
 * @returns {string} Formatted status message
 */
export function formatStatusMessage(statusPayload) {
  return `Status: ${statusPayload.status}
AI Backend: ${statusPayload.aiBackend}
Pattern Matcher: ${statusPayload.patternMatcher}
Debug Mode: ${statusPayload.debugMode}
Config: ${statusPayload.config}`;
}

/**
 * Format history message from history payload
 *
 * @param {Array} commands - Command history
 * @returns {string} Formatted history message
 */
export function formatHistoryMessage(commands) {
  return commands.join('\n') || 'No command history';
}

// Legacy function for backward compatibility (deprecated)
export function handleSpecialCommand(command, context) {
  console.warn('[Deprecated] handleSpecialCommand is deprecated. Use parseSpecialCommand instead.');

  const {
    setResponse,
    setHistory,
    commandHistory,
    status,
    orchestrator,
    patternMatcher,
    isDebug,
    config,
    exit,
    formatResponse
  } = context;

  const action = parseSpecialCommand(command, {
    commandHistory,
    status,
    hasOrchestrator: !!orchestrator?.current,
    hasPatternMatcher: !!patternMatcher?.current,
    isDebug,
    hasConfig: !!config
  });

  if (!action) {
    return false;
  }

  // Apply the action (legacy behavior)
  switch (action.type) {
    case 'SHOW_HELP':
      setResponse(action.payload.text);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(action.payload.text, isDebug)]);
      return true;

    case 'CLEAR_HISTORY':
      setHistory([]);
      setResponse('');
      return true;

    case 'SHOW_HISTORY':
      const historyText = formatHistoryMessage(action.payload.commands);
      setResponse(historyText);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(historyText, isDebug)]);
      return true;

    case 'SHOW_STATUS':
      const statusText = formatStatusMessage(action.payload);
      setResponse(statusText);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(statusText, isDebug)]);
      return true;

    case 'EXIT_APPLICATION':
      exit();
      return true;

    case 'UNKNOWN_COMMAND':
      const errorText = `Unknown command: /${action.payload.command}`;
      setResponse(errorText);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(errorText, isDebug)]);
      return true;

    default:
      return false;
  }
}

// All functions are already exported as named exports above