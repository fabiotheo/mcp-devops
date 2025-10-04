/**
 * Command Selector Component
 *
 * Displays a selectable list of slash commands with descriptions
 * Activated when user types "/" in the input
 * Supports dynamic filtering as user types
 */

import React, { FC, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { Select } from '@inkjs/ui';
import { SLASH_COMMANDS, type SlashCommand } from '../constants/slashCommands.js';

interface CommandSelectorProps {
  onSelect: (commandValue: string) => void;
  onCancel: () => void;
  filterText?: string;
}

const CommandSelector: FC<CommandSelectorProps> = ({ onSelect, onCancel, filterText = '' }) => {
  // Handle ESC key to cancel command selection
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  // Filter commands based on filterText
  // First by command name (label), then by description
  const filteredCommands = useMemo(() => {
    if (!filterText) {
      return SLASH_COMMANDS;
    }

    const searchText = filterText.toLowerCase();

    // First priority: commands that match by name
    const matchByName = SLASH_COMMANDS.filter(cmd =>
      cmd.value.toLowerCase().includes(searchText)
    );

    // Second priority: commands that match by description
    const matchByDescription = SLASH_COMMANDS.filter(cmd =>
      !cmd.value.toLowerCase().includes(searchText) &&
      cmd.description.toLowerCase().includes(searchText)
    );

    return [...matchByName, ...matchByDescription];
  }, [filterText]);

  // Format options for Select component
  const options = filteredCommands.map((cmd: SlashCommand) => ({
    label: `${cmd.label.padEnd(12)} ${cmd.description}`,
    value: cmd.value
  }));

  // Show "no results" if filter returns empty
  if (options.length === 0) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>
            Commands:
          </Text>
        </Box>
        <Text dimColor>No commands found matching "{filterText}"</Text>
        <Box marginTop={1}>
          <Text dimColor italic>
            Press ESC to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          {filterText ? `Commands matching "${filterText}":` : 'Commands:'}
        </Text>
      </Box>

      <Select
        options={options}
        onChange={(value) => onSelect(value as string)}
      />

      <Box marginTop={1}>
        <Text dimColor italic>
          Type to filter • Use arrows to navigate • Enter to select • ESC to cancel
        </Text>
      </Box>
    </Box>
  );
};

export default CommandSelector;
