/**
 * History Summarizer Service
 *
 * Responsável por gerar resumos de histórico de conversação
 * para economia de tokens na API Claude.
 *
 * Fase 2: MVP - Geração básica de resumos
 */

import Anthropic from '@anthropic-ai/sdk';
import { HistoryEntry } from '../types/history.js';
import TursoHistoryClient from '../libs/turso-client.js';

/**
 * Prompt usado para gerar resumos de histórico
 *
 * Instruções específicas para preservar informações técnicas essenciais:
 * - Comandos executados
 * - Paths e diretórios
 * - Decisões técnicas
 * - Erros e soluções
 */
const SUMMARY_PROMPT = `Você é um assistente técnico especializado em resumir conversas sobre comandos de terminal Linux/Unix.

Sua tarefa é criar um resumo CONCISO e TÉCNICO da conversa abaixo, preservando:

1. **Comandos importantes** executados ou discutidos
2. **Paths e diretórios** mencionados
3. **Decisões técnicas** tomadas
4. **Problemas encontrados** e suas soluções
5. **Contexto do projeto** (nome, tecnologias, estrutura)

**Formato do resumo:**
- Use bullets (•) para listar itens
- Máximo de 10-15 linhas
- Foco em informações que seriam úteis para continuar a conversa
- Omita saudações, confirmações genéricas e conversas não técnicas

**Exemplo de bom resumo:**
• Projeto: mcp-devops (CLI terminal assistant)
• Estrutura: src/services/, src/libs/, tests/
• Implementou tabela conversation_summaries no Turso
• Criou types em src/types/history.ts (HistoryEntry, HistoryRecord)
• Testes: 10/10 passando em test-phase1-types-only.js
• Correções: centralizou schema SQL, adicionou NOT NULL a machine_id
• Próximo: implementar serviço de resumo (Fase 2)

Agora resuma a conversa abaixo seguindo essas diretrizes:`;

/**
 * Configuração do cliente Anthropic
 */
interface SummarizerConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  debug?: boolean;
}

/**
 * Classe principal do serviço de resumo
 */
export class HistorySummarizer {
  private client: Anthropic;
  private config: SummarizerConfig;

  constructor(config: SummarizerConfig) {
    // Validar API key
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new Error('Anthropic API key is required and cannot be empty');
    }

    this.config = {
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 1024,
      debug: false,
      ...config
    };

