# Pagamento no WhatsApp com continuidade da conversa

## Correção

O pedido de pagamento enviado em mensagens próximas deixava de acionar o checkout quando a última mensagem era apenas um complemento, como “o código Pix”. O motor agora reúne a sequência recebida e ainda não respondida para decidir o pagamento. A janela é limitada, respeita o intervalo configurado de agrupamento e termina em uma resposta do agente. Confirmações antigas não são reaproveitadas como novas autorizações.

Pedidos curtos de Pix ou cartão no contexto de retomada recuperam o carrinho disponível. Preços, entrega e confirmação continuam sendo verificados antes da cobrança. Perguntas, mudanças, adiamentos e negativas interrompem a ação; um “não” isolado também prevalece sobre a autorização anterior no mesmo conjunto de mensagens.

O runtime existente já separa geração de pagamento, reutilização de sessão e entrega no WhatsApp. Essas proteções foram preservadas. A recuperação corrigida chega a essas etapas, em vez de depender de uma promessa produzida pela IA.

## Preservação do clone

- Personalidade, modelo, memória, voz, ritmo, configuração de comportamento e follow-up dos agentes não foram alterados.
- Respostas comuns continuam passando pelo fluxo atual. Testes verificam preservação literal de respostas naturais.
- Quando a IA mistura uma saudação ou explicação com uma promessa de pagamento sem execução, o filtro preserva o conteúdo aproveitável e retira a promessa e suas instruções dependentes. Não devolve automaticamente a antiga pergunta “vamos retomar?” diante de uma saudação.
- A orientação comum distingue promessas históricas de resultados reais de pagamento, mantendo o tom do clone.
- O Pix e o checkout só são anunciados pelo caminho que efetivamente prepara sua entrega. Um pedido sem produtos identificáveis recebe uma pergunta específica sobre itens e quantidades.

Preservar essas características não equivale a comprovar aprovação universal em um teste de Turing; a avaliação da conversa real continua necessária.

## Pix, cartão e transporte

- Pix mantém a solicitação nativa `/send/request-payment`, com código emitido pelo gateway, valor e link de checkout. Não converte o código da cobrança em uma chave Pix estática.
- Rejeições definitivas continuam usando os fallbacks existentes: botão de copiar e, se necessário, código por texto.
- Cartão mantém o checkout interno da loja, com o parâmetro `payment_method=card`, inclusive no fallback para texto.
- Entrega incerta do botão de cartão agora recebe o mesmo cuidado do Pix: registra `payment_delivery_unconfirmed` e segue a conferência existente, sem tentar outro formato automaticamente após timeout ou erro de servidor.
- Troca de método preserva os dados e o pedido confirmado, sujeita às verificações existentes de disponibilidade, sessão e conciliação.

A documentação pública da Uazapi foi consultada em 09/09/2026: [especificação oficial](https://docs.uazapi.com/openapi-bundled.json). Ela descreve `/send/request-payment`, links externos e menciona `pixCode` no exemplo de erro de validação, embora não detalhe essa propriedade no schema. Não foi encontrada evidência de rejeição do formato nativo na tentativa relatada: aquela execução parou antes da geração e do transporte. Compatibilidade visual e recebimento real não são comprovados pelos testes simulados.

## Validação

- Suíte completa: **817 testes aprovados em 99 arquivos**, incluindo 26 novos casos (`npx vitest run --maxWorkers=2`).
- Os novos casos cobrem mensagens fragmentadas, recuperação seguida de Pix/cartão, confirmação após interjeição, pedido curto de pagamento, cancelamento, dúvida, adiamento, humano solicitado, mensagens já respondidas ou antigas, preservação de saudação/explicação e falhas de transporte no cartão.
- Banco, gateway e WhatsApp são substituídos nos testes; os dados são fictícios.
- Reprodução somente em memória com o histórico consultado da conversa reportada: o complemento “o codigo pix” passa a acionar a recuperação, mantendo a exigência de confirmação atual. Nenhum pagamento ou envio foi produzido pela reprodução.
- Relatório local de testes: `tmp/payment-flow-fix-final-tests.json`.
- Build local de produção aprovado; verificação final de TypeScript, ESLint dos arquivos alterados e `git diff --check` aprovados. Um teste de banco fora do fluxo de pagamento precisou ser reexecutado; passou isoladamente e na suíte completa com dois workers.

## Escopo operacional

Correção no runtime compartilhado, sem condição por empresa, agente ou telefone. Nenhuma alteração de configuração individual, reset de lead, migração de banco ou automação de follow-up. O teste final de recebimento precisa ocorrer no WhatsApp após a publicação, com uma nova mensagem e o aceite da prévia quando solicitado.
