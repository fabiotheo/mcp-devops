/**
 * Setup Files Configuration
 *
 * Complete list of files to copy during installation.
 * This replaces the inline array from setup.js with a properly typed configuration.
 */

import { FileMapping } from './setup-types.js';

/**
 * Main files to copy during installation
 * Order matters for some files (dependencies should come first)
 */
export const filesToCopy: FileMapping[] = [
  // ===========================================
  // Core MCP Files
  // ===========================================
  // Main CLI files
  { src: 'mcp-claude.ts', dest: 'mcp-claude.ts' },
  { src: 'mcp-client.js', dest: 'mcp-client.js' },
  { src: 'mcp-assistant.js', dest: 'mcp-assistant.js' },

  // Ink CLI Interface
  { src: 'src/mcp-ink-cli.mjs', dest: 'src/mcp-ink-cli.mjs' },
  { src: 'src/mcp-ink-cli.tsx', dest: 'src/mcp-ink-cli.tsx' },
  { src: 'src/mcp-ink-cli-with-context.tsx', dest: 'src/mcp-ink-cli-with-context.tsx' },

  // IPCOM Chat CLI
  { src: 'src/ipcom-chat-cli.ts', dest: 'src/ipcom-chat-cli.ts' },
  { src: 'ipcom-chat', dest: 'ipcom-chat' },

  // ===========================================
  // AI Orchestrators
  // ===========================================
  { src: 'src/ai_orchestrator.ts', dest: 'ai_orchestrator.ts' },
  { src: 'src/ai_orchestrator_bash.ts', dest: 'ai_orchestrator_bash.ts' },
  { src: 'ai_orchestrator.js', dest: 'ai_orchestrator.js' },

  // ===========================================
  // AI Models
  // ===========================================
  { src: 'src/ai_models/base_model.ts', dest: 'ai_models/base_model.ts' },
  { src: 'src/ai_models/claude_model.ts', dest: 'ai_models/claude_model.ts' },
  { src: 'src/ai_models/gemini_model.ts', dest: 'ai_models/gemini_model.ts' },
  { src: 'src/ai_models/model_factory.ts', dest: 'ai_models/model_factory.ts' },

  // Legacy AI models (if they exist)
  { src: 'ai_models/base_model.js', dest: 'ai_models/base_model.js' },
  { src: 'ai_models/claude_model.js', dest: 'ai_models/claude_model.js' },
  { src: 'ai_models/openai_model.js', dest: 'ai_models/openai_model.js' },
  { src: 'ai_models/gemini_model.js', dest: 'ai_models/gemini_model.js' },
  { src: 'ai_models/model_factory.js', dest: 'ai_models/model_factory.js' },

  // ===========================================
  // Libraries
  // ===========================================
  { src: 'src/libs/pattern_matcher.ts', dest: 'libs/pattern_matcher.ts' },
  { src: 'src/libs/system_detector.ts', dest: 'libs/system_detector.ts' },
  { src: 'src/libs/machine-identity.ts', dest: 'libs/machine-identity.ts' },
  { src: 'src/libs/sync-manager.ts', dest: 'libs/sync-manager.ts' },
  { src: 'src/libs/user-manager.ts', dest: 'libs/user-manager.ts' },
  { src: 'src/libs/turso-client.ts', dest: 'libs/turso-client.ts' },
  { src: 'src/libs/turso-client-setup.ts', dest: 'libs/turso-client-setup.ts' },
  { src: 'src/libs/turso-admin-setup.ts', dest: 'libs/turso-admin-setup.ts' },
  { src: 'src/libs/turso-verify-schema.ts', dest: 'libs/turso-verify-schema.ts' },
  { src: 'src/libs/dashboard-server.js', dest: 'libs/dashboard-server.js' },
  { src: 'src/libs/local-cache.js', dest: 'libs/local-cache.js' },
  { src: 'src/libs/migrate-history.js', dest: 'libs/migrate-history.js' },

  // Legacy libs (if they exist)
  { src: 'libs/pattern_matcher.js', dest: 'libs/pattern_matcher.js' },
  { src: 'libs/system_detector.js', dest: 'libs/system_detector.js' },
  { src: 'libs/mcp_zsh.zsh', dest: 'libs/mcp_zsh.zsh' },
  { src: 'libs/mcp_bash.sh', dest: 'libs/mcp_bash.sh' },

  // ===========================================
  // Bridges and Adapters
  // ===========================================
  { src: 'src/bridges/AIConnector.ts', dest: 'src/bridges/AIConnector.ts' },
  { src: 'src/bridges/CommandProcessor.ts', dest: 'src/bridges/CommandProcessor.ts' },
  { src: 'src/bridges/adapters/PatternAdapter.ts', dest: 'src/bridges/adapters/PatternAdapter.ts' },
  { src: 'src/bridges/adapters/TursoAdapter.ts', dest: 'src/bridges/adapters/TursoAdapter.ts' },

  // ===========================================
  // Components
  // ===========================================
  { src: 'src/components/AIResponse.ts', dest: 'src/components/AIResponse.ts' },
  { src: 'src/components/CommandInput.ts', dest: 'src/components/CommandInput.ts' },
  { src: 'src/components/Header.ts', dest: 'src/components/Header.ts' },
  { src: 'src/components/HistoryView.ts', dest: 'src/components/HistoryView.ts' },
  { src: 'src/components/MarkdownParser.tsx', dest: 'src/components/MarkdownParser.tsx' },
  { src: 'src/components/MCPInkApp.ts', dest: 'src/components/MCPInkApp.ts' },
  { src: 'src/components/MultilineInput.ts', dest: 'src/components/MultilineInput.ts' },
  { src: 'src/components/StatusBar.ts', dest: 'src/components/StatusBar.ts' },

  // ===========================================
  // Hooks
  // ===========================================
  { src: 'src/hooks/useBackendInitialization.ts', dest: 'src/hooks/useBackendInitialization.ts' },
  { src: 'src/hooks/useCommandProcessor.ts', dest: 'src/hooks/useCommandProcessor.ts' },
  { src: 'src/hooks/useHistoryManager.ts', dest: 'src/hooks/useHistoryManager.ts' },
  { src: 'src/hooks/useInputHandler.ts', dest: 'src/hooks/useInputHandler.ts' },
  { src: 'src/hooks/useRequestManager.ts', dest: 'src/hooks/useRequestManager.ts' },

  // ===========================================
  // Contexts
  // ===========================================
  { src: 'src/contexts/AppContext.js', dest: 'src/contexts/AppContext.js' },

  // ===========================================
  // Services
  // ===========================================
  { src: 'src/services/backendService.ts', dest: 'src/services/backendService.ts' },
  { src: 'src/services/backendService.js', dest: 'src/services/backendService.js' },

  // ===========================================
  // Utils
  // ===========================================
  { src: 'src/utils/debugLogger.ts', dest: 'src/utils/debugLogger.ts' },
  { src: 'src/utils/historyManager.ts', dest: 'src/utils/historyManager.ts' },
  { src: 'src/utils/pasteDetection.js', dest: 'src/utils/pasteDetection.js' },
  { src: 'src/utils/responseFormatter.js', dest: 'src/utils/responseFormatter.js' },
  { src: 'src/utils/specialCommands.js', dest: 'src/utils/specialCommands.js' },

  // ===========================================
  // Types
  // ===========================================
  { src: 'src/types/index.d.ts', dest: 'src/types/index.d.ts' },

  // ===========================================
  // Configuration Files
  // ===========================================
  { src: 'src/configure-ai.ts', dest: 'configure-ai.ts' },
  { src: 'src/constants.ts', dest: 'src/constants.ts' },
  { src: 'tsconfig.json', dest: 'tsconfig.json' },
  { src: 'package.json', dest: 'package.json' },
  { src: 'pnpm-lock.yaml', dest: 'pnpm-lock.yaml' },

  // ===========================================
  // Pattern Files
  // ===========================================
  { src: 'patterns/git_errors.json', dest: 'patterns/git_errors.json' },
  { src: 'patterns/npm_errors.json', dest: 'patterns/npm_errors.json' },
  { src: 'patterns/docker_errors.json', dest: 'patterns/docker_errors.json' },
  { src: 'patterns/linux_errors.json', dest: 'patterns/linux_errors.json' },
  { src: 'patterns/network_errors.json', dest: 'patterns/network_errors.json' },
  { src: 'patterns/permission_errors.json', dest: 'patterns/permission_errors.json' },
  { src: 'patterns/python_errors.json', dest: 'patterns/python_errors.json' },

  // ===========================================
  // Web Search and Scraper
  // ===========================================
  { src: 'web_search/search_manager.js', dest: 'web_search/search_manager.js' },
  { src: 'web_search/search_engines.js', dest: 'web_search/search_engines.js' },
  { src: 'web_search/result_formatter.js', dest: 'web_search/result_formatter.js' },
  { src: 'web_scraper/scraper.js', dest: 'web_scraper/scraper.js' },
  { src: 'web_scraper/firecrawl_client.js', dest: 'web_scraper/firecrawl_client.js' },

  // ===========================================
  // Shell Scripts
  // ===========================================
  { src: 'scripts/zsh_integration.sh', dest: 'zsh_integration.sh' },
  { src: 'scripts/deploy-linux.sh', dest: 'deploy-linux.sh' },

  // ===========================================
  // Setup Files (self-reference for upgrades)
  // ===========================================
  { src: 'setup.js', dest: 'setup.js' },
  { src: 'setup.ts', dest: 'setup.ts' },

  // ===========================================
  // Documentation
  // ===========================================
  { src: 'README.md', dest: 'README.md' },
  { src: 'CLAUDE.md', dest: 'CLAUDE.md' },
];

