import React from 'react';
import { Text } from 'ink';

const InputHandler = ({ value, cursorPosition }) => {
  // Split input into before cursor, cursor char, and after cursor
  const beforeCursor = value.slice(0, cursorPosition);
  const cursorChar = value[cursorPosition] || ' ';
  const afterCursor = value.slice(cursorPosition + 1);

  return (
    <>
      <Text>{beforeCursor}</Text>
      <Text inverse>{cursorChar}</Text>
      <Text>{afterCursor}</Text>
    </>
  );
};

export default InputHandler;
