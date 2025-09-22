import fs from 'fs/promises';
import path from 'path';
import os from 'os';

class HistoryManager {
    constructor(maxHistory = 1000) {
        this.historyFile = path.join(os.homedir(), '.mcp-terminal', 'ink-history.json');
        this.maxHistory = maxHistory;
        this.history = [];
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Ensure directory exists
            const dir = path.dirname(this.historyFile);
            await fs.mkdir(dir, { recursive: true });

            // Load existing history
            try {
                const data = await fs.readFile(this.historyFile, 'utf8');
                this.history = JSON.parse(data);
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

    async addCommand(command) {
        if (!command || !command.trim()) return;

        // Avoid duplicate consecutive commands
        if (this.history.length > 0 && this.history[this.history.length - 1] === command) {
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

    async save() {
        try {
            await fs.writeFile(this.historyFile, JSON.stringify(this.history, null, 2));
        } catch (error) {
            console.error('Failed to save history:', error);
        }
    }

    getHistory() {
        return [...this.history];
    }

    searchHistory(query) {
        if (!query) return [];

        return this.history.filter(cmd =>
            cmd.toLowerCase().includes(query.toLowerCase())
        );
    }
}

export default HistoryManager;