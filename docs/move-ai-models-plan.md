# Plano de Migração: ai_models para interface-v2

## Objetivo
Mover o diretório `ai_models/` para dentro de `interface-v2/` para melhor organização do código.

## Análise de Impacto

### Arquivos Core que precisam de atualização:
1. **ai_orchestrator.js**
   - Import atual: `./ai_models/model_factory.js`
   - Novo import: `./interface-v2/ai_models/model_factory.js`

2. **ai_orchestrator_bash.js**
   - Não importa diretamente de ai_models (usa apenas o modelo passado)

3. **mcp-assistant.js**
   - Import atual: `./ai_models/model_factory.js`
   - Novo import: `./interface-v2/ai_models/model_factory.js`

### Arquivos dentro de interface-v2:
1. **interface-v2/mcp-ink-cli.mjs**
   - Import atual: `../ai_models/model_factory.js`
   - Novo import: `./ai_models/model_factory.js`

### Setup.js precisa atualizar:
1. Caminho de origem para copiar ai_models
2. Lógica de ajuste de imports na instalação

## Fases da Migração

### Fase 1: Backup
- Criar backup completo do estado atual
- Documentar versão funcional para rollback

### Fase 2: Mover Diretório
```bash
mv ai_models/ interface-v2/ai_models/
```

### Fase 3: Atualizar Imports nos Arquivos Core

#### ai_orchestrator.js
```javascript
// De:
import ModelFactory from './ai_models/model_factory.js';

// Para:
import ModelFactory from './interface-v2/ai_models/model_factory.js';
```

#### mcp-assistant.js
```javascript
// De:
import ModelFactory from './ai_models/model_factory.js';

// Para:
import ModelFactory from './interface-v2/ai_models/model_factory.js';
```

#### interface-v2/mcp-ink-cli.mjs
```javascript
// De:
import ModelFactory from '../ai_models/model_factory.js';

// Para:
import ModelFactory from './ai_models/model_factory.js';
```

### Fase 4: Atualizar setup.js

#### Seção de cópia de ai_models (linhas ~869-893)
```javascript
// De:
const aiModelsDir = path.join(process.cwd(), 'ai_models');
const destAiModelsDir = path.join(this.mcpDir, 'ai_models');

// Para:
const aiModelsDir = path.join(process.cwd(), 'interface-v2', 'ai_models');
const destAiModelsDir = path.join(this.mcpDir, 'ai_models');
```

#### Ajuste de imports na instalação (linhas ~953-962)
Adicionar lógica para ajustar caminhos de ai_orchestrator.js e mcp-assistant.js:
```javascript
// Para arquivos na raiz que importam de interface-v2/ai_models
if (sourceFile === 'ai_orchestrator.js' || sourceFile === 'mcp-assistant.js') {
    adjustedContent = adjustedContent.replace(
        /from ['"]\.\/interface-v2\/ai_models\//g,
        "from './ai_models/"
    );
}
```

### Fase 5: Testes
1. Testar interface-v2 localmente
2. Testar ai_orchestrator.js
3. Testar mcp-assistant.js
4. Executar setup.js --force
5. Testar instalação em ~/.mcp-terminal/

## Riscos e Mitigações

### Riscos:
1. Quebrar imports em produção
2. Setup.js não copiar corretamente
3. Caminhos relativos incorretos

### Mitigações:
1. Backup completo antes de iniciar
2. Testes extensivos antes de confirmar
3. Script de rollback pronto

## Script de Rollback
```bash
#!/bin/bash
# rollback-ai-models.sh

# Restaurar ai_models para raiz
mv interface-v2/ai_models/ ai_models/

# Reverter imports em ai_orchestrator.js
sed -i '' 's|./interface-v2/ai_models/|./ai_models/|g' ai_orchestrator.js

# Reverter imports em mcp-assistant.js
sed -i '' 's|./interface-v2/ai_models/|./ai_models/|g' mcp-assistant.js

# Reverter imports em interface-v2/mcp-ink-cli.mjs
sed -i '' 's|./ai_models/|../ai_models/|g' interface-v2/mcp-ink-cli.mjs

echo "Rollback concluído"
```

## Comando para executar a migração
```bash
# Criar script automatizado
cat > migrate-ai-models.sh << 'EOF'
#!/bin/bash
set -e

echo "🔄 Iniciando migração de ai_models para interface-v2..."

# Fase 1: Backup
echo "📦 Criando backup..."
cp -r . ../backup-ai-models-$(date +%Y%m%d-%H%M%S)/

# Fase 2: Mover diretório
echo "📁 Movendo ai_models..."
mv ai_models/ interface-v2/ai_models/

# Fase 3: Atualizar imports
echo "✏️ Atualizando imports..."

# ai_orchestrator.js
sed -i '' 's|./ai_models/|./interface-v2/ai_models/|g' ai_orchestrator.js

# mcp-assistant.js
sed -i '' 's|./ai_models/|./interface-v2/ai_models/|g' mcp-assistant.js

# interface-v2/mcp-ink-cli.mjs
sed -i '' 's|../ai_models/|./ai_models/|g' interface-v2/mcp-ink-cli.mjs

echo "✅ Migração concluída!"
echo "📝 Próximo passo: Atualizar setup.js manualmente"
EOF

chmod +x migrate-ai-models.sh
```

## Checklist de Validação
- [ ] ai_models movido para interface-v2/
- [ ] ai_orchestrator.js importando corretamente
- [ ] mcp-assistant.js importando corretamente
- [ ] interface-v2/mcp-ink-cli.mjs importando corretamente
- [ ] setup.js atualizado para copiar do novo local
- [ ] setup.js ajustando imports na instalação
- [ ] Testes locais passando
- [ ] Instalação via setup.js funcionando
- [ ] Aplicação instalada funcionando