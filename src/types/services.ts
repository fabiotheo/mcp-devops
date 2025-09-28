/**
 * Type definitions for AI services and orchestration
 */

// ============== AI ORCHESTRATOR ==============

/**
 * Options for asking a command
 */
export interface AskCommandOptions {
  conversationHistory?: HistoryEntry[];
  abort?: AbortController;
  onStream?: (chunk: string) => void;
  interactive?: boolean;
  source?: string;
}

/**
 * History entry in conversation
 */
export interface HistoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Result from AI orchestrator
 */
export interface OrchestratorResult {
  success: boolean;
  response?: string;
  directAnswer?: string;
  error?: string;
  data?: unknown;
  executedCommands?: string[];
}

/**
 * AI Orchestrator interface
 */
export interface AIOrchestrator {
  askCommand: (command: string, options?: AskCommandOptions) => Promise<OrchestratorResult>;
  processUserQuery?: (query: string, context?: Record<string, unknown>) => Promise<OrchestratorResult>;
  cleanup?: () => Promise<void>;
  setDebugMode?: (enabled: boolean) => void;
}

// ============== PATTERN MATCHER ==============

/**
 * Pattern match result
 */
export interface PatternMatch {
  pattern: string;
  name?: string;
  confidence: number;
  suggestion?: string;
  sequence?: Array<string | (() => Promise<any>)>;
  data?: Record<string, unknown>;
}

/**
 * Pattern Matcher interface
 */
export interface PatternMatcher {
  match: (command: string) => PatternMatch | null;
  getSuggestions?: (partial: string) => string[];
  loadPatterns?: () => void;
}

// ============== TURSO ADAPTER ==============

/**
 * Turso history entry
 */
export interface TursoHistoryEntry {
  id?: string;
  command: string;
  response?: string | null;
  status?: 'pending' | 'completed' | 'cancelled' | 'error';
  timestamp?: number | Date;
  request_id?: string;
}

/**
 * Turso Adapter interface
 */
export interface TursoAdapter {
  isConnected: () => boolean;
  getHistory: (limit: number) => Promise<TursoHistoryEntry[]>;
  addToHistory: (command: string, response: string | null) => Promise<void>;
  saveQuestionWithStatusAndRequestId: (
    command: string,
    status: string,
    requestId: string
  ) => Promise<string | null>;
  updateWithResponseAndStatus: (
    entryId: string,
    response: string,
    status: string
  ) => Promise<void>;
  updateStatusByRequestId: (requestId: string, status: string) => Promise<void>;
  markAsCancelled?: (entryId: string) => Promise<boolean>;
}

// ============== BACKEND CONFIG ==============

/**
 * Backend configuration
 */
export interface BackendConfig {
  ai_provider?: 'claude' | 'gemini' | 'openai';
  anthropic_api_key?: string;
  claude_model?: string;
  gemini_api_key?: string;
  gemini_model?: string;
  openai_api_key?: string;
  openai_model?: string;
  debug?: boolean;
  user?: string;
  isDebug?: boolean;
  isTTY?: boolean;
  web_search_enabled?: boolean;
  firecrawl_api_key?: string;
  [key: string]: string | boolean | number | undefined;
}

/**
 * Backend initialization result
 */
export interface BackendInitResult {
  config: BackendConfig;
  orchestrator: AIOrchestrator;
  patternMatcher: PatternMatcher;
  tursoAdapter: TursoAdapter;
}

// ============== DEBUG FUNCTION ==============

/**
 * Debug function type
 */
export type DebugFunction = (label: string, data?: unknown) => void;

/**
 * Response formatter function
 */
export type FormatResponseFunction = (response: string, debug?: DebugFunction | null) => string;