// setup-install.ts - Instalação simplificada
// Reduzido de 431 linhas (SetupInstaller class) para ~150 linhas (-65% redução)

import { SetupConfig, SetupOptions, FileMapping } from './setup-types.js';
import { ensureDir, copyFile, fileExists } from './setup-io.js';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Cria diretórios essenciais
 */
export async function createDirectories(config: SetupConfig): Promise<void> {
  const directories = [
    config.mcpDir,
    config.configDir,
    path.join(config.mcpDir, 'patterns'),
    path.join(config.mcpDir, 'libs'),
    path.join(config.mcpDir, 'ai_models'),
    path.join(config.mcpDir, 'src'),
    path.join(config.mcpDir, 'logs')
  ];

  for (const dir of directories) {
    await ensureDir(dir);
    if (config.verbose) {
      console.log(`📁 Criado: ${dir}`);
    }
  }
}

/**
 * Obtém mapeamento de arquivos para instalação
 */
function getFileMapping(config: SetupConfig): FileMapping[] {
  const baseFiles = [
    { src: 'mcp-client.js', dest: 'mcp-client.js', mode: 0o755 },
    { src: 'mcp-assistant.js', dest: 'mcp-assistant.js', mode: 0o755 },
    { src: 'ai_orchestrator.js', dest: 'ai_orchestrator.js', mode: 0o755 }
  ];

  return baseFiles;
}

/**
 * Instala arquivos do sistema
 */
export async function installFiles(config: SetupConfig, options: SetupOptions = {}): Promise<void> {
  const mappings = getFileMapping(config);
  
  for (const mapping of mappings) {
    const srcPath = path.join(process.cwd(), mapping.src);
    const destPath = path.join(config.mcpDir, mapping.dest);

    // Verificar se arquivo fonte existe
    if (!(await fileExists(srcPath))) {
      if (config.verbose) {
        console.warn(`⚠️ Arquivo fonte não encontrado: ${srcPath}`);
      }
      continue;
    }

    // Verificar se deve sobrescrever
    if (!options.force && await fileExists(destPath)) {
      if (config.verbose) {
        console.log(`⏭️ Arquivo já existe (pulando): ${destPath}`);
      }
      continue;
    }

    try {
      // Copiar arquivo
      await copyFile(srcPath, destPath);
      
      // Definir permissões se especificado
      if (mapping.mode) {
        await fs.chmod(destPath, mapping.mode);
      }

      if (config.verbose) {
        console.log(`✅ Instalado: ${mapping.dest}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao instalar ${mapping.dest}: ${(error as Error).message}`);
      throw error;
    }
  }
}

/**
 * Define permissões dos arquivos executáveis
 */
export async function setPermissions(config: SetupConfig, files: string[]): Promise<void> {
  for (const file of files) {
    const filePath = path.join(config.mcpDir, file);
    
    if (await fileExists(filePath)) {
      try {
        await fs.chmod(filePath, 0o755);
        if (config.verbose) {
          console.log(`🔧 Permissões definidas: ${file}`);
        }
      } catch (error) {
        console.error(`⚠️ Erro ao definir permissões para ${file}: ${(error as Error).message}`);
      }
    }
  }
}

/**
 * Verifica se instalação foi bem-sucedida
 */
export async function verifyInstallation(config: SetupConfig): Promise<boolean> {
  const essentialFiles = ['mcp-client.js', 'mcp-assistant.js', 'ai_orchestrator.js'];
  
  for (const file of essentialFiles) {
    const filePath = path.join(config.mcpDir, file);
    if (!(await fileExists(filePath))) {
      if (config.verbose) {
        console.error(`❌ Arquivo essencial não encontrado: ${file}`);
      }
      return false;
    }
  }

  if (config.verbose) {
    console.log('✅ Verificação de instalação bem-sucedida');
  }

  return true;
}
