// ai_models/claude_model.js
// Modelo Claude unificado com suporte a Tools nativas

import Anthropic from '@anthropic-ai/sdk';
import BaseAIModel from './base_model.js';

export default class ClaudeModel extends BaseAIModel {
    constructor(config) {
        super(config);
        this.client = null;
        // Modelos que suportam tools (Claude 3+)
        this.modelName = config.claude_model || 'claude-3-5-sonnet-20241022';

        // Lista de modelos que suportam tools
        this.toolSupportedModels = [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307',
            'claude-sonnet-4-20250514',
            'claude-opus-4-1-20250805'
        ];
    }

    async initialize() {
        if (!this.config.anthropic_api_key) {
            throw new Error('API key da Anthropic não configurada');
        }

        this.client = new Anthropic({
            apiKey: this.config.anthropic_api_key
        });

        this.isInitialized = true;
    }

    supportsTools() {
        // Verifica se o modelo atual suporta tools
        return this.toolSupportedModels.some(model =>
            this.modelName.includes(model.split('-')[1]) // verifica versão
        );
    }

    async askWithTools({ system, messages, tools, tool_choice = { type: 'auto' }, signal }) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.supportsTools()) {
            throw new Error(`Modelo ${this.modelName} não suporta tools. Use Claude 3+ ou Claude Opus 4+`);
        }

        try {
            // Formato exato da API conforme documentação
            const messageParams = {
                model: this.modelName,
                max_tokens: 4096,
                system: system,
                messages: messages,
                tools: tools,
                tool_choice: tool_choice
            };

            // Prepare request options (signal goes here, not in messageParams)
            const requestOptions = {};
            if (signal) {
                requestOptions.signal = signal;
                console.log('🟢 AbortSignal passed to Anthropic SDK (ClaudeModel)');
            }

            const response = await this.client.messages.create(messageParams, requestOptions);

            return response;
        } catch (error) {
            // Check if the error is due to cancellation
            if (error.name === 'AbortError' || (error.message && error.message.includes('aborted'))) {
                console.log('🔴 Request was cancelled by user (ClaudeModel)');
                throw new Error('CANCELLED');
            }

            console.error('Erro ao chamar Claude com tools:', error);
            throw error;
        }
    }

    // Manter compatibilidade com o sistema antigo
    async askCommand(prompt, context) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Build messages array with conversation history if available
            const messages = [];

            // Add conversation history if it exists
            if (context.history && context.history.length > 0) {
                // Add all previous messages from history
                // Note: current question is passed separately as 'prompt' parameter
                const previousMessages = context.history.filter(msg => msg.content !== prompt);

                previousMessages.forEach(msg => {
                    // Include user messages even if they were cancelled (for context continuity)
                    // Only skip assistant's interruption markers
                    const isInterruptionMarker = (msg.role === 'assistant') &&
                        (msg.content.includes('[Interrompido]') ||
                         msg.content.includes('[Processamento interrompido') ||
                         msg.content.includes('[Resposta interrompida]'));

                    if (!isInterruptionMarker) {
                        messages.push({
                            role: msg.role,
                            content: msg.content
                        });
                    }
                });
            }

            // Add current question
            messages.push({
                role: 'user',
                content: prompt
            });

            // DEBUG: Log exactly what we're sending to Anthropic
            console.log('\n========== SENDING TO ANTHROPIC API ==========');
            console.log('Model:', this.modelName);
            console.log('System prompt:', `Você é um interpretador de comandos silencioso para shell Linux.

FORMATO OBRIGATÓRIO DE RESPOSTA:
• Forneça APENAS a informação solicitada
• Comece DIRETAMENTE com a resposta
• Use linguagem técnica e objetiva
• Para perguntas sim/não: responda "Sim" ou "Não" seguido de explicação breve
• Para comandos: forneça o comando e explicação concisa
• Para JSON: retorne APENAS o objeto JSON sem formatação markdown

EXEMPLOS DE FORMATO CORRETO:
Pergunta: "Estamos em um Mac?"
Resposta: "Sim, o sistema é Darwin (macOS ARM64)."

Pergunta: "Como vejo logs?"
Resposta: "Use journalctl -xe para logs recentes do sistema ou tail -f /var/log/syslog para acompanhar em tempo real."

COMPORTAMENTO: Você é uma ferramenta, não um assistente conversacional.`);
            console.log('Messages array being sent:');
            console.log(JSON.stringify(messages, null, 2));
            console.log('Total messages:', messages.length);
            console.log('===============================================\n');

            const response = await this.client.messages.create({
                model: this.modelName,
                max_tokens: 2048,
                system: `Você é um interpretador de comandos silencioso para shell Linux.

FORMATO OBRIGATÓRIO DE RESPOSTA:
• Forneça APENAS a informação solicitada
• Comece DIRETAMENTE com a resposta
• Use linguagem técnica e objetiva
• Para perguntas sim/não: responda "Sim" ou "Não" seguido de explicação breve
• Para comandos: forneça o comando e explicação concisa
• Para JSON: retorne APENAS o objeto JSON sem formatação markdown

EXEMPLOS DE FORMATO CORRETO:
Pergunta: "Estamos em um Mac?"
Resposta: "Sim, o sistema é Darwin (macOS ARM64)."

Pergunta: "Como vejo logs?"
Resposta: "Use journalctl -xe para logs recentes do sistema ou tail -f /var/log/syslog para acompanhar em tempo real."

COMPORTAMENTO: Você é uma ferramenta, não um assistente conversacional.`,
                messages: messages
            });

            return response.content[0].text;
        } catch (error) {
            console.error('Erro ao chamar Claude:', error);
            throw error;
        }
    }

    async analyzeCommand(error, context) {
        const prompt = `Analisar erro de comando Linux:
Erro: ${error}
Sistema: ${context.os || 'Linux'}
Distribuição: ${context.distro || 'Unknown'}

Forneça uma solução concisa.`;

        return this.askCommand(prompt, context);
    }

    getProviderName() {
        return 'Claude (Tools)';
    }

    getModelName() {
        return this.modelName;
    }

    getProviderInfo() {
        return {
            provider: 'Claude (Native Tools)',
            model: this.modelName,
            features: ['tools', 'parallel_execution', 'iterative_processing']
        };
    }
}
