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
  /** Plataforma do sistema (linux, darwin, win32) ou objeto PlatformInfo */
  platform: string | PlatformInfo;
  /** Shell detectado (bash, zsh, fish) ou objeto ShellInfo */
  shell: string | ShellInfo;
  /** Versão do sistema */
  version: string;
  /** Se está executando como root */
  isRoot: boolean;
  /** Modo verboso ativo */
  verbose: boolean;
  /** Caminho do arquivo de configuração */
  configPath?: string;
  /** Caminho do .zshrc */
  zshrcPath?: string;
  /** Caminho do .bashrc */
  bashrcPath?: string;
  /** Diretório de backup */
  backupDir?: string;
  /** Diretório de logs */
  logsDir?: string;
  /** Caminho do arquivo de versão */
  versionFilePath?: string;
  /** Shell atual */
  currentShell?: string;
}

/**
 * Configuração da API - 6 propriedades essenciais vs 10+ originais
 */
export interface APIConfig {
  /** Provedor de AI selecionado */
  ai_provider: string;
  /** Chave da API Anthropic (Claude) */
  anthropic_api_key?: string;
  /** Modelo Claude a usar */
  claude_model?: string;
  /** Chave da API OpenAI (GPT) */
  openai_api_key?: string;
  /** Modelo OpenAI a usar */
  openai_model?: string;
  /** Chave da API Google (Gemini) */
  gemini_api_key?: string;
  /** Modelo Gemini a usar */
  gemini_model?: string;
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

/**
 * Tipos de erro do setup
 */
export enum SetupErrorType {
  INVALID_CONFIG = 'INVALID_CONFIG',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  COMMAND_FAILED = 'COMMAND_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  TIMEOUT = 'TIMEOUT',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Classe de erro customizada para setup
 */
export class SetupError extends Error {
  constructor(
    message: string,
    public type: SetupErrorType = SetupErrorType.UNKNOWN,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SetupError';
  }
}

/**
 * Informações da plataforma
 */
export interface PlatformInfo {
  /** Nome da plataforma (linux, darwin, win32) */
  platform: string;
  /** Arquitetura (x64, arm64) */
  arch: string;
  /** Versão do OS */
  version?: string;
  /** Release do OS */
  release?: string;
  /** Distribuição Linux (se aplicável) */
  distro?: string;
  /** Se a plataforma é suportada */
  isSupported?: boolean;
}

/**
 * Informações do shell
 */
export interface ShellInfo {
  /** Nome do shell */
  name?: string;
  /** Tipo de shell (bash, zsh, fish) */
  type: 'bash' | 'zsh' | 'fish' | 'sh';
  /** Caminho do executável */
  path: string;
  /** Versão */
  version?: string;
}

/**
 * Tipo do gerenciador de pacotes (string simples)
 */
export type PackageManager = string;

/**
 * Resultado da instalação
 */
export interface InstallResult {
  /** Se a instalação foi bem sucedida */
  success: boolean;
  /** Mensagem de resultado */
  message?: string;
  /** Erros ocorridos */
  errors?: string[];
  /** Warnings ocorridos */
  warnings?: string[];
  /** Arquivos instalados */
  filesInstalled?: number;
  /** Versão instalada */
  version?: string;
  /** Duração da instalação em ms */
  duration?: number;
}

/**
 * Callback de progresso
 */
export type ProgressCallback = (progress: {
  /** Fase atual */
  phase: string;
  /** Percentual de conclusão (0-100) */
  percent: number;
  /** Mensagem de status */
  message: string;
}) => void;