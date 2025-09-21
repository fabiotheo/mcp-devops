#!/usr/bin/env node

import SyncManager from './libs/sync-manager.js';
import TursoHistoryClient from './libs/turso-client.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

async function forceSyncNow() {
    console.log(chalk.cyan.bold('\n🔄 FORÇANDO SINCRONIZAÇÃO IMEDIATA\n'));

    try {
        // Carregar config
        const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');
        const tursoConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));

        // Inicializar
        const tursoClient = new TursoHistoryClient(tursoConfig);
        await tursoClient.initialize();

        const syncManager = new SyncManager({
            debug: true,
            syncInterval: 0 // Desabilitar sync automático
        });
        await syncManager.initialize(tursoClient);

        // Forçar sync
        console.log(chalk.yellow('⏳ Sincronizando...'));
        const result = await syncManager.forceSync();

        if (result.success) {
            console.log(chalk.green.bold('\n✅ SINCRONIZAÇÃO COMPLETA!'));
            console.log(chalk.white(`   📤 Enviados: ${result.uploaded}`));
            console.log(chalk.white(`   📥 Recebidos: ${result.downloaded}`));
            console.log(chalk.white(`   ⚠️  Conflitos: ${result.conflicts}`));

            // Estatísticas finais
            const stats = syncManager.getStats();
            console.log(chalk.cyan.bold('\n📊 ESTATÍSTICAS TOTAIS'));
            console.log(chalk.gray(`   Total uploaded: ${stats.uploaded}`));
            console.log(chalk.gray(`   Total downloaded: ${stats.downloaded}`));
            console.log(chalk.gray(`   Cache: ${stats.cache.synced}/${stats.cache.total} sincronizados`));
            console.log(chalk.gray(`   Pendentes: ${stats.cache.pending}`));
        } else {
            console.log(chalk.red(`\n❌ Sincronização falhou: ${result.error || result.reason}`));
        }

        // Cleanup
        syncManager.close();
        await tursoClient.close();

    } catch (error) {
        console.error(chalk.red('\n❌ Erro:'), error.message);
    }
}

forceSyncNow().catch(console.error);