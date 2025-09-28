/**
 * Backend Initialization Hook
 *
 * React hook that manages backend service initialization lifecycle.
 * Delegates all business logic to backendService.js for better separation of concerns.
 *
 * Refactored to be a thin wrapper around the backend service.
 */

import { useEffect, MutableRefObject } from 'react';
import { initializeBackend } from '../services/backendService';
import type {
  BackendConfig,
  BackendInitResult,
  AIOrchestrator,
  PatternMatcher,
  TursoAdapter
} from '../types/services';

// ============== INTERFACES E TIPOS ==============

/**
 * Status types for the application
 */
export type AppStatus = 'initializing' | 'ready' | 'error' | 'processing';

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
}) {
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
          // Update configuration
          setConfig(result.config);
          
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
          console.error('Backend initialization failed:', err);
          setError(err.message || 'Failed to initialize backend services');
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