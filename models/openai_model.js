import BaseAIModel from './base_model.js';

export default class OpenAIModel extends BaseAIModel {
    constructor(config) {
        super(config);
        this.modelName = config.openai_model || 'gpt-4o';
    }

    async initialize() {
        try {
            const { OpenAI } = await import('openai');
            this.client = new OpenAI({
                apiKey: this.config.openai_api_key
            });
            return true;
        } catch (error) {
            throw new Error(`Erro ao inicializar OpenAI: ${error.message}`);
        }
    }

    async generateCompletion(prompt, options = {}) {
        const response = await this.client.chat.completions.create({
            model: this.modelName,
            max_tokens: options.max_tokens || 2000,
            messages: [{ role: 'user', content: prompt }]
        });

        return response.choices[0].message.content;
    }

    async generateMessage(messages, options = {}) {
        const response = await this.client.chat.completions.create({
            model: this.modelName,
            max_tokens: options.max_tokens || 2000,
            messages: messages
        });

        return {
            content: [{ text: response.choices[0].message.content }],
            model: this.modelName
        };
    }

    getModelInfo() {
        return {
            name: 'OpenAI',
            version: this.modelName,
            capabilities: ['text-generation', 'reasoning', 'chat']
        };
    }
}