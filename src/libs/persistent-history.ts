#!/usr/bin/env node

/**
 * PersistentHistory - Sistema de histórico persistente entre sessões
 * Salva e carrega histórico de comandos do MCP Terminal Assistant
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

interface PersistentHistoryOptions {
  historyFile?: string;
  maxEntries?: number;
  deduplicate?: boolean;
}

interface HistoryData {
  version: string;
  timestamp: string;
  entries: string[];
}

interface TopCommand {
  command: string;
  count: number;
}

interface CommandStats {
  total: number;
  unique: number;
  topCommands: TopCommand[];
}

type ExportFormat = 'json' | 'text';

// Type guard for HistoryData
function isHistoryData(data: unknown): data is HistoryData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    'entries' in data &&
    (data as HistoryData).version === '1.0' &&
    Array.isArray((data as HistoryData).entries)
  );
}

export default class PersistentHistory {
  private historyFile: string;
  private maxEntries: number;
  private deduplicate: boolean;
  private history: string[];
  private currentIndex: number;

  constructor(options: PersistentHistoryOptions = {}) {
    this.historyFile =
      options.historyFile ||
      path.join(os.homedir(), '.mcp-terminal', 'history.json');
    this.maxEntries = options.maxEntries || 1000;
    this.deduplicate = options.deduplicate !== false;
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Inicializa o sistema de histórico
   */
  public async initialize(): Promise<void> {
    await this.ensureDirectory();
    await this.load();
  }

  /**
   * Garante que o diretório existe
   */
  private async ensureDirectory(): Promise<void> {
    const dir = path.dirname(this.historyFile);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Carrega histórico do arquivo
   */
  private async load(): Promise<void> {
    try {
      if (existsSync(this.historyFile)) {
        const data = await fs.readFile(this.historyFile, 'utf8');
        const parsed = JSON.parse(data) as HistoryData | string[];

        // Valida estrutura
        if (isHistoryData(parsed)) {
          this.history = parsed.entries.slice(-this.maxEntries);
        } else if (Array.isArray(parsed)) {
          // Formato legado
          this.history = parsed.slice(-this.maxEntries);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', (error as Error).message);
      this.history = [];
    }

    this.currentIndex = this.history.length;
  }

  /**
   * Salva histórico no arquivo
   */
  public async save(): Promise<void> {
    try {
      const data: HistoryData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        entries: this.history.slice(-this.maxEntries),
      };

      await fs.writeFile(
        this.historyFile,
        JSON.stringify(data, null, 2),
        'utf8',
      );
    } catch (error) {
      console.error('Erro ao salvar histórico:', (error as Error).message);
    }
  }

  /**
   * Adiciona comando ao histórico
   */
  public async add(command: string): Promise<void> {
    if (!command || command.trim() === '') return;

    const trimmed = command.trim();

    // Remove duplicatas se configurado
    if (this.deduplicate) {
      const index = this.history.indexOf(trimmed);
      if (index !== -1) {
        this.history.splice(index, 1);
      }
    }

    // Adiciona comando
    this.history.push(trimmed);

    // Limita tamanho
    if (this.history.length > this.maxEntries) {
      this.history = this.history.slice(-this.maxEntries);
    }

    this.currentIndex = this.history.length;

    // Salva automaticamente
    await this.save();
  }

  /**
   * Navega para comando anterior
   */
  public getPrevious(): string | null {
    if (this.history.length === 0) return null;

    if (this.currentIndex > 0) {
      this.currentIndex--;
    }

    return this.history[this.currentIndex] || null;
  }

  /**
   * Navega para próximo comando
   */
  public getNext(): string {
    if (this.history.length === 0) return '';

    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    } else {
      this.currentIndex = this.history.length;
      return '';
    }
  }

  /**
   * Reseta navegação
   */
  public resetNavigation(): void {
    this.currentIndex = this.history.length;
  }

  /**
   * Busca no histórico
   */
  public search(query: string): string[] {
    if (!query) return [];

    const lowerQuery = query.toLowerCase();
    return this.history
      .filter(cmd => cmd.toLowerCase().includes(lowerQuery))
      .reverse(); // Mais recentes primeiro
  }

  /**
   * Limpa histórico
   */
  public async clear(): Promise<void> {
    this.history = [];
    this.currentIndex = 0;
    await this.save();
  }

  /**
   * Obtém estatísticas
   */
  public getStats(): CommandStats {
    const uniqueCommands = new Set(this.history);
    const commandFrequency: Record<string, number> = {};

    this.history.forEach(cmd => {
      commandFrequency[cmd] = (commandFrequency[cmd] || 0) + 1;
    });

    const topCommands: TopCommand[] = Object.entries(commandFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([cmd, count]) => ({ command: cmd, count }));

    return {
      total: this.history.length,
      unique: uniqueCommands.size,
      topCommands,
    };
  }

  /**
   * Exporta histórico
   */
  public async export(format: ExportFormat = 'json'): Promise<string> {
    if (format === 'json') {
      return JSON.stringify(this.history, null, 2);
    } else if (format === 'text') {
      return this.history.join('\n');
    }

    throw new Error(`Formato não suportado: ${format}`);
  }

  /**
   * Importa histórico
   */
  public async import(data: string, format: ExportFormat = 'json'): Promise<void> {
    let newHistory: string[] = [];

    if (format === 'json') {
      newHistory = JSON.parse(data) as string[];
    } else if (format === 'text') {
      newHistory = data.split('\n').filter(line => line.trim());
    } else {
      throw new Error(`Formato não suportado: ${format}`);
    }

    if (!Array.isArray(newHistory)) {
      throw new Error('Dados inválidos para importação');
    }

    // Mescla com histórico existente
    this.history = [...this.history, ...newHistory].slice(-this.maxEntries);
    this.currentIndex = this.history.length;

    await this.save();
  }
}
