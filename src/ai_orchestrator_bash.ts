// ai_orchestrator_bash.ts
// Sistema de Orquestração com ferramenta Bash nativa

import chalk from 'chalk';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Type definitions
interface BashSessionConfig {
  timeout?: number;
  maxOutputSize?: number;
  workingDir?: string;
  env?: NodeJS.ProcessEnv;
}

interface BashExecutionResult {
  stdout: string;
  stderr: string;
  combined: string;
  truncated?: boolean;
}

interface CommandValidation {
  valid: boolean;
  reason?: string;
}

interface ExecutionContext {
  originalQuestion: string;
  systemContext: SystemContext;
  executedCommands: string[];
  results: CommandResult[];
  finalAnswer: string | null;
  metadata: {
    iterations: number;
    toolCalls: number;
  };
}

interface CommandResult {
  command: string;
  output: string;
  truncated?: boolean;
}

interface SystemContext {
  os?: string;
  distro?: string;
  history?: Message[];
  [key: string]: unknown;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ToolResult[];
}

interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface TextBlock {
  type: 'text';
  text: string;
}

type ContentBlock = ToolUseBlock | TextBlock | ToolResult;

interface AIResponse {
  stop_reason: string;
  content: ContentBlock[];
}

interface Tool {
  name: string;
  type?: string;
  description?: string;
  input_schema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface AIModel {
  modelName?: string;
  getModelName?: () => string;
  supportsTools?: () => boolean;
  askWithTools: (params: {
    system: string;
    messages: Message[];
    tools: Tool[];
    tool_choice: { type: string };
    signal?: AbortSignal;
  }) => Promise<AIResponse>;
}

interface OrchestratorConfig {
  maxIterations?: number;
  maxExecutionTime?: number;
  verboseLogging?: boolean;
  enableBash?: boolean;
  bashConfig?: BashSessionConfig;
}

interface OrchestratorOptions {
  tool_choice?: { type: string };
  signal?: AbortSignal;
}

interface OrchestratorResult {
  success: boolean;
  question?: string;
  directAnswer?: string | null;
  executedCommands?: string[];
  results?: CommandResult[];
  iterations?: number;
  toolCalls?: number;
  duration?: number;
  error?: string;
}

// Classe para gerenciar sessão bash persistente
class BashSession extends EventEmitter {
  private config: Required<BashSessionConfig>;
  private process: ChildProcessWithoutNullStreams | null;
  private outputBuffer: string;
  private errorBuffer: string;
  private commandQueue: unknown[];
  private currentCommand: unknown;
  private sessionId: number;

  constructor(config: BashSessionConfig = {}) {
    super();
    this.config = {
      timeout: config.timeout || 30000,
      maxOutputSize: config.maxOutputSize || 100000,
      workingDir: config.workingDir || process.cwd(),
      env: { ...process.env, ...config.env },
    };
    this.process = null;
    this.outputBuffer = '';
    this.errorBuffer = '';
    this.commandQueue = [];
    this.currentCommand = null;
    this.sessionId = Date.now();
  }

  async start(): Promise<boolean> {
    if (this.process) {
      await this.stop();
    }

    this.process = spawn('/bin/bash', [], {
      cwd: this.config.workingDir,
      env: this.config.env,
      shell: false,
    });

    this.process.stdout.on('data', (data: Buffer) => {
      this.outputBuffer += data.toString();
      this.emit('output', data.toString());
    });

    this.process.stderr.on('data', (data: Buffer) => {
      this.errorBuffer += data.toString();
      this.emit('error', data.toString());
    });

    this.process.on('close', (code: number | null) => {
      this.emit('close', code);
      this.process = null;
    });

    // Aguardar inicialização
    await new Promise<void>(resolve => setTimeout(resolve, 100));

    // Configurar PS1 para marcador único
    await this.executeInternal(`export PS1='\\n###PROMPT###\\n'`);

    return true;
  }

