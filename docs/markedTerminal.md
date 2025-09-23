# Marked-Terminal Integration Plan for MCP Terminal Assistant

## Overview
Integration of marked-terminal library to convert markdown in AI responses to properly formatted terminal output with ANSI colors.

## Problem Statement
AI responses contain markdown syntax (`**bold**`, `*italic*`, `` `code` ``) that displays literally in the terminal, creating visual pollution with asterisks and backticks.

## Solution Architecture

### Core Insight
Ink components can render ANSI escape codes directly. We don't need to convert ANSI back to React components - we can pass ANSI-formatted strings straight to Ink's Text component.

### Technical Approach
```
Markdown (AI Response) → marked → marked-terminal → ANSI String → Ink Text Component
```

## Implementation Plan

### Phase 1: Installation and Setup

#### Dependencies
```bash
npm install marked marked-terminal chalk
```

#### Required Imports
```javascript
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import chalk from 'chalk';
```

### Phase 2: Configuration

#### Basic Configuration
```javascript
// After imports in mcp-ink-cli.mjs
marked.setOptions({
  renderer: new TerminalRenderer({
    // Text formatting
    strong: chalk.bold,
    em: chalk.italic,
    del: chalk.strikethrough,

    // Code formatting
    code: chalk.yellow,
    blockquote: chalk.gray.italic,

    // Headings
    heading: chalk.green.bold,
    firstHeading: chalk.green.underline.bold,

    // Links
    link: chalk.blue.underline,
    href: chalk.blue.underline,

    // Layout options
    paragraph: true,
    reflowText: true,
    width: 80,
    showSectionPrefix: false,
    unescape: true
  })
});
```

#### Advanced Configuration (Optional)
```javascript
const terminalRenderer = new TerminalRenderer({
  // Custom list formatting
  list: (body, ordered) => {
    const lines = body.split('\n');
    return lines.map((line, i) => {
      const prefix = ordered ? `${i + 1}. ` : '• ';
      return chalk.cyan(prefix) + line;
    }).join('\n');
  },

  // Table formatting
  tableOptions: {
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    style: { 'padding-left': 0, 'padding-right': 1 }
  }
});
```

### Phase 3: Integration Points

#### Modify formatResponse Function
Location: `mcp-ink-cli.mjs` line ~817

```javascript
const formatResponse = (text) => {
  if (!text) return '';

  try {
    // Process markdown to ANSI
    const formatted = marked(text);

    // Clean up excessive line breaks
    return formatted
      .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
      .trim();
  } catch (error) {
    // Fallback to original text if parsing fails
    console.error('Markdown parsing error:', error);
    return text;
  }
};
```

### Phase 4: Testing Strategy

#### Test Cases

1. **Simple Text**
   - Input: `"Hello world"`
   - Expected: Plain text, no changes

2. **Bold Text**
   - Input: `"This is **important**"`
   - Expected: "important" in bold

3. **Italic Text**
   - Input: `"This is *emphasized*"`
   - Expected: "emphasized" in italic

4. **Inline Code**
   - Input: `"Run \`npm install\` to start"`
   - Expected: "npm install" in yellow

5. **Lists**
   - Input:
     ```
     "Tasks:
     - Item 1
     - Item 2
     * Item 3"
     ```
   - Expected: Bullet points with proper formatting

6. **Code Block**
   - Input:
     ```
     "```javascript
     const x = 10;
     console.log(x);
     ```"
     ```
   - Expected: Formatted code block

7. **Complex Combination**
   - Input: `"**Important**: Run \`command\` for:\n- Result 1\n- Result 2"`
   - Expected: Mixed formatting preserved

## Edge Cases and Solutions

### 1. Multi-line Code Blocks
**Problem**: May break terminal layout
**Solution**: Limit width to 80 chars, consider horizontal scroll

### 2. Emojis in Markdown
**Problem**: May not render correctly
**Solution**: Pass through unchanged, terminal will handle

### 3. Links
**Problem**: Terminal doesn't support clickable links
**Solution**: Display as `[text](url)` or just the text

### 4. Performance with Large Texts
**Problem**: Parsing overhead
**Solution**: Consider caching parsed results

### 5. Conflicting Colors
**Problem**: User messages (cyan) vs AI responses (white)
**Solution**: Apply marked only to AI responses

## Rollback Strategy

### Before Implementation
```bash
cp src/mcp-ink-cli.mjs src/mcp-ink-cli.mjs.backup-$(date +%Y%m%d-%H%M%S)
```

### If Issues Arise
```bash
cp src/mcp-ink-cli.mjs.backup-* src/mcp-ink-cli.mjs
```

## Success Metrics

- [ ] No more visible markdown syntax (**, *, `)
- [ ] Bold text appears in bold
- [ ] Italic text appears in italic
- [ ] Code appears highlighted (yellow)
- [ ] Lists show proper bullets
- [ ] No performance degradation
- [ ] No layout breaks
- [ ] Graceful fallback on parse errors

## Implementation Checklist

### Pre-Implementation
- [ ] Create backup of current mcp-ink-cli.mjs
- [ ] Review current formatResponse function
- [ ] Understand current render flow

### Implementation
- [ ] Install dependencies
- [ ] Add imports
- [ ] Configure marked with TerminalRenderer
- [ ] Modify formatResponse function
- [ ] Add error handling

### Testing
- [ ] Test simple text
- [ ] Test bold formatting
- [ ] Test italic formatting
- [ ] Test inline code
- [ ] Test code blocks
- [ ] Test lists
- [ ] Test complex combinations
- [ ] Test error scenarios

### Post-Implementation
- [ ] Document changes
- [ ] Update CLAUDE.md if needed
- [ ] Commit changes
- [ ] Monitor for issues

## Alternative Approaches (Not Chosen)

### 1. Strip Markdown Only
```javascript
const stripMarkdown = (text) => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1');
};
```
**Reason not chosen**: Loses visual emphasis

### 2. Custom Parser to Ink Components
**Reason not chosen**: Too complex, ANSI strings work directly

### 3. External CLI Tools
**Reason not chosen**: Additional dependencies, slower

## Notes

- The Ink framework supports ANSI codes natively in Text components
- marked-terminal is battle-tested and widely used
- This approach maintains compatibility with existing code
- Performance impact should be minimal for typical response sizes

## References

- [marked-terminal GitHub](https://github.com/mikaelbr/marked-terminal)
- [marked Documentation](https://marked.js.org/)
- [Chalk Documentation](https://github.com/chalk/chalk)
- [ANSI Escape Codes](https://en.wikipedia.org/wiki/ANSI_escape_code)

---

*Document created: 2025-09-22*
*Status: Ready for Implementation*