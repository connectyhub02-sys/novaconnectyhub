# Alterações após o fechamento do carrinho — 12/09/2026

## Resultado

O reteste apresentado após o reset mostra checkout inicial entregue e falha quando o cliente pede outro item. O agente reenvia acesso ao pedido anterior, posteriormente apresenta os dois itens e passa a repetir a confirmação sem calcular entrega. Quatro verificações locais com pizza e limonada reproduziram as decisões incorretas no runtime real, sem banco externo, WhatsApp ou gateway. Esses testes demonstram defeitos existentes, não uma correção.

## Causas reproduzidas

1. `hasSalesCatalogCheckoutConfirmationIntent` aceita frases que começam com “top”. Os filtros de alteração reconhecem “adiciona” e “adicionar”, mas não “adicione”. Portanto “top faz o seguinte adicione uma limonada” é interpretado como aceite do resumo anterior. `resolveSalesCatalogOrderSelections` retorna somente a pizza anterior, ignorando a limonada solicitada. A recuperação de checkout é chamada antes da geração da resposta e do tratamento posterior do carrinho.
2. `buildSalesCatalogShippingIntentText` usa `resolveSalesCatalogCartBoundaryMs`, que considera a maior data de criação ou atualização dos pedidos. O endereço informado antes dessa data deixa de alimentar a entrega, inclusive quando o cliente está alterando o pedido atual. O cálculo de frete que funcionava antes do fechamento retorna nulo depois dele.
3. `findRecentSalesCatalogOrderForSelections` considera suficiente existir qualquer item em comum com um pedido anterior. Assim, uma cesta nova com pizza e limonada pode herdar o indicador de entrega resolvida de um pedido só de pizza. Isso suprime a pergunta específica de entrega.
4. `needsSalesCatalogCheckoutTotalConfirmation` corretamente exige total com frete, mas a prévia que recebe o resultado nulo termina novamente perguntando se pode fechar. O “sim” repete exatamente o mesmo caminho. Não há avanço de estado nem explicação do dado/operação que falta.

O runtime de criação também deriva a identidade do pedido da mensagem de prévia. Uma nova prévia não representa, por si, uma revisão do pedido existente. Corrigir somente reconhecimento de frases e frete pode liberar outro pedido sem garantir o tratamento da tentativa de pagamento anterior.

## Correção necessária

Implementar uma operação explícita de revisão do pedido no fluxo compartilhado, mantendo pedidos novos e revisões distinguíveis. A intenção deve considerar toda a frase antes de classificar um aceite. Inclusão, exclusão, substituição, quantidade, entrega e pagamento precisam ter ações próprias. Produto ambíguo exige esclarecimento; não pode virar confirmação do carrinho anterior.

A revisão deve partir dos itens persistidos do pedido correto, aplicar apenas a alteração solicitada e preservar os demais dados. A entrega deve partir do endereço desse pedido, salvo mudança expressa, recalculando preço, peso e regras com o carrinho inteiro. A resolução de entrega deve validar o conjunto e quantidades; interseção parcial não comprova frete válido.

Salvar a revisão proposta e apresentar um único resumo com itens, quantidades, frete e total. Vincular o aceite à versão apresentada. Se faltar endereço, tarifa ou esclarecimento de produto, pedir exatamente isso, sem perguntar se pode cobrar um total ainda indefinido.

Ao confirmar, aplicar a revisão com controle de concorrência e idempotência. Reaproveitar as proteções financeiras existentes para impedir alteração de pedido pago, pagamento em processamento ou resultado incerto. Uma cobrança anterior não pode permanecer válida com valor divergente. Não resolver isso criando pedidos duplicados ou afirmando que o carrinho mudou antes da persistência. O checkout enviado deve corresponder à revisão verificada.

## Critérios de aceitação

- Inclusão mantém todos os itens anteriores e adiciona somente o solicitado.
- Remoção, substituição e quantidade não reintroduzem itens pela conversa antiga.
- Endereço continua válido para revisão do mesmo pedido; novo endereço recalcula entrega.
- Total, frete e quantidades do resumo correspondem ao checkout persistido.
- Aceite repetido não cria outra cobrança; alteração concorrente invalida a prévia anterior.
- Pedido pago ou pagamento incerto recebe encaminhamento adequado, sem substituição automática.
- Falha de frete produz próximo passo específico e não repete confirmação.
- Troca de pagamento preserva itens, endereço e total.

## Implementação após autorização

A autorização posterior do titular ampliou o trabalho para corrigir o fluxo. O runtime compartilhado agora trata revisão antes da recuperação do checkout: identifica a operação na frase completa, parte das linhas persistidas, salva a proposta por conversa e apresenta itens, frete, endereço, total e pagamento. O aceite precisa corresponder à última prévia e à assinatura integral dos dados apresentados. Mudança de preço, opção, entrega ou pagamento exige uma nova conferência.