  async executeInternal(command: string): Promise<BashExecutionResult> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('Sessão bash não iniciada'));
        return;
      }

      const marker = `###END_${Date.now()}###`;
      const fullCommand = `${command}; echo "${marker}"; echo "${marker}" >&2`;

      this.outputBuffer = '';
      this.errorBuffer = '';

      // Timeout
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Comando expirou após ${this.config.timeout / 1000} segundos`,
          ),
        );
      }, this.config.timeout);

      // Listeners para capturar saída
      const checkComplete = (): void => {
        if (
          this.outputBuffer.includes(marker) &&
          this.errorBuffer.includes(marker)
        ) {
          clearTimeout(timeout);

          // Remover marcadores
          const output = this.outputBuffer.split(marker)[0];
          const error = this.errorBuffer.split(marker)[0];

          // Limpar buffers
          this.outputBuffer = '';
          this.errorBuffer = '';

          resolve({
            stdout: output.trim(),
            stderr: error.trim(),
            combined: (output + error).trim(),
          });
        }
      };

      this.on('output', checkComplete);
      this.on('error', checkComplete);

      // Enviar comando
      this.process.stdin.write(fullCommand + '\n');
    });
  }

  async execute(command: string): Promise<BashExecutionResult> {
    // Validação de segurança
    const validation = this.validateCommand(command);
    if (!validation.valid) {
      throw new Error(`Comando bloqueado: ${validation.reason}`);
    }

    // Executar comando
    const result = await this.executeInternal(command);

    // Truncar saída se necessário
    if (result.combined.length > this.config.maxOutputSize) {
      const truncated = result.combined.substring(0, this.config.maxOutputSize);
      result.combined = truncated + '\n\n... [Saída truncada]';
      result.truncated = true;
    }

    return result;
  }

  validateCommand(command: string): CommandValidation {
    // Padrões perigosos
    const dangerousPatterns = [
      /rm\s+-rf\s+\/(?:\s|$)/, // rm -rf /
      /:(){:|:&};:/, // Fork bomb
      /mkfs/, // Formatar disco
      /dd.*of=\/dev\/[sh]d/, // Escrever direto no disco
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          valid: false,
          reason: `Padrão perigoso detectado: ${pattern}`,
        };
      }
    }

    return { valid: true };
  }

  async restart(): Promise<boolean> {
    await this.stop();
    await this.start();
    return true;
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      if (this.process) {
        this.process.kill('SIGKILL');
      }
      this.process = null;
    }
  }

  sanitizeOutput(output: string): string {
    // Remover possíveis credenciais
    output = output.replace(
      /(?:password|token|key|secret)[\s=:]+\S+/gi,
      '[REDACTED]',
    );
    output = output.replace(
      /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g,
      'Bearer [REDACTED]',
    );
    return output;
  }
}

export default class AICommandOrchestratorBash {
  private ai: AIModel;
  private config: Required<OrchestratorConfig>;
  private bashSession: BashSession | null;
  private startTime: number | null;

  constructor(aiModel: AIModel, config: OrchestratorConfig = {}) {
    this.ai = aiModel;
    this.config = {
      maxIterations: config.maxIterations || 10,
      maxExecutionTime: config.maxExecutionTime || 60000,
      verboseLogging: config.verboseLogging || false,
      enableBash: config.enableBash !== false,
      bashConfig: config.bashConfig || {},
    };
    this.bashSession = null;
    this.startTime = null;
  }

  // Define ferramenta bash seguindo formato da documentação
  getBashTool(): Tool {
    // Para modelos Haiku e outros que não suportam ferramentas nativas,
    // retornamos uma ferramenta customizada com schema completo
    const modelName = this.ai?.modelName || this.ai?.getModelName?.() || '';
    const isHaikuOrOlder = modelName.includes('haiku') ||
                           modelName.includes('claude-3-') ||
                           !modelName.includes('claude-4') && !modelName.includes('sonnet-3.7');

    if (isHaikuOrOlder) {
      // Ferramenta customizada para Haiku e modelos antigos
      return {
        name: 'bash',
        description: 'Execute a bash command and return its output',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The bash command to execute'
            }
          },
          required: ['command']
        }
      };
    }

    // Para Claude 4 e Sonnet 3.7, usar ferramenta nativa (sem type por enquanto)
    return {
      name: 'bash',
    };
  }

  // Outras ferramentas específicas ainda disponíveis
  getAdditionalTools(): Tool[] {
    return [
      {
        type: 'custom',
        name: 'list_fail2ban_jails',
        description:
          'Lista todas as jails ativas do fail2ban. Retorna um array com os nomes das jails.',
        input_schema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        type: 'custom',
        name: 'get_jail_status',
        description:
          'Obtém o status detalhado de uma jail específica do fail2ban, incluindo IPs banidos.',
        input_schema: {
          type: 'object',
          properties: {
            jail_name: {
              type: 'string',
              description: 'Nome da jail a consultar',
            },
          },
          required: ['jail_name'],
        },
      },
    ];
  }

  async orchestrateExecution(
    question: string,
    context: SystemContext,
    options: OrchestratorOptions = {}
  ): Promise<OrchestratorResult> {
    // Garantir que options sempre existe para evitar erros
    options = options || {};
    this.startTime = Date.now();

    // Iniciar sessão bash se habilitada
    if (this.config.enableBash) {
      this.bashSession = new BashSession(this.config.bashConfig);
      await this.bashSession.start();
    }

    const executionContext: ExecutionContext = {
      originalQuestion: question,
      systemContext: context,
      executedCommands: [],
      results: [],
      finalAnswer: null,
      metadata: { iterations: 0, toolCalls: 0 },
    };

    try {
      const systemPrompt = `Você é um assistente Linux especializado em administração de sistemas.
