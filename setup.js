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
                } catch (err) {
                    console.log(`  ⚠ Não foi possível copiar ${file}: ${err.message}`);
                }
            }
            
            console.log('  ✓ Arquivos de modelo copiados');
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
        console.log('\n🔧 Tornando scripts executáveis...');
        
        const scripts = [
            'mcp-client.js',
            'mcp-assistant.js',
            'setup.js'
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
                console.log('  ✓ Configuração válida');
            }
        } catch {
            console.log('  ⚠ Problema na configuração');
        }
    }

    async uninstall() {
        console.log('🗑️  Desinstalando MCP Terminal...');
        
        // Remove integração do .zshrc
        try {
            const zshrc = await fs.readFile(this.zshrcPath, 'utf8');
            const newZshrc = zshrc.replace(/\n# MCP Terminal Integration\nsource ~\/\.mcp-terminal\/zsh-integration\.sh\n/g, '');
            await fs.writeFile(this.zshrcPath, newZshrc);
            console.log('  ✓ Integração removida do .zshrc');
        } catch {}

        // Remove diretório
        try {
            await fs.rm(this.mcpDir, { recursive: true, force: true });
            console.log('  ✓ Arquivos removidos');
        } catch {}

        // Remove links globais
        const binDir = path.join(process.env.HOME, '.local/bin');
        try {
            await fs.unlink(path.join(binDir, 'ask'));
            await fs.unlink(path.join(binDir, 'mcp-monitor'));
            console.log('  ✓ Links globais removidos');
        } catch {}

        console.log('✅ Desinstalação concluída');
    }
}

// CLI
async function main() {
    const args = process.argv.slice(2);
    const setup = new MCPSetup();

    if (args.includes('--uninstall')) {
        await setup.uninstall();
    } else {
        await setup.setup();
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export default MCPSetup;