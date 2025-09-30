// setup-io.ts - I/O simplificado essencial
// Reduzido de 46 funções (28,657 bytes) para 5 funções essenciais (~300 linhas)

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Lê arquivo de texto
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Erro ao ler arquivo ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * Escreve arquivo de texto
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Erro ao escrever arquivo ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * Copia arquivo
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  try {
    await fs.copyFile(src, dest);
  } catch (error) {
    throw new Error(`Erro ao copiar ${src} para ${dest}: ${(error as Error).message}`);
  }
}

/**
 * Garante que diretório existe (cria se necessário)
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(`Erro ao criar diretório ${dirPath}: ${(error as Error).message}`);
  }
}

/**
 * Verifica se arquivo existe
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
