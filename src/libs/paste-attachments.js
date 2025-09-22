/**
 * Paste Attachments Manager
 * Manages storage and retrieval of pasted content blocks
 */

class PasteAttachments {
    constructor() {
        this.attachments = new Map();
        this.counter = 0;
        this.maxAttachments = 50;
        this.maxSize = 1024 * 1024; // 1MB per attachment
        this.maxTotalSize = 50 * 1024 * 1024; // 50MB total limit
    }

    addAttachment(content, metadata = {}) {
        if (content.length > this.maxSize) {
            throw new Error('Attachment too large');
        }

        this.counter++;
        const id = this.counter;

        const attachment = {
            id,
            content,
            lines: content.split('\n').length,
            size: Buffer.byteLength(content, 'utf8'),
            timestamp: Date.now(),
            metadata
        };

        this.attachments.set(id, attachment);
        this.cleanup();

        return id;
    }

    getAttachment(id) {
        return this.attachments.get(id);
    }

    removeAttachment(id) {
        return this.attachments.delete(id);
    }

    listAttachments() {
        return Array.from(this.attachments.values());
    }

    getPlaceholder(id) {
        const attachment = this.attachments.get(id);
        if (!attachment) return null;

        const lines = attachment.lines;
        const size = this.formatSize(attachment.size);
        return `[Pasted text #${id} +${lines} lines, ${size}]`;
    }

    cleanup() {
        let totalSize = 0;
        const attachments = this.listAttachments();
        for (const attachment of attachments) {
            totalSize += attachment.size;
        }

        // Evict oldest attachments if count or total size exceeds limits
        while (this.attachments.size > this.maxAttachments || totalSize > this.maxTotalSize) {
            if (this.attachments.size === 0) break; // Safety check

            const oldestId = Math.min(...this.attachments.keys());
            const oldestAttachment = this.getAttachment(oldestId);
            if (!oldestAttachment) break;

            totalSize -= oldestAttachment.size;
            this.removeAttachment(oldestId);
        }
    }

    formatSize(bytes) {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
        return `${Math.round(bytes / (1024 * 1024))}MB`;
    }

    clear() {
        this.attachments.clear();
    }

    getTotalSize() {
        let total = 0;
        for (const attachment of this.attachments.values()) {
            total += attachment.size;
        }
        return total;
    }

    getStats() {
        return {
            count: this.attachments.size,
            totalSize: this.getTotalSize(),
            maxAttachments: this.maxAttachments,
            maxTotalSize: this.maxTotalSize
        };
    }
}

export default PasteAttachments;