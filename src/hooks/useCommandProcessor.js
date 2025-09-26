/**
 * Command Processor Hook
 *
 * Handles command processing through AI orchestrator and pattern matcher.
 * Manages the entire command lifecycle from submission to response.
 *
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

import { useCallback } from 'react';
import { CANCELLATION_MARKER } from '../constants.js';

/**
 * Hook for processing commands through backend services
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.orchestrator - AI orchestrator ref
 * @param {Object} params.patternMatcher - Pattern matcher ref
 * @param {Object} params.tursoAdapter - Turso adapter ref
 * @param {Array} params.fullHistory - Full conversation history
 * @param {Function} params.setFullHistory - Function to update fullHistory
 * @param {Function} params.setHistory - Function to update visible history
 * @param {Function} params.setCommandHistory - Function to update command history
 * @param {Object} params.requestManager - Request manager from useRequestManager hook
 * @param {string} params.user - Current user
 * @param {boolean} params.isDebug - Debug mode flag
 * @param {Function} params.formatResponse - Response formatter function
 * @param {Function} params.debug - Debug logging function
 * @param {boolean} params.isProcessing - Processing state
 * @param {Function} params.setIsProcessing - Set processing state
 * @param {string} params.response - Current response
 * @param {Function} params.setResponse - Set response
 * @param {string} params.error - Current error
 * @param {Function} params.setError - Set error
 * @param {string} params.status - Current status
 * @param {Function} params.setStatus - Set status
 * @returns {Object} Command processor functions
 */
