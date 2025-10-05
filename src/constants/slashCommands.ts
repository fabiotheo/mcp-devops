/**
 * Slash Commands Constants
 *
 * Defines all available slash commands for the command selector UI
 */

export interface SlashCommand {
  label: string;      // Display label (e.g., "/help")
  value: string;      // Command value without slash (e.g., "help")
  description: string; // Brief description of what the command does
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    label: '/help',
    value: 'help',
    description: 'Show available commands and help'
  },
  {
    label: '/clear',
    value: 'clear',
    description: 'Clear conversation history'
  },
  {
    label: '/history',
    value: 'history',
    description: 'Show command history'
  },
  {
    label: '/status',
    value: 'status',
    description: 'Show system status'
  },
  {
    label: '/debug',
    value: 'debug',
    description: 'Toggle debug mode'
  },
  {
    label: '/exit',
    value: 'exit',
    description: 'Exit the application'
  },
  {
    label: '/compact',
    value: 'compact',
    description: 'Compact conversation history into a summary (saves tokens)'
  }
];
