// Classe base para todos os modelos de IA
export default class BaseAIModel {
    constructor(config) {
        this.config = config;
    }

    async initialize() {
        throw new Error('O método initialize deve ser implementado');
    }

    async generateCompletion(prompt, options = {}) {
        throw new Error('O método generateCompletion deve ser implementado');
    }

    async generateMessage(messages, options = {}) {
        throw new Error('O método generateMessage deve ser implementado');
    }

    getModelInfo() {
        throw new Error('O método getModelInfo deve ser implementado');
    }
}