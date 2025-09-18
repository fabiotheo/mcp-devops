import React from 'react';
import { Text } from 'ink';
import { highlight } from 'cli-highlight';

const HighlightedText = ({ text, language = 'bash' }) => {
    // Skip highlighting if text is empty or very short
    if (!text || text.length < 3) {
        return <Text>{text}</Text>;
    }

    try {
        // Use cli-highlight to get highlighted text
        const highlighted = highlight(text, {
            language,
            ignoreIllegals: true,
            theme: {
                keyword: 'cyan',
                built_in: 'magenta',
                string: 'green',
                comment: 'gray',
                number: 'yellow',
                literal: 'blue',
                variable: 'white',
                function: 'magenta'
            }
        });

        // cli-highlight returns ANSI escape codes that Ink can render
        return <Text>{highlighted}</Text>;
    } catch (error) {
        // Fallback to plain text if highlighting fails
        return <Text>{text}</Text>;
    }
};

export default HighlightedText;