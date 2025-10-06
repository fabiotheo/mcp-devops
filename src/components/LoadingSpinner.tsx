/**
 * Loading Spinner Component
 *
 * Animated loading indicator with spinner and message
 * Used for long-running operations like /compact
 */

import React, { FC, useState, useEffect } from 'react';
import { Box, Text } from 'ink';

interface LoadingSpinnerProps {
  message?: string;
  showElapsedTime?: boolean;
}

const LoadingSpinner: FC<LoadingSpinnerProps> = ({
  message = 'Processing...',
  showElapsedTime = true
}) => {
  const [frame, setFrame] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  useEffect(() => {
    // Animate spinner
    const spinnerInterval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, 80);

    // Track elapsed time
    const timeInterval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(spinnerInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box>
        <Text color="cyan" bold>
          {frames[frame]} {message}
        </Text>
        {showElapsedTime && elapsedSeconds > 0 && (
          <Text dimColor> ({formatTime(elapsedSeconds)})</Text>
        )}
      </Box>

      {elapsedSeconds > 10 && (
        <Box marginTop={1}>
          <Text dimColor italic>
            This may take a while for large histories...
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default LoadingSpinner;
