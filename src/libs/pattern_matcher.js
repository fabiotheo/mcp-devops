// libs/pattern_matcher.js
// Sistema de Reconhecimento de Padrões para Comandos Comuns

export default class PatternMatcher {
  constructor() {
    this.patterns = this.loadPatterns();
  }

  loadPatterns() {
    return {
      fail2ban: {
        matcher: /fail2ban|bloqueado|blocked|banido|jail/i,
        intent: 'analyze_fail2ban',
        sequence: [
          {
            id: 'list_jails',
            command: 'fail2ban-client status',
            extract: 'jailList',
            parseOutput: output => {
              const match = output.match(/Jail list:\s*([^\n]+)/i);
              if (match) {
                return match[1]
                  .trim()
                  .split(/[,\s]+/)
                  .filter(j => j);
              }
              return [];
            },
          },
          {
            id: 'check_each_jail',
            command: context => {
              const jails = context.extracted?.jailList || [];
              return jails.map(jail => `fail2ban-client status ${jail}`);
            },
            extract: 'bannedIPs',
            aggregate: true,
            parseOutput: (output, command) => {
              const jailName = command.match(/status\s+(\S+)$/)?.[1];
              const ips = output.match(/\d+\.\d+\.\d+\.\d+/g) || [];
              const totalMatch = output.match(/Total banned:\s*(\d+)/i);
              return {
                jail: jailName,
                ips: ips,
                count: totalMatch ? parseInt(totalMatch[1]) : ips.length,
              };
            },
          },
        ],
        aggregator: data => {
          const details = data.bannedIPs || [];
          const total = details.reduce((sum, jail) => sum + jail.count, 0);
          const allIPs = details.flatMap(jail => jail.ips);
          return {
            totalBanned: total,
            jailDetails: details,
            allIPs: [...new Set(allIPs)],
          };
        },
      },

      diskUsage: {
        matcher: /disco|espaço|space|disk|armazenamento|storage/i,
        intent: 'analyze_disk_usage',
        sequence: [
          {
            id: 'overview',
            command: 'df -h',
            extract: 'filesystems',
            parseOutput: output => {
              const lines = output.split('\n');
              const filesystems = [];
              for (const line of lines) {
                const match = line.match(
                  /(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+%)\s+(.*)/,
                );
                if (match && !line.includes('Filesystem')) {
                  filesystems.push({
                    filesystem: match[1],
                    size: match[2],
                    used: match[3],
                    available: match[4],
                    usePercent: match[5],
                    mountPoint: match[6],
                  });
                }
              }
              return filesystems;
            },
          },
          {
            id: 'large_dirs',
            command: context => {
              const fs = context.extracted?.filesystems || [];
              // Se algum filesystem está > 80% usado, investiga
              const critical = fs.find(f => parseInt(f.usePercent) > 80);
              if (critical) {
                return ['du -sh /* 2>/dev/null | sort -rh | head -10'];
              }
              return [];
            },
            extract: 'largeDirectories',
            parseOutput: output => {
              const lines = output.split('\n');
              const dirs = [];
              for (const line of lines) {
                const match = line.match(/(\S+)\s+(.+)/);
                if (match) {
                  dirs.push({
                    size: match[1],
                    path: match[2],
                  });
                }
              }
              return dirs;
            },
          },
        ],
      },

      docker: {
        matcher: /docker|container|contêiner|imagem/i,
        intent: 'analyze_docker',
        sequence: [
          {
            id: 'list_containers',
            command: 'docker ps',
            extract: 'runningContainers',
            parseOutput: output => {
              const lines = output.split('\n').slice(1); // Skip header
              return lines
                .filter(l => l.trim())
                .map(line => {
                  const parts = line.split(/\s{2,}/);
                  return {
                    id: parts[0]?.substring(0, 12),
                    image: parts[1],
                    status: parts[4],
                    name: parts[6],
                  };
                });
            },
          },
          {
            id: 'docker_stats',
            command: 'docker stats --no-stream',
            extract: 'containerStats',
            optional: true,
            parseOutput: output => {
              const lines = output.split('\n').slice(1);
              return lines
                .filter(l => l.trim())
                .map(line => {
                  const parts = line.split(/\s+/);
                  return {
                    name: parts[0],
                    cpu: parts[1],
                    memory: parts[2],
                  };
                });
            },
          },
        ],
      },

      network: {
        matcher: /rede|network|ip|porta|port|conexão|connection/i,
        intent: 'analyze_network',
        sequence: [
          {
            id: 'interfaces',
            command: 'ip a',
            extract: 'interfaces',
            parseOutput: output => {
              const interfaces = [];
              const blocks = output.split(/^\d+:/m);
              for (const block of blocks) {
                const nameMatch = block.match(/^\s*(\S+):/);
                const ipMatch = block.match(/inet\s+(\d+\.\d+\.\d+\.\d+\/\d+)/);
                if (nameMatch && ipMatch) {
                  interfaces.push({
                    name: nameMatch[1],
                    ip: ipMatch[1],
                  });
                }
              }
              return interfaces;
            },
          },
          {
            id: 'connections',
            command: 'ss -tuln',
            extract: 'listeningPorts',
            parseOutput: output => {
              const lines = output.split('\n').slice(1);
              const ports = [];
              for (const line of lines) {
                const match = line.match(/:(\d+)\s/);
                if (match) {
                  ports.push(match[1]);
                }
              }
              return [...new Set(ports)].sort((a, b) => a - b);
            },
          },
        ],
      },

      systemd: {
        matcher: /serviço|service|systemd|systemctl|daemon/i,
        intent: 'analyze_services',
        sequence: [
          {
            id: 'failed_services',
            command: 'systemctl --failed',
            extract: 'failedServices',
            parseOutput: output => {
              const lines = output.split('\n');
              const failed = [];
              for (const line of lines) {
                if (line.includes('.service') && line.includes('failed')) {
                  const match = line.match(/●?\s*(\S+\.service)/);
                  if (match) {
                    failed.push(match[1]);
                  }
                }
              }
              return failed;
            },
          },
          {
            id: 'active_services',
            command: 'systemctl list-units --type=service --state=running',
            extract: 'runningServices',
            parseOutput: output => {
              const lines = output.split('\n');
              const services = [];
              for (const line of lines) {
                if (line.includes('.service') && line.includes('running')) {
                  const match = line.match(/●?\s*(\S+\.service)/);
                  if (match) {
                    services.push(match[1].replace('.service', ''));
                  }
                }
              }
              return services;
            },
          },
        ],
      },

      logs: {
        matcher: /log|erro|error|warning|falha|failed/i,
        intent: 'analyze_logs',
        sequence: [
          {
            id: 'recent_errors',
            command: 'journalctl -p err -n 20 --no-pager',
            extract: 'recentErrors',
            parseOutput: output => {
              const lines = output.split('\n');
              return lines.filter(l => l.trim()).slice(0, 10);
            },
          },
          {
            id: 'log_sizes',
            command: 'du -sh /var/log/* 2>/dev/null | sort -rh | head -5',
            extract: 'largestLogs',
            parseOutput: output => {
              const lines = output.split('\n');
              const logs = [];
              for (const line of lines) {
                const match = line.match(/(\S+)\s+(.+)/);
                if (match) {
                  logs.push({
                    size: match[1],
                    file: match[2],
                  });
                }
              }
              return logs;
            },
          },
        ],
      },

      process: {
        matcher: /processo|process|cpu|memória|memory|ram|top/i,
        intent: 'analyze_processes',
        sequence: [
          {
            id: 'top_cpu',
            command: 'ps aux --sort=-%cpu | head -10',
            extract: 'topCPU',
            parseOutput: output => {
              const lines = output.split('\n').slice(1);
              return lines
                .filter(l => l.trim())
                .map(line => {
                  const parts = line.split(/\s+/);
                  return {
                    user: parts[0],
                    pid: parts[1],
                    cpu: parts[2],
                    mem: parts[3],
                    command: parts.slice(10).join(' '),
                  };
                });
            },
          },
          {
            id: 'memory_usage',
            command: 'free -h',
            extract: 'memory',
            parseOutput: output => {
              const memLine = output
                .split('\n')
                .find(l => l.startsWith('Mem:'));
              if (memLine) {
                const parts = memLine.split(/\s+/);
                return {
                  total: parts[1],
                  used: parts[2],
                  free: parts[3],
                  available: parts[6],
                };
              }
              return null;
            },
          },
        ],
      },
    };
  }

