#!/usr/bin/env node

/**
 * Test script to verify Turso history for user "fabio"
 */

import { spawn } from 'child_process';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('=== Teste do Turso com usuário "fabio" ===\n');
console.log('Este teste vai:');
console.log('1. Executar a interface com MCP_USER=fabio');
console.log('2. Enviar um comando de teste');
console.log('3. Verificar se foi salvo no Turso\n');

// Function to run the interface with a test command
async function testTursoWithUser() {
    return new Promise((resolve, reject) => {
        console.log('Iniciando interface com usuário fabio...\n');

        // Set environment variable and run the interface
        const env = { ...process.env, MCP_USER: 'fabio' };
        const child = spawn('node', ['interface-v2/mcp-ink-cli.mjs'], {
            env,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        // Capture output
        child.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            process.stdout.write(text);

            // When we see the ready prompt, send our test command
            if (text.includes('ready') || text.includes('❯')) {
                setTimeout(() => {
                    const testCommand = `echo "Teste Turso ${new Date().toISOString()}"`;
                    console.log(`\nEnviando comando de teste: ${testCommand}`);
                    child.stdin.write(testCommand + '\n');

                    // Give it time to process and save
                    setTimeout(() => {
                        console.log('\n\nSaindo da interface...');
                        child.stdin.write('\x03'); // Ctrl+C
                    }, 3000);
                }, 1000);
            }
        });

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('close', (code) => {
            console.log('\n=== Resultado do Teste ===\n');

            // Check if Turso was mentioned in the output
            if (output.includes('Turso connected for user: fabio')) {
                console.log('✅ Turso conectado com sucesso para usuário fabio');
            } else if (output.includes('Turso offline mode')) {
                console.log('⚠️ Turso em modo offline (verifique a configuração)');
            } else {
                console.log('❌ Turso não foi inicializado corretamente');
            }

            if (output.includes('[Turso] Saved command for user fabio')) {
                console.log('✅ Comando salvo no Turso com sucesso');
            }

            if (errorOutput) {
                console.log('\n⚠️ Erros encontrados:');
                console.log(errorOutput);
            }

            resolve(code);
        });
    });
}

// Run test for checking history
async function checkTursoHistory() {
    console.log('\n\n=== Verificando Histórico no Turso ===\n');

    return new Promise((resolve) => {
        const child = spawn('node', ['-e', `
            import TursoHistoryClient from './libs/turso-client.js';
            import fs from 'fs/promises';
            import path from 'path';
            import os from 'os';

            const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');

            try {
                const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
                const client = new TursoHistoryClient({ ...config, userId: 'fabio' });

                await client.connect();

                if (client.isConnected()) {
                    console.log('✅ Conectado ao Turso');

                    const history = await client.getHistory(5);
                    console.log('\\nÚltimos 5 comandos do usuário fabio:');
                    history.forEach((h, i) => {
                        console.log(\`\${i+1}. [\${new Date(h.timestamp).toLocaleString()}] \${h.command}\`);
                    });
                } else {
                    console.log('❌ Não foi possível conectar ao Turso');
                }

                await client.close();
            } catch (err) {
                console.log('⚠️ Turso não configurado ou erro:', err.message);
            }
        `]);

        child.stdout.on('data', (data) => {
            process.stdout.write(data);
        });

        child.stderr.on('data', (data) => {
            process.stderr.write(data);
        });

        child.on('close', resolve);
    });
}

// Main execution
async function main() {
    try {
        // First test the interface
        await testTursoWithUser();

        // Then check the history
        await checkTursoHistory();

        console.log('\n=== Teste Concluído ===\n');
        console.log('Para testar manualmente, execute:');
        console.log('MCP_USER=fabio node interface-v2/mcp-ink-cli.mjs\n');

    } catch (error) {
        console.error('Erro durante o teste:', error);
    } finally {
        rl.close();
        process.exit(0);
    }
}

// Ask user if they want to proceed
rl.question('Deseja executar o teste? (s/n): ', (answer) => {
    if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim') {
        main();
    } else {
        console.log('Teste cancelado.');
        rl.close();
    }
});