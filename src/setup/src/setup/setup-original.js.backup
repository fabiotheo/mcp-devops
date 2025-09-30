#!/usr/bin/env node
// setup.ts - Entrada principal simplificada
// Substituindo setup-orchestrator.ts (620 linhas) + 4 classes por 1 arquivo funcional (~200 linhas)
import { loadConfig, saveConfig, migrateConfig } from './setup-config.js';
import { createDirectories, installFiles, verifyInstallation } from './setup-install.js';
import { configureShell } from './setup-shell.js';
import { validateSystem, runBasicTests } from './setup-validate.js';
import { getUserHome, detectShell, detectPlatform } from './setup-system.js';
import * as path from 'path';
import * as readline from 'readline';
/**
 * Cria configuração padrão do setup
 */
function createSetupConfig(options = {}) {
    const homeDir = getUserHome();
    const mcpDir = path.join(homeDir, '.mcp-terminal');
    return {
        mcpDir,
        configDir: path.join(mcpDir, 'config'),
        homeDir,
        platform: detectPlatform(),
        shell: detectShell(),
        version: '1.0.0', // TODO: ler do package.json
        isRoot: process.getuid ? process.getuid() === 0 : false,
        verbose: options.verbose || false
    };
}
/**
 * Prompt interativo para configuração
 */
async function promptConfiguration() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    const question = (prompt) => {
        return new Promise((resolve) => {
            rl.question(prompt, resolve);
        });
    };
    try {
        console.log('\n🔧 Configuração do MCP Terminal Assistant\n');
        const provider = await question('Provedor de IA (claude/openai/gemini) [claude]: ') || 'claude';
        let apiKey = '';
        if (provider === 'claude') {
            apiKey = await question('Chave da API Anthropic: ');
        }
        else if (provider === 'openai') {
            apiKey = await question('Chave da API OpenAI: ');
        }
        else if (provider === 'gemini') {
            apiKey = await question('Chave da API Google: ');
        }
        const config = {
            ai_provider: provider,
            version: '1.0.0',
            created: new Date().toISOString()
        };
        // Definir chave baseado no provedor
        if (provider === 'claude')
            config.anthropic_api_key = apiKey;
        else if (provider === 'openai')
            config.openai_api_key = apiKey;
        else if (provider === 'gemini')
            config.gemini_api_key = apiKey;
        return config;
    }
    finally {
        rl.close();
    }
}
/**
 * Função principal de setup - SUBSTITUI TODAS AS 5 CLASSES ORIGINAIS
 */
export async function setup(options = {}) {
    const config = createSetupConfig(options);
    console.log('🚀 MCP Terminal Assistant Setup');
    console.log('=====================================');
    if (config.verbose) {
        console.log(`📁 Diretório: ${config.mcpDir}`);
        console.log(`🖥️  Sistema: ${config.platform}`);
        console.log(`🐚 Shell: ${config.shell}`);
        console.log('');
    }
    try {
        // ETAPA 1: Validar sistema
        console.log('1️⃣ Validando sistema...');
        const systemValid = await validateSystem(config);
        if (!systemValid) {
            throw new Error('Sistema não atende aos requisitos mínimos');
        }
        // ETAPA 2: Criar diretórios
        console.log('2️⃣ Criando diretórios...');
        await createDirectories(config);
        // ETAPA 3: Migrar configuração antiga (se existir)
        console.log('3️⃣ Verificando configurações...');
        const migrated = await migrateConfig(config);
        if (migrated && config.verbose) {
            console.log('✅ Configuração migrada');
        }
        // ETAPA 4: Carregar/criar configuração
        let apiConfig;
        try {
            apiConfig = await loadConfig(config);
            console.log('✅ Configuração carregada');
        }
        catch {
            if (options.auto) {
                // Configuração padrão para modo automático
                apiConfig = {
                    ai_provider: 'claude',
                    version: '1.0.0',
                    created: new Date().toISOString()
                };
                console.log('✅ Configuração padrão criada (modo auto)');
            }
            else {
                // Prompt interativo
                apiConfig = await promptConfiguration();
                console.log('✅ Configuração criada');
            }
            await saveConfig(config, apiConfig);
        }
        // ETAPA 5: Instalar arquivos
        console.log('4️⃣ Instalando arquivos...');
        await installFiles(config, options);
        // ETAPA 6: Configurar shell
        console.log('5️⃣ Configurando shell...');
        await configureShell(config);
        // ETAPA 7: Validar instalação
        console.log('6️⃣ Validando instalação...');
        const installValid = await verifyInstallation(config);
        if (!installValid) {
            throw new Error('Validação da instalação falhou');
        }
        // ETAPA 8: Testes finais (opcional)
        if (!options.auto) {
            console.log('7️⃣ Executando testes...');
            const testResults = await runBasicTests(config);
            const failedTests = testResults.filter(t => !t.passed);
            if (failedTests.length > 0) {
                console.warn(`⚠️ ${failedTests.length} teste(s) falharam:`);
                failedTests.forEach(test => {
                    console.warn(`  - ${test.name}: ${test.error}`);
                });
            }
            else {
                console.log('✅ Todos os testes passaram');
            }
        }
        // SUCESSO
        console.log('\n🎉 Setup concluído com sucesso!');
        console.log('=====================================');
        console.log('💡 Execute "source ~/.bashrc" ou reinicie o terminal');
        console.log('🚀 Use "mcp-assistant --help" para começar');
    }
    catch (error) {
        console.error('\n❌ Erro no setup:');
        console.error('=====================================');
        console.error(error.message);
        if (config.verbose && error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        console.error('\n💡 Tente executar com --verbose para mais detalhes');
        process.exit(1);
    }
}
/**
 * Parse de argumentos da linha de comando
 */
function parseArgs(args) {
    const options = {};
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--auto':
                options.auto = true;
                break;
            case '--upgrade':
                options.upgrade = true;
                break;
            case '--force':
                options.force = true;
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--help':
            case '-h':
                console.log(`
MCP Terminal Assistant Setup

Uso: node setup.ts [opções]

Opções:
  --auto      Instalação automática sem prompts
  --upgrade   Atualizar instalação existente  
  --force     Forçar sobrescrita de arquivos
  --verbose   Modo verboso com mais detalhes
  --help      Mostrar esta ajuda

Exemplos:
  node setup.ts                    # Setup interativo
  node setup.ts --auto             # Setup automático
  node setup.ts --upgrade --force  # Atualização forçada
  node setup.ts --verbose          # Setup com detalhes
`);
                process.exit(0);
                break;
        }
    }
    return options;
}
/**
 * Entry point para execução direta
 */
if (import.meta.url === `file://${process.argv[1]}`) {
    const options = parseArgs(process.argv.slice(2));
    setup(options);
}
