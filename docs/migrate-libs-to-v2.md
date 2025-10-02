# Plano de Migração: libs/ para interface-v2/

## Análise de Impacto

### Arquivos que importam de `./libs/`:

1. **Arquivos principais (precisam atualização):**
   - `interface-v2/mcp-ink-cli.mjs` - Já usa `../libs/pattern_matcher.ts`
   - `ipcom-chat-cli.js` - Usa turso-client, user-manager, machine-identity
   - `mcp-claude.ts` - Usa system_detector, turso-client, sync-manager

2. **Arquivos de teste (podem ser removidos ou ignorados):**
   - `add-test-commands.js` - Script de teste
   - `test-performance-quick.js` - Teste de performance
   - `test-phase2-sync.js` - Teste de sincronização
   - `test-turso-fabio.js` - Teste do Turso

### Bibliotecas em `libs/` (24 arquivos):
- **Core/Essenciais:**
  - `turso-client.ts` - Cliente do banco de dados Turso
  - `pattern_matcher.ts` - Matcher de padrões de comandos
  - `system_detector.ts` - Detector de sistema operacional
  - `user-manager.ts` - Gerenciador de usuários
  - `machine-identity.ts` - Identidade da máquina
  - `sync-manager.ts` - Gerenciador de sincronização

- **UI/Input:**
  - `paste-manager.ts` - Gerenciador de paste
  - `multiline-input.ts` - Input multi-linha
  - `keybinding-manager.js` - Gerenciador de atalhos

- **Outros:**
  - Vários outros utilitários e helpers

## Fases da Migração

### Fase 1: Preparação
- Criar backup completo
- Identificar arquivos críticos vs teste

### Fase 2: Mover Diretório
```bash
mv libs/ interface-v2/libs/
```

### Fase 3: Atualizar Imports

#### interface-v2/mcp-ink-cli.mjs
```javascript
// De:
import PatternMatcher from '../libs/pattern_matcher.ts';
// Para:
import PatternMatcher from './libs/pattern_matcher.ts';
```

#### ipcom-chat-cli.js
```javascript
// De:
import TursoHistoryClient from './libs/turso-client.ts';
import UserManager from './libs/user-manager.ts';
import MachineIdentityManager from './libs/machine-identity.ts';
// Para:
import TursoHistoryClient from './interface-v2/libs/turso-client.ts';
import UserManager from './interface-v2/libs/user-manager.ts';
import MachineIdentityManager from './interface-v2/libs/machine-identity.ts';
```

#### mcp-claude.ts (arquivo legacy)
```javascript
// De:
import SystemDetector from './libs/system_detector.ts';
import TursoHistoryClient from './libs/turso-client.ts';
import SyncManager from './libs/sync-manager.ts';
// Para:
import SystemDetector from './interface-v2/libs/system_detector.ts';
import TursoHistoryClient from './interface-v2/libs/turso-client.ts';
import SyncManager from './interface-v2/libs/sync-manager.ts';
```

### Fase 4: Atualizar setup.js

#### Seção de cópia de libs (linha ~1092)
```javascript
// De:
const libsDir = path.join(process.cwd(), 'libs');
// Para:
const libsDir = path.join(process.cwd(), 'interface-v2', 'libs');
```

#### Ajuste de imports na instalação
- Adicionar lógica para ajustar caminhos quando instalar
- Criar link simbólico libs -> interface-v2/libs para compatibilidade

### Fase 5: Testes
1. Testar interface-v2 localmente
2. Testar ipcom-chat-cli.js
3. Executar setup.js --force
4. Testar instalação em ~/.mcp-terminal/

## Arquivos que podem ser removidos
Após a migração, estes arquivos de teste podem ser deletados:
- `add-test-commands.js`
- `test-performance-quick.js`
- `test-phase2-sync.js`
- `test-turso-fabio.js`

## Riscos e Mitigações

### Riscos:
1. Quebrar imports em produção
2. Arquivos legados pararem de funcionar
3. Setup.js não copiar corretamente

### Mitigações:
1. Criar link simbólico para manter compatibilidade
2. Backup completo antes da migração
3. Testes extensivos

## Comando para executar a migração

```bash
#!/bin/bash
# migrate-libs.sh

echo "🔄 Iniciando migração de libs para interface-v2..."

# Backup
cp -r libs libs-backup-$(date +%Y%m%d-%H%M%S)

# Mover
mv libs interface-v2/

# Atualizar imports
sed -i '' 's|../libs/|./libs/|g' interface-v2/mcp-ink-cli.mjs
sed -i '' 's|./libs/|./interface-v2/libs/|g' ipcom-chat-cli.js
sed -i '' 's|./libs/|./interface-v2/libs/|g' mcp-claude.ts

echo "✅ Migração concluída!"
```

## Benefícios da migração
1. **Organização**: Tudo relacionado à v2 em um só lugar
2. **Clareza**: Fica claro que libs é parte da interface-v2
3. **Manutenção**: Mais fácil manter e atualizar
4. **Isolamento**: Reduz dependências na raiz do projeto