/**
 * Files that are currently copied in the basic setup.js
 * This is a subset for backward compatibility
 */
export const basicFilesToCopy: FileMapping[] = [
  { src: 'src/ipcom-chat-cli.js', dest: 'ipcom-chat-cli.js' },
  { src: 'src/mcp-ink-cli.mjs', dest: 'src/mcp-ink-cli.mjs' },
  { src: 'src/ai_orchestrator.ts', dest: 'ai_orchestrator.ts' },
  { src: 'src/ai_orchestrator_bash.ts', dest: 'ai_orchestrator_bash.ts' },
  { src: 'src/configure-ai.ts', dest: 'configure-ai.ts' },
  { src: 'scripts/zsh_integration.sh', dest: 'zsh_integration.sh' },
  { src: 'scripts/deploy-linux.sh', dest: 'deploy-linux.sh' },
];

/**
 * Essential files that must exist for the system to work
 */
export const essentialFiles = filesToCopy.filter(f => [
  'mcp-claude.ts',
  'mcp-client.js',
  'mcp-assistant.js',
  'setup.js',
  'src/ai_orchestrator.ts',
  'src/ai_orchestrator_bash.ts',
  'src/mcp-ink-cli.mjs',
  'src/ipcom-chat-cli.ts'
].includes(f.src));

