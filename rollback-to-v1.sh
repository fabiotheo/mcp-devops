#!/bin/bash
# Script de rollback para restaurar v1

BACKUP_DIR=$(ls -d backup-v1-* 2>/dev/null | sort -r | head -n1)

if [ -z "$BACKUP_DIR" ]; then
    echo "❌ Erro: Nenhum backup encontrado!"
    exit 1
fi

echo "==================================="
echo "  ROLLBACK PARA V1"
echo "  Backup: $BACKUP_DIR"
echo "==================================="
echo ""

read -p "Confirma restauração da v1? (s/N): " confirm
if [[ ! "$confirm" =~ ^[Ss]$ ]]; then
    echo "Rollback cancelado."
    exit 0
fi

echo "Restaurando arquivos..."

# Restaurar arquivos root
cp "$BACKUP_DIR/root/"*.js . 2>/dev/null
cp "$BACKUP_DIR/root/"*.mjs . 2>/dev/null

# Restaurar diretórios
cp -r "$BACKUP_DIR/libs/"* libs/ 2>/dev/null
cp -r "$BACKUP_DIR/ai_models/"* ai_models/ 2>/dev/null
cp -r "$BACKUP_DIR/dashboard/"* dashboard/ 2>/dev/null

# Restaurar configurações
cp "$BACKUP_DIR/root/package.json" . 2>/dev/null
cp "$BACKUP_DIR/root/setup.js" . 2>/dev/null

# Restaurar histórico se existir
if [ -f "$BACKUP_DIR/.mcp_terminal_history" ]; then
    cp "$BACKUP_DIR/.mcp_terminal_history" ~/
    echo "✓ Histórico restaurado"
fi

echo ""
echo "✅ Rollback completo!"
echo ""
echo "Para reinstalar, execute:"
echo "  node setup.js --upgrade --auto"
