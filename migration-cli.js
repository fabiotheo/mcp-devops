#!/usr/bin/env node
// migration-cli.js - CLI para gerenciar migrações do setup
import { MigrationManager } from './src/setup/setup-migration.js';
import path from 'path';
import os from 'os';

/**
 * CLI para operações de migração
 */
class MigrationCLI {
  constructor() {
    this.migrationManager = new MigrationManager({
      verbose: process.argv.includes('--verbose') || process.argv.includes('-v')
    });
  }

  /**
   * Mostra ajuda
   */
  showHelp() {
    console.log(`
🚀 MCP Terminal Assistant - Migration CLI

COMANDOS:
  detect                    Detectar versão instalada
  backup [tag]             Criar backup da instalação atual
  list-backups             Listar backups disponíveis
  restore <backup-path>    Restaurar de um backup específico
  migrate <version>        Migrar para versão especificada
  rollback                 Reverter última migração
  cleanup                  Limpar backups antigos
  status                   Mostrar status da instalação

OPÇÕES:
  --verbose, -v            Modo verboso
  --help, -h              Mostrar esta ajuda

EXEMPLOS:
  node migration-cli.js detect
  node migration-cli.js backup "pre-update"
  node migration-cli.js migrate simplified
  node migration-cli.js restore ~/.mcp-terminal.backup-v1.0.0-2025-01-15T10-30-00-000Z

VERSÕES SUPORTADAS:
  simplified               Setup simplificado (883 linhas, 83% redução)
`);
  }

  /**
   * Detecta versão instalada
   */
  async detectVersion() {
    console.log('🔍 Detectando versão instalada...');

    const version = await this.migrationManager.detectInstalledVersion();

    if (version) {
      console.log(`✅ Versão detectada: ${version}`);

      // Mostrar informações adicionais
      const mcpDir = path.join(os.homedir(), '.mcp-terminal');
      try {
        const fs = await import('fs');
        const stats = await fs.promises.stat(mcpDir);
        console.log(`📁 Instalação em: ${mcpDir}`);
        console.log(`📅 Modificado: ${stats.mtime.toISOString()}`);
      } catch (error) {
        console.log(`❌ Erro ao acessar diretório: ${error.message}`);
      }
    } else {
      console.log('❌ Nenhuma instalação do MCP Terminal detectada');
      console.log(`💡 Procurado em: ${path.join(os.homedir(), '.mcp-terminal')}`);
    }
  }

