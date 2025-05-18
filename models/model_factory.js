import ClaudeModel from './claude_model.js';
import GeminiModel from './gemini_model.js';
import OpenAIModel from './openai_model.js';

export default class ModelFactory {
    static async createModel(config) {
        const provider = config.ai_provider?.toLowerCase() || 'claude';
        let model;

        switch (provider) {
            case 'claude':
            case 'anthropic':
                model = new ClaudeModel(config);
                break;
            case 'gemini':
            case 'google':
                model = new GeminiModel(config);
                break;
            case 'openai':
            case 'gpt':
                model = new OpenAIModel(config);
                break;
            default:
                throw new Error(`Provedor de IA não suportado: ${provider}`);
        }

        await model.initialize();
        return model;
    }

    static getAvailableProviders() {
        return [
            {
                id: 'claude',
                name: 'Claude (Anthropic)',
                models: [
                    'claude-3-5-haiku-20241022',
                    'claude-3-7-sonnet-20250219',
                    'claude-3-opus-20240229'
                ],
                requiresKey: 'anthropic_api_key'
            },
            {
                id: 'gemini',
                name: 'Gemini (Google)',
                models: [
                    'gemini-pro',
                    'gemini-1.5-pro'
                ],
                requiresKey: 'gemini_api_key'
            },
            {
                id: 'openai',
                name: 'GPT (OpenAI)',
                models: [
                    'gpt-4o',
                    'gpt-4-turbo',
                    'gpt-3.5-turbo'
                ],
                requiresKey: 'openai_api_key'
            }
        ];
    }
}