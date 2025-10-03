/**
 * MultilineInput Component for Ink
 *
 * A custom component that properly handles multi-line text input
 * including paste operations, cursor positioning, and visual rendering.
 */

import * as React from 'react';
import type { ReactElement } from 'react';
import { Text, Box } from 'ink';

// Define the props interface
interface MultilineInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  showCursor?: boolean;
  isActive?: boolean;
  prompt?: string;
  cursorPosition?: number;
}

const MultilineInput = ({
  value = '',
  onChange,
  placeholder = 'Type your question...',
  showCursor = true,
  isActive = true,
  prompt = '❯',
  cursorPosition = -1,
}: MultilineInputProps): ReactElement => {
  // Split value into lines for rendering
  const lines = value.split('\n');
  const hasMultipleLines = lines.length > 1;

  // Use cursor position or default to end of text
  const actualCursorPos = cursorPosition >= 0 ? cursorPosition : value.length;

  // Render empty state with placeholder
  // IMPORTANT: Even when empty, we need to be able to receive paste events
  if (value === '' && placeholder) {
    return React.createElement(
      Box,
      null,
      React.createElement(Text, { color: 'green', bold: true }, prompt + ' '),
      React.createElement(Text, { color: 'gray' }, placeholder),
      showCursor &&
        isActive &&
        React.createElement(Text, { color: 'gray' }, '█'),
    );
  }

  // Single line rendering (simple case)
  if (!hasMultipleLines) {
    // Split text at cursor position for proper cursor placement
    const textBeforeCursor = value.slice(0, actualCursorPos);
    const textAfterCursor = value.slice(actualCursorPos);

    return React.createElement(
      Box,
      null,
      React.createElement(Text, { color: 'green', bold: true }, prompt + ' '),
      React.createElement(Text, { color: 'white' }, textBeforeCursor),
      showCursor &&
        isActive &&
        React.createElement(Text, { color: 'gray' }, '█'),
      React.createElement(Text, { color: 'white' }, textAfterCursor),
    );
  }

  // Multi-line rendering - show all lines
  // Calculate which line contains the cursor and position within that line
  let charCount = 0;
  let cursorLine = 0;
  let cursorPosInLine = actualCursorPos;

  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length + 1; // +1 for newline character
    if (charCount + lineLength > actualCursorPos) {
      cursorLine = i;
      cursorPosInLine = actualCursorPos - charCount;
      break;
    }
    charCount += lineLength;
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    ...lines.map((line: string, index: number) => {
      const isCursorLine = index === cursorLine;
      const textBeforeCursor = isCursorLine ? line.slice(0, cursorPosInLine) : line;
      const textAfterCursor = isCursorLine ? line.slice(cursorPosInLine) : '';

      return React.createElement(
        Box,
        { key: index },
        index === 0
          ? // First line with prompt
            [
              React.createElement(
                Text,
                { key: 'prompt', color: 'green', bold: true },
                prompt + ' ',
              ),
              React.createElement(Text, { key: 'before', color: 'white' }, textBeforeCursor),
              isCursorLine &&
                showCursor &&
                isActive &&
                React.createElement(Text, { key: 'cursor', color: 'gray' }, '█'),
              isCursorLine &&
                React.createElement(Text, { key: 'after', color: 'white' }, textAfterCursor),
            ]
          : // Subsequent lines with indentation
            [
              React.createElement(Text, { key: 'indent' }, '  '),
              React.createElement(Text, { key: 'before', color: 'white' }, textBeforeCursor),
              isCursorLine &&
                showCursor &&
                isActive &&
                React.createElement(Text, { key: 'cursor', color: 'gray' }, '█'),
              isCursorLine &&
                React.createElement(Text, { key: 'after', color: 'white' }, textAfterCursor),
            ],
      );
    }),
  );
};

export default MultilineInput;
