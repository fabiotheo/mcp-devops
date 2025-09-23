import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AIConnector Bridge
 * Connects the Ink UI with the existing AI orchestrator
 */
class AIConnector extends EventEmitter {
    constructor(options = {}) {
        super();
        this.debug = options.debug || false;
        this.orchestratorPath = options.orchestratorPath ||
            path.join(__dirname, '..', 'ai_orchestrator_bash.js');
        this.initialized = false;
        this.orchestratorModule = null;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Dynamically import the AI orchestrator
            this.orchestratorModule = await import(this.orchestratorPath);

            if (this.debug) {
                console.log('[AIConnector] AI Orchestrator loaded successfully');
            }

            this.initialized = true;
            this.emit('initialized');
        } catch (error) {
            console.error('[AIConnector] Failed to load AI orchestrator:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Process a command through the AI orchestrator
     * @param {string} command - The command to process
     * @param {object} context - Additional context
     * @returns {Promise<object>} - The AI response
     */
    async processCommand(command, context = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.debug) {
            console.log(`[AIConnector] Processing command: ${command}`);
        }

        this.emit('processing', { command, context });

        try {
            // Call the AI orchestrator's main function
            const result = await this.orchestratorModule.processUserQuery(command, {
                ...context,
                interactive: true,
                source: 'ink-interface'
            });

            if (this.debug) {
                console.log('[AIConnector] Result:', result);
            }

            this.emit('result', result);
            return result;
        } catch (error) {
            console.error('[AIConnector] Error processing command:', error);
            this.emit('error', error);

            return {
                success: false,
                error: error.message,
                suggestion: 'Try rephrasing your command or check the logs for more details'
            };
        }
    }

    /**
     * Get command suggestions based on partial input
     * @param {string} partial - Partial command
     * @returns {Promise<string[]>} - Array of suggestions
     */
    async getSuggestions(partial) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            if (this.orchestratorModule.getSuggestions) {
                return await this.orchestratorModule.getSuggestions(partial);
            }

            // Fallback to basic suggestions
            return this.getBasicSuggestions(partial);
        } catch (error) {
            if (this.debug) {
                console.error('[AIConnector] Error getting suggestions:', error);
            }
            return [];
        }
    }

    getBasicSuggestions(partial) {
        const commands = [
            'help', 'status', 'clear', 'history',
            'debug on', 'debug off', 'config', 'version'
        ];

        return commands.filter(cmd =>
            cmd.toLowerCase().startsWith(partial.toLowerCase())
        );
    }

    /**
     * Enable or disable debug mode
     * @param {boolean} enabled
     */
    setDebugMode(enabled) {
        this.debug = enabled;
        this.emit('debug-mode', enabled);

        if (this.orchestratorModule && this.orchestratorModule.setDebugMode) {
            this.orchestratorModule.setDebugMode(enabled);
        }
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        if (this.orchestratorModule && this.orchestratorModule.cleanup) {
            await this.orchestratorModule.cleanup();
        }

        this.removeAllListeners();
        this.initialized = false;
    }
}

export default AIConnector;