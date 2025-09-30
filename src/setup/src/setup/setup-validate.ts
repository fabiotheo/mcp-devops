// setup-validate.ts - Validação simplificada
// Reduzido de 614 linhas (SetupValidator class) para ~80 linhas (-87% redução)

import { SetupConfig, TestResult } from './setup-types.js';
import { fileExists } from './setup-io.js';
import { executeCommand } from './setup-system.js';
import * as path from 'path';

/**
 * Valida se sistema atende requisitos básicos
 */
export async function validateSystem(config: SetupConfig): Promise<boolean> {
  const checks = [];

  // Verificar Node.js
  try {
    const nodeVersion = await executeCommand('node --version');
    checks.push(`✅ Node.js: ${nodeVersion}`);
  } catch {
    checks.push('❌ Node.js não encontrado');
    return false;
  }

  // Verificar npm/pnpm
  try {
    const npmVersion = await executeCommand('npm --version');
    checks.push(`✅ npm: ${npmVersion}`);
  } catch {
    checks.push('⚠️ npm não encontrado');
  }

  if (config.verbose) {
    checks.forEach(check => console.log(check));
  }

  return true;
}

/**
 * Valida instalação
 */
export async function validateInstallation(config: SetupConfig): Promise<boolean> {
  const essentialFiles = [
    'mcp-client.js',
    'mcp-assistant.js', 
    'ai_orchestrator.js'
  ];

  let allValid = true;

  for (const file of essentialFiles) {
    const filePath = path.join(config.mcpDir, file);
    const exists = await fileExists(filePath);
    
    if (exists) {
      if (config.verbose) console.log(`✅ ${file}`);
    } else {
      console.error(`❌ Arquivo não encontrado: ${file}`);
      allValid = false;
    }
  }

  return allValid;
}

/**
 * Executa testes básicos
 */
export async function runBasicTests(config: SetupConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Teste 1: Validação do sistema
  try {
    const systemValid = await validateSystem(config);
    results.push({
      name: 'Sistema',
      passed: systemValid,
      error: systemValid ? undefined : 'Requisitos do sistema não atendidos'
    });
  } catch (error) {
    results.push({
      name: 'Sistema',
      passed: false,
      error: (error as Error).message
    });
  }

  // Teste 2: Validação da instalação
  try {
    const installValid = await validateInstallation(config);
    results.push({
      name: 'Instalação',
      passed: installValid,
      error: installValid ? undefined : 'Arquivos essenciais não encontrados'
    });
  } catch (error) {
    results.push({
      name: 'Instalação',
      passed: false,
      error: (error as Error).message
    });
  }

  return results;
}
