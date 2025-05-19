#!/bin/bash
# Script para corrigir o problema de exibição do MCP Assistant - versão final

# Diretório de instalação do MCP
MCP_DIR=~/.mcp-terminal

# Backup do arquivo original
cp $MCP_DIR/mcp-assistant.js $MCP_DIR/mcp-assistant.js.bak
echo "✅ Backup criado em $MCP_DIR/mcp-assistant.js.bak"

# Copiar o script simplificado para o diretório de instalação
cp /home/ipcom/mcp/mcp-devops/mcp-simple.js $MCP_DIR/mcp-simple.js
chmod +x $MCP_DIR/mcp-simple.js
echo "✅ Script mcp-simple.js copiado e configurado"

# Criar script auxiliar simple-ask.sh no diretório de instalação
cat > $MCP_DIR/simple-ask.sh << 'EOF'
#!/bin/bash
# Script para usar a versão simplificada do MCP Assistant

# Verifica se foi fornecido um argumento
if [ $# -eq 0 ]; then
  echo "❌ Erro: Nenhuma pergunta fornecida"
  echo "Uso: simple-ask.sh \"como listar arquivos por tamanho\""
  exit 1
fi

# Executa o mcp-simple.js com os argumentos fornecidos
node ~/.mcp-terminal/mcp-simple.js "$*"
EOF

chmod +x $MCP_DIR/simple-ask.sh
echo "✅ Script simple-ask.sh criado e configurado"

# Modificar a integração Zsh para usar o script simplificado
INTEGRATION_FILE=$MCP_DIR/zsh_integration.sh
cp $INTEGRATION_FILE ${INTEGRATION_FILE}.bak
echo "✅ Backup de zsh_integration.sh criado"

# Modificar a função ask() para usar o script simplificado
sed -i '/^ask()/,/^}/c\
# Comando ask para assistente (usando o script simplificado)\
ask() {\
    if [[ $# -eq 0 ]]; then\
        echo "Uso: ask \"sua pergunta sobre Linux\""\
        echo "Exemplo: ask \"como listar arquivos por tamanho\""\
        return 1\
    fi\
\
    ~/.mcp-terminal/simple-ask.sh "$*"\
    return $?\
}' $INTEGRATION_FILE

echo "✅ Função ask() atualizada para usar o script simplificado"

# Limpar o .zshrc de possíveis duplicações
cp ~/.zshrc ~/.zshrc.bak
ZSHRC=~/.zshrc

# Remover linhas duplicadas de integração do MCP
sed -i '/# MCP Terminal Integration/,+1{//!d;/# MCP Terminal Integration/d;}' $ZSHRC
echo "✅ Entradas duplicadas em .zshrc removidas"

# Certificar-se de que apenas uma linha de integração está presente
grep -q "source ~/.mcp-terminal/zsh_integration.sh" $ZSHRC
if [ $? -ne 0 ]; then
  # Se não houver nenhuma linha de integração, adicionar uma
  echo -e "\n# MCP Terminal Integration\nsource ~/.mcp-terminal/zsh_integration.sh" >> $ZSHRC
  echo "✅ Linha de integração adicionada ao .zshrc"
fi

echo "✅ Correção concluída com sucesso"
echo ""
echo "📋 Próximos passos:"
echo "1. Reinicie seu terminal ou execute: source ~/.zshrc"
echo "2. Teste com: ask \"como listar arquivos por tamanho\""
echo "3. Verifique se o resultado é mostrado corretamente"
echo ""
echo "📋 Caso ainda tenha problemas após reiniciar o terminal,"
echo "   tente usar diretamente: ~/.mcp-terminal/simple-ask.sh \"sua pergunta\""