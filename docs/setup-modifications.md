# Setup.js Modifications for New Structure

## Required Changes

### 1. Add New Directories to Copy List

The current setup.js copies the entire `src/` directory, but we need to ensure the new modular structure is properly handled.

### Current Structure Being Copied:
```
~/.mcp-terminal/
├── src/                    (entire directory copied)
│   ├── mcp-ink-cli.mjs
│   ├── ai_models/
│   ├── libs/
│   └── components/
├── patterns/
├── web_search/
├── web_scraper/
└── docs/
```

### New Structure to Support:
```
~/.mcp-terminal/
├── src/
│   ├── mcp-ink-cli.mjs     (main file, will be <300 lines)
│   ├── hooks/               (NEW - must be copied)
│   │   ├── useRequestManager.js
│   │   ├── useInitialization.js
│   │   ├── useHistory.js
│   │   ├── useCommandProcessor.js
│   │   ├── useInputHandler.js
│   │   └── useCancellation.js
│   ├── utils/               (NEW - must be copied)
│   │   ├── responseFormatter.js
│   │   ├── specialCommands.js
│   │   ├── debugLogger.js
│   │   └── pasteDetection.js
│   ├── components/
│   │   └── MainUI.js        (refactored component)
│   ├── ai_models/           (existing)
│   └── libs/                (existing)
├── patterns/                (existing)
├── web_search/              (existing)
├── web_scraper/             (existing)
└── docs/                    (existing)
```

## Code Changes Needed in setup.js

### Location: makeExecutable() method (around line 1190-1217)

The current code already copies the entire `src/` directory recursively, which is good:

```javascript
// Copy new interface v2 structure (around line 1190)
try {
  const interfaceV2Dir = path.join(process.cwd(), 'src');
  const destInterfaceV2Dir = path.join(this.mcpDir, 'src');

  // This recursive copy will include hooks/ and utils/ automatically
  await copyRecursive(interfaceV2Dir, destInterfaceV2Dir);
  console.log(`  ✓ Nova interface Ink (src) copiada`);
} catch (error) {
  console.log(`  ⚠ Interface-v2 não encontrada (${error.message})`);
}
```

**Good news**: The existing recursive copy will automatically handle `hooks/` and `utils/` directories!

### Import Path Adjustments

Location: `adjustImportsForInstallation()` method (around line 1045-1085)

We need to add new patterns for hook and util imports:

```javascript
adjustImportsForInstallation(content, sourceFile) {
  let adjustedContent = content;

  // Existing adjustments...

  // NEW: Adjust imports from hooks
  if (sourceFile.includes('src/')) {
    // ./hooks/useRequestManager.js remains ./hooks/useRequestManager.js (already correct)
    // No adjustment needed for hooks as they're relative to src/

    // ./utils/responseFormatter.js remains ./utils/responseFormatter.js (already correct)
    // No adjustment needed for utils as they're relative to src/
  }

  // NEW: If hooks import from parent directories
  if (sourceFile.includes('src/hooks/')) {
    // ../ai_models/ -> ../ai_models/ (already correct as both are under src/)
    // ../libs/ -> ../libs/ (already correct)
    // No adjustment needed
  }

  // NEW: If utils import from parent directories
  if (sourceFile.includes('src/utils/')) {
    // ../ai_models/ -> ../ai_models/ (already correct)
    // ../libs/ -> ../libs/ (already correct)
    // No adjustment needed
  }

  return adjustedContent;
}
```

## Verification Steps

After refactoring, to verify setup.js works correctly:

1. **Test Installation**:
```bash
# In development directory
node setup.js --auto

# Check installed structure
ls -la ~/.mcp-terminal/src/hooks/
ls -la ~/.mcp-terminal/src/utils/
```

2. **Verify Imports Work**:
```bash
# Test the main command
~/.local/bin/ipcom-chat --help

# Test with a simple command
~/.local/bin/ipcom-chat "test"
```

3. **Check Import Resolution**:
```bash
# In ~/.mcp-terminal, verify imports resolve
node -e "import './src/mcp-ink-cli.mjs'"
```

## Summary

✅ **Good News**: The current setup.js will mostly work as-is because:
1. It already copies the entire `src/` directory recursively
2. This will automatically include new `hooks/` and `utils/` subdirectories
3. Import paths within `src/` remain relative and don't need adjustment

⚠️ **Minor Considerations**:
1. No code changes required in setup.js initially
2. Import path adjustments are already handled for the src/ structure
3. The recursive copy function will handle new directories automatically

## Testing Checklist

- [ ] Run setup.js after creating hooks/ directory
- [ ] Verify hooks/ is copied to ~/.mcp-terminal/src/hooks/
- [ ] Run setup.js after creating utils/ directory
- [ ] Verify utils/ is copied to ~/.mcp-terminal/src/utils/
- [ ] Test that mcp-ink-cli.mjs can import from hooks/
- [ ] Test that hooks can import from ai_models/ and libs/
- [ ] Verify ipcom-chat command still works after refactoring