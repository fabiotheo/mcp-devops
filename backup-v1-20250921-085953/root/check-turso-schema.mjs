import TursoHistoryClient from './libs/turso-client.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

async function checkSchema() {
    try {
        const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

        const client = new TursoHistoryClient(config);
        await client.initialize();

        // Verificar se as colunas existem
        const result = await client.client.execute('PRAGMA table_info(history_user)');
        console.log('Colunas na tabela history_user:');
        console.log('==================================');

        const requiredColumns = ['status', 'request_id', 'updated_at', 'completed_at'];
        const existingColumns = result.rows.map(col => col.name);

        requiredColumns.forEach(colName => {
            if (existingColumns.includes(colName)) {
                const col = result.rows.find(r => r.name === colName);
                console.log('✅', colName, '- tipo:', col.type || 'TEXT');
            } else {
                console.log('❌', colName, '- FALTANDO');
            }
        });

        // Verificar distribuição de status
        console.log('\nDistribuição de status:');
        console.log('=======================');

        try {
            const statusCount = await client.client.execute(`
                SELECT COUNT(*) as total, status
                FROM history_user
                WHERE timestamp > strftime('%s', 'now') * 1000 - 86400000
                GROUP BY status
            `);

            if (statusCount.rows.length > 0) {
                statusCount.rows.forEach(row => {
                    console.log('-', row.status || 'NULL', ':', row.total, 'registros (últimas 24h)');
                });
            } else {
                console.log('- Nenhum registro nas últimas 24h');
            }
        } catch (err) {
            console.log('- Coluna status não existe ainda ou erro na query');
        }

        // Verificar total
        const total = await client.client.execute('SELECT COUNT(*) as total FROM history_user');
        console.log('\nTotal de registros:', total.rows[0].total);

        // Verificar índices
        console.log('\nÍndices existentes:');
        console.log('==================');
        const indices = await client.client.execute(`
            SELECT name, sql FROM sqlite_master
            WHERE type = 'index' AND tbl_name = 'history_user'
        `);

        indices.rows.forEach(idx => {
            if (idx.name.includes('status') || idx.name.includes('request')) {
                console.log('✅', idx.name);
            }
        });

        await client.close();
        console.log('\n✅ Verificação concluída');

    } catch (err) {
        console.error('❌ Erro:', err.message);
        console.error(err);
        process.exit(1);
    }
}

checkSchema();