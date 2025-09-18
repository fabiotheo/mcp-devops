#!/usr/bin/env node

/**
 * Demo do Claude Code Style Interface
 * Mostra a diferença entre o estilo antigo e novo
 */

import chalk from 'chalk';

// Simular interface antiga (com duplicação)
function showOldInterface() {
    console.log(chalk.yellow('=== INTERFACE ANTIGA (COM DUPLICAÇÃO) ===\n'));

    // Simular SessionBox
    console.log('   ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');
    console.log('   │                                                                                                                                   ');
    console.log('   │ Session:                                                                                                                          ');
    console.log('   │ ❯ Olá, tudo bem?                                                                                                                  ');
    console.log('   │ Olá! Tudo bem, obrigado! 😊                                                                                                       ');
    console.log('   │                                                                                                                                   ');
    console.log('   │ Sou um assistente especializado em administração de sistemas Linux. Estou aqui para te ajudar com tarefas relacionadas a:...      ');
    console.log('   │                                                                                                                                   ');
    console.log('   └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');

    console.log('\n   ╭───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');
    console.log('   │                                                                                                                                   ');
    console.log('   │ Olá! Tudo bem, obrigado! 😊                                                                                                       ');
    console.log('   │                                                                                                                                   ');
    console.log('   │ Sou um assistente especializado em administração de sistemas Linux. Estou aqui para te ajudar com tarefas relacionadas a:         ');
    console.log('   │                                                                                                                                   ');
    console.log('   │ - Administração geral do sistema                                                                                                  ');
    console.log('   │ - Monitoramento de serviços                                                                                                       ');
    console.log('   │ - Análise de logs                                                                                                                 ');
    console.log('   │ - Configuração de segurança                                                                                                       ');
    console.log('   │ - Gerenciamento do fail2ban                                                                                                       ');
    console.log('   │ - Troubleshooting em geral                                                                                                        ');
    console.log('   │ - E muito mais!                                                                                                                   ');
    console.log('   │                                                                                                                                   ');
    console.log('   │ Como posso te ajudar hoje? Se precisar executar algum comando no sistema ou verificar alguma configuração, é só me falar!         ');
    console.log('   │                                                                                                                                   ');
    console.log('   ╰───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────');

    console.log('\n   ❯ █\n');

    console.log(chalk.red('❌ PROBLEMA: Duplicação visual - resposta aparece 2 vezes!'));
    console.log(chalk.red('❌ CONFUSO: Usuário não sabe onde focar'));
    console.log(chalk.red('❌ ESPAÇO: Desperdício de espaço na tela\n'));
}

// Simular interface nova (Claude Code Style)
function showNewInterface() {
    console.log(chalk.green('=== NOVA INTERFACE (CLAUDE CODE STYLE) ===\n'));

    console.log(chalk.cyan.bold('MCP Terminal Assistant'));
    console.log(chalk.gray('Claude Code Style • Type /help for commands\n'));

    console.log(chalk.green('❯') + ' Olá, tudo bem?');
    console.log();

    // Simular streaming de resposta
    const response = `Olá! Tudo bem, obrigado!

Sou um assistente especializado em administração de sistemas Linux. Estou aqui para te ajudar com tarefas relacionadas a:

• Administração geral do sistema
• Monitoramento de serviços
• Análise de logs
• Configuração de segurança
• Gerenciamento do fail2ban
• Troubleshooting em geral

Como posso te ajudar hoje?`;

    console.log(response);
    console.log();
    console.log(chalk.green('❯') + ' █');
    console.log();

    console.log(chalk.green('✅ SEM DUPLICAÇÃO: Resposta aparece apenas uma vez'));
    console.log(chalk.green('✅ LIMPO: Interface clara e focada'));
    console.log(chalk.green('✅ FAMILIAR: Estilo Claude Code que usuários conhecem'));
    console.log(chalk.green('✅ STREAMING: Texto aparece progressivamente'));
    console.log(chalk.green('✅ EFICIENTE: Mais espaço útil na tela\n'));
}

// Demo completa
function runDemo() {
    console.clear();
    console.log(chalk.cyan.bold('📊 DEMONSTRAÇÃO: MIGRAÇÃO PARA CLAUDE CODE STYLE\n'));
    console.log(chalk.gray('Comparação entre interface antiga e nova\n'));

    showOldInterface();

    console.log(chalk.yellow('─'.repeat(120)));
    console.log();

    showNewInterface();

    console.log(chalk.cyan('🎯 RESULTADO DA MIGRAÇÃO:'));
    console.log(chalk.gray('• Eliminada duplicação visual'));
    console.log(chalk.gray('• Interface mais limpa e profissional'));
    console.log(chalk.gray('• Melhor experiência do usuário'));
    console.log(chalk.gray('• Alinhamento com padrões modernos de CLI\n'));

    console.log(chalk.green('✅ Fase 2 implementada com sucesso!'));
}

runDemo();