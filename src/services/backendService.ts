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
import PatternMatcherImpl from '../libs/pattern_matcher.js';
import ModelFactory from '../ai_models/model_factory.js';
import TursoAdapterImpl from '../bridges/adapters/TursoAdapter.js';
import { debugLog } from '../utils/debugLogger.js';
import type {
  BackendConfig,
  BackendInitResult,
  AIOrchestrator,
  PatternMatcher,
  TursoAdapter,
  OrchestratorResult,
  AIModel,
  Message,
  Tool,
  AIResponse,
  AskCommandOptions
} from '../types/services.js';
import type { AppStatus } from '../hooks/useBackendInitialization.js';

// OrchestratorResult is imported from types/services.ts

export interface InitializeBackendOptions {
  user?: string;
  isDebug?: boolean;
  onStatusChange?: (status: AppStatus) => void;
}

/**
 * Default configuration for the application
 */
const DEFAULT_CONFIG: BackendConfig = {
  ai_provider: 'claude',
  anthropic_api_key: process.env.ANTHROPIC_API_KEY,
  claude_model: 'claude-sonnet-4-5-20250929',
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
    const model = aiModel as unknown as AIModel;

    // Add askCommand if it doesn't exist
    if (!model.askCommand && model.askWithTools) {
      model.askCommand = async (prompt: string, options?: AskCommandOptions) => {
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
export function createOrchestrator(aiModel: AIModel, config: BackendConfig, isDebug: boolean = false): AIOrchestrator {
  if (config.use_native_tools === true || config.enable_bash_tool === true) {
    // Use full orchestrator with tools
    // NOTE: AICommandOrchestratorBash expects a slightly different AIModel interface
    // This cast is safe as long as aiModel has askWithTools or askCommand
    const orchestrator = new AICommandOrchestratorBash(aiModel as unknown as any, {
      verboseLogging: isDebug,
      enableBash: true,
      bashConfig: {
        timeout: 30000,
      },
    });

    // Return orchestrator with properly typed interface
    return {
      askCommand: async (command: string, options?: AskCommandOptions): Promise<OrchestratorResult> => {
        if (isDebug) {
          console.log('[Debug] askCommand called');
        }

        // Ensure context has the required properties
        const systemContext = {
          history: options?.conversationHistory || []
        };

        const result = await orchestrator.orchestrateExecution(command, systemContext, options as any);

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
      askCommand: async function (command: string, _options?: AskCommandOptions): Promise<OrchestratorResult> {
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
  const patternMatcher = new PatternMatcherImpl();
  await patternMatcher.loadPatterns();
  return patternMatcher as unknown as PatternMatcher;
}

/**
 * Initialize Turso adapter
 * @param user - User identifier
 * @param config - Configuration object with Turso credentials
 * @param isDebug - Whether debug mode is enabled
 * @returns Turso adapter instance or null
 */
export async function createTursoAdapter(user: string, config: BackendConfig, isDebug: boolean = false): Promise<TursoAdapter> {
  debugLog('[createTursoAdapter] Creating adapter', { user, isDebug }, isDebug);

  const tursoAdapter = new TursoAdapterImpl({
    debug: isDebug,
    userId: user,
    turso_url: config.turso_url,
    turso_token: config.turso_token,
  });

  try {
    debugLog('[createTursoAdapter] Calling tursoAdapter.initialize()', { user }, isDebug);
    await tursoAdapter.initialize();
    debugLog('[createTursoAdapter] tursoAdapter.initialize() completed', { 
      isConnected: tursoAdapter.isConnected(),
      user 
    }, isDebug);

    if (isDebug) {
      if (tursoAdapter.isConnected()) {
        console.log(`  ✓ Turso connected for user: ${user}`);
      } else {
        console.log('  ⚠ Turso offline mode (local history only)');
      }
    }
  } catch (err) {
    debugLog('[createTursoAdapter] Error caught', { 
      error: err instanceof Error ? err.message : String(err),
      isUserNotFound: err instanceof Error && err.message.startsWith('USER_NOT_FOUND:'),
      user
    }, isDebug);

    // Re-throw user not found errors to prevent system from starting
    if (err instanceof Error && err.message.startsWith('USER_NOT_FOUND:')) {
      debugLog('[createTursoAdapter] Re-throwing USER_NOT_FOUND error', { user }, isDebug);
      throw err;
    }

    // Other Turso errors are optional (offline mode)
    if (isDebug) {
      console.log('  ⚠ Turso initialization failed, using local history');
      console.error('Turso error:', err);
    }
  }

  debugLog('[createTursoAdapter] Returning adapter', { user }, isDebug);
  return tursoAdapter as unknown as TursoAdapter;
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
}: InitializeBackendOptions): Promise<BackendInitResult> {

  try {
    // Initialize debug log FIRST so we can use it
    initializeDebugLog(isDebug, user);

    debugLog('[initializeBackend] Starting initialization', { user, isDebug }, isDebug);

    // Load configuration
    onStatusChange('loading-config');
    const config = await loadConfiguration(isDebug);

    // Create AI model
    onStatusChange('initializing-ai');
    const aiModel = await createAIModel(config, isDebug);

    // Initialize orchestrator
    const orchestrator = createOrchestrator(aiModel, config, isDebug);

    // Initialize pattern matcher
    const patternMatcher = await createPatternMatcher();

    // Initialize Turso adapter
    const tursoAdapter = await createTursoAdapter(user, config, isDebug);

    onStatusChange('ready');

    return {
      config: {
        ...config,
        user, // Preserve the user in the returned config
        isDebug
      },
      orchestrator,
      patternMatcher,
      tursoAdapter
    };
  } catch (err) {
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