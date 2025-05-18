import { Anthropic } from '@anthropic-ai/sdk';
import BaseAIModel from './base_model.js';

export default class ClaudeModel extends BaseAIModel {
    constructor(config) {
        super(config);
        this.modelName = config.model || 'claude-3-5-haiku-20241022';
    }

    async initialize() {
        this.client = new Anthropic({
            apiKey: this.config.anthropic_api_key
        });
        return true;
    }

    async generateCompletion(prompt, options = {}) {
        const response = await this.client.messages.create({
            model: this.modelName,
            max_tokens: options.max_tokens || 2000,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        return response.content[0].text;
    }

    async generateMessage(messages, options = {}) {
        const response = await this.client.messages.create({
            model: this.modelName,
            max_tokens: options.max_tokens || 2000,
            messages: messages
        });

        return response;
    }

    getModelInfo() {
        return {
            name: 'Claude',
            version: this.modelName,
            capabilities: ['text-generation', 'reasoning', 'chat']
        };
    }
}