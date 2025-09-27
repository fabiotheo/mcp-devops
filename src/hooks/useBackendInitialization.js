/**
 * Backend Initialization Hook
 *
 * React hook that manages backend service initialization lifecycle.
 * Delegates all business logic to backendService.js for better separation of concerns.
 *
 * Refactored to be a thin wrapper around the backend service.
 */

import { useEffect } from 'react';
import { initializeBackend } from '../services/backendService.js';

/**
 * Hook for initializing backend services
 *
 * @param {Object} params - Hook parameters
 * @param {Function} params.setConfig - Function to update config state
 * @param {Function} params.setStatus - Function to update status
 * @param {Function} params.setError - Function to set error message
 * @param {Function} params.loadCommandHistory - Function to load command history
 * @param {Object} params.orchestrator - Orchestrator ref
 * @param {Object} params.patternMatcher - Pattern matcher ref
 * @param {Object} params.tursoAdapter - Turso adapter ref
 * @param {string} params.user - Current user
 * @param {boolean} params.isDebug - Debug mode flag
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
    const init = async () => {
      try {
        // Call the service to initialize backend
        const result = await initializeBackend({
          user,
          isDebug,
          onStatusChange: setStatus
        });

        // Update refs with initialized services
        orchestrator.current = result.orchestrator;
        patternMatcher.current = result.patternMatcher;
        tursoAdapter.current = result.tursoAdapter;

        // Update config state - merge with existing config to preserve user and other CLI params
        setConfig(prevConfig => ({
          ...result.config,
          ...prevConfig  // Preserve existing config values like user, isDebug, etc
        }));

        // Load command history after services are ready
        await loadCommandHistory();
      } catch (err) {
        setError(`Initialization failed: ${err.message}`);
        setStatus('error');
      }
    };

    init();

    // Cleanup on unmount
    return () => {
      if (orchestrator.current?.cleanup) {
        orchestrator.current.cleanup().catch(console.error);
      }
    };
  }, []); // Empty dependency array - only run once on mount
}

export default useBackendInitialization;