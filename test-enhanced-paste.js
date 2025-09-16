#!/usr/bin/env node

/**
 * Teste para o Enhanced Paste Manager
 *
 * Testa diferentes cenários:
 * - Comando /paste manual
 * - Detecção automática de bracketed paste
 * - Entrada de texto pequeno vs. grande
 * - Cancelamento
 */

import readline from 'readline';
import chalk from 'chalk';
import EnhancedPasteManager from './libs/enhanced-paste-manager.js';
import PasteAttachments from './libs/paste-attachments.js';

class TestInteractive {
    constructor() {
        this.setupReadline();
        this.attachments = new PasteAttachments();
        this.pasteManager = new EnhancedPasteManager(this.rl, this.attachments);
        this.setupListeners();
    }

    setupReadline() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'test> ',
            historySize: 100
        });
    }

    setupListeners() {
        this.rl.on('line', (line) => {
            // Se paste manager processou, return
            if (this.pasteManager.handleLineInput(line)) {
                return;
            }

            line = line.trim();

            if (line === '/exit' || line === '/quit') {
                this.exit();
                return;
            }

            if (line === '/paste') {
                this.pasteManager.handlePasteCommand();
                return;
            }

            if (line === '/status') {
                console.log(chalk.cyan('Status:'), this.pasteManager.getStatus());
                this.rl.prompt();
                return;
            }

            if (line === '/list') {
                const attachments = this.attachments.listAttachments();
                if (attachments.length === 0) {
                    console.log(chalk.yellow('Nenhum attachment'));
                } else {
                    console.log(chalk.cyan('Attachments:'));
                    attachments.forEach(att => {
                        console.log(`  ${this.attachments.getPlaceholder(att.id)} - ${att.lines} linhas`);
                    });
                }
                this.rl.prompt();
                return;
            }

            if (line.startsWith('/expand ')) {
                const id = parseInt(line.split(' ')[1].replace('#', ''));
                const attachment = this.attachments.getAttachment(id);
                if (attachment) {
                    console.log(chalk.cyan(`\n=== Attachment #${id} ===`));
                    console.log(attachment.content);
                    console.log(chalk.cyan(`=== Fim ===\n`));
                } else {
                    console.log(chalk.red(`Attachment #${id} não encontrado`));
                }
                this.rl.prompt();
                return;
            }

            if (line === '/help') {
                this.showHelp();
                this.rl.prompt();
                return;
            }

            // Entrada normal
            console.log(chalk.green('Você disse:'), line);
            this.rl.prompt();
        });

        this.rl.on('SIGINT', () => {
            this.exit();
        });
    }

    showHelp() {
        console.log(chalk.cyan(`
═══ Teste Enhanced Paste Manager ═══

Comandos:
  /paste      - Entra em modo paste manual
  /status     - Mostra status do paste manager
  /list       - Lista attachments
  /expand #N  - Mostra conteúdo do attachment N
  /help       - Mostra esta ajuda
  /exit       - Sair

Testes:
  1. Digite /paste e cole texto multi-linha
  2. Cole texto diretamente (bracketed paste)
  3. Digite texto normal
  4. Teste cancelamento com /cancel

Cole este texto para testar:
---
function hello() {
    console.log("Hello world!");
    return "test";
}

const data = {
    name: "test",
    value: 123
};
---
        `));
    }

    start() {
        console.log(chalk.cyan('🧪 Teste Enhanced Paste Manager'));
        console.log(chalk.gray('Digite /help para comandos disponíveis\n'));
        this.rl.prompt();
    }

    exit() {
        console.log(chalk.yellow('\nLimpando...'));
        this.pasteManager.cleanup();
        this.rl.close();
        console.log(chalk.cyan('Teste finalizado!'));
        process.exit(0);
    }
}

// Iniciar teste
const test = new TestInteractive();
test.start();