/**
 * App Context
 *
 * Centralizes shared state and refs to eliminate prop drilling.
 * This context provides access to core application state, actions, and services
 * that need to be shared across multiple hooks and components.
 */

import React, { createContext, useContext, useRef, useState, useMemo } from 'react';

const AppContext = createContext(null);

/**
 * Hook to access the App Context
 * @throws {Error} If used outside of AppProvider
 */
export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}

/**
 * App Provider Component
 *
 * Wraps the application and provides centralized state management.
 * Groups related state and actions into logical categories for better organization.
 */
export function AppProvider({ children, config = {} }) {
  // ========== Core State ==========
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('initializing');
  const [response, setResponse] = useState('');
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

  // ========== History State ==========
  const [commandHistory, setCommandHistory] = useState([]);
  const [fullHistory, setFullHistory] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // ========== UI State ==========
  const [lastCtrlC, setLastCtrlC] = useState(0);
  const [lastEsc, setLastEsc] = useState(0);

  // Config state
  const [configState, setConfigState] = useState(config);

  // ========== Service Refs ==========
  const orchestrator = useRef(null);
  const patternMatcher = useRef(null);
  const tursoAdapter = useRef(null);

  // ========== Request Management Refs ==========
  const currentRequestId = useRef(null);
  const activeRequests = useRef(new Map());
  const aiAbortControllerRef = useRef(null);
  const dbAbortControllerRef = useRef(null);

  // Helper function to update currentRequestId
  const setCurrentRequestId = (id) => {
    currentRequestId.current = id;
  };

  // ========== Configuration ==========
  const appConfig = useMemo(() => {
    const finalConfig = {
      isDebug: configState.isDebug || false,
      isTTY: configState.isTTY !== undefined ? configState.isTTY : process.stdout.isTTY,
      user: configState.user || 'default',
      ...configState
    };

    // Debug: Log the config being created
    if (finalConfig.isDebug) {
      console.log('[AppContext] Creating config with user:', finalConfig.user);
      console.log('[AppContext] configState.user:', configState.user);
    }

    return finalConfig;
  }, [configState]);

  // ========== Context Value ==========
  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    // State groups
    state: {
      core: {
        input,
        status,
        response,
        error,
        isProcessing,
        isCancelled
      },
      history: {
        commandHistory,
        fullHistory,
        history,
        historyIndex
      },
      ui: {
        lastCtrlC,
        lastEsc
      }
    },

    // Action groups (setters)
    actions: {
      core: {
        setInput,
        setStatus,
        setResponse,
        setError,
        setIsProcessing,
        setIsCancelled,
        setConfig: setConfigState
      },
      history: {
        setCommandHistory,
        setFullHistory,
        setHistory,
        setHistoryIndex
      },
      ui: {
        setLastCtrlC,
        setLastEsc
      }
    },

    // Service references
    services: {
      orchestrator,
      patternMatcher,
      tursoAdapter
    },

    // Request management
    requests: {
      currentRequestId,
      activeRequests,
      aiAbortControllerRef,
      dbAbortControllerRef
    },

    // Configuration
    config: appConfig
  }), [
    // Dependencies for useMemo - all state and refs that are used
    input, status, response, error, isProcessing, isCancelled,
    commandHistory, fullHistory, history, historyIndex,
    lastCtrlC, lastEsc,
    currentRequestId,
    setInput, setStatus, setResponse, setError, setIsProcessing, setIsCancelled, setConfigState,
    setCommandHistory, setFullHistory, setHistory, setHistoryIndex,
    setLastCtrlC, setLastEsc, setCurrentRequestId,
    orchestrator, patternMatcher, tursoAdapter,
    activeRequests, aiAbortControllerRef, dbAbortControllerRef,
    appConfig, configState
  ]);

  return React.createElement(
    AppContext.Provider,
    { value: contextValue },
    children
  );
}

/**
 * Helper hooks for accessing specific parts of the context
 * These provide a more granular API for components that only need specific data
 */

export function useCoreState() {
  const { state, actions } = useAppContext();
  return {
    ...state.core,
    ...actions.core
  };
}

export function useHistoryState() {
  const { state, actions } = useAppContext();
  return {
    ...state.history,
    ...actions.history
  };
}

export function useServices() {
  const { services } = useAppContext();
  return services;
}

export function useRequestManagement() {
  const { requests } = useAppContext();
  return requests;
}

export function useAppConfig() {
  const { config } = useAppContext();
  return config;
}

export default AppContext;