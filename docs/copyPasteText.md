# Multiline Paste Detection Implementation Plan

## Overview
This document outlines the implementation plan for adding multiline paste detection to the IPCOM chat system, similar to Claude Code CLI functionality. The system will automatically detect when users paste large blocks of text and provide a compact interface for managing these attachments.

## Requirements Analysis

### Core Functionality
- **Automatic Detection**: Detect paste operations without requiring special commands
- **Compact Placeholders**: Display large pastes as `[Pasted text +N lines]`
- **Attachment Management**: Store pasted blocks as numbered attachments (#1, #2, etc.)
- **Command Interface**: Provide commands to expand, remove, list, and save pasted content
- **Terminal Compatibility**: Work across different Linux terminals and SSH sessions

### Technical Requirements
- **Bracketed Paste Mode**: Primary detection using ANSI sequences `\x1b[200~` and `\x1b[201~`
- **Fallback Detection**: Timing-based detection (<40ms between chunks) and newline burst detection
- **Raw Mode Input**: Direct stdin interception for paste detection
- **Memory Management**: Efficient storage and cleanup of large text blocks
- **Non-disruptive**: No interference with existing command processing

## Architecture Design

### Modular Approach
The implementation uses a modular architecture with three main components:

1. **PasteDetector** (`libs/paste-detector.js`): Core detection logic
2. **PasteAttachments** (`libs/paste-attachments.js`): Attachment storage and management
3. **PasteManager** (`libs/paste-manager.js`): High-level orchestration

### Integration Points
- **mcp-interactive.js**: Main integration point for setup and input handling
- **Command Processor**: Extended to handle new paste-related commands
- **Session Persistence**: Enhanced to save/load paste attachments
- **Display System**: Modified to show paste placeholders

## Implementation Details

### 1. PasteDetector Class (`libs/paste-detector.js`)

```javascript
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
    }

    disableBracketedPaste() {
        // Disable bracketed paste mode
        process.stdout.write('\x1b[?2004l');
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
}
```

### 2. PasteAttachments Class (`libs/paste-attachments.js`)

```javascript
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
}
```

### 3. PasteManager Class (`libs/paste-manager.js`)

```javascript
class PasteManager {
    constructor(readline, attachments) {
        this.readline = readline;
        this.attachments = attachments;
        this.detector = new PasteDetector();
        this.setupDetection();
    }

    setupDetection() {
        // Enable bracketed paste mode
        this.detector.enableBracketedPaste();

        // Use readline's keypress events instead of raw mode
        if (this.readline.input.isTTY) {
            this.readline.input.setRawMode(true);
            this.readline.input.on('keypress', this.handleKeypress.bind(this));
        }
    }

    handleKeypress(str, key) {
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

        // Check fallback detection
        if (this.detector.useFallbackDetection(str)) {
            this.startFallbackCapture(str);
            return;
        }

        // Let readline handle normal input
        return true;
    }

    startFallbackCapture(initialData) {
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

    startPasteCapture() {
        this.detector.isInPaste = true;
        this.detector.pasteBuffer = '';
    }

    endPasteCapture() {
        const content = this.detector.processPasteData(this.detector.pasteBuffer);

        if (content.split('\n').length >= this.detector.threshold) {
            const id = this.attachments.addAttachment(content);
            const placeholder = this.attachments.getPlaceholder(id);

            // Display placeholder in readline
            this.readline.write(placeholder);
            this.readline.write(`\n${chalk.gray(`📎 Pasted content saved as attachment #${id}`)}\n`);
        } else {
            // Small paste - insert directly
            this.readline.write(content);
        }

        this.detector.isInPaste = false;
        this.detector.pasteBuffer = '';
    }
}
```

### 4. Integration with mcp-interactive.js

```javascript
import PasteManager from './libs/paste-manager.js';
import PasteAttachments from './libs/paste-attachments.js';
import chalk from 'chalk';

// In main initialization
const pasteAttachments = new PasteAttachments();
const pasteManager = new PasteManager(rl, pasteAttachments);

// Modified input handler
rl.on('line', async (input) => {
    // Check for paste commands first
    if (input.startsWith('/expand ')) {
        handleExpandCommand(input, pasteAttachments);
        return;
    }

    if (input.startsWith('/remove ')) {
        handleRemoveCommand(input, pasteAttachments);
        return;
    }

    if (input === '/list') {
        handleListCommand(pasteAttachments);
        return;
    }

    if (input.startsWith('/save ')) {
        handleSaveCommand(input, pasteAttachments);
        return;
    }

    if (input === '/clear-pastes') {
        handleClearPastesCommand(pasteAttachments);
        return;
    }

    // Existing command processing...
});

// Command handlers implementation
function handleExpandCommand(input, attachments) {
    const match = input.match(/^\/expand #?(\d+)$/);
    if (!match) {
        console.log(chalk.red('Usage: /expand #N'));
        return;
    }

    const id = parseInt(match[1]);
    const attachment = attachments.getAttachment(id);
    if (!attachment) {
        console.log(chalk.red(`Attachment #${id} not found`));
        return;
    }

    rl.write(attachment.content);
}