    this.client = new Anthropic({
      apiKey: this.config.apiKey
    });
  }

  /**
   * Constrói o prompt completo para gerar o resumo
   *
   * @param history - Array de mensagens a serem resumidas
   * @returns Prompt formatado com instruções + histórico
   */
  buildSummaryPrompt(history: HistoryEntry[]): string {
    // Formatar histórico em formato legível
    const formattedHistory = history.map((entry, idx) => {
      const role = entry.role === 'user' ? 'Usuário' : 'Assistente';
      const timestamp = entry.timestamp
        ? new Date(entry.timestamp * 1000).toLocaleString('pt-BR')
        : '';

      return `[${idx + 1}] ${role}${timestamp ? ` (${timestamp})` : ''}:\n${entry.content}`;
    }).join('\n\n');

    return `${SUMMARY_PROMPT}\n\n===== CONVERSA =====\n\n${formattedHistory}\n\n===== FIM DA CONVERSA =====\n\nResumo técnico:`;
  }

  /**
   * Gera resumo de um histórico de conversação
   *
   * @param history - Mensagens a serem resumidas (sem limite de tamanho)
   * @returns Resumo gerado pela API Claude
   * @throws Error se API falhar ou se histórico estiver vazio
   */
  async generateSummary(history: HistoryEntry[]): Promise<string> {
    if (!history || history.length === 0) {
      throw new Error('Histórico vazio - não é possível gerar resumo');
    }

    if (this.config.debug) {
      console.log(`[HistorySummarizer] Gerando resumo de ${history.length} mensagens...`);
    }

    try {
      const prompt = this.buildSummaryPrompt(history);

      if (this.config.debug) {
        console.log('[HistorySummarizer] Prompt length:', prompt.length, 'chars');
      }

      const response = await this.client.messages.create({
        model: this.config.model!,
        max_tokens: this.config.maxTokens!,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // Extrair texto do primeiro bloco de conteúdo
      const summary = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      if (!summary || summary.trim().length === 0) {
        throw new Error('API retornou resumo vazio');
      }

      if (this.config.debug) {
        console.log('[HistorySummarizer] ✅ Resumo gerado com sucesso');
        console.log('[HistorySummarizer] Summary length:', summary.length, 'chars');
        console.log('[HistorySummarizer] Tokens used:', response.usage.input_tokens, 'input,', response.usage.output_tokens, 'output');
      }

      return summary.trim();

    } catch (error: any) {
      if (this.config.debug) {
        console.error('[HistorySummarizer] ❌ Erro ao gerar resumo:', error.message);
      }

      // Re-throw com contexto adicional
      if (error.status === 401) {
        throw new Error('API key inválida ou expirada');
      } else if (error.status === 429) {
        throw new Error('Rate limit excedido - tente novamente em alguns segundos');
      } else if (error.message?.includes('context_length_exceeded')) {
        throw new Error('Histórico muito longo para processar - tente com menos mensagens');
      } else {
        throw new Error(`Erro ao gerar resumo: ${error.message}`);
      }
    }
  }

  /**
   * Valida se um histórico tem tamanho suficiente para resumir
   *
   * @param history - Histórico a validar
   * @param minMessages - Número mínimo de mensagens (padrão: 20)
   * @returns true se histórico pode ser resumido
   */
  canSummarize(history: HistoryEntry[], minMessages: number = 20): boolean {
    return history && history.length >= minMessages;
  }

  /**
   * Calcula estimativa de tokens economizados com resumo
   *
   * **IMPORTANTE:** Esta é uma estimativa aproximada baseada na heurística
   * de que 4 caracteres ≈ 1 token. A contagem real pode variar ±30%
   * dependendo do conteúdo (código, comandos técnicos, etc.).
   *
   * Para métricas exatas, use os valores de `response.usage` retornados
   * pela API Anthropic durante a geração do resumo.
   *
   * @param history - Histórico original
   * @param summary - Resumo gerado
   * @returns Objeto com estatísticas de economia (valores aproximados)
   */
  calculateSavings(history: HistoryEntry[], summary: string): {
    originalChars: number;
    summaryChars: number;
    charsReduction: number;
    percentReduction: number;
    estimatedTokensSaved: number;
  } {
    const originalChars = history.reduce((sum, entry) => sum + entry.content.length, 0);
    const summaryChars = summary.length;
    const charsReduction = originalChars - summaryChars;
    const percentReduction = (charsReduction / originalChars) * 100;

    // Estimativa conservadora: 4 chars ≈ 1 token
    // NOTA: Precisão varia ±30% dependendo do tipo de conteúdo
    const estimatedTokensSaved = Math.floor(charsReduction / 4);

    return {
      originalChars,
      summaryChars,
      charsReduction,
      percentReduction: Math.round(percentReduction * 10) / 10, // 1 decimal
      estimatedTokensSaved
    };
  }

  /**
   * Handler para o comando /compact
   *
   * Gera resumo do histórico e salva na tabela conversation_summaries.
   * Substitui mensagens antigas pelo resumo para economizar tokens.
   *
   * @param history - Histórico completo da conversação
   * @param userId - ID do usuário (opcional)
   * @param machineId - ID da máquina (obrigatório)
   * @param minMessages - Número mínimo de mensagens para compactar (padrão: 30)
   * @returns Objeto com sucesso, mensagem e estatísticas
   */
  async handleCompactCommand(
    history: HistoryEntry[],
    userId: string | null,
    machineId: string,
    minMessages: number = 30
  ): Promise<{
    success: boolean;
    message: string;
    summary?: string;
    savings?: ReturnType<typeof this.calculateSavings>;
    messageCount?: number;
  }> {
    try {
      // Validar histórico
      if (!history || history.length === 0) {
        return {
          success: false,
          message: '❌ Histórico vazio - nada para compactar'
        };
      }

      // Validar tamanho mínimo
      if (!this.canSummarize(history, minMessages)) {
        return {
          success: false,
          message: `❌ Histórico muito pequeno (${history.length} msgs). Mínimo: ${minMessages} mensagens`
        };
      }

      if (this.config.debug) {
        console.log(`[handleCompactCommand] Compactando ${history.length} mensagens...`);
      }

      // Gerar resumo
      const summary = await this.generateSummary(history);

      // Calcular economia
      const savings = this.calculateSavings(history, summary);

      // Salvar no Turso
      const tursoClient = new TursoHistoryClient({ debug: this.config.debug });
      await tursoClient.initialize();

      // Pegar ID da última mensagem para rastreamento
      const lastMessage = history[history.length - 1];
      const lastMessageId = lastMessage?.id;

      if (!lastMessageId) {
        // Se não houver ID, não podemos rastrear o ponto de sumarização
        await tursoClient.close();
        throw new Error('A última mensagem do histórico não possui um ID para rastreamento.');
      }

      // Validar tamanho do resumo (limite de 50KB para evitar problemas no DB)
      const MAX_SUMMARY_SIZE = 50000; // 50KB
      if (summary.length > MAX_SUMMARY_SIZE) {
        await tursoClient.close();
        throw new Error(`Resumo muito grande (${summary.length} chars). Máximo: ${MAX_SUMMARY_SIZE} chars`);
      }

      // Inserir ou atualizar resumo (UPSERT)
      await tursoClient.execute(
        `INSERT INTO conversation_summaries
         (user_id, machine_id, summary, summarized_up_to_message_id, message_count, updated_at)
         VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
         ON CONFLICT(user_id, machine_id) DO UPDATE SET
           summary = excluded.summary,
           summarized_up_to_message_id = excluded.summarized_up_to_message_id,
           updated_at = excluded.updated_at,
           message_count = excluded.message_count`,
        [userId, machineId, summary, lastMessageId, history.length]
      );

      await tursoClient.close();

      if (this.config.debug) {
        console.log('[handleCompactCommand] ✅ Resumo salvo no Turso');
      }

      return {
        success: true,
        message: `✅ Histórico compactado! ${history.length} mensagens → resumo de ${summary.length} chars`,
        summary,
        savings,
        messageCount: history.length
      };

    } catch (error: any) {
      if (this.config.debug) {
        console.error('[handleCompactCommand] ❌ Erro:', error.message);
      }

      return {
        success: false,
        message: `❌ Erro ao compactar: ${error.message}`
      };
    }
  }
}

export default HistorySummarizer;
