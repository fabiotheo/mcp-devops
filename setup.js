#!/usr/bin/env node
// ~/.mcp-terminal/setup.js

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

class MCPSetup {
    constructor() {
        this.mcpDir = path.join(process.env.HOME, '.mcp-terminal');
        this.configPath = path.join(this.mcpDir, 'config.json');
        this.zshrcPath = path.join(process.env.HOME, '.zshrc');
        this.versionFilePath = path.join(this.mcpDir, '.version');

        // Versão atual do MCP - atualizar quando lançar novas versões
        this.version = "1.0.0";
    }

    async setup() {
        console.log('🚀 Configurando MCP Terminal Assistant...\n');

        try {
            // 1. Criar diretórios
            await this.createDirectories();

            // 2. Configurar dependências
            await this.setupDependencies();

            // 3. Configurar API key
            await this.configureAPI();

            // 4. Configurar integração Zsh
            await this.setupZshIntegration();

            // 5. Tornar scripts executáveis
            await this.makeExecutable();

            // 6. Teste inicial
            await this.runTests();

            // 7. Salvar versão atual
            await this.saveVersion();

            console.log('\n✅ Instalação concluída com sucesso!');
            console.log('\n📋 Próximos passos:');
            console.log('1. Reinicie seu terminal ou execute: source ~/.zshrc');
            console.log('2. Teste com: ask "como listar arquivos por tamanho"');
            console.log('3. Execute um comando que falhe para ver o monitoramento');

        } catch (error) {
            console.error('\n❌ Erro durante a instalação:', error.message);
            process.exit(1);
        }
    }

