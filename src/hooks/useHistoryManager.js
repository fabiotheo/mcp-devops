/**
 * History Manager Hook
 *
 * Manages command history loading and saving, both to local files and Turso database.
 * Handles full conversation history for AI context and command history for navigation.
 *
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

import path from 'node:path';
import fs from 'fs/promises';

/**
 * Hook for managing command and conversation history
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.tursoAdapter - Turso adapter ref
 * @param {Function} params.setCommandHistory - Function to update command history
 * @param {Function} params.setFullHistory - Function to update full conversation history
 * @param {Array} params.commandHistory - Current command history
 * @param {string} params.user - Current user
 * @param {boolean} params.isDebug - Debug mode flag
 * @returns {Object} Object containing history management functions
 */
export function useHistoryManager({
  tursoAdapter,
  setCommandHistory,
  setFullHistory,
  commandHistory,
  user,
  isDebug
}) {
  const loadCommandHistory = async () => {
    try {
      // Check if we have a Turso adapter
      if (
        tursoAdapter.current &&
        tursoAdapter.current.isConnected()
      ) {
        // Load from Turso (user history if user is set, machine history if default)
        const userHistory = await tursoAdapter.current.getHistory(100); // Get last 100 commands
        const commands = [];

        // Store full conversation history (not just commands)
        const fullConversationHistory = [];

        // Process history to include both questions and responses
        userHistory.forEach(h => {
          if (h.command && h.command.trim()) {
            // Add the user's command
            commands.push(h.command);
            fullConversationHistory.push({
              role: 'user',
              content: h.command,
            });

            // Add the response or cancellation marker
            if (h.status === 'cancelled') {
              // For cancelled messages, only add to fullConversationHistory for AI context
              // Don't add to commands array to keep navigation clean
              fullConversationHistory.push({
                role: 'assistant',
                content:
                  '[Message processing was interrupted - no response generated]',
              });
            } else if (h.response && h.response.trim()) {
              // Add the actual response
              fullConversationHistory.push({
                role: 'assistant',
                content: h.response,
              });
            }
          }
        });

        // Store command history for navigation (up/down arrows)
        setCommandHistory(commands);

        // IMPORTANT: Don't load old conversation history into fullHistory
        // Each new session should start fresh for the AI context
        // Only keep fullHistory for the current session
        // setFullHistory(fullConversationHistory); // COMMENTED OUT - don't load old conversations
        if (isDebug) {
          console.log(
            `[Debug] Loaded ${userHistory.length} entries from Turso for user ${user}`,
          );
          console.log(
            `[Debug] Processed into ${commands.length} command history items (including cancellation markers)`,
          );
          console.log(
            `[Debug] Full conversation history has ${fullConversationHistory.length} messages`,
          );
          console.log(
            `[Debug] Full history:`,
            JSON.stringify(fullConversationHistory, null, 2),
          );
        }
        return;
      }

      // Fall back to local file
      const historyPath = path.join(process.env.HOME, '.mcp_terminal_history');
      const data = await fs.readFile(historyPath, 'utf8');
      const loadedHistory = data.split('\n').filter(line => line.trim());
      setCommandHistory(loadedHistory.slice(-100)); // Keep last 100 commands
      if (isDebug) {
        console.log(
          `[Debug] Loaded ${loadedHistory.length} commands from local file`,
        );
      }
    } catch (err) {
      // History file doesn't exist yet or Turso failed
      setCommandHistory([]);
      if (isDebug) {
        console.log('[Debug] No history found, starting fresh');
      }
    }
  };

  const saveToHistory = async (command, response = null) => {
    // No longer update commandHistory here since it's done immediately in processCommand
    // This prevents duplicates when command is successful

    if (isDebug) {
      console.log(
        `[Debug] Saving to persistent history. Total commands in memory: ${commandHistory.length}`,
      );
    }

    try {
      // Save to Turso if connected
      if (
        tursoAdapter.current &&
        tursoAdapter.current.isConnected() &&
        user !== 'default'
      ) {
        await tursoAdapter.current.addToHistory(command, response);
        if (isDebug) {
          console.log(`[Turso] Saved command for user ${user}`);
        }
      }

      // Also save to local file as backup
      const historyPath = path.join(process.env.HOME, '.mcp_terminal_history');
      await fs.appendFile(historyPath, command + '\n');
    } catch (err) {
      // Ignore save errors
      if (isDebug) {
        console.error('History save error:', err);
      }
    }
  };

  return {
    loadCommandHistory,
    saveToHistory
  };
}

export default useHistoryManager;