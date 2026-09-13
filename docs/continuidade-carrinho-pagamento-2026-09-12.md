# Continuidade do carrinho e escolha de pagamento — reteste de 12/09/2026

## Escopo autorizado

O titular solicitou corrigir as falhas do reteste da Luna, ampliar as simulações de conversas e publicar na Vercel após a validação. A correção pertence ao carrinho e checkout compartilhados; roupas, eletrônicos e outros produtos com envio passam pelo mesmo código. Os fluxos específicos por profissão e o cenário próprio de pizzaria/entrega local ficam para uma etapa posterior, conforme orientação expressa.

## Evidência do reteste

Inspeção somente de leitura do WhatsApp e dos registros correspondentes confirmou que a recuperação anterior já permitiu gerar Pix, mas uma alteração composta de produto e pagamento ainda perdia a intenção durante a pergunta de esclarecimento. A resposta da LLM anunciou o item antes de sua gravação; a primeira revisão real manteve os itens anteriores. A escolha posterior de cartão ficou apenas no texto da conversa. A recuperação dos itens importou novamente o método Pix do pagamento persistido e exigiu confirmações adicionais até o cliente reiterar cartão.

A conferência financeira reproduziu outro defeito: a normalização de um pagamento com exclusão indicada e estado PENDING retornava pending. O webhook de exclusão pôde, assim, sobrescrever o cancelamento local. Duas sessões pendentes no banco não comprovam duas cobranças abertas no provedor. Nenhuma compra, pagamento, cancelamento, mensagem ou alteração cadastral real foi executada durante esta inspeção.

Referência do contrato externo: o Asaas distingue exclusão de cobrança, estorno e disputa. Seu fluxo documentado permite uma disputa vencida pelo recebedor retornar à confirmação/recebimento; a proteção contra eventos antigos deve preservar esse resultado financeiro fresco. [Eventos de cobrança do Asaas](https://docs.asaas.com/docs/payment-events).

## Matriz de validação

As simulações devem conferir intenção, estado salvo, resposta e efeito externo esperado. Banco e transportes simulados não comprovam entrega real pelo WhatsApp ou aprovação bancária. A matriz combina sequências e condições do pedido, sem prometer cobertura de toda frase humana possível.

| Grupo | Cenários e critério |
|---|---|
| Alteração composta | Adicionar produto e escolher pagamento na mesma mensagem; continuar com nome, variante ou quantidade em resposta à pergunta; nenhuma confirmação do carrinho antigo. |
| Continuidade | Preservar itens não alterados e a última escolha explícita de pagamento; não anunciar alteração que ainda não foi resolvida; revisão confirmada uma vez, repetição sem duplicação. |
| Linguagem e consentimento | Cortesia, dúvida, hipótese, negação, adiamento e correção junto de um “sim”; mensagens partidas e ordem das mensagens; não gerar pagamento contra a instrução mais recente. |
| Retomada | Pedido pendente, pagamento recusado e novo pedido após pagamento; não reaproveitar indevidamente itens ou confirmação de outra compra/conversa. |
| Frete de envio | Roupas e eletrônicos em SP, RJ, DF, BA, AM, AC e SC; valor um centavo abaixo, no limite e um centavo acima da gratuidade; mudança de destino e redução de carrinho. |
| Composição do envio | Item com frete gratuito junto de item com frete normal; ordem das linhas e quantidades equivalentes; CEP inválido, entrega desabilitada e retirada somente quando escolhida; configurações de lojas distintas. |
| Eventos financeiros | Exclusão com status PENDING, eventos repetidos ou fora de ordem, cancelamento concorrente, confirmação/estorno reais e preservação do pagamento atual. |

## Correção e validação concluídas

A intenção de alterar itens e a escolha explícita de Pix/cartão são preservadas separadamente durante os esclarecimentos, dentro da organização, conversa, instância e pedido. A confirmação depende da prévia completa do carrinho real, incluindo mensagens separadas; dúvidas, recusas e adiamentos não autorizam pagamento. A resposta deixa de anunciar uma inclusão não executada, e uma alteração sem efeito não recria o pagamento. A recuperação do carrinho legado conserva a escolha mais recente do cliente.

O processamento financeiro consulta o estado atual no Asaas, reconhece exclusão mesmo acompanhada de PENDING e impede eventos antigos de reabrirem sessões encerradas. Atualizações concorrentes são conferidas antes da gravação. Divergências de valor/revisão, estornos de outra sessão ou evidências financeiras conflitantes ficam registradas para conferência, sem quitar indevidamente o carrinho atual. Falha na consulta do provedor retorna erro temporário para nova tentativa. Nenhuma migration SQL adicional é necessária; são utilizados os registros e guardas existentes.

Validação consolidada: **2.225 testes em 178 arquivos aprovados**, TypeScript, ESLint dos arquivos alterados e diff-check aprovados. A primeira execução ampla teve seis falhas de tempo/recursos em cinco arquivos SQL preexistentes; os 19 testes desses arquivos passaram isoladamente e a suíte inteira passou novamente com dois workers. Após os dois ajustes finais de tipagem, os 236 testes afetados de intenção/runtime/cenários passaram novamente, assim como TypeScript e ESLint.

Os novos arquivos incluem 20 cenários de conversa, 18 de frete de roupas/eletrônicos e 55 de reconciliação financeira. Os testes de frete executam o cálculo real e a preparação real de checkout inicial/revisão, em sete destinos e três valores na fronteira da gratuidade. Revisões independentes encontraram e validaram as correções de pergunta interpretada como aceite, produto com título curto, falsa alegação de alteração e preservação de evidência financeira. Publicação autorizada e preparada; a conferência da implantação será registrada após o envio.

Limites: produtos/variantes sem correspondência confiável continuam solicitando esclarecimento e preservando o SKU original; não foi implementada uma nova troca arbitrária de variantes do mesmo produto. Checkout hospedado legado com múltiplas parcelas/cobranças ou evidência incompleta requer conferência, sem inferir pagamento integral; o fluxo existente de cartão transparente permanece disponível. Os testes simulam banco/transportes nos cenários de conversa e não comprovam entrega real de WhatsApp, aprovação bancária ou execução real de estoque/comissões. Esses efeitos dependem do reteste do titular e de eventos reais.

## Pendências para etapa posterior

O cenário próprio de pizzaria/hamburgueria precisa conferir as regras de entrega local, pedido mínimo, gratuidade, área atendida e escolhas de produtos/opções efetivamente disponíveis. Não se presume suporte a combinação de sabores ou outra configuração não cadastrada. A escolha da profissão orienta o atendimento, enquanto as ações e regras do item/empresa continuam sendo validadas. Essa revisão específica não faz parte da publicação atual.
