import { EventEmitter } from 'events';

/**
 * CommandProcessor
 * Handles command processing, validation, and routing
 */
class CommandProcessor extends EventEmitter {
  constructor(aiConnector, options = {}) {
    super();
    this.aiConnector = aiConnector;
    this.debug = options.debug || false;
    this.commandQueue = [];
    this.processing = false;
    this.commandHistory = [];
    this.maxHistorySize = options.maxHistorySize || 100;

    // Built-in commands
    this.builtinCommands = {
      '/help': this.showHelp.bind(this),
      '/clear': this.clearScreen.bind(this),
      '/debug': this.toggleDebug.bind(this),
      '/status': this.showStatus.bind(this),
      '/history': this.showHistory.bind(this),
      '/exit': this.exitApp.bind(this),
      '/quit': this.exitApp.bind(this),
    };
  }

  /**
   * Process a command from the UI
   * @param {string} input - User input
   * @returns {Promise<object>} - Processing result
   */
  async processInput(input) {
    if (!input || !input.trim()) {
      return { success: false, message: 'Empty command' };
    }

    const trimmedInput = input.trim();

    // Add to history
    this.addToHistory(trimmedInput);

    // Check for built-in commands
    if (trimmedInput.startsWith('/')) {
      return this.handleBuiltinCommand(trimmedInput);
    }

    // Check for special patterns (like paste detection)
    if (this.detectMultilineCommand(trimmedInput)) {
      return this.handleMultilineCommand(trimmedInput);
    }

    // Process through AI orchestrator
    return this.processAICommand(trimmedInput);
  }

  /**
   * Handle built-in commands
   */
  async handleBuiltinCommand(command) {
    const [cmd, ...args] = command.split(' ');
    const handler = this.builtinCommands[cmd];

    if (handler) {
      return handler(args);
    }

    return {
      success: false,
      message: `Unknown command: ${cmd}. Type /help for available commands.`,
    };
  }

  /**
   * Process command through AI orchestrator
   */
  async processAICommand(command) {
    if (this.processing) {
      this.commandQueue.push(command);
      return {
        success: true,
        message: 'Command queued for processing...',
      };
    }

    this.processing = true;
    this.emit('processing-start', command);

    try {
      const result = await this.aiConnector.processCommand(command);

      this.processing = false;
      this.emit('processing-complete', result);

      // Process next queued command if any
      if (this.commandQueue.length > 0) {
        const nextCommand = this.commandQueue.shift();
        setImmediate(() => this.processAICommand(nextCommand));
      }

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.processing = false;
      this.emit('processing-error', error);

      return {
        success: false,
        error: error.message,
        message: 'Error processing command. Please try again.',
      };
    }
  }

  /**
   * Detect if input is multiline command
   */
  detectMultilineCommand(input) {
    return input.includes('\n');
  }

  /**
   * Handle multiline commands (like pasted scripts)
   */
  async handleMultilineCommand(input) {
    const lines = input.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return { success: false, message: 'Empty multiline input' };
    }

    this.emit('multiline-detected', lines);

    // Process as a script or batch command
    return this.processAICommand(input);
  }

  /**
   * Add command to history
   */
  addToHistory(command) {
    this.commandHistory.push({
      command,
      timestamp: new Date(),
      processed: true,
    });

    // Limit history size
    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory = this.commandHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Built-in command handlers
   */
  showHelp() {
    const helpText = `
Available Commands:
  /help     - Show this help message
  /clear    - Clear the screen
  /debug    - Toggle debug mode
  /status   - Show system status
  /history  - Show command history
  /exit     - Exit the application
  /quit     - Exit the application

Regular Commands:
  - Type any Linux command or question
  - Paste multi-line scripts
  - Use Tab for auto-completion
  - Use ↑/↓ for command history
`;
    return {
      success: true,
      message: helpText,
      type: 'help',
    };
  }

  clearScreen() {
    this.emit('clear-screen');
    return {
      success: true,
      message: 'Screen cleared',
      type: 'system',
    };
  }

  toggleDebug(args) {
    const enabled = args[0] === 'on' || (!args[0] && !this.debug);
    this.debug = enabled;
    this.aiConnector.setDebugMode(enabled);

    return {
      success: true,
      message: `Debug mode ${enabled ? 'enabled' : 'disabled'}`,
      type: 'system',
    };
  }

  showStatus() {
    const status = {
      processing: this.processing,
      queueLength: this.commandQueue.length,
      historySize: this.commandHistory.length,
      debugMode: this.debug,
      aiConnected: this.aiConnector.initialized,
    };

    return {
      success: true,
      message: JSON.stringify(status, null, 2),
      type: 'status',
      data: status,
    };
  }

  showHistory() {
    const recent = this.commandHistory.slice(-10);
    const historyText = recent
      .map((item, index) => `${index + 1}. ${item.command}`)
      .join('\n');

    return {
      success: true,
      message: `Recent Commands:\n${historyText}`,
      type: 'history',
    };
  }

  exitApp() {
    this.emit('exit-request');
    return {
      success: true,
      message: 'Goodbye!',
      type: 'exit',
    };
  }

  /**
   * Get suggestions for auto-complete
   */
  async getSuggestions(partial) {
    // Check for built-in commands
    if (partial.startsWith('/')) {
      return Object.keys(this.builtinCommands).filter(cmd =>
        cmd.startsWith(partial),
      );
    }

    // Get AI suggestions
    return this.aiConnector.getSuggestions(partial);
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    this.removeAllListeners();
    this.commandQueue = [];
    this.commandHistory = [];
  }
}

export default CommandProcessor;