function handleRemoveCommand(input, attachments) {
    const match = input.match(/^\/remove #?(\d+)$/);
    if (!match) {
        console.log(chalk.red('Usage: /remove #N'));
        return;
    }

    const id = parseInt(match[1]);
    if (attachments.removeAttachment(id)) {
        console.log(chalk.green(`Attachment #${id} removed`));
    } else {
        console.log(chalk.red(`Attachment #${id} not found`));
    }
}

function handleListCommand(attachments) {
    const list = attachments.listAttachments();
    if (list.length === 0) {
        console.log(chalk.gray('No paste attachments'));
        return;
    }

    console.log(chalk.cyan('Paste Attachments:'));
    for (const attachment of list) {
        const placeholder = attachments.getPlaceholder(attachment.id);
        console.log(`  ${placeholder}`);
    }
}

function handleSaveCommand(input, attachments) {
    const match = input.match(/^\/save #?(\d+)\s+(.+)$/);
    if (!match) {
        console.log(chalk.red('Usage: /save #N filename'));
        return;
    }

    const id = parseInt(match[1]);
    const filename = match[2];
    const attachment = attachments.getAttachment(id);

    if (!attachment) {
        console.log(chalk.red(`Attachment #${id} not found`));
        return;
    }

    try {
        import('fs/promises').then(fs => {
            fs.writeFile(filename, attachment.content, 'utf8');
            console.log(chalk.green(`Attachment #${id} saved to ${filename}`));
        });
    } catch (error) {
        console.log(chalk.red(`Error saving file: ${error.message}`));
    }
}

function handleClearPastesCommand(attachments) {
    const count = attachments.listAttachments().length;
    attachments.attachments.clear();
    console.log(chalk.green(`Cleared ${count} paste attachments`));
}
```

### 5. Command Processor Updates

New commands implemented above:

- `/expand #N` - Expand attachment N into the input
- `/remove #N` - Remove attachment N
- `/list` - List all current attachments
- `/save #N filename` - Save attachment N to file
- `/clear-pastes` - Remove all attachments

## Critical Issues Addressed

### 1. **Raw Mode Conflict** (FIXED)
- **Problem**: Direct use of `process.stdin.setRawMode(true)` conflicts with readline
- **Solution**: Use readline's keypress events instead of hijacking stdin

### 2. **Missing Method Implementation** (FIXED)
- **Problem**: `startFallbackCapture()` was called but not implemented
- **Solution**: Complete implementation with timeout-based capture

### 3. **Undefined Variables** (FIXED)
- **Problem**: `processPasteData()` returned undefined `cleanData`
- **Solution**: Proper implementation with ANSI sequence cleaning

### 4. **Memory Management** (FIXED)
- **Problem**: Cleanup only checked count, not total memory usage
- **Solution**: Added `maxTotalSize` limit and comprehensive cleanup

### 5. **Missing Command Handlers** (FIXED)
- **Problem**: Referenced but not implemented command handlers
- **Solution**: Complete implementation of all paste commands

### 6. **Console.log Conflicts** (FIXED)
- **Problem**: Direct console.log interferes with readline prompt
- **Solution**: Use readline.write() for proper terminal output

## Testing and Validation

### Unit Testing Strategy
- Test PasteDetector with mock stdin events
- Verify bracketed paste sequence detection
- Test fallback heuristics (timing and newline detection)
- Validate attachment storage and retrieval

### Terminal Compatibility Testing
- **Linux terminals**: gnome-terminal, konsole, xterm, alacritty
- **SSH sessions**: Test through various SSH clients
- **Screen/tmux**: Verify paste detection in multiplexers
- **Fallback scenarios**: Terminals without bracketed paste support

### Edge Cases to Test
- Very large pastes (>1000 lines)
- Pastes with special characters and ANSI codes
- Rapid consecutive pastes
- Mixed input (typing + pasting)
- Unicode and emoji content
- Binary data rejection

### Performance Validation
- Memory usage with multiple large attachments
- Input latency during paste processing
- Cleanup of old attachments
- Concurrent paste handling

### User Experience Testing
- Placeholder display formatting
- Command responsiveness (/expand, /remove, etc.)
- Visual feedback during paste detection
- Error messages for edge cases

### Integration Testing
- Verify no disruption to existing commands
- Test with active MCP connections
- Validate session persistence with attachments
- History navigation with paste blocks

## Implementation Phases

### Phase 1: Core Detection
1. Create PasteDetector class with bracketed paste support
2. Implement basic paste capture and processing
3. Add placeholder display mechanism
4. Test with simple paste scenarios

### Phase 2: Attachment System
1. Create PasteAttachments class for storage
2. Implement attachment management commands
3. Add visual feedback and status displays
4. Test with multiple attachments

### Phase 3: Fallback Detection
1. Add timing-based detection for non-bracketed terminals
2. Implement newline burst detection
3. Test compatibility across different terminals
4. Optimize detection thresholds

### Phase 4: Integration and Polish
1. Full integration with mcp-interactive.js
2. Session persistence for attachments
3. Performance optimization
4. Comprehensive testing and bug fixes

## Security Considerations

- **Input Validation**: Sanitize all pasted content
- **Size Limits**: Prevent memory exhaustion from large pastes
- **Content Filtering**: Reject binary data and suspicious content
- **Rate Limiting**: Prevent paste flooding attacks
- **Memory Cleanup**: Automatic cleanup of old attachments

## Future Enhancements

- **Syntax Highlighting**: Detect and highlight code blocks in attachments
- **Export Formats**: Support for exporting attachments as files
- **Compression**: Compress large attachments to save memory
- **Sharing**: Share attachments between sessions
- **Search**: Search within attachment content
- **Auto-categorization**: Automatically categorize pastes (code, text, data)

This implementation provides a robust foundation for multiline paste detection while maintaining compatibility with the existing IPCOM chat system.