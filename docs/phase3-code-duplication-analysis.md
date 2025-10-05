# ANÁLISE DE CÓDIGO DUPLICADO - FASE 3

## Resumo Executivo

**Total de Duplicações Identificadas**: 200+ padrões duplicados
**Impacto**: ~30% do código pode ser eliminado através de consolidação

## DUPLICAÇÕES CRÍTICAS

### 1. Operações de I/O (26 duplicações)
**Padrão Repetido**:
```typescript
await io.ensureDir(config.mcpDir);
await io.readJsonFile<T>(configPath);
await io.writeJsonFile(path, data, options);
await io.fileExists(filePath);
```

**Locais Duplicados**:
- setup-config-manager.ts (8 ocorrências)
- setup-installer.ts (12 ocorrências)
- setup-validator.ts (6 ocorrências)

### 2. Manipulação de Caminhos (63 duplicações)
**Padrão Repetido**:
```typescript
path.join(homeDir, '.mcp-terminal')
path.join(this.config.mcpDir, subdir)
path.join(config.mcpDir, file)
```

**Análise**:
- `config.mcpDir` usado 32+ vezes
- Sempre mesmo padrão de construção de paths
- Lógica de path building espalhada por múltiplas classes

### 3. Logging e Console Output (116+ duplicações)
**Padrões Repetidos**:
```typescript
console.log('✅ [Action] completed successfully');
console.log('📦 Installing...');
console.log('❌ [Action] failed');
console.error('Error:', error);
```

**Distribuição**:
- setup-installer.ts: 24+ console statements
- setup-orchestrator.ts: 48+ console statements
- setup-validator.ts: 20+ console statements
- Outros: 24+ console statements

### 4. Error Handling (16 duplicações)
**Padrão Repetido**:
```typescript
try {
  // operation
} catch (error) {
  console.error('❌ Failed to [action]:', error);
  throw new SetupError(message, SetupErrorType.UNKNOWN);
}
```

### 5. Configuration Path Building
**Padrão Repetido**:
```typescript
// Repetido em 4+ classes
const homeDir = system.getUserHome();
const mcpDir = path.join(homeDir, '.mcp-terminal');
const configPath = path.join(mcpDir, 'config.json');
```

### 6. Async Method Signatures
**Padrão Repetido**:
```typescript
async methodName(): Promise<boolean>
async methodName(): Promise<void>
async methodName(config: SetupConfig): Promise<SomeType>
```

## DUPLICAÇÕES POR MÓDULO

### setup-config-manager.ts (361 linhas)
- **I/O Operations**: 8 duplicações
- **Path Building**: 12 duplicações
- **Error Handling**: 4 duplicações
- **Backup Logic**: Repetido internamente

### setup-installer.ts (431 linhas)
- **I/O Operations**: 12 duplicações
- **Console Logging**: 24 duplicações
- **Directory Creation**: 8 padrões similares
- **Permission Setting**: 6 padrões repetidos

### setup-orchestrator.ts (620 linhas)
- **Instance Creation**: 5 padrões `new ClassName()`
- **Console Logging**: 48+ duplicações
- **Error Handling**: 6 duplicações
- **Method Pattern**: Repetição de estrutura em runXXX methods

### setup-validator.ts (614 linhas)
- **Test Pattern**: 5 testes seguem mesmo padrão
- **Console Output**: 20+ duplicações
- **Path Validation**: 8 padrões similares

## ANÁLISE DE PADRÕES COMUNS

### Pattern 1: Directory Setup
```typescript
// Repetido em 4 classes
await io.ensureDir(somePath);
const exists = await io.dirExists(somePath);
if (!exists) { /* handle */ }
```

### Pattern 2: File Operations
```typescript
// Repetido em 6+ locais
if (await io.fileExists(filePath)) {
  const content = await io.readFile(filePath);
  // process content
  await io.writeFile(filePath, newContent);
}
```

### Pattern 3: Configuration Loading
```typescript
// Repetido em 3 classes
try {
  const config = await io.readJsonFile<APIConfig>(configPath);
  return this.normalizeConfig(config);
} catch (error) {
  return null; // or default
}
```

## OPORTUNIDADES DE CONSOLIDAÇÃO

### 1. Consolidar I/O Operations (Economia: ~400 linhas)
**Criar**: `setup-files.ts` com funções high-level
```typescript
export async function setupDirectory(path: string): Promise<void>
export async function loadConfiguration<T>(path: string): Promise<T>
export async function saveConfiguration<T>(path: string, data: T): Promise<void>
```

### 2. Consolidar Logging (Economia: ~200 linhas)
**Criar**: `setup-logger.ts`
```typescript
export function logSuccess(action: string): void
export function logProgress(action: string): void
export function logError(action: string, error: Error): void
```

### 3. Consolidar Path Management (Economia: ~150 linhas)
**Criar**: Objeto de configuração centralizado
```typescript
export const SETUP_PATHS = {
  mcpDir: () => path.join(os.homedir(), '.mcp-terminal'),
  config: () => path.join(SETUP_PATHS.mcpDir(), 'config.json'),
  // etc...
};
```

### 4. Consolidar Error Handling (Economia: ~100 linhas)
**Criar**: Error handling utilities
```typescript
export function handleSetupError(action: string, error: unknown): never
export function wrapAsyncOperation<T>(operation: () => Promise<T>): Promise<T>
```

## MÉTRICAS DE CONSOLIDAÇÃO

| Tipo de Duplicação | Ocorrências | Linhas Duplicadas | Economia Potencial |
|-------------------|-------------|-------------------|-------------------|
| I/O Operations | 26 | ~400 | 75% redução |
| Console Logging | 116+ | ~200 | 80% redução |
| Path Building | 63 | ~150 | 70% redução |
| Error Handling | 16 | ~100 | 60% redução |
| Configuration | 12 | ~80 | 65% redução |
| **TOTAL** | **233+** | **~930** | **~700 linhas** |

## RECOMENDAÇÕES IMEDIATAS

### Prioridade ALTA:
1. **Consolidar I/O**: Maior impacto (~400 linhas economizadas)
2. **Centralizar Logging**: Reduzir poluição de console
3. **Path Management**: Eliminar hardcoding de paths

### Prioridade MÉDIA:
4. **Error Handling**: Padronizar tratamento de erros
5. **Configuration**: Centralizar lógica de config

### Impacto Esperado:
- **Redução de ~930 linhas** através de consolidação
- **Melhoria da manutenibilidade** (código DRY)
- **Redução de bugs** (lógica centralizada)
- **Facilitar testing** (menos duplicação)