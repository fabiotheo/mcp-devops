/**
 * Special Commands Handler Utility
 *
 * Handles special slash commands like /help, /clear, /history, etc.
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

/**
 * Handle special slash commands
 *
 * @param {string} command - The command to handle (including the /)
 * @param {Object} context - Context object with state and actions
 * @param {Function} context.setResponse - Function to set response
 * @param {Function} context.setHistory - Function to set history
 * @param {Array} context.commandHistory - Command history array
 * @param {string} context.status - Current status
 * @param {Object} context.orchestrator - Orchestrator ref
 * @param {Object} context.patternMatcher - Pattern matcher ref
 * @param {boolean} context.isDebug - Debug mode flag
 * @param {Object} context.config - Configuration object
 * @param {Function} context.exit - Exit function
 * @param {Function} context.formatResponse - Response formatter function
 * @returns {boolean} True if command was handled, false otherwise
 */
export function handleSpecialCommand(command, context) {
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

  const cmd = command.slice(1).toLowerCase();
  let response = '';

  switch (cmd) {
    case 'help':
      response = `MCP Terminal Assistant - Commands:
/help     - Show this help
/clear    - Clear screen
/history  - Show command history
/status   - Show system status
/debug    - Toggle debug mode
/exit     - Exit application

For Linux/Unix help, just type your question!`;
      setResponse(response);
      // Add to display history so it shows up
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(response, isDebug)]);
      return true;

    case 'clear':
      setHistory([]);
      setResponse('');
      return true;

    case 'history':
      response = commandHistory.slice(-20).join('\n');
      setResponse(response);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(response, isDebug)]);
      return true;

    case 'status':
      response = `Status: ${status}
AI Backend: ${orchestrator.current ? 'Connected' : 'Disconnected'}
Pattern Matcher: ${patternMatcher.current ? 'Loaded' : 'Not loaded'}
Debug Mode: ${isDebug ? 'ON' : 'OFF'}
Config: ${config ? 'Loaded' : 'Default'}`;
      setResponse(response);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(response, isDebug)]);
      return true;

    case 'exit':
    case 'quit':
      exit();
      return true;

    default:
      response = `Unknown command: /${cmd}`;
      setResponse(response);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(response, isDebug)]);
      return true;
  }
}

export default handleSpecialCommand;