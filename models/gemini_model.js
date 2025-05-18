import BaseAIModel from './base_model.js';

export default class GeminiModel extends BaseAIModel {
    constructor(config) {
        super(config);
        this.modelName = config.gemini_model || 'gemini-pro';
    }

    async initialize() {
        try {
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            this.client = new GoogleGenerativeAI(this.config.gemini_api_key);
            this.model = this.client.getGenerativeModel({ model: this.modelName });
            return true;
        } catch (error) {
            throw new Error(`Erro ao inicializar Gemini: ${error.message}`);
        }
    }

    async generateCompletion(prompt, options = {}) {
        const result = await this.model.generateContent(prompt);
        return result.response.text();
    }

    async generateMessage(messages, options = {}) {
        // Converter formato Claude para formato Gemini
        const geminiMessages = messages.map(msg => ({
            parts: [{ text: msg.content }],
            role: msg.role === 'assistant' ? 'model' : 'user'
        }));

        const chat = this.model.startChat();
        const result = await chat.sendMessages(geminiMessages);
        
        return {
            content: [{ text: result.response.text() }],
            model: this.modelName
        };
    }

    getModelInfo() {
        return {
            name: 'Gemini',
            version: this.modelName,
            capabilities: ['text-generation', 'reasoning', 'chat']
        };
    }
}