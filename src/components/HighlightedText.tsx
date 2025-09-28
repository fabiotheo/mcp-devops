import React, { FC } from 'react';
import { Text } from 'ink';
import { highlight, Theme } from 'cli-highlight';
import chalk from 'chalk';

interface HighlightedTextProps {
  text: string;
  language?: string;
}

const HighlightedText: FC<HighlightedTextProps> = ({ text, language = 'bash' }) => {
  // Skip highlighting if text is empty or very short
  if (!text || text.length < 3) {
    return <Text>{text}</Text>;
  }

  try {
    // Use cli-highlight to get highlighted text
    // The theme expects functions that transform strings
    const theme: Theme = {
      keyword: chalk.cyan,
      built_in: chalk.magenta,
      string: chalk.green,
      comment: chalk.gray,
      number: chalk.yellow,
      literal: chalk.blue,
      variable: chalk.white,
      function: chalk.magenta,
    };

    const highlighted = highlight(text, {
      language,
      ignoreIllegals: true,
      theme,
    });

    // cli-highlight returns ANSI escape codes that Ink can render
    return <Text>{highlighted}</Text>;
  } catch (error) {
    // Fallback to plain text if highlighting fails
    return <Text>{text}</Text>;
  }
};

export default HighlightedText;
