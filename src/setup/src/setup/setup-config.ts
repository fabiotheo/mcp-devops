// setup-config.ts - Configuração simplificada
// Reduzido de 361 linhas (ConfigManager class) para ~100 linhas (-72% redução)

import { SetupConfig, APIConfig } from './setup-types.js';
import { readFile, writeFile, fileExists, ensureDir } from './setup-io.js';
import * as path from 'path';

/**
 * Carrega configuração da API
 */
export async function loadConfig(config: SetupConfig): Promise<APIConfig> {
  const configPath = path.join(config.configDir, 'config.json');

  if (!(await fileExists(configPath))) {
    throw new Error('Arquivo de configuração não encontrado');
  }

  try {
    const content = await readFile(configPath);
    const apiConfig = JSON.parse(content) as APIConfig;
    
    // Validação básica
    if (!apiConfig.ai_provider) {
      throw new Error('Configuração inválida: ai_provider é obrigatório');
    }

    return apiConfig;
  } catch (error) {
    throw new Error(`Erro ao carregar configuração: ${(error as Error).message}`);
  }
}

/**
 * Salva configuração da API
 */
export async function saveConfig(config: SetupConfig, apiConfig: APIConfig): Promise<void> {
  const configPath = path.join(config.configDir, 'config.json');

  // Garantir que diretório existe
  await ensureDir(config.configDir);

  try {
    const content = JSON.stringify(apiConfig, null, 2);
    await writeFile(configPath, content);
    
    if (config.verbose) {
      console.log(`✅ Configuração salva em: ${configPath}`);
    }
  } catch (error) {
    throw new Error(`Erro ao salvar configuração: ${(error as Error).message}`);
  }
}

/**
 * Migra configuração antiga (se necessário)
 */
export async function migrateConfig(config: SetupConfig): Promise<boolean> {
  const oldConfigPath = path.join(config.mcpDir, 'config.json');
  const newConfigPath = path.join(config.configDir, 'config.json');

  // Se nova config já existe, não precisa migrar
  if (await fileExists(newConfigPath)) {
    return false;
  }

  // Se config antiga existe, migrar
  if (await fileExists(oldConfigPath)) {
    try {
      const content = await readFile(oldConfigPath);
      await ensureDir(config.configDir);
      await writeFile(newConfigPath, content);
      
      if (config.verbose) {
        console.log(`✅ Configuração migrada de ${oldConfigPath} para ${newConfigPath}`);
      }
      
      return true;
    } catch (error) {
      if (config.verbose) {
        console.warn(`⚠️ Erro na migração: ${(error as Error).message}`);
      }
      return false;
    }
  }

  return false;
}

/**
 * Valida configuração da API
 */
export async function validateConfig(config: SetupConfig, apiConfig: APIConfig): Promise<boolean> {
  // Validações básicas
  if (!apiConfig.ai_provider) return false;
  if (!apiConfig.version) return false;
  
  // Validar se tem pelo menos uma chave de API
  const hasApiKey = !!(
    apiConfig.anthropic_api_key ||
    apiConfig.openai_api_key ||
    apiConfig.gemini_api_key
  );

  if (!hasApiKey && config.verbose) {
    console.warn('⚠️ Nenhuma chave de API configurada');
  }

  return hasApiKey;
}
