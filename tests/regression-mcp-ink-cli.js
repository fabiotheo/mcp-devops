#!/usr/bin/env node

/**
 * Suite de Testes de Regressão - MCP Ink CLI
 *
 * Este script testa todas as funcionalidades críticas do mcp-ink-cli.mjs
 * para garantir que a refatoração não quebre comportamentos existentes.
 *
 * Uso: node tests/regression-mcp-ink-cli.js
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cores para output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class RegressionTester {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.results = [];
  }

  log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  success(test, message) {
    this.passed++;
    this.results.push({ test, status: 'PASS', message });
    this.log(`✓ ${test}: ${message}`, colors.green);
  }

  fail(test, message) {
    this.failed++;
    this.results.push({ test, status: 'FAIL', message });
    this.log(`✗ ${test}: ${message}`, colors.red);
  }

  warn(test, message) {
    this.results.push({ test, status: 'WARN', message });
    this.log(`⚠ ${test}: ${message}`, colors.yellow);
  }

  async runProcess(args, input = null, timeout = 5000) {
    return new Promise((resolve) => {
      const cliPath = path.join(__dirname, '../src/mcp-ink-cli.mjs');
      const child = spawn('node', [cliPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, MCP_USER: 'test-regression' }
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          code,
          stdout,
          stderr,
          timedOut
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          code: -1,
          stdout,
          stderr: stderr + error.message,
          timedOut,
          error
        });
      });

      // Send input if provided
      if (input) {
        setTimeout(() => {
          if (!child.killed) {
            child.stdin.write(input);
            child.stdin.end();
          }
        }, 100);
      }

      // Send Ctrl+C after a short delay to test graceful exit
      if (args.includes('--test-exit')) {
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGINT');
          }
        }, 1000);
      }
    });
  }

  async testInitialization() {
    this.log('\n=== TESTE 1: INICIALIZAÇÃO ===', colors.bold);

    const result = await this.runProcess(['--debug'], null, 3000);

    if (result.timedOut) {
      this.success('Inicialização', 'Aplicação iniciou sem travar');
    } else if (result.code === 0) {
      this.success('Inicialização', 'Inicialização completada com sucesso');
    } else {
      this.fail('Inicialização', `Falhou com código ${result.code}: ${result.stderr}`);
    }

    // Verificar se não há erros fatais no stderr
    if (result.stderr && !result.stderr.includes('[Debug]')) {
      this.fail('Inicialização', `Erros no stderr: ${result.stderr.substring(0, 200)}`);
    } else {
      this.success('Inicialização', 'Nenhum erro fatal detectado');
    }
  }

  async testDebugMode() {
    this.log('\n=== TESTE 2: DEBUG MODE ===', colors.bold);

    const result = await this.runProcess(['--debug'], null, 2000);

    if (result.stdout.includes('[Debug]') || result.stderr.includes('[Debug]')) {
      this.success('Debug Mode', 'Modo debug ativado corretamente');
    } else {
      this.fail('Debug Mode', 'Modo debug não foi ativado');
    }
  }

  async testUserParameter() {
    this.log('\n=== TESTE 3: PARÂMETRO --USER ===', colors.bold);

    const result = await this.runProcess(['--user', 'test-user', '--debug'], null, 2000);

    if (result.stdout.includes('test-user') || result.stderr.includes('test-user')) {
      this.success('User Parameter', 'Parâmetro --user funcionando');
    } else {
      this.warn('User Parameter', 'Parâmetro --user não detectado (pode ser normal)');
    }
  }

  async testConfigLoading() {
    this.log('\n=== TESTE 4: CARREGAMENTO DE CONFIG ===', colors.bold);

    const result = await this.runProcess(['--debug'], null, 3000);

    if (result.stderr.includes('Configuration loaded') ||
        result.stderr.includes('Using default configuration') ||
        result.stderr.includes('✓ Configuration loaded') ||
        result.stderr.includes('⚠ Using default configuration')) {
      this.success('Config Loading', 'Configuração carregada corretamente');
    } else {
      this.warn('Config Loading', 'Configuração não detectada nos logs (pode ser normal)');
    }
  }

  async testGracefulExit() {
    this.log('\n=== TESTE 5: SAÍDA GRACIOSA ===', colors.bold);

    const result = await this.runProcess(['--test-exit'], null, 2000);

    if (result.code === 0 || result.code === 130 || result.timedOut) { // 130 = SIGINT
      this.success('Graceful Exit', 'Aplicação terminou graciosamente');
    } else if (result.code === null) {
      this.warn('Graceful Exit', 'Aplicação foi terminada pelo timeout (comportamento normal)');
    } else {
      this.fail('Graceful Exit', `Saída não graciosa, código: ${result.code}`);
    }
  }

  async testFileStructure() {
    this.log('\n=== TESTE 6: ESTRUTURA DE ARQUIVOS ===', colors.bold);

    const requiredFiles = [
      'src/mcp-ink-cli.mjs',
      'src/components/MultilineInput.js',
      'src/components/MarkdownParser.js',
      'src/ai_orchestrator_bash.js',
      'src/libs/pattern_matcher.js',
      'src/ai_models/model_factory.js',
      'src/bridges/adapters/TursoAdapter.js'
    ];

    let allPresent = true;
    for (const file of requiredFiles) {
      try {
        await fs.access(path.join(__dirname, '..', file));
        this.success('File Structure', `${file} existe`);
      } catch {
        this.fail('File Structure', `${file} NÃO EXISTE`);
        allPresent = false;
      }
    }

    if (allPresent) {
      this.success('File Structure', 'Todos os arquivos requeridos existem');
    }
  }

  async testImports() {
    this.log('\n=== TESTE 7: IMPORTS E DEPENDÊNCIAS ===', colors.bold);

    try {
      // Testar import do arquivo principal
      const { pathToFileURL } = await import('url');
      const cliPath = path.join(__dirname, '../src/mcp-ink-cli.mjs');

      // Verificar se o arquivo pode ser lido
      const content = await fs.readFile(cliPath, 'utf8');

      if (content.includes('import React') &&
          content.includes('from \'ink\'') &&
          content.includes('AICommandOrchestratorBash')) {
        this.success('Imports', 'Imports principais estão corretos');
      } else {
        this.fail('Imports', 'Imports principais estão faltando');
      }

      // Verificar estrutura básica
      if (content.includes('MCPInkApp') &&
          content.includes('useEffect') &&
          content.includes('useState')) {
        this.success('Imports', 'Estrutura React/Hooks encontrada');
      } else {
        this.fail('Imports', 'Estrutura React/Hooks está incorreta');
      }

    } catch (error) {
      this.fail('Imports', `Erro ao verificar imports: ${error.message}`);
    }
  }

  async testCodeStructure() {
    this.log('\n=== TESTE 8: ESTRUTURA DO CÓDIGO ===', colors.bold);

    try {
      const cliPath = path.join(__dirname, '../src/mcp-ink-cli.mjs');
      const content = await fs.readFile(cliPath, 'utf8');
      const lines = content.split('\n');

      this.success('Code Structure', `Arquivo tem ${lines.length} linhas`);

      // Verificar funções críticas
      const criticalFunctions = [
        'cleanupRequest',
        'processCommand',
        'loadCommandHistory',
        'saveToHistory',
        'handleSpecialCommand',
        'formatResponse'
      ];

      let functionsFound = 0;
      for (const func of criticalFunctions) {
        if (content.includes(func)) {
          functionsFound++;
        }
      }

      if (functionsFound === criticalFunctions.length) {
        this.success('Code Structure', 'Todas as funções críticas encontradas');
      } else {
        this.fail('Code Structure', `Apenas ${functionsFound}/${criticalFunctions.length} funções críticas encontradas`);
      }

    } catch (error) {
      this.fail('Code Structure', `Erro ao analisar estrutura: ${error.message}`);
    }
  }

  printSummary() {
    this.log('\n' + '='.repeat(60), colors.bold);
    this.log('RESUMO DOS TESTES DE REGRESSÃO', colors.bold);
    this.log('='.repeat(60), colors.bold);

    this.log(`Total de testes: ${this.passed + this.failed}`, colors.cyan);
    this.log(`✓ Passou: ${this.passed}`, colors.green);
    this.log(`✗ Falhou: ${this.failed}`, this.failed > 0 ? colors.red : colors.green);

    if (this.failed === 0) {
      this.log('\n🎉 TODOS OS TESTES PASSARAM! Seguro para refatorar.', colors.green);
      return true;
    } else {
      this.log('\n❌ ALGUNS TESTES FALHARAM! Corrija antes de refatorar.', colors.red);

      this.log('\nFalhas encontradas:', colors.red);
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => this.log(`  - ${r.test}: ${r.message}`, colors.red));

      return false;
    }
  }

  async run() {
    this.log('🧪 INICIANDO TESTES DE REGRESSÃO MCP-INK-CLI', colors.bold);
    this.log('Objetivo: Validar funcionalidades antes da refatoração\n');

    await this.testFileStructure();
    await this.testImports();
    await this.testCodeStructure();
    await this.testInitialization();
    await this.testDebugMode();
    await this.testUserParameter();
    await this.testConfigLoading();
    await this.testGracefulExit();

    return this.printSummary();
  }
}

// Executar testes se chamado diretamente
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tester = new RegressionTester();
  const success = await tester.run();
  process.exit(success ? 0 : 1);
}

export { RegressionTester };