// ~/.mcp-terminal/ai_models/claude_model.js
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
🛠️  SOLUÇÃO: [Explicação da solução]
💻 COMANDO: [Comando específico para corrigir, se aplicável]
⚠️  PREVENÇÃO: [Como evitar no futuro]

Seja conciso e específico para o sistema detectado.`;

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
            const commandMatch = analysis.match(/💻 COMANDO: (.+?)(?:\n|$)/);
            const command = commandMatch ? commandMatch[1].replace(/`/g, '').trim() : null;

            return {
                description: analysis,
                command: command,
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
🔧 COMANDO:
\`comando exato aqui\`

📝 EXPLICAÇÃO:
[Explicação clara do que faz]

💡 OPÇÕES ÚTEIS:
[Variações ou opções importantes]

⚠️ OBSERVAÇÕES:
[Avisos ou considerações especiais]

Responda de forma direta e prática.`;

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
            return `❌ Erro ao conectar com o assistente Claude. Verifique sua configuração da API Anthropic.`;
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
}