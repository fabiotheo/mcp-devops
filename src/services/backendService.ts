/**
 * Backend Service
 *
 * Framework-agnostic service for initializing backend components.
 * Contains all business logic for configuration loading, model initialization,
 * and service setup, separated from React lifecycle management.
 */

import * as path from 'node:path';
import * as fs from 'fs/promises';
import { writeFileSync } from 'node:fs';
import AICommandOrchestratorBash from '../ai_orchestrator_bash.js';
import PatternMatcher from '../libs/pattern_matcher.js';
import ModelFactory from '../ai_models/model_factory.js';
import TursoAdapter from '../bridges/adapters/TursoAdapter.js';

// Type definitions
export interface BackendConfig {
  ai_provider: string;
  anthropic_api_key?: string;
  claude_model?: string;
  use_native_tools?: boolean;
  enable_bash_tool?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown; // Allow additional properties
}

// Import types from ai_orchestrator_bash
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Tool {
  name: string;
  description?: string;
  input_schema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

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
  askCommand?: (prompt: string, options?: Record<string, unknown>) => Promise<{ response: string; success: boolean } | any>;
}

export interface AIResponse {
  content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  response?: string;
  success?: boolean;
  error?: string;
}

export interface OrchestratorResult {
  success: boolean;
  question?: string;
  directAnswer?: string | null;
  executedCommands?: string[];
  results?: Array<{ command: string; output: string; truncated?: boolean; success?: boolean }>;
  iterations?: number;
  toolCalls?: number;
  duration?: number;
  error?: string;
  response?: string; // Add for compatibility
}

export interface Orchestrator {
  orchestrateExecution: (command: string, context: unknown, options?: unknown) => Promise<OrchestratorResult>;
  cleanup?: () => Promise<void>;
}

export interface BackendServices {
  config: BackendConfig | null;
  orchestrator: Orchestrator | null;
  patternMatcher: PatternMatcher | null;
  tursoAdapter: TursoAdapter | null;
  error: Error | null;
}

export interface InitializeBackendOptions {
  user?: string;
  isDebug?: boolean;
  onStatusChange?: (status: string) => void;
}

/**
 * Default configuration for the application
 */
const DEFAULT_CONFIG: BackendConfig = {
  ai_provider: 'claude',
  anthropic_api_key: process.env.ANTHROPIC_API_KEY,
  claude_model: 'claude-3-5-sonnet-20241022',
  use_native_tools: false,
  max_tokens: 4096,
  temperature: 0.7,
};

/**
 * Initialize debug logging
 * @param isDebug - Whether debug mode is enabled
 * @param user - Current user
 */
export function initializeDebugLog(isDebug: boolean, user: string): void {
  if (!isDebug) return;

  try {
    const debugHeader = `===== MCP DEBUG LOG =====\nStarted: ${new Date().toISOString()}\nUser: ${user}\n=========================\n`;
    writeFileSync('/tmp/mcp-debug.log', debugHeader);
    console.log('[Debug] Log file initialized at /tmp/mcp-debug.log');
  } catch (err) {
    const error = err as Error;
    console.log('[Debug] Could not initialize log file:', error.message);
  }
}

/**
 * Load configuration from file or return defaults
 * @param isDebug - Whether debug mode is enabled
 * @returns Configuration object
 */
