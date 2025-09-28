#!/usr/bin/env node
// ~/.mcp-terminal/setup.js

import fs from 'fs/promises';
import { readFileSync } from 'node:fs';
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

      // 6. Teste inicial
      await this.runTests();

      // 7. Salvar versão atual
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
      console.log('2. Teste com: ask "como listar arquivos por tamanho"');
      console.log('3. Execute um comando que falhe para ver o monitoramento');
      console.log();
      console.log('💡 Comandos disponíveis:');
      console.log('   • ipcom-chat - Interface interativa com IA');
      console.log('   • ask "sua pergunta" - Perguntas diretas');
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
      console.log('2. Teste com: ask "como listar arquivos por tamanho"');
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
      console.log('   • mcp-assistant.js');
      console.log('   • mcp-client.js');
      console.log('   • mcp-interactive.js');
      console.log('   • ai_orchestrator.ts');
      console.log('   • system_detector.ts');
      console.log('   • Todos os outros arquivos do projeto\n');

      console.log('📋 Próximos passos:');
      console.log('1. Teste o assistente: mcp-assistant "teste"');
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
      ink: '^4.4.1',
      'ink-spinner': '^5.0.0',
      marked: '^14.1.2',
      'marked-terminal': '^7.3.0',
    };

    let needsUpdate = false;
    let packageJson;

    try {
      // Verificar se existe e ler conteúdo
      const content = await fs.readFile(packageJsonPath, 'utf8');
      packageJson = JSON.parse(content);
      console.log('  ✓ package.json já existe');

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

    // Instalar dependências
    console.log('  📦 Instalando dependências npm...');
    try {
      // Tentar primeiro sem flags
      execSync('npm install', {
        cwd: this.mcpDir,
        stdio: 'inherit',
      });
      console.log('  ✓ Dependências instaladas');
    } catch (error) {
      // Se falhar, tentar com --legacy-peer-deps
      console.log('  ⚠ Tentando instalação com --legacy-peer-deps...');
      try {
        execSync('npm install --legacy-peer-deps', {
          cwd: this.mcpDir,
          stdio: 'inherit',
        });
        console.log('  ✓ Dependências instaladas com --legacy-peer-deps');
      } catch (error2) {
        throw new Error('Falha ao instalar dependências npm');
      }
    }

    // Copiar arquivos de modelos de IA
    console.log('  📂 Copiando arquivos de modelos de IA...');
    const aiModelsDir = path.join(this.mcpDir, 'ai_models');

    try {
      await fs.mkdir(aiModelsDir, { recursive: true });

      const sourceDir = path.join(process.cwd(), 'src', 'ai_models');

      // Verificar se o diretório de origem existe
      try {
        await fs.access(sourceDir);

        const sourceFiles = [
          'base_model.ts',
          'claude_model.ts',
          'openai_model.js',
          'gemini_model.ts',
          'model_factory.ts',
        ];

        for (const file of sourceFiles) {
          try {
            const content = await fs.readFile(
              path.join(sourceDir, file),
              'utf8',
            );
            await fs.writeFile(path.join(aiModelsDir, file), content);
            console.log(`  ✓ Arquivo ${file} copiado`);
          } catch (err) {
            console.log(`  ⚠ Não foi possível copiar ${file}: ${err.message}`);
          }
        }

        console.log('  ✓ Arquivos de modelo copiados');
      } catch (err) {
        console.log(`  ⚠ Diretório ai_models não encontrado: ${err.message}`);

        // Criar arquivos de modelo padrão
        console.log('  📝 Criando arquivos de modelo padrão...');

        // base_model.ts
        await fs.writeFile(
          path.join(aiModelsDir, 'base_model.ts'),
          `// ~/.mcp-terminal/ai_models/base_model.js
// Classe base para todos os modelos de IA

export default class BaseAIModel {
    constructor(config) {
        this.config = config;
    }

    // Método para inicializar o cliente da API
    async initialize() {
        throw new Error('Método initialize() deve ser implementado pela classe filha');
    }

    // Método para analisar comando com falha
    async analyzeCommand(commandData) {
        throw new Error('Método analyzeCommand() deve ser implementado pela classe filha');
    }

    // Método para responder perguntas sobre comandos
    async askCommand(question, systemContext) {
        throw new Error('Método askCommand() deve ser implementado pela classe filha');
    }

    // Retorna o nome do provedor
    getProviderName() {
        throw new Error('Método getProviderName() deve ser implementado pela classe filha');
    }

    // Retorna o nome do modelo atual
    getModelName() {
        throw new Error('Método getModelName() deve ser implementado pela classe filha');
    }

    // Método para validar API key (retorna true se válida)
    async validateApiKey() {
        throw new Error('Método validateApiKey() deve ser implementado pela classe filha');
    }
}`,
        );

        // claude_model.ts
        await fs.writeFile(
          path.join(aiModelsDir, 'claude_model.ts'),
          `// ~/.mcp-terminal/ai_models/claude_model.ts
// Implementação do modelo Claude da Anthropic

import { Anthropic } from '@anthropic-ai/sdk';
import BaseAIModel from './base_model.ts';

export default class ClaudeModel extends BaseAIModel {
    constructor(config) {
        super(config);
        this.apiKey = config.anthropic_api_key;
        this.modelName = config.claude_model || 'claude-3-7-sonnet-20250219';
        this.client = null;
    }

    async initialize() {
        if (!this.apiKey) {
            throw new Error('Chave de API da Anthropic não configurada');
        }

        this.client = new Anthropic({
            apiKey: this.apiKey
        });

        return this;
    }

    async analyzeCommand(commandData) {
        try {
            const { command, exitCode, stdout, stderr, duration, systemContext } = commandData;

            const prompt = \`Você é um especialista em Linux que analisa comandos que falharam.

SISTEMA:
- OS: \${systemContext.os}
- Distribuição: \${systemContext.distro} \${systemContext.version}
- Package Manager: \${systemContext.packageManager}
- Shell: \${systemContext.shell}

COMANDO EXECUTADO: \${command}
EXIT CODE: \${exitCode}
TEMPO DE EXECUÇÃO: \${duration}s

STDOUT:
\${stdout || '(vazio)'}

STDERR:
\${stderr || '(vazio)'}

ANÁLISE NECESSÁRIA:
1. Identifique o problema principal
2. Explique a causa do erro
3. Forneça uma solução específica para este sistema Linux
4. Sugira um comando para corrigir (se aplicável)
5. Inclua comandos preventivos se relevante

FORMATO DA RESPOSTA:
🔍 PROBLEMA: [Descrição clara do problema]
🛠️  SOLUÇÃO: [Explicação da solução]
💻 COMANDO: [Comando específico para corrigir, se aplicável]
⚠️  PREVENÇÃO: [Como evitar no futuro]

Seja conciso e específico para o sistema detectado.\`;

            const response = await this.client.messages.create({
                model: this.modelName,
                max_tokens: 1500,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            const analysis = response.content[0].text;

            // Extrai comando sugerido da resposta
            const commandMatch = analysis.match(/💻 COMANDO: (.+?)(?:\\n|$)/);
            const suggestedCommand = commandMatch ? commandMatch[1].replace(/\`/g, '').trim() : null;

            return {
                description: analysis,
                command: suggestedCommand,
                confidence: 0.8,
                category: 'llm_analysis',
                source: 'anthropic_claude'
            };

        } catch (error) {
            console.error('Erro na análise com Claude:', error);
            return null;
        }
    }

    async askCommand(question, systemContext) {
        try {
            const prompt = \`Você é um assistente especializado em Linux/Unix que ajuda usuários a encontrar o comando correto para suas tarefas.

INFORMAÇÕES DO SISTEMA:
- OS: \${systemContext.os}
- Distribuição: \${systemContext.distro}
- Versão: \${systemContext.version}
- Package Manager: \${systemContext.packageManager}
- Shell: \${systemContext.shell}
- Arquitetura: \${systemContext.architecture}
- Kernel: \${systemContext.kernel}
- Capacidades: \${systemContext.capabilities.join(', ')}

COMANDOS DISPONÍVEIS NESTE SISTEMA:
\${JSON.stringify(systemContext.commands, null, 2)}

PERGUNTA DO USUÁRIO: \${question}

INSTRUÇÕES:
1. Analise a pergunta considerando o sistema específico do usuário
2. Forneça o comando exato para a distribuição/sistema detectado
3. Explique brevemente o que o comando faz
4. Se houver variações por distribuição, mencione isso
5. Inclua opções úteis do comando
6. Se apropriado, sugira comandos relacionados

FORMATO DA RESPOSTA:
🔧 COMANDO:
\\\`comando exato aqui\\\`

📝 EXPLICAÇÃO:
[Explicação clara do que faz]

💡 OPÇÕES ÚTEIS:
[Variações ou opções importantes]

⚠️ OBSERVAÇÕES:
[Avisos ou considerações especiais]

Responda de forma direta e prática.\`;

            const response = await this.client.messages.create({
                model: this.modelName,
                max_tokens: 2000,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            return response.content[0].text;
        } catch (error) {
            console.error('Erro ao consultar Claude:', error);
            return \`❌ Erro ao conectar com o assistente Claude. Verifique sua configuração da API Anthropic.\`;
        }
    }

    getProviderName() {
        return 'Claude (Anthropic)';
    }

    getModelName() {
        return this.modelName;
    }

    async validateApiKey() {
        try {
            // Tenta fazer uma chamada simples para validar a API key
            const response = await this.client.messages.create({
                model: this.modelName,
                max_tokens: 10,
                messages: [{
                    role: 'user',
                    content: 'Hello'
                }]
            });

            return true;
        } catch (error) {
            console.error('Erro ao validar API key do Claude:', error);
            return false;
        }
    }
}`,
        );

        // model_factory.ts
        await fs.writeFile(
          path.join(aiModelsDir, 'model_factory.ts'),
          `// ~/.mcp-terminal/ai_models/model_factory.js
// Factory para criar a instância do modelo de IA adequado

import ClaudeModel from './claude_model.js';

export default class ModelFactory {
    // Cria e inicializa uma instância do modelo de IA apropriado com base na configuração
    static async createModel(config) {
        const provider = config.ai_provider || 'claude';

        let model;

        // Por enquanto, apenas suporta Claude
        model = new ClaudeModel(config);

        try {
            return await model.initialize();
        } catch (error) {
            console.error(\`Erro ao inicializar modelo \${provider}:\`, error.message);
            throw error;
        }
    }

    // Retorna os modelos suportados
    static getSupportedProviders() {
        return [
            {
                id: 'claude',
                name: 'Claude (Anthropic)',
                models: [
                    'claude-3-7-sonnet-20250219',
                    'claude-3-5-sonnet-20240620',
                    'claude-3-haiku-20240307'
                ]
            }
        ];
    }

    // Retorna as dependências npm necessárias para cada provedor
    static getDependencies(provider) {
        return ['@anthropic-ai/sdk'];
    }
}`,
        );
        console.log('  ✓ Arquivos de modelo básicos criados');
      }
    } catch (error) {
      console.log(`  ⚠ Aviso: ${error.message}`);
    }
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

    // Seleciona o provedor de IA
    const provider = await new Promise(resolve => {
      console.log('\n📋 Escolha o provedor de IA:');
      console.log('  1. Claude (Anthropic)');
      console.log('  2. GPT (OpenAI)');
      console.log('  3. Gemini (Google)');
      rl.question('Escolha uma opção (1-3): ', answer => {
        switch (answer.trim()) {
          case '2':
            resolve('openai');
            break;
          case '3':
            resolve('gemini');
            break;
          default:
            resolve('claude');
        }
      });
    });

    config.ai_provider = provider;
    console.log(`  ✓ Provedor selecionado: ${provider}`);

    // Solicita API key apropriada
    let apiKeyPrompt, apiKeyField;
    switch (provider) {
      case 'openai':
        apiKeyPrompt = '🔐 Digite sua OpenAI API key: ';
        apiKeyField = 'openai_api_key';
        break;
      case 'gemini':
        apiKeyPrompt = '🔐 Digite sua Google Gemini API key: ';
        apiKeyField = 'gemini_api_key';
        break;
      default:
        apiKeyPrompt = '🔐 Digite sua Anthropic API key: ';
        apiKeyField = 'anthropic_api_key';
    }

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

    // Seleciona o modelo específico
    let modelOptions, modelField;
    switch (provider) {
      case 'openai':
        modelOptions = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
        modelField = 'openai_model';
        break;
      case 'gemini':
        modelOptions = ['gemini-pro', 'gemini-pro-vision'];
        modelField = 'gemini_model';
        break;
      default:
        modelOptions = [
          'claude-3-7-sonnet-20250219',
          'claude-3-5-sonnet-20240620',
          'claude-3-haiku-20240307',
        ];
        modelField = 'claude_model';
    }

    const modelChoice = await new Promise(resolve => {
      console.log('\n📋 Escolha o modelo específico:');
      modelOptions.forEach((model, index) => {
        console.log(`  ${index + 1}. ${model}`);
      });
      rl.question(`Escolha uma opção (1-${modelOptions.length}): `, answer => {
        const index = parseInt(answer.trim()) - 1;
        if (index >= 0 && index < modelOptions.length) {
          resolve(modelOptions[index]);
        } else {
          resolve(modelOptions[0]);
        }
      });
    });

    config[modelField] = modelChoice;
    console.log(`  ✓ Modelo selecionado: ${modelChoice}`);

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

  async makeExecutable() {
    console.log('\n🔧 Copiando e configurando scripts...');

    // Lista de arquivos a serem copiados
    const filesToCopy = [
      // CLI principal com comandos
      { src: 'src/ipcom-chat-cli.js', dest: 'ipcom-chat-cli.js' },

      // Interface Ink
      { src: 'src/mcp-ink-cli.mjs', dest: 'src/mcp-ink-cli.mjs' },

      // Orquestradores e libs essenciais
      { src: 'src/ai_orchestrator.ts', dest: 'ai_orchestrator.ts' },
      { src: 'src/ai_orchestrator_bash.ts', dest: 'ai_orchestrator_bash.ts' },

      // Arquivos de configuração
      { src: 'src/configure-ai.ts', dest: 'configure-ai.ts' },

      // Scripts shell
      { src: 'scripts/zsh_integration.sh', dest: 'zsh_integration.sh' },

      // Mantém deploy para Linux
      { src: 'scripts/deploy-linux.sh', dest: 'deploy-linux.sh' },
    ];

    // Copiar arquivos principais
    for (const file of filesToCopy) {
      try {
        const srcPath = path.join(process.cwd(), file.src);
        const destPath = path.join(this.mcpDir, file.dest);

        try {
          let content = await fs.readFile(srcPath, 'utf8');
          // Ajusta os imports para a estrutura instalada
          content = this.adjustImportsForInstallation(content, file.src);
          await fs.writeFile(destPath, content);
          console.log(`  ✓ Arquivo ${file.dest} copiado`);
        } catch (err) {
          console.log(
            `  ⚠ Não foi possível copiar ${file.src}: ${err.message}`,
          );
        }
      } catch (error) {
        console.log(`  ⚠ Erro ao processar ${file.src}: ${error.message}`);
      }
    }

    // Copiar libs
    try {
      const libsDir = path.join(process.cwd(), 'src', 'libs');
      const destLibsDir = path.join(this.mcpDir, 'libs');

      // Criar diretório libs se não existir
      try {
        await fs.access(destLibsDir);
      } catch {
        await fs.mkdir(destLibsDir, { recursive: true });
      }

      const libFiles = await fs.readdir(libsDir);
      for (const file of libFiles) {
        if (file.endsWith('.js')) {
          const srcPath = path.join(libsDir, file);
          const destPath = path.join(destLibsDir, file);
          const content = await fs.readFile(srcPath, 'utf8');
          await fs.writeFile(destPath, content);
        }
      }
      console.log(`  ✓ Arquivos de libs copiados`);
    } catch (error) {
      // Silenciosamente ignora se não existir libs
      // console.log(`  ⚠ Diretório libs não encontrado (normal em versões antigas)`);
    }

    // Copiar components da src (necessário para a v2)
    try {
      const componentsDir = path.join(process.cwd(), 'src', 'components');
      const destComponentsDir = path.join(this.mcpDir, 'components');

      // Criar diretório components se não existir
      try {
        await fs.access(destComponentsDir);
      } catch {
        await fs.mkdir(destComponentsDir, { recursive: true });
      }

      const componentFiles = await fs.readdir(componentsDir);
      for (const file of componentFiles) {
        const srcPath = path.join(componentsDir, file);
        const destPath = path.join(destComponentsDir, file);
        const content = await fs.readFile(srcPath);
        await fs.writeFile(destPath, content);
      }
      console.log(`  ✓ Componentes da interface copiados`);
    } catch (error) {
      console.log(`  ⚠ Erro ao copiar components: ${error.message}`);
    }

    // Copiar src (Nova interface Ink)
    try {
      const interfaceV2Dir = path.join(process.cwd(), 'src');
      const destInterfaceV2Dir = path.join(this.mcpDir, 'src');

      // Criar diretório src se não existir
      try {
        await fs.access(destInterfaceV2Dir);
      } catch {
        await fs.mkdir(destInterfaceV2Dir, { recursive: true });
      }

      // Copiar todos os arquivos da src
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

      await copyRecursive(interfaceV2Dir, destInterfaceV2Dir);
      console.log(`  ✓ Nova interface Ink (src) copiada`);
    } catch (error) {
      console.log(`  ⚠ Interface-v2 não encontrada (${error.message})`);
    }

    // ai_models agora é copiado junto com src
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
await import('./ipcom-chat-cli.js');`;

      const ipcomChatPath = path.join(this.mcpDir, 'ipcom-chat');
      await fs.writeFile(ipcomChatPath, ipcomChatContent);
      await fs.chmod(ipcomChatPath, 0o755);
      console.log('  ✓ Launcher ipcom-chat criado');
    } catch (error) {
      console.log(`  ⚠ Erro ao criar ipcom-chat: ${error.message}`);
    }

    // Criar mcp-configure launcher dinamicamente
    try {
      const mcpConfigureContent = `#!/usr/bin/env node

// Simple wrapper to run the AI configurator
import AIConfigurator from './configure-ai.js';

const configurator = new AIConfigurator();
configurator.run().catch(error => {
    console.error('❌ Erro na configuração:', error.message);
    process.exit(1);
});`;

      const mcpConfigurePath = path.join(this.mcpDir, 'mcp-configure');
      await fs.writeFile(mcpConfigurePath, mcpConfigureContent);
      await fs.chmod(mcpConfigurePath, 0o755);
      console.log('  ✓ Launcher mcp-configure criado');
    } catch (error) {
      console.log(`  ⚠ Erro ao criar mcp-configure: ${error.message}`);
    }

    // Copiar documentação
    try {
      const docsDir = path.join(process.cwd(), 'docs');
      const destDocsDir = path.join(this.mcpDir, 'docs');

      // Criar diretório docs se não existir
      await fs.mkdir(destDocsDir, { recursive: true });

      // Copiar arquivos de documentação
      const docFiles = await fs.readdir(docsDir);
      for (const file of docFiles) {
        if (file.endsWith('.md')) {
          const srcPath = path.join(docsDir, file);
          const destPath = path.join(destDocsDir, file);
          const content = await fs.readFile(srcPath, 'utf8');
          await fs.writeFile(destPath, content);
        }
      }
      console.log(`  ✓ Documentação copiada`);
    } catch (error) {
      console.log(`  ⚠ Erro ao copiar documentação: ${error.message}`);
    }

    const scripts = [
      'mcp-client.js',
      'mcp-assistant.js',
      'configure-ai.ts',
      'mcp-configure',
      'mcp-interactive.js',
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
          from: path.join(this.mcpDir, 'mcp-assistant.js'),
          to: path.join(binDir, 'ask'),
        },
        {
          from: path.join(this.mcpDir, 'mcp-client.js'),
          to: path.join(binDir, 'mcp-monitor'),
        },
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
              {
                from: path.join(this.mcpDir, 'mcp-assistant.js'),
                to: path.join(dir, 'ask'),
              },
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
  }

  async runTests() {
    console.log('\n🧪 Executando testes...');

    // Teste 1: Verifica se a API key funciona
    try {
      const test1 = execSync(
        `node ${path.join(this.mcpDir, 'mcp-assistant.js')} --system-info`,
        {
          cwd: this.mcpDir,
          encoding: 'utf8',
          stdio: 'pipe',
        },
      );
      console.log('  ✓ Sistema detectado corretamente');
    } catch (error) {
      console.log('  ⚠ Erro no teste do sistema:', error.message);
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
          console.log('\n✅ Você já está na versão mais recente!');
          return;
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
      console.log('2. Teste com: ask "como listar arquivos por tamanho"');
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
    console.log('  node setup.js --help             - Mostrar esta ajuda\n');
    console.log('💡 Nova opção --force: útil para desenvolvimento e testes!');
    return;
  }

  if (isUninstall) {
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