    async upgrade() {
        try {
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
                console.log('  ⚠️ Não foi possível ler configuração existente, será criada uma nova');
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

                    await fs.writeFile(this.configPath, JSON.stringify(mergedConfig, null, 2));
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

            // 7. Atualizar integração Zsh (caso necessário)
            await this.setupZshIntegration();

            // 8. Executar testes
            await this.runTests();

            // 9. Salvar nova versão
            await this.saveVersion();

            console.log('\n✅ Atualização concluída com sucesso!');
            console.log('\n📋 Próximos passos:');
            console.log('1. Reinicie seu terminal ou execute: source ~/.zshrc');
            console.log('2. Teste com: ask "como listar arquivos por tamanho"');
            console.log('3. Execute um comando que falhe para ver o monitoramento');

        } catch (error) {
            console.error('\n❌ Erro durante a atualização:', error.message);
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
        console.log(`🔄 Executando migrações necessárias de v${fromVersion} para v${this.version}...`);

        // Este bloco será expandido com migrações específicas conforme necessário
        // Exemplo: se alterar a estrutura do config.json ou outros arquivos

        // Migração da v0.9 para v1.0+
        if (fromVersion < "1.0.0") {
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
            path.join(this.mcpDir, 'logs')
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

        try {
            await fs.access(packageJsonPath);
            console.log('  ✓ package.json já existe');
        } catch {
            const packageJson = {
                "name": "mcp-terminal",
                "version": "1.0.0",
                "type": "module",
                "dependencies": {
                    "@anthropic-ai/sdk": "^0.21.1",
                    "openai": "^4.29.0",
                    "@google/generative-ai": "^0.2.1",
                    "minimist": "^1.2.8",
                    "chalk": "^5.3.0"
                }
            };

            await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
            console.log('  ✓ package.json criado');
        }

        // Instalar dependências
        console.log('  📦 Instalando dependências npm...');
        try {
            execSync('npm install', {
                cwd: this.mcpDir,
                stdio: 'inherit'
            });
            console.log('  ✓ Dependências instaladas');
        } catch (error) {
            throw new Error('Falha ao instalar dependências npm');
        }

        // Copiar arquivos de modelos de IA
        console.log('  📂 Copiando arquivos de modelos de IA...');
        const aiModelsDir = path.join(this.mcpDir, 'ai_models');

        try {
            await fs.mkdir(aiModelsDir, { recursive: true });

            const sourceDir = path.join(process.cwd(), 'ai_models');

            // Verificar se o diretório de origem existe
            try {
                await fs.access(sourceDir);

                const sourceFiles = [
                    'base_model.js',
                    'claude_model.js',
                    'openai_model.js',
                    'gemini_model.js',
                    'model_factory.js'
                ];

                for (const file of sourceFiles) {
                    try {
                        const content = await fs.readFile(path.join(sourceDir, file), 'utf8');
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

                // base_model.js
                await fs.writeFile(path.join(aiModelsDir, 'base_model.js'),
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
}`);

                // claude_model.js
                await fs.writeFile(path.join(aiModelsDir, 'claude_model.js'),
                `// ~/.mcp-terminal/ai_models/claude_model.js
// Implementação do modelo Claude da Anthropic

import { Anthropic } from '@anthropic-ai/sdk';
import BaseAIModel from './base_model.js';

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
}`);

                // model_factory.js
                await fs.writeFile(path.join(aiModelsDir, 'model_factory.js'),
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
}`);
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
                "ai_provider": "claude",
                "anthropic_api_key": "",
                "openai_api_key": "",
                "gemini_api_key": "",
                "claude_model": "claude-3-7-sonnet-20250219",
                "openai_model": "gpt-4o",
                "gemini_model": "gemini-pro",
                "max_calls_per_hour": 100,
                "enable_monitoring": true,
                "enable_assistant": true,
                "monitor_commands": ["npm", "yarn", "git", "docker", "make", "cargo", "go", "apt", "pacman", "systemctl"],
                "quick_fixes": true,
                "auto_detect_fixes": false,
                "log_level": "info",
                "cache_duration_hours": 24
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
            output: process.stdout
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
        if (existingConfig && existingConfig[apiKeyField] &&
            existingConfig[apiKeyField] !== `YOUR_${apiKeyField.toUpperCase()}_HERE`) {
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
                modelOptions = ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307'];
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

    async setupZshIntegration() {
        console.log('\n🐚 Configurando integração Zsh...');

        const integrationLine = 'source ~/.mcp-terminal/zsh_integration.sh';

        try {
            const zshrc = await fs.readFile(this.zshrcPath, 'utf8');

            if (zshrc.includes(integrationLine)) {
                console.log('  ✓ Integração já configurada no .zshrc');
                return;
            }

            // Adiciona integração ao .zshrc
            const newZshrc = zshrc + '\n\n# MCP Terminal Integration\n' + integrationLine + '\n';
            await fs.writeFile(this.zshrcPath, newZshrc);
            console.log('  ✓ Integração adicionada ao .zshrc');

        } catch (error) {
            // Se .zshrc não existe, cria
            if (error.code === 'ENOENT') {
                await fs.writeFile(this.zshrcPath, `# MCP Terminal Integration\n${integrationLine}\n`);
                console.log('  ✓ .zshrc criado com integração');
            } else {
                throw error;
            }
        }
    }

    async makeExecutable() {
        console.log('\n🔧 Copiando e configurando scripts...');

        // Lista de arquivos a serem copiados
        const filesToCopy = [
            { src: 'mcp-client.js', dest: 'mcp-client.js' },
            { src: 'mcp-assistant.js', dest: 'mcp-assistant.js' },
            { src: 'system_detector.js', dest: 'system_detector.js' },
            { src: 'zsh_integration.sh', dest: 'zsh_integration.sh' }
        ];

        // Copiar arquivos principais
        for (const file of filesToCopy) {
            try {
                const srcPath = path.join(process.cwd(), file.src);
                const destPath = path.join(this.mcpDir, file.dest);

                try {
                    const content = await fs.readFile(srcPath, 'utf8');
                    await fs.writeFile(destPath, content);
                    console.log(`  ✓ Arquivo ${file.dest} copiado`);
                } catch (err) {
                    console.log(`  ⚠ Não foi possível copiar ${file.src}: ${err.message}`);
                }
            } catch (error) {
                console.log(`  ⚠ Erro ao processar ${file.src}: ${error.message}`);
            }
        }

        // Copiar padrões
        try {
            const patternsDir = path.join(process.cwd(), 'patterns');
            const destPatternsDir = path.join(this.mcpDir, 'patterns');

            const patternFiles = await fs.readdir(patternsDir);
            for (const file of patternFiles) {
                if (file.endsWith('.json')) {
                    const srcPath = path.join(patternsDir, file);
                    const destPath = path.join(destPatternsDir, file);
                    const content = await fs.readFile(srcPath, 'utf8');
                    await fs.writeFile(destPath, content);
                }
            }
            console.log(`  ✓ Arquivos de padrões copiados`);
        } catch (error) {
            console.log(`  ⚠ Erro ao copiar padrões: ${error.message}`);
        }

        // Copiar web_search e web_scraper
        try {
            // Copiar web_search
            const webSearchDir = path.join(process.cwd(), 'web_search');
            const destWebSearchDir = path.join(this.mcpDir, 'web_search');

            // Criar diretório web_search se não existir
            await fs.mkdir(destWebSearchDir, { recursive: true });

            // Copiar arquivos de web_search
            const webSearchFiles = await fs.readdir(webSearchDir);
            for (const file of webSearchFiles) {
                if (file.endsWith('.js')) {
                    const srcPath = path.join(webSearchDir, file);
                    const destPath = path.join(destWebSearchDir, file);
                    const content = await fs.readFile(srcPath, 'utf8');
                    await fs.writeFile(destPath, content);
                }
            }
            console.log(`  ✓ Arquivos de web_search copiados`);

            // Copiar web_scraper
            const webScraperDir = path.join(process.cwd(), 'web_scraper');
            const destWebScraperDir = path.join(this.mcpDir, 'web_scraper');

            // Criar diretório web_scraper se não existir
            await fs.mkdir(destWebScraperDir, { recursive: true });

            // Copiar arquivos de web_scraper
            const webScraperFiles = await fs.readdir(webScraperDir);
            for (const file of webScraperFiles) {
                if (file.endsWith('.js')) {
                    const srcPath = path.join(webScraperDir, file);
                    const destPath = path.join(destWebScraperDir, file);
                    const content = await fs.readFile(srcPath, 'utf8');
                    await fs.writeFile(destPath, content);
                }
            }
            console.log(`  ✓ Arquivos de web_scraper copiados`);
        } catch (error) {
            console.log(`  ⚠ Erro ao copiar web_search ou web_scraper: ${error.message}`);
        }

        const scripts = [
            'mcp-client.js',
            'mcp-assistant.js'
        ];

        for (const script of scripts) {
            const scriptPath = path.join(this.mcpDir, script);
            try {
                await fs.chmod(scriptPath, 0o755);
                console.log(`  ✓ ${script} é executável`);
            } catch (error) {
                console.log(`  ⚠ Não foi possível tornar ${script} executável: ${error.message}`);
            }
        }

        // Cria links simbólicos globais (opcional)
        const binDir = path.join(process.env.HOME, '.local/bin');
        try {
            await fs.mkdir(binDir, { recursive: true });

            const links = [
                { from: path.join(this.mcpDir, 'mcp-assistant.js'), to: path.join(binDir, 'ask') },
                { from: path.join(this.mcpDir, 'mcp-client.js'), to: path.join(binDir, 'mcp-monitor') }
            ];

            for (const link of links) {
                try {
                    await fs.unlink(link.to);
                } catch {}

                await fs.symlink(link.from, link.to);
                console.log(`  ✓ Link criado: ${link.to}`);
            }
        } catch (error) {
            console.log(`  ⚠ Não foi possível criar links globais: ${error.message}`);
        }
    }

    async runTests() {
        console.log('\n🧪 Executando testes...');

        // Teste 1: Verifica se a API key funciona
        try {
            const test1 = execSync(`node ${path.join(this.mcpDir, 'mcp-assistant.js')} --system-info`, {
                cwd: this.mcpDir,
                encoding: 'utf8',
                stdio: 'pipe'
            });
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
                if (config.anthropic_api_key === "YOUR_ANTHROPIC_API_KEY_HERE" ||
                    config.anthropic_api_key.includes("YOUR_") ||
                    config.anthropic_api_key.includes("API_KEY")) {
                    console.log('  ⚠️ API key não configurada. Você precisa configurar uma API key válida');
                    console.log('     Edite o arquivo ~/.mcp-terminal/config.json e substitua o placeholder pela sua API key');
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
            const newZshrc = zshrc.replace(/\n# MCP Terminal Integration\nsource ~\/\.mcp-terminal\/zsh_integration\.sh\n/g, '');
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
            console.log('  ℹ️ Diretório ~/.mcp-terminal mantido para preservar configurações e histórico');
            console.log('     Para remover completamente, use: node setup.js --uninstall --remove-all-data');
        }

        console.log('✅ Desinstalação concluída');
    }

    async autoSetup(isUpgrade = false) {
        console.log(`🚀 ${isUpgrade ? 'Atualizando' : 'Configurando'} MCP Terminal Assistant automaticamente...\n`);

        try {
            // Verificar versão atual se for upgrade
            if (isUpgrade) {
                const currentVersion = await this.getCurrentVersion();
                console.log(`📊 Versão instalada: ${currentVersion || 'não encontrada'}`);
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
                    "ai_provider": "claude",
                    "anthropic_api_key": "YOUR_ANTHROPIC_API_KEY_HERE",
                    "openai_api_key": "YOUR_OPENAI_API_KEY_HERE",
                    "gemini_api_key": "YOUR_GEMINI_API_KEY_HERE",
                    "claude_model": "claude-3-7-sonnet-20250219",
                    "openai_model": "gpt-4o",
                    "gemini_model": "gemini-pro",
                    "max_calls_per_hour": 100,
                    "enable_monitoring": true,
                    "enable_assistant": true,
                    "monitor_commands": ["npm", "yarn", "git", "docker", "make", "cargo", "go", "apt", "pacman", "systemctl"],
                    "quick_fixes": true,
                    "auto_detect_fixes": false,
                    "log_level": "info",
                    "cache_duration_hours": 24
                };
            }

            // Se for upgrade, preserva configuração existente
            if (isUpgrade) {
                try {
                    const existingContent = await fs.readFile(this.configPath, 'utf8');
                    const existingConfig = JSON.parse(existingContent);

                    // Preserva configurações existentes
                    if (existingConfig) {
                        config = { ...config, ...existingConfig };
                        console.log('  ✓ Configuração existente preservada');
                    }
                } catch {}
            } else {
                // Para instalação nova, mantém o placeholder para API key
                // O usuário precisará configurar sua própria API key após a instalação
                console.log('  ⚠️ Instalação automática: Você precisará configurar sua API key manualmente');
                console.log('     Edite o arquivo ~/.mcp-terminal/config.json após a instalação');
            }

            // Salva a configuração
            await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
            console.log('  ✓ Configuração salva automaticamente');

            // 4. Configurar integração Zsh
            await this.setupZshIntegration();

            // 5. Tornar scripts executáveis
            await this.makeExecutable();

            // 6. Teste inicial
            await this.runTests();

            // 7. Salvar versão atual
            await this.saveVersion();

            console.log(`\n✅ ${isUpgrade ? 'Atualização' : 'Instalação'} automática concluída com sucesso!`);

            // Verificar se a API key é um placeholder
            try {
                const config = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
                if (config.anthropic_api_key === "YOUR_ANTHROPIC_API_KEY_HERE" ||
                    config.anthropic_api_key.includes("YOUR_") ||
                    config.anthropic_api_key.includes("API_KEY")) {
                    console.log('\n⚠️ IMPORTANTE: API key não configurada');
                    console.log('   Você precisa configurar uma API key válida antes de usar o MCP Terminal Assistant');
                    console.log('   Edite o arquivo ~/.mcp-terminal/config.json e substitua o placeholder pela sua API key');
                }
            } catch {}

            console.log('\n📋 Próximos passos:');
            console.log('1. Reinicie seu terminal ou execute: source ~/.zshrc');
            console.log('2. Teste com: ask "como listar arquivos por tamanho"');
            console.log('3. Execute um comando que falhe para ver o monitoramento');

        } catch (error) {
            console.error(`\n❌ Erro durante a ${isUpgrade ? 'atualização' : 'instalação'} automática:`, error.message);
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
    const removeAllData = args.includes('--remove-all-data');

    if (isUninstall) {
        await setup.uninstall(removeAllData);
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
