/**
 * Backend Initialization Hook
 *
 * React hook that manages backend service initialization lifecycle.
 * Delegates all business logic to backendService.js for better separation of concerns.
 *
 * Refactored to be a thin wrapper around the backend service.
 */

import { useEffect, MutableRefObject } from 'react';
import { initializeBackend } from '../services/backendService.js';
import { debugLog } from '../utils/debugLogger.js';
import type {
  BackendConfig,
  BackendInitResult,
  AIOrchestrator,
  PatternMatcher,
  TursoAdapter
} from '../types/services.js';

// ============== INTERFACES E TIPOS ==============

/**
 * Status types for the application
 */
export type AppStatus = 'initializing' | 'loading-config' | 'initializing-ai' | 'ready' | 'error' | 'processing';

/**
 * Parameters for the backend initialization hook
 */
export interface UseBackendInitializationParams {
  /** Function to update config state */
  setConfig: React.Dispatch<React.SetStateAction<BackendConfig>>;
  /** Function to update status */
  setStatus: React.Dispatch<React.SetStateAction<AppStatus>>;
  /** Function to set error message */
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  /** Function to load command history */
  loadCommandHistory: () => Promise<void>;
  /** Orchestrator ref */
  orchestrator: MutableRefObject<AIOrchestrator | null>;
  /** Pattern matcher ref */
  patternMatcher: MutableRefObject<PatternMatcher | null>;
  /** Turso adapter ref */
  tursoAdapter: MutableRefObject<TursoAdapter | null>;
  /** Current user */
  user: string;
  /** Debug mode flag */
  isDebug: boolean;
}

/**
 * Hook for initializing backend services
 *
 * Manages the initialization lifecycle of backend services including
 * AI models, orchestrators, pattern matchers, and database connections.
 *
 * @param params - Hook parameters
 */

export function useBackendInitialization({
  setConfig,
  setStatus,
  setError,
  loadCommandHistory,
  orchestrator,
  patternMatcher,
  tursoAdapter,
  user,
  isDebug
}: UseBackendInitializationParams): void {
  useEffect(() => {
    let mounted = true;
    
    const initialize = async () => {
      try {
        const result = await initializeBackend({
          user,
          isDebug,
          onStatusChange: (status) => {
            if (mounted) {
              setStatus(status);
            }
          }
        });

        if (mounted) {
          // Debug: Log the config before setting
          debugLog('[useBackendInitialization] Config from initializeBackend', result.config, isDebug);

          // Update configuration
          setConfig(result.config);

          // Debug: Verify what was set
          debugLog('[useBackendInitialization] Called setConfig with user', { user: result.config.user }, isDebug);

          // Set service references
          orchestrator.current = result.orchestrator;
          patternMatcher.current = result.patternMatcher;
          tursoAdapter.current = result.tursoAdapter;

          // Load command history
          await loadCommandHistory();

          setStatus('ready');
        }
      } catch (err) {
        if (mounted) {
          // Handle user not found error specially
          if (err instanceof Error && err.message.startsWith('USER_NOT_FOUND:')) {
            const username = err.message.split(':')[1];
            setError(`USER_NOT_FOUND:${username}`);
          } else {
            console.error('Backend initialization failed:', err);
            setError(err.message || 'Failed to initialize backend services');
          }
          setStatus('error');
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      
      // Cleanup services
      if (orchestrator.current?.cleanup) {
        orchestrator.current.cleanup().catch(console.error);
      }
      if (tursoAdapter.current?.close) {
        tursoAdapter.current.close().catch(console.error);
      }
    };
  }, [user, isDebug]); // Only re-run if user or debug mode changes
}

export default useBackendInitialization;