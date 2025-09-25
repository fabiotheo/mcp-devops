#!/usr/bin/env node

/**
 * UserManager - Gerenciador de usuários para o sistema de histórico distribuído
 * Gerencia CRUD de usuários sem senha (foco em compartilhamento de conhecimento)
 */

export default class UserManager {
  constructor(tursoClient) {
    if (!tursoClient) {
      throw new Error('TursoClient is required');
    }
    this.client = tursoClient;
  }

  /**
   * Cria um novo usuário
   */
  async createUser(username, name, email) {
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
    });

    if (existing.rows.length > 0) {
      throw new Error(`User ${username} already exists`);
    }

    // Verificar se email já está em uso
    const emailCheck = await this.client.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email],
    });

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
  async getUser(username) {
    const result = await this.client.execute({
      sql: 'SELECT * FROM users WHERE username = ? AND is_active = 1',
      args: [username],
    });

    if (result.rows.length === 0) {
      throw new Error(`User ${username} not found`);
    }

    return result.rows[0];
  }

  /**
   * Obtém usuário por email
   */
  async getUserByEmail(email) {
    const result = await this.client.execute({
      sql: 'SELECT * FROM users WHERE email = ? AND is_active = 1',
      args: [email],
    });

    if (result.rows.length === 0) {
      throw new Error(`User with email ${email} not found`);
    }

    return result.rows[0];
  }

  /**
   * Atualiza informações do usuário
   */
  async updateUser(username, updates) {
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
      });

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
  async deleteUser(username) {
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
  async reactivateUser(username) {
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
  async listUsers(activeOnly = true) {
    const sql = activeOnly
      ? 'SELECT username, name, email, created_at FROM users WHERE is_active = 1 ORDER BY name'
      : 'SELECT username, name, email, is_active, created_at FROM users ORDER BY name';

    const result = await this.client.execute(sql);
    return result.rows;
  }

  /**
   * Obtém estatísticas de um usuário
   */
  async getUserStats(username) {
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
      args: [user.id],
    });

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
      args: [user.id],
    });

    return {
      ...stats.rows[0],
      top_commands: topCommands.rows,
    };
  }

  /**
   * Busca usuários por nome ou email
   */
  async searchUsers(query) {
    const searchTerm = `%${query}%`;

    const result = await this.client.execute({
      sql: `SELECT username, name, email
                  FROM users
                  WHERE is_active = 1
                    AND (name LIKE ? OR email LIKE ? OR username LIKE ?)
                  ORDER BY name`,
      args: [searchTerm, searchTerm, searchTerm],
    });

    return result.rows;
  }

  /**
   * Verifica se um username está disponível
   */
  async isUsernameAvailable(username) {
    const result = await this.client.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username],
    });

    return result.rows.length === 0;
  }

  /**
   * Verifica se um email está disponível
   */
  async isEmailAvailable(email) {
    const result = await this.client.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email],
    });

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