Você tem acesso a uma ferramenta bash com sessão persistente que mantém estado entre comandos.

IMPORTANTE - HISTÓRICO E MENSAGENS CANCELADAS:
- Você tem acesso ao HISTÓRICO COMPLETO da conversa
- Mensagens marcadas com "[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]" indicam que o usuário cancelou o processamento, mas A MENSAGEM DO USUÁRIO AINDA EXISTE E DEVE SER CONSIDERADA
- Quando o usuário perguntar "o que eu escrevi antes?" ou "qual foi minha pergunta anterior?", você DEVE mencionar TODAS as mensagens anteriores, incluindo as que foram canceladas
- Trate mensagens canceladas como parte normal do histórico - elas foram escritas pelo usuário e devem ser reconhecidas

INSTRUÇÕES IMPORTANTES:
1. Use a ferramenta bash para executar comandos do sistema
2. A sessão mantém variáveis, diretório atual e arquivos entre comandos
3. Você pode encadear comandos com && ou ;
4. Use pipes, redirecionamentos e scripts conforme necessário
5. Para tarefas específicas de fail2ban, use as ferramentas otimizadas quando disponíveis
6. Considere todo o histórico da conversa ao responder, incluindo mensagens canceladas

<use_parallel_tool_calls>
Sempre que possível, execute operações independentes em paralelo.
Por exemplo, ao verificar múltiplos serviços ou coletar várias informações do sistema.
</use_parallel_tool_calls>

