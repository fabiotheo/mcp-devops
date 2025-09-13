#!/usr/bin/env node
// ~/.mcp-terminal/mcp-server.js

import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import url from 'url';
import { Anthropic } from '@anthropic-ai/sdk';
import SystemDetector from './system_detector.js';

class MCPServer {
    constructor(port = 4321) {
        this.port = port;
        this.configPath = path.join(process.env.HOME, '.mcp-terminal/config.json');
        this.cachePath = path.join(process.env.HOME, '.mcp-terminal/cache');
        this.systemDetector = new SystemDetector();
        this.loadConfig();
        this.startServer();
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
            process.exit(1);
        }
    }

    startServer() {
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res).catch(err => {
                console.error('Erro no servidor:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Erro interno do servidor' }));
            });
        });

        this.server.listen(this.port, () => {
            console.log(`✅ MCP Server rodando em http://localhost:${this.port}`);
        });

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`❌ Porta ${this.port} já está em uso. Escolha outra porta.`);
                process.exit(1);
            } else {
                console.error('Erro no servidor:', err);
            }
        });
    }

    async handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const requestBody = await this.getRequestBody(req);

        // Definir headers CORS para permitir acesso local
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Responder a requisições OPTIONS para preflight CORS
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // Rotas
        if (parsedUrl.pathname === '/api/command' && req.method === 'POST') {
            // Rota para analisar comandos
            try {
                const data = JSON.parse(requestBody);

                if (!data.command) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Comando não fornecido' }));
                    return;
                }

                const commandData = {
                    command: data.command,
                    exitCode: data.exitCode || 1,
                    stdout: data.stdout || '',
                    stderr: data.stderr || '',
                    duration: data.duration || 0
                };

                const analysis = await this.analyzeCommand(commandData);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(analysis));

            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Requisição inválida' }));
            }

        } else if (parsedUrl.pathname === '/api/ask' && req.method === 'POST') {
            // Rota para perguntas sobre comandos
            try {
                const data = JSON.parse(requestBody);

                if (!data.question) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Pergunta não fornecida' }));
                    return;
                }

                const result = await this.askCommand(data.question);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));

            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Requisição inválida' }));
            }

        } else if (parsedUrl.pathname === '/api/system-info' && req.method === 'GET') {
            // Rota para obter informações do sistema
            const systemInfo = this.systemDetector.getSystemContext();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(systemInfo));

        } else if (parsedUrl.pathname === '/api/health' && req.method === 'GET') {
            // Rota para health check
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));

        } else {
            // Rota não encontrada
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Rota não encontrada' }));
        }
    }

    async getRequestBody(req) {
        return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                resolve(body);
            });
        });
    }

    async analyzeCommand(commandData) {
        try {
            const systemContext = this.systemDetector.getSystemContext();
            const { command, exitCode, stdout, stderr, duration } = commandData;

            const prompt = `Você é um especialista em Linux que analisa comandos que falharam.

SISTEMA:
- OS: ${systemContext.os}
- Distribuição: ${systemContext.distro} ${systemContext.version}
- Package Manager: ${systemContext.packageManager}
- Shell: ${systemContext.shell}

COMANDO EXECUTADO: ${command}
EXIT CODE: ${exitCode}
TEMPO DE EXECUÇÃO: ${duration}s

STDOUT:
${stdout || '(vazio)'}

STDERR:
${stderr || '(vazio)'}

ANÁLISE NECESSÁRIA:
1. Identifique o problema principal
2. Explique a causa do erro
3. Forneça uma solução específica para este sistema Linux
4. Sugira um comando para corrigir (se aplicável)
5. Inclua comandos preventivos se relevante

FORMATO DA RESPOSTA:
🔍 PROBLEMA: [Descrição clara do problema]
✅ SOLUÇÃO: [Explicação da solução]
💻 COMANDO: [Comando específico para corrigir, se aplicável]
🛡️ PREVENÇÃO: [Como evitar no futuro]

Seja conciso e específico para o sistema detectado.`;

            const response = await this.anthropic.messages.create({
                model: this.config.model,
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
                analysis: analysis,
                command: suggestedCommand
            };

        } catch (error) {
            console.error('Erro na análise:', error);
            return { error: 'Falha ao analisar comando' };
        }
    }

    async askCommand(question) {
        try {
            // Contexto do sistema
            const systemContext = this.systemDetector.getSystemContext();

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
💻 COMANDO:
\`comando exato aqui\`

📝 EXPLICAÇÃO:
[Explicação clara do que faz]

⚙️ OPÇÕES ÚTEIS:
[Variações ou opções importantes]

ℹ️ OBSERVAÇÕES:
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

            const responseText = response.content[0].text;

            // Extrai comando sugerido da resposta
            const commandMatch = responseText.match(/`([^`]+)`/);
            const command = commandMatch ? commandMatch[1] : null;

            return {
                response: responseText,
                command: command
            };

        } catch (error) {
            console.error('Erro ao consultar assistente:', error);
            return { error: 'Erro ao processar requisição' };
        }
    }

    stop() {
        if (this.server) {
            this.server.close();
            console.log('Servidor parado');
        }
    }
}

// CLI
async function main() {
    const args = process.argv.slice(2);
    const port = args.includes('--port') ?
        parseInt(args[args.indexOf('--port') + 1]) : 4321;

    console.log(`🚀 Iniciando MCP Server na porta ${port}...`);

    const server = new MCPServer(port);

    // Graceful shutdown
    const shutdown = () => {
        console.log('\nDesligando servidor...');
        server.stop();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export default MCPServer;