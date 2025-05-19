#!/usr/bin/env node
// Script de compatibilidade para setup-auto.js
// Este script agora redireciona para setup.js com a flag --auto

import { spawn } from 'child_process';
import path from 'path';

console.log('⚠️ Aviso: setup-auto.js está obsoleto. Usando setup.js com a flag --auto.');
console.log('ℹ️ Por favor, atualize seus scripts para usar: node setup.js --auto');
console.log('');

// Obter argumentos da linha de comando
const args = process.argv.slice(2);

// Adicionar a flag --auto se não estiver presente
if (!args.includes('--auto')) {
  args.push('--auto');
}

// Caminho para setup.js
const setupPath = path.join(process.cwd(), 'setup.js');

// Executar setup.js com os argumentos apropriados
const setupProcess = spawn('node', [setupPath, ...args], {
  stdio: 'inherit'
});

// Lidar com o código de saída
setupProcess.on('close', (code) => {
  process.exit(code);
});
