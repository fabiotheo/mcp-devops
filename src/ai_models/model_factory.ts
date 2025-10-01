// ~/.mcp-terminal/ai_models/model_factory.ts
// Factory para criar a instância do modelo de IA adequado

import BaseAIModel from './base_model.js';
import type { AIModelConfig } from '../types/services.js';
import ClaudeModel from './claude_model.js';
import GeminiModel from './gemini_model.js';

// Enum para providers suportados
export enum AIProvider {
  CLAUDE = 'claude',
  GEMINI = 'gemini'
}

// Interface para informações do provider
export interface ProviderInfo {
  id: string;
  name: string;
  models: string[];
  supportsTools: boolean;
  requiresApiKey: string;
  description?: string;
}

// Interface para configuração estendida com provider
export interface ModelFactoryConfig extends Omit<AIModelConfig, 'ai_provider'> {
  ai_provider?: string;
  anthropic_api_key?: string;
  gemini_api_key?: string;
  claude_model?: string;
  gemini_model?: string;
}

// Type guard para verificar se o provider é válido
function isValidProvider(provider: string): provider is AIProvider {
  return Object.values(AIProvider).includes(provider as AIProvider);
}

// Type para constructor de modelos
type ModelConstructor = new (config: ModelFactoryConfig) => BaseAIModel;

export default class ModelFactory {
  // Mapa de providers para suas classes
  private static readonly providerMap: Map<AIProvider, ModelConstructor> = new Map([
    [AIProvider.CLAUDE, ClaudeModel as ModelConstructor],
    [AIProvider.GEMINI, GeminiModel as ModelConstructor],
  ]);

  /**
   * Cria e inicializa uma instância do modelo de IA apropriado com base na configuração
   * @param config Configuração do modelo com provider e credenciais
   * @returns Instância inicializada do modelo de IA
   * @throws Error se o provider não for suportado ou falhar na inicialização
   */
  static async createModel(config: ModelFactoryConfig): Promise<BaseAIModel> {
    const provider = (config.ai_provider || AIProvider.CLAUDE).toLowerCase();

    if (!isValidProvider(provider)) {
      const supportedProviders = Array.from(this.providerMap.keys()).join(', ');
      throw new Error(
        `Provider '${provider}' não é suportado. Providers disponíveis: ${supportedProviders}`
      );
    }

    const ModelClass = this.providerMap.get(provider as AIProvider);

    if (!ModelClass) {
      throw new Error(
        `Provider '${provider}' está registrado mas não tem implementação disponível.`
      );
    }

    // Validar configuração específica do provider
    this.validateProviderConfig(provider as AIProvider, config);

    try {
      const model = new ModelClass(config);
      await model.initialize();

      console.log(`✅ Modelo ${provider} inicializado com sucesso`);
      return model;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Erro ao inicializar modelo ${provider}:`, errorMessage);
      throw new Error(`Falha ao inicializar ${provider}: ${errorMessage}`);
    }
  }

  /**
   * Valida se a configuração tem as credenciais necessárias para o provider
   * @param provider Provider selecionado
   * @param config Configuração fornecida
   * @throws Error se faltar configuração obrigatória
   */
  private static validateProviderConfig(provider: AIProvider, config: ModelFactoryConfig): void {
    const validationRules: Record<AIProvider, (config: ModelFactoryConfig) => void> = {
      [AIProvider.CLAUDE]: (cfg) => {
        if (!cfg.anthropic_api_key) {
          throw new Error('API key da Anthropic é obrigatória para usar Claude');
        }
      },
      [AIProvider.GEMINI]: (cfg) => {
        if (!cfg.gemini_api_key) {
          throw new Error('API key do Google é obrigatória para usar Gemini');
        }
      },
    };

    const validator = validationRules[provider];
    if (validator) {
      validator(config);
    }
  }

  /**
   * Retorna informações sobre os providers suportados
   * @returns Array com informações de cada provider
   */
  static getSupportedProviders(): ProviderInfo[] {
    return [
      {
        id: AIProvider.CLAUDE,
        name: 'Claude (Anthropic)',
        models: [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307',
          'claude-sonnet-4-20250514',
          'claude-opus-4-1-20250805',
        ],
        supportsTools: true,
        requiresApiKey: 'anthropic_api_key',
        description: 'Modelo avançado da Anthropic com suporte a tools e execução paralela'
      },
      {
        id: AIProvider.GEMINI,
        name: 'Gemini (Google)',
        models: [
          'gemini-pro',
          'gemini-pro-vision',
          'gemini-1.5-pro',
          'gemini-1.5-flash',
        ],
        supportsTools: false,
        requiresApiKey: 'gemini_api_key',
        description: 'Modelo do Google com capacidades multimodais'
      },
    ];
  }

  /**
   * Retorna as dependências npm necessárias para cada provider
   * @param provider Provider específico ou undefined para todos
   * @returns Array de dependências npm
   */
  static getDependencies(provider?: AIProvider | string): string[] {
    const dependenciesMap: Record<AIProvider, string[]> = {
      [AIProvider.CLAUDE]: ['@anthropic-ai/sdk'],
      [AIProvider.GEMINI]: ['@google/generative-ai'],
    };

    if (provider) {
      const normalizedProvider = provider.toLowerCase() as AIProvider;
      return dependenciesMap[normalizedProvider] || [];
    }

    // Retorna todas as dependências se nenhum provider específico
    return Object.values(dependenciesMap).flat();
  }

  /**
   * Verifica se um provider específico está disponível
   * @param provider Nome do provider
   * @returns true se o provider está disponível
   */
  static isProviderAvailable(provider: string): boolean {
    return isValidProvider(provider.toLowerCase()) &&
           this.providerMap.has(provider.toLowerCase() as AIProvider);
  }

  /**
   * Obtém informações de um provider específico
   * @param provider Nome do provider
   * @returns Informações do provider ou undefined se não encontrado
   */
  static getProviderInfo(provider: string): ProviderInfo | undefined {
    return this.getSupportedProviders().find(
      p => p.id === provider.toLowerCase()
    );
  }

  /**
   * Lista modelos disponíveis para um provider
   * @param provider Nome do provider
   * @returns Array de modelos ou array vazio se provider não encontrado
   */
  static getAvailableModels(provider: string): string[] {
    const info = this.getProviderInfo(provider);
    return info?.models || [];
  }
}