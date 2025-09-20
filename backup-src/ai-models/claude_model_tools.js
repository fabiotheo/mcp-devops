// ai_models/claude_model_tools.js
// Modelo Claude com suporte a Tools nativas seguindo documentação oficial

import Anthropic from '@anthropic-ai/sdk';
import BaseAIModel from './base_model.js';

export default class ClaudeModelWithTools extends BaseAIModel {
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

    async askWithTools({ system, messages, tools, tool_choice = { type: 'auto' } }) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.supportsTools()) {
            throw new Error(`Modelo ${this.modelName} não suporta tools. Use Claude 3+ ou Claude Opus 4+`);
        }

        try {
            // Formato exato da API conforme documentação
            const response = await this.client.messages.create({
                model: this.modelName,
                max_tokens: 4096,
                system: system,
                messages: messages,
                tools: tools,
                tool_choice: tool_choice
            });

            return response;
        } catch (error) {
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
            const response = await this.client.messages.create({
                model: this.modelName,
                max_tokens: 2048,
                system: "Você é um assistente Linux especializado. Responda de forma concisa e precisa.",
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
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