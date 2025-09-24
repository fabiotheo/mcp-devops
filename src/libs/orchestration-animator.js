// libs/orchestration-animator.js
// Sistema de animação visual para orquestração inteligente

import chalk from 'chalk';
import readline from 'readline';

export default class OrchestrationAnimator {
  constructor() {
    this.isAnimating = false;
    this.currentFrame = 0;
    this.animationTimer = null;
    this.statusMessages = [];
    this.executedCommands = [];
    this.startTime = Date.now();

    // Diferentes estilos de spinner
    this.spinners = {
      dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
      bouncing: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'],
      pulse: ['◐', '◓', '◑', '◒'],
      rocket: ['🚀', '🛸', '✨', '💫'],
      brain: ['🧠', '💭', '💡', '✨'],
      tech: ['⚡', '🔧', '⚙️', '🔩'],
      loading: ['█▒▒▒▒', '██▒▒▒', '███▒▒', '████▒', '█████'],
      progress: ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[====]'],
    };

    // Mensagens motivacionais que aparecem durante o processamento
    this.thinkingMessages = [
      'Analisando o sistema',
      'Processando informações',
      'Executando comandos',
      'Coletando dados',
      'Verificando serviços',
      'Consultando configurações',
      'Preparando resposta',
      'Organizando resultados',
      'Validando informações',
      'Finalizando análise',
    ];

    this.currentSpinner = 'brain';
    this.currentMessageIndex = 0;
  }

  start(initialMessage = 'Iniciando análise inteligente') {
    if (this.isAnimating) return;

    this.isAnimating = true;
    this.startTime = Date.now();
    this.currentFrame = 0;
    this.currentMessageIndex = 0;

    // Limpa linha e mostra mensagem inicial
    console.log(
      chalk.cyan(
        '\n╔════════════════════════════════════════════════════════╗',
      ),
    );
    console.log(
      chalk.cyan('║ ') +
        chalk.bold.white('🤖 ORQUESTRAÇÃO INTELIGENTE ATIVADA') +
        chalk.cyan('                  ║'),
    );
    console.log(
      chalk.cyan('╚════════════════════════════════════════════════════════╝'),
    );
    console.log();

    // Inicia animação
    this.animationTimer = setInterval(() => this.animate(), 100);

    // Muda mensagem periodicamente
    this.messageTimer = setInterval(() => {
      this.currentMessageIndex =
        (this.currentMessageIndex + 1) % this.thinkingMessages.length;
    }, 2000);
  }

  animate() {
    if (!this.isAnimating) return;

    const spinner = this.spinners[this.currentSpinner];
    const frame = spinner[this.currentFrame % spinner.length];
    const message = this.thinkingMessages[this.currentMessageIndex];
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);

    // Limpa linha anterior
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // Constrói linha de status
    let statusLine = `${frame} ${chalk.yellow(message)}`;

    // Adiciona timer
    statusLine += chalk.gray(` (${elapsed}s)`);

    // Se há comandos executados, mostra contador
    if (this.executedCommands.length > 0) {
      statusLine += chalk.green(` • ${this.executedCommands.length} comandos`);
    }

    // Adiciona indicador de progresso visual
    const progressBar = this.createProgressBar(this.currentFrame);
    statusLine += ' ' + progressBar;

    process.stdout.write(statusLine);

    this.currentFrame++;
  }

  createProgressBar(frame) {
    const width = 20;
    const position =
      frame % (width * 2) > width
        ? width * 2 - (frame % (width * 2))
        : frame % (width * 2);

    let bar = '';
    for (let i = 0; i < width; i++) {
      if (i === position) {
        bar += chalk.cyan('█');
      } else if (Math.abs(i - position) === 1) {
        bar += chalk.blue('▓');
      } else if (Math.abs(i - position) === 2) {
        bar += chalk.blueBright('▒');
      } else {
        bar += chalk.gray('░');
      }
    }

    return `[${bar}]`;
  }

  addCommand(command) {
    this.executedCommands.push(command);

    // Mostra o comando sendo executado temporariamente
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    console.log(chalk.gray(`  └─ Executando: ${chalk.white(command)}`));

    // Volta para a animação
    setTimeout(() => {
      readline.moveCursor(process.stdout, 0, -1);
      readline.clearLine(process.stdout, 0);
    }, 1500);
  }

  updateStatus(status) {
    this.statusMessages.push(status);

    // Mostra status temporariamente
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    console.log(chalk.blue(`  ℹ ${status}`));

    // Volta para animação
    setTimeout(() => {
      readline.moveCursor(process.stdout, 0, -1);
      readline.clearLine(process.stdout, 0);
    }, 1500);
  }

  showProgress(current, total, description) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    const percentage = Math.floor((current / total) * 100);
    const filled = Math.floor((current / total) * 30);
    const empty = 30 - filled;

    const progressBar =
      chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));

    console.log(`  📊 ${description}: [${progressBar}] ${percentage}%`);

    setTimeout(() => {
      readline.moveCursor(process.stdout, 0, -1);
      readline.clearLine(process.stdout, 0);
    }, 1500);
  }

  switchStyle(style) {
    if (this.spinners[style]) {
      this.currentSpinner = style;
    }
  }

  stop(finalMessage = null) {
    if (!this.isAnimating) return;

    this.isAnimating = false;

    // Para timers
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }

    if (this.messageTimer) {
      clearInterval(this.messageTimer);
      this.messageTimer = null;
    }

    // Limpa linha final
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // Mostra estatísticas finais
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    if (finalMessage) {
      console.log(chalk.green(`✅ ${finalMessage}`));
    }

    // Mostra resumo da execução
    if (this.executedCommands.length > 0) {
      console.log(chalk.gray(`\n📈 Análise concluída:`));
      console.log(chalk.gray(`  • Tempo total: ${elapsed}s`));
      console.log(
        chalk.gray(`  • Comandos executados: ${this.executedCommands.length}`),
      );
      console.log(
        chalk.gray(`  • Etapas processadas: ${this.statusMessages.length}`),
      );
    }
  }

  showInteractiveProgress() {
    // Cria uma experiência mais interativa
    const stages = [
      { icon: '🔍', text: 'Analisando pergunta', duration: 500 },
      { icon: '📋', text: 'Identificando comandos necessários', duration: 800 },
      { icon: '⚙️', text: 'Preparando execução', duration: 600 },
      { icon: '🚀', text: 'Executando comandos', duration: 1000 },
      { icon: '📊', text: 'Processando resultados', duration: 700 },
      { icon: '✨', text: 'Preparando resposta', duration: 500 },
    ];

    let currentStage = 0;

    const showNextStage = () => {
      if (currentStage < stages.length && this.isAnimating) {
        const stage = stages[currentStage];

        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        console.log(chalk.cyan(`  ${stage.icon} ${stage.text}...`));

        currentStage++;

        setTimeout(() => {
          readline.moveCursor(process.stdout, 0, -1);
          readline.clearLine(process.stdout, 0);
          showNextStage();
        }, stage.duration);
      }
    };

    showNextStage();
  }
}

// Singleton para uso global
export const orchestrationAnimator = new OrchestrationAnimator();
