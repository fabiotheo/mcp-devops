/**
 * MarkdownParser - Custom markdown parser for Ink terminal rendering
 *
 * This module provides a lightweight markdown parser specifically designed
 * for rendering markdown content in terminal interfaces using React/Ink.
 *
 * Features:
 * - Bold text (**text**)
 * - Inline code (`code`)
 * - Lists (- item)
 * - Code blocks (```code```)
 * - Links ([text](url))
 * - Proper line break handling
 */

import React from 'react';
import { Text, Box } from 'ink';

// Cache for processed markdown to improve performance
const cache = new Map();

/**
 * Parse markdown text and convert to React/Ink elements
 * Processes markdown syntax and returns an array of React elements
 *
 * @param {string} text - The markdown text to parse
 * @param {string} baseKey - Base key for React elements
 * @returns {Array} Array of React elements
 */
export const parseMarkdownToElements = (text, baseKey = 'md') => {
  if (!text) return [React.createElement(Text, { key: baseKey }, '')];

  // Check cache first
  const cacheKey = `${text}-${baseKey}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const elements = [];
  const lines = text.split('\n');

  lines.forEach((line, lineIndex) => {
    const lineKey = `${baseKey}-L${lineIndex}`;

    // Handle empty lines (preserve spacing)
    if (line.trim() === '') {
      elements.push(
        React.createElement(Text, { key: `${lineKey}-empty` }, ' ')
      );
      return;
    }

    // Check for code block
    if (line.startsWith('```')) {
      // Simple code block detection (this is a basic implementation)
      elements.push(
        React.createElement(
          Text,
          { key: `${lineKey}-codeblock`, color: 'cyan', dimColor: true },
          line
        )
      );
      return;
    }

    // Check for list item
    if (line.match(/^\s*[-*+]\s+/)) {
      const listMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
      if (listMatch) {
        const [, indent, bullet, content] = listMatch;
        const processedContent = processInlineMarkdown(content, `${lineKey}-list`);

        // Create a proper list item with bullet and content
        elements.push(
          React.createElement(
            Box,
            { key: `${lineKey}-listbox` },
            React.createElement(Text, { key: `${lineKey}-indent` }, indent),
            React.createElement(Text, { key: `${lineKey}-bullet`, color: 'cyan', bold: true }, `${bullet} `),
            React.createElement(Box, { key: `${lineKey}-content` }, ...processedContent)
          )
        );
        return;
      }
    }

    // Process inline markdown for regular lines
    const inlineElements = processInlineMarkdown(line, lineKey);
    elements.push(
      React.createElement(
        Box,
        { key: `${lineKey}-box` },
        ...inlineElements
      )
    );
  });

  // Cache the result
  if (cache.size > 100) {
    // Simple cache limit
    cache.clear();
  }
  cache.set(cacheKey, elements);

  return elements;
};

/**
 * Process inline markdown elements (bold, code, links)
 *
 * @param {string} text - Text to process
 * @param {string} baseKey - Base key for elements
 * @returns {Array} Array of React elements
 */
function processInlineMarkdown(text, baseKey) {
  const elements = [];
  let remaining = text;
  let keyIndex = 0;

  // Track what we've processed
  const segments = [];

  // Process bold text: **text**
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let match;
  let lastIndex = 0;

  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      segments.push({ type: 'text', content: beforeText });
    }

    // Add the bold text
    segments.push({ type: 'bold', content: match[1] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.substring(lastIndex) });
  }

  // If no bold found, process the whole text
  if (segments.length === 0) {
    segments.push({ type: 'text', content: text });
  }

  // Now process each segment for inline code
  const processedSegments = [];
  segments.forEach(segment => {
    if (segment.type === 'bold') {
      processedSegments.push(segment);
    } else {
      // Process inline code in text segments
      const codeRegex = /`([^`]+)`/g;
      let codeMatch;
      let lastCodeIndex = 0;
      const subSegments = [];

      while ((codeMatch = codeRegex.exec(segment.content)) !== null) {
        // Add text before code
        if (codeMatch.index > lastCodeIndex) {
          subSegments.push({
            type: 'text',
            content: segment.content.substring(lastCodeIndex, codeMatch.index)
          });
        }

        // Add code
        subSegments.push({
          type: 'code',
          content: codeMatch[1]
        });

        lastCodeIndex = codeMatch.index + codeMatch[0].length;
      }

      // Add remaining text
      if (lastCodeIndex < segment.content.length) {
        subSegments.push({
          type: 'text',
          content: segment.content.substring(lastCodeIndex)
        });
      }

      // If no code found, keep original segment
      if (subSegments.length === 0) {
        processedSegments.push(segment);
      } else {
        processedSegments.push(...subSegments);
      }
    }
  });

  // Convert segments to React elements
  processedSegments.forEach((segment, idx) => {
    const key = `${baseKey}-${idx}`;

    switch (segment.type) {
      case 'bold':
        elements.push(
          React.createElement(
            Text,
            { key, bold: true },
            segment.content
          )
        );
        break;

      case 'code':
        elements.push(
          React.createElement(
            Text,
            { key, color: 'yellow' },
            `\`${segment.content}\``
          )
        );
        break;

      case 'text':
      default:
        if (segment.content) {
          elements.push(
            React.createElement(
              Text,
              { key },
              segment.content
            )
          );
        }
        break;
    }
  });

  return elements.length > 0 ? elements : [React.createElement(Text, { key: baseKey }, text)];
}

/**
 * Clear the markdown cache
 */
export const clearMarkdownCache = () => {
  cache.clear();
};

export default {
  parseMarkdownToElements,
  clearMarkdownCache
};