import React, { FC } from 'react';
import { Text } from 'ink';

interface InputHandlerProps {
  value: string;
  cursorPosition: number;
}

const InputHandler: FC<InputHandlerProps> = ({ value, cursorPosition }) => {
  // Split input into before cursor, cursor char, and after cursor
  const beforeCursor: string = value.slice(0, cursorPosition);
  const cursorChar: string = value[cursorPosition] || ' ';
  const afterCursor: string = value.slice(cursorPosition + 1);

  return (
    <>
      <Text>{beforeCursor}</Text>
      <Text inverse>{cursorChar}</Text>
      <Text>{afterCursor}</Text>
    </>
  );
};

export default InputHandler;
