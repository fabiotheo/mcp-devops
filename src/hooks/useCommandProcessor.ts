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
import type {
  AIOrchestrator,
  PatternMatcher,
  TursoAdapter,
  HistoryEntry,
  OrchestratorResult,
  DebugFunction,
  FormatResponseFunction
} from '../types/services.js';

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
 * @param {boolean} params.debug - Debug mode flag
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
  debug,
  formatResponse,
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
    if (debug) {
      debug(`[Debug] processCommand called with: "${command}"`);
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

    // Debug Turso save conditions - ALWAYS LOG THIS
    if (debug) {
      debug('[TURSO DEBUG] Checking save conditions:');
      debug('  - tursoAdapter.current:', !!tursoAdapter.current);
      debug('  - has isConnected method:', tursoAdapter.current ? !!tursoAdapter.current.isConnected : false);
      debug('  - isConnected():', tursoAdapter.current?.isConnected ? tursoAdapter.current.isConnected() : false);
      debug('  - user:', user);
      debug('  - user !== default:', user !== 'default');
    }

    const canSaveToTurso =
      tursoAdapter.current &&
      tursoAdapter.current.isConnected &&
      tursoAdapter.current.isConnected() &&
      user !== 'default';

    if (debug) {
      debug('  - canSaveToTurso:', canSaveToTurso);
    }

    if (canSaveToTurso) {
      try {
        if (debug) {
          debug(`[TURSO SAVE] Attempting to save message for user ${user} with request_id ${requestId}`);
        }
        const entryId = await tursoAdapter.current.saveQuestionWithStatusAndRequestId(
          command,
          'pending',
          requestId,
        );
        currentTursoEntryId.current = entryId;

        // Update the request with Turso ID
        const req = activeRequests.current.get(requestId);
        if (req) {
          req.tursoId = entryId;
        }

        if (debug) {
          debug(`[TURSO SAVE] ✓ Question saved to Turso with id: ${entryId}`);
        }
      } catch (err) {
        const error = err as Error;
        if (error.name !== 'AbortError') {
          console.warn('[Warning] Failed to save question to Turso:', error);
        }
      }
    }

    // Check if request was cancelled during DB save
    const requestAfterDb = activeRequests.current.get(requestId);
    if (!requestAfterDb || requestAfterDb.status === 'cancelled') {
      if (debug) {
        debug('[Debug] Request cancelled before AI processing');
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
        !patternMatcher.current
      ) {
        throw new Error('Backend services not initialized');
      }

      if (debug) {
        debug(`[Debug] Sending to orchestrator (request ${requestId}):`, command);
      }

      // Process through pattern matcher first
      if (patternMatcher.current) {
        const pattern = patternMatcher.current.match(command);
        if (debug && pattern) {
          debug('[Debug] Pattern detected:', pattern.pattern);
        }
      }

      // Keep abort controller in scope for streaming
      const controller = aiAbortControllerRef.current;
      if (!controller) {
        if (debug) {
          debug('[Debug] No abort controller available, request may have been cancelled');
        }
        return;
      }

      // Limit history to last 10 messages to save tokens and avoid confusion
      const recentHistory = fullHistory.slice(-10);

      if (debug) {
        debug('[CommandProcessor] Calling orchestrator', {
          command,
          historyLength: fullHistory.length,
          recentHistoryLength: recentHistory.length,
          requestId
        });
      }
      const result = await orchestrator.current.askCommand(
        command,
        {
          conversationHistory: recentHistory,
          abort: controller,
          onStream: chunk => {
            // Check if this request is still active
            const currentReq = activeRequests.current.get(requestId);
            if (!currentReq || currentReq.status === 'cancelled') {
              if (debug) {
                debug(`[Debug] Ignoring stream chunk for cancelled request ${requestId}`);
              }
              return;
            }

            if (currentRequestId.current !== requestId) {
              if (debug) {
                debug(`[Debug] Ignoring stream chunk for old request ${requestId}`);
              }
              return;
            }

            setResponse(prev => prev + chunk);
          },
        },
      );

      if (debug) {
        debug('[CommandProcessor] Orchestrator returned', {
          hasResult: !!result,
          hasResponse: !!result?.response,
          responseLength: result?.response?.length || 0
        });
      }

      // Check if orchestrator returned an error
      if (result && !result.success && result.error) {
        if (debug) {
          debug('[CommandProcessor] Orchestrator returned error', {
            error: result.error
          });
        }
        // Throw the error so it gets caught by the catch block
        throw new Error(result.error);
      }

      // Final check if request is still active
      const finalReq = activeRequests.current.get(requestId);
      if (!finalReq || finalReq.status === 'cancelled') {
        if (debug) {
          debug(`[Debug] Request ${requestId} was cancelled, not updating response`);
        }
        return;
      }

      if (currentRequestId.current !== requestId) {
        if (debug) {
          debug(`[Debug] Request ${requestId} is no longer current, ignoring result`);
        }
        return;
      }

      // Check for response or directAnswer (from successful orchestrator calls)
      const responseContent = result?.response || result?.directAnswer;

      if (responseContent) {
        if (debug) {
          debug('[CommandProcessor] Processing response', {
            responsePreview: responseContent?.substring(0, 200),
            responseType: typeof responseContent
          });
        }
        const formattedResponse = formatResponse(responseContent, debug);
        if (debug) {
          debug('[CommandProcessor] Setting formatted response', {
            formattedPreview: formattedResponse?.substring(0, 200)
          });
        }
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
            content: responseContent,
          },
        ]);

        // Update Turso with the response and status 'completed'
        if (
          tursoAdapter.current?.isConnected() &&
          currentTursoEntryId.current &&
          user !== 'default'
        ) {
          try {
            if (debug) {
              debug(`[Debug] Updating Turso entry ${currentTursoEntryId.current} to completed`);
            }
            await tursoAdapter.current.updateWithResponseAndStatus(
              currentTursoEntryId.current,
              responseContent,
              'completed',
            );
            if (debug) {
              debug('[Debug] Turso entry updated with response');
            }
          } catch (err) {
            const error = err as Error;
            if (error.name !== 'AbortError') {
              console.warn('[Warning] Failed to update Turso response:', error);
            }
          }
        }
      } else {
        if (debug) {
          debug('[CommandProcessor] No response from orchestrator', {
            result: result
          });
        }
        // If no response and there's an error in the result, throw it
        if (result && !result.success && result.error) {
          throw new Error(result.error);
        }
      }
    } catch (err) {
      const error = err as Error;
      if (error.name === 'AbortError') {
        if (debug) {
          debug(`[Debug] Request ${requestId} was aborted`);
        }
        // Don't update UI for aborted requests
        return;
      }

      console.error('[Error] Command processing failed:', error);

      // Check for authentication error - use simple format to avoid markdown issues
      let errorMsg;
      const errorMessage = error.message || String(error);
      if (errorMessage.includes('401') && errorMessage.includes('authentication_error')) {
        errorMsg = `❌ Erro de Autenticação da API - Chave inválida ou não configurada. Execute: ipcom-chat --configure`;
      } else if (errorMessage.includes('403')) {
        errorMsg = `❌ Erro de Permissão da API - Verifique as permissões da sua chave. Execute: ipcom-chat --configure`;
      } else if (errorMessage.includes('429')) {
        errorMsg = `⏳ Limite de Taxa Excedido - Aguarde alguns minutos e tente novamente.`;
      } else {
        errorMsg = `Error: ${errorMessage}`;
      }

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
          await tursoAdapter.current.updateWithResponseAndStatus(
            currentTursoEntryId.current,
            errorMsg,
            'error',
          );
        } catch (updateErr) {
          const updateError = updateErr as Error;
          if (updateError.name !== 'AbortError') {
            console.warn('[Warning] Failed to update Turso error:', updateError);
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
    debug,
    formatResponse,
    debug
  ]);

  return {
    processCommand
  };
}

// All functions are already exported as named exports above