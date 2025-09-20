import { createClient } from '@libsql/client';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

async function applyMigration() {
    try {
        const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

        console.log('Conectando ao Turso...');
        const client = createClient({
            url: config.turso_url,
            authToken: config.turso_token
        });

        // 1. Verificar colunas existentes
        console.log('\n1. Verificando colunas existentes...');
        const tableInfo = await client.execute('PRAGMA table_info(history_user)');
        const existingColumns = tableInfo.rows.map(col => col.name);
        console.log('Colunas atuais:', existingColumns);

        // 2. Adicionar colunas que faltam
        console.log('\n2. Adicionando colunas novas...');

        const columnsToAdd = [
            { name: 'status', sql: "ALTER TABLE history_user ADD COLUMN status TEXT DEFAULT 'pending'" },
            { name: 'request_id', sql: "ALTER TABLE history_user ADD COLUMN request_id TEXT" },
            { name: 'updated_at', sql: "ALTER TABLE history_user ADD COLUMN updated_at INTEGER" },
            { name: 'completed_at', sql: "ALTER TABLE history_user ADD COLUMN completed_at INTEGER" }
        ];

        for (const column of columnsToAdd) {
            if (!existingColumns.includes(column.name)) {
                try {
                    await client.execute(column.sql);
                    console.log(`✅ Coluna '${column.name}' adicionada`);
                } catch (err) {
                    console.log(`⚠️  Erro ao adicionar coluna '${column.name}':`, err.message);
                }
            } else {
                console.log(`✓ Coluna '${column.name}' já existe`);
            }
        }

        // 3. Criar índices
        console.log('\n3. Criando índices...');
        const indices = [
            {
                name: 'idx_history_user_status',
                sql: 'CREATE INDEX IF NOT EXISTS idx_history_user_status ON history_user(status, timestamp DESC)'
            },
            {
                name: 'idx_history_user_request',
                sql: 'CREATE INDEX IF NOT EXISTS idx_history_user_request ON history_user(request_id)'
            }
        ];

        for (const index of indices) {
            try {
                await client.execute(index.sql);
                console.log(`✅ Índice '${index.name}' criado/verificado`);
            } catch (err) {
                console.log(`⚠️  Erro ao criar índice '${index.name}':`, err.message);
            }
        }

        // 4. Migrar dados existentes (com cuidado)
        console.log('\n4. Migrando dados existentes...');
        const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;

        try {
            const updateResult = await client.execute({
                sql: `UPDATE history_user
                      SET status = CASE
                          WHEN response IS NULL OR response = '' THEN 'cancelled'
                          WHEN response = '[Cancelled by user]' THEN 'cancelled'
                          ELSE 'completed'
                      END
                      WHERE status IS NULL
                        AND timestamp < ?`,
                args: [oneHourAgo * 1000] // timestamp está em milliseconds
            });
            console.log(`✅ ${updateResult.rowsAffected} registros migrados`);
        } catch (err) {
            console.log('⚠️  Erro na migração de dados:', err.message);
        }

        // 5. Aplicar nas outras tabelas também
        console.log('\n5. Aplicando nas outras tabelas...');
        const otherTables = ['history_global', 'history_machine'];

        for (const table of otherTables) {
            console.log(`\nTabela: ${table}`);
            try {
                // Verificar se a tabela existe
                const tableExists = await client.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`);

                if (tableExists.rows.length > 0) {
                    for (const column of columnsToAdd) {
                        try {
                            const sql = column.sql.replace('history_user', table);
                            await client.execute(sql);
                            console.log(`  ✅ Coluna '${column.name}' adicionada`);
                        } catch (err) {
                            if (err.message.includes('duplicate column')) {
                                console.log(`  ✓ Coluna '${column.name}' já existe`);
                            } else {
                                console.log(`  ⚠️ Erro: ${err.message}`);
                            }
                        }
                    }
                } else {
                    console.log(`  ⚠️ Tabela não existe`);
                }
            } catch (err) {
                console.log(`  ❌ Erro ao processar tabela:`, err.message);
            }
        }

        // 6. Verificar resultado final
        console.log('\n6. Verificação final...');
        const finalCheck = await client.execute('PRAGMA table_info(history_user)');
        const finalColumns = finalCheck.rows.map(col => col.name);

        const requiredColumns = ['status', 'request_id', 'updated_at', 'completed_at'];
        const allColumnsPresent = requiredColumns.every(col => finalColumns.includes(col));

        if (allColumnsPresent) {
            console.log('✅ SUCESSO! Todas as colunas foram adicionadas.');
            console.log('Colunas finais:', finalColumns);
        } else {
            console.log('⚠️  Algumas colunas podem estar faltando.');
            console.log('Colunas finais:', finalColumns);
        }

        await client.close();

    } catch (err) {
        console.error('❌ Erro geral:', err.message);
        console.error(err);
        process.exit(1);
    }
}

console.log('=================================');
console.log('  Migração do Turso - Fase 4');
console.log('=================================');

applyMigration();