/**
 * Special Commands Handler Utility
 *
 * Handles special slash commands like /help, /clear, /history, etc.
 * Refactored to be a pure function that returns actions.
 * Extracted from mcp-ink-cli.mjs as part of modularization effort.
 */

import os from 'os';
import fs from 'fs';
import path from 'path';

// Type definitions for command data
interface CommandData {
  commandHistory?: string[];
  status?: string;
  hasOrchestrator?: boolean;
  hasPatternMatcher?: boolean;
  isDebug?: boolean;
  hasConfig?: boolean;
  userName?: string;
  sessionStartTime?: number;
  lastCommandTime?: number;
  commandCount?: number;
  successCount?: number;
  failedCount?: number;
}

// Type definitions for actions
interface ShowHelpAction {
  type: 'SHOW_HELP';
  payload: {
    text: string;
  };
}

interface ClearHistoryAction {
  type: 'CLEAR_HISTORY';
}

interface ShowHistoryAction {
  type: 'SHOW_HISTORY';
  payload: {
    commands: string[];
  };
}

interface ShowStatusAction {
  type: 'SHOW_STATUS';
  payload: {
    status: string;
    aiBackend: string;
    patternMatcher: string;
    debugMode: string;
    config: string;
  };
}

interface ToggleDebugAction {
  type: 'TOGGLE_DEBUG';
}

interface ExitApplicationAction {
  type: 'EXIT_APPLICATION';
}

interface UnknownCommandAction {
  type: 'UNKNOWN_COMMAND';
  payload: {
    command: string;
  };
}

type SpecialCommandAction =
  | ShowHelpAction
  | ClearHistoryAction
  | ShowHistoryAction
  | ShowStatusAction
  | ToggleDebugAction
  | ExitApplicationAction
  | UnknownCommandAction;

/**
 * Parse special slash commands and return actions
 * Pure function - no side effects
 *
 * @param {string} command - The command to handle (including the /)
 * @param {Object} data - Read-only data for command processing
 * @param {Array} data.commandHistory - Command history array (read-only)
 * @param {string} data.status - Current status (read-only)
 * @param {boolean} data.hasOrchestrator - Whether orchestrator is available
 * @param {boolean} data.hasPatternMatcher - Whether pattern matcher is available
 * @param {boolean} data.isDebug - Debug mode flag
 * @param {boolean} data.hasConfig - Whether config is loaded
 * @returns {Object|null} Action object or null if not a special command
 */
export function parseSpecialCommand(command: string, data: CommandData = {}): SpecialCommandAction | null {
  const {
    commandHistory = [],
    status = 'ready',
    hasOrchestrator = false,
    hasPatternMatcher = false,
    isDebug = false,
    hasConfig = false
  } = data;

  if (!command.startsWith('/')) {
    return null;
  }

  const cmd = command.slice(1).toLowerCase();

  switch (cmd) {
    case 'help':
      return {
        type: 'SHOW_HELP',
        payload: {
          text: `MCP Terminal Assistant - Commands:
/help     - Show this help
/clear    - Clear screen
/history  - Show command history
/status   - Show system status
/debug    - Toggle debug mode
/exit     - Exit application

For Linux/Unix help, just type your question!`
        }
      };

    case 'clear':
      return {
        type: 'CLEAR_HISTORY'
      };

    case 'history':
      return {
        type: 'SHOW_HISTORY',
        payload: {
          commands: commandHistory.slice(-20)
        }
      };

    case 'status':
      return {
        type: 'SHOW_STATUS',
        payload: {
          status,
          aiBackend: hasOrchestrator ? 'Connected' : 'Disconnected',
          patternMatcher: hasPatternMatcher ? 'Loaded' : 'Not loaded',
          debugMode: isDebug ? 'ON' : 'OFF',
          config: hasConfig ? 'Loaded' : 'Default'
        }
      };

    case 'debug':
      return {
        type: 'TOGGLE_DEBUG'
      };

    case 'exit':
    case 'quit':
      return {
        type: 'EXIT_APPLICATION'
      };

    default:
      return {
        type: 'UNKNOWN_COMMAND',
        payload: {
          command: cmd
        }
      };
  }
}

