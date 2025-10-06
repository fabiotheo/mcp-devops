/**
 * Command Processor Hook
 *
 * Handles command processing through AI orchestrator and pattern matcher.
 * Manages the entire command lifecycle from submission to response.
 *
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

import { useCallback, Dispatch, SetStateAction } from 'react';
import { CANCELLATION_MARKER } from '../constants.js';
import type {
  AIOrchestrator,
  PatternMatcher,
  TursoAdapter,
  HistoryEntry,
  OrchestratorResult,
  DebugFunction,
  FormatResponseFunction,
  ServiceRef
} from '../types/services.js';
import type { UseRequestManagerReturn } from './useRequestManager.js';
import type { ProgressEvent } from '../ai_orchestrator_bash.js';

// ============== CONFIGURAÇÃO DE HISTÓRICO ==============

/**
 * Number of messages to send to API Claude as context
 * This is always active within the same session (no timeout)
 * 10 messages = 5 exchanges (5 questions + 5 answers)
 */
const CONTEXT_HISTORY_COUNT = 10;

// ============== INTERFACES E TIPOS ==============

/**
 * Parameters for useCommandProcessor hook
 */
export interface UseCommandProcessorParams {
  // Services (refs)
  orchestrator: ServiceRef<AIOrchestrator>;
  patternMatcher: ServiceRef<PatternMatcher>;
  tursoAdapter: ServiceRef<TursoAdapter>;

  // State
  input: string;
  commandHistory: string[];
  fullHistory: HistoryEntry[];
  isProcessing: boolean;
  response: string;
  error: string | null;
  status: string;

  // State setters
  setCommandHistory: Dispatch<SetStateAction<string[]>>;
  setFullHistory: Dispatch<SetStateAction<HistoryEntry[]>>;
  setHistory: Dispatch<SetStateAction<string[]>>;
  setResponse: Dispatch<SetStateAction<string>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;

  // Execution log setters
  addExecutionLog: (event: ProgressEvent) => void;
  clearExecutionLog: () => void;

  // Functions
  saveToHistory: (command: string, response?: string | null) => Promise<void>;
  formatResponse: FormatResponseFunction;
  debug: DebugFunction;

  // Request manager
  requestManager: UseRequestManagerReturn;

  // Config
  user: string;
  isDebug: boolean;
}

/**
 * Return type for useCommandProcessor hook
 */
export interface UseCommandProcessorReturn {
  processCommand: (command: string) => Promise<void>;
}

/**
 * Hook for processing commands through backend services
 *
 * @param params - Hook parameters
 * @returns Command processor functions
 */
