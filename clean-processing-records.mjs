import { createClient } from '@libsql/client';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

async function cleanProcessingRecords() {
    console.log('=====================================');
    console.log('  Limpando Registros com Processing');
    console.log('=====================================\n');

    try {
        const configPath = path.join(os.homedir(), '.mcp-terminal', 'turso-config.json');
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

        const client = createClient({
            url: config.turso_url,
            authToken: config.turso_token
        });

        // Buscar registros com status 'processing'
        const processingRecords = await client.execute(`
            SELECT id, command, status, request_id,
                   datetime(timestamp/1000, 'unixepoch', 'localtime') as created_at
            FROM history_user
            WHERE status = 'processing'
            ORDER BY timestamp DESC
        `);

        console.log(`Encontrados ${processingRecords.rows.length} registros com status 'processing'\n`);

        if (processingRecords.rows.length > 0) {
            console.log('Registros a serem corrigidos:');
            processingRecords.rows.forEach((row, i) => {
                console.log(`${i+1}. ${row.command?.substring(0, 40)}...`);
                console.log(`   ID: ${row.id}`);
                console.log(`   Criado: ${row.created_at}`);
            });

            console.log('\nAtualizando para status "cancelled"...');

            // Atualizar todos para cancelled
            const updateResult = await client.execute({
                sql: `UPDATE history_user
                      SET status = 'cancelled',
                          response = '[Cancelled - cleanup]',
                          updated_at = ?
                      WHERE status = 'processing'`,
                args: [Math.floor(Date.now() / 1000)]
            });

            console.log(`✅ ${updateResult.rowsAffected} registros atualizados para 'cancelled'\n`);
        }

        // Verificar resultado
        const finalCheck = await client.execute(`
            SELECT status, COUNT(*) as count
            FROM history_user
            GROUP BY status
            ORDER BY count DESC
        `);

        console.log('Distribuição final de status:');
        finalCheck.rows.forEach(row => {
            const emoji = row.status === 'completed' ? '✅' :
                         row.status === 'cancelled' ? '🟡' :
                         row.status === 'processing' ? '❌' : '⚪';
            console.log(`${emoji} ${row.status}: ${row.count} registros`);
        });

        await client.close();

    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

cleanProcessingRecords();