#!/usr/bin/env node
// ~/.mcp-terminal/mcp-assistant.js

import { Anthropic } from '@anthropic-ai/sdk';
import SystemDetector from './system_detector.js';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

class MCPAssistant {
    constructor() {
        this.configPath = path.join(process.env.HOME, '.mcp-terminal/config.json');
        this.systemDetector = new SystemDetector();
        this.loadConfig();
    }

    async loadConfig() {
        try {
            const config = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(config);
            
            this.anthropic = new Anthropic({
                apiKey: this.config.anthropic_api_key
            });
        } catch (error) {
            console.error('❌ Erro ao carregar configuração:', error.message);
            console.error('Execute: mcp-setup --configure');
            process.exit(1);
        }
    }

    async askCommand(question) {
        try {
            // Contexto do sistema
            const systemContext = this.systemDetector.getSystemContext();
            const currentDir = process.cwd();
            
            // Informações adicionais do diretório atual
            const dirInfo = await this.getCurrentDirectoryInfo();

            const prompt = `Você é um assistente especializado em Linux/Unix que ajuda usuários a encontrar o comando correto para suas tarefas.

INFORMAÇÕES DO SISTEMA:
- OS: ${systemContext.os}
- Distribuição: ${systemContext.distro}
- Versão: ${systemContext.version}
- Package Manager: ${systemContext.packageManager}
- Shell: ${systemContext.shell}
- Arquitetura: ${systemContext.architecture}
- Kernel: ${systemContext.kernel}
- Capacidades: ${systemContext.capabilities.join(', ')}

DIRETÓRIO ATUAL: ${currentDir}
${dirInfo}

COMANDOS DISPONÍVEIS NESTE SISTEMA:
${JSON.stringify(systemContext.commands, null, 2)}

PERGUNTA DO USUÁRIO: ${question}

INSTRUÇÕES:
1. Analise a pergunta considerando o sistema específico do usuário
2. Forneça o comando exato para a distribuição/sistema detectado
3. Explique brevemente o que o comando faz
4. Se houver variações por distribuição, mencione isso
5. Inclua opções úteis do comando
6. Se apropriado, sugira comandos relacionados

FORMATO DA RESPOSTA:
🔧 COMANDO:
\`comando exato aqui\`

📝 EXPLICAÇÃO:
[Explicação clara do que faz]

💡 OPÇÕES ÚTEIS:
[Variações ou opções importantes]

⚠️ OBSERVAÇÕES:
[Avisos ou considerações especiais]

Responda de forma direta e prática.`;

            const response = await this.anthropic.messages.create({
                model: this.config.model,
                max_tokens: 2000,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            return response.content[0].text;
        } catch (error) {
            console.error('Erro ao consultar assistente:', error);
            return '❌ Erro ao conectar com o assistente. Verifique sua configuração.';
        }
    }

    async getCurrentDirectoryInfo() {
        try {
            const stats = await fs.stat('.');
            
            // Lista alguns arquivos do diretório atual
            let files = [];
            let dirs = [];
            
            try {
                const entries = await fs.readdir('.', { withFileTypes: true });
                files = entries.filter(e => e.isFile()).map(e => e.name).slice(0, 5);
                dirs = entries.filter(e => e.isDirectory()).map(e => e.name).slice(0, 5);
            } catch {}

            // Verifica se é um projeto específico
            let projectType = '';
            try {
                if (await fs.access('package.json')) projectType += 'Node.js ';
                if (await fs.access('Cargo.toml')) projectType += 'Rust ';
                if (await fs.access('go.mod')) projectType += 'Go ';
                if (await fs.access('requirements.txt')) projectType += 'Python ';
                if (await fs.access('Makefile')) projectType += 'Make ';
                if (await fs.access('.git')) projectType += 'Git ';
            } catch {}

            return `
INFORMAÇÕES DO DIRETÓRIO:
- Tipo de projeto: ${projectType || 'Genérico'}
- Arquivos: ${files.join(', ') || 'Nenhum visível'}
- Diretórios: ${dirs.join(', ') || 'Nenhum visível'}`;

        } catch (error) {
            return '';
        }
    }

    // Método para executar comando sugerido
    async executeCommand(command, confirm = true) {
        if (confirm) {
            console.log(`\n🔍 Comando sugerido: ${command}`);
            console.log('Executar? (y/N): ');
            
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });

            return new Promise((resolve) => {
                readline.question('', (answer) => {
                    readline.close();
                    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                        try {
                            const result = execSync(command, { 
                                encoding: 'utf8',
                                stdio: ['inherit', 'pipe', 'pipe']
                            });
                            console.log(result);
                            resolve(true);
                        } catch (error) {
                            console.error('Erro ao executar:', error.message);
                            resolve(false);
                        }
                    } else {
                        console.log('Comando não executado.');
                        resolve(false);
                    }
                });
            });
        }
    }

    // Histórico de comandos sugeridos
    async saveCommandHistory(question, command) {
        const historyPath = path.join(process.env.HOME, '.mcp-terminal/command-history.json');
        
        try {
            let history = [];
            try {
                const content = await fs.readFile(historyPath, 'utf8');
                history = JSON.parse(content);
            } catch {}

            history.unshift({
                timestamp: new Date().toISOString(),
                question,
                command,
                system: this.systemDetector.systemInfo
            });

            // Manter apenas os últimos 100
            history = history.slice(0, 100);

            await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
        } catch (error) {
            console.error('Erro ao salvar histórico:', error);
        }
    }
}

// CLI
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
🤖 MCP Terminal Assistant

USO:
  ask "como listar arquivos por tamanho"
  ask "como encontrar processo usando porta 3000"
  ask "como instalar nodejs"
  ask --history                    # Ver histórico
  ask --system-info               # Info do sistema

EXEMPLOS:
  ask "listar todas as pastas por ordem de tamanho em ./"
  ask "como parar um serviço systemd"
  ask "comando para ver logs do nginx"
        `);
        process.exit(0);
    }

    const assistant = new MCPAssistant();

    if (args[0] === '--history') {
        const historyPath = path.join(process.env.HOME, '.mcp-terminal/command-history.json');
        try {
            const history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
            console.log('\n📚 Últimos comandos sugeridos:\n');
            history.slice(0, 10).forEach((entry, i) => {
                console.log(`${i + 1}. ${entry.question}`);
                console.log(`   💻 ${entry.command}`);
                console.log(`   📅 ${new Date(entry.timestamp).toLocaleString()}`);
                console.log('');
            });
        } catch {
            console.log('Nenhum histórico encontrado.');
        }
        return;
    }

    if (args[0] === '--system-info') {
        const info = assistant.systemDetector.getSystemContext();
        console.log('\n🖥️  Informações do Sistema:\n');
        console.log(JSON.stringify(info, null, 2));
        return;
    }

    const question = args.join(' ');
    console.log('🤔 Analisando sua pergunta...\n');
    
    const response = await assistant.askCommand(question);
    console.log(response);

    // Tenta extrair o comando da resposta
    const commandMatch = response.match(/`([^`]+)`/);
    if (commandMatch) {
        const command = commandMatch[1];
        await assistant.saveCommandHistory(question, command);
        
        console.log('\n❓ Deseja executar o comando agora? (y/N): ');
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        readline.question('', async (answer) => {
            readline.close();
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                console.log(`\n▶️  Executando: ${command}\n`);
                try {
                    execSync(command, { stdio: 'inherit' });
                } catch (error) {
                    console.error(`\n❌ Erro: ${error.message}`);
                }
            }
        });
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export default MCPAssistant;