#!/usr/bin/env node

/**
 * MultiLineInput - Sistema de entrada multi-linha
 * Suporta blocos com """ e continuação com \
 */

import chalk from 'chalk';

type InputMode = 'single' | 'multiline' | 'block' | 'continuation' | 'brackets';

interface MultiLineOptions {
  blockDelimiter?: string;
  continuationChar?: string;
  continuationPrompt?: string;
  normalPrompt?: string;
}

interface ProcessResult {
  complete: boolean;
  text?: string;
  prompt?: string;
  mode: InputMode;
  message?: string;
  openBrackets?: number;
}

interface InputStatus {
  mode: InputMode;
  inBlock: boolean;
  bufferSize: number;
  openBrackets: number;
}

export default class MultiLineInput {
  private mode: InputMode;
  private buffer: string[];
  private blockDelimiter: string;
  private continuationChar: string;
  private continuationPrompt: string;
  private normalPrompt: string;
  private inBlock: boolean;
  private bracketStack: string[];

  constructor(options: MultiLineOptions = {}) {
    this.mode = 'single'; // single, multiline, block
    this.buffer = [];
    this.blockDelimiter = options.blockDelimiter || '"""';
    this.continuationChar = options.continuationChar || '\\';
    this.continuationPrompt = options.continuationPrompt || '... ';
    this.normalPrompt = options.normalPrompt || 'mcp> ';
    this.inBlock = false;
    this.bracketStack = [];
  }

  /**
   * Processa input e determina se precisa continuar
   */
  public processInput(input: string): ProcessResult {
    // Verifica se é início/fim de bloco """
    if (this.isBlockDelimiter(input)) {
      return this.handleBlockDelimiter(input);
    }

    // Se está em bloco, adiciona ao buffer
    if (this.inBlock) {
      this.buffer.push(input);
      return {
        complete: false,
        prompt: this.continuationPrompt,
        mode: 'block',
      };
    }

    // Verifica continuação com \
    if (this.hasContinuation(input)) {
      return this.handleContinuation(input);
    }

    // Verifica brackets abertos
    if (this.hasOpenBrackets(input)) {
      return this.handleOpenBrackets(input);
    }

    // Input completo
    return {
      complete: true,
      text: this.getCompleteText(input),
      mode: 'single',
    };
  }

  /**
   * Verifica se é delimitador de bloco
   */
  private isBlockDelimiter(input: string): boolean {
    return input.trim() === this.blockDelimiter;
  }

  /**
   * Processa delimitador de bloco
   */
  private handleBlockDelimiter(input: string): ProcessResult {
    if (!this.inBlock) {
      // Início de bloco
      this.inBlock = true;
      this.mode = 'block';
      this.buffer = [];

      return {
        complete: false,
        prompt: this.continuationPrompt,
        mode: 'block',
        message: chalk.gray(
          '(Digite ' + this.blockDelimiter + ' novamente para finalizar)',
        ),
      };
    } else {
      // Fim de bloco
      this.inBlock = false;
      this.mode = 'single';

      const text = this.buffer.join('\n');
      this.buffer = [];

      return {
        complete: true,
        text: text,
        mode: 'single',
      };
    }
  }

  /**
   * Verifica se tem continuação com \
   */
  private hasContinuation(input: string): boolean {
    return input.trimEnd().endsWith(this.continuationChar);
  }

  /**
   * Processa continuação
   */
  private handleContinuation(input: string): ProcessResult {
    // Remove o \ do final
    const cleanInput = input.substring(
      0,
      input.lastIndexOf(this.continuationChar),
    );
    this.buffer.push(cleanInput);

    return {
      complete: false,
      prompt: this.continuationPrompt,
      mode: 'continuation',
    };
  }

  /**
   * Verifica brackets abertos
   */
  private hasOpenBrackets(input: string): boolean {
    const openBrackets = ['(', '[', '{'];
    const closeBrackets = [')', ']', '}'];
    const pairs: { [key: string]: string } = { '(': ')', '[': ']', '{': '}' };

    let stack = [...this.bracketStack];

    for (const char of input) {
      if (openBrackets.includes(char)) {
        stack.push(char);
      } else if (closeBrackets.includes(char)) {
        const expected = pairs[stack[stack.length - 1]];
        if (expected === char) {
          stack.pop();
        }
      }
    }

    this.bracketStack = stack;
    return stack.length > 0;
  }

  /**
   * Processa brackets abertos
   */
  private handleOpenBrackets(input: string): ProcessResult {
    this.buffer.push(input);

    return {
      complete: false,
      prompt: this.continuationPrompt,
      mode: 'brackets',
      openBrackets: this.bracketStack.length,
    };
  }

  /**
   * Obtém texto completo
   */
  private getCompleteText(additionalInput: string = ''): string {
    if (this.buffer.length === 0) {
      return additionalInput;
    }

    const allLines = [...this.buffer];
    if (additionalInput) {
      allLines.push(additionalInput);
    }

    this.buffer = [];
    this.bracketStack = [];

    return allLines.join('\n');
  }

  /**
   * Cancela input multi-linha
   */
  public cancel(): boolean {
    const wasMultiline = this.buffer.length > 0 || this.inBlock;

    this.buffer = [];
    this.bracketStack = [];
    this.inBlock = false;
    this.mode = 'single';

    return wasMultiline;
  }

  /**
   * Reseta estado
   */
  public reset(): void {
    this.buffer = [];
    this.bracketStack = [];
    this.inBlock = false;
    this.mode = 'single';
  }

  /**
   * Obtém prompt atual
   */
  public getCurrentPrompt(): string {
    if (this.mode === 'single') {
      return this.normalPrompt;
    }
    return this.continuationPrompt;
  }

  /**
   * Verifica se está em modo multi-linha
   */
  public isMultiline(): boolean {
    return this.mode !== 'single';
  }

  /**
   * Obtém status
   */
  public getStatus(): InputStatus {
    return {
      mode: this.mode,
      inBlock: this.inBlock,
      bufferSize: this.buffer.length,
      openBrackets: this.bracketStack.length,
    };
  }

  /**
   * Formata preview do buffer
   */
  public getBufferPreview(maxLines: number = 3): string {
    if (this.buffer.length === 0) return '';

    const preview = this.buffer.slice(-maxLines);
    const omitted = this.buffer.length - maxLines;

    let result = '';
    if (omitted > 0) {
      result += chalk.gray(`... (${omitted} linhas omitidas)\n`);
    }

    result += preview
      .map(line => chalk.gray(this.continuationPrompt) + line)
      .join('\n');

    return result;
  }

  /**
   * Detecta comando especial para multi-linha
   */
  public shouldStartMultiline(input: string): boolean {
    // Detecta padrões que indicam multi-linha
    const patterns = [
      /^def\s+/, // Python function
      /^class\s+/, // Python class
      /^if\s+.*:$/, // Python if
      /^for\s+.*:$/, // Python for
      /^while\s+.*:$/, // Python while
      /^function\s+/, // JavaScript function
      /^const.*=.*{$/, // JavaScript object
      /^{$/, // JSON start
      /^\[$/, // Array start
    ];

    return patterns.some(pattern => pattern.test(input.trim()));
  }
}