  match(question) {
    for (const [key, pattern] of Object.entries(this.patterns)) {
      if (pattern.matcher.test(question)) {
        return {
          patternKey: key,
          pattern: pattern,
          executionPlan: this.buildExecutionPlan(pattern),
        };
      }
    }
    return null;
  }

  buildExecutionPlan(pattern) {
    return {
      intent: pattern.intent,
      steps: pattern.sequence.map(step => ({
        ...step,
        executed: false,
        result: null,
      })),
      aggregator: pattern.aggregator,
      context: {
        extracted: {},
      },
    };
  }

  getNextCommands(plan, context) {
    const commands = [];

    for (const step of plan.steps) {
      if (step.executed) continue;

      // Se o comando é uma função, executa com o contexto
      if (typeof step.command === 'function') {
        const dynamicCommands = step.command(context);
        if (Array.isArray(dynamicCommands)) {
          commands.push(...dynamicCommands);
        } else if (dynamicCommands) {
          commands.push(dynamicCommands);
        }
      } else {
        commands.push(step.command);
      }

      // Se não é opcional, para aqui e espera execução
      if (!step.optional) {
        break;
      }
    }

    return commands;
  }

  processStepOutput(step, output) {
    if (step.parseOutput) {
      return step.parseOutput(output, step.command);
    }
    return output;
  }

