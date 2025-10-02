import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Manages command history for the terminal assistant
 */
class HistoryManager {
  private historyFile: string;
  private maxHistory: number;
  private history: string[];
  private initialized: boolean;

  constructor(maxHistory: number = 1000) {
    this.historyFile = path.join(
      os.homedir(),
      '.mcp-terminal',
      'ink-history.json',
    );
    this.maxHistory = maxHistory;
    this.history = [];
    this.initialized = false;
  }

  /**
   * Initialize the history manager by creating directory and loading existing history
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure directory exists
      const dir = path.dirname(this.historyFile);
      await fs.mkdir(dir, { recursive: true });

      // Load existing history
      try {
        const data = await fs.readFile(this.historyFile, 'utf8');
        this.history = JSON.parse(data) as string[];
      } catch (err) {
        // File doesn't exist yet, start with empty history
        this.history = [];
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize history:', error);
      this.history = [];
      this.initialized = true;
    }
  }

  /**
   * Add a command to history
   * @param command - Command to add
   */
  async addCommand(command: string): Promise<void> {
    if (!command || !command.trim()) return;

    // Avoid duplicate consecutive commands
    if (
      this.history.length > 0 &&
      this.history[this.history.length - 1] === command
    ) {
      return;
    }

    this.history.push(command);

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    // Save to file
    await this.save();
  }

  /**
   * Save history to file
   */
  private async save(): Promise<void> {
    try {
      await fs.writeFile(
        this.historyFile,
        JSON.stringify(this.history, null, 2),
      );
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  /**
   * Get a copy of the history
   * @returns Array of command strings
   */
  getHistory(): string[] {
    return [...this.history];
  }

  /**
   * Search history for commands containing the query
   * @param query - Search query
   * @returns Filtered array of commands
   */
  searchHistory(query: string): string[] {
    if (!query) return [];

    return this.history.filter(cmd =>
      cmd.toLowerCase().includes(query.toLowerCase()),
    );
  }
}

export default HistoryManager;