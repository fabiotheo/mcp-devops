#!/usr/bin/env node

/**
 * Test script for paste detection system
 */

import PasteDetector from './libs/paste-detector.js';
import PasteAttachments from './libs/paste-attachments.js';
import chalk from 'chalk';

console.log(chalk.cyan('🧪 Testing Paste Detection System\n'));

// Test 1: PasteDetector basic functionality
console.log(chalk.yellow('Test 1: PasteDetector initialization'));
const detector = new PasteDetector();
console.log(`✓ Threshold: ${detector.threshold} lines`);
console.log(`✓ Timing threshold: ${detector.timingThreshold}ms`);

// Test 2: Bracketed paste detection
console.log(chalk.yellow('\nTest 2: Bracketed paste sequence detection'));
const pasteStart = '\x1b[200~Hello\nWorld\nMultiline\nText';
const pasteEnd = pasteStart + '\x1b[201~';

console.log(`✓ Paste start detected: ${detector.detectPasteStart(pasteStart)}`);
console.log(`✓ Paste end detected: ${detector.detectPasteEnd(pasteEnd)}`);

// Test 3: Data processing
console.log(chalk.yellow('\nTest 3: Data processing'));
try {
    const cleanData = detector.processPasteData(pasteEnd);
    console.log(`✓ Cleaned data: "${cleanData.substring(0, 50)}${cleanData.length > 50 ? '...' : ''}"`);
    console.log(`✓ Lines: ${cleanData.split('\n').length}`);
} catch (error) {
    console.log(`✗ Error: ${error.message}`);
}

// Test 4: PasteAttachments functionality
console.log(chalk.yellow('\nTest 4: PasteAttachments management'));
const attachments = new PasteAttachments();

// Add test attachment
const testContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
const id = attachments.addAttachment(testContent, { type: 'test' });
console.log(`✓ Attachment created with ID: ${id}`);

// Test placeholder
const placeholder = attachments.getPlaceholder(id);
console.log(`✓ Placeholder: ${placeholder}`);

// Test retrieval
const retrieved = attachments.getAttachment(id);
console.log(`✓ Retrieved lines: ${retrieved.lines}`);
console.log(`✓ Retrieved size: ${attachments.formatSize(retrieved.size)}`);

// Test stats
const stats = attachments.getStats();
console.log(`✓ Stats: ${stats.count} attachments, ${attachments.formatSize(stats.totalSize)} total`);

// Test 5: Fallback detection
console.log(chalk.yellow('\nTest 5: Fallback detection'));
const rapidData = 'a';
detector.lastInputTime = Date.now() - 10; // Simulate rapid input
const isFallback = detector.useFallbackDetection(rapidData);
console.log(`✓ Fallback triggered: ${isFallback}`);

// Test 6: Large content handling
console.log(chalk.yellow('\nTest 6: Large content handling'));
const largeContent = 'Line\n'.repeat(1000); // 1000 lines
try {
    const largeId = attachments.addAttachment(largeContent);
    const largePlaceholder = attachments.getPlaceholder(largeId);
    console.log(`✓ Large attachment: ${largePlaceholder}`);
} catch (error) {
    console.log(`✗ Large content error: ${error.message}`);
}

// Test 7: Invalid content rejection
console.log(chalk.yellow('\nTest 7: Invalid content rejection'));
try {
    const invalidContent = 'Hello\x00World'; // Binary content
    detector.processPasteData(invalidContent);
    console.log('✗ Should have rejected binary content');
} catch (error) {
    console.log(`✓ Correctly rejected invalid content: ${error.message}`);
}

// Test 8: Cleanup
console.log(chalk.yellow('\nTest 8: Cleanup'));
attachments.clear();
console.log(`✓ Cleared attachments: ${attachments.getStats().count} remaining`);

detector.cleanup();
console.log('✓ Detector cleanup completed');

console.log(chalk.green('\n🎉 All tests completed!'));
console.log(chalk.gray('\nTo test interactively, run: node mcp-interactive.js'));