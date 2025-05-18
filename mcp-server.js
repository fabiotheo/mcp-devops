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
            console.error('L Erro ao carregar configura��o:', error.message);
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
            console.log(`=� MCP Server rodando em http://localhost:${this.port}`);
        });

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`� Porta ${this.port} j� est� em uso. Escolha outra porta.`);
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
        
        // Responder a requisi��es OPTIONS para preflight CORS
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
                    res.end(JSON.stringify({ error: 'Comando n�o fornecido' }));
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
                res.end(JSON.stringify({ error: 'Requisi��o inv�lida' }));
            }
            
        } else if (parsedUrl.pathname === '/api/ask' && req.method === 'POST') {
            // Rota para perguntas sobre comandos
            try {
                const data = JSON.parse(requestBody);
                
                if (!data.question) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Pergunta n�o fornecida' }));
                    return;
                }

                const result = await this.askCommand(data.question);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Requisi��o inv�lida' }));
            }
            
        } else if (parsedUrl.pathname === '/api/system-info' && req.method === 'GET') {
            // Rota para obter informa��es do sistema
            const systemInfo = this.systemDetector.getSystemContext();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(systemInfo));
            
        } else if (parsedUrl.pathname === '/api/health' && req.method === 'GET') {
            // Rota para health check
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
            
        } else {
            // Rota n�o encontrada
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Rota n�o encontrada' }));
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

            const prompt = `Voc� � um especialista em Linux que analisa comandos que falharam.

SISTEMA:
- OS: ${systemContext.os}
- Distribui��o: ${systemContext.distro} ${systemContext.version}
- Package Manager: ${systemContext.packageManager}
- Shell: ${systemContext.shell}

COMANDO EXECUTADO: ${command}
EXIT CODE: ${exitCode}
TEMPO DE EXECU��O: ${duration}s

STDOUT:
${stdout || '(vazio)'}

STDERR:
${stderr || '(vazio)'}

AN�LISE NECESS�RIA:
1. Identifique o problema principal
2. Explique a causa do erro
3. Forne�a uma solu��o espec�fica para este sistema Linux
4. Sugira um comando para corrigir (se aplic�vel)
5. Inclua comandos preventivos se relevante

FORMATO DA RESPOSTA:
= PROBLEMA: [Descri��o clara do problema]
=�  SOLU��O: [Explica��o da solu��o]
=� COMANDO: [Comando espec�fico para corrigir, se aplic�vel]
�  PREVEN��O: [Como evitar no futuro]

Seja conciso e espec�fico para o sistema detectado.`;

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
            const commandMatch = analysis.match(/=� COMANDO: (.+?)(?:\n|$)/);
            const suggestedCommand = commandMatch ? commandMatch[1].replace(/`/g, '').trim() : null;

            return {
                analysis: analysis,
                command: suggestedCommand
            };

        } catch (error) {
            console.error('Erro na an�lise:', error);
            return { error: 'Falha ao analisar comando' };
        }
    }

    async askCommand(question) {
        try {
            // Contexto do sistema
            const systemContext = this.systemDetector.getSystemContext();
            
            const prompt = `Voc� � um assistente especializado em Linux/Unix que ajuda usu�rios a encontrar o comando correto para suas tarefas.

INFORMA��ES DO SISTEMA:
- OS: ${systemContext.os}
- Distribui��o: ${systemContext.distro}
- Vers�o: ${systemContext.version}
- Package Manager: ${systemContext.packageManager}
- Shell: ${systemContext.shell}
- Arquitetura: ${systemContext.architecture}
- Kernel: ${systemContext.kernel}
- Capacidades: ${systemContext.capabilities.join(', ')}

COMANDOS DISPON�VEIS NESTE SISTEMA:
${JSON.stringify(systemContext.commands, null, 2)}

PERGUNTA DO USU�RIO: ${question}

INSTRU��ES:
1. Analise a pergunta considerando o sistema espec�fico do usu�rio
2. Forne�a o comando exato para a distribui��o/sistema detectado
3. Explique brevemente o que o comando faz
4. Se houver varia��es por distribui��o, mencione isso
5. Inclua op��es �teis do comando
6. Se apropriado, sugira comandos relacionados

FORMATO DA RESPOSTA:
=' COMANDO:
\`comando exato aqui\`

=� EXPLICA��O:
[Explica��o clara do que faz]

=� OP��ES �TEIS:
[Varia��es ou op��es importantes]

� OBSERVA��ES:
[Avisos ou considera��es especiais]

Responda de forma direta e pr�tica.`;

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
            return { error: 'Erro ao processar requisi��o' };
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
    
    console.log(`=� Iniciando MCP Server na porta ${port}...`);
    
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