#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Map of old paths to new paths
const pathMappings = {
  // AI Models
  './ai_models/': './src/ai-models/',
  '../ai_models/': '../src/ai-models/',
  '../../ai_models/': '../../src/ai-models/',

  // Libs
  './libs/': './src/libs/',
  '../libs/': '../src/libs/',
  '../../libs/': '../../src/libs/',

  // Patterns
  './patterns/': './src/patterns/',
  '../patterns/': '../src/patterns/',
  '../../patterns/': '../../src/patterns/',

  // Web modules
  './web_search/': './src/web/search/',
  '../web_search/': '../src/web/search/',
  '../../web_search/': '../../src/web/search/',
  './web_scraper/': './src/web/scraper/',
  '../web_scraper/': '../src/web/scraper/',
  '../../web_scraper/': '../../src/web/scraper/',

  // Core modules
  './mcp-assistant': './src/core/mcp-assistant',
  '../mcp-assistant': '../src/core/mcp-assistant',
  './mcp-interactive': './src/core/mcp-interactive',
  '../mcp-interactive': '../src/core/mcp-interactive',
  './mcp-client': './src/core/mcp-client',
  '../mcp-client': '../src/core/mcp-client',
  './mcp-simple': './src/core/mcp-simple',
  '../mcp-simple': '../src/core/mcp-simple',
  './ai_orchestrator': './src/core/ai_orchestrator',
  '../ai_orchestrator': '../src/core/ai_orchestrator',
  './ai_orchestrator_tools': './src/core/ai_orchestrator_tools',
  '../ai_orchestrator_tools': '../src/core/ai_orchestrator_tools',
};

function updateImportsInFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Update require statements
  Object.entries(pathMappings).forEach(([oldPath, newPath]) => {
    const requireRegex = new RegExp(`require\\(['"\`]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    if (requireRegex.test(content)) {
      content = content.replace(requireRegex, `require('${newPath}`);
      modified = true;
    }
  });

  // Update import statements
  Object.entries(pathMappings).forEach(([oldPath, newPath]) => {
    const importRegex = new RegExp(`from ['"\`]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    if (importRegex.test(content)) {
      content = content.replace(importRegex, `from '${newPath}`);
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated imports in: ${filePath}`);
  }
}

// Update all JavaScript files
const files = glob.sync('**/*.js', {
  ignore: ['node_modules/**', '.git/**', 'update-imports.js']
});

files.forEach(file => {
  updateImportsInFile(file);
});

console.log('Import paths update complete!');