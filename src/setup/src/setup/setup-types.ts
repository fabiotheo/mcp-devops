// setup-types.ts - Tipos essenciais simplificados
// Reduzido de 247 linhas para ~70 linhas (-72% redução)

/**
 * Opções de setup - apenas 4 opções essenciais vs 11 originais
 */
export interface SetupOptions {
  /** Instalação automática sem prompts */
  auto?: boolean;
  /** Atualização de instalação existente */
  upgrade?: boolean;
  /** Forçar sobrescrita de arquivos */
  force?: boolean;
  /** Modo verboso com mais detalhes */
  verbose?: boolean;
}

/**
 * Configuração do setup - 8 propriedades essenciais vs 15+ originais
 */
export interface SetupConfig {
  /** Diretório principal do MCP */
  mcpDir: string;
  /** Diretório de configuração */
  configDir: string;
  /** Diretório home do usuário */
  homeDir: string;
  /** Plataforma do sistema (linux, darwin, win32) */
  platform: string;
  /** Shell detectado (bash, zsh, fish) */
  shell: string;
  /** Versão do sistema */
  version: string;
  /** Se está executando como root */
  isRoot: boolean;
  /** Modo verboso ativo */
  verbose: boolean;
}

/**
 * Configuração da API - 6 propriedades essenciais vs 10+ originais
 */
export interface APIConfig {
  /** Provedor de AI selecionado */
  ai_provider: string;
  /** Chave da API Anthropic (Claude) */
  anthropic_api_key?: string;
  /** Chave da API OpenAI (GPT) */
  openai_api_key?: string;
  /** Chave da API Google (Gemini) */
  gemini_api_key?: string;
  /** Versão da configuração */
  version: string;
  /** Data de criação */
  created: string;
}

/**
 * Mapeamento de arquivos para instalação
 */
export interface FileMapping {
  /** Arquivo fonte */
  src: string;
  /** Destino */
  dest: string;
  /** Permissões (opcional) */
  mode?: number;
}

/**
 * Resultado de teste simples
 */
export interface TestResult {
  /** Nome do teste */
  name: string;
  /** Se passou */
  passed: boolean;
  /** Erro se houver */
  error?: string;
}