/**
 * Pattern files that need to be in the patterns directory
 */
export const patternFiles = filesToCopy.filter(f => f.dest.startsWith('patterns/'));

/**
 * Library files that need to be in the libs directory
 */
export const libFiles = filesToCopy.filter(f =>
  f.dest.startsWith('libs/') || f.dest.startsWith('ai_models/')
);

/**
 * Component files for the Ink interface
 */
export const componentFiles = filesToCopy.filter(f =>
  f.dest.includes('components/') ||
  f.dest.includes('hooks/') ||
  f.dest.includes('contexts/')
);

/**
 * Get files by category
 */
export function getFilesByCategory(category: 'essential' | 'patterns' | 'libs' | 'components' | 'basic' | 'all'): FileMapping[] {
  switch (category) {
    case 'essential':
      return essentialFiles;
    case 'patterns':
      return patternFiles;
    case 'libs':
      return libFiles;
    case 'components':
      return componentFiles;
    case 'basic':
      return basicFilesToCopy;
    case 'all':
    default:
      return filesToCopy;
  }
}

/**
 * Check if a file should be executable
 */
export function shouldBeExecutable(filename: string): boolean {
  const executablePatterns = [
    'mcp-client.js',
    'mcp-assistant.js',
    'mcp-claude.js',
    'mcp-claude.ts',
    'setup.js',
    'setup.ts',
    'ipcom-chat',
    'ipcom-chat-cli',
    'mcp-configure',
    'deploy-linux.sh',
    'zsh_integration.sh',
    '.mjs',
    '.tsx'
  ];

  return executablePatterns.some(pattern => filename.includes(pattern));
}

/**
 * Directories to copy entirely (not file by file)
 * NOTE: These should be used INSTEAD of individual file copying,
 * not in addition to it. Choose one strategy per directory.
 *
 * @deprecated Temporarily disabled to avoid conflicts with filesToCopy
 * TODO: Refactor setup.js to use either file-by-file OR directory copying, not both
 */
export const directoriesToCopy = [
  // { src: 'src', dest: 'src' },     // Conflicts with individual src/ files in filesToCopy
  // { src: 'docs', dest: 'docs' },   // Can be enabled if no individual docs files in filesToCopy
  // { src: 'dist', dest: 'dist' },   // Can be enabled if no individual dist files in filesToCopy
];

/**
 * Launcher scripts to generate dynamically
 */
export const launcherScripts = [
  {
    name: 'ipcom-chat',
    content: `#!/usr/bin/env node

// V2 Interface - Always use the new Ink interface
await import('./ipcom-chat-cli.js');`
  },
  {
    name: 'mcp-configure',
    content: `#!/usr/bin/env node

// Simple wrapper to run the AI configurator
import AIConfigurator from './configure-ai.js';

const configurator = new AIConfigurator();
configurator.run().catch(error => {
    console.error('❌ Erro na configuração:', error.message);
    process.exit(1);
});`
  }
];

// Pure ES6 exports - no CommonJS
// All exports are already declared above with 'export' keyword