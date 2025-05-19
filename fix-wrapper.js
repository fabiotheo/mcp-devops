#!/usr/bin/env node

// Wrapper simples para garantir que a saída do mcp-assistant.js seja exibida corretamente
import { spawn } from 'child_process';
import { join } from 'path';

const args = process.argv.slice(2);
const mcpAssistantPath = join(process.env.HOME, '.mcp-terminal/mcp-assistant.js');

// Passa todos os argumentos para o script original
const child = spawn('node', [mcpAssistantPath, ...args], {
  stdio: 'inherit'  // Importante: herda stdio para garantir que tudo seja exibido
});

// Espera a conclusão do processo
child.on('exit', (code) => {
  process.exit(code);
});