// setup-shell.ts - Integração com shell simplificada  
// Reduzido de 436 linhas (ShellIntegration class) para ~100 linhas (-77% redução)
import { readFile, writeFile, fileExists } from './setup-io.js';
import * as path from 'path';
/**
 * Detecta arquivo de configuração do shell
 */
export async function detectShellConfig(config) {
    const shellFiles = [];
    // Adicionar arquivo baseado no shell detectado
    if (config.shell === 'zsh') {
        shellFiles.push('.zshrc');
    }
    else if (config.shell === 'bash') {
        shellFiles.push('.bashrc', '.bash_profile');
    }
    else {
        shellFiles.push('.bashrc'); // fallback
    }
    // Procurar primeiro arquivo que existe
    for (const shellFile of shellFiles) {
        const fullPath = path.join(config.homeDir, shellFile);
        if (await fileExists(fullPath)) {
            return fullPath;
        }
    }
    // Se nenhum existe, criar o padrão
    const defaultFile = config.shell === 'zsh' ? '.zshrc' : '.bashrc';
    return path.join(config.homeDir, defaultFile);
}
/**
 * Adiciona MCP ao PATH
 */
export async function addMcpToPath(config, mcpDir) {
    const shellConfigPath = await detectShellConfig(config);
    const exportLine = `export MCP_HOME="${mcpDir}"`;
    const pathLine = `export PATH="$MCP_HOME:$PATH"`;
    try {
        let content = '';
        // Ler conteúdo existente se arquivo existe
        if (await fileExists(shellConfigPath)) {
            content = await readFile(shellConfigPath);
        }
        // Verificar se já está configurado
        if (content.includes(exportLine)) {
            if (config.verbose) {
                console.log('✅ MCP já está configurado no PATH');
            }
            return;
        }
        // Adicionar configuração do MCP
        const mcpConfig = `

# MCP Terminal Assistant Configuration
${exportLine}
${pathLine}
`;
        content += mcpConfig;
        await writeFile(shellConfigPath, content);
        if (config.verbose) {
            console.log(`✅ MCP adicionado ao PATH em: ${shellConfigPath}`);
        }
    }
    catch (error) {
        throw new Error(`Erro ao configurar shell: ${error.message}`);
    }
}
/**
 * Configura integração com o shell
 */
export async function configureShell(config) {
    try {
        await addMcpToPath(config, config.mcpDir);
        if (config.verbose) {
            console.log(`✅ Shell ${config.shell} configurado com sucesso`);
            console.log('💡 Execute "source ~/.bashrc" ou reinicie o terminal para aplicar');
        }
    }
    catch (error) {
        console.error(`❌ Erro na configuração do shell: ${error.message}`);
        throw error;
    }
}