/**
 * Format status message from status payload
 *
 * @param {Object} statusPayload - Status information
 * @returns {string} Formatted status message
 */
export function formatStatusMessage(statusPayload: ShowStatusAction['payload']): string {
  return `Status: ${statusPayload.status}
AI Backend: ${statusPayload.aiBackend}
Pattern Matcher: ${statusPayload.patternMatcher}
Debug Mode: ${statusPayload.debugMode}
Config: ${statusPayload.config}`;
}

/**
 * Format history message from history payload
 *
 * @param {Array} commands - Command history
 * @returns {string} Formatted history message
 */
export function formatHistoryMessage(commands: string[]): string {
  return commands.join('\n') || 'No command history';
}

/**
 * Get system CPU usage percentage
 * @returns {number} CPU usage percentage (0-100)
 */
function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);
  return Math.max(0, Math.min(100, usage));
}

/**
 * Get system memory usage
 * @returns {object} Memory usage info
 */
function getMemoryUsage(): { used: number; total: number; percentage: number } {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const percentage = (usedMem / totalMem) * 100;

  return {
    used: usedMem,
    total: totalMem,
    percentage: Math.round(percentage)
  };
}

/**
 * Format bytes to human-readable format
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string (e.g., "1.2 GB")
 */
function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Create a progress bar with percentage
 * @param {number} percentage - Percentage (0-100)
 * @param {number} width - Width of the bar (default: 15)
 * @returns {string} Progress bar string
 */
function createProgressBar(percentage: number, width: number = 15): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Format uptime duration
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "15m 32s")
 */
function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Get package version
 * @returns {string} Version string
 */
