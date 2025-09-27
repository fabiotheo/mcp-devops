/**
 * Backend Service
 *
 * Framework-agnostic service for initializing backend components.
 * Contains all business logic for configuration loading, model initialization,
 * and service setup, separated from React lifecycle management.
 */

import path from 'node:path';
import fs from 'fs/promises';
import { writeFileSync } from 'node:fs';
import AICommandOrchestratorBash from '../ai_orchestrator_bash.js';
import PatternMatcher from '../libs/pattern_matcher.js';
import ModelFactory from '../ai_models/model_factory.js';
import TursoAdapter from '../bridges/adapters/TursoAdapter.js';

/**
 * Default configuration for the application
 */
const DEFAULT_CONFIG = {
  ai_provider: 'claude',
  anthropic_api_key: process.env.ANTHROPIC_API_KEY,
  claude_model: 'claude-3-5-sonnet-20241022',
  use_native_tools: false,
  max_tokens: 4096,
  temperature: 0.7,
};

/**
 * Initialize debug logging
 * @param {boolean} isDebug - Whether debug mode is enabled
 * @param {string} user - Current user
 */
export function initializeDebugLog(isDebug, user) {
  if (!isDebug) return;

  try {
    const debugHeader = `===== MCP DEBUG LOG =====\nStarted: ${new Date().toISOString()}\nUser: ${user}\n=========================\n`;
    writeFileSync('/tmp/mcp-debug.log', debugHeader);
    console.log('[Debug] Log file initialized at /tmp/mcp-debug.log');
  } catch (err) {
    console.log('[Debug] Could not initialize log file:', err.message);
  }
}

/**
 * Load configuration from file or return defaults
 * @param {boolean} isDebug - Whether debug mode is enabled
 * @returns {Promise<Object>} Configuration object
 */
export async function loadConfiguration(isDebug = false) {
  const configPath = path.join(
    process.env.HOME,
    '.mcp-terminal/config.json',
  );

  try {
    const configData = await fs.readFile(configPath, 'utf8');
    const loadedConfig = JSON.parse(configData);

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
 * @param {Object} config - Configuration object
 * @param {boolean} isDebug - Whether debug mode is enabled
 * @returns {Promise<Object>} AI model instance
 */
export async function createAIModel(config, isDebug = false) {
  try {
    const aiModel = await ModelFactory.createModel(config);

    if (isDebug) {
      console.log('  ✓ AI Model initialized');
    }

    return aiModel;
  } catch (error) {
    console.error('Failed to initialize AI model:', error);

    // Return fallback model
    return {
      askCommand: async (_prompt, _options = {}) => {
        return {
          response: `Error: AI model not available - ${error.message}`,
          success: false,
        };
      },
    };
  }
}

/**
 * Initialize orchestrator based on configuration
 * @param {Object} aiModel - AI model instance
 * @param {Object} config - Configuration object
 * @param {boolean} isDebug - Whether debug mode is enabled
 * @returns {Object} Orchestrator instance
 */
export function createOrchestrator(aiModel, config, isDebug = false) {
  if (config.use_native_tools === true || config.enable_bash_tool === true) {
    // Use full orchestrator with tools
    const orchestrator = new AICommandOrchestratorBash(aiModel, {
      verboseLogging: isDebug,
      enableBash: true,
      bashConfig: {
        timeout: 30000,
      },
    });

    // Add wrapper method for compatibility
    orchestrator.askCommand = async function (command, options = {}) {
      if (isDebug) {
        console.log('[Debug] askCommand wrapper called, using orchestrateExecution');
      }

      const contextWithHistory = {
        ...options,
        patternInfo: options.patternInfo,
      };

      return await this.orchestrateExecution(
        command,
        contextWithHistory,
        options,
      );
    };

    return orchestrator;
  } else {
    // Use simple direct AI model without tools
    return {
      askCommand: async function (command, options = {}) {
        try {
          if (aiModel.askCommand) {
            return await aiModel.askCommand(command, options);
          } else {
            return {
              response: `Olá! Sou o MCP Terminal Assistant. Você disse: "${command}"\n\nPara habilitar funcionalidades avançadas com execução de comandos, configure "use_native_tools" ou "enable_bash_tool" como true em ~/.mcp-terminal/config.json`,
              success: true,
            };
          }
        } catch (error) {
          return {
            response: `Erro ao processar comando: ${error.message}`,
            success: false,
            error: error.message,
          };
        }
      },
      cleanup: async () => {},
    };
  }
}

/**
 * Initialize pattern matcher
 * @returns {Promise<PatternMatcher>} Pattern matcher instance
 */
export async function createPatternMatcher() {
  const patternMatcher = new PatternMatcher();
  await patternMatcher.loadPatterns();
  return patternMatcher;
}

/**
 * Initialize Turso adapter
 * @param {string} user - User identifier
 * @param {boolean} isDebug - Whether debug mode is enabled
 * @returns {Promise<TursoAdapter|null>} Turso adapter instance or null
 */
export async function createTursoAdapter(user, isDebug = false) {
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
 * @param {Object} options - Initialization options
 * @param {string} options.user - User identifier
 * @param {boolean} options.isDebug - Whether debug mode is enabled
 * @param {Function} options.onStatusChange - Callback for status changes
 * @returns {Promise<Object>} Object containing all initialized services
 */
export async function initializeBackend({ user = 'default', isDebug = false, onStatusChange = () => {} }) {
  const result = {
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
    result.error = err;
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