/**
 * Status Processor Hook
 *
 * Processes ProgressEvent stream into StatusLine data
 * Extracts iteration, action, elapsed time, and metrics
 *
 * IMPORTANT: This hook follows strict TypeScript typing policy
 * - NO use of 'any' type
 * - All types are explicit and safe
 * - Uses proper React hooks patterns
 */

import { useMemo, useRef, useEffect, useState } from 'react';
import type { ProgressEvent } from '../ai_orchestrator_bash.js';
import type { StatusMetrics, StatusState } from '../types/status.js';

/**
 * Parameters for useStatusProcessor hook
 */
export interface UseStatusProcessorParams {
  /** Execution log events from AI orchestrator */
  executionLog: ProgressEvent[];

  /** Is processing currently active */
  isProcessing: boolean;

  /** Maximum iterations allowed (default: 10) */
  maxIterations?: number;
}

/**
 * Return type for useStatusProcessor hook
 */
export interface UseStatusProcessorResult {
  /** Current iteration (1-based) */
  iteration: number;

  /** Maximum iterations */
  maxIterations: number;

  /** Current action text */
  action: string;

  /** Elapsed time in seconds */
  elapsedTime: number;

  /** Metrics */
  metrics: StatusMetrics;

  /** Current state */
  state: StatusState;

  /** Whether to show status line */
  shouldShow: boolean;
}


/**
 * Process execution log into status data
 *
 * This hook transforms a stream of ProgressEvent objects into
 * structured data for the StatusLine component. It:
 * - Tracks current iteration from iteration-start events
 * - Extracts current action from command-execute events
 * - Calculates elapsed time since processing started
 * - Computes metrics (commands executed, success/failure counts)
 * - Determines current state (processing, warning, error)
 *
 * @param params - Hook parameters
 * @returns Processed status data for StatusLine component
 *
 * @example
 * ```tsx
 * const statusData = useStatusProcessor({
 *   executionLog,
 *   isProcessing,
 *   maxIterations: 10
 * });
 *
 * return statusData.shouldShow ? (
 *   <StatusLine {...statusData} />
 * ) : null;
 * ```
 */
export function useStatusProcessor({
  executionLog,
  isProcessing,
  maxIterations = 10
}: UseStatusProcessorParams): UseStatusProcessorResult {
  // Track processing start time
  const startTimeRef = useRef<number>(Date.now());

  // Real-time elapsed time state
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Reset start time when processing starts fresh
  useEffect(() => {
    if (isProcessing && executionLog.length === 0) {
      startTimeRef.current = Date.now();
    }
  }, [isProcessing, executionLog.length]);

  // Update elapsed time in real-time during processing
  useEffect(() => {
    if (!isProcessing) {
      return;
    }

    // Update immediately
    setElapsedTime((Date.now() - startTimeRef.current) / 1000);

    // Set up interval to update every 100ms
    const intervalId = setInterval(() => {
      setElapsedTime((Date.now() - startTimeRef.current) / 1000);
    }, 100);

    // Cleanup interval on unmount or when processing stops
    return () => clearInterval(intervalId);
  }, [isProcessing]);

  // Process events and compute status data
  // Using useMemo to avoid reprocessing on every render
  const processedData = useMemo(() => {
    // Initialize default values
    let iteration = 1;
    let action = 'Iniciando...';
    let state: StatusState = isProcessing ? 'processing' : 'idle';

    const metrics: StatusMetrics = {
      commandsExecuted: 0,
      successCount: 0,
      failureCount: 0,
      totalDuration: 0
    };

    // Process all events sequentially
    if (executionLog.length > 0) {
      for (const event of executionLog) {
        switch (event.type) {
          case 'iteration-start': {
            // Use iteration from event property directly
            if (event.iteration !== undefined) {
              iteration = event.iteration;
            }
            action = 'Iniciando iteração...';
            break;
          }

          case 'command-execute': {
            // Use command from event property directly
            if (event.command) {
              action = event.command;
            } else {
              // Fallback to message if command property not available
              action = event.message;
            }
            metrics.commandsExecuted++;
            break;
          }

          case 'command-complete': {
            // Increment success counter
            metrics.successCount++;

            // Accumulate total duration if available
            if (event.duration) {
              metrics.totalDuration = (metrics.totalDuration || 0) + event.duration;
            }
            break;
          }

          case 'timeout': {
            // Set warning state for timeout
            state = 'warning';
            action = 'Timeout detectado';
            break;
          }

          case 'error': {
            // Set error state - let StatusLine handle truncation
            state = 'error';
            metrics.failureCount++;
            action = event.message;
            break;
          }

          // iteration-complete is informational, no action needed
          case 'iteration-complete':
            break;
        }
      }
    }

    // Determine if status line should be shown
    // Show only when processing and have events to display
    const shouldShow = isProcessing && executionLog.length > 0;

    return {
      iteration,
      maxIterations,
      action,
      metrics,
      state,
      shouldShow
    };
  }, [executionLog, isProcessing, maxIterations]);

  // Return processed data with real-time elapsed time
  return {
    ...processedData,
    elapsedTime
  };
}

export default useStatusProcessor;
