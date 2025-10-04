/**
 * Input Handler Hook
 *
 * Manages keyboard input, command history navigation, and special key handling.
 * Handles paste detection, ESC cancellation, and command submission.
 *
 * Refactored to use AppContext, reducing parameters from 52 to 4.
 */

import { useInput } from 'ink';
import { useAppContext } from '../contexts/AppContext.js';
import {
  isPastedContent,
  cleanPastedContent,
  processPastedInput,
  enableBracketedPasteMode
} from '../utils/pasteDetection.js';
import { parseSpecialCommand, formatEnhancedStatusMessage } from '../utils/specialCommands.js';

/**
 * Hook for handling terminal input
 *
 * @param {Object} params - Hook parameters
 * @param {Function} params.processCommand - Function to process commands
 * @param {Function} params.cleanupRequest - Function to cleanup/cancel requests
 * @param {Function} params.formatResponse - Response formatter function
 * @param {Function} params.exit - Function to exit application
 */
export function useInputHandler({
  processCommand,
  cleanupRequest,
  formatResponse,
  exit
}) {
  // Get all needed values from context
  const { state, actions, services, requests, config } = useAppContext();

  // Destructure what we need
  const { input, status, isProcessing } = state.core;
  const { commandHistory, historyIndex } = state.history;
  const { lastCtrlC, lastEsc, cursorPosition } = state.ui;
  const { history } = state.history;

  const { setInput, setResponse, setIsCancelled } = actions.core;
  const { setCommandHistory, setHistory, setHistoryIndex } = actions.history;
  const { setLastCtrlC, setLastEsc, setCursorPosition } = actions.ui;

  const { orchestrator, patternMatcher } = services;
  const { currentRequestId, activeRequests } = requests;
  const { isDebug, isTTY } = config;

  // Create debug function from config
  const debug = (label, data) => {
    if (isDebug) {
      console.log(`[Debug] ${label}:`, data);
    }
  };

  // Only attach input handler in TTY mode
  if (!isTTY) {
    return;
  }

  useInput(async (char, key) => {
    // Handle Ctrl+C FIRST - double tap to exit
    // IMPORTANT: exitOnCtrlC is disabled in render(), so we must handle it here
    if (key.ctrl && char === 'c') {
      const now = Date.now();

      if (lastCtrlC > 0 && now - lastCtrlC < 2000) {
        // Second Ctrl+C within 2 seconds - exit
        if (!isDebug) {
          console.clear();
        }
        console.log('\n\x1b[33mGoodbye!\x1b[0m\n');
        exit();
      } else {
        // First Ctrl+C - show message prominently
        setLastCtrlC(now);

        // Add message to history for better visibility
        const exitMessage = '⚠️  Press Ctrl+C again within 2 seconds to exit';
        setHistory([...history, exitMessage]);

        // Also set as response
        setResponse(exitMessage);

        // Clear message after 2 seconds
        setTimeout(() => {
          setResponse('');
          setLastCtrlC(0);
          // Remove the exit message from history
          setHistory(history.filter(msg => msg !== exitMessage));
        }, 2000);
      }
      return; // Stop processing this key
    }

    // Only accept input when ready
    if (status !== 'ready' && status !== 'processing') {
      return;
    }

    // Debug all input
    if (isDebug) {
      if (char) {
        debug('Raw input received', JSON.stringify(char));
        debug('Current input state', JSON.stringify(input));
        debug('Input length', input.length);
        debug('Char codes', Array.from(char).map((c: string) => c.charCodeAt(0)));
        // Check for paste markers
        if (char.includes('200~') || char.includes('201~')) {
          debug('Paste marker detected in char', true);
        }
      }
      if (key) {
        debug('Key event', key);
      }
    }

    // SIMPLE paste detection - if we get multiple chars at once, it's a paste
    if (isPastedContent(char)) {
      if (isDebug) {
        debug('Paste detected', {
          length: char.length,
          hasNewline: char.includes('\n')
        });
        debug('Raw paste content', JSON.stringify(char));
      }

      // Process the pasted content
      const newInput = processPastedInput(input, char);
      setInput(newInput);
      setCursorPosition(newInput.length); // Move cursor to end after paste

      if (isDebug) {
        debug('Clean pasted content', JSON.stringify(cleanPastedContent(char)));
      }

      return;
    }

    // Handle ESC key
    if (key.escape) {
      const now = Date.now();
      const timeSinceLastEsc = now - lastEsc;

      if (timeSinceLastEsc < 500) {
        // Double ESC - clear input
        setInput('');
        setCursorPosition(0);
        setLastEsc(0);
        if (isDebug) {
          debug('Double ESC - Input cleared', true);
        }
      } else {
        // Single ESC
        if (isProcessing) {
          // Cancel current operation
          if (isDebug) {
            debug('ESC pressed - cancelling request', currentRequestId.current);
          }
          setIsCancelled(true);

          // Save the request ID before clearing it
          const requestIdToCancel = currentRequestId.current;

          // IMMEDIATELY mark as cancelled in Map local (primary source)
          const request = activeRequests.current.get(requestIdToCancel);
          if (request) {
            request.status = 'cancelled';
          }

          // Use unified cleanup function (it will handle everything including fullHistory update)
          await cleanupRequest(
            requestIdToCancel,
            'Operation cancelled by user',
            true,
          );

          // Add cancellation marker to command history for context
          // This lets the AI know the previous message was interrupted
          const newHistory = [
            ...commandHistory,
            '[User pressed ESC - Previous message was interrupted]',
          ].slice(-100);
          if (isDebug) {
            debug('Added cancellation marker to command history', true);
          }
          setCommandHistory(newHistory);

          // Reset cancellation flag after a short delay to allow cleanup
          setTimeout(() => {
            setIsCancelled(false);
            if (isDebug) {
              debug('Reset isCancelled flag', true);
            }
          }, 100);
        }
        setLastEsc(now);
      }
      return;
    }

    // Normal input handling
    if (key.return) {
      // Check if input ends with backslash (for multi-line)
      if (input.endsWith('\\')) {
        // Remove backslash and add newline
        setInput(input.slice(0, -1) + '\n');
        return;
      }

      const command = input.trim();

      if (command.startsWith('/')) {
        // Parse special command to get action
        const action = parseSpecialCommand(command, {
          commandHistory,
          status,
          hasOrchestrator: !!orchestrator?.current,
          hasPatternMatcher: !!patternMatcher?.current,
          isDebug,
          hasConfig: !!config
        });

        if (action) {
          // Handle the action
          switch (action.type) {
            case 'SHOW_HELP':
              setResponse(action.payload.text);
              setHistory([...history, `❯ ${command}`, formatResponse(action.payload.text, debug)]);
              break;

            case 'CLEAR_HISTORY':
              setHistory([]);
              setResponse('');
              break;

            case 'SHOW_HISTORY':
              const historyText = action.payload.commands.join('\n') || 'No command history';
              setResponse(historyText);
              setHistory([...history, `❯ ${command}`, formatResponse(historyText, debug)]);
              break;

            case 'SHOW_STATUS':
              // Use enhanced status message with system metrics
              const enhancedStatusText = formatEnhancedStatusMessage({
                commandHistory,
                status,
                hasOrchestrator: !!orchestrator?.current,
                hasPatternMatcher: !!patternMatcher?.current,
                isDebug,
                hasConfig: !!config,
                userName: config?.user || 'default',
                sessionStartTime: state.session?.startTime,
                lastCommandTime: state.session?.lastCommandTime,
                commandCount: commandHistory.length,
                successCount: state.session?.successCount || commandHistory.length,
                failedCount: state.session?.failedCount || 0
              });
              setResponse(enhancedStatusText);
              setHistory([...history, `❯ ${command}`, formatResponse(enhancedStatusText, debug)]);
              break;

            case 'EXIT_APPLICATION':
              exit();
              break;

            case 'UNKNOWN_COMMAND':
              const errorText = `Unknown command: /${action.payload.command}`;
              setResponse(errorText);
              setHistory([...history, `❯ ${command}`, formatResponse(errorText, debug)]);
              break;
          }
        }
      } else if (command) {
        // Debug: Log that we're about to process command
        const fs = await import('fs/promises');
        await fs.appendFile('/tmp/turso-debug.log',
          `${new Date().toISOString()} [useInputHandler] About to call processCommand with: "${command}"\n`
        ).catch(() => {});

        await processCommand(command);
      }

      setInput('');
      setCursorPosition(0); // Reset cursor to start
      // Force re-enable bracketed paste mode after clearing input
      enableBracketedPasteMode(isTTY, false);
    } else if (key.upArrow) {
      // Navigate history up
      if (isDebug) {
        debug('History navigation UP', {
          currentIndex: historyIndex,
          historyLength: commandHistory.length
        });
      }
      // Filter out ESC markers from navigation
      const navigableHistory = commandHistory.filter(
        cmd =>
          !cmd.includes('[User pressed ESC') &&
          !cmd.includes('Previous message was interrupted'),
      );
      if (navigableHistory.length > 0) {
        const newIndex =
          historyIndex < navigableHistory.length - 1
            ? historyIndex + 1
            : historyIndex;
        setHistoryIndex(newIndex);
        const historyText = navigableHistory[navigableHistory.length - 1 - newIndex] || '';
        setInput(historyText);
        setCursorPosition(historyText.length); // Move cursor to end
      }
    } else if (key.downArrow) {
      // Navigate history down
      // Filter out ESC markers from navigation
      const navigableHistory = commandHistory.filter(
        cmd =>
          !cmd.includes('[User pressed ESC') &&
          !cmd.includes('Previous message was interrupted'),
      );
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const historyText = navigableHistory[navigableHistory.length - 1 - newIndex] || '';
        setInput(historyText);
        setCursorPosition(historyText.length); // Move cursor to end
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
        setCursorPosition(0);
      }
    } else if (key.leftArrow) {
      // Move cursor left (backward in string)
      if (cursorPosition > 0) {
        setCursorPosition(cursorPosition - 1);
      }
    } else if (key.rightArrow) {
      // Move cursor right (forward in string)
      if (cursorPosition < input.length) {
        setCursorPosition(cursorPosition + 1);
      }
    } else if (key.backspace || key.delete) {
      // Delete character at cursor position
      if (cursorPosition > 0) {
        const newValue = input.slice(0, cursorPosition - 1) + input.slice(cursorPosition);
        if (isDebug && newValue === '') {
          debug('Input cleared via backspace - now empty', true);
        }
        setInput(newValue);
        setCursorPosition(cursorPosition - 1);
      }
    } else if (key.ctrl && char === 'l') {
      // Clear screen - Ctrl+L
      setHistory([]);
      setResponse('');
    } else if (char && !key.ctrl && !key.meta) {
      // Insert character at cursor position
      const newValue = input.slice(0, cursorPosition) + char + input.slice(cursorPosition);
      setInput(newValue);
      setCursorPosition(cursorPosition + 1);
    }
  });
}

export default useInputHandler;
