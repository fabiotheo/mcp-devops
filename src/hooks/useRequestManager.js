/**
 * Request Manager Hook
 *
 * Manages request lifecycle, cancellation, and cleanup.
 * Handles both AI and database abort controllers together.
 * Critical for maintaining proper state during cancellations.
 *
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

import { useRef, useState, useCallback } from 'react';
import { CANCELLATION_MARKER } from '../constants.js';

/**
 * Hook for managing request lifecycle and cancellation
 *
 * @param {Object} params - Hook parameters
 * @param {Function} params.setFullHistory - Function to update fullHistory
 * @param {Function} params.setInput - Function to clear input on cancellation
 * @param {Function} params.setIsProcessing - Function to set processing state
 * @param {Function} params.setStatus - Function to set status
 * @param {Function} params.setError - Function to set error state
 * @param {Object} params.tursoAdapter - Turso adapter ref
 * @param {boolean} params.isDebug - Debug mode flag
 * @param {boolean} params.isTTY - TTY flag for bracketed paste mode
 * @param {Function} params.enableBracketedPasteMode - Function to enable bracketed paste
 * @returns {Object} Request management functions and state
 */
export function useRequestManager({
  setFullHistory,
  setInput,
  setIsProcessing,
  setStatus,
  setError,
  tursoAdapter,
  isDebug,
  isTTY,
  enableBracketedPasteMode
}) {
  // Request tracking refs
  const currentRequestId = useRef(null);
  const currentTursoEntryId = useRef(null);
  const activeRequests = useRef(new Map());

  // Abort controllers - MUST stay together
  const aiAbortControllerRef = useRef(null);
  const dbAbortControllerRef = useRef(null);

  // Cancellation state
  const [isCancelled, setIsCancelled] = useState(false);

  /**
   * Cleanup a request when it completes or is cancelled
   * Critical function - maintains exact cancellation flow from original
   *
   * @param {string} requestId - The request ID to cleanup
   * @param {string} reason - Reason for cleanup (completion/cancellation)
   * @param {boolean} clearInput - Whether to clear the input field
   */
  const cleanupRequest = async (requestId, reason, clearInput = false) => {
    if (isDebug) {
      console.log(`[Debug] Cleaning up request ${requestId}: ${reason}`);
    }

    // Get request data before any modifications
    const request = activeRequests.current.get(requestId);

    // 1. Mark as cancelled in Map (but don't delete yet)
    if (request) {
      request.status = 'cancelled';
    }

    // 2. Abort ONLY the AI controller (DB operations should continue)
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
      aiAbortControllerRef.current = null;
    }
    // Note: We intentionally don't abort dbAbortControllerRef here

    // 3. Reset UI state to ready
    setIsProcessing(false);
    setStatus('ready');
    setError(null);

    // 3.5. Clear input if requested (e.g., when ESC is pressed during processing)
    if (clearInput) {
      setInput('');
      if (isDebug) {
        console.log('[Debug] Input cleared due to cancellation');
      }
    }

    // 4. Restore bracketed paste mode if TTY (always restore when cleaning up)
    if (enableBracketedPasteMode) {
      enableBracketedPasteMode(isTTY, isDebug);
    }

    // 5. CRITICAL: Add cancelled message to fullHistory IMMEDIATELY
    if (reason.includes('cancel') && request?.command) {
      if (isDebug) {
        console.log('[Debug] Adding cancelled message to fullHistory');
      }

      // Add the user's cancelled message and cancellation marker to fullHistory
      setFullHistory(prev => {
        const updated = [...prev];

        // Check if the user message is already in history
        const lastMessage = updated[updated.length - 1];
        const secondLastMessage = updated[updated.length - 2];
        const userMessageExists =
          (lastMessage?.role === 'user' &&
            lastMessage?.content === request.command) ||
          (secondLastMessage?.role === 'user' &&
            secondLastMessage?.content === request.command);

        // Check if cancellation marker already exists
        const hasMarker =
          lastMessage?.role === 'assistant' &&
          lastMessage?.content === CANCELLATION_MARKER;

        // Add user message if it doesn't exist
        if (!userMessageExists) {
          updated.push({
            role: 'user',
            content: request.command,
          });
          if (isDebug) {
            console.log('[Debug] Added user message to fullHistory');
          }
        }

        // Add cancellation marker if it doesn't exist
        if (!hasMarker) {
          updated.push({
            role: 'assistant',
            content: CANCELLATION_MARKER,
          });
          if (isDebug) {
            console.log('[Debug] Added cancellation marker to history');
          }
        }

        if (isDebug) {
          console.log(
            '[Debug] fullHistory now has',
            updated.length,
            'messages',
          );
        }

        return updated;
      });
    }

    // 6. Update Turso if this was a cancellation (not protected by abort)
    if (isDebug) {
      console.log(`[Debug] Cleanup - checking Turso update conditions:`);
      console.log(`  - reason: "${reason}"`);
      console.log(
        `  - reason.includes('cancel'): ${reason.includes('cancel')}`,
      );
      console.log(`  - request exists: ${!!request}`);
      console.log(`  - request?.tursoId: ${request?.tursoId}`);
      console.log(
        `  - tursoAdapter connected: ${tursoAdapter.current?.isConnected()}`,
      );
    }

    if (
      reason.includes('cancel') &&
      request?.tursoId &&
      tursoAdapter.current?.isConnected()
    ) {
      try {
        if (isDebug) {
          console.log(
            `[Debug] Updating Turso entry ${request.tursoId} to cancelled status`,
          );
        }
        // Update the message status to 'cancelled' in Turso
        await tursoAdapter.current.updateStatusByRequestId(
          requestId,
          'cancelled',
        );
        if (isDebug) {
          console.log(`[Debug] Turso entry marked as cancelled`);
        }
      } catch (err) {
        console.warn(
          `[Warning] Failed to update Turso status to cancelled: ${err.message}`,
        );
      }
    }

    // 7. Clear references
    if (currentRequestId.current === requestId) {
      currentRequestId.current = null;
    }
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current = null;
    }
    if (dbAbortControllerRef.current) {
      dbAbortControllerRef.current = null;
    }

    // 8. Finally remove from Map (do this LAST to ensure all operations can access request data)
    activeRequests.current.delete(requestId);
  };

  return {
    currentRequestId,
    currentTursoEntryId,
    activeRequests,
    aiAbortControllerRef,
    dbAbortControllerRef,
    cleanupRequest,
    isCancelled,
    setIsCancelled
  };
}

export default useRequestManager;