export function useCommandProcessor(
  params: UseCommandProcessorParams
): UseCommandProcessorReturn {
  // Destructure params
  const {
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
    setStatus,
    saveToHistory,
    addExecutionLog,
    clearExecutionLog
  } = params;
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

    // Clear previous execution log
    clearExecutionLog();

    // Add command to display history IMMEDIATELY for better UX
    // User sees what they typed right away, before processing starts
    setHistory(prev => [...prev, `❯ ${command}`]);

    // Generate unique request_id (timestamp + random for uniqueness)
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    currentRequestId.current = requestId;

    // Generate temporary ID for user message (will be replaced with Turso ID)
    const userMessageId = `temp_user_${requestId}`;

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
    }

    const canSaveToTurso =
      tursoAdapter.current &&
      tursoAdapter.current.isConnected &&
      tursoAdapter.current.isConnected();

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

        // Update fullHistory with the real Turso ID
        if (entryId) {
          setFullHistory(prev => prev.map(msg =>
            msg.id === userMessageId ? { ...msg, id: entryId } : msg
          ));
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

    // NOTE: commandHistory is now managed in useInputHandler
    // to filter out slash commands. Only real user queries go to history.

    // Add user message to fullHistory with memory management
    // Keep only the last 40 messages to prevent memory issues
    const MAX_HISTORY_SIZE = 40;

    setFullHistory(prev => {
      const newHistory = [
        ...prev,
        {
          id: userMessageId,
          role: 'user' as const,
          content: command,
          timestamp: Date.now(),
        },
      ];
      // Keep only the last MAX_HISTORY_SIZE messages
      return newHistory.length > MAX_HISTORY_SIZE
        ? newHistory.slice(-MAX_HISTORY_SIZE)
        : newHistory;
    });

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

      // Select recent history to send to API
      // Always send the last CONTEXT_HISTORY_COUNT messages (no timeout logic)
      const recentHistory: HistoryEntry[] = fullHistory.length > 0
        ? fullHistory.slice(-CONTEXT_HISTORY_COUNT)
        : [];

      if (debug) {
        debug('[CommandProcessor] Preparing context for API', {
          totalHistoryInMemory: fullHistory.length,
          contextToSend: recentHistory.length,
          requestId
        });
      }

      // Remove timestamp before sending to API (API only accepts role and content)
      const cleanHistory = recentHistory.map(({ role, content }) => ({ role, content }));

      const result = await orchestrator.current.askCommand(
        command,
        {
          conversationHistory: cleanHistory,
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
          onProgress: (event: ProgressEvent) => {
            // Check if this request is still active
            const currentReq = activeRequests.current.get(requestId);
            if (!currentReq || currentReq.status === 'cancelled') {
              if (debug) {
                debug(`[Debug] Ignoring progress event for cancelled request ${requestId}`);
              }
              return;
            }

            if (currentRequestId.current !== requestId) {
              if (debug) {
                debug(`[Debug] Ignoring progress event for old request ${requestId}`);
              }
              return;
            }

            // Add progress event to execution log
            addExecutionLog(event);
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

        // Update display history with formatted response only
        // Command was already added at the start for better UX
        setHistory(prev => [
          ...prev,
          formatResponse(formattedResponse, debug),
        ]);

        // Add AI response to fullHistory with memory management
        // Use the same Turso entry ID as the question (responses update the same row)
        setFullHistory(prev => {
          const newHistory = [
            ...prev,
            {
              id: currentTursoEntryId.current || `temp_assistant_${requestId}`,
              role: 'assistant' as const,
              content: responseContent,
              timestamp: Date.now(),
            },
          ];
          // Keep only the last MAX_HISTORY_SIZE messages
          return newHistory.length > MAX_HISTORY_SIZE
            ? newHistory.slice(-MAX_HISTORY_SIZE)
            : newHistory;
        });

        // Update Turso with the response and status 'completed'
        if (
          tursoAdapter.current?.isConnected() &&
          currentTursoEntryId.current
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

        // If no response at all, show timeout message
        const timeoutMsg = '⏳ O processamento demorou muito e foi interrompido. Por favor, tente uma pergunta mais simples ou divida em partes menores.';
        setResponse(timeoutMsg);
        // Command was already added at the start, only add timeout message
        setHistory(prev => [...prev, timeoutMsg, '─'.repeat(80)]);
        setFullHistory(prev => {
          const newHistory = [...prev, {
            id: userMessageId,
            role: 'user' as const,
            content: command,
            timestamp: Date.now()
          }, {
            id: `timeout_${requestId}`,
            role: 'assistant' as const,
            content: timeoutMsg,
            timestamp: Date.now()
          }];
          // Keep only the last MAX_HISTORY_SIZE messages
          return newHistory.length > MAX_HISTORY_SIZE
            ? newHistory.slice(-MAX_HISTORY_SIZE)
            : newHistory;
        });
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

      // Update display history with error only
      // Command was already added at the start for better UX
      setHistory(prev => [...prev, errorMsg]);

      // Update Turso with error status
      if (
        tursoAdapter.current?.isConnected() &&
        currentTursoEntryId.current
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
    cleanupRequest,
    setIsCancelled,
    setIsProcessing,
    setResponse,
    setError,
    setStatus,
    user,
    debug,
    formatResponse,
    saveToHistory,
    addExecutionLog,
    clearExecutionLog
  ]);

  return {
    processCommand
  };
}

// All functions are already exported as named exports above