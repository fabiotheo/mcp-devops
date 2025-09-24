/**
 * Paste Detection Module
 * Handles detection of multiline paste operations using bracketed paste mode and fallback methods
 */

class PasteDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 3; // lines to trigger detection
    this.timingThreshold = options.timingThreshold || 40; // ms
    this.enabled = false;
    this.isInPaste = false;
    this.pasteBuffer = '';
    this.lastInputTime = 0;
    this.rapidInputCount = 0;
  }

  enableBracketedPaste() {
    // Enable bracketed paste mode
    process.stdout.write('\x1b[?2004h');
    this.enabled = true;
  }

  disableBracketedPaste() {
    // Disable bracketed paste mode
    process.stdout.write('\x1b[?2004l');
    this.enabled = false;
  }

  detectPasteStart(data) {
    // Check for bracketed paste start sequence
    return data.includes('\x1b[200~');
  }

  detectPasteEnd(data) {
    // Check for bracketed paste end sequence
    return data.includes('\x1b[201~');
  }

  useFallbackDetection(data) {
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

  processPasteData(data) {
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

  isValidTextContent(data) {
    // Check for binary content, control characters, etc.
    return !/[\x00-\x08\x0E-\x1F\x7F]/.test(data);
  }

  reset() {
    this.isInPaste = false;
    this.pasteBuffer = '';
    this.rapidInputCount = 0;
  }

  cleanup() {
    this.reset();
    if (this.enabled) {
      this.disableBracketedPaste();
    }
  }
}

export default PasteDetector;
