#!/usr/bin/env node
// ~/.mcp-terminal/mcp-client.js

import { Anthropic } from '@anthropic-ai/sdk';
import SystemDetector from './system_detector.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import ModelFactory from './ai_models/model_factory.js';
import { createRequire } from 'module';

class MCPClient {
    constructor() {
        this.configPath = path.join(process.env.HOME, '.mcp-terminal/config.json');
        this.cachePath = path.join(process.env.HOME, '.mcp-terminal/cache');
        this.patternsPath = path.join(process.env.HOME, '.mcp-terminal/patterns');
        this.systemDetector = new SystemDetector();
        this.aiModel = null;
        this.loadConfig();
        this.loadPatterns();
    }

    async loadConfig() {
        try {
            const config = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(config);

            // Inicializa o modelo de IA com base na configuração
            try {
                this.aiModel = await ModelFactory.createModel(this.config);
            } catch (error) {
                console.error(`❌ Erro ao inicializar modelo de IA: ${error.message}`);

                // Fallback para Claude se configurado
                if (this.config.anthropic_api_key) {
                    this.anthropic = new Anthropic({
                        apiKey: this.config.anthropic_api_key
                    });
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar configuração.');
            process.exit(1);
        }
    }

    async loadPatterns() {
        try {
            await fs.access(this.patternsPath);
        } catch {
            await fs.mkdir(this.patternsPath, { recursive: true });
        }

        // Patterns locais baseados no sistema
        this.localPatterns = {
            npm: [
                {
                    pattern: /npm ERR! code ENOTFOUND/,
                    solution: "Problema de conectividade. Verifique sua internet ou proxy npm.",
                    command: "npm config list",
                    confidence: 0.9
                },
                {
                    pattern: /Module not found: Error: Can't resolve '(.+)'/,
                    solution: (match) => `Módulo '${match[1]}' não encontrado.`,
                    command: (match) => `npm install ${match[1]}`,
                    confidence: 0.95
                },
                {
                    pattern: /npm ERR! peer dep missing/,
                    solution: "Dependência peer não instalada.",
                    command: "npm install --save-peer",
                    confidence: 0.8
                }
            ],
            git: [
                {
                    pattern: /fatal: not a git repository/,
                    solution: "Não é um repositório Git.",
                    command: "git init",
                    confidence: 0.95
                },
                {
                    pattern: /Your branch is behind .+ by (\d+) commits/,
                    solution: "Seu branch está atrasado.",
                    command: "git pull origin main",
                    confidence: 0.9
                },
                {
                    pattern: /nothing to commit, working tree clean/,
                    solution: "Nenhuma alteração para commit.",
                    command: null,
                    confidence: 1.0
                }
            ],
            docker: [
                {
                    pattern: /docker: Cannot connect to the Docker daemon/,
                    solution: "Docker daemon não está rodando.",
                    command: "sudo systemctl start docker",
                    confidence: 0.95
                },
                {
                    pattern: /manifest unknown/,
                    solution: "Imagem não encontrada.",
                    command: "docker pull <image>",
                    confidence: 0.8
                }
            ],
            systemd: [
                {
                    pattern: /Failed to start (.+)\.service/,
                    solution: (match) => `Falha ao iniciar serviço ${match[1]}.`,
                    command: (match) => `sudo systemctl status ${match[1]}`,
                    confidence: 0.9
                }
            ]
        };

        // Adiciona patterns específicos do sistema
        const systemCommands = this.systemDetector.getSystemCommands();

        if (systemCommands.install && systemCommands.install.includes('apt')) {
            this.localPatterns.apt = [
                {
                    pattern: /E: Unable to locate package (.+)/,
                    solution: (match) => `Pacote '${match[1]}' não encontrado.`,
                    command: "sudo apt update",
                    confidence: 0.8
                },
                {
                    pattern: /dpkg: error processing/,
                    solution: "Erro no dpkg. Tente reparar.",
                    command: "sudo apt --fix-broken install",
                    confidence: 0.7
                }
            ];
        }

        if (systemCommands.install && systemCommands.install.includes('pacman')) {
            this.localPatterns.pacman = [
                {
                    pattern: /error: target not found: (.+)/,
                    solution: (match) => `Pacote '${match[1]}' não encontrado.`,
                    command: "sudo pacman -Sy",
                    confidence: 0.8
                }
            ];
        }

        // Carrega padrões de arquivos JSON no diretório patterns
        try {
            const patternFiles = await fs.readdir(this.patternsPath);
            for (const file of patternFiles) {
                if (file.endsWith('.json')) {
                    try {
                        const content = await fs.readFile(path.join(this.patternsPath, file), 'utf8');
                        const patternData = JSON.parse(content);

                        if (patternData.patterns && Array.isArray(patternData.patterns)) {
                            const category = file.replace('.json', '');
                            this.localPatterns[category] = [...(this.localPatterns[category] || []), ...patternData.patterns];
                        }
                    } catch (err) {
                        console.error(`Erro ao carregar padrão ${file}:`, err.message);
                    }
                }
            }
        } catch (error) {
            console.error('Erro ao carregar padrões:', error.message);
        }
    }

    async analyze(commandData) {
        const { command, exitCode, stdout, stderr, duration } = commandData;

        // 1. Verifica se deve analisar
        if (!this.shouldAnalyze(command, exitCode)) {
            return;
        }

        // 2. Busca solução local
        const localSolution = await this.analyzeLocally(command, stdout, stderr);
        if (localSolution && localSolution.confidence > 0.7) {
            this.displaySolution(localSolution, 'local');
            await this.cache(command, exitCode, localSolution);
            return;
        }

        // 3. Verifica cache
        const cached = await this.getCachedSolution(command, exitCode, stderr);
        if (cached) {
            this.displaySolution(cached, 'cached');
            return;
        }

        // 4. Análise com LLM
        if (this.config.enable_monitoring) {
            const llmSolution = await this.analyzeWithLLM({
                command, exitCode, stdout, stderr, duration
            });

            if (llmSolution) {
                this.displaySolution(llmSolution, 'llm');
                await this.cache(command, exitCode, llmSolution);
            }
        }
    }

    shouldAnalyze(command, exitCode) {
        // Ignora comandos com sucesso
        if (exitCode === 0) return false;

        // Ignora comandos simples
        const ignoredCommands = ['ls', 'cd', 'pwd', 'clear', 'echo', 'cat'];
        const baseCommand = command.split(' ')[0];

        if (ignoredCommands.includes(baseCommand)) return false;

        // Verifica se o comando está na lista de monitoramento
        const monitorCommands = this.config.monitor_commands || [];
        return monitorCommands.some(cmd => command.startsWith(cmd));
    }

    async analyzeLocally(command, stdout, stderr) {
        const output = `${stdout}\n${stderr}`.toLowerCase();
        const baseCommand = command.split(' ')[0];

        if (!this.localPatterns[baseCommand]) {
            return null;
        }

        for (const pattern of this.localPatterns[baseCommand]) {
            const match = output.match(pattern.pattern);
            if (match) {
                const solution = typeof pattern.solution === 'function'
                    ? pattern.solution(match)
                    : pattern.solution;

                const suggestedCommand = typeof pattern.command === 'function'
                    ? pattern.command(match)
                    : pattern.command;

                return {
                    description: solution,
                    command: suggestedCommand,
                    confidence: pattern.confidence,
                    category: 'error_fix',
                    source: 'local_pattern'
                };
            }
        }

        return null;
    }

    async analyzeWithLLM(commandData) {
        try {
            const systemContext = this.systemDetector.getSystemContext();

            // Se estamos usando o novo sistema de modelos
            if (this.aiModel) {
                return await this.aiModel.analyzeCommand({
                    ...commandData,
                    systemContext
                });
            }

            // Fallback para o sistema antigo (Claude direto)
            // Destructure commandData to avoid redeclaration error
            const { command: cmdStr, exitCode: exitC, stdout: stdOut, stderr: stdErr, duration: dur } = commandData;

            const prompt = `Você é um especialista em Linux que analisa comandos que falharam.

SISTEMA:
- OS: ${systemContext.os}
- Distribuição: ${systemContext.distro} ${systemContext.version}
- Package Manager: ${systemContext.packageManager}
- Shell: ${systemContext.shell}

COMANDO EXECUTADO: ${cmdStr}
EXIT CODE: ${exitC}
TEMPO DE EXECUÇÃO: ${dur}s

STDOUT:
${stdOut || '(vazio)'}

STDERR:
${stdErr || '(vazio)'}

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

Seja conciso e específico para o sistema detectado.`;

            const response = await this.anthropic.messages.create({
                model: this.config.claude_model || this.config.model || "claude-3-7-sonnet-20250219",
                max_tokens: 1500,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            const analysis = response.content[0].text;

            // Extrai comando sugerido da resposta
            const commandMatch = analysis.match(/💻 COMANDO: (.+?)(?:\n|$)/);
            const suggestedCommand = commandMatch ? commandMatch[1].replace(/`/g, '').trim() : null;

            return {
                description: analysis,
                command: suggestedCommand,
                confidence: 0.8,
                category: 'llm_analysis',
                source: this.aiModel ? this.aiModel.getProviderName() : 'anthropic'
            };

        } catch (error) {
            console.error('Erro na análise LLM:', error);
            return null;
        }
    }

    displaySolution(solution, source) {
        console.log('\n' + '='.repeat(60));
        console.log('🔍 MCP Terminal Analysis');
        console.log('='.repeat(60));

        if (source === 'local') {
            console.log('📋 Solução local encontrada:');
        } else if (source === 'cached') {
            console.log('💾 Solução em cache:');
        } else {
            console.log('🤖 Análise IA:');
        }

        console.log('\n' + solution.description);

        if (solution.command) {
            console.log('\n🔧 Comando sugerido:');
            console.log(`   ${solution.command}`);

            if (this.config.quick_fixes && solution.confidence > 0.8) {
                console.log('\n❓ Executar automaticamente? (y/N):');
                // Implementação de execução automática seria aqui
            }
        }

        console.log('\n' + '='.repeat(60) + '\n');
    }

    async cache(command, exitCode, solution) {
        try {
            const hash = this.hashCommand(command, exitCode);
            const cacheFile = path.join(this.cachePath, `${hash}.json`);

            const cacheData = {
                command,
                exitCode,
                solution,
                timestamp: Date.now(),
                system: this.systemDetector.systemInfo
            };

            await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
        } catch (error) {
            console.error('Erro ao cachear solução:', error);
        }
    }

    async getCachedSolution(command, exitCode, stderr) {
        try {
            const hash = this.hashCommand(command, exitCode);
            const cacheFile = path.join(this.cachePath, `${hash}.json`);

            const content = await fs.readFile(cacheFile, 'utf8');
            const cached = JSON.parse(content);

            // Verifica se não está expirado
            const ageHours = (Date.now() - cached.timestamp) / (1000 * 60 * 60);
            if (ageHours > this.config.cache_duration_hours) {
                await fs.unlink(cacheFile);
                return null;
            }

            return cached.solution;
        } catch {
            return null;
        }
    }

    hashCommand(command, exitCode) {
        const normalized = command.replace(/\/[^\s]+\//g, '/PATH/');
        return crypto.createHash('sha256')
            .update(`${normalized}:${exitCode}`)
            .digest('hex')
            .substring(0, 16);
    }

    // Método para limpar cache antigo
    async cleanOldCache() {
        try {
            const files = await fs.readdir(this.cachePath);
            const now = Date.now();
            const maxAge = this.config.cache_duration_hours * 60 * 60 * 1000;

            for (const file of files) {
                const filePath = path.join(this.cachePath, file);
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    const data = JSON.parse(content);

                    if (now - data.timestamp > maxAge) {
                        await fs.unlink(filePath);
                    }
                } catch {
                    // Arquivo inválido, remove
                    await fs.unlink(filePath);
                }
            }
        } catch (error) {
            console.error('Erro ao limpar cache:', error);
        }
    }

    // Gera estatísticas de uso
    async getStats() {
        try {
            const files = await fs.readdir(this.cachePath);
            const stats = {
                totalSolutions: files.length,
                byCategory: {},
                byCommand: {},
                recentAnalyses: []
            };

            for (const file of files) {
                try {
                    const filePath = path.join(this.cachePath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const data = JSON.parse(content);

                    // Por categoria
                    const category = data.solution.category || 'unknown';
                    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

                    // Por comando
                    const baseCommand = data.command.split(' ')[0];
                    stats.byCommand[baseCommand] = (stats.byCommand[baseCommand] || 0) + 1;

                    // Análises recentes
                    stats.recentAnalyses.push({
                        command: data.command,
                        timestamp: data.timestamp,
                        source: data.solution.source
                    });
                } catch {}
            }

            // Ordena análises recentes
            stats.recentAnalyses.sort((a, b) => b.timestamp - a.timestamp);
            stats.recentAnalyses = stats.recentAnalyses.slice(0, 10);

            return stats;
        } catch (error) {
            console.error('Erro ao gerar estatísticas:', error);
            return null;
        }
    }
}

// CLI para análise manual
async function main() {
    const require = createRequire(import.meta.url);
    const minimist = require('minimist');
    const args = minimist(process.argv.slice(2));

    const client = new MCPClient();

    if (args.clean) {
        console.log('🧹 Limpando cache antigo...');
        await client.cleanOldCache();
        console.log('✅ Cache limpo!');
        return;
    }

    if (args.stats) {
        console.log('📊 Estatísticas do MCP:');
        const stats = await client.getStats();
        if (stats) {
            console.log(`\n📈 Total de soluções: ${stats.totalSolutions}`);
            console.log('\n📋 Por categoria:');
            Object.entries(stats.byCategory).forEach(([cat, count]) => {
                console.log(`   ${cat}: ${count}`);
            });
            console.log('\n💻 Por comando:');
            Object.entries(stats.byCommand).forEach(([cmd, count]) => {
                console.log(`   ${cmd}: ${count}`);
            });
            console.log('\n📅 Análises recentes:');
            stats.recentAnalyses.forEach((analysis, i) => {
                const date = new Date(analysis.timestamp).toLocaleString();
                console.log(`   ${i + 1}. ${analysis.command} (${analysis.source}) - ${date}`);
            });
        }
        return;
    }

    // Análise manual
    const commandData = {
        command: args.command || 'unknown',
        exitCode: parseInt(args['exit-code']) || 1,
        stdout: args.stdout || '',
        stderr: args.stderr || '',
        duration: parseFloat(args.duration) || 0
    };

    await client.analyze(commandData);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export default MCPClient;
