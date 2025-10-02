/**
 * Session Persistence Manager
 * Manages saving and loading chat sessions to disk
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';

interface SessionPersistenceOptions {
  sessionDir?: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface SessionData {
  name: string;
  timestamp: number;
  context: Message[];
  messageCount: number;
}

interface SessionInfo {
  name: string;
  messageCount: number;
  lastModified: number;
  created: number;
}

interface ContextManager {
  getContext(): Message[];
}

type ExportFormat = 'json' | 'markdown';

class SessionPersistence {
  private sessionDir: string;
  private autoSaveInterval: number | null;
  private autoSaveTimer: NodeJS.Timeout | null;

  constructor(sessionDir?: string) {
    this.sessionDir =
      sessionDir || path.join(os.homedir(), '.mcp-terminal', 'sessions');
    this.autoSaveInterval = null;
    this.autoSaveTimer = null;
  }

  public async initialize(): Promise<void> {
    // Ensure session directory exists
    if (!existsSync(this.sessionDir)) {
      await fs.mkdir(this.sessionDir, { recursive: true });
    }
  }

  public async save(sessionName: string, context: Message[]): Promise<string> {
    await this.initialize();

    const sessionPath = path.join(this.sessionDir, `${sessionName}.json`);
    const sessionData: SessionData = {
      name: sessionName,
      timestamp: Date.now(),
      context: context,
      messageCount: context.length,
    };

    await fs.writeFile(sessionPath, JSON.stringify(sessionData, null, 2));
    return sessionPath;
  }

  public async load(sessionName: string): Promise<Message[]> {
    const sessionPath = path.join(this.sessionDir, `${sessionName}.json`);

    if (!existsSync(sessionPath)) {
      throw new Error(`Session '${sessionName}' not found`);
    }

    const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8')) as SessionData;
    return sessionData.context || [];
  }

  public async list(): Promise<string[]> {
    await this.initialize();

    const files = await fs.readdir(this.sessionDir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }

  public async getInfo(sessionName: string): Promise<SessionInfo | null> {
    const sessionPath = path.join(this.sessionDir, `${sessionName}.json`);

    if (!existsSync(sessionPath)) {
      return null;
    }

    const stats = await fs.stat(sessionPath);
    const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8')) as SessionData;

    return {
      name: sessionName,
      messageCount:
        sessionData.messageCount || sessionData.context?.length || 0,
      lastModified: stats.mtime.getTime(),
      created: sessionData.timestamp || stats.birthtime.getTime(),
    };
  }

  public async delete(sessionName: string): Promise<boolean> {
    const sessionPath = path.join(this.sessionDir, `${sessionName}.json`);

    if (existsSync(sessionPath)) {
      await fs.unlink(sessionPath);
      return true;
    }

    return false;
  }

  public enableAutoSave(
    sessionName: string,
    contextManager: ContextManager,
    interval: number = 300000
  ): void {
    // Clear any existing auto-save
    this.stopAutoSave();

    // Set up new auto-save
    this.autoSaveInterval = interval;
    this.autoSaveTimer = setInterval(async () => {
      try {
        await this.save(sessionName, contextManager.getContext());
        // Silent save - don't log to avoid cluttering output
      } catch (error) {
        console.error(`Auto-save failed: ${(error as Error).message}`);
      }
    }, interval);
  }

  public stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  public async exportSession(
    sessionName: string,
    format: ExportFormat = 'json'
  ): Promise<string> {
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

  public async mergeSession(
    sessionName: string,
    otherSessionName: string
  ): Promise<string> {
    const session1 = await this.load(sessionName);
    const session2 = await this.load(otherSessionName);

    const merged = [...session1, ...session2];
    const mergedName = `${sessionName}_merged_${Date.now()}`;

    await this.save(mergedName, merged);
    return mergedName;
  }
}

export default SessionPersistence;
