/**
 * Paste Detection Module
 * Handles detection of multiline paste operations using bracketed paste mode and fallback methods
 */

interface PasteDetectorOptions {
  threshold?: number;
  timingThreshold?: number;
}

class PasteDetector {
  public readonly threshold: number;
  private readonly timingThreshold: number;
  private enabled: boolean;
  public isInPaste: boolean;
  public pasteBuffer: string;
  private lastInputTime: number;
  private rapidInputCount: number;

  constructor(options: PasteDetectorOptions = {}) {
    this.threshold = options.threshold || 3; // lines to trigger detection
    this.timingThreshold = options.timingThreshold || 40; // ms
    this.enabled = false;
    this.isInPaste = false;
    this.pasteBuffer = '';
    this.lastInputTime = 0;
    this.rapidInputCount = 0;
  }

  public enableBracketedPaste(): void {
    // Enable bracketed paste mode
    process.stdout.write('\x1b[?2004h');
    this.enabled = true;
  }

  public disableBracketedPaste(): void {
    // Disable bracketed paste mode
    process.stdout.write('\x1b[?2004l');
    this.enabled = false;
  }

  public detectPasteStart(data: string): boolean {
    // Check for bracketed paste start sequence
    return data.includes('\x1b[200~');
  }

  public detectPasteEnd(data: string): boolean {
    // Check for bracketed paste end sequence
    return data.includes('\x1b[201~');
  }

  public useFallbackDetection(data: string): boolean {
    // Timing-based detection
    const now = Date.now();
    const timeDiff = now - this.lastInputTime;

    if (timeDiff < this.timingThreshold) {
      this.rapidInputCount++;
    } else {
      this.rapidInputCount = 0;
    }

    this.lastInputTime = now;

    // Newline burst detection
    const newlineCount = (data.match(/\n/g) || []).length;

    return this.rapidInputCount > 5 || newlineCount > 2;
  }

  public processPasteData(data: string): string {
    // Clean and validate pasted content
    let cleanData = data;

    // Remove bracketed paste sequences
    cleanData = cleanData.replace(/\x1b\[200~/g, '').replace(/\x1b\[201~/g, '');

    // Validate content (reject binary data)
    if (!this.isValidTextContent(cleanData)) {
      throw new Error('Invalid content detected');
    }

    return cleanData;
  }

  private isValidTextContent(data: string): boolean {
    // Check for binary content, control characters, etc.
    return !/[\x00-\x08\x0E-\x1F\x7F]/.test(data);
  }

  public reset(): void {
    this.isInPaste = false;
    this.pasteBuffer = '';
    this.rapidInputCount = 0;
  }

  public cleanup(): void {
    this.reset();
    if (this.enabled) {
      this.disableBracketedPaste();
    }
  }
}

export default PasteDetector;
