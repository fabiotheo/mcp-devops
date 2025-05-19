#!/bin/bash

echo "🧪 Testando o comando 'ask'..."
echo "📝 Executando: ask \"como listar arquivos por tamanho\""
echo ""

# Executar o comando ask
ask "como listar arquivos por tamanho"

# Verificar o código de saída
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Teste concluído com sucesso!"
else
  echo ""
  echo "❌ Teste falhou com código de saída: $?"
fi
