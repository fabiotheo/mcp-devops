#!/usr/bin/env node

/**
 * MCP Terminal Assistant - Simple Readline Version
 * Clean and functional interface without complex dependencies
 */

import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';

console.log(chalk.green('🚀 MCP Terminal Assistant - Simple Version'));
console.log(chalk.gray('Interface simplificada para resolver problemas temporários\n'));

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('❯ ')
});

let isProcessing = false;

// Função básica para simular resposta
async function processCommand(command) {
    if (isProcessing) return;

    isProcessing = true;
    console.log(chalk.yellow('🔄 Processando...'));

    // Simulação básica
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (command.startsWith('/help')) {
        console.log(chalk.blue(`
Comandos disponíveis:
/help     - Mostra esta ajuda
/status   - Status do sistema
/exit     - Sair

Para questões Linux/Unix, digite sua pergunta normalmente.
        `));
    } else if (command.startsWith('/status')) {
        console.log(chalk.green('✅ Sistema funcionando - Interface simplificada ativa'));
    } else if (command.startsWith('/exit')) {
        console.log(chalk.green('👋 Até logo!'));
        process.exit(0);
    } else {
        console.log(chalk.blue(`
Você perguntou: "${command}"

Esta é uma interface simplificada temporária.
Para funcionalidade completa, use: node mcp-ink.js

Comandos disponíveis: /help, /status, /exit
        `));
    }

    isProcessing = false;
    rl.prompt();
}

rl.prompt();

rl.on('line', (input) => {
    const command = input.trim();
    if (command) {
        processCommand(command);
    } else {
        rl.prompt();
    }
});

rl.on('close', () => {
    console.log(chalk.green('\n👋 Até logo!'));
    process.exit(0);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n🛑 Interrompido pelo usuário'));
    process.exit(0);
});