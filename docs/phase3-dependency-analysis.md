# ANÁLISE DE DEPENDÊNCIAS - FASE 3 ATUAL

## Mapa de Dependências (Situação Atual)

```
LEGENDA: X → Y (X depende de Y)

setup-orchestrator.ts (GOD CLASS - 7 dependências)
├── setup-config-manager.ts
├── setup-installer.ts
├── setup-shell-integration.ts
├── setup-validator.ts
├── setup-io.ts
├── setup-system.ts
└── setup-helpers.ts

setup-config-manager.ts (4 dependências)
├── setup-types.ts
├── setup-config.ts
├── setup-io.ts
└── setup-system.ts

setup-installer.ts (6 dependências)
├── setup-io.ts
├── setup-system.ts
├── setup-helpers.ts
├── setup-files.config.ts
├── setup-types.ts
└── setup-config.ts

setup-validator.ts (3 dependências)
├── setup-io.ts
├── setup-system.ts
├── setup-types.ts
└── setup-config.ts

setup-shell-integration.ts (3 dependências)
├── setup-io.ts
├── setup-system.ts
├── setup-types.ts
└── setup-config.ts

setup-system.ts (2 dependências)
├── setup-types.ts
└── setup-helpers.ts

setup-helpers.ts (2 dependências)
├── setup-config.ts
└── setup-types.ts

setup-io.ts (1 dependência)
└── setup-types.ts

setup-config.ts (1 dependência)
└── setup-types.ts

setup-files.config.ts (1 dependência)
└── setup-types.ts

setup-types.ts (0 dependências)
```

## Análise de Acoplamento

### ALTO ACOPLAMENTO (CRÍTICO)
- **setup-orchestrator.ts**: 7 dependências diretas
- **setup-installer.ts**: 6 dependências diretas
- **setup-config-manager.ts**: 4 dependências diretas

### MÓDULOS CENTRAIS (Core Dependencies)
- **setup-types.ts**: Usado por 8 módulos
- **setup-io.ts**: Usado por 5 módulos
- **setup-system.ts**: Usado por 5 módulos
- **setup-config.ts**: Usado por 5 módulos

### POTENCIAL CIRCULAR DEPENDENCY RISK
```
setup-system.ts → setup-helpers.ts
setup-helpers.ts → setup-config.ts
setup-config.ts → setup-types.ts
setup-io.ts → setup-types.ts
```

## Contagem de Dependências Totais

| Módulo | Dependências Diretas | Dependências Transitivas |
|--------|---------------------|---------------------------|
| setup-orchestrator.ts | 7 | ~15+ |
| setup-installer.ts | 6 | ~10+ |
| setup-config-manager.ts | 4 | ~8+ |
| setup-validator.ts | 4 | ~8+ |
| setup-shell-integration.ts | 4 | ~8+ |
| setup-system.ts | 2 | ~3+ |
| setup-helpers.ts | 2 | ~2+ |
| setup-io.ts | 1 | ~1 |
| setup-config.ts | 1 | ~1 |
| setup-files.config.ts | 1 | ~1 |
| setup-types.ts | 0 | 0 |

**TOTAL: 32 dependências diretas entre módulos**

## PROBLEMAS IDENTIFICADOS

### 1. God Class Pattern
- `setup-orchestrator.ts` controla tudo (7 dependências)
- Viola Single Responsibility Principle
- Dificulta testing e manutenção

### 2. Excessive Coupling
- Média de 3+ dependências por módulo
- Módulos não podem ser usados independentemente
- Mudança em um módulo afeta múltiplos outros

### 3. Core Module Overload
- `setup-io.ts`, `setup-system.ts` usados por 45% dos módulos
- Mudanças nestes módulos têm impacto amplo
- Risco de breaking changes em cascata

### 4. Dependency Depth
- setup-orchestrator tem até 3 níveis de dependências transitivas
- Aumenta complexidade de debugging
- Dificulta tree-shaking e otimização

## RECOMENDAÇÕES IMEDIATAS

1. **Eliminar God Class**: Quebrar setup-orchestrator em funções
2. **Consolidar Core Modules**: Unir io/system/helpers em módulo único
3. **Reduzir Coupling**: Máximo 2 dependências por módulo
4. **Inverter Dependências**: Use dependency injection onde necessário