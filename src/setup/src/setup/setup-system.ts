// setup-system.ts - Sistema simplificado essencial
// Reduzido de 33 funções (17,036 bytes) para 4 funções essenciais (~200 linhas)

import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Obtém diretório home do usuário
 */
export function getUserHome(): string {
  return os.homedir();
}

/**
 * Detecta shell atual
 */
export function detectShell(): string {
  const shell = process.env.SHELL || '/bin/bash';
  const shellName = path.basename(shell);
  
  // Normalizar para shells conhecidos
  if (shellName.includes('zsh')) return 'zsh';
  if (shellName.includes('bash')) return 'bash';
  if (shellName.includes('fish')) return 'fish';
  
  return 'bash'; // fallback padrão
}

/**
 * Detecta plataforma do sistema
 */
export function detectPlatform(): string {
  return os.platform();
}

/**
 * Executa comando do sistema
 */
export async function executeCommand(command: string): Promise<string> {
  try {
    const { stdout } = await execAsync(command);
    return stdout.trim();
  } catch (error) {
    throw new Error(`Erro ao executar comando '${command}': ${(error as Error).message}`);
  }
}
