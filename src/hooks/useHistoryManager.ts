/**
 * History Manager Hook
 *
 * Manages command history loading and saving, both to local files and Turso database.
 * Handles full conversation history for AI context and command history for navigation.
 *
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

import * as path from 'node:path';
import * as fs from 'fs/promises';
import { MutableRefObject, Dispatch, SetStateAction } from 'react';

// ============== INTERFACES E TIPOS ==============

/**
 * History entry with role and content
 */
export interface HistoryMessage {
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system';
  /** Content of the message */
  content: string;
}

/**
 * Turso history entry
 */
export interface TursoHistoryEntry {
  /** Command text */
  command: string;
  /** Response text */
  response?: string | null;
  /** Status of the command */
  status?: 'pending' | 'completed' | 'cancelled' | 'error';
  /** Timestamp */
  timestamp?: number | Date;
}

/**
 * Turso adapter interface for history operations
 */
export interface TursoAdapterHistory {
  /** Check if connected */
  isConnected: () => boolean;
  /** Get history entries */
  getHistory: (limit: number) => Promise<TursoHistoryEntry[]>;
  /** Add to history */
  addToHistory: (command: string, response: string | null) => Promise<void>;
}

/**
 * Parameters for the history manager hook
 */
export interface UseHistoryManagerParams {
  /** Turso adapter ref */
  tursoAdapter: MutableRefObject<TursoAdapterHistory | null>;
  /** Function to update command history */
  setCommandHistory: Dispatch<SetStateAction<string[]>>;
  /** Function to update full conversation history */
  setFullHistory: Dispatch<SetStateAction<HistoryMessage[]>>;
  /** Current command history */
  commandHistory: string[];
  /** Current user */
  user: string;
  /** Debug mode flag */
  isDebug: boolean;
}

/**
 * Return type for the history manager hook
 */
export interface UseHistoryManagerReturn {
  /** Load command history */
  loadCommandHistory: () => Promise<void>;
  /** Save to history */
  saveToHistory: (command: string, response?: string | null) => Promise<void>;
}

/**
 * Hook for managing command and conversation history
 *
 * @param params - Hook parameters
 * @returns Object containing history management functions
 */
export function useHistoryManager({
  tursoAdapter,
  setCommandHistory,
  setFullHistory,
  commandHistory,
  user,
  isDebug
}: UseHistoryManagerParams): UseHistoryManagerReturn {
  const loadCommandHistory = async (): Promise<void> => {
    try {
      // Check if we have a Turso adapter
      if (
        tursoAdapter.current &&
        tursoAdapter.current.isConnected()
      ) {
        // Load from Turso (user history if user is set, machine history if default)
        const userHistory = await tursoAdapter.current.getHistory(10); // Get last 10 commands only for context
        const commands: string[] = [];

        // Store full conversation history (not just commands)
        const fullConversationHistory: HistoryMessage[] = [];

        // Process history to include both questions and responses
        userHistory.forEach((h: TursoHistoryEntry) => {
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

        // Load conversation history to provide context to AI
        // Preserve any messages from current session and prepend old history
        setFullHistory((prev: HistoryMessage[]) => {
          // If there are messages in the current session, keep them
          // Otherwise, just load the history
          if (prev && prev.length > 0) {
            // Current session has messages, prepend history before them
            return [...fullConversationHistory, ...prev];
          } else {
            // No messages in current session, just load history
            return fullConversationHistory;
          }
        });
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
      const historyPath = path.join(process.env.HOME || '', '.mcp_terminal_history');
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

  const saveToHistory = async (command: string, response: string | null = null): Promise<void> => {
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
      const historyPath = path.join(process.env.HOME || '', '.mcp_terminal_history');
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