# Estrutura do Código Fonte

Este diretório contém todo o código fonte organizado do MCP Terminal Assistant.

## Estrutura de Diretórios

```
src/
├── core/              # Aplicações principais
│   ├── mcp-assistant.js      # Assistente de comandos Linux
│   ├── mcp-client.js          # Monitor de comandos
│   ├── mcp-interactive.js    # Interface interativa
│   ├── mcp-simple.js          # Interface simplificada
│   ├── ai_orchestrator.js     # Orquestrador de IA
│   └── ai_orchestrator_tools.js # Ferramentas do orquestrador
│
├── ai-models/         # Modelos de IA
│   ├── base_model.js          # Classe base para modelos
│   ├── claude_model.js        # Implementação Claude
│   ├── claude_model_tools.js  # Ferramentas Claude
│   ├── openai_model.js        # Implementação OpenAI
│   ├── gemini_model.js        # Implementação Gemini
│   └── model_factory.js       # Factory para criar modelos
│
├── libs/              # Bibliotecas auxiliares
│   ├── pattern_matcher.js     # Correspondência de padrões
│   ├── system_detector.js     # Detecção de sistema
│   ├── user-manager.js        # Gerenciamento de usuários
│   ├── session-persistence.js # Persistência de sessão
│   ├── turso-client.js        # Cliente Turso DB
│   └── ...                    # Outras bibliotecas
│
├── patterns/          # Padrões de erro em JSON
│   ├── git_errors.json        # Erros do Git
│   ├── npm_errors.json        # Erros do NPM
│   ├── docker_errors.json     # Erros do Docker
│   └── linux_errors.json      # Erros gerais do Linux
│
├── web/               # Módulos web
│   ├── search/                # Busca na web
│   │   ├── index.js           # Interface principal
│   │   └── web_searcher.js    # Implementação da busca
│   └── scraper/               # Web scraping
│       ├── index.js           # Interface principal
│       └── firecrawl_wrapper.js # Wrapper do Firecrawl
│
├── utils/             # Utilitários (futuro)
├── config/            # Configurações (futuro)
└── tests/             # Testes (futuro)
```

## Convenções de Importação

### Importações Relativas
- De `core/` para `libs/`: `import ... from '../libs/...'`
- De `core/` para `ai-models/`: `import ... from '../ai-models/...'`
- De `core/` para `patterns/`: `import ... from '../patterns/...'`
- De `core/` para `web/`: `import ... from '../web/search/...'` ou `'../web/scraper/...'`

### Importações Entre Módulos Web
- De `web/search/` para `web/scraper/`: `import ... from '../scraper/...'`
- De `web/scraper/` para `web/search/`: `import ... from '../search/...'`

## Deploy

O arquivo `setup.js` foi atualizado para copiar a nova estrutura durante a instalação:
- Os arquivos de `src/core/` são copiados para `~/.mcp-terminal/`
- Os arquivos de `src/ai-models/` são copiados para `~/.mcp-terminal/ai_models/`
- Os arquivos de `src/libs/` são copiados para `~/.mcp-terminal/libs/`
- Os arquivos de `src/patterns/` são copiados para `~/.mcp-terminal/patterns/`
- Os arquivos de `src/web/search/` são copiados para `~/.mcp-terminal/web_search/`
- Os arquivos de `src/web/scraper/` são copiados para `~/.mcp-terminal/web_scraper/`

## Desenvolvimento

Para adicionar novos arquivos:
1. Coloque-os no diretório apropriado em `src/`
2. Atualize `setup.js` se necessário para incluir no processo de instalação
3. Use caminhos relativos apropriados para importações