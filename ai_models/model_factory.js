// ~/.mcp-terminal/ai_models/model_factory.js
// Factory para criar a instância do modelo de IA adequado

import ClaudeModel from './claude_model.js';

export default class ModelFactory {
    // Cria e inicializa uma instância do modelo de IA apropriado com base na configuração
    static async createModel(config) {
        const provider = config.ai_provider || 'claude';
        
        let model;
        
        // Por enquanto, apenas suporta Claude
        model = new ClaudeModel(config);
        
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
            }
        ];
    }
    
    // Retorna as dependências npm necessárias para cada provedor
    static getDependencies(provider) {
        return ['@anthropic-ai/sdk'];
    }
}