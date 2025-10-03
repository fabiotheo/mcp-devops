/**
 * App Context
 *
 * Centralizes shared state and refs to eliminate prop drilling.
 * This context provides access to core application state, actions, and services
 * that need to be shared across multiple hooks and components.
 */

import * as React from 'react';
import { createContext, useContext, useRef, useState, useMemo, MutableRefObject, ReactNode } from 'react';
import { debugLog } from '../utils/debugLogger.js';
import type { HistoryEntry, AIOrchestrator, PatternMatcher, TursoAdapter, BackendConfig } from '../types/services.js';
import type { AppStatus } from '../hooks/useBackendInitialization.js';
import type { RequestInfo } from '../hooks/useRequestManager.js';
import type { ProgressEvent } from '../ai_orchestrator_bash.js';

// ========== Type Definitions ==========

interface CoreState {
  input: string;
  status: AppStatus;
  response: string;
  error: string | null;
  isProcessing: boolean;
  isCancelled: boolean;
  executionLog: ProgressEvent[];
}

interface HistoryState {
  commandHistory: string[];
  fullHistory: HistoryEntry[];
  history: string[];
  historyIndex: number;
}

interface UIState {
  lastCtrlC: number;
  lastEsc: number;
  cursorPosition: number;
}

interface CoreActions {
  setInput: (value: string) => void;
  setStatus: (value: AppStatus) => void;
  setResponse: (value: string) => void;
  setError: (value: string | null) => void;
  setIsProcessing: (value: boolean) => void;
  setIsCancelled: (value: boolean) => void;
  setConfig: (value: BackendConfig) => void;
  setExecutionLog: (value: ProgressEvent[] | ((prev: ProgressEvent[]) => ProgressEvent[])) => void;
  addExecutionLog: (event: ProgressEvent) => void;
  clearExecutionLog: () => void;
}

interface HistoryActions {
  setCommandHistory: (value: string[]) => void;
  setFullHistory: (value: HistoryEntry[]) => void;
  setHistory: (value: string[]) => void;
  setHistoryIndex: (value: number) => void;
}

interface UIActions {
  setLastCtrlC: (value: number) => void;
  setLastEsc: (value: number) => void;
  setCursorPosition: (value: number) => void;
}

interface Services {
  orchestrator: MutableRefObject<AIOrchestrator | null>;
  patternMatcher: MutableRefObject<PatternMatcher | null>;
  tursoAdapter: MutableRefObject<TursoAdapter | null>;
}

interface RequestManagement {
  currentRequestId: MutableRefObject<string | null>;
  activeRequests: MutableRefObject<Map<string, RequestInfo>>;
  aiAbortControllerRef: MutableRefObject<AbortController | null>;
  dbAbortControllerRef: MutableRefObject<AbortController | null>;
}

interface AppContextValue {
  state: {
    core: CoreState;
    history: HistoryState;
    ui: UIState;
  };
  actions: {
    core: CoreActions;
    history: HistoryActions;
    ui: UIActions;
  };
  services: Services;
  requests: RequestManagement;
  config: BackendConfig;
}