function getVersion(): string {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/**
 * Format enhanced status message with system metrics
 * @param {Object} data - Status data
 * @returns {string} Formatted status display
 */
export function formatEnhancedStatusMessage(data: CommandData): string {
  const cpuUsage = getCpuUsage();
  const memUsage = getMemoryUsage();
  const loadAvg = os.loadavg();
  const version = getVersion();

  // Session info
  const sessionDuration = data.sessionStartTime
    ? Date.now() - data.sessionStartTime
    : 0;
  const lastActivity = data.lastCommandTime
    ? Date.now() - data.lastCommandTime
    : 0;

  // Calculate success rate
  const totalCommands = data.commandCount || 0;
  const successCommands = data.successCount || 0;
  const successRate = totalCommands > 0
    ? Math.round((successCommands / totalCommands) * 100)
    : 0;

  // AI status
  const aiStatus = data.hasOrchestrator ? '✓ Connected' : '✗ Disconnected';

  // Format CPU usage with proper padding
  const cpuText = cpuUsage.toString().padStart(2);
  const cpuBar = createProgressBar(cpuUsage);

  // Format memory usage with proper padding
  const memUsed = formatBytes(memUsage.used);
  const memTotal = formatBytes(memUsage.total);
  const memBar = createProgressBar(memUsage.percentage);

  // Format success rate with proper padding
  const successText = successRate.toString().padStart(3);
  const successBar = createProgressBar(successRate);

  // Format commands count
  const commandsText = totalCommands.toString().padStart(3);
  const failedText = (data.failedCount || 0).toString().padStart(3);

  // Format status indicators
  const patternStatus = data.hasPatternMatcher ? '✓ Active  ' : '✗ Inactive';
  const debugStatus = data.isDebug ? 'ON ' : 'OFF';
  const ttyStatus = process.stdout.isTTY ? 'yes' : 'no ';
  const dbStatus = data.hasConfig ? '✓ Turso' : '✗ None';

  // Build the status display - single column layout
  const lines = [
    '╭─────────────────────────────────────────────────────────────╮',
    '│ 📊 MCP Terminal Assistant - System Status                   │',
    '╰─────────────────────────────────────────────────────────────╯',
    '',
    '👤 User & Session',
    `   User:        ${data.userName || 'default'}`,
    `   Session:     ${formatDuration(sessionDuration)}`,
    `   Last active: ${lastActivity > 0 ? formatDuration(lastActivity) + ' ago' : 'now'}`,
    '',
    '🤖 AI Service',
    `   Model:       Claude Sonnet 4.5`,
    `   Status:      ${aiStatus}`,
    `   Version:     ${version}`,
    '',
    '⚡ Performance',
    `   Commands:    ${commandsText}`,
    `   Success:     ${successText}% ${successBar}`,
    `   Failed:      ${failedText}`,
    '',
    '💾 Storage',
    `   Database:    ${dbStatus}`,
    `   Records:     ${commandsText}`,
    '',
    '🧠 System Resources',
    `   CPU:         ${cpuText}% ${cpuBar}`,
    `   Memory:      ${memUsed} / ${memTotal} ${memBar} (${memUsage.percentage}%)`,
    `   Load avg:    ${loadAvg.map(l => l.toFixed(2)).join(', ')}`,
    '',
    '⚙️  Configuration',
    `   Pattern:     ${patternStatus}`,
    `   Debug:       ${debugStatus}`,
    `   TTY:         ${ttyStatus}`,
    '',
    '╰─────────────────────────────────────────────────────────────╯'
  ];

  return lines.join('\n');
}

// Legacy context interface for backward compatibility
interface LegacyContext {
  setResponse: (response: string) => void;
  setHistory: (updater: (prev: string[]) => string[]) => void;
  commandHistory: string[];
  status: string;
  orchestrator?: { current: unknown };
  patternMatcher?: { current: unknown };
  isDebug: boolean;
  config?: unknown;
  exit: () => void;
  formatResponse: (text: string, isDebug: boolean) => string;
}

// Legacy function for backward compatibility (deprecated)
export function handleSpecialCommand(command: string, context: LegacyContext): boolean {
  console.warn('[Deprecated] handleSpecialCommand is deprecated. Use parseSpecialCommand instead.');

  const {
    setResponse,
    setHistory,
    commandHistory,
    status,
    orchestrator,
    patternMatcher,
    isDebug,
    config,
    exit,
    formatResponse
  } = context;

  const action = parseSpecialCommand(command, {
    commandHistory,
    status,
    hasOrchestrator: !!orchestrator?.current,
    hasPatternMatcher: !!patternMatcher?.current,
    isDebug,
    hasConfig: !!config
  });

  if (!action) {
    return false;
  }

  // Apply the action (legacy behavior)
  switch (action.type) {
    case 'SHOW_HELP':
      setResponse((action as ShowHelpAction).payload.text);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse((action as ShowHelpAction).payload.text, isDebug)]);
      return true;

    case 'CLEAR_HISTORY':
      setHistory(() => []);
      setResponse('');
      return true;

    case 'SHOW_HISTORY':
      const historyText = formatHistoryMessage((action as ShowHistoryAction).payload.commands);
      setResponse(historyText);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(historyText, isDebug)]);
      return true;

    case 'SHOW_STATUS':
      const statusText = formatStatusMessage((action as ShowStatusAction).payload);
      setResponse(statusText);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(statusText, isDebug)]);
      return true;

    case 'EXIT_APPLICATION':
      exit();
      return true;

    case 'UNKNOWN_COMMAND':
      const errorText = `Unknown command: /${(action as UnknownCommandAction).payload.command}`;
      setResponse(errorText);
      setHistory(prev => [...prev, `❯ ${command}`, formatResponse(errorText, isDebug)]);
      return true;

    default:
      return false;
  }
}

// All functions are already exported as named exports above