/**
 * History Types
 *
 * Defines types and utilities for handling conversation history
 * across different storage formats and contexts.
 */

/**
 * Estrutura de uma entrada de histórico no contexto da aplicação
 * (usado para enviar à API Claude e manipular na memória)
 */
export interface HistoryEntry {
  id: string;                    // UUID da mensagem (do Turso ou gerado temporariamente)
  role: 'user' | 'assistant';    // Papel da mensagem
  content: string;               // Conteúdo da mensagem
  timestamp?: number;            // Timestamp opcional (Unix epoch)
}

/**
 * Estrutura de um registro do banco de dados Turso
 * (formato retornado pelas queries SELECT)
 *
 * Reflete os campos das tabelas history_user, history_machine e history_global.
 * Campos opcionais podem não estar presentes dependendo da query.
 */
export interface HistoryRecord {
  id: string;
  command: string;           // Mensagem do usuário
  response: string | null;   // Resposta do assistente (pode ser null)
  timestamp: number;
  user_id: string | null;
  machine_id: string;

  // Campos adicionais presentes nas tabelas de histórico
  status?: string;           // Status da execução (pending, completed, failed)
  tokens_used?: number;      // Tokens consumidos na requisição
  session_id?: string;       // ID da sessão
  execution_time_ms?: number; // Tempo de execução em milissegundos
  error_code?: number;       // Código de erro (history_machine)
  context?: string;          // Contexto adicional (history_user)
  tags?: string;             // Tags (history_global)
  request_id?: string;       // ID único da requisição
  updated_at?: number;       // Timestamp da última atualização
  completed_at?: number;     // Timestamp de conclusão
}

/**
 * Converte registros do Turso para o formato HistoryEntry
 *
 * @param records - Array de registros do banco Turso
 * @returns Array de HistoryEntry formatado para uso na aplicação
 *
 * @example
 * ```typescript
 * const dbRecords = await tursoClient.execute('SELECT * FROM history_user');
 * const entries = convertFromTurso(dbRecords.rows);
 * // entries agora pode ser usado com a API Claude
 * ```
 */
export function convertFromTurso(records: HistoryRecord[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];

  records.forEach(record => {
    // Adiciona mensagem do usuário
    entries.push({
      id: record.id,
      role: 'user',
      content: record.command,
      timestamp: record.timestamp
    });

    // Adiciona resposta do assistente (se existir)
    if (record.response) {
      entries.push({
        id: `${record.id}-response`,
        role: 'assistant',
        content: record.response,
        timestamp: record.timestamp
      });
    }
  });

  return entries;
}

/**
 * Valida e sanitiza identificadores (userId, machineId)
 *
 * Remove caracteres perigosos e valida formato.
 * Implementa defesa em profundidade contra SQL injection.
 *
 * @param id - Identificador a ser validado
 * @param name - Nome do campo (para mensagens de erro)
 * @returns Identificador sanitizado
 * @throws Error se o identificador for inválido
 *
 * @example
 * ```typescript
 * const safeUserId = validateIdentifier(userId, 'userId');
 * const safeMachineId = validateIdentifier(machineId, 'machineId');
 * ```
 */
export function validateIdentifier(id: string, name: string): string {
  if (!id || id.trim().length === 0) {
    throw new Error(`${name} não pode ser vazio`);
  }

  if (id.length > 255) {
    throw new Error(`${name} muito longo (máximo 255 caracteres)`);
  }

  // Remove caracteres perigosos (defesa em profundidade)
  // Permite apenas: letras, números, underscore, hífen
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '');

  if (sanitized.length === 0) {
    throw new Error(`${name} contém apenas caracteres inválidos`);
  }

  return sanitized;
}