Sistema: ${context.os || 'Linux'} ${context.distro || ''}`;

      // Combinar ferramentas
      const allTools = [this.getBashTool(), ...this.getAdditionalTools()];

      if (this.ai.supportsTools && this.ai.supportsTools()) {
        return await this.executeWithTools(
          executionContext,
          systemPrompt,
          question,
          allTools,
          options.tool_choice,
          options,
        );
      } else {
        return {
          success: false,
          error: 'Modelo não suporta tools nativas',
        };
      }
    } catch (error) {
      console.error(chalk.red('Erro na orquestração:'), error.message);
      return {
        success: false,
        error: error.message,
        executedCommands: executionContext.executedCommands,
      };
    } finally {
      // Limpar sessão bash
      if (this.bashSession) {
        await this.bashSession.stop();
      }
    }
  }

  async executeWithTools(
    context: ExecutionContext,
    systemPrompt: string,
    question: string,
    tools: Tool[],
    toolChoice: { type: string } | null = null,
    options: OrchestratorOptions = {},
  ): Promise<OrchestratorResult> {
    // Start with history from context if available, otherwise empty array
    // The history is nested inside systemContext when coming from orchestrateExecution
    const messages: Message[] =
      context.systemContext?.history &&
      Array.isArray(context.systemContext.history)
        ? [...context.systemContext.history] // Use existing history from systemContext
        : [];

    // Add current question as the latest user message
    messages.push({
      role: 'user',
      content: question,
    });

    let continueProcessing = true;
    let iterations = 0;

    while (continueProcessing && iterations < this.config.maxIterations) {
      iterations++;
      context.metadata.iterations = iterations;

      if (Date.now() - this.startTime > this.config.maxExecutionTime) {
        console.log(chalk.yellow('\n⚠️ Tempo limite excedido'));
        break;
      }

      const response = await this.ai.askWithTools({
        system: systemPrompt,
        messages: messages,
        tools: tools,
        tool_choice: toolChoice || { type: 'auto' },
        signal: options ? options.signal : undefined,
      });

      if (this.config.verboseLogging) {
        console.log(chalk.blue(`\n🔄 Iteração ${iterations}`));
        console.log(chalk.gray(`   Stop reason: ${response.stop_reason}`));
      }

      if (response.stop_reason === 'tool_use') {
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.content as unknown as string,
        };
        messages.push(assistantMessage);

        const toolResults: ToolResult[] = [];
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            context.metadata.toolCalls++;

            const result = await this.executeTool(
              (block as ToolUseBlock).name,
              (block as ToolUseBlock).input,
              context,
            );

            toolResults.push({
              type: 'tool_result',
              tool_use_id: (block as ToolUseBlock).id,
              content:
                typeof result === 'string' ? result : JSON.stringify(result),
              is_error: (result as { error?: unknown }).error ? true : false,
            });
          }
        }

        if (toolResults.length > 0) {
          messages.push({
            role: 'user',
            content: toolResults,
          });
        }
      } else {
        const textBlocks = response.content.filter(
          (block): block is TextBlock => block.type === 'text',
        );
        context.finalAnswer = textBlocks.map(block => block.text).join('\n');

        // Add the assistant's response to messages for history continuity
        messages.push({
          role: 'assistant',
          content: context.finalAnswer,
        });

        continueProcessing = false;
      }
    }

    return this.formatResults(context);
  }

  async executeTool(
    toolName: string,
    toolInput: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<string | Record<string, unknown>> {
    try {
      if (toolName === 'bash') {
        // Ferramenta bash principal
        if (toolInput.restart) {
          await this.bashSession!.restart();
          return 'Sessão bash reiniciada com sucesso';
        }

        const command = toolInput.command as string;
        if (!command) {
          return { error: 'Comando não fornecido' };
        }

        if (this.config.verboseLogging) {
          console.log(chalk.blue(`\n🔧 Bash: ${command}`));
        }

        context.executedCommands.push(command);

        const result = await this.bashSession!.execute(command);

        // Sanitizar saída
        const sanitized = this.bashSession!.sanitizeOutput(result.combined);

        if (this.config.verboseLogging && sanitized) {
          console.log(chalk.gray(sanitized.substring(0, 200) + '...'));
        }

        context.results.push({
          command,
          output: sanitized,
          truncated: result.truncated,
        });

        return sanitized || 'Comando executado sem saída';
      } else if (toolName === 'list_fail2ban_jails') {
        // Ferramenta otimizada específica
        const result = await this.bashSession!.execute(
          'sudo fail2ban-client status',
        );
        const jailMatch = result.combined.match(/Jail list:\s*([^\n]+)/i);
        const jails = jailMatch
          ? jailMatch[1]
              .trim()
              .split(/[,\s]+/)
              .filter((j: string) => j)
          : [];

        return {
          success: true,
          jails: jails,
          count: jails.length,
        };
      } else if (toolName === 'get_jail_status') {
        const result = await this.bashSession!.execute(
          `sudo fail2ban-client status ${toolInput.jail_name as string}`,
        );
        const ips = result.combined.match(/\d+\.\d+\.\d+\.\d+/g) || [];

        return {
          success: true,
          jail_name: toolInput.jail_name,
          banned_ips: ips,
          count: ips.length,
        };
      } else {
        return { error: `Ferramenta desconhecida: ${toolName}` };
      }
    } catch (error) {
      return {
        error: error.message,
        success: false,
      };
    }
  }

  formatResults(context: ExecutionContext): OrchestratorResult {
    const duration = Date.now() - this.startTime!;

    return {
      success: !!context.finalAnswer,
      question: context.originalQuestion,
      directAnswer: context.finalAnswer,
      executedCommands: context.executedCommands,
      results: context.results,
      iterations: context.metadata.iterations,
      toolCalls: context.metadata.toolCalls,
      duration,
    };
  }
}
