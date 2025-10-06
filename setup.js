#!/usr/bin/env node
// ~/.mcp-terminal/setup.js

import fs from 'fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline';
import os from 'node:os';

class MCPSetup {
  constructor() {
    // Usar método robusto e multiplataforma para detectar home
    const homeDir = os.homedir();

    this.mcpDir = path.join(homeDir, '.mcp-terminal');
    this.configPath = path.join(this.mcpDir, 'config.json');
    this.zshrcPath = path.join(homeDir, '.zshrc');
    this.bashrcPath = path.join(homeDir, '.bashrc');
    this.versionFilePath = path.join(this.mcpDir, '.version');
    this.homeDir = homeDir;

    // Detectar se é root (apenas em sistemas Unix-like)
    this.isRoot =
      process.platform !== 'win32' &&
      typeof process.getuid === 'function' &&
      process.getuid() === 0;

    // Detectar shell atual com validação
    this.currentShell = process.env.SHELL || '/bin/bash';

    // Shell padrão se não detectado
    if (!this.currentShell || this.currentShell === '') {
      this.currentShell = '/bin/bash';
    }

    // Lê a versão do package.json
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageData = readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageData);
      this.version = packageJson.version;
    } catch (error) {
      // Fallback para versão padrão se não conseguir ler do package.json
      this.version = '1.0.1';
    }

    /**
     * PRESERVED PATHS - Files and directories that must NEVER be deleted during updates
     * These contain user data and configurations that should persist across installations
     *
     * IMPORTANT: If you add new user data storage, add it to this list!
     */
    this.PRESERVED_PATHS = [
      'cache',                    // API response cache
      'logs',                     // User logs
      'patterns',                 // Custom error patterns
      'config.json',              // Main configuration
      'config.json.bak',          // Configuration backup
      'command-history.json',     // Local command history
      '.backup-info.json',        // Backup metadata
      '.simplified-migration',    // Migration flags
      '.version',                 // Version tracking
      '.checksums.json',          // File integrity manifest
      'config',                   // Additional config directory if exists
    ];
  }


  async detectPackageManagers() {
    const managers = [];
    const { execSync } = await import('child_process');
    
    // Check for pnpm
    try {
      execSync('pnpm --version', { stdio: 'ignore' });
      managers.push('pnpm');
    } catch {}
    
    // Check for yarn
    try {
      execSync('yarn --version', { stdio: 'ignore' });
      managers.push('yarn');
    } catch {}
    
    // npm is always available (comes with Node.js)
    managers.push('npm');
    
    return managers;
  }

  async selectPackageManager(autoMode = false) {
    const availableManagers = await this.detectPackageManagers();
    
    // Check if already configured
    const configPath = path.join(this.mcpDir, 'config.json');
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      if (config.packageManager && availableManagers.includes(config.packageManager)) {
        console.log(`\n📦 Usando gerenciador configurado: ${config.packageManager}`);
        return config.packageManager;
      }
    } catch {
      // Config doesn't exist or is invalid, continue with selection
    }
    
    if (autoMode) {
      // Prefer pnpm > yarn > npm
      const preferred = availableManagers.includes('pnpm') ? 'pnpm' : 
                       availableManagers.includes('yarn') ? 'yarn' : 'npm';
      console.log(`\n📦 Modo automático: usando ${preferred}`);
      return preferred;
    }
    
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      console.log('\n📦 Selecione o gerenciador de pacotes:');
      availableManagers.forEach((manager, index) => {
        console.log(`  ${index + 1}. ${manager}`);
      });
      
      rl.question('\nEscolha (1-' + availableManagers.length + '): ', (answer) => {
        rl.close();
        const choice = parseInt(answer) - 1;
        if (choice >= 0 && choice < availableManagers.length) {
          resolve(availableManagers[choice]);
        } else {
          console.log('⚠️  Opção inválida, usando npm');
          resolve('npm');
        }
      });
    });
  }

  async runPackageManagerCommand(manager, command, description) {
    const { execSync } = await import('child_process');
    
    console.log(`\n${description}...`);
    
    const commands = {
      npm: {
        install: 'npm install',
        build: 'npm run build'
      },
      pnpm: {
        install: 'pnpm install',
        build: 'pnpm build'
      },
      yarn: {
        install: 'yarn install',
        build: 'yarn build'
      }
    };
    
    const fullCommand = commands[manager][command];
    
    try {
      execSync(fullCommand, { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log(`✅ ${description} concluído`);
      return true;
    } catch (error) {
      console.error(`❌ Erro ao executar ${fullCommand}:`, error.message);
      return false;
    }
  }

  async setup() {
    console.log(
      '\n══════════════════════════════════════════════════════════════════',
    );
    console.log('         MCP TERMINAL ASSISTANT - SISTEMA DE INSTALAÇÃO');
    console.log(
      '══════════════════════════════════════════════════════════════════',
    );
    console.log();
    console.log('👨‍💻 Desenvolvido por: Fábio Fernandes Theodoro');
    console.log(
      '🏢 Empresa: IP COM COMÉRCIO DE EQUIPAMENTOS DE TELEFONIA LTDA',
    );
    console.log('📧 Contato: fabio@ipcom.com.br');
    console.log('🌐 Site: https://ipcom.com.br');
    console.log('📦 GitHub: https://github.com/fabiotheo/mcp-devops');
    console.log();
    console.log(
      '🎯 Finalidade: Sistema inteligente de assistência para equipes de',
    );
    console.log(
      '   suporte e DevOps, especializado em administração de servidores',
    );
    console.log('   Linux/Unix com análise automática de erros e orquestração');
    console.log('   inteligente de comandos.');
    console.log();
    console.log(
      '══════════════════════════════════════════════════════════════════',
    );
    console.log();
    console.log('🚀 Iniciando configuração do MCP Terminal Assistant...\n');

    try {
      // 1. Criar diretórios
      await this.createDirectories();

      // 2. Configurar dependências
      await this.setupDependencies();

      // 3. Configurar API key
      await this.configureAPI();

      // 4. Configurar integração do Shell
      await this.setupShellIntegration();

      // 5. Tornar scripts executáveis
      await this.makeExecutable();

      // 6. Verificar versão e sincronização
      await this.verifyVersionSync();

      // 7. Verificar integridade da instalação
      await this.verifyInstallationIntegrity();

      // 8. Teste inicial
      await this.runTests();

      // 9. Salvar versão atual
      await this.saveVersion();

      console.log(
        '\n══════════════════════════════════════════════════════════════════',
      );
      console.log('✅ INSTALAÇÃO CONCLUÍDA COM SUCESSO!');
      console.log(
        '══════════════════════════════════════════════════════════════════',
      );
      console.log();
      console.log('📋 Próximos passos:');
      console.log('1. Reinicie seu terminal ou execute: source ~/.zshrc');
      console.log('2. Teste com: ipcom "como listar arquivos por tamanho"');
      console.log('3. Execute um comando que falhe para ver o monitoramento');
      console.log();
      console.log('💡 Comandos disponíveis:');
      console.log('   • ipcom-chat - Interface interativa com IA');
      console.log('   • ipcom "sua pergunta" - Perguntas diretas');
      console.log('   • mcp-configure - Reconfigurar o sistema');
      console.log();
      console.log('📧 Suporte: fabio@ipcom.com.br');
      console.log('📦 Contribua: https://github.com/fabiotheo/mcp-devops');
      console.log(
        '══════════════════════════════════════════════════════════════════',
      );
    } catch (error) {
      console.error('\n❌ Erro durante a instalação:', error.message);
      process.exit(1);
    }
  }

  async upgrade() {
    try {
      if (!this.isAutoMode) {
        console.log(
          '\n══════════════════════════════════════════════════════════════════',
        );
        console.log('         MCP TERMINAL ASSISTANT - ATUALIZAÇÃO');
        console.log(
          '══════════════════════════════════════════════════════════════════',
        );
        console.log();
        console.log('👨‍💻 Desenvolvido por: Fábio Fernandes Theodoro');
        console.log('📦 GitHub: https://github.com/fabiotheo/mcp-devops');
        console.log(
          '══════════════════════════════════════════════════════════════════',
        );
        console.log();
      }
      console.log('🔄 Atualizando MCP Terminal Assistant...\n');

      // 1. Verificar a versão atual
      const currentVersion = await this.getCurrentVersion();
      console.log(`📊 Versão instalada: ${currentVersion || 'não encontrada'}`);
      console.log(`📊 Nova versão: ${this.version}`);

      if (currentVersion === this.version) {
        console.log('\n✅ Você já está na versão mais recente!');
        return;
      }

      // 2. Criar diretórios (caso não existam)
      await this.createDirectories();

      // 3. Backup da configuração atual
      console.log('📦 Fazendo backup da configuração...');
      let config = null;
      try {
        const configData = await fs.readFile(this.configPath, 'utf8');
        config = JSON.parse(configData);
        console.log('  ✓ Backup da configuração concluído');
      } catch (error) {
        console.log(
          '  ⚠️ Não foi possível ler configuração existente, será criada uma nova',
        );
      }

      // 4. Executar migrações de versão específicas se necessário
      if (currentVersion) {
        await this.runMigrations(currentVersion);
      }

      // 5. Atualizar arquivos de código
      console.log('📄 Atualizando arquivos...');
      await this.setupDependencies();
      await this.makeExecutable();

      // 6. Restaurar configuração
      if (config) {
        console.log('🔄 Restaurando configuração...');
        // Mesclamos com o template atual para garantir novos campos
        const templatePath = path.join(process.cwd(), 'config_template.json');
        try {
          const template = await fs.readFile(templatePath, 'utf8');
          const templateConfig = JSON.parse(template);

          // Mesclar mantendo valores do usuário onde existirem
          const mergedConfig = { ...templateConfig, ...config };

          await fs.writeFile(
            this.configPath,
            JSON.stringify(mergedConfig, null, 2),
          );
          console.log('  ✓ Configuração restaurada e atualizada');
        } catch (error) {
          // Se falhar, mantém a configuração antiga
          await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
          console.log('  ✓ Configuração original restaurada');
        }
      } else {
        // Se não tiver configuração, cria uma nova
        await this.configureAPI();
      }

      // 7. Atualizar integração do Shell (caso necessário)
      await this.setupShellIntegration();

      // 8. Executar testes
      await this.runTests();

      // 9. Salvar nova versão
      await this.saveVersion();

      if (!this.isAutoMode) {
        console.log(
          '\n══════════════════════════════════════════════════════════════════',
        );
        console.log('✅ ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!');
        console.log(
          '══════════════════════════════════════════════════════════════════',
        );
        console.log();
      } else {
        console.log('\n✅ Atualização automática concluída com sucesso!');
      }
      console.log('\n📋 Próximos passos:');
      console.log('1. Reinicie seu terminal ou execute: source ~/.zshrc');
      console.log('2. Teste com: ipcom "como listar arquivos por tamanho"');
      console.log('3. Execute um comando que falhe para ver o monitoramento');
      console.log();
      console.log('📧 Suporte: fabio@ipcom.com.br');
      console.log('📦 Contribua: https://github.com/fabiotheo/mcp-devops');
      if (!this.isAutoMode) {
        console.log(
          '══════════════════════════════════════════════════════════════════',
        );
      }
    } catch (error) {
      console.error('\n❌ Erro durante a atualização:', error.message);
      process.exit(1);
    }
  }

  async forceUpdate() {
    try {
      console.log(
        '🔄 FORÇA ATUALIZAÇÃO - Copiando arquivos mesmo na mesma versão...\n',
      );

      const currentVersion = await this.getCurrentVersion();
      console.log(`📊 Versão instalada: ${currentVersion || 'não encontrada'}`);
      console.log(`📊 Versão atual do código: ${this.version}`);

      if (currentVersion === this.version) {
        console.log(
          '⚠️ Mesma versão detectada, mas forçando atualização dos arquivos...\n',
        );
      }

      // 1. Criar diretórios (caso não existam)
      await this.createDirectories();

      // 2. Backup da configuração atual
      console.log('📦 Fazendo backup da configuração...');
      let config = null;
      try {
        const configData = await fs.readFile(this.configPath, 'utf8');
        config = JSON.parse(configData);
        console.log('  ✓ Backup da configuração concluído');
      } catch (error) {
        console.log(
          '  ⚠️ Não foi possível ler configuração existente, será criada uma nova',
        );
      }

      // 3. Atualizar TODOS os arquivos de código forçadamente
      console.log('📄 FORÇANDO atualização de todos os arquivos...');
      await this.setupDependencies();
      await this.makeExecutable();

      // 4. Restaurar configuração
      if (config) {
        console.log('🔄 Restaurando configuração...');
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
        console.log('  ✓ Configuração restaurada');
      }

      // 5. Salvar versão (mesmo que seja a mesma)
      await this.saveVersion();

      console.log('\n✅ Força atualização concluída com sucesso!\n');
      console.log('🔧 Arquivos atualizados:');
      console.log('   • mcp-interactive.js');
      console.log('   • ai_orchestrator.ts');
      console.log('   • system_detector.ts');
      console.log('   • Todos os outros arquivos do projeto\n');

      console.log('📋 Próximos passos:');
      console.log('1. Teste o assistente: ipcom-chat');
      console.log('2. Verifique as configurações se necessário');
    } catch (error) {
      console.error('\n❌ Erro durante a força atualização:', error.message);
      process.exit(1);
    }
  }

  async getCurrentVersion() {
    try {
      return await fs.readFile(this.versionFilePath, 'utf8');
    } catch (error) {
      return null; // Versão não encontrada (instalação antiga ou nova)
    }
  }

  async saveVersion() {
    await fs.writeFile(this.versionFilePath, this.version, 'utf8');
    console.log(`  ✓ Versão ${this.version} registrada`);
  }

  async ensureTursoSchema() {
    try {
      console.log('\n📊 Verificando schema do Turso...');

      // Verificar se config existe
      if (!existsSync(this.configPath)) {
        console.log('   ⚠️  Configuração não encontrada - pulando');
        return;
      }

      // Ler config
      const configContent = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configContent);

      // Verificar se Turso está configurado
      if (!config.turso_url || !config.turso_token) {
        console.log('   ℹ️  Turso não configurado - pulando');
        return;
      }

      console.log('   🔄 Executando migrations do banco de dados...');

      // Executar script de migrations do Drizzle
      const scriptPath = path.join(this.mcpDir, 'src', 'scripts', 'run-migrations.js');

      if (!existsSync(scriptPath)) {
        console.log('   ⚠️  Script de migrations não encontrado - migrations serão executadas na primeira execução');
        return;
      }

      // Executar com node
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      await execAsync(`node ${scriptPath}`, {
        cwd: this.mcpDir,
        env: { ...process.env }
      });

      console.log('   ✅ Schema do Turso atualizado');

    } catch (error) {
      console.log(`   ⚠️  Aviso: ${error.message}`);
      console.log('   💡 Schema será criado automaticamente na primeira execução');
    }
  }

  async runMigrations(fromVersion) {
    console.log(
      `🔄 Executando migrações necessárias de v${fromVersion} para v${this.version}...`,
    );

    // Este bloco será expandido com migrações específicas conforme necessário
    // Exemplo: se alterar a estrutura do config.json ou outros arquivos

    // Migração da v0.9 para v1.0+
    if (fromVersion < '1.0.0') {
      console.log('  ✓ Aplicando migração para compatibilidade v1.0.0');

      // Exemplo: atualizar estrutura de cache ou logs
      try {
        // Reorganização de pastas
        const oldCachePath = path.join(this.mcpDir, 'cache');
        const newCachePath = path.join(this.mcpDir, 'cache', 'responses');
        await fs.mkdir(newCachePath, { recursive: true });

        console.log('  ✓ Estrutura de diretórios atualizada');
      } catch (error) {
        console.log(`  ⚠️ Aviso na migração: ${error.message}`);
      }
    }

    // Adicione mais migrações conforme necessário para versões futuras
    // if (fromVersion < "1.1.0") { ... }
  }

  async createDirectories() {
    console.log('📁 Criando diretórios...');

    const dirs = [
      this.mcpDir,
      path.join(this.mcpDir, 'cache'),
      path.join(this.mcpDir, 'patterns'),
      path.join(this.mcpDir, 'logs'),
    ];

    for (const dir of dirs) {
      try {
        await fs.access(dir);
        console.log(`  ✓ ${dir} já existe`);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log(`  ✓ Criado ${dir}`);
      }
    }
  }

  async setupDependencies() {
    console.log('\n📦 Configurando dependências...');

    // Selecionar package manager
    const packageManager = await this.selectPackageManager(this.auto);
    
    const packageJsonPath = path.join(this.mcpDir, 'package.json');

    // Dependências obrigatórias
    const requiredDeps = {
      '@anthropic-ai/sdk': '^0.21.1',
      openai: '^4.29.0',
      '@google/generative-ai': '^0.2.1',
      '@libsql/client': '^0.15.15',
      minimist: '^1.2.8',
      chalk: '^5.3.0',
      commander: '^14.0.1',
      react: '^18.2.0',
      ink: '^6.3.1',
      'ink-spinner': '^5.0.0',
      '@inkjs/ui': '^2.0.0',
      marked: '^14.1.2',
      'marked-terminal': '^7.3.0',
    };

    let needsUpdate = false;
    let packageJson;

    try {
      // Verificar se existe e ler conteúdo
      const content = await fs.readFile(packageJsonPath, 'utf8');
      packageJson = JSON.parse(content);
      console.log('  ✓ package.json já existe no destino');

      // Verificar se tem todas as dependências necessárias
      if (!packageJson.dependencies) {
        packageJson.dependencies = {};
        needsUpdate = true;
      }

      for (const [dep, version] of Object.entries(requiredDeps)) {
        if (!packageJson.dependencies[dep]) {
          console.log(`  ⚠ Adicionando dependência faltante: ${dep}`);
          packageJson.dependencies[dep] = version;
          needsUpdate = true;
        } else if (
          (dep === 'marked' || dep === 'marked-terminal') &&
          packageJson.dependencies[dep] !== version
        ) {
          // Corrigir versões incorretas de marked e marked-terminal
          console.log(
            `  ⚠ Corrigindo versão de ${dep}: ${packageJson.dependencies[dep]} → ${version}`,
          );
          packageJson.dependencies[dep] = version;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await fs.writeFile(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2),
        );
        console.log('  ✓ package.json atualizado com dependências faltantes');
      }
    } catch {
      // Criar novo package.json
      packageJson = {
        name: 'mcp-terminal',
        version: '1.0.0',
        type: 'module',
        dependencies: requiredDeps,
      };

      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('  ✓ package.json criado');
    }

    // Salvar escolha do package manager no config
    const configPath = path.join(this.mcpDir, 'config.json');
    try {
      let config = {};
      try {
        config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      } catch {
        // Config ainda não existe
      }
      config.packageManager = packageManager;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`  ✓ Package manager '${packageManager}' salvo na configuração`);
    } catch (error) {
      console.log(`  ⚠ Não foi possível salvar package manager no config: ${error.message}`);
    }

    // Executar install e build no diretório do PROJETO (não no destino)
    const projectDir = process.cwd();
    
    // Instalar dependências do projeto
    const { execSync } = await import('child_process');
    console.log('\n📦 Instalando dependências do projeto...');
    
    const installCommands = {
      npm: 'npm install',
      pnpm: 'pnpm install',
      yarn: 'yarn install'
    };
    
    try {
      execSync(installCommands[packageManager], {
        stdio: 'inherit',
        cwd: projectDir
      });
      console.log('✅ Dependências instaladas');

      // Se estiver usando pnpm, aprovar build scripts do esbuild
      if (packageManager === 'pnpm') {
        try {
          execSync('pnpm approve-builds', {
            stdio: 'inherit',
            cwd: projectDir
          });
          console.log('✅ Build scripts aprovados');
        } catch (error) {
          console.log('  ℹ️  Aprovação de builds não necessária ou já concluída');
        }
      }
    } catch (error) {
      throw new Error(`Falha ao instalar dependências com ${packageManager}`);
    }
    
    // Fazer build do projeto
    console.log('\n🔨 Compilando projeto TypeScript...');
    
    const buildCommands = {
      npm: 'npm run build',
      pnpm: 'pnpm build',
      yarn: 'yarn build'
    };
    
    try {
      execSync(buildCommands[packageManager], { 
        stdio: 'inherit',
        cwd: projectDir
      });
      console.log('✅ Build concluído');
    } catch (error) {
      throw new Error(`Falha ao fazer build com ${packageManager}`);
    }

    // Agora instalar dependências no destino (~/.mcp-terminal)
    console.log('\n📦 Instalando dependências no diretório de instalação...');
    try {
      execSync(installCommands[packageManager], {
        stdio: 'inherit',
        cwd: this.mcpDir
      });
      console.log('✅ Dependências instaladas no destino');

      // Se estiver usando pnpm, aprovar build scripts do esbuild
      if (packageManager === 'pnpm') {
        try {
          execSync('pnpm approve-builds', {
            stdio: 'inherit',
            cwd: this.mcpDir
          });
          console.log('✅ Build scripts aprovados no destino');
        } catch (error) {
          console.log('  ℹ️  Aprovação de builds não necessária ou já concluída');
        }
      }
    } catch (error) {
      console.log('  ⚠ Tentando com --legacy-peer-deps...');
      try {
        execSync('npm install --legacy-peer-deps', {
          stdio: 'inherit',
          cwd: this.mcpDir
        });
        console.log('✅ Dependências instaladas com --legacy-peer-deps');
      } catch (error2) {
        throw new Error('Falha ao instalar dependências no destino');
      }
    }

    // NÃO copiar ai_models aqui - será copiado automaticamente com dist/ completo em makeExecutable()
    console.log('  ✓ Preparação concluída (arquivos serão copiados a seguir)');
  }

  async configureAPI() {
    console.log('\n🔑 Configurando API...');

    // Carrega template de configuração
    const templatePath = path.join(process.cwd(), 'config_template.json');
    let config = {};

    try {
      const template = await fs.readFile(templatePath, 'utf8');
      config = JSON.parse(template);
    } catch (error) {
      // Caso o template não seja encontrado, usa configuração padrão
      config = {
        ai_provider: 'claude',
        anthropic_api_key: '',
        openai_api_key: '',
        gemini_api_key: '',
        claude_model: 'claude-3-7-sonnet-20250219',
        openai_model: 'gpt-4o',
        gemini_model: 'gemini-pro',
        max_calls_per_hour: 100,
        enable_monitoring: true,
        enable_assistant: true,
        monitor_commands: [
          'npm',
          'yarn',
          'git',
          'docker',
          'make',
          'cargo',
          'go',
          'apt',
          'pacman',
          'systemctl',
        ],
        quick_fixes: true,
        auto_detect_fixes: false,
        log_level: 'info',
        cache_duration_hours: 24,
      };
    }

    // Verifica se já existe configuração
    let existingConfig = null;
    try {
      const existingContent = await fs.readFile(this.configPath, 'utf8');
      existingConfig = JSON.parse(existingContent);

      // Preserva configurações existentes
      if (existingConfig) {
        config = { ...config, ...existingConfig };
      }
    } catch {}

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Configura Claude como provedor (único suportado atualmente)
    const provider = 'claude';
    config.ai_provider = provider;

    console.log('\n🔑 Configurando Anthropic Claude API...');

    // Solicita API key do Claude
    const apiKeyPrompt = '🔐 Digite sua Anthropic API key: ';
    const apiKeyField = 'anthropic_api_key';

    // Preserva a API key existente se disponível
    if (
      existingConfig &&
      existingConfig[apiKeyField] &&
      existingConfig[apiKeyField] !== `YOUR_${apiKeyField.toUpperCase()}_HERE`
    ) {
      console.log(`  ✓ ${apiKeyField} já configurada`);
    } else {
      const apiKey = await new Promise(resolve => {
        rl.question(apiKeyPrompt, resolve);
      });

      if (!apiKey || apiKey.length < 10) {
        rl.close();
        throw new Error('API key inválida');
      }

      config[apiKeyField] = apiKey;
    }

    // Seleciona o modelo Claude
    const modelOptions = [
      { name: 'Claude Sonnet 4.5 (recomendado) ⭐', id: 'claude-sonnet-4-5-20250929' },
      { name: 'Claude Opus 4.1', id: 'claude-opus-4-1-20250805' },
      { name: 'Claude Opus 4', id: 'claude-opus-4-20250514' },
      { name: 'Claude Sonnet 4', id: 'claude-sonnet-4-20250514' },
      { name: 'Claude Sonnet 3.7', id: 'claude-3-7-sonnet-20250219' },
      { name: 'Claude Haiku 3.5', id: 'claude-3-5-haiku-20241022' },
      { name: 'Claude Haiku 3', id: 'claude-3-haiku-20240307' },
    ];
    const modelField = 'claude_model';

    const modelChoice = await new Promise(resolve => {
      console.log('\n📋 Escolha o modelo Claude:');
      modelOptions.forEach((model, index) => {
        console.log(`  ${index + 1}. ${model.name}`);
      });
      rl.question(`Escolha uma opção (1-${modelOptions.length}) [padrão: 1]: `, answer => {
        const trimmed = answer.trim();
        if (trimmed === '') {
          // Enter sem digitar = padrão (opção 1)
          resolve(modelOptions[0].id);
        } else {
          const index = parseInt(trimmed) - 1;
          if (index >= 0 && index < modelOptions.length) {
            resolve(modelOptions[index].id);
          } else {
            resolve(modelOptions[0].id);
          }
        }
      });
    });

    config[modelField] = modelChoice;
    console.log(`  ✓ Modelo selecionado: ${modelChoice}`);

    // Configurar Turso (banco de dados distribuído para histórico)
    console.log('\n💾 Configurando Turso (opcional - pressione Enter para pular)...');

    const tursoUrl = await new Promise(resolve => {
      rl.question('🔗 Turso Database URL (ou Enter para pular): ', answer => {
        resolve(answer.trim());
      });
    });

    if (tursoUrl) {
      config.turso_url = tursoUrl;

      const tursoToken = await new Promise(resolve => {
        rl.question('🔑 Turso Auth Token: ', answer => {
          resolve(answer.trim());
        });
      });

      if (tursoToken) {
        config.turso_token = tursoToken;
        console.log('  ✓ Turso configurado');
      } else {
        console.log('  ⚠ Token não fornecido - Turso não será configurado');
      }
    } else {
      console.log('  ℹ Turso não configurado - usando histórico local apenas');
    }

    rl.close();

    // Salva a configuração
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    console.log('  ✓ Configuração salva');
  }

  async setupShellIntegration() {
    // Detectar qual shell está sendo usado
    const shellName = path.basename(this.currentShell);
    const isZsh = shellName.includes('zsh');
    const isBash = shellName.includes('bash');

    console.log(`\n🐚 Configurando integração do shell (${shellName})...`);

    // Determinar arquivo de configuração correto
    let rcPath;
    if (isZsh) {
      rcPath = this.zshrcPath;
    } else if (isBash) {
      rcPath = this.bashrcPath;
    } else {
      console.log(`  ⚠ Shell ${shellName} não suportado automaticamente.`);
      console.log(`  👉 Adicione manualmente ao seu arquivo de configuração:`);
      console.log(`     export PATH="$HOME/.local/bin:$PATH"`);
      return;
    }

    const rcName = path.basename(rcPath);
    const integrationLine = 'source ~/.mcp-terminal/zsh_integration.sh';
    const pathLine = 'export PATH="$HOME/.local/bin:$PATH"';

    try {
      let rcContent = '';
      try {
        rcContent = await fs.readFile(rcPath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        // Arquivo não existe, será criado
      }

      let updated = false;

      // Verifica e adiciona integração
      if (!rcContent.includes(integrationLine)) {
        rcContent +=
          '\n\n# MCP Terminal Integration\n' + integrationLine + '\n';
        updated = true;
      }

      // Verifica e adiciona PATH
      if (!rcContent.includes('.local/bin')) {
        rcContent +=
          '\n# Add .local/bin to PATH for MCP commands\n' + pathLine + '\n';
        updated = true;
      }

      if (updated) {
        await fs.writeFile(rcPath, rcContent);
        console.log(`  ✓ Integração e PATH configurados no ${rcName}`);
      } else {
        console.log(`  ✓ Integração já configurada no ${rcName}`);
      }

      // Para root em Linux, adicionar também ao /etc/profile.d/
      if (this.isRoot && process.platform === 'linux') {
        try {
          const profileScript = `#!/bin/sh\n# MCP Terminal Integration\nexport PATH="$HOME/.local/bin:$PATH"\n`;
          await fs.writeFile('/etc/profile.d/mcp.sh', profileScript);
          await fs.chmod('/etc/profile.d/mcp.sh', 0o755);
          console.log(
            '  ✓ Configuração global adicionada em /etc/profile.d/mcp.sh',
          );
        } catch (error) {
          // Ignorar se não conseguir escrever
          console.log(
            '  ℹ Não foi possível adicionar configuração global (sem permissão)',
          );
        }
      }
    } catch (error) {
      console.error(`  ❌ Erro ao configurar ${rcName}:`, error.message);
    }
  }

  // Manter o nome antigo para compatibilidade
  async setupZshIntegration() {
    return this.setupShellIntegration();
  }

  adjustImportsForInstallation(content, sourceFile) {
    // Ajusta os imports relativos para funcionarem na estrutura instalada
    let adjustedContent = content;

    // Se o arquivo vem de src/, precisa ajustar os imports da v2
    if (sourceFile.includes('src/')) {
      // ../ai_orchestrator_bash.ts -> ./ai_orchestrator_bash.ts
      adjustedContent = adjustedContent.replace(
        /from ['"]\.\.\/ai_orchestrator_bash\.js['"]/g,
        "from './ai_orchestrator_bash.ts'",
      );
      // libs agora está dentro de src, então ./libs/ já está correto
      // adjustedContent = adjustedContent.replace(/from ['"]\.\.\/libs\//g, "from './libs/");
      // ai_models agora está dentro de src, então ./ai_models/ já está correto
      // adjustedContent = adjustedContent.replace(/from ['"]\.\.\/ai_models\//g, "from './ai_models/");
      // ./bridges/adapters/TursoAdapter.ts -> ./src/bridges/adapters/TursoAdapter.ts
      adjustedContent = adjustedContent.replace(
        /from ['"]\.\/bridges\/adapters\/TursoAdapter\.js['"]/g,
        "from './src/bridges/adapters/TursoAdapter.ts'",
      );
    }

    // Se o arquivo vem de src/core/, precisa ajustar os imports relativos
    if (sourceFile.includes('src/core/')) {
      // libs agora está dentro de src, então ./libs/ já está correto
      // adjustedContent = adjustedContent.replace(/from ['"]\.\.\/libs\//g, "from './libs/");
      // ../ai-models/ -> ./ai_models/
      adjustedContent = adjustedContent.replace(
        /from ['"]\.\.\/ai-models\//g,
        "from './ai_models/",
      );
      // ../patterns/ -> ./patterns/
      adjustedContent = adjustedContent.replace(
        /from ['"]\.\.\/patterns\//g,
        "from './patterns/'",
      );
      // ./ai_orchestrator -> ./ai_orchestrator (já está correto)
    }

    return adjustedContent;
  }

  /**
   * Generate SHA256 checksum for a file
   */
  async generateChecksum(filePath) {
    const crypto = await import('crypto');
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Save checksums to a manifest file
   */
  async saveChecksumManifest(checksums) {
    const manifestPath = path.join(this.mcpDir, '.checksums.json');
    await fs.writeFile(manifestPath, JSON.stringify(checksums, null, 2));
  }

  /**
   * Load checksums from manifest file
   */
  async loadChecksumManifest() {
    try {
      const manifestPath = path.join(this.mcpDir, '.checksums.json');
      const content = await fs.readFile(manifestPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Force clean installation by removing stale files
   *
   * ⚠️ CRITICAL: This function uses a STATIC list of directories and files to remove.
   * If you refactor the project structure (rename/move directories), you MUST update this list!
   *
   * PROTECTED PATHS: Files/directories in this.PRESERVED_PATHS are NEVER deleted.
   * These contain user data and must persist across updates.
   *
   * TODO: Consider migrating to manifest-based cleanup using .checksums.json
   * to make this process more robust and self-maintaining.
   */
  async cleanStaleFiles() {
    console.log('\n🧹 Limpando arquivos antigos (cache busting)...');

    // Application code directories that should be refreshed on every update
    const dirsToClean = [
      path.join(this.mcpDir, 'src'),
      path.join(this.mcpDir, 'libs'),
      path.join(this.mcpDir, 'components'),
      path.join(this.mcpDir, 'ai_models'),
      path.join(this.mcpDir, 'hooks'),
      path.join(this.mcpDir, 'contexts'),
      path.join(this.mcpDir, 'services'),
      path.join(this.mcpDir, 'utils'),
      path.join(this.mcpDir, 'bridges'),
      path.join(this.mcpDir, 'docs'), // Documentation (no longer copied)
    ];

    for (const dir of dirsToClean) {
      const baseName = path.basename(dir);

      // Safety check: Never delete protected paths
      if (this.PRESERVED_PATHS.includes(baseName)) {
        console.log(`  ⚠️  IGNORADO (protegido): ${baseName}/`);
        continue;
      }

      try {
        await fs.rm(dir, { recursive: true, force: true });
        console.log(`  ✓ Removido: ${baseName}/`);
      } catch (error) {
        // Silently ignore if directory doesn't exist
      }
    }

    // Remove old standalone files that might be outdated (compiled JavaScript files)
    const filesToClean = [
      'ipcom-chat-cli.js',
      'mcp-ink-cli.js',
      'ai_orchestrator.js',
      'ai_orchestrator_bash.js',
      'configure-ai.js',
    ];

    for (const file of filesToClean) {
      // Safety check: Never delete protected files
      if (this.PRESERVED_PATHS.includes(file)) {
        console.log(`  ⚠️  IGNORADO (protegido): ${file}`);
        continue;
      }

      try {
        await fs.unlink(path.join(this.mcpDir, file));
        console.log(`  ✓ Removido: ${file}`);
      } catch {
        // Silently ignore if file doesn't exist
      }
    }

    console.log('  ✅ Limpeza concluída (dados do usuário preservados)\n');
  }

  /**
   * Verify installation integrity using checksums
   */
  async verifyInstallationIntegrity() {
    console.log('\n🔍 Verificando integridade da instalação...');

    const manifest = await this.loadChecksumManifest();
    const errors = [];

    for (const [file, expectedChecksum] of Object.entries(manifest)) {
      const filePath = path.join(this.mcpDir, file);
      try {
        const actualChecksum = await this.generateChecksum(filePath);
        if (actualChecksum !== expectedChecksum) {
          errors.push(`  ❌ ${file} - checksum não corresponde`);
        }
      } catch (error) {
        errors.push(`  ❌ ${file} - arquivo não encontrado`);
      }
    }

    if (errors.length > 0) {
      console.log('\n⚠️  Problemas de integridade detectados:');
      errors.forEach(err => console.log(err));
      console.log('\n💡 Execute: node setup.js --upgrade --auto para corrigir\n');
      return false;
    }

    console.log('  ✅ Todos os arquivos verificados com sucesso\n');
    return true;
  }

  async makeExecutable() {
    console.log('\n🔧 Copiando e configurando scripts...');

    // Cache busting: Clean stale files before installation
    await this.cleanStaleFiles();

    // Track checksums for integrity validation
    const checksums = {};

    // Função auxiliar para copiar recursivamente
    const copyRecursive = async (src, dest) => {
      const stats = await fs.stat(src);
      if (stats.isDirectory()) {
        await fs.mkdir(dest, { recursive: true });
        const files = await fs.readdir(src);
        for (const file of files) {
          await copyRecursive(path.join(src, file), path.join(dest, file));
        }
      } else {
        const content = await fs.readFile(src);
        await fs.writeFile(dest, content);
      }
    };

    // Copiar TODO o diretório dist/ recursivamente para src/
    try {
      const distDir = path.join(process.cwd(), 'dist');
      const destSrcDir = path.join(this.mcpDir, 'src');

      console.log('  📦 Copiando dist/ completo para instalação...');
      
      // Criar diretório src se não existir
      try {
        await fs.access(destSrcDir);
      } catch {
        await fs.mkdir(destSrcDir, { recursive: true });
      }

      await copyRecursive(distDir, destSrcDir);
      console.log('  ✓ Diretório dist/ completo copiado para src/');
    } catch (error) {
      console.log(`  ❌ Erro ao copiar dist/: ${error.message}`);
      throw new Error('Não foi possível copiar os arquivos compilados. Certifique-se de que o build foi executado.');
    }

    // Copiar diretório drizzle (schemas e migrations)
    try {
      const drizzleDir = path.join(process.cwd(), 'drizzle');
      const destDrizzleDir = path.join(this.mcpDir, 'drizzle');

      if (existsSync(drizzleDir)) {
        console.log('  📦 Copiando diretório drizzle/ (migrations e schemas)...');
        await copyRecursive(drizzleDir, destDrizzleDir);
        console.log('  ✓ Diretório drizzle/ copiado');
      }
    } catch (error) {
      console.log(`  ⚠️  Aviso ao copiar drizzle/: ${error.message}`);
      // Não é erro fatal, apenas aviso
    }

    // Copiar scripts shell que não são compilados
    try {
      const shellScripts = [
        { src: 'scripts/zsh_integration.sh', dest: 'zsh_integration.sh' },
        { src: 'scripts/deploy-linux.sh', dest: 'deploy-linux.sh' },
      ];

      for (const script of shellScripts) {
        try {
          const srcPath = path.join(process.cwd(), script.src);
          const destPath = path.join(this.mcpDir, script.dest);
          const content = await fs.readFile(srcPath);
          await fs.writeFile(destPath, content);
          console.log(`  ✓ Script ${script.dest} copiado`);
        } catch (err) {
          console.log(`  ⚠ Não foi possível copiar ${script.src}: ${err.message}`);
        }
      }
    } catch (error) {
      console.log(`  ⚠ Erro ao copiar scripts shell: ${error.message}`);
    }

    // ai_models agora é copiado junto com dist/src
    // Criar link simbólico para ai_models na raiz para compatibilidade
    try {
      const srcAiModelsDir = path.join(this.mcpDir, 'src', 'ai_models');
      const destAiModelsDir = path.join(this.mcpDir, 'ai_models');

      // Verificar se ai_models foi copiado com src
      try {
        await fs.access(srcAiModelsDir);

        // Remover link/diretório antigo se existir
        try {
          const stats = await fs.lstat(destAiModelsDir);
          if (stats.isDirectory() || stats.isSymbolicLink()) {
            await fs.rm(destAiModelsDir, { recursive: true, force: true });
          }
        } catch {
          // Diretório não existe, tudo bem
        }

        // Criar link simbólico para manter compatibilidade
        await fs.symlink(srcAiModelsDir, destAiModelsDir, 'dir');
        console.log(`  ✓ Link simbólico para ai_models criado`);
      } catch (error) {
        console.log(`  ⚠ ai_models não encontrado em src: ${error.message}`);
      }
    } catch (error) {
      console.log(`  ⚠ Erro ao criar link para ai_models: ${error.message}`);
    }

    // Criar ipcom-chat launcher dinamicamente
    try {
      const ipcomChatContent = `#!/usr/bin/env node

// V2 Interface - Always use the new Ink interface
await import('./src/ipcom-chat-cli.js');`;

      const ipcomChatPath = path.join(this.mcpDir, 'ipcom-chat');
      await fs.writeFile(ipcomChatPath, ipcomChatContent);
      await fs.chmod(ipcomChatPath, 0o755);
      console.log('  ✓ Launcher ipcom-chat criado');
      
      checksums['ipcom-chat'] = await this.generateChecksum(ipcomChatPath);
    } catch (error) {
      console.log(`  ⚠ Erro ao criar ipcom-chat: ${error.message}`);
    }

    // Criar mcp-configure launcher dinamicamente
    try {
      const mcpConfigureContent = `#!/usr/bin/env node

// Simple wrapper to run the AI configurator
import AIConfigurator from './src/configure-ai.js';

const configurator = new AIConfigurator();
configurator.run().catch(error => {
    console.error('❌ Erro na configuração:', error.message);
    process.exit(1);
});`;

      const mcpConfigurePath = path.join(this.mcpDir, 'mcp-configure');
      await fs.writeFile(mcpConfigurePath, mcpConfigureContent);
      await fs.chmod(mcpConfigurePath, 0o755);
      console.log('  ✓ Launcher mcp-configure criado');
      
      checksums['mcp-configure'] = await this.generateChecksum(mcpConfigurePath);
    } catch (error) {
      console.log(`  ⚠ Erro ao criar mcp-configure: ${error.message}`);
    }

    // Documentation is not copied to installation directory anymore
    // Users should refer to the project repository for documentation

    const scripts = [
      'mcp-configure',
      'ipcom-chat',
    ];

    for (const script of scripts) {
      const scriptPath = path.join(this.mcpDir, script);
      try {
        await fs.chmod(scriptPath, 0o755);
        console.log(`  ✓ ${script} é executável`);
      } catch (error) {
        console.log(
          `  ⚠ Não foi possível tornar ${script} executável: ${error.message}`,
        );
      }
    }

    // Cria links simbólicos globais (opcional)
    const binDir = path.join(this.homeDir, '.local/bin');

    // Para root, também criar em /usr/local/bin se possível
    const additionalBinDirs = [];
    if (this.isRoot) {
      additionalBinDirs.push('/usr/local/bin');
    }
    try {
      await fs.mkdir(binDir, { recursive: true });

      const links = [
        {
          from: path.join(this.mcpDir, 'mcp-configure'),
          to: path.join(binDir, 'mcp-configure'),
        },
        {
          from: path.join(this.mcpDir, 'ipcom-chat'),
          to: path.join(binDir, 'ipcom-chat'),
        },
        {
          from: path.join(this.mcpDir, 'ipcom-chat'),
          to: path.join(binDir, 'ipcom'),
        },
      ];

      for (const link of links) {
        try {
          // Verificar se o arquivo de origem existe
          await fs.access(link.from);

          // Verificar o que existe no destino
          let destStats = null;
          try {
            destStats = await fs.lstat(link.to);
          } catch {
            // Destino não existe, OK para criar
          }

          if (destStats) {
            if (destStats.isSymbolicLink()) {
              // É um link simbólico, pode remover
              await fs.unlink(link.to);
            } else if (destStats.isDirectory()) {
              console.log(`  ⚠ ${link.to} é um diretório, pulando...`);
              continue;
            } else if (destStats.isFile()) {
              console.log(`  ⚠ ${link.to} é um arquivo existente, pulando...`);
              continue;
            }
          }

          await fs.symlink(link.from, link.to);
          console.log(`  ✓ Link criado: ${link.to}`);
        } catch (error) {
          console.log(
            `  ⚠ Não foi possível criar link ${path.basename(link.to)}: ${error.message}`,
          );
        }
      }

      // Para root, criar links também em /usr/local/bin
      if (this.isRoot) {
        console.log('\n  📌 Criando links globais para root...');
        for (const dir of additionalBinDirs) {
          try {
            await fs.mkdir(dir, { recursive: true });

            const globalLinks = [
              // Removido mcp-assistant.js - substituído por ipcom-chat
              {
                from: path.join(this.mcpDir, 'ipcom-chat'),
                to: path.join(dir, 'ipcom-chat'),
              },
              {
                from: path.join(this.mcpDir, 'ipcom-chat'),
                to: path.join(dir, 'ipcom'),
              },
            ];

            for (const link of globalLinks) {
              try {
                // Verificar se o arquivo de origem existe
                await fs.access(link.from);

                // Verificar o que existe no destino
                let destStats = null;
                try {
                  destStats = await fs.lstat(link.to);
                } catch {
                  // Destino não existe, OK para criar
                }

                if (destStats) {
                  if (destStats.isSymbolicLink()) {
                    // É um link simbólico, pode remover
                    await fs.unlink(link.to);
                  } else if (destStats.isDirectory() || destStats.isFile()) {
                    console.log(`  ⚠ ${link.to} já existe, pulando...`);
                    continue;
                  }
                }

                await fs.symlink(link.from, link.to);
                console.log(`  ✓ Link global criado: ${link.to}`);
              } catch (error) {
                console.log(
                  `  ⚠ Não foi possível criar link global: ${error.message}`,
                );
              }
            }
          } catch (error) {
            console.log(
              `  ⚠ Não foi possível criar links em ${dir}: ${error.message}`,
            );
          }
        }
      }
    } catch (error) {
      console.log(`  ⚠ Não foi possível criar links: ${error.message}`);
    }

    // Save checksum manifest for integrity validation
    await this.saveChecksumManifest(checksums);
    console.log(`  ✅ Manifest de checksums salvo (${Object.keys(checksums).length} arquivos rastreados)`);
  }

  /**
   * Verify installation version and sync status
   */
  async verifyVersionSync() {
    console.log('\n📊 Verificando versão e sincronização...');

    // Check installed version
    const installedVersion = await this.getCurrentVersion();
    const currentVersion = this.version;

    if (installedVersion) {
      console.log(`  • Versão instalada: ${installedVersion}`);
      console.log(`  • Versão do código fonte: ${currentVersion}`);

      if (installedVersion !== currentVersion) {
        console.log(`  ⚠️  Versões diferentes detectadas!`);
        console.log(`  💡 Execute: node setup.js --upgrade --auto para atualizar\n`);
        return false;
      }
    } else {
      console.log(`  • Primeira instalação detectada`);
    }

    // Check if all critical files exist
    const criticalFiles = [
      'src/mcp-ink-cli.js',
      'src/bridges/adapters/TursoAdapter.js',
      'src/libs/turso-client.js',
      'src/services/backendService.js',
      'src/hooks/useBackendInitialization.js'
    ];

    const missingFiles = [];
    for (const file of criticalFiles) {
      try {
        await fs.access(path.join(this.mcpDir, file));
      } catch {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      console.log(`  ❌ Arquivos críticos não encontrados:`);
      missingFiles.forEach(f => console.log(`     - ${f}`));
      console.log(`  💡 Execute: node setup.js --upgrade --auto para corrigir\n`);
      return false;
    }

    console.log(`  ✅ Todas as verificações passaram\n`);
    return true;
  }

  async runTests() {
    console.log('\n🧪 Executando testes...');

    // Teste 1: Verifica se os arquivos principais existem
    try {
      await fs.access(path.join(this.mcpDir, 'ipcom-chat'));
      await fs.access(path.join(this.mcpDir, 'mcp-ink-cli.js'));
      console.log('  ✓ Arquivos principais instalados corretamente');
    } catch (error) {
      console.log('  ⚠ Erro: arquivos principais não encontrados:', error.message);
    }

    // Teste 2: Verifica cache
    try {
      await fs.access(path.join(this.mcpDir, 'cache'));
      console.log('  ✓ Sistema de cache funcionando');
    } catch {
      console.log('  ⚠ Problema com sistema de cache');
    }

    // Teste 3: Verifica configuração
    try {
      const config = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
      if (config.anthropic_api_key) {
        // Verifica se a API key é um placeholder
        if (
          config.anthropic_api_key === 'YOUR_ANTHROPIC_API_KEY_HERE' ||
          config.anthropic_api_key.includes('YOUR_') ||
          config.anthropic_api_key.includes('API_KEY')
        ) {
          console.log(
            '  ⚠️ API key não configurada. Você precisa configurar uma API key válida',
          );
          console.log(
            '     Edite o arquivo ~/.mcp-terminal/config.json e substitua o placeholder pela sua API key',
          );
        } else {
          console.log('  ✓ Configuração válida');
        }
      } else {
        console.log('  ⚠️ API key não encontrada na configuração');
      }
    } catch {
      console.log('  ⚠ Problema na configuração');
    }
  }

  async uninstall(removeAllData = false) {
    console.log('🗑️  Desinstalando MCP Terminal...');

    // Remove integração do .zshrc
    try {
      const zshrc = await fs.readFile(this.zshrcPath, 'utf8');
      const newZshrc = zshrc.replace(
        /\n# MCP Terminal Integration\nsource ~\/\.mcp-terminal\/zsh_integration\.sh\n/g,
        '',
      );
      await fs.writeFile(this.zshrcPath, newZshrc);
      console.log('  ✓ Integração removida do .zshrc');
    } catch {}

    // Remove links globais
    const binDir = path.join(process.env.HOME, '.local/bin');
    try {
      await fs.unlink(path.join(binDir, 'ask'));
      await fs.unlink(path.join(binDir, 'mcp-monitor'));
      console.log('  ✓ Links globais removidos');
    } catch {}

    // Remove diretório (opcional)
    if (removeAllData) {
      try {
        await fs.rm(this.mcpDir, { recursive: true, force: true });
        console.log('  ✓ Todos os arquivos e dados removidos');
      } catch {}
    } else {
      console.log(
        '  ℹ️ Diretório ~/.mcp-terminal mantido para preservar configurações e histórico',
      );
      console.log(
        '     Para remover completamente, use: node setup.js --uninstall --remove-all-data',
      );
    }

    console.log('✅ Desinstalação concluída');
  }

  async autoSetup(isUpgrade = false) {
    console.log(
      `🚀 ${isUpgrade ? 'Atualizando' : 'Configurando'} MCP Terminal Assistant automaticamente...\n`,
    );

    try {
      // Verificar versão atual se for upgrade
      if (isUpgrade) {
        const currentVersion = await this.getCurrentVersion();
        console.log(
          `📊 Versão instalada: ${currentVersion || 'não encontrada'}`,
        );
        console.log(`📊 Nova versão: ${this.version}`);

        if (currentVersion === this.version) {
          console.log('\n⚠️  Mesma versão detectada, mas continuando atualização para garantir arquivos corretos...');
          // Don't return - continue with update to ensure all files are up to date
        }

        // Executar migrações se necessário
        if (currentVersion) {
          await this.runMigrations(currentVersion);
        }
      }

      // 1. Criar diretórios
      await this.createDirectories();

      // 2. Configurar dependências
      await this.setupDependencies();

      // 3. Configurar API key automaticamente
      console.log('\n🔑 Configurando API automaticamente...');

      // Carrega template de configuração
      const templatePath = path.join(process.cwd(), 'config_template.json');
      let config = {};

      try {
        const template = await fs.readFile(templatePath, 'utf8');
        config = JSON.parse(template);
      } catch (error) {
        // Caso o template não seja encontrado, usa configuração padrão
        config = {
          ai_provider: 'claude',
          anthropic_api_key: 'YOUR_ANTHROPIC_API_KEY_HERE',
          openai_api_key: 'YOUR_OPENAI_API_KEY_HERE',
          gemini_api_key: 'YOUR_GEMINI_API_KEY_HERE',
          claude_model: 'claude-3-7-sonnet-20250219',
          openai_model: 'gpt-4o',
          gemini_model: 'gemini-pro',
          use_native_tools: true,
          enable_bash_tool: true,
          bash_config: {
            timeout: 30000,
            maxOutputSize: 100000,
          },
          ai_orchestration: {
            enabled: true,
            max_iterations: 10,
            max_execution_time: 60000,
            verbose_logging: false,
            enable_cache: true,
          },
          max_calls_per_hour: 100,
          enable_monitoring: true,
          enable_assistant: true,
          monitor_commands: [
            'npm',
            'yarn',
            'git',
            'docker',
            'make',
            'cargo',
            'go',
            'apt',
            'pacman',
            'systemctl',
          ],
          quick_fixes: true,
          auto_detect_fixes: false,
          log_level: 'info',
          cache_duration_hours: 24,
        };
      }

      // Se for upgrade, preserva configuração existente
      if (isUpgrade) {
        try {
          const existingContent = await fs.readFile(this.configPath, 'utf8');
          const existingConfig = JSON.parse(existingContent);

          // Preserva configurações existentes mas adiciona novas features
          if (existingConfig) {
            // Adiciona novas features se não existirem
            if (existingConfig.use_native_tools === undefined) {
              existingConfig.use_native_tools = true;
              console.log('  ✓ Ativando Tools nativas do Claude');
            }
            if (existingConfig.enable_bash_tool === undefined) {
              existingConfig.enable_bash_tool = true;
              console.log('  ✓ Ativando ferramenta Bash persistente');
            }
            if (!existingConfig.bash_config) {
              existingConfig.bash_config = {
                timeout: 30000,
                maxOutputSize: 100000,
              };
            }
            if (!existingConfig.ai_orchestration) {
              existingConfig.ai_orchestration = {
                enabled: true,
                max_iterations: 10,
                max_execution_time: 60000,
                verbose_logging: false,
                enable_cache: true,
              };
            }
            config = { ...config, ...existingConfig };
            console.log('  ✓ Configuração existente preservada e atualizada');
          }
        } catch {}
      } else {
        // Para instalação nova, mantém o placeholder para API key
        // O usuário precisará configurar sua própria API key após a instalação
        console.log(
          '  ⚠️ Instalação automática: Você precisará configurar sua API key manualmente',
        );
        console.log(
          '     Edite o arquivo ~/.mcp-terminal/config.json após a instalação',
        );
      }

      // Salva a configuração
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
      console.log('  ✓ Configuração salva automaticamente');

      // 4. Configurar integração do Shell
      await this.setupShellIntegration();

      // 5. Tornar scripts executáveis
      await this.makeExecutable();

      // 6. Teste inicial
      await this.runTests();

      // 7. Salvar versão atual
      await this.saveVersion();

      // 8. Garantir schema do Turso (cria tabela conversation_summaries se necessário)
      await this.ensureTursoSchema();

      console.log(
        `\n✅ ${isUpgrade ? 'Atualização' : 'Instalação'} automática concluída com sucesso!`,
      );

      // Verificar se a API key é um placeholder
      try {
        const config = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
        if (
          config.anthropic_api_key === 'YOUR_ANTHROPIC_API_KEY_HERE' ||
          config.anthropic_api_key.includes('YOUR_') ||
          config.anthropic_api_key.includes('API_KEY')
        ) {
          console.log('\n⚠️ IMPORTANTE: API key não configurada');
          console.log(
            '   Você precisa configurar uma API key válida antes de usar o MCP Terminal Assistant',
          );
          console.log(
            '   Edite o arquivo ~/.mcp-terminal/config.json e substitua o placeholder pela sua API key',
          );
        }
      } catch {}

      console.log('\n📋 Próximos passos:');
      console.log('1. Reinicie seu terminal ou execute: source ~/.zshrc');
      console.log('2. Teste com: ipcom "como listar arquivos por tamanho"');
      console.log('3. Execute um comando que falhe para ver o monitoramento');
    } catch (error) {
      console.error(
        `\n❌ Erro durante a ${isUpgrade ? 'atualização' : 'instalação'} automática:`,
        error.message,
      );
      process.exit(1);
    }
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const setup = new MCPSetup();

  const isAuto = args.includes('--auto');
  const isUpgrade = args.includes('--upgrade');
  const isUninstall = args.includes('--uninstall');
  const isForce = args.includes('--force');
  const isVerify = args.includes('--verify');
  const isHelp = args.includes('--help') || args.includes('-h');
  const removeAllData = args.includes('--remove-all-data');

  if (isHelp) {
    console.log('🚀 MCP Terminal Assistant Setup\n');
    console.log('Opções disponíveis:');
    console.log('  node setup.js                    - Instalação interativa');
    console.log('  node setup.js --auto             - Instalação automática');
    console.log(
      '  node setup.js --upgrade          - Atualizar para nova versão',
    );
    console.log(
      '  node setup.js --upgrade --auto   - Atualizar automaticamente',
    );
    console.log(
      '  node setup.js --force            - ⚡ FORÇA atualização (mesma versão)',
    );
    console.log(
      '  node setup.js --uninstall        - Desinstalar (manter configurações)',
    );
    console.log('  node setup.js --uninstall --remove-all-data - Remover tudo');
    console.log('  node setup.js --verify           - Verificar integridade da instalação');
    console.log('  node setup.js --help             - Mostrar esta ajuda\n');
    console.log('💡 Nova opção --force: útil para desenvolvimento e testes!');
    console.log('💡 Nova opção --verify: verifica checksums e arquivos críticos!');
    return;
  }

  if (isVerify) {
    console.log('\n🔍 Verificando instalação do MCP Terminal Assistant...\n');
    const versionOk = await setup.verifyVersionSync();
    const integrityOk = await setup.verifyInstallationIntegrity();

    if (versionOk && integrityOk) {
      console.log('✅ Instalação verificada com sucesso!\n');
      process.exit(0);
    } else {
      console.log('❌ Problemas detectados na instalação!\n');
      process.exit(1);
    }
  } else if (isUninstall) {
    await setup.uninstall(removeAllData);
  } else if (isForce) {
    await setup.forceUpdate();
  } else if (isUpgrade) {
    if (isAuto) {
      await setup.autoSetup(true);
    } else {
      await setup.upgrade();
    }
  } else {
    if (isAuto) {
      await setup.autoSetup(false);
    } else {
      await setup.setup();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default MCPSetup;