export async function loadConfiguration(isDebug: boolean = false): Promise<BackendConfig> {
  const configPath = path.join(
    process.env.HOME || '~',
    '.mcp-terminal/config.json',
  );

  try {
    const configData = await fs.readFile(configPath, 'utf8');
    const loadedConfig: BackendConfig = JSON.parse(configData);

    if (isDebug) {
      console.log('  ✓ Configuration loaded');
    }

    return loadedConfig;
  } catch (err) {
    if (isDebug) {
      console.log('  ⚠ Using default configuration');
    }

    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Create AI model instance
 * @param config - Configuration object
 * @param isDebug - Whether debug mode is enabled
 * @returns AI model instance
 */
export async function createAIModel(config: BackendConfig, isDebug: boolean = false): Promise<AIModel> {
  try {
    const aiModel = await ModelFactory.createModel(config);

    if (isDebug) {
      console.log('  ✓ AI Model initialized');
    }

    // Ensure the model has the required methods
    const model = aiModel as any as AIModel;

    // Add askCommand if it doesn't exist
    if (!model.askCommand && model.askWithTools) {
      model.askCommand = async (prompt: string, options: Record<string, unknown> = {}) => {
        // Create a simple wrapper around askWithTools
        const response = await model.askWithTools!({
          system: 'You are a helpful AI assistant.',
          messages: [{ role: 'user', content: prompt }],
          tools: [],
          tool_choice: { type: 'auto' }
        });

        // Extract text from response
        const text = response.content?.[0]?.text || response.response || 'No response';

        return {
          response: text,
          success: true
        };
      };
    }

    return model;
  } catch (error) {
    const err = error as Error;
    console.error('Failed to initialize AI model:', err);

    // Return fallback model
    return {
      askWithTools: async () => {
        return {
          content: [{
            type: 'text',
            text: `Error: AI model not available - ${err.message}`
          }],
          stop_reason: 'error'
        };
      },
      askCommand: async () => {
        return {
          response: `Error: AI model not available - ${err.message}`,
          success: false
        };
      }
    };
  }
}

/**
 * Initialize orchestrator based on configuration
 * @param aiModel - AI model instance
 * @param config - Configuration object
 * @param isDebug - Whether debug mode is enabled
 * @returns Orchestrator instance
 */
export function createOrchestrator(aiModel: AIModel, config: BackendConfig, isDebug: boolean = false): Orchestrator {
  if (config.use_native_tools === true || config.enable_bash_tool === true) {
    // Use full orchestrator with tools
    const orchestrator = new AICommandOrchestratorBash(aiModel as any, {
      verboseLogging: isDebug,
      enableBash: true,
      bashConfig: {
        timeout: 30000,
      },
    });

    // Return orchestrator with properly typed interface
    return {
      orchestrateExecution: async (command: string, context: unknown, options: unknown = {}): Promise<OrchestratorResult> => {
        if (isDebug) {
          console.log('[Debug] orchestrateExecution called');
        }

        // Ensure context has the required properties
        const systemContext = {
          ...(typeof context === 'object' ? context : {}),
          history: (context as any)?.history || []
        };

        const result = await orchestrator.orchestrateExecution(command, systemContext, options);

        // Add response field for compatibility
        const enhancedResult: OrchestratorResult = {
          ...result,
          response: result.directAnswer || ''
        };

        return enhancedResult;
      },
      cleanup: async () => {
        // AICommandOrchestratorBash doesn't have cleanup method
        // Add any cleanup logic here if needed in the future
      }
    };
  } else {
    // Use simple direct AI model without tools
    return {
      orchestrateExecution: async function (command: string, _context: unknown, _options: unknown = {}): Promise<OrchestratorResult> {
        try {
          if (aiModel.askCommand) {
            const result = await aiModel.askCommand(command);
            return {
              success: result.success,
              response: result.response,
              directAnswer: result.response,
              executedCommands: [],
              results: [],
              iterations: 1,
              toolCalls: 0
            };
          } else {
            return {
              success: true,
              response: `Olá! Sou o MCP Terminal Assistant. Você disse: "${command}"\n\nPara habilitar funcionalidades avançadas com execução de comandos, configure "use_native_tools" ou "enable_bash_tool" como true em ~/.mcp-terminal/config.json`,
              directAnswer: `Olá! Sou o MCP Terminal Assistant. Você disse: "${command}"`,
              executedCommands: [],
              results: [],
              iterations: 1,
              toolCalls: 0
            };
          }
        } catch (error) {
          const err = error as Error;
          return {
            success: false,
            response: `Erro ao processar comando: ${err.message}`,
            directAnswer: null,
            error: err.message,
            executedCommands: [],
            results: [],
            iterations: 0,
            toolCalls: 0
          };
        }
      },
      cleanup: async (): Promise<void> => {},
    };
  }
}

/**
 * Initialize pattern matcher
 * @returns Pattern matcher instance
 */
export async function createPatternMatcher(): Promise<PatternMatcher> {
  const patternMatcher = new PatternMatcher();
  await patternMatcher.loadPatterns();
  return patternMatcher;
}

/**
 * Initialize Turso adapter
 * @param user - User identifier
 * @param isDebug - Whether debug mode is enabled
 * @returns Turso adapter instance or null
 */
export async function createTursoAdapter(user: string, isDebug: boolean = false): Promise<TursoAdapter | null> {
  try {
    const tursoAdapter = new TursoAdapter({
      debug: isDebug,
      userId: user,
    });

    await tursoAdapter.initialize();

    if (isDebug) {
      if (tursoAdapter.isConnected()) {
        console.log(`  ✓ Turso connected for user: ${user}`);
      } else {
        console.log('  ⚠ Turso offline mode (local history only)');
      }
    }

    return tursoAdapter;
  } catch (err) {
    if (isDebug) {
      console.log('  ⚠ Turso initialization failed, using local history');
      console.error('Turso error:', err);
    }

    return null;
  }
}

/**
 * Initialize all backend services
 * @param options - Initialization options
 * @returns Object containing all initialized services
 */
export async function initializeBackend({
  user = 'default',
  isDebug = false,
  onStatusChange = () => {}
}: InitializeBackendOptions): Promise<BackendServices> {
  const result: BackendServices = {
    config: null,
    orchestrator: null,
    patternMatcher: null,
    tursoAdapter: null,
    error: null
  };

  try {
    // Initialize debug log
    initializeDebugLog(isDebug, user);

    // Load configuration
    onStatusChange('loading-config');
    result.config = await loadConfiguration(isDebug);

    // Create AI model
    onStatusChange('initializing-ai');
    const aiModel = await createAIModel(result.config, isDebug);

    // Initialize orchestrator
    result.orchestrator = createOrchestrator(aiModel, result.config, isDebug);

    // Initialize pattern matcher
    result.patternMatcher = await createPatternMatcher();

    // Initialize Turso adapter
    result.tursoAdapter = await createTursoAdapter(user, isDebug);

    onStatusChange('ready');

    return result;
  } catch (err) {
    result.error = err as Error;
    onStatusChange('error');
    console.error('Backend initialization error:', err);
    throw err;
  }
}

export default {
  initializeBackend,
  loadConfiguration,
  createAIModel,
  createOrchestrator,
  createPatternMatcher,
  createTursoAdapter,
  initializeDebugLog
};