export function useCommandProcessor({
  orchestrator,
  patternMatcher,
  tursoAdapter,
  fullHistory,
  setFullHistory,
  setHistory,
  setCommandHistory,
  requestManager,
  user,
  isDebug,
  formatResponse,
  debug,
  isProcessing,
  setIsProcessing,
  response,
  setResponse,
  error,
  setError,
  status,
  setStatus
}) {

  // Extract needed functions from requestManager
  const {
    currentRequestId,
    currentTursoEntryId,
    activeRequests,
    aiAbortControllerRef,
    dbAbortControllerRef,
    cleanupRequest,
    isCancelled,
    setIsCancelled
  } = requestManager;

  /**
   * Process a command through the backend services
   */
  const processCommand = useCallback(async (command) => {
    if (isDebug) {
      console.log(`[Debug] processCommand called with: "${command}"`);
    }
    if (!command.trim()) return;

    // Generate unique request_id (timestamp + random for uniqueness)
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    currentRequestId.current = requestId;

    // Cancel any previous AI request (but not DB operations)
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
    }

    setIsProcessing(true);
    setResponse('');
    setError(null);
    setIsCancelled(false);

    // Create separate controllers for AI and DB operations
    const aiController = new AbortController();
    const dbController = new AbortController();
    aiAbortControllerRef.current = aiController;
    dbAbortControllerRef.current = dbController;

    activeRequests.current.set(requestId, {
      status: 'pending',
      aiController: aiController,
      dbController: dbController,
      command: command,
      tursoId: null,
    });

    // Save question to Turso immediately with status 'pending' and request_id
    currentTursoEntryId.current = null;
    if (isDebug) {
      console.log(`[Debug] Checking Turso save conditions:`);
      console.log(
        `  - tursoAdapter.current: ${tursoAdapter.current ? 'exists' : 'null'}`,
      );
      console.log(
        `  - isConnected: ${tursoAdapter.current?.isConnected() || false}`,
      );
      console.log(`  - user: ${user}`);
      console.log(`  - user !== 'default': ${user !== 'default'}`);
    }

    if (
      tursoAdapter.current &&
      tursoAdapter.current.isConnected() &&
      user !== 'default'
    ) {
      try {
        if (isDebug) {
          console.log(`[Debug] Saving question to Turso with request_id: ${requestId}`);
        }
        const entryId = await tursoAdapter.current.saveMessage(
          user,
          command,
          null,
          'pending',
          requestId,
          dbAbortControllerRef.current.signal,
        );
        currentTursoEntryId.current = entryId;

        // Update the request with Turso ID
        const req = activeRequests.current.get(requestId);
        if (req) {
          req.tursoId = entryId;
        }

        if (isDebug) {
          console.log(`[Debug] Question saved to Turso with id: ${entryId}`);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[Warning] Failed to save question to Turso:', err);
        }
      }
    }

    // Check if request was cancelled during DB save
    const requestAfterDb = activeRequests.current.get(requestId);
    if (!requestAfterDb || requestAfterDb.status === 'cancelled') {
      if (isDebug) {
        console.log('[Debug] Request cancelled before AI processing');
      }
      setIsProcessing(false);
      setStatus('ready');
      return;
    }

    // Add to command history IMMEDIATELY before processing
    setCommandHistory(prev => [...prev, command]);

    // Add user message to fullHistory
    setFullHistory(prev => [
      ...prev,
      {
        role: 'user',
        content: command,
      },
    ]);

    try {
      if (
        !orchestrator.current ||
        !orchestrator.current.orchestrator ||
        !orchestrator.current.patternMatcher
      ) {
        throw new Error('Backend services not initialized');
      }

      if (isDebug) {
        console.log(
          `[Debug] Sending to orchestrator (request ${requestId}):`,
          command,
        );
      }

      // Process through pattern matcher first
      if (orchestrator.current.patternMatcher) {
        const pattern = orchestrator.current.patternMatcher.detectPattern(command);
        if (isDebug && pattern) {
          console.log('[Debug] Pattern detected:', pattern.pattern);
        }
      }

      // Keep abort controller in scope for streaming
      const controller = aiAbortControllerRef.current;
      if (!controller) {
        if (isDebug) {
          console.log('[Debug] No abort controller available, request may have been cancelled');
        }
        return;
      }

      const result = await orchestrator.current.orchestrator.askCommand(
        command,
        fullHistory,
        {
          abort: controller,
          onStream: chunk => {
            // Check if this request is still active
            const currentReq = activeRequests.current.get(requestId);
            if (!currentReq || currentReq.status === 'cancelled') {
              if (isDebug) {
                console.log(
                  `[Debug] Ignoring stream chunk for cancelled request ${requestId}`,
                );
              }
              return;
            }

            if (currentRequestId.current !== requestId) {
              if (isDebug) {
                console.log(
                  `[Debug] Ignoring stream chunk for old request ${requestId}`,
                );
              }
              return;
            }

            setResponse(prev => prev + chunk);
          },
        },
      );

      // Final check if request is still active
      const finalReq = activeRequests.current.get(requestId);
      if (!finalReq || finalReq.status === 'cancelled') {
        if (isDebug) {
          console.log(`[Debug] Request ${requestId} was cancelled, not updating response`);
        }
        return;
      }

      if (currentRequestId.current !== requestId) {
        if (isDebug) {
          console.log(`[Debug] Request ${requestId} is no longer current, ignoring result`);
        }
        return;
      }

      if (result?.response) {
        const formattedResponse = formatResponse(result.response, debug);
        setResponse(formattedResponse);

        // Update display history with formatted response
        setHistory(prev => [
          ...prev,
          `❯ ${command}`,
          formatResponse(formattedResponse, debug),
        ]);

        // Add AI response to fullHistory
        setFullHistory(prev => [
          ...prev,
          {
            role: 'assistant',
            content: formattedResponse,
          },
        ]);

        // Update Turso with the response and status 'completed'
        if (
          tursoAdapter.current?.isConnected() &&
          currentTursoEntryId.current &&
          user !== 'default'
        ) {
          try {
            if (isDebug) {
              console.log(
                `[Debug] Updating Turso entry ${currentTursoEntryId.current} to completed`,
              );
            }
            await tursoAdapter.current.updateResponse(
              currentTursoEntryId.current,
              formattedResponse,
              'completed',
              dbAbortControllerRef.current.signal,
            );
            if (isDebug) {
              console.log('[Debug] Turso entry updated with response');
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.warn('[Warning] Failed to update Turso response:', err);
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (isDebug) {
          console.log(`[Debug] Request ${requestId} was aborted`);
        }
        // Don't update UI for aborted requests
        return;
      }

      console.error('[Error] Command processing failed:', err);
      const errorMsg = `Error: ${err.message}`;
      setError(errorMsg);
      setResponse(errorMsg);

      // Update display history with error
      setHistory(prev => [...prev, `❯ ${command}`, errorMsg]);

      // Update Turso with error status
      if (
        tursoAdapter.current?.isConnected() &&
        currentTursoEntryId.current &&
        user !== 'default'
      ) {
        try {
          await tursoAdapter.current.updateResponse(
            currentTursoEntryId.current,
            errorMsg,
            'error',
            dbAbortControllerRef.current.signal,
          );
        } catch (updateErr) {
          if (updateErr.name !== 'AbortError') {
            console.warn('[Warning] Failed to update Turso error:', updateErr);
          }
        }
      }
    } finally {
      // Only clean up UI state if this is still the current request
      if (currentRequestId.current === requestId) {
        setIsProcessing(false);
        setStatus('ready');

        // Clean up request from activeRequests
        activeRequests.current.delete(requestId);
        currentRequestId.current = null;

        // Clear controllers
        if (aiAbortControllerRef.current) {
          aiAbortControllerRef.current = null;
        }
        if (dbAbortControllerRef.current) {
          dbAbortControllerRef.current = null;
        }
      }
    }
  }, [
    orchestrator,
    patternMatcher,
    tursoAdapter,
    fullHistory,
    setFullHistory,
    setHistory,
    setCommandHistory,
    currentRequestId,
    currentTursoEntryId,
    activeRequests,
    aiAbortControllerRef,
    dbAbortControllerRef,
    setIsCancelled,
    setIsProcessing,
    setResponse,
    setError,
    setStatus,
    user,
    isDebug,
    formatResponse,
    debug
  ]);

  return {
    processCommand
  };
}

// All functions are already exported as named exports above