  /**
   * Cria backup
   */
  async createBackup(tag) {
    console.log('💾 Criando backup...');

    try {
      const backupInfo = await this.migrationManager.createBackup(tag);

      console.log('✅ Backup criado com sucesso!');
      console.log(`📁 Localização: ${backupInfo.path}`);
      console.log(`📊 Tamanho: ${Math.round(backupInfo.size / 1024)}KB`);
      console.log(`📄 Arquivos: ${backupInfo.files.length}`);
      console.log(`🕐 Timestamp: ${backupInfo.timestamp}`);

    } catch (error) {
      console.log(`❌ Erro ao criar backup: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Lista backups disponíveis
   */
  async listBackups() {
    console.log('📋 Listando backups disponíveis...\n');

    try {
      const backups = await this.migrationManager.listBackups();

      if (backups.length === 0) {
        console.log('❌ Nenhum backup encontrado');
        return;
      }

      backups.forEach((backup, index) => {
        console.log(`${index + 1}. 📦 Backup`);
        console.log(`   Versão: ${backup.version}`);
        console.log(`   Data: ${backup.timestamp}`);
        console.log(`   Localização: ${backup.path}`);
        console.log(`   Tamanho: ${Math.round(backup.size / 1024)}KB`);
        console.log(`   Arquivos: ${Array.isArray(backup.files) ? backup.files.length : backup.files}`);
        console.log('');
      });

      console.log(`✅ ${backups.length} backup(s) encontrado(s)`);

    } catch (error) {
      console.log(`❌ Erro ao listar backups: ${error.message}`);
    }
  }

  /**
   * Restaura backup
   */
  async restoreBackup(backupPath) {
    if (!backupPath) {
      console.log('❌ Caminho do backup é obrigatório');
      console.log('💡 Use: node migration-cli.js restore <backup-path>');
      return;
    }

    console.log(`🔄 Restaurando backup de: ${backupPath}`);

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirm = await new Promise(resolve => {
      rl.question('⚠️  Esta operação substituirá a instalação atual. Continuar? (y/N): ', resolve);
    });
    rl.close();

    if (confirm.toLowerCase() !== 'y') {
      console.log('❌ Operação cancelada');
      return;
    }

    try {
      await this.migrationManager.restoreFromBackup(backupPath);
      console.log('✅ Backup restaurado com sucesso!');
    } catch (error) {
      console.log(`❌ Erro ao restaurar backup: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Executa migração
   */
  async migrate(targetVersion) {
    if (!targetVersion) {
      console.log('❌ Versão de destino é obrigatória');
      console.log('💡 Use: node migration-cli.js migrate <version>');
      console.log('💡 Versões disponíveis: simplified');
      return;
    }

    console.log(`🚀 Iniciando migração para: ${targetVersion}`);

    const currentVersion = await this.migrationManager.detectInstalledVersion();

    if (!currentVersion) {
      console.log('❌ Nenhuma instalação detectada para migrar');
      return;
    }

    if (currentVersion === targetVersion) {
      console.log('✅ Já está na versão de destino');
      return;
    }

    console.log(`📋 Migração: ${currentVersion} → ${targetVersion}`);

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirm = await new Promise(resolve => {
      rl.question('⚠️  Um backup será criado automaticamente. Continuar? (Y/n): ', resolve);
    });
    rl.close();

    if (confirm.toLowerCase() === 'n') {
      console.log('❌ Operação cancelada');
      return;
    }

    try {
      await this.migrationManager.migrate(currentVersion, targetVersion);
      console.log('✅ Migração concluída com sucesso!');

      // Mostrar nova versão
      const newVersion = await this.migrationManager.detectInstalledVersion();
      console.log(`🎉 Versão atual: ${newVersion}`);

    } catch (error) {
      console.log(`❌ Erro durante migração: ${error.message}`);
      console.log('💡 Use "node migration-cli.js list-backups" para ver backups disponíveis');
      console.log('💡 Use "node migration-cli.js restore <backup>" para reverter');
      process.exit(1);
    }
  }

  /**
   * Limpa backups antigos
   */
  async cleanup() {
    console.log('🧹 Limpando backups antigos...');

    try {
      await this.migrationManager.cleanupOldBackups(5); // Manter 5 backups
      console.log('✅ Limpeza concluída');
    } catch (error) {
      console.log(`❌ Erro na limpeza: ${error.message}`);
    }
  }

  /**
   * Mostra status da instalação
   */
  async showStatus() {
    console.log('📊 STATUS DA INSTALAÇÃO\n');

    const version = await this.migrationManager.detectInstalledVersion();
    const mcpDir = path.join(os.homedir(), '.mcp-terminal');

    console.log(`🔍 Versão: ${version || 'Não detectada'}`);
    console.log(`📁 Diretório: ${mcpDir}`);

    try {
      const fs = await import('fs');
      const stats = await fs.promises.stat(mcpDir);
      console.log(`📅 Modificado: ${stats.mtime.toISOString()}`);

      // Verificar arquivos principais
      const mainFiles = ['mcp-client.js', 'mcp-assistant.js', 'setup.js', 'config.json'];
      console.log('\n📄 ARQUIVOS PRINCIPAIS:');

      for (const file of mainFiles) {
        try {
          await fs.promises.access(path.join(mcpDir, file));
          console.log(`   ✅ ${file}`);
        } catch {
          console.log(`   ❌ ${file} - não encontrado`);
        }
      }

    } catch {
      console.log('❌ Instalação não encontrada');
    }

    // Listar backups
    const backups = await this.migrationManager.listBackups();
    console.log(`\n💾 BACKUPS: ${backups.length} disponível(eis)`);
  }

  /**
   * Executa comando baseado nos argumentos
   */
  async run() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help' || command === '-h') {
      this.showHelp();
      return;
    }

    try {
      switch (command) {
        case 'detect':
          await this.detectVersion();
          break;

        case 'backup':
          await this.createBackup(args[1]);
          break;

        case 'list-backups':
          await this.listBackups();
          break;

        case 'restore':
          await this.restoreBackup(args[1]);
          break;

        case 'migrate':
          await this.migrate(args[1]);
          break;

        case 'cleanup':
          await this.cleanup();
          break;

        case 'status':
          await this.showStatus();
          break;

        default:
          console.log(`❌ Comando desconhecido: ${command}`);
          this.showHelp();
          process.exit(1);
      }
    } catch (error) {
      console.log(`❌ Erro: ${error.message}`);
      if (process.argv.includes('--verbose')) {
        console.log(error.stack);
      }
      process.exit(1);
    }
  }
}

// Executar CLI se for o script principal
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new MigrationCLI();
  cli.run().catch(error => {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  });
}

export { MigrationCLI };