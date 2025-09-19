#!/usr/bin/env node

import LocalCache from './src/libs/local-cache.js';
import chalk from 'chalk';

async function quickPerformanceTest() {
    console.log(chalk.cyan.bold('\n⚡ Teste Rápido de Performance\n'));

    const cache = new LocalCache({ debug: false });
    await cache.initialize();

    // Teste de escrita
    console.log(chalk.blue('📝 Testando 100 escritas...'));
    const writeStart = Date.now();

    for (let i = 0; i < 100; i++) {
        await cache.saveCommand(
            `test-command-${i}`,
            `test-response-${i}`,
            { status: 'completed' }
        );
    }

    const writeTime = Date.now() - writeStart;
    console.log(chalk.green(`✅ 100 escritas em ${writeTime}ms (${(writeTime/100).toFixed(1)}ms/comando)`));

    // Teste de leitura
    console.log(chalk.blue('\n📖 Testando leitura...'));
    const readStart = Date.now();
    const history = cache.getHistory({ limit: 50 });
    const readTime = Date.now() - readStart;
    console.log(chalk.green(`✅ Leitura de ${history.length} itens em ${readTime}ms`));

    // Estatísticas
    const stats = cache.getStats();
    console.log(chalk.cyan('\n📊 Estatísticas:'));
    console.log(`   Total: ${stats.total} comandos`);
    console.log(`   Sincronizados: ${stats.synced}`);
    console.log(`   Pendentes: ${stats.pending}`);
    console.log(`   Fila: ${stats.queue_size} itens`);

    cache.close();
}

quickPerformanceTest().catch(console.error);
