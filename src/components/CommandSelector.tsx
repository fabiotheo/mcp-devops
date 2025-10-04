/**
 * Command Selector Component
 *
 * Displays a selectable list of slash commands with descriptions
 * Activated when user types "/" in the input
 */

import React, { FC } from 'react';
import { Box, Text, useInput } from 'ink';
import { Select } from '@inkjs/ui';
import { SLASH_COMMANDS, type SlashCommand } from '../constants/slashCommands.js';

interface CommandSelectorProps {
  onSelect: (commandValue: string) => void;
  onCancel: () => void;
}

const CommandSelector: FC<CommandSelectorProps> = ({ onSelect, onCancel }) => {
  // Handle ESC key to cancel command selection
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  // Format options for Select component
  const options = SLASH_COMMANDS.map((cmd: SlashCommand) => ({
    label: `${cmd.label.padEnd(12)} ${cmd.description}`,
    value: cmd.value
  }));

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          Commands:
        </Text>
      </Box>

      <Select
        options={options}
        onChange={(value) => onSelect(value as string)}
      />

      <Box marginTop={1}>
        <Text dimColor italic>
          Use arrows to navigate, Enter to select, ESC to cancel
        </Text>
      </Box>
    </Box>
  );
};

export default CommandSelector;
