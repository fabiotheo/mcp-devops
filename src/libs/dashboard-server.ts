#!/usr/bin/env node

/**
 * Dashboard Server - Real-time web interface for MCP Terminal Assistant
 * Part of Phase 3: Intelligence and Visualization
 */

import express, { Application, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import LocalCache from './local-cache.js';
import TursoHistoryClient from './turso-client.js';
import SyncManager from './sync-manager.js';
import fs from 'fs/promises';
import os from 'os';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Type definitions
interface DashboardConfig {
  port?: number;
  host?: string;
  debug?: boolean;
  updateInterval?: number;
  [key: string]: unknown;
}

interface DashboardStats {
  totalCommands: number;
  syncedCommands: number;
  pendingCommands: number;
  activeMachines: number;
  activeUsers: number;
  last24hActivity: number[];
}

interface HistoryItem {
  id?: string;
  command: string;
  response?: string | null;
  timestamp: number;
  machine_id?: string;
  user_id?: string;
  sync_status?: string;
  status?: string;
}

interface CacheStats {
  total: number;
  synced: number;
  pending: number;
  queue_size: number;
}

interface OverviewStats {
  totalCommands: number;
  syncedCommands: number;
  pendingCommands: number;
  queueSize: number;
  activeMachines: number;
  activeUsers: number;
  last24hActivity: number[];
  lastSync: unknown;
  recentCommands: Array<{
    command: string;
    timestamp: number;
    status?: string;
  }>;
}

interface CommandPattern {
  command: string;
  count: number;
}

interface HourlyActivity {
  hour: string;
  count: number;
}

interface SyncResult {
  success: boolean;
  error?: string;
  synced?: number;
  pending?: number;
}

interface SocketOptions {
  limit?: number;
  offset?: number;
}

class DashboardServer {
  private config: DashboardConfig;
  private app: Application;
  private server: HTTPServer;
  private io: Server;
  private localCache: LocalCache | null;
  private tursoClient: TursoHistoryClient | null;
  private updateTimer: NodeJS.Timeout | null;
  private connectedClients: number;
  private stats: DashboardStats;

  constructor(config: DashboardConfig = {}) {
    this.config = {
      port: config.port || 3000,
      host: config.host || 'localhost',
      debug: config.debug || false,
      updateInterval: config.updateInterval || 5000, // 5 seconds
      ...config,
    };

    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.localCache = null;
    this.tursoClient = null;
    this.updateTimer = null;
    this.connectedClients = 0;
    this.stats = {
      totalCommands: 0,
      syncedCommands: 0,
      pendingCommands: 0,
      activeMachines: 0,
      activeUsers: 0,
      last24hActivity: [],
    };
  }

  async initialize() {
    try {
      // Initialize LocalCache
      this.localCache = new LocalCache({ debug: this.config.debug });
      await this.localCache.initialize();

      // Try to initialize Turso
      try {
        const configPath = path.join(
          os.homedir(),
          '.mcp-terminal',
          'config.json',
        );
        const tursoConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
        this.tursoClient = new TursoHistoryClient(tursoConfig);
        await this.tursoClient.initialize();
        console.log(chalk.green('✅ Turso client connected'));
      } catch (error) {
        console.log(
          chalk.yellow('⚠️  Turso not available, using local cache only'),
        );
      }

      // Setup routes
      this.setupRoutes();

      // Setup WebSocket handlers
      this.setupWebSocket();

      // Start server
      this.server.listen(this.config.port, this.config.host, () => {
        console.log(
          chalk.cyan.bold(
            `\n🚀 Dashboard Server running at http://${this.config.host}:${this.config.port}\n`,
          ),
        );
      });

      // Start stats updater
      this.startStatsUpdater();

      return true;
    } catch (error) {
      console.error(
        chalk.red('❌ Failed to initialize dashboard server:'),
        error,
      );
      return false;
    }
  }

  setupRoutes() {
    // Middleware
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '..', 'dashboard')));

    // API Routes
    this.app.get('/api/stats/overview', async (req: Request, res: Response) => {
      const stats = await this.getOverviewStats();
      res.json(stats);
    });

    this.app.get('/api/history', async (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const history = await this.getHistory(limit, offset);
      res.json(history);
    });

    this.app.get('/api/history/search', async (req: Request, res: Response) => {
      const query = (req.query.q as string) || '';
      const results = await this.searchHistory(query);
      res.json(results);
    });

    this.app.get('/api/machines', async (req: Request, res: Response) => {
      const machines = await this.getMachines();
      res.json(machines);
    });

    this.app.get('/api/patterns', async (req: Request, res: Response) => {
      const patterns = await this.getPatterns();
      res.json(patterns);
    });

    this.app.get('/api/activity/hourly', async (req: Request, res: Response) => {
      const activity = await this.getHourlyActivity();
      res.json(activity);
    });

    this.app.get('/api/top-commands', async (req: Request, res: Response) => {
      const days = parseInt(req.query.days as string) || 7;
      const topCommands = await this.getTopCommands(days);
      res.json(topCommands);
    });

    this.app.post('/api/sync/force', async (req: Request, res: Response) => {
      const result = await this.forceSync();
      res.json(result);
    });

    // Health check
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        connectedClients: this.connectedClients,
        cache: this.localCache ? 'connected' : 'disconnected',
        turso: this.tursoClient ? 'connected' : 'disconnected',
      });
    });
  }

  setupWebSocket(): void {
    this.io.on('connection', (socket: Socket) => {
      this.connectedClients++;
      console.log(
        chalk.gray(`[WS] Client connected (${this.connectedClients} total)`),
      );

      // Send initial stats
      this.sendStats(socket);

      // Handle client requests
      socket.on('request-stats', () => {
        this.sendStats(socket);
      });

      socket.on('request-history', async (options: SocketOptions) => {
        const history = await this.getHistory(options?.limit || 50);
        socket.emit('history-update', history);
      });

      socket.on('search', async (query: string) => {
        const results = await this.searchHistory(query);
        socket.emit('search-results', results);
      });

      socket.on('disconnect', () => {
        this.connectedClients--;
        console.log(
          chalk.gray(
            `[WS] Client disconnected (${this.connectedClients} total)`,
          ),
        );
      });
    });
  }

  async sendStats(socket: Socket | null = null): Promise<void> {
    const stats = await this.getOverviewStats();

    if (socket) {
      socket.emit('stats-update', stats);
    } else {
      // Broadcast to all connected clients
      this.io.emit('stats-update', stats);
    }
  }

  async getOverviewStats(): Promise<OverviewStats> {
    const cacheStats = this.localCache!.getStats() as CacheStats;
    const history = this.localCache!.getHistory({ limit: 100 }) as HistoryItem[];

    // Calculate 24h activity
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const hourlyActivity = new Array(24).fill(0);

    history.forEach(item => {
      if (item.timestamp > last24h) {
        const hourAgo = Math.floor((now - item.timestamp) / (60 * 60 * 1000));
        if (hourAgo < 24) {
          hourlyActivity[23 - hourAgo]++;
        }
      }
    });

    // Get unique machines and users
    const machines = new Set(history.map(h => h.machine_id).filter(Boolean));
    const users = new Set(history.map(h => h.user_id).filter(Boolean));

    return {
      totalCommands: cacheStats.total,
      syncedCommands: cacheStats.synced,
      pendingCommands: cacheStats.pending,
      queueSize: cacheStats.queue_size,
      activeMachines: machines.size,
      activeUsers: users.size,
      last24hActivity: hourlyActivity,
      lastSync: this.localCache!.getMetadata('last_sync_time'),
      recentCommands: history.slice(0, 5).map(h => ({
        command: h.command,
        timestamp: h.timestamp,
        status: h.sync_status,
      })),
    };
  }

  async getHistory(limit: number = 100, offset: number = 0): Promise<Array<Partial<HistoryItem>>> {
    const history = this.localCache!.getHistory({ limit, offset }) as HistoryItem[];
    return history.map(item => ({
      id: item.id,
      command: item.command,
      response: item.response?.substring(0, 200),
      timestamp: item.timestamp,
      machine_id: item.machine_id,
      user_id: item.user_id,
      sync_status: item.sync_status,
      status: item.status,
    }));
  }

  async searchHistory(query: string): Promise<Array<Partial<HistoryItem>>> {
    if (!query) return [];

    const allHistory = this.localCache!.getHistory({ limit: 1000 }) as HistoryItem[];
    const results = allHistory.filter(
      item =>
        item.command.toLowerCase().includes(query.toLowerCase()) ||
        (item.response &&
          item.response.toLowerCase().includes(query.toLowerCase())),
    );

    return results.slice(0, 50).map(item => ({
      id: item.id,
      command: item.command,
      response: item.response?.substring(0, 200),
      timestamp: item.timestamp,
    }));
  }

  async getMachines(): Promise<unknown[]> {
    if (this.tursoClient) {
      try {
        const result = await this.tursoClient.client.execute(
          'SELECT * FROM machines ORDER BY last_seen DESC',
        );
        return result.rows;
      } catch (error) {
        console.error(chalk.red('[Dashboard] Error getting machines:'), error);
      }
    }
    return [];
  }

  async getPatterns(): Promise<CommandPattern[]> {
    const history = this.localCache!.getHistory({ limit: 500 }) as HistoryItem[];
    const patterns: Record<string, number> = {};

    // Count command patterns
    history.forEach(item => {
      const baseCommand = item.command.split(' ')[0];
      patterns[baseCommand] = (patterns[baseCommand] || 0) + 1;
    });

    // Sort by frequency
    return Object.entries(patterns)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 20)
      .map(([command, count]) => ({ command, count }));
  }

  async getHourlyActivity(): Promise<HourlyActivity[]> {
    const history = this.localCache!.getHistory({ limit: 1000 }) as HistoryItem[];
    const hourlyStats = new Array(24).fill(0);

    history.forEach(item => {
      const hour = new Date(item.timestamp).getHours();
      hourlyStats[hour]++;
    });

    return hourlyStats.map((count, hour) => ({
      hour: `${hour}:00`,
      count,
    }));
  }

  async getTopCommands(days: number = 7): Promise<CommandPattern[]> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const history = this.localCache!.getHistory({ limit: 1000 }) as HistoryItem[];
    const commands: Record<string, number> = {};

    history
      .filter(item => item.timestamp > since)
      .forEach(item => {
        const cmd = item.command.substring(0, 50);
        commands[cmd] = (commands[cmd] || 0) + 1;
      });

    return Object.entries(commands)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([command, count]) => ({ command, count }));
  }

  async forceSync(): Promise<SyncResult> {
    try {
      if (!this.tursoClient) {
        return { success: false, error: 'Turso not configured' };
      }

      const syncManager = new SyncManager({ debug: this.config.debug });
      await syncManager.initialize(this.tursoClient);

      await syncManager.forceSync();
      await syncManager.close();

      // Broadcast update to all clients
      await this.sendStats();

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  startStatsUpdater(): void {
    // Send stats updates periodically
    this.updateTimer = setInterval(() => {
      if (this.connectedClients > 0) {
        this.sendStats();
      }
    }, this.config.updateInterval as number);
  }

  async close(): Promise<void> {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    if (this.localCache) {
      this.localCache.close();
    }

    if (this.tursoClient) {
      await this.tursoClient.close();
    }

    this.server.close();
  }
}

// Main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new DashboardServer({
    debug: process.env.DEBUG === '1',
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  });

  server.initialize().catch(error => {
    console.error(chalk.red('Failed to start dashboard server:'), error);
    process.exit(1);
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log(chalk.gray('\nShutting down dashboard server...'));
    await server.close();
    process.exit(0);
  });
}

export default DashboardServer;
