/**
 * Paste Manager
 * High-level orchestration of paste detection and attachment management
 */

import PasteDetector from './paste-detector';
import PasteAttachments from './paste-attachments';
import chalk from 'chalk';
import type { Interface as ReadlineInterface } from 'readline';

interface KeypressKey {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

class PasteManager {
  private readline: ReadlineInterface;
  private attachments: PasteAttachments;
  private detector: PasteDetector;
  private fallbackTimer: NodeJS.Timeout | null;

  constructor(readline: ReadlineInterface, attachments: PasteAttachments) {
    this.readline = readline;
    this.attachments = attachments;
    this.detector = new PasteDetector();
    this.fallbackTimer = null;
    this.setupDetection();
  }

  private setupDetection(): void {
    // TEMPORARILY DISABLED - paste detection interfering with normal input
    // Enable bracketed paste mode
    // this.detector.enableBracketedPaste();

    // Use readline's keypress events instead of raw mode
    // if (this.readline.input.isTTY) {
    //     this.readline.input.setRawMode(true);
    //     this.readline.input.on('keypress', this.handleKeypress.bind(this));
    // }

    console.log('📎 Paste detection temporarily disabled to fix input issues');
  }

  private handleKeypress(str: string | undefined, key: KeypressKey): boolean | void {
    if (!str) return true;

    // Only handle bracketed paste sequences, disable fallback detection for now
    if (this.detector.detectPasteStart(str)) {
      this.startPasteCapture();
      return;
    }

    if (this.detector.isInPaste) {
      if (this.detector.detectPasteEnd(str)) {
        this.endPasteCapture();
      } else {
        this.detector.pasteBuffer += str;
      }
      return;
    }

    // DISABLED: Fallback detection is too aggressive
    // if (this.detector.useFallbackDetection(str)) {
    //     this.startFallbackCapture(str);
    //     return;
    // }

    // Let readline handle normal input
    return true;
  }

  private startFallbackCapture(initialData: string): void {
    if (this.detector.isInPaste) return; // Already capturing

    this.detector.isInPaste = true;
    this.detector.pasteBuffer = initialData;

    // Clear any existing timer
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
    }

    // Set a timer to end the paste capture
    this.fallbackTimer = setTimeout(() => {
      this.endPasteCapture();
      this.fallbackTimer = null;
    }, 100); // 100ms timeout to detect end of paste
  }

  private startPasteCapture(): void {
    this.detector.isInPaste = true;
    this.detector.pasteBuffer = '';
  }

  private endPasteCapture(): void {
    try {
      const content = this.detector.processPasteData(this.detector.pasteBuffer);

      if (content.split('\n').length >= this.detector.threshold) {
        const id = this.attachments.addAttachment(content);
        const placeholder = this.attachments.getPlaceholder(id);

        // Display placeholder in readline
        this.readline.write(placeholder);
        this.readline.write(
          `\n${chalk.gray(`📎 Pasted content saved as attachment #${id}`)}\n`,
        );
        this.readline.prompt();
      } else {
        // Small paste - insert directly
        this.readline.write(content);
      }
    } catch (error) {
      this.readline.write(
        `\n${chalk.red(`Error processing paste: ${error.message}`)}\n`,
      );
      this.readline.prompt();
    }

    // Reset detector state
    this.detector.reset();
  }

  public cleanup(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    this.detector.cleanup();
  }

  // Command handlers
  public handleExpandCommand(input: string): void {
    const match = input.match(/^\/expand #?(\d+)$/);
    if (!match) {
      this.readline.write(`${chalk.red('Usage: /expand #N')}\n`);
      return;
    }

    const id = parseInt(match[1]);
    const attachment = this.attachments.getAttachment(id);
    if (!attachment) {
      this.readline.write(`${chalk.red(`Attachment #${id} not found`)}\n`);
      return;
    }

    this.readline.write(attachment.content);
  }

  public handleRemoveCommand(input: string): void {
    const match = input.match(/^\/remove #?(\d+)$/);
    if (!match) {
      this.readline.write(`${chalk.red('Usage: /remove #N')}\n`);
      return;
    }

    const id = parseInt(match[1]);
    if (this.attachments.removeAttachment(id)) {
      this.readline.write(`${chalk.green(`Attachment #${id} removed`)}\n`);
    } else {
      this.readline.write(`${chalk.red(`Attachment #${id} not found`)}\n`);
    }
  }

  public handleListCommand(): void {
    const list = this.attachments.listAttachments();
    if (list.length === 0) {
      this.readline.write(`${chalk.gray('No paste attachments')}\n`);
      return;
    }

    this.readline.write(`${chalk.cyan('Paste Attachments:')}\n`);
    for (const attachment of list) {
      const placeholder = this.attachments.getPlaceholder(attachment.id);
      this.readline.write(`  ${placeholder}\n`);
    }
  }

  public async handleSaveCommand(input: string): Promise<void> {
    const match = input.match(/^\/save #?(\d+)\s+(.+)$/);
    if (!match) {
      this.readline.write(`${chalk.red('Usage: /save #N filename')}\n`);
      return;
    }

    const id = parseInt(match[1]);
    const filename = match[2];
    const attachment = this.attachments.getAttachment(id);

    if (!attachment) {
      this.readline.write(`${chalk.red(`Attachment #${id} not found`)}\n`);
      return;
    }

    try {
      const fs = await import('fs/promises');
      await fs.writeFile(filename, attachment.content, 'utf8');
      this.readline.write(
        `${chalk.green(`Attachment #${id} saved to ${filename}`)}\n`,
      );
    } catch (error) {
      this.readline.write(
        `${chalk.red(`Error saving file: ${error.message}`)}\n`,
      );
    }
  }

  public handleClearPastesCommand(): void {
    const count = this.attachments.listAttachments().length;
    this.attachments.clear();
    this.readline.write(
      `${chalk.green(`Cleared ${count} paste attachments`)}\n`,
    );
  }
}

export default PasteManager;
