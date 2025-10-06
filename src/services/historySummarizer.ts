/**
 * History Summarizer Service
 *
 * Responsável por gerar resumos de histórico de conversação
 * para economia de tokens na API Claude.
 *
 * Fase 2: MVP - Geração básica de resumos
 */

import Anthropic from '@anthropic-ai/sdk';
import { HistoryEntry } from '../types/services.js';
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
  turso_url?: string;
  turso_token?: string;
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
   * @param minMessages - Número mínimo de mensagens para compactar (padrão: 20)
   * @returns Objeto com sucesso, mensagem e estatísticas
   */
  /**
   * Helper function to convert Turso query rows to HistoryEntry[]
   * 
   * @param rows - Array of rows from Turso query (with command and response fields)
   * @returns Array of HistoryEntry objects (user + assistant messages)
   */
  private convertToHistoryEntries(rows: any[]): HistoryEntry[] {
    const entries: HistoryEntry[] = [];

    for (const row of rows) {
      // Add user message (command)
      if (row.command) {
        entries.push({
          id: `${row.id}-user`,
          role: 'user',
          content: row.command,
          timestamp: row.timestamp
        });
      }

      // Add assistant message (response)
      if (row.response) {
        entries.push({
          id: `${row.id}-assistant`,
          role: 'assistant',
          content: row.response,
          timestamp: row.timestamp
        });
      }
    }

    // Return all entries (already filtered to user/assistant only)
    return entries;
  }

  async handleCompactCommand(
    userId: string | null,
    machineId: string,
    sessionId: string,
    currentSessionHistory: HistoryEntry[],
    minMessages: number = 10
  ): Promise<{
    success: boolean;
    message: string;
    summary?: string;
    savings?: ReturnType<typeof this.calculateSavings>;
    messageCount?: number;
  }> {
    try {
      // Initialize Turso client with user_id
      const tursoClient = new TursoHistoryClient({
        debug: this.config.debug,
        turso_url: this.config.turso_url,
        turso_token: this.config.turso_token,
        user_id: userId || undefined // Pass user_id if it exists
      });
      await tursoClient.initialize();

      if (this.config.debug) {
        console.log(`[handleCompactCommand] Starting compact for session: ${sessionId}`);
      }

      // Determine which history table to use based on user_id
      const historyTable = userId ? 'history_user' : 'history_machine';

      if (this.config.debug) {
        console.log(`[handleCompactCommand] Using table: ${historyTable}`);
      }

      // SCENARIO DETECTION: Check for existing summary
      const existingSummaryResult = await tursoClient.execute(
        `SELECT summarized_up_to_message_id FROM conversation_summaries
         WHERE user_id ${userId ? '= ?' : 'IS NULL'} AND machine_id = ?`,
        userId ? [userId, machineId] : [machineId]
      ) as { rows?: Array<{ summarized_up_to_message_id: string }> };

      let messagesToCompact: HistoryEntry[] = [];
      let scenario: 'A' | 'B1' | 'B2' = 'A';

      // Use current session history (in-memory) instead of querying Turso
      // Messages in current session haven't been saved to Turso yet
      messagesToCompact = currentSessionHistory;

      if (this.config.debug) {
        console.log(`[handleCompactCommand] Using ${messagesToCompact.length} messages from current session (in-memory)`);
      }

      // Determine scenario based on whether a summary exists
      if (existingSummaryResult.rows && existingSummaryResult.rows.length > 0) {
        // Summary exists - this is at least scenario B1 (could be B2 if same session)
        // For now, we treat all as B1 since we're compacting current session
        // B2 would only happen if user runs /compact twice in same session
        scenario = 'B1';

        if (this.config.debug) {
          console.log(`[handleCompactCommand] Scenario B1: Summary exists from previous session`);
        }
      } else {
        // SCENARIO A: No existing summary - first time compacting
        scenario = 'A';

        if (this.config.debug) {
          console.log(`[handleCompactCommand] Scenario A: First compact ever`);
        }
      }

      // VALIDATION: Check minimum message count
      if (!messagesToCompact || messagesToCompact.length === 0) {
        await tursoClient.close();
        return {
          success: false,
          message: '❌ Nenhuma mensagem encontrada na sessão atual'
        };
      }

      if (messagesToCompact.length < minMessages) {
        await tursoClient.close();
        return {
          success: false,
          message: `ℹ️ Histórico da sessão muito pequeno (${messagesToCompact.length} mensagens). Mínimo: ${minMessages} mensagens`
        };
      }

      if (this.config.debug) {
        console.log(`[handleCompactCommand] Found ${messagesToCompact.length} messages to compact (scenario ${scenario})`);
      }

      // DIVISION STRATEGY: Last 2 complete + rest to summarize
      const lastTwoMessages = messagesToCompact.slice(-2);
      const messagesToSummarize = messagesToCompact.slice(0, -2);

      if (messagesToSummarize.length === 0) {
        await tursoClient.close();
        return {
          success: false,
          message: 'ℹ️ Nada para compactar (apenas 2 mensagens recentes)'
        };
      }

      if (this.config.debug) {
        console.log(`[handleCompactCommand] Dividing: ${messagesToSummarize.length} to summarize + ${lastTwoMessages.length} complete`);
      }

      // GENERATE SUMMARY
      const summary = await this.generateSummary(messagesToSummarize);

      // CALCULATE SAVINGS
      const savings = this.calculateSavings(messagesToSummarize, summary);

      // GET LAST SUMMARIZED MESSAGE ID
      const lastSummarizedMessage = messagesToSummarize[messagesToSummarize.length - 1];
      const lastSummarizedMessageId = lastSummarizedMessage?.id;

      if (!lastSummarizedMessageId) {
        await tursoClient.close();
        throw new Error('A última mensagem resumida não possui um ID para rastreamento.');
      }

      // VALIDATE SUMMARY SIZE
      const MAX_SUMMARY_SIZE = 50000; // 50KB
      if (summary.length > MAX_SUMMARY_SIZE) {
        await tursoClient.close();
        throw new Error(`Resumo muito grande (${summary.length} chars). Máximo: ${MAX_SUMMARY_SIZE} chars`);
      }

      // SAVE TO DATABASE (UPSERT - replaces old summary)
      await tursoClient.execute(
        `INSERT INTO conversation_summaries
         (user_id, machine_id, summary, summarized_up_to_message_id, message_count, updated_at)
         VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
         ON CONFLICT(user_id, machine_id) DO UPDATE SET
           summary = excluded.summary,
           summarized_up_to_message_id = excluded.summarized_up_to_message_id,
           updated_at = excluded.updated_at,
           message_count = excluded.message_count`,
        [userId, machineId, summary, lastSummarizedMessageId, messagesToSummarize.length]
      );

      await tursoClient.close();

      if (this.config.debug) {
        console.log('[handleCompactCommand] ✅ Summary saved to Turso');
      }

      return {
        success: true,
        message: `✅ Histórico compactado! ${messagesToSummarize.length} mensagens → resumo (${lastTwoMessages.length} mensagens recentes mantidas completas)`,
        summary,
        savings,
        messageCount: messagesToSummarize.length
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
