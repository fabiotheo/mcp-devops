/**
 * Setup Configuration Constants
 *
 * Default values and configuration constants for the setup system.
 */

import { APIConfig } from './setup-types.js';

/**
 * Default AI model configurations
 */
export const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4',
  gemini: 'gemini-pro'
} as const;

/**
 * Default API configuration
 */
export const DEFAULT_API_CONFIG: Partial<APIConfig> = {
  ai_provider: 'claude',
  claude_model: DEFAULT_MODELS.claude,
  openai_model: DEFAULT_MODELS.openai,
  gemini_model: DEFAULT_MODELS.gemini
};

/**
 * Directory structure to create during installation
 */
export const INSTALLATION_DIRS = [
  'patterns',
  'libs',
  'ai_models',
  'web_search',
  'web_scraper',
  'src',
  'src/ai_models',
  'src/libs',
  'src/bridges',
  'src/bridges/adapters',
  'src/components',
  'src/hooks',
  'src/contexts',
  'src/utils',
  'src/services',
  'src/types',
  'src/setup'
] as const;

/**
 * Files that should have executable permissions
 */
export const EXECUTABLE_FILES = [
  'mcp-client.js',
  'mcp-assistant.js',
  'mcp-claude.js',
  'mcp-claude.ts',
  'setup.js',
  'setup.ts',
  'ipcom-chat',
  'ipcom-chat-cli',
  'src/ipcom-chat-cli.js',
  'src/ipcom-chat-cli.ts',
  'src/mcp-ink-cli.mjs',
  'src/mcp-ink-cli.tsx'
] as const;

/**
 * Shell configuration hooks
 */
export const SHELL_HOOKS = {
  zsh: {
    marker: '# MCP Terminal Assistant Integration',
    preexec: 'mcp_preexec() { MCP_LAST_COMMAND="$1"; }',
    precmd: `mcp_precmd() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]] && [[ -n "$MCP_LAST_COMMAND" ]]; then
    if [[ ! "$MCP_LAST_COMMAND" =~ ^(cd|ls|pwd|echo|man|help) ]]; then
      echo "\\n💡 Comando falhou. Use 'mcp' para obter ajuda com o erro."
      export MCP_LAST_EXIT=$exit_code
      export MCP_LAST_FAILED_COMMAND="$MCP_LAST_COMMAND"
    fi
  fi
}`,
    alias: 'alias mcp="node ~/.mcp-terminal/mcp-assistant.js"'
  },
  bash: {
    marker: '# MCP Terminal Assistant Integration',
    trap: `mcp_debug_trap() {
  MCP_LAST_COMMAND="\${BASH_COMMAND}"
}`,
    prompt: `mcp_prompt_command() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]] && [[ -n "$MCP_LAST_COMMAND" ]]; then
    if [[ ! "$MCP_LAST_COMMAND" =~ ^(cd|ls|pwd|echo|man|help) ]]; then
      echo "\\n💡 Comando falhou. Use 'mcp' para obter ajuda com o erro."
      export MCP_LAST_EXIT=$exit_code
      export MCP_LAST_FAILED_COMMAND="$MCP_LAST_COMMAND"
    fi
  fi
}`,
    alias: 'alias mcp="node ~/.mcp-terminal/mcp-assistant.js"'
  }
} as const;

/**
 * Supported platforms
 */
export const SUPPORTED_PLATFORMS = ['darwin', 'linux'] as const;

/**
 * Minimum Node.js version required
 */
export const MIN_NODE_VERSION = '16.0.0';

/**
 * Installation timeout in milliseconds
 */
export const INSTALL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Test timeout in milliseconds
 */
export const TEST_TIMEOUT = 30 * 1000; // 30 seconds

/**
 * Backup retention days
 */
export const BACKUP_RETENTION_DAYS = 30;

/**
 * Version comparison regex
 */
export const VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;

/**
 * API endpoints for checking latest version
 */
export const VERSION_CHECK_ENDPOINTS = {
  github: 'https://api.github.com/repos/fabiotheo/mcp-devops/releases/latest',
  npm: 'https://registry.npmjs.org/mcp-terminal-assistant/latest'
} as const;

/**
 * Environment variables used by the system
 */
export const ENV_VARS = {
  MCP_HOME: 'MCP_HOME',
  MCP_CONFIG: 'MCP_CONFIG',
  MCP_DEBUG: 'MCP_DEBUG',
  MCP_LAST_COMMAND: 'MCP_LAST_COMMAND',
  MCP_LAST_EXIT: 'MCP_LAST_EXIT',
  MCP_LAST_FAILED_COMMAND: 'MCP_LAST_FAILED_COMMAND',
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  GEMINI_API_KEY: 'GEMINI_API_KEY'
} as const;

/**
 * Default paths
 */
export const DEFAULT_PATHS = {
  config: '~/.mcp-terminal/config.json',
  history: '~/.mcp-terminal/history.json',
  logs: '~/.mcp-terminal/logs',
  backups: '~/.mcp-terminal/backups',
  patterns: '~/.mcp-terminal/patterns',
  cache: '~/.mcp-terminal/cache'
} as const;