import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PatternAdapter
 * Adapts the pattern_matcher.js for use with the new interface
 */
class PatternAdapter {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.patternMatcherPath =
      options.patternMatcherPath ||
      path.join(__dirname, '..', '..', '..', 'libs', 'pattern_matcher.js');
    this.patternMatcher = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Dynamically import pattern matcher
      const module = await import(this.patternMatcherPath);
      this.patternMatcher = module.default || module.PatternMatcher || module;

      if (this.debug) {
        console.log('[PatternAdapter] Pattern matcher loaded successfully');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[PatternAdapter] Failed to load pattern matcher:', error);
      // Pattern matching is optional, don't throw
      this.initialized = true;
    }
  }

  /**
   * Check if input matches any patterns
   * @param {string} input - User input
   * @returns {Promise<object|null>} - Pattern match result or null
   */
  async checkPatterns(input) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.patternMatcher) {
      return null;
    }

    try {
      // Check if pattern matcher has the expected interface
      if (typeof this.patternMatcher.match === 'function') {
        return await this.patternMatcher.match(input);
      }

      if (typeof this.patternMatcher === 'function') {
        return await this.patternMatcher(input);
      }

      return null;
    } catch (error) {
      if (this.debug) {
        console.error('[PatternAdapter] Error checking patterns:', error);
      }
      return null;
    }
  }

  /**
   * Get pattern suggestions based on partial input
   * @param {string} partial - Partial input
   * @returns {Promise<string[]>} - Array of suggestions
   */
  async getPatternSuggestions(partial) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.patternMatcher) {
      return [];
    }

    try {
      if (typeof this.patternMatcher.getSuggestions === 'function') {
        return await this.patternMatcher.getSuggestions(partial);
      }

      // Fallback to basic pattern-based suggestions
      return this.getBasicPatternSuggestions(partial);
    } catch (error) {
      if (this.debug) {
        console.error('[PatternAdapter] Error getting suggestions:', error);
      }
      return [];
    }
  }

  getBasicPatternSuggestions(partial) {
    // Common patterns for Linux commands
    const patterns = [
      'how many IPs are blocked',
      'check disk usage',
      'show docker containers',
      'list running processes',
      'check system logs',
      'show network connections',
      'check memory usage',
      'list systemd services',
    ];

    return patterns.filter(p =>
      p.toLowerCase().includes(partial.toLowerCase()),
    );
  }

  /**
   * Execute pattern-matched command sequence
   * @param {object} pattern - Pattern match result
   * @returns {Promise<object>} - Execution result
   */
  async executePattern(pattern) {
    if (!pattern || !pattern.sequence) {
      return {
        success: false,
        message: 'Invalid pattern',
      };
    }

    try {
      const results = [];

      for (const command of pattern.sequence) {
        // If command is a function, execute it
        if (typeof command === 'function') {
          const result = await command();
          results.push(result);
        } else {
          // Return command for execution by the orchestrator
          results.push({ command, pending: true });
        }
      }

      return {
        success: true,
        pattern: pattern.name,
        results,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default PatternAdapter;
