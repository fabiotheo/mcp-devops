/**
 * Paste Attachments Manager
 * Manages storage and retrieval of pasted content blocks
 */

interface AttachmentMetadata {
  [key: string]: unknown;
}

interface Attachment {
  id: number;
  content: string;
  lines: number;
  size: number;
  timestamp: number;
  metadata: AttachmentMetadata;
}

interface AttachmentStats {
  count: number;
  totalSize: number;
  maxAttachments: number;
  maxTotalSize: number;
}

class PasteAttachments {
  private attachments: Map<number, Attachment>;
  private counter: number;
  private readonly maxAttachments: number;
  private readonly maxSize: number;
  private readonly maxTotalSize: number;

  constructor() {
    this.attachments = new Map();
    this.counter = 0;
    this.maxAttachments = 50;
    this.maxSize = 1024 * 1024; // 1MB per attachment
    this.maxTotalSize = 50 * 1024 * 1024; // 50MB total limit
  }

  public addAttachment(content: string, metadata: AttachmentMetadata = {}): number {
    if (content.length > this.maxSize) {
      throw new Error('Attachment too large');
    }

    this.counter++;
    const id = this.counter;

    const attachment: Attachment = {
      id,
      content,
      lines: content.split('\n').length,
      size: Buffer.byteLength(content, 'utf8'),
      timestamp: Date.now(),
      metadata,
    };

    this.attachments.set(id, attachment);
    this.cleanup();

    return id;
  }

  public getAttachment(id: number): Attachment | undefined {
    return this.attachments.get(id);
  }

  public removeAttachment(id: number): boolean {
    return this.attachments.delete(id);
  }

  public listAttachments(): Attachment[] {
    return Array.from(this.attachments.values());
  }

  public getPlaceholder(id: number): string | null {
    const attachment = this.attachments.get(id);
    if (!attachment) return null;

    const lines = attachment.lines;
    const size = this.formatSize(attachment.size);
    return `[Pasted text #${id} +${lines} lines, ${size}]`;
  }

  private cleanup(): void {
    let totalSize = 0;
    const attachments = this.listAttachments();
    for (const attachment of attachments) {
      totalSize += attachment.size;
    }

    // Evict oldest attachments if count or total size exceeds limits
    while (
      this.attachments.size > this.maxAttachments ||
      totalSize > this.maxTotalSize
    ) {
      if (this.attachments.size === 0) break; // Safety check

      const oldestId = Math.min(...this.attachments.keys());
      const oldestAttachment = this.getAttachment(oldestId);
      if (!oldestAttachment) break;

      totalSize -= oldestAttachment.size;
      this.removeAttachment(oldestId);
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  }

  public clear(): void {
    this.attachments.clear();
  }

  public getTotalSize(): number {
    let total = 0;
    for (const attachment of this.attachments.values()) {
      total += attachment.size;
    }
    return total;
  }

  public getStats(): AttachmentStats {
    return {
      count: this.attachments.size,
      totalSize: this.getTotalSize(),
      maxAttachments: this.maxAttachments,
      maxTotalSize: this.maxTotalSize,
    };
  }
}

export default PasteAttachments;
