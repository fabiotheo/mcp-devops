// ~/.mcp-terminal/ai_models/base_model.js
// Classe base para todos os modelos de IA

export default class BaseAIModel {
    constructor(config) {
        this.config = config;
    }

    // Método para inicializar o cliente da API
    async initialize() {
        throw new Error('Método initialize() deve ser implementado pela classe filha');
    }

    // Método para analisar comando com falha
    async analyzeCommand(commandData) {
        throw new Error('Método analyzeCommand() deve ser implementado pela classe filha');
    }

    // Método para responder perguntas sobre comandos
    async askCommand(question, systemContext) {
        throw new Error('Método askCommand() deve ser implementado pela classe filha');
    }

    // Retorna o nome do provedor
    getProviderName() {
        throw new Error('Método getProviderName() deve ser implementado pela classe filha');
    }

    // Retorna o nome do modelo atual
    getModelName() {
        throw new Error('Método getModelName() deve ser implementado pela classe filha');
    }

    // Método para validar API key (retorna true se válida)
    async validateApiKey() {
        throw new Error('Método validateApiKey() deve ser implementado pela classe filha');
    }

    // Retorna informações do provedor e modelo
    getProviderInfo() {
        return {
            provider: this.getProviderName(),
            model: this.getModelName()
        };
    }
}