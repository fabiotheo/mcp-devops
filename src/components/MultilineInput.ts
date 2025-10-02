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
}

const MultilineInput = ({
  value = '',
  onChange,
  placeholder = 'Type your question...',
  showCursor = true,
  isActive = true,
  prompt = '❯',
}: MultilineInputProps): ReactElement => {
  // Split value into lines for rendering
  const lines = value.split('\n');
  const hasMultipleLines = lines.length > 1;

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
    return React.createElement(
      Box,
      null,
      React.createElement(Text, { color: 'green', bold: true }, prompt + ' '),
      React.createElement(Text, { color: 'white' }, value),
      showCursor &&
        isActive &&
        React.createElement(Text, { color: 'gray' }, '█'),
    );
  }

  // Multi-line rendering - show all lines
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    ...lines.map((line: string, index: number) =>
      React.createElement(
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
              React.createElement(Text, { key: 'line', color: 'white' }, line),
            ]
          : // Subsequent lines with indentation
            [
              React.createElement(Text, { key: 'indent' }, '  '),
              React.createElement(Text, { key: 'line', color: 'white' }, line),
            ],
        // Show cursor only on the last line
        index === lines.length - 1 &&
          showCursor &&
          isActive &&
          React.createElement(Text, { key: 'cursor', color: 'gray' }, '█'),
      ),
    ),
  );
};

export default MultilineInput;
