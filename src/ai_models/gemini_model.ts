// ~/.mcp-terminal/ai_models/gemini_model.ts
// Implementação do modelo Gemini da Google

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import BaseAIModel, { AIModelConfig, CommandData, SystemContext } from './base_model.ts';

// Interface específica para configuração do Gemini
interface GeminiConfig extends AIModelConfig {
  gemini_api_key?: string;
  gemini_model?: string;
}

// Interface para dados de comando estendidos
interface ExtendedCommandData extends CommandData {
  stdout?: string;
  stderr?: string;
  duration?: number;
  systemContext?: ExtendedSystemContext;
}

// Interface para contexto do sistema estendido
interface ExtendedSystemContext extends SystemContext {
  distro?: string;
  packageManager?: string;
  shell?: string;
  architecture?: string;
  kernel?: string;
  capabilities?: string[];
  commands?: any;
}

// Interface para resultado da análise
interface AnalysisResult {
  description: string;
  command: string | null;
  confidence: number;
  category: string;
  source: string;
}

export default class GeminiModel extends BaseAIModel {
  private apiKey: string | undefined;
  private modelName: string;
  private client: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;

  constructor(config: GeminiConfig) {
    super(config);
    this.apiKey = config.gemini_api_key;
    this.modelName = config.gemini_model || 'gemini-pro';
    this.client = null;
    this.model = null;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Chave de API do Google Gemini não configurada');
    }

    this.client = new GoogleGenerativeAI(this.apiKey);
    this.model = this.client.getGenerativeModel({ model: this.modelName });
  }

  async analyzeCommand(commandData: CommandData): Promise<AnalysisResult | null> {
    try {
      const extendedData = commandData as ExtendedCommandData;
      const { command, exitCode } = extendedData;
      const stdout = extendedData.stdout || '';
      const stderr = extendedData.stderr || '';
      const duration = extendedData.duration || 0;
      const systemContext = extendedData.systemContext || {} as ExtendedSystemContext;

      const prompt = `Você é um especialista em Linux que analisa comandos que falharam.

SISTEMA:
- OS: ${systemContext.os}
- Distribuição: ${systemContext.distro} ${systemContext.version}
- Package Manager: ${systemContext.packageManager}
- Shell: ${systemContext.shell}

COMANDO EXECUTADO: ${command}
EXIT CODE: ${exitCode}
TEMPO DE EXECUÇÃO: ${duration}s

STDOUT:
${stdout || '(vazio)'}

STDERR:
${stderr || '(vazio)'}

ANÁLISE NECESSÁRIA:
1. Identifique o problema principal
2. Explique a causa do erro
3. Forneça uma solução específica para este sistema Linux
4. Sugira um comando para corrigir (se aplicável)
5. Inclua comandos preventivos se relevante

FORMATO DA RESPOSTA:
🔍 PROBLEMA: [Descrição clara do problema]
🛠️  SOLUÇÃO: [Explicação da solução]
💻 COMANDO: [Comando específico para corrigir, se aplicável]
⚠️  PREVENÇÃO: [Como evitar no futuro]

Seja conciso e específico para o sistema detectado.`;

      if (!this.model) {
        await this.initialize();
      }

      const result = await this.model!.generateContent(prompt);
      const analysis = result.response.text();

      // Extrai comando sugerido da resposta
      const commandMatch = analysis.match(/💻 COMANDO: (.+?)(?:\n|$)/);
      const suggestedCommand = commandMatch
        ? commandMatch[1].replace(/`/g, '').trim()
        : null;

      return {
        description: analysis,
        command: suggestedCommand,
        confidence: 0.8,
        category: 'llm_analysis',
        source: 'google_gemini',
      };
    } catch (error) {
      console.error('Erro na análise com Gemini:', error);
      return null;
    }
  }

  async askCommand(question: string, systemContext?: SystemContext): Promise<string> {
    const extendedContext = (systemContext || {}) as ExtendedSystemContext;

    try {
      const prompt = `Você é um assistente especializado em Linux/Unix que ajuda usuários a encontrar o comando correto para suas tarefas.

INFORMAÇÕES DO SISTEMA:
- OS: ${extendedContext.os || 'Unknown'}
- Distribuição: ${extendedContext.distro || 'Unknown'}
- Versão: ${extendedContext.version || 'Unknown'}
- Package Manager: ${extendedContext.packageManager || 'Unknown'}
- Shell: ${extendedContext.shell || 'Unknown'}
- Arquitetura: ${extendedContext.architecture || 'Unknown'}
- Kernel: ${extendedContext.kernel || 'Unknown'}
- Capacidades: ${extendedContext.capabilities?.join(', ') || 'Unknown'}

COMANDOS DISPONÍVEIS NESTE SISTEMA:
${JSON.stringify(extendedContext.commands || {}, null, 2)}

PERGUNTA DO USUÁRIO: ${question}

INSTRUÇÕES:
1. Analise a pergunta considerando o sistema específico do usuário
2. Forneça o comando exato para a distribuição/sistema detectado
3. Explique brevemente o que o comando faz
4. Se houver variações por distribuição, mencione isso
5. Inclua opções úteis do comando
6. Se apropriado, sugira comandos relacionados

FORMATO DA RESPOSTA:
🔧 COMANDO:
\`comando exato aqui\`

📝 EXPLICAÇÃO:
[Explicação clara do que faz]

💡 OPÇÕES ÚTEIS:
[Variações ou opções importantes]

⚠️ OBSERVAÇÕES:
[Avisos ou considerações especiais]

Responda de forma direta e prática.`;

      if (!this.model) {
        await this.initialize();
      }

      const result = await this.model!.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Erro ao consultar Gemini:', error);
      return `❌ Erro ao conectar com o assistente Gemini. Verifique sua configuração da API Google.`;
    }
  }

  getProviderName(): string {
    return 'Gemini (Google)';
  }

  getModelName(): string {
    return this.modelName;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      if (!this.model) {
        await this.initialize();
      }
      // Tenta fazer uma chamada simples para validar a API key
      const result = await this.model!.generateContent('Hello');
      return true;
    } catch (error) {
      console.error('Erro ao validar API key do Gemini:', error);
      return false;
    }
  }
}