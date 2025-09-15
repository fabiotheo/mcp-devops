/**
 * Session Persistence Manager
 * Manages saving and loading chat sessions to disk
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';

class SessionPersistence {
    constructor(sessionDir) {
        this.sessionDir = sessionDir || path.join(os.homedir(), '.mcp-terminal', 'sessions');
        this.autoSaveInterval = null;
        this.autoSaveTimer = null;
    }

    async initialize() {
        // Ensure session directory exists
        if (!existsSync(this.sessionDir)) {
            await fs.mkdir(this.sessionDir, { recursive: true });
        }
    }

    async save(sessionName, context) {
        await this.initialize();

        const sessionPath = path.join(this.sessionDir, `${sessionName}.json`);
        const sessionData = {
            name: sessionName,
            timestamp: Date.now(),
            context: context,
            messageCount: context.length
        };

        await fs.writeFile(sessionPath, JSON.stringify(sessionData, null, 2));
        return sessionPath;
    }

    async load(sessionName) {
        const sessionPath = path.join(this.sessionDir, `${sessionName}.json`);

        if (!existsSync(sessionPath)) {
            throw new Error(`Session '${sessionName}' not found`);
        }

        const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
        return sessionData.context || [];
    }

    async list() {
        await this.initialize();

        const files = await fs.readdir(this.sessionDir);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    }

    async getInfo(sessionName) {
        const sessionPath = path.join(this.sessionDir, `${sessionName}.json`);

        if (!existsSync(sessionPath)) {
            return null;
        }

        const stats = await fs.stat(sessionPath);
        const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8'));

        return {
            name: sessionName,
            messageCount: sessionData.messageCount || sessionData.context?.length || 0,
            lastModified: stats.mtime.getTime(),
            created: sessionData.timestamp || stats.birthtime.getTime()
        };
    }

    async delete(sessionName) {
        const sessionPath = path.join(this.sessionDir, `${sessionName}.json`);

        if (existsSync(sessionPath)) {
            await fs.unlink(sessionPath);
            return true;
        }

        return false;
    }

    enableAutoSave(sessionName, contextManager, interval = 300000) {
        // Clear any existing auto-save
        this.stopAutoSave();

        // Set up new auto-save
        this.autoSaveInterval = interval;
        this.autoSaveTimer = setInterval(async () => {
            try {
                await this.save(sessionName, contextManager.getContext());
                // Silent save - don't log to avoid cluttering output
            } catch (error) {
                console.error(`Auto-save failed: ${error.message}`);
            }
        }, interval);
    }

    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    async exportSession(sessionName, format = 'json') {
        const sessionData = await this.load(sessionName);

        if (format === 'markdown') {
            let markdown = `# Chat Session: ${sessionName}\n\n`;
            markdown += `Generated: ${new Date().toISOString()}\n\n`;
            markdown += '---\n\n';

            for (const msg of sessionData) {
                if (msg.role === 'user') {
                    markdown += `### User\n${msg.content}\n\n`;
                } else if (msg.role === 'assistant') {
                    markdown += `### Assistant\n${msg.content}\n\n`;
                }
                markdown += '---\n\n';
            }

            return markdown;
        }

        return JSON.stringify(sessionData, null, 2);
    }

    async mergeSession(sessionName, otherSessionName) {
        const session1 = await this.load(sessionName);
        const session2 = await this.load(otherSessionName);

        const merged = [...session1, ...session2];
        const mergedName = `${sessionName}_merged_${Date.now()}`;

        await this.save(mergedName, merged);
        return mergedName;
    }
}

export default SessionPersistence;