// ~/.mcp-terminal/ai_models/model_factory.js
// Factory para criar a instância do modelo de IA adequado

import ClaudeModel from './claude_model.js';
import OpenAIModel from './openai_model.js';
import GeminiModel from './gemini_model.js';

export default class ModelFactory {
    // Cria e inicializa uma instância do modelo de IA apropriado com base na configuração
    static async createModel(config) {
        const provider = config.ai_provider || 'claude';
        
        let model;
        
        switch (provider.toLowerCase()) {
            case 'claude':
            case 'anthropic':
                model = new ClaudeModel(config);
                break;
                
            case 'gpt':
            case 'openai':
                model = new OpenAIModel(config);
                break;
                
            case 'gemini':
            case 'google':
                model = new GeminiModel(config);
                break;
                
            default:
                throw new Error(`Provedor de IA desconhecido: ${provider}`);
        }
        
        try {
            return await model.initialize();
        } catch (error) {
            console.error(`Erro ao inicializar modelo ${provider}:`, error.message);
            throw error;
        }
    }
    
    // Retorna os modelos suportados
    static getSupportedProviders() {
        return [
            {
                id: 'claude',
                name: 'Claude (Anthropic)',
                models: [
                    'claude-3-7-sonnet-20250219',
                    'claude-3-5-sonnet-20240620',
                    'claude-3-haiku-20240307'
                ]
            },
            {
                id: 'openai',
                name: 'GPT (OpenAI)',
                models: [
                    'gpt-4o',
                    'gpt-4-turbo',
                    'gpt-3.5-turbo'
                ]
            },
            {
                id: 'gemini',
                name: 'Gemini (Google)',
                models: [
                    'gemini-pro',
                    'gemini-pro-vision'
                ]
            }
        ];
    }
    
    // Retorna as dependências npm necessárias para cada provedor
    static getDependencies(provider) {
        const dependencies = {
            claude: ['@anthropic-ai/sdk'],
            openai: ['openai'],
            gemini: ['@google/generative-ai']
        };
        
        if (provider) {
            return dependencies[provider.toLowerCase()] || [];
        }
        
        // Retorna todas as dependências se nenhum provedor for especificado
        return [
            ...dependencies.claude,
            ...dependencies.openai,
            ...dependencies.gemini
        ];
    }
}