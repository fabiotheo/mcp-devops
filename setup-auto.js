#!/usr/bin/env node
// Script automatizado para configurar o MCP Terminal Assistant

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

async function autoSetup() {
  console.log('🚀 Configurando MCP Terminal Assistant automaticamente...');
  
  try {
    // Definir configuração
    const mcpDir = path.join(process.env.HOME, '.mcp-terminal');
    const configPath = path.join(mcpDir, 'config.json');
    
    // 1. Garantir que o diretório existe
    await fs.mkdir(mcpDir, { recursive: true });
    await fs.mkdir(path.join(mcpDir, 'cache'), { recursive: true });
    await fs.mkdir(path.join(mcpDir, 'patterns'), { recursive: true });
    await fs.mkdir(path.join(mcpDir, 'logs'), { recursive: true });
    console.log('  ✓ Diretórios criados');
    
    // 2. Criar configuração com a chave API
    const config = {
      "ai_provider": "claude",
      "anthropic_api_key": "sk-ant-api03-X_PrP_I8YQ0j4Eu8_RoWEA",
      "openai_api_key": "",
      "gemini_api_key": "",
      "model": "claude-3-5-haiku-20241022",
      "openai_model": "gpt-4o",
      "gemini_model": "gemini-pro",
      "max_calls_per_hour": 100,
      "enable_monitoring": true,
      "enable_assistant": true,
      "monitor_commands": ["npm", "yarn", "git", "docker", "make", "cargo", "go"],
      "quick_fixes": true,
      "auto_detect_fixes": false,
      "log_level": "info",
      "cache_duration_hours": 24
    };
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log('  ✓ Configuração criada com sua chave API');
    
    // 3. Copiar scripts e arquivos essenciais do diretório atual
    const sourceDir = path.join(process.cwd(), 'ai_models');
    const destDir = path.join(mcpDir, 'ai_models');
    await fs.mkdir(destDir, { recursive: true });
    
    try {
      const modelFiles = ['base_model.js', 'claude_model.js', 'openai_model.js', 'gemini_model.js', 'model_factory.js'];
      for (const file of modelFiles) {
        const sourceFile = path.join(sourceDir, file);
        const destFile = path.join(destDir, file);
        const content = await fs.readFile(sourceFile, 'utf8');
        await fs.writeFile(destFile, content);
      }
      console.log('  ✓ Modelos de IA copiados');
    } catch (err) {
      console.log(`  ⚠ Erro ao copiar modelos: ${err.message}`);
    }
    
    // 4. Copiar arquivos principais
    const filesToCopy = [
      { src: 'mcp-client.js', dest: path.join(mcpDir, 'mcp-client.js') },
      { src: 'mcp-assistant.js', dest: path.join(mcpDir, 'mcp-assistant.js') },
      { src: 'system_detector.js', dest: path.join(mcpDir, 'system_detector.js') },
      { src: 'zsh_integration.sh', dest: path.join(mcpDir, 'zsh_integration.sh') }
    ];
    
    for (const file of filesToCopy) {
      try {
        const content = await fs.readFile(file.src, 'utf8');
        await fs.writeFile(file.dest, content);
        console.log(`  ✓ Arquivo ${path.basename(file.src)} copiado`);
      } catch (err) {
        console.log(`  ⚠ Erro ao copiar ${path.basename(file.src)}: ${err.message}`);
      }
    }
    
    // 5. Tornar scripts executáveis
    for (const file of ['mcp-client.js', 'mcp-assistant.js']) {
      const filePath = path.join(mcpDir, file);
      await fs.chmod(filePath, 0o755);
    }
    console.log('  ✓ Scripts tornados executáveis');
    
    // 6. Configurar integração Zsh
    const zshrcPath = path.join(process.env.HOME, '.zshrc');
    const integrationLine = `source ${mcpDir}/zsh_integration.sh`;
    
    try {
      const zshrc = await fs.readFile(zshrcPath, 'utf8');
      if (!zshrc.includes(integrationLine)) {
        await fs.writeFile(zshrcPath, `${zshrc}\n\n# MCP Terminal Integration\n${integrationLine}\n`);
        console.log('  ✓ Integração adicionada ao .zshrc');
      } else {
        console.log('  ✓ Integração já configurada no .zshrc');
      }
    } catch (err) {
      // Se .zshrc não existe, cria
      if (err.code === 'ENOENT') {
        await fs.writeFile(zshrcPath, `# MCP Terminal Integration\n${integrationLine}\n`);
        console.log('  ✓ .zshrc criado com integração');
      } else {
        console.log(`  ⚠ Erro ao configurar .zshrc: ${err.message}`);
      }
    }
    
    // 7. Criar links simbólicos
    const binDir = path.join(process.env.HOME, '.local/bin');
    await fs.mkdir(binDir, { recursive: true });
    
    const links = [
      { from: path.join(mcpDir, 'mcp-assistant.js'), to: path.join(binDir, 'ask') },
      { from: path.join(mcpDir, 'mcp-client.js'), to: path.join(binDir, 'mcp-monitor') }
    ];
    
    for (const link of links) {
      try {
        await fs.unlink(link.to);
      } catch {}
      
      await fs.symlink(link.from, link.to);
      console.log(`  ✓ Link criado: ${link.to}`);
    }
    
    console.log('\n✅ Instalação automática concluída com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('1. Reinicie seu terminal ou execute: source ~/.zshrc');
    console.log('2. Teste com: ask "como listar arquivos por tamanho"');
    
  } catch (error) {
    console.error('\n❌ Erro durante a instalação automática:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Executar automaticamente
autoSetup().catch(err => {
  console.error("❌ Falha crítica:", err);
  process.exit(1);
});