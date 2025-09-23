#!/bin/bash

# Test markdown rendering in production

echo "Testing markdown rendering in production..."

# Create a test script that simulates an AI response with markdown
cat << 'EOF' > /tmp/test-markdown-ai.js
const { marked } = require('marked');
const TerminalRenderer = require('marked-terminal');
const chalk = require('chalk');

// Configure marked with TerminalRenderer
marked.setOptions({
  renderer: new TerminalRenderer({
    strong: chalk.bold,
    em: chalk.italic,
    code: chalk.yellow,
    heading: chalk.green.bold,
    link: chalk.blue.underline,
    paragraph: true,
    reflowText: true,
    width: 80
  })
});

// Test different markdown elements
const testText = `
# Heading 1
## Heading 2

This is **bold text** and this is *italic text*.

Here's some \`inline code\` and a link: [Example](http://example.com)

\`\`\`javascript
// Code block
function test() {
  console.log("Hello World");
}
\`\`\`

- List item 1
- List item 2
  - Nested item
* Another item

1. Numbered item
2. Second numbered item

> This is a blockquote
> with multiple lines
`;

console.log("=== Original Markdown ===");
console.log(testText);
console.log("\n=== Formatted Output ===");
console.log(marked(testText));
EOF

# Run the test in production directory
cd ~/.mcp-terminal && node /tmp/test-markdown-ai.js