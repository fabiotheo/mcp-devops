// ~/.mcp-terminal/ai_models/gemini_model.js
// Implementação do modelo Gemini da Google

import { GoogleGenerativeAI } from '@google/generative-ai';
import BaseAIModel from './base_model.js';

export default class GeminiModel extends BaseAIModel {
  constructor(config) {
    super(config);
    this.apiKey = config.gemini_api_key;
    this.modelName = config.gemini_model || 'gemini-pro';
    this.client = null;
    this.model = null;
  }

  async initialize() {
    if (!this.apiKey) {
      throw new Error('Chave de API do Google Gemini não configurada');
    }

    this.client = new GoogleGenerativeAI(this.apiKey);
    this.model = this.client.getGenerativeModel({ model: this.modelName });

    return this;
  }

  async analyzeCommand(commandData) {
    try {
      const { command, exitCode, stdout, stderr, duration, systemContext } =
        commandData;

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

      const result = await this.model.generateContent(prompt);
      const analysis = result.response.text();

      // Extrai comando sugerido da resposta
      const commandMatch = analysis.match(/💻 COMANDO: (.+?)(?:\n|$)/);
      const command = commandMatch
        ? commandMatch[1].replace(/`/g, '').trim()
        : null;

      return {
        description: analysis,
        command: command,
        confidence: 0.8,
        category: 'llm_analysis',
        source: 'google_gemini',
      };
    } catch (error) {
      console.error('Erro na análise com Gemini:', error);
      return null;
    }
  }

  async askCommand(question, systemContext) {
    try {
      const prompt = `Você é um assistente especializado em Linux/Unix que ajuda usuários a encontrar o comando correto para suas tarefas.

INFORMAÇÕES DO SISTEMA:
- OS: ${systemContext.os}
- Distribuição: ${systemContext.distro}
- Versão: ${systemContext.version}
- Package Manager: ${systemContext.packageManager}
- Shell: ${systemContext.shell}
- Arquitetura: ${systemContext.architecture}
- Kernel: ${systemContext.kernel}
- Capacidades: ${systemContext.capabilities.join(', ')}

COMANDOS DISPONÍVEIS NESTE SISTEMA:
${JSON.stringify(systemContext.commands, null, 2)}

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

      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Erro ao consultar Gemini:', error);
      return `❌ Erro ao conectar com o assistente Gemini. Verifique sua configuração da API Google.`;
    }
  }

  getProviderName() {
    return 'Gemini (Google)';
  }

  getModelName() {
    return this.modelName;
  }

  async validateApiKey() {
    try {
      // Tenta fazer uma chamada simples para validar a API key
      const result = await this.model.generateContent('Hello');
      return true;
    } catch (error) {
      console.error('Erro ao validar API key do Gemini:', error);
      return false;
    }
  }
}
