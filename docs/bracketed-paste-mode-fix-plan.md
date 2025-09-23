# Plano de Ação: Reativar e Corrigir o "Bracketed Paste Mode"

*(Versão atualizada após investigação inicial)*

## Fase 1: Investigação e Análise (Concluída)

-   **Diagnóstico:** A implementação anterior foi removida por "problemas de entrada", provavelmente devido a um conflito com a biblioteca `readline`. A `readline` sozinha não consegue detectar as sequências de colagem, exigindo uma abordagem de mais baixo nível.
-   **Solução Identificada:** A implementação correta exige o uso de `process.stdin` em "modo raw" para capturar os dados brutos do terminal, identificar manualmente as sequências de escape que delimitam a colagem (`[200~` e `[201~`), e então processar o texto colado como um bloco único.

---

## Fase 2: Desenho da Nova Lógica de Captura

1.  **Habilitar/Desabilitar Modo:**
    *   Na inicialização do `mcp-interactive`, enviar a sequência de escape `[?2004h` para `process.stdout` para ativar o modo de colagem no terminal.
    *   No encerramento da aplicação, enviar `[?2004l` para desativá-lo, garantindo o bom comportamento do terminal do usuário.
2.  **Configurar `stdin` para Modo Raw:**
    *   Chamar `process.stdin.setRawMode(true)`.
    *   Criar um listener para o evento `process.stdin.on('data', (chunk) => { ... })` que será o ponto de entrada principal para todo o input do teclado.
3.  **Implementar o Parser de Input:** Dentro do listener do evento `data`:
    *   Manter uma flag de estado (ex: `isPasting = false`) e um buffer de colagem.
    *   Verificar se o `chunk` de dados recebido é a sequência de início (`[200~`). Se for, ativar a flag `isPasting` e limpar o buffer.
    *   Verificar se o `chunk` é a sequência de fim (`[201~`). Se for, desativar a flag e processar o conteúdo do buffer (ver Fase 3).
    *   Se `isPasting` for `true`, adicionar o `chunk` ao buffer.
    *   Se `isPasting` for `false`, significa que é uma digitação normal, e o `chunk` deve ser repassado para o `readline` tratar (ex: `readline.write(chunk)`).

## Fase 3: Integração com o REPL

1.  **Processar o Buffer de Colagem:** Quando a sequência de fim for detectada, o conteúdo do buffer (que é o texto completo colado) será processado.
2.  **Inserir Texto no Prompt:** O texto colado será inserido de uma vez na linha de comando atual do `readline`. Isso pode ser feito usando `readline.write(pastedText)`. O usuário verá o texto colado e poderá editá-lo ou pressionar `Enter` para confirmar.
3.  **Coexistência com `readline`:** A chave é o parser da Fase 2, que atuará como um "roteador": ou ele trata a colagem ou ele passa os dados para o `readline` cuidar da digitação normal, histórico e atalhos.

## Fase 4: Testes e Validação (Inalterada)

1.  **Cenários de Colagem:** Testar a colagem de textos de linha única, múltiplas linhas (com e sem linhas em branco) e blocos de código.
2.  **Cenários de Uso Normal:** Garantir que a digitação normal, o uso de histórico (setas), autocompletar (Tab) e os atalhos de teclado (`Ctrl+C`, `Esc`, etc.) não sejam afetados negativamente.
3.  **Cenários de Borda:** Verificar o comportamento ao colar texto em um prompt que já contém texto e ao colar caracteres especiais.