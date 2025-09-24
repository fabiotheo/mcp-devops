import React from 'react';
import { Text } from 'ink';
import { Spinner } from '@inkjs/ui';

const StatusIndicator = ({ status = 'idle', message = '' }) => {
  switch (status) {
    case 'processing':
      return (
        <>
          <Spinner type="dots" />
          <Text color="yellow">
            {' '}
            Processing{message ? `: ${message}` : '...'}
          </Text>
        </>
      );

    case 'success':
      return <Text color="green">✓ {message || 'Success'}</Text>;

    case 'error':
      return <Text color="red">✗ {message || 'Error'}</Text>;

    case 'warning':
      return <Text color="yellow">⚠ {message || 'Warning'}</Text>;

    case 'idle':
    default:
      return null;
  }
};

export default StatusIndicator;
