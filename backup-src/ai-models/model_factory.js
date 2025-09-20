// ~/.mcp-terminal/ai_models/model_factory.js
// Factory para criar a instância do modelo de IA adequado

import ClaudeModel from './claude_model.js';
import ClaudeModelWithTools from './claude_model_tools.js';

export default class ModelFactory {
    // Cria e inicializa uma instância do modelo de IA apropriado com base na configuração
    static async createModel(config) {
        const provider = config.ai_provider || 'claude';
        const useTools = config.use_native_tools || false;

        let model;

        // Se deve usar tools nativas do Claude
        if (provider === 'claude' && useTools) {
            model = new ClaudeModelWithTools(config);
        } else {
            // Modelo tradicional
            model = new ClaudeModel(config);
        }

        try {
            await model.initialize();
            return model;
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
                    'claude-3-5-sonnet-20241022',
                    'claude-3-5-haiku-20241022',
                    'claude-3-opus-20240229',
                    'claude-3-sonnet-20240229',
                    'claude-3-haiku-20240307',
                    'claude-sonnet-4-20250514',
                    'claude-opus-4-1-20250805'
                ],
                supportsTools: true
            }
        ];
    }
    
    // Retorna as dependências npm necessárias para cada provedor
    static getDependencies(provider) {
        return ['@anthropic-ai/sdk'];
    }
}