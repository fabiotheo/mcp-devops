/**
 * Special Commands Handler Utility
 *
 * Handles special slash commands like /help, /clear, /history, etc.
 * Refactored to be a pure function that returns actions.
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

// Type definitions for command data
interface CommandData {
  commandHistory?: string[];
  status?: string;
  hasOrchestrator?: boolean;
  hasPatternMatcher?: boolean;
  isDebug?: boolean;
  hasConfig?: boolean;
}

// Type definitions for actions
interface ShowHelpAction {
  type: 'SHOW_HELP';
  payload: {
    text: string;
  };
}

interface ClearHistoryAction {
  type: 'CLEAR_HISTORY';
}

interface ShowHistoryAction {
  type: 'SHOW_HISTORY';
  payload: {
    commands: string[];
  };
}

interface ShowStatusAction {
  type: 'SHOW_STATUS';
  payload: {
    status: string;
    aiBackend: string;
    patternMatcher: string;
    debugMode: string;
    config: string;
  };
}

interface ToggleDebugAction {
  type: 'TOGGLE_DEBUG';
}

interface ExitApplicationAction {
  type: 'EXIT_APPLICATION';
}

interface UnknownCommandAction {
  type: 'UNKNOWN_COMMAND';
  payload: {
    command: string;
  };
}

type SpecialCommandAction =
  | ShowHelpAction
  | ClearHistoryAction
  | ShowHistoryAction
  | ShowStatusAction
  | ToggleDebugAction
  | ExitApplicationAction
  | UnknownCommandAction;

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
export function parseSpecialCommand(command: string, data: CommandData = {}): SpecialCommandAction | null {
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
export function formatStatusMessage(statusPayload: ShowStatusAction['payload']): string {
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
export function formatHistoryMessage(commands: string[]): string {
  return commands.join('\n') || 'No command history';
}

// Legacy context interface for backward compatibility
interface LegacyContext {
  setResponse: (response: string) => void;
  setHistory: (updater: (prev: string[]) => string[]) => void;
  commandHistory: string[];
  status: string;
  orchestrator?: { current: unknown };
  patternMatcher?: { current: unknown };
  isDebug: boolean;
  config?: unknown;
  exit: () => void;
  formatResponse: (text: string, isDebug: boolean) => string;
}

// Legacy function for backward compatibility (deprecated)
export function handleSpecialCommand(command: string, context: LegacyContext): boolean {
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
      setResponse((action as ShowHelpAction).payload.text);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse((action as ShowHelpAction).payload.text, isDebug)]);
      return true;

    case 'CLEAR_HISTORY':
      setHistory(() => []);
      setResponse('');
      return true;

    case 'SHOW_HISTORY':
      const historyText = formatHistoryMessage((action as ShowHistoryAction).payload.commands);
      setResponse(historyText);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(historyText, isDebug)]);
      return true;

    case 'SHOW_STATUS':
      const statusText = formatStatusMessage((action as ShowStatusAction).payload);
      setResponse(statusText);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(statusText, isDebug)]);
      return true;

    case 'EXIT_APPLICATION':
      exit();
      return true;

    case 'UNKNOWN_COMMAND':
      const errorText = `Unknown command: /${(action as UnknownCommandAction).payload.command}`;
      setResponse(errorText);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(errorText, isDebug)]);
      return true;

    default:
      return false;
  }
}

// All functions are already exported as named exports above