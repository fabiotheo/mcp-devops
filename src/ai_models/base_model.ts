// ~/.mcp-terminal/ai_models/base_model.ts
// Classe base para todos os modelos de IA

// Import centralized types
import type {
  AIModelConfig,
  CommandData,
  SystemContext,
  AICommandAnalysisResult,
  AICommandResponse
} from '../types/services.js';

export default abstract class BaseAIModel {
  protected config: AIModelConfig;

  constructor(config: AIModelConfig) {
    this.config = config;
  }

  // Método para inicializar o cliente da API
  abstract initialize(): Promise<void>;

  // Método para analisar comando com falha
  abstract analyzeCommand(commandData: CommandData): Promise<AICommandAnalysisResult>;

  // Método para responder perguntas sobre comandos
  abstract askCommand(question: string, systemContext?: SystemContext): Promise<AICommandResponse>;

  // Retorna o nome do provedor
  abstract getProviderName(): string;

  // Retorna o nome do modelo atual
  abstract getModelName(): string;

  // Método para validar API key (retorna true se válida)
  abstract validateApiKey(): Promise<boolean>;

  // Retorna informações do provedor e modelo
  getProviderInfo(): { provider: string; model: string } {
    return {
      provider: this.getProviderName(),
      model: this.getModelName(),
    };
  }
}

// Re-export types for backward compatibility
export type {
  AIModelConfig,
  CommandData,
  SystemContext,
  AICommandAnalysisResult,
  AICommandResponse
};
