// setup-migration.ts - Sistema de migração e transição
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
/**
 * Gerenciador de migrações e transições do setup
 */
export class MigrationManager {
    config;
    verbose;
    constructor(config) {
        this.config = {
            mcpDir: path.join(os.homedir(), '.mcp-terminal'),
            homeDir: os.homedir(),
            verbose: false,
            ...config
        };
        this.verbose = this.config.verbose || false;
    }
    /**
     * Detecta a versão instalada do MCP Terminal
     */
    async detectInstalledVersion() {
        try {
            // Tentar ler arquivo de versão oficial
            const versionFile = path.join(this.config.mcpDir, '.version');
            const version = await fs.readFile(versionFile, 'utf8');
            this.log(`Versão detectada via .version: ${version.trim()}`);
            return version.trim();
        }
        catch {
            // Fallback: detectar versão legacy via package.json
            return await this.detectLegacyVersion();
        }
    }
    /**
     * Detecta versão legacy via diferentes métodos
     */
    async detectLegacyVersion() {
        const detectionMethods = [
            // Método 1: Verificar setup.js na instalação
            async () => {
                const setupPath = path.join(this.config.mcpDir, 'setup.js');
                try {
                    await fs.access(setupPath);
                    return this.extractVersionFromSetup(setupPath);
                }
                catch {
                    return null;
                }
            },
            // Método 2: Verificar package.json na instalação
            async () => {
                const packagePath = path.join(this.config.mcpDir, 'package.json');
                try {
                    const content = await fs.readFile(packagePath, 'utf8');
                    const pkg = JSON.parse(content);
                    return pkg.version || null;
                }
                catch {
                    return null;
                }
            },
            // Método 3: Verificar config.json para detectar instalação
            async () => {
                const configPath = path.join(this.config.mcpDir, 'config.json');
                try {
                    await fs.access(configPath);
                    return 'legacy-unknown'; // Instalação existe mas versão desconhecida
                }
                catch {
                    return null;
                }
            }
        ];
        for (const method of detectionMethods) {
            const version = await method();
            if (version) {
                this.log(`Versão legacy detectada: ${version}`);
                return version;
            }
        }
        this.log('Nenhuma instalação detectada');
        return null;
    }
    /**
     * Extrai versão do arquivo setup.js através de patterns
     */
    async extractVersionFromSetup(setupPath) {
        try {
            const content = await fs.readFile(setupPath, 'utf8');
            // Pattern 1: version: "1.2.3"
            const versionMatch1 = content.match(/version:\s*["']([^"']+)["']/);
            if (versionMatch1)
                return versionMatch1[1];
            // Pattern 2: VERSION = "1.2.3"
            const versionMatch2 = content.match(/VERSION\s*=\s*["']([^"']+)["']/);
            if (versionMatch2)
                return versionMatch2[1];
            // Pattern 3: "version": "1.2.3" em JSON
            const versionMatch3 = content.match(/"version":\s*"([^"]+)"/);
            if (versionMatch3)
                return versionMatch3[1];
            // Se não conseguir extrair, usar hash do arquivo como "versão"
            const hash = this.calculateFileHash(content);
            return `legacy-${hash.substring(0, 8)}`;
        }
        catch {
            return null;
        }
    }
    /**
     * Calcula hash simples de string para identificação
     */
    calculateFileHash(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16);
    }
    /**
     * Cria backup da instalação atual
     */
    async createBackup(customTag) {
        const currentVersion = await this.detectInstalledVersion() || 'unknown';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tag = customTag || `v${currentVersion}`;
        const backupDir = `${this.config.mcpDir}.backup-${tag}-${timestamp}`;
        this.log(`Criando backup em: ${backupDir}`);
        // Verificar se diretório MCP existe
        try {
            await fs.access(this.config.mcpDir);
        }
        catch {
            throw new Error(`Diretório MCP não encontrado: ${this.config.mcpDir}`);
        }
        // Copiar diretório completo
        await this.copyDirectory(this.config.mcpDir, backupDir);
        // Coletar informações do backup
        const stats = await this.getDirectoryStats(backupDir);
        const files = await this.listFilesRecursive(backupDir);
        const backupInfo = {
            version: currentVersion,
            timestamp,
            path: backupDir,
            size: stats.size,
            files: files.map(f => path.relative(backupDir, f))
        };
        // Salvar informações do backup
        const backupMetaFile = path.join(backupDir, '.backup-info.json');
        await fs.writeFile(backupMetaFile, JSON.stringify(backupInfo, null, 2));
        this.log(`Backup criado: ${files.length} arquivos, ${Math.round(stats.size / 1024)}KB`);
        // Atualizar config com diretório de backup
        this.config.backupDir = backupDir;
        return backupInfo;
    }
    /**
     * Copia diretório recursivamente
     */
    /**
     * Copia diretório recursivamente
     */
    async copyDirectory(src, dest) {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isSymbolicLink()) {
                // Copiar link simbólico
                try {
                    const linkTarget = await fs.readlink(srcPath);
                    await fs.symlink(linkTarget, destPath);
                    this.log(`Copiado symlink: ${entry.name} -> ${linkTarget}`);
                }
                catch (error) {
                    this.log(`Aviso: falha ao copiar symlink ${entry.name}: ${error}`);
                }
            }
            else if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            }
            else if (entry.isFile()) {
                try {
                    await fs.copyFile(srcPath, destPath);
                    // Preservar permissões
                    const stats = await fs.stat(srcPath);
                    await fs.chmod(destPath, stats.mode);
                }
                catch (error) {
                    this.log(`Aviso: falha ao copiar arquivo ${entry.name}: ${error}`);
                }
            }
            else {
                this.log(`Ignorado: ${entry.name} (tipo de arquivo não suportado)`);
            }
        }
    }
    /**
     * Obtém estatísticas do diretório
     */
    async getDirectoryStats(dirPath) {
        let totalSize = 0;
        let fileCount = 0;
        const processEntry = async (entryPath) => {
            const stats = await fs.stat(entryPath);
            if (stats.isFile()) {
                totalSize += stats.size;
                fileCount++;
            }
            else if (stats.isDirectory()) {
                const entries = await fs.readdir(entryPath);
                for (const entry of entries) {
                    await processEntry(path.join(entryPath, entry));
                }
            }
        };
        await processEntry(dirPath);
        return { size: totalSize, files: fileCount };
    }
    /**
     * Lista todos os arquivos recursivamente
     */
    async listFilesRecursive(dirPath) {
        const files = [];
        const processEntry = async (entryPath) => {
            const stats = await fs.stat(entryPath);
            if (stats.isFile()) {
                files.push(entryPath);
            }
            else if (stats.isDirectory()) {
                const entries = await fs.readdir(entryPath);
                for (const entry of entries) {
                    await processEntry(path.join(entryPath, entry));
                }
            }
        };
        await processEntry(dirPath);
        return files;
    }
    /**
     * Executa migração de uma versão para outra
     */
    async migrate(fromVersion, toVersion) {
        this.log(`Iniciando migração de ${fromVersion} para ${toVersion}`);
        const migrations = this.getMigrationSteps(fromVersion, toVersion);
        if (migrations.length === 0) {
            this.log('Nenhuma migração necessária');
            return;
        }
        // Criar backup antes da migração
        await this.createBackup(`pre-migration-${toVersion}`);
        // Executar steps de migração
        for (const migration of migrations) {
            this.log(`Executando: ${migration.description}`);
            try {
                await migration.apply(this.config);
                this.log(`✅ Concluído: ${migration.description}`);
            }
            catch (error) {
                this.log(`❌ Falhou: ${migration.description} - ${error}`);
                throw new Error(`Migração falhou em: ${migration.description}`);
            }
        }
        // Salvar nova versão
        await this.saveVersion(toVersion);
        this.log(`Migração concluída para versão ${toVersion}`);
    }
    /**
     * Obtém steps de migração necessários
     */
    getMigrationSteps(fromVersion, toVersion) {
        const steps = [];
        // Migração para setup simplificado
        if (toVersion === 'simplified') {
            steps.push({
                version: 'simplified',
                description: 'Migrar para setup simplificado',
                apply: async (config) => {
                    await this.migrateToSimplified(config);
                },
                rollback: async (config) => {
                    await this.rollbackFromSimplified(config);
                }
            });
        }
        // Outras migrações futuras podem ser adicionadas aqui
        return steps;
    }
    /**
     * Migração específica para o setup simplificado
     */
    async migrateToSimplified(config) {
        this.log('Migrando para setup simplificado...');
        const sourceDir = path.resolve('src/setup/src/setup/dist');
        const targetDir = config.mcpDir;
        // Verificar se arquivos simplificados existem
        const simplifiedFiles = [
            'setup.js',
            'setup-config.js',
            'setup-io.js',
            'setup-system.js',
            'setup-install.js',
            'setup-shell.js',
            'setup-validate.js'
        ];
        // Copiar arquivos simplificados
        for (const file of simplifiedFiles) {
            const src = path.join(sourceDir, file);
            const dest = path.join(targetDir, file);
            try {
                await fs.copyFile(src, dest);
                this.log(`Copiado: ${file}`);
            }
            catch (error) {
                this.log(`Erro ao copiar ${file}: ${error}`);
                throw error;
            }
        }
        // Criar marcador de migração
        const migrationMarker = path.join(targetDir, '.simplified-migration');
        await fs.writeFile(migrationMarker, JSON.stringify({
            migratedAt: new Date().toISOString(),
            fromVersion: await this.detectInstalledVersion(),
            toVersion: 'simplified'
        }, null, 2));
    }
    /**
     * Rollback da migração simplificada
     */
    async rollbackFromSimplified(config) {
        if (!config.backupDir) {
            throw new Error('Backup directory não disponível para rollback');
        }
        this.log('Executando rollback da migração...');
        // Remover diretório atual
        await fs.rm(config.mcpDir, { recursive: true, force: true });
        // Restaurar backup
        await this.copyDirectory(config.backupDir, config.mcpDir);
        this.log('Rollback concluído');
    }
    /**
     * Salva versão atual
     */
    async saveVersion(version) {
        const versionFile = path.join(this.config.mcpDir, '.version');
        await fs.writeFile(versionFile, version);
        this.log(`Versão salva: ${version}`);
    }
    /**
     * Lista backups disponíveis
     */
    async listBackups() {
        const backups = [];
        const parentDir = path.dirname(this.config.mcpDir);
        const baseName = path.basename(this.config.mcpDir);
        try {
            const entries = await fs.readdir(parentDir);
            for (const entry of entries) {
                if (entry.startsWith(`${baseName}.backup-`)) {
                    const backupPath = path.join(parentDir, entry);
                    const infoFile = path.join(backupPath, '.backup-info.json');
                    try {
                        const infoContent = await fs.readFile(infoFile, 'utf8');
                        const backupInfo = JSON.parse(infoContent);
                        backups.push(backupInfo);
                    }
                    catch {
                        // Backup sem metadata, criar info básica
                        const stats = await this.getDirectoryStats(backupPath);
                        backups.push({
                            version: 'unknown',
                            timestamp: 'unknown',
                            path: backupPath,
                            size: stats.size,
                            files: [`${stats.files} files`]
                        });
                    }
                }
            }
        }
        catch (error) {
            this.log(`Erro ao listar backups: ${error}`);
        }
        return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
    /**
     * Restaura de um backup específico
     */
    async restoreFromBackup(backupPath) {
        this.log(`Restaurando backup de: ${backupPath}`);
        // Verificar se backup existe
        try {
            await fs.access(backupPath);
        }
        catch {
            throw new Error(`Backup não encontrado: ${backupPath}`);
        }
        // Criar backup do estado atual
        await this.createBackup('pre-restore');
        // Remover instalação atual
        await fs.rm(this.config.mcpDir, { recursive: true, force: true });
        // Restaurar backup
        await this.copyDirectory(backupPath, this.config.mcpDir);
        this.log('Restauração concluída');
    }
    /**
     * Logging com controle de verbosity
     */
    log(message) {
        if (this.verbose) {
            console.log(`[MigrationManager] ${message}`);
        }
    }
    /**
     * Limpa backups antigos (manter apenas os N mais recentes)
     */
    async cleanupOldBackups(keepCount = 5) {
        const backups = await this.listBackups();
        if (backups.length <= keepCount) {
            this.log(`${backups.length} backups encontrados, nenhum cleanup necessário`);
            return;
        }
        const toDelete = backups.slice(keepCount);
        for (const backup of toDelete) {
            try {
                await fs.rm(backup.path, { recursive: true, force: true });
                this.log(`Backup removido: ${backup.path}`);
            }
            catch (error) {
                this.log(`Erro ao remover backup ${backup.path}: ${error}`);
            }
        }
        this.log(`Cleanup concluído: ${toDelete.length} backups removidos`);
    }
}
export default MigrationManager;
