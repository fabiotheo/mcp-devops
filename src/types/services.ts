/**
 * Type definitions for AI services and orchestration
 */

import * as React from 'react';

// ============== TYPE HELPERS ==============

/**
 * Type helper for React refs to services
 */
export type ServiceRef<T> = React.MutableRefObject<T | null>;

// ============== AI MODEL TYPES ==============

/**
 * Message in conversation
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Tool definition for AI
 */
export interface Tool {
  name: string;
  description?: string;
  input_schema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * System context for AI operations
 */
export interface SystemContext {
  os?: string;
  distro?: string;
  distribution?: string;
  version?: string;
  history?: Message[];
}

/**
 * AI Command Analysis Result
 */
export interface AICommandAnalysisResult {
  analysis: string;
  suggestions?: string[];
  confidence: number;
  error?: string;
}

/**
 * AI Command Response (standardized)
 */
export interface AICommandResponse {
  response: string;
  success: boolean;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: string;
}

/**
 * AI Response with content blocks
 */
export interface AIResponse {
  content?: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  response?: string;
  success?: boolean;
  error?: string;
}

/**
 * Command data for analysis
 */
export interface CommandData {
  command: string;
  exitCode: number;
  output?: string;
  error?: string;
  systemInfo?: SystemInfo;
}

/**
 * System information
 */
export interface SystemInfo {
  os?: string;
  arch?: string;
  version?: string;
  platform?: string;
}

/**
 * AI Model configuration
 */
export interface AIModelConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  ai_provider?: 'claude' | 'gemini' | 'openai';
  anthropic_api_key?: string;
  gemini_api_key?: string;
  claude_model?: string;
  gemini_model?: string;
}

/**
 * AI Model interface
 */
export interface AIModel {
  modelName?: string;
  getModelName?: () => string;
  supportsTools?: () => boolean;
  askWithTools?: (params: {
    system: string;
    messages: Message[];
    tools: Tool[];
    tool_choice: { type: string };
    signal?: AbortSignal;
  }) => Promise<AIResponse>;
  askCommand?: (prompt: string, options?: AskCommandOptions) => Promise<AICommandResponse>;
  analyzeCommand?: (commandData: CommandData) => Promise<AICommandAnalysisResult>;
  getProviderName?: () => string;
  validateApiKey?: () => Promise<boolean>;
}

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
  systemContext?: SystemContext;
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
  results?: Array<{ command: string; output: string; truncated?: boolean; success?: boolean }>;
  iterations?: number;
  toolCalls?: number;
  duration?: number;
  question?: string;
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
  close?: () => Promise<void>;
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