#!/usr/bin/env node

/**
 * Script to check Turso history for a specific user
 */

import TursoHistoryClient from './libs/turso-client.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const user = process.argv[2] || 'fabio';
const limit = parseInt(process.argv[3]) || 10;

console.log(`\n=== Histórico do Turso para usuário: ${user} ===\n`);

async function checkHistory() {
    const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');

    try {
        // Check if config exists
        try {
            await fs.access(configPath);
        } catch {
            console.log('❌ Turso não está configurado');
            console.log('   Execute: node libs/turso-setup.js');
            return;
        }

        // Load config and create client
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        const client = new TursoHistoryClient({
            ...config,
            userId: user,
            debug: false
        });

        await client.initialize();

        if (client.isConnected()) {
            console.log('✅ Conectado ao Turso\n');

            const history = await client.getHistory(limit);

            if (history.length === 0) {
                console.log(`Nenhum comando encontrado para o usuário ${user}`);
            } else {
                console.log(`Últimos ${history.length} comandos:\n`);
                console.log('─'.repeat(80));

                history.forEach((h, i) => {
                    const date = new Date(h.timestamp);
                    const timeStr = date.toLocaleString('pt-BR');

                    console.log(`${i + 1}. [${timeStr}]`);
                    console.log(`   Comando: ${h.command}`);

                    if (h.response) {
                        // Show first 100 chars of response
                        const responsePreview = h.response.substring(0, 100);
                        const dots = h.response.length > 100 ? '...' : '';
                        console.log(`   Resposta: ${responsePreview}${dots}`);
                    }

                    console.log('─'.repeat(80));
                });
            }

            await client.close();
            console.log('\n✅ Conexão fechada');

        } else {
            console.log('❌ Não foi possível conectar ao Turso');
            console.log('   Verifique sua configuração em:', configPath);
        }

    } catch (err) {
        console.error('❌ Erro ao verificar histórico:', err.message);
        if (err.stack) {
            console.error(err.stack);
        }
    }
}

// Run the check
checkHistory().then(() => {
    console.log('\n=== Fim da verificação ===\n');
    console.log('Uso: node check-turso-history.js [usuário] [limite]');
    console.log('Exemplo: node check-turso-history.js fabio 20\n');
});