// ~/.mcp-terminal/ai_models/base_model.ts
// Classe base para todos os modelos de IA

// Interface para configuração dos modelos de IA
export interface AIModelConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any; // Permite propriedades adicionais específicas de cada provedor
}

// Interface para dados de comando
export interface CommandData {
  command: string;
  exitCode: number;
  output?: string;
  error?: string;
  systemInfo?: any;
  [key: string]: any;
}

// Interface para contexto do sistema
export interface SystemContext {
  os?: string;
  distribution?: string;
  version?: string;
  [key: string]: any;
}

export default abstract class BaseAIModel {
  protected config: AIModelConfig;

  constructor(config: AIModelConfig) {
    this.config = config;
  }

  // Método para inicializar o cliente da API
  abstract initialize(): Promise<void>;

  // Método para analisar comando com falha
  abstract analyzeCommand(commandData: CommandData): Promise<any>;

  // Método para responder perguntas sobre comandos
  abstract askCommand(question: string, systemContext?: SystemContext): Promise<any>;

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