interface AppProviderProps {
  children: ReactNode;
  config?: BackendConfig;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * Hook to access the App Context
 * @throws {Error} If used outside of AppProvider
 */
export function useAppContext(): AppContextValue {
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
export function AppProvider({ children, config = {} }: AppProviderProps) {
  // ========== Core State ==========
  const [input, setInput] = useState<string>('');
  const [status, setStatus] = useState<AppStatus>('initializing');
  const [response, setResponse] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCancelled, setIsCancelled] = useState<boolean>(false);
  const [executionLog, setExecutionLog] = useState<ProgressEvent[]>([]);

  // Helper functions for executionLog
  const addExecutionLog = (event: ProgressEvent) => {
    setExecutionLog(prev => [...prev, event]);
  };

  const clearExecutionLog = () => {
    setExecutionLog([]);
  };

  // ========== History State ==========
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [fullHistory, setFullHistory] = useState<HistoryEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // ========== UI State ==========
  const [lastCtrlC, setLastCtrlC] = useState<number>(0);
  const [lastEsc, setLastEsc] = useState<number>(0);
  const [cursorPosition, setCursorPosition] = useState<number>(0);

  // Config state
  const [configState, setConfigState] = useState<BackendConfig>(config);

  // Wrapper for setConfigState with debug logging
  const setConfigWithDebug = (value: BackendConfig | ((prev: BackendConfig) => BackendConfig)) => {
    const newConfig = typeof value === 'function' ? value(configState) : value;
    debugLog('[AppContext] setConfig called', { user: newConfig.user, isDebug: newConfig.isDebug }, config.isDebug || false);
    setConfigState(newConfig);
  };

  // ========== Service Refs ==========
  const orchestrator = useRef<AIOrchestrator | null>(null);
  const patternMatcher = useRef<PatternMatcher | null>(null);
  const tursoAdapter = useRef<TursoAdapter | null>(null);

  // ========== Request Management Refs ==========
  const currentRequestId = useRef<string | null>(null);
  const activeRequests = useRef<Map<string, RequestInfo>>(new Map());
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const dbAbortControllerRef = useRef<AbortController | null>(null);

  // Helper function to update currentRequestId
  const setCurrentRequestId = (id: string | null) => {
    currentRequestId.current = id;
  };

  // ========== Configuration ==========
  const appConfig = useMemo<BackendConfig>(() => {
    const computed = {
      isDebug: configState.isDebug || false,
      isTTY: configState.isTTY !== undefined ? configState.isTTY : process.stdout.isTTY,
      user: configState.user || 'default',
      ...configState
    };
    debugLog('[AppContext] appConfig computed', { user: computed.user, configStateUser: configState.user }, config.isDebug || false);
    return computed;
  }, [configState, config.isDebug]);

  // ========== Context Value ==========
  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo<AppContextValue>(() => ({
    // State groups
    state: {
      core: {
        input,
        status,
        response,
        error,
        isProcessing,
        isCancelled,
        executionLog
      },
      history: {
        commandHistory,
        fullHistory,
        history,
        historyIndex
      },
      ui: {
        lastCtrlC,
        lastEsc,
        cursorPosition
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
        setConfig: setConfigWithDebug,
        setExecutionLog,
        addExecutionLog,
        clearExecutionLog
      },
      history: {
        setCommandHistory,
        setFullHistory,
        setHistory,
        setHistoryIndex
      },
      ui: {
        setLastCtrlC,
        setLastEsc,
        setCursorPosition
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
    input, status, response, error, isProcessing, isCancelled, executionLog,
    commandHistory, fullHistory, history, historyIndex,
    lastCtrlC, lastEsc,
    currentRequestId,
    setInput, setStatus, setResponse, setError, setIsProcessing, setIsCancelled, setConfigState,
    setExecutionLog, addExecutionLog, clearExecutionLog,
    setCommandHistory, setFullHistory, setHistory, setHistoryIndex,
    setLastCtrlC, setLastEsc,
    orchestrator, patternMatcher, tursoAdapter,
    activeRequests, aiAbortControllerRef, dbAbortControllerRef,
    appConfig
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

// Type for combined core state and actions
type CoreStateAndActions = CoreState & CoreActions;

export function useCoreState(): CoreStateAndActions {
  const { state, actions } = useAppContext();
  return {
    ...state.core,
    ...actions.core
  };
}

// Type for combined history state and actions
type HistoryStateAndActions = HistoryState & HistoryActions;

export function useHistoryState(): HistoryStateAndActions {
  const { state, actions } = useAppContext();
  return {
    ...state.history,
    ...actions.history
  };
}

export function useServices(): Services {
  const { services } = useAppContext();
  return services;
}

export function useRequestManagement(): RequestManagement {
  const { requests } = useAppContext();
  return requests;
}

export function useAppConfig(): BackendConfig {
  const { config } = useAppContext();
  return config;
}

export default AppContext;