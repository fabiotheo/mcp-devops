#!/usr/bin/env node

/**
 * UserManager - Gerenciador de usuários para o sistema de histórico distribuído
 * Gerencia CRUD de usuários sem senha (foco em compartilhamento de conhecimento)
 */

import TursoHistoryClient from './turso-client.js';
import type { ResultSet } from '@libsql/client';

/**
 * User interface
 */
interface User {
  id?: number;
  username: string;
  name: string;
  email: string;
  is_active?: number;
  created_at?: number;
  last_seen?: string;
}

/**
 * UserStats interface
 */
interface UserStats {
  total_commands: number;
  active_days: number;
  last_command?: number;
  first_command?: number;
  avg_tokens?: number;
  total_tokens?: number;
  top_commands?: Array<{
    command: string;
    usage_count: number;
  }>;
}

export default class UserManager {
  private client: TursoHistoryClient;

  constructor(tursoClient: TursoHistoryClient) {
    if (!tursoClient) {
      throw new Error('TursoClient is required');
    }
    this.client = tursoClient;
  }

  /**
   * Cria um novo usuário
   */
  async createUser(username: string, name: string, email: string): Promise<User> {
    // Validar entrada - TODOS os campos são obrigatórios
    if (!username || !name || !email) {
      throw new Error('Username, name and email are all required');
    }

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Validar username (apenas letras, números, underscore e hífen)
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      throw new Error(
        'Username can only contain letters, numbers, underscore and hyphen',
      );
    }

    // Verificar se usuário já existe
    const existing = await this.client.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username],
    }) as ResultSet;

    if (existing.rows.length > 0) {
      throw new Error(`User ${username} already exists`);
    }

    // Verificar se email já está em uso
    const emailCheck = await this.client.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email],
    }) as ResultSet;

    if (emailCheck.rows.length > 0) {
      throw new Error(`Email ${email} is already in use`);
    }

    // Criar usuário
    await this.client.execute({
      sql: `INSERT INTO users (username, name, email)
                  VALUES (?, ?, ?)`,
      args: [username, name, email],
    });

    console.log(`✅ User ${username} created successfully`);
    return { username, name, email };
  }

  /**
   * Obtém informações de um usuário
   */
  async getUser(username: string): Promise<User | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM users WHERE username = ? AND is_active = 1',
      args: [username],
    }) as ResultSet;

    if (result.rows.length === 0) {
      throw new Error(`User ${username} not found`);
    }

    return result.rows[0] as unknown as User;
  }

  /**
   * Obtém usuário por email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM users WHERE email = ? AND is_active = 1',
      args: [email],
    }) as ResultSet;

    if (result.rows.length === 0) {
      throw new Error(`User with email ${email} not found`);
    }

    return result.rows[0] as unknown as User;
  }

  /**
   * Atualiza informações do usuário
   */
  async updateUser(username: string, updates: Partial<User>): Promise<void> {
    const fields = [];
    const values = [];

    // Validar e preparar campos para atualização
    if (updates.name) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    if (updates.email) {
      // Validar formato do email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updates.email)) {
        throw new Error('Invalid email format');
      }

      // Verificar se email já está em uso por outro usuário
      const emailCheck = await this.client.execute({
        sql: 'SELECT id FROM users WHERE email = ? AND username != ?',
        args: [updates.email, username],
      }) as ResultSet;

      if (emailCheck.rows.length > 0) {
        throw new Error(
          `Email ${updates.email} is already in use by another user`,
        );
      }

      fields.push('email = ?');
      values.push(updates.email);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push('updated_at = unixepoch()');
    values.push(username);

    await this.client.execute({
      sql: `UPDATE users SET ${fields.join(', ')} WHERE username = ?`,
      args: values,
    });

    console.log(`✅ User ${username} updated successfully`);
  }

  /**
   * Deleta (desativa) um usuário
   */
  async deleteUser(username: string): Promise<void> {
    // Verificar se usuário existe
    const user = await this.getUser(username);

    // Soft delete - apenas desativa o usuário
    await this.client.execute({
      sql: `UPDATE users SET is_active = 0, updated_at = unixepoch()
                  WHERE username = ?`,
      args: [username],
    });

    console.log(`✅ User ${username} deactivated`);
  }

  /**
   * Reativa um usuário desativado
   */
  async reactivateUser(username: string): Promise<void> {
    await this.client.execute({
      sql: `UPDATE users SET is_active = 1, updated_at = unixepoch()
                  WHERE username = ?`,
      args: [username],
    });

    console.log(`✅ User ${username} reactivated`);
  }

  /**
   * Lista todos os usuários
   */
  async listUsers(activeOnly: boolean = true): Promise<User[]> {
    const sql = activeOnly
      ? 'SELECT username, name, email, created_at FROM users WHERE is_active = 1 ORDER BY name'
      : 'SELECT username, name, email, is_active, created_at FROM users ORDER BY name';

    const result = await this.client.execute(sql) as ResultSet;
    return result.rows as unknown as User[];
  }

  /**
   * Obtém estatísticas de um usuário
   */
  async getUserStats(username: string): Promise<UserStats> {
    const user = await this.getUser(username);

    const stats = await this.client.execute({
      sql: `
                SELECT
                    COUNT(*) as total_commands,
                    COUNT(DISTINCT DATE(timestamp, 'unixepoch')) as active_days,
                    MAX(timestamp) as last_command,
                    MIN(timestamp) as first_command,
                    AVG(tokens_used) as avg_tokens,
                    SUM(tokens_used) as total_tokens
                FROM history_user
                WHERE user_id = ?`,
      args: [user?.id],
    }) as ResultSet;

    // Comandos mais usados
    const topCommands = await this.client.execute({
      sql: `
                SELECT
                    SUBSTR(command, 1, 50) as command,
                    COUNT(*) as usage_count
                FROM history_user
                WHERE user_id = ?
                GROUP BY SUBSTR(command, 1, 50)
                ORDER BY usage_count DESC
                LIMIT 5`,
      args: [user?.id],
    }) as ResultSet;

    return {
      ...stats.rows[0],
      top_commands: topCommands.rows,
    } as unknown as UserStats;
  }

  /**
   * Busca usuários por nome ou email
   */
  async searchUsers(query: string): Promise<User[]> {
    const searchTerm = `%${query}%`;

    const result = await this.client.execute({
      sql: `SELECT username, name, email
                  FROM users
                  WHERE is_active = 1
                    AND (name LIKE ? OR email LIKE ? OR username LIKE ?)
                  ORDER BY name`,
      args: [searchTerm, searchTerm, searchTerm],
    }) as ResultSet;

    return result.rows as unknown as User[];
  }

  /**
   * Verifica se um username está disponível
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username],
    }) as ResultSet;

    return result.rows.length === 0;
  }

  /**
   * Verifica se um email está disponível
   */
  async isEmailAvailable(email: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email],
    }) as ResultSet;

    return result.rows.length === 0;
  }
}

// Export para uso direto via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    console.log('UserManager CLI');
    console.log('Este módulo deve ser usado através do ipcom-chat-cli.js');
    console.log('\nExemplos:');
    console.log(
      '  ipcom-chat user create --username john --name "John Doe" --email john@example.com',
    );
    console.log('  ipcom-chat user list');
    console.log('  ipcom-chat user stats john');
  })();
}