Inclusão, retirada, redução, aumento e substituição preservam o mesmo pedido. O cálculo usa o carrinho inteiro e as regras de entrega da empresa, inclusive limiar de frete grátis e retirada habilitada. CEPs legados são normalizados. Dados incompletos ou tarifa indisponível produzem uma pergunta específica; não se pede confirmação de um total sem entrega resolvida. Opções de produto que não possam ser preservadas com segurança exigem conferência, sem substituição silenciosa.

O seletor exige organização, lead, conversa e estado editável. Intenção de nova compra, contexto de checkout e histórico são separados. Pedidos pagos/encerrados não voltam a ser carrinho ativo; uma compra nova não reutiliza a prévia anterior. O histórico completo continua disponível para o atendimento. O cenário de pedido realmente pago no dia anterior é prevenção coberta por testes, não falha real previamente reproduzida.

A migration `0132_sales_catalog_order_revisions.sql` adiciona aplicação transacional da proposta no pedido existente, com revisão esperada, identificação persistente da solicitação e exclusão de concorrência com pagamentos. O acesso anterior ao pagamento é tratado pelas proteções financeiras compartilhadas. Tentativas locais antigas que ainda não chegaram ao provedor são invalidadas; uma execução atrasada não pode voltar a cobrar o total anterior. Resultado incerto de cancelamento continua bloqueado para conferência. Repetição de uma revisão concluída retorna o resultado salvo sem cancelar o pagamento criado depois dela.

A proposta aplicada permanece recuperável quando o provedor ou a entrega da mensagem falham. Trocar somente a forma de pagamento continua usando o fluxo de navegação/recuperação do mesmo checkout, preservando carrinho e total. A revisão não altera titularidade financeira, comissão, contratos ou pedidos encerrados. O alcance é o carrinho/checkout compartilhado usado pelas empresas e atividades elegíveis da ConnectyHub; destinos externos e fluxos consultivos mantêm suas regras.

## Validação e publicação

Os testes de runtime executam as funções reais com transporte WhatsApp e provedor substituídos. Cobrem alterações após checkout, aceite contextual, mensagem repetida, preço modificado mantendo o mesmo total, endereço/CEP, ausência de tarifa, isolamento entre conversas, falha de persistência e retomada após falha de pagamento. Testes PGlite executam as funções SQL com os gatilhos anteriores de checkout, incluindo concorrência, reversão transacional e repetição idempotente.

Validação consolidada em 12/09: a suíte anterior à integração aprovou 1.819 testes em 167 arquivos. Após integrar a agenda já publicada, a suíte de 1.840 testes em 169 arquivos teve 1.839 aprovações e um timeout de cinco segundos em um teste preexistente do ledger de automações. A repetição isolada desse arquivo aprovou seus dez testes, incluindo o caso interrompido. TypeScript, ESLint dos arquivos alterados e `git diff --check` aprovados. No Windows, dois arquivos preexistentes comparados por bytes em testes foram temporariamente normalizados para LF e tiveram os bytes originais restaurados ao término; não fazem parte da alteração.

Entre os testes específicos: 83 casos do parser, 68 do ciclo de pedido, 35 de seleção/retomada no runtime, 28 do percurso de revisão e 42 de persistência/SQL. O teste do percurso também cobre mensagens consecutivas sem resposta: um “sim” ao final de um pedido de inclusão não autoriza o resumo antigo.

A versão principal foi conferida por leitura e integrada localmente, preservando a agenda e as correções de ativação já publicadas. Nenhuma mensagem, alteração de pedido ou cobrança real foi usada nos testes. As reproduções do defeito original permanecem fora da suíte de regressão permanente.

## Publicação autorizada

O titular autorizou publicar a aplicação e aplicar o SQL no Supabase da VPS. Em 12/09, a migration `0132_sales_catalog_order_revisions` foi aplicada transacionalmente no PostgreSQL 17.6 e registrada uma única vez no histórico nativo. A transação comparou os registros de pedidos, itens e sessões de pagamento antes/depois e confirmou preservação integral; nenhuma cobrança ou revisão foi executada. As funções financeiras anteriores permaneceram com as mesmas definições.

A leitura posterior confirmou as cinco funções novas com hashes iguais à migration, os três gatilhos habilitados, o índice de exclusão de concorrência válido e RLS ativada. A tabela e as RPCs não têm acesso para `anon` ou `authenticated`; o servidor mantém os privilégios necessários. Recarga de schema solicitada. A publicação da aplicação e a conferência da Vercel estão em andamento; o reteste real do titular deve ocorrer depois da confirmação dessa implantação.