  updateContext(plan, stepId, output) {
    const step = plan.steps.find(s => s.id === stepId);
    if (!step) return;

    step.executed = true;
    step.result = output;

    if (step.extract && step.parseOutput) {
      const extracted = step.parseOutput(output, step.command);
      if (!plan.context.extracted) {
        plan.context.extracted = {};
      }

      if (step.aggregate && plan.context.extracted[step.extract]) {
        // Se é agregação, adiciona ao array existente
        if (!Array.isArray(plan.context.extracted[step.extract])) {
          plan.context.extracted[step.extract] = [
            plan.context.extracted[step.extract],
          ];
        }
        plan.context.extracted[step.extract].push(extracted);
      } else {
        plan.context.extracted[step.extract] = extracted;
      }
    }
  }

  isComplete(plan) {
    // Verifica se todos os passos obrigatórios foram executados
    return plan.steps.filter(s => !s.optional).every(s => s.executed);
  }

  aggregate(plan) {
    if (plan.aggregator && plan.context.extracted) {
      return plan.aggregator(plan.context.extracted);
    }
    return plan.context.extracted;
  }

  // Método para sugerir comandos baseado em padrões comuns
  suggestCommands(question, previousResults = []) {
    const matched = this.match(question);
    if (!matched) return [];

    const plan = matched.executionPlan;

    // Processa resultados anteriores para atualizar contexto
    for (const result of previousResults) {
      const step = plan.steps.find(
        s =>
          s.command === result.command ||
          (typeof s.command === 'function' && result.command.includes(s.id)),
      );
      if (step) {
        this.updateContext(plan, step.id, result.output);
      }
    }

    // Retorna próximos comandos
    return this.getNextCommands(plan, plan.context);
  }
}
