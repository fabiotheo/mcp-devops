/**
 * Enhanced Paste Manager
 *
 * UX Perfeita para entrada multi-linha:
 * - Detecção automática via bracketed paste mode
 * - Comando /paste para modo manual
 * - Linha vazia dupla para finalizar (sem delimitadores)
 * - Feedback visual clean
 * - Buffer inteligente com preview
 */

import chalk from 'chalk';

class EnhancedPasteManager {
  constructor(readline, attachments) {
    this.readline = readline;
    this.attachments = attachments;
    this.isInManualPaste = false;
    this.isInBracketedPaste = false;
    this.buffer = [];
    this.lastEmptyLine = false;
    this.originalPrompt = '';
    this.setupBracketedPaste();
    this.setupInputHandling();
  }

  setupBracketedPaste() {
    // TEMPORARILY DISABLED - causing input issues
    // process.stdout.write('\x1b[?2004h');

    // Cleanup na saída
    process.on('exit', () => {
      this.disableBracketedPaste();
    });
    process.on('SIGINT', () => {
      this.disableBracketedPaste();
    });
  }

  disableBracketedPaste() {
    process.stdout.write('\x1b[?2004l');
  }

  setupInputHandling() {
    // TEMPORARILY DISABLED - Bracketed paste intercepting all input
    // Breaking readline functionality (arrows, delete, etc.)
    // Will implement safer approach later
    console.log(
      chalk.yellow(
        '📋 Bracketed paste temporarily disabled - use /paste command',
      ),
    );
  }

  handleRawData(data) {
    const str = data.toString();

    // Detectar início de bracketed paste
    if (str.includes('\x1b[200~')) {
      this.startBracketedPaste();
      const cleanData = str.replace('\x1b[200~', '');
      if (cleanData) {
        this.buffer.push(cleanData);
      }
      return true;
    }

    // Detectar fim de bracketed paste
    if (this.isInBracketedPaste && str.includes('\x1b[201~')) {
      const cleanData = str.replace('\x1b[201~', '');
      if (cleanData) {
        this.buffer.push(cleanData);
      }
      this.endBracketedPaste();
      return true;
    }

    // Durante bracketed paste, acumular no buffer
    if (this.isInBracketedPaste) {
      this.buffer.push(str);
      return true;
    }

    return false; // Não interceptado
  }

  startBracketedPaste() {
    this.isInBracketedPaste = true;
    this.buffer = [];
    this.showPasteStartMessage();
  }

  endBracketedPaste() {
    this.isInBracketedPaste = false;
    const content = this.buffer.join('').trim();
    this.processPastedContent(content);
    this.buffer = [];
  }

  startManualPaste() {
    if (this.isInManualPaste) {
      this.readline.write(
        chalk.yellow(
          '📝 Já está em modo paste. Use linha vazia dupla para finalizar.\n',
        ),
      );
      this.readline.prompt();
      return;
    }

    this.isInManualPaste = true;
    this.buffer = [];
    this.lastEmptyLine = false;
    this.originalPrompt = this.readline.getPrompt();

    this.readline.write(chalk.cyan('\n📝 Modo Paste Ativo\n'));
    this.readline.write(chalk.gray('   → Digite ou cole seu conteúdo\n'));
    this.readline.write(
      chalk.gray('   → Pressione Enter duas vezes seguidas para finalizar\n'),
    );
    this.readline.write(chalk.gray('   → Digite /cancel para cancelar\n\n'));

    this.readline.setPrompt(chalk.blue('📝 '));
    this.readline.prompt();
  }

  handleManualPasteLine(line) {
    // Comando para cancelar
    if (line.trim() === '/cancel') {
      this.cancelManualPaste();
      return true;
    }

    // Detectar linha vazia dupla para finalizar
    if (line.trim() === '') {
      if (this.lastEmptyLine) {
        this.endManualPaste();
        return true;
      }
      this.lastEmptyLine = true;
    } else {
      this.lastEmptyLine = false;
    }

    // Adicionar linha ao buffer
    this.buffer.push(line);

    // Mostrar preview compacto
    this.showBufferPreview();
    this.readline.prompt();
    return true;
  }

  endManualPaste() {
    this.isInManualPaste = false;

    // Remover linha vazia final
    if (
      this.buffer.length > 0 &&
      this.buffer[this.buffer.length - 1].trim() === ''
    ) {
      this.buffer.pop();
    }

    const content = this.buffer.join('\n').trim();
    this.buffer = [];

    // Restaurar prompt original
    this.readline.setPrompt(this.originalPrompt);

    if (content) {
      this.processPastedContent(content);
    } else {
      this.readline.write(
        chalk.gray('📝 Modo paste cancelado (sem conteúdo)\n'),
      );
      this.readline.prompt();
    }
  }

  cancelManualPaste() {
    this.isInManualPaste = false;
    this.buffer = [];
    this.readline.setPrompt(this.originalPrompt);
    this.readline.write(chalk.yellow('📝 Modo paste cancelado\n'));
    this.readline.prompt();
  }

  processPastedContent(content) {
    if (!content.trim()) {
      this.readline.prompt();
      return;
    }

    const lines = content.split('\n');

    // Se é conteúdo pequeno (≤ 3 linhas), inserir diretamente
    if (lines.length <= 3 && content.length < 200) {
      this.insertDirectly(content);
      return;
    }

    // Conteúdo grande: criar attachment
    const id = this.attachments.addAttachment(content);
    const placeholder = this.attachments.getPlaceholder(id);

    this.readline.write('\n');
    this.readline.write(
      chalk.green(`✅ Conteúdo salvo como anexo ${placeholder}\n`),
    );
    this.readline.write(
      chalk.gray(`   ${lines.length} linhas, ${content.length} caracteres\n`),
    );
    this.readline.write(
      chalk.gray(`   Use /expand ${placeholder} para ver o conteúdo\n`),
    );

    // Inserir placeholder na linha atual
    this.readline.write(placeholder);
    this.readline.prompt();
  }

  insertDirectly(content) {
    // Inserir conteúdo diretamente na linha de comando
    const singleLine = content.replace(/\n/g, ' ').trim();
    this.readline.write(singleLine);
    this.readline.prompt();
  }

  showPasteStartMessage() {
    this.readline.write('\n');
    this.readline.write(chalk.cyan('📋 Paste detectado - processando...\n'));
  }

  showBufferPreview() {
    const lineCount = this.buffer.length;
    if (lineCount === 0) return;

    const preview = this.buffer
      .slice(-2)
      .map(line => (line.length > 60 ? line.substring(0, 57) + '...' : line));

    // Limpar linha atual e mostrar preview
    this.readline.write(
      `\r${chalk.gray(`[${lineCount} linhas] ${preview.join(' | ')}`)} `,
    );
  }

  // Comandos públicos
  handlePasteCommand() {
    this.startManualPaste();
  }

  handleLineInput(line) {
    if (this.isInManualPaste) {
      return this.handleManualPasteLine(line);
    }
    return false; // Não processado
  }

  // Status e limpeza
  isInPasteMode() {
    return this.isInManualPaste || this.isInBracketedPaste;
  }

  getStatus() {
    return {
      manualPaste: this.isInManualPaste,
      bracketedPaste: this.isInBracketedPaste,
      bufferLines: this.buffer.length,
    };
  }

  cleanup() {
    this.disableBracketedPaste();
    this.isInManualPaste = false;
    this.isInBracketedPaste = false;
    this.buffer = [];
  }
}

export default EnhancedPasteManager;
