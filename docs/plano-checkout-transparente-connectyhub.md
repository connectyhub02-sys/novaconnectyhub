# Plano de checkout transparente da ConnectyHub

Plano aprovado com base na revisão do projeto em 05/09/2026. A implementação local e a situação de homologação estão descritas em [Entrega e implantação](checkout-transparente-implantacao.md). Este documento preserva os critérios do plano; não certifica nem ativa o processamento de cartão.

O cliente deverá escolher produtos, receber recomendações, conferir o pedido, preencher o cartão e acompanhar o resultado nas páginas da ConnectyHub. O Asaas continuará processando o pagamento pela API. A identidade visual, o carrinho, as ofertas e o histórico pertencem à loja e ao lead dentro da plataforma.

## O que aproveitar do projeto

- Página própria em `src/app/checkout/[sessionId]/page.tsx`, com dados do WhatsApp, resumo e frete.
- Order bumps configuráveis e aplicação de itens em `src/lib/sales-catalog/checkout-order-bumps.ts`.
- Ofertas do agente no site em `src/lib/commerce-agent/server.ts` e no WhatsApp em `src/lib/whatsapp/agent-runtime.ts`.
- Eventos das páginas, identidade do lead e ficha técnica do CRM.
- Sessões de pagamento, atribuição do recebedor, confirmação por webhook e rotinas de estoque e pós-venda.

O caminho Asaas de `src/app/api/checkout/[sessionId]/card/route.ts` atualmente cria ou reutiliza um checkout hospedado. `checkout-payment-options.tsx` redireciona o navegador para ele. Esses dois pontos serão substituídos pelo pagamento direto.

A aplicação atual de order bumps acrescenta itens e valores em operações separadas. O novo fluxo precisa tornar essa atualização atômica, permitir remover uma oferta antes do pagamento e recalcular o frete quando os itens mudarem. As sugestões do agente e os cards de ofertas também precisam usar as mesmas regras de elegibilidade.

## Jornada proposta

| Superfície | Experiência e ofertas | Relação com o pedido |
| --- | --- | --- |
| WhatsApp | Atendimento natural, recomendação e complemento relevante antes da confirmação | Dados e itens aceitos ficam salvos; pagamento não reinicia a qualificação |
| Loja e página de produto | Produtos relacionados, combinações e opções superiores quando fizerem sentido | Adições atualizam o mesmo carrinho identificado |
| Carrinho | Complementos, quantidades, descontos permitidos e entrega | Total calculado pelo servidor e compartilhado com o agente |
| Checkout | Dados preenchidos, order bump opcional e formulário de cartão | Oferta aceita atualiza o total visível antes de pagar |
| Confirmação | Comprovante do resultado, acompanhamento e upsell opcional | Compra adicional fica vinculada à original, com aceite e pagamento próprios |

Haverá suporte a recomendações em todas as páginas comerciais. A exibição dependerá de uma oferta elegível; a mesma oferta recusada não será repetida em cada etapa. Um produto nunca entra no pedido somente porque foi exibido ou sugerido.

## Etapa 1 — Pedido e cálculo únicos para WhatsApp e site

**Entrega:** um serviço central para consultar, revisar e confirmar o carrinho, usado por agentes e páginas.

- Reaproveitar pedidos e sessões existentes; adicionar revisão do carrinho e identificadores de tentativa de pagamento conforme necessário.
- Manter vínculo com organização, lead, conversa, carrinho, pedido e origem da oferta.
- Calcular preços, descontos, estoque, impostos quando aplicáveis e frete no servidor. O navegador informa escolhas, não o valor final a cobrar.
- Atualizar itens e totais numa transação. Recalcular entrega por CEP quando produto, quantidade, peso, modalidade ou endereço mudar.
- Invalidar a cotação anterior e pedir confirmação do novo total quando uma alteração afetar o pagamento.
- Se WhatsApp e checkout alterarem o carrinho simultaneamente, detectar a revisão antiga e atualizar a tela antes de cobrar.
- Preservar o recebedor, as comissões e o isolamento entre lojas já previstos na plataforma.

**Aceite:** selecionar, remover e selecionar novamente uma oferta não duplica item nem valor; a mesma revisão do pedido mostra os mesmos itens, frete e total em todas as superfícies.

## Etapa 2 — Cartão de crédito dentro do checkout

**Entrega:** formulário próprio e integração direta com a API Asaas, sem abrir o checkout hospedado do provedor.

- Campos de número do cartão, nome impresso, validade, CVV e parcelas disponíveis. Aproveitar os dados pessoais já coletados; permitir corrigir dados e informar titular diferente do comprador quando necessário.
- Substituir a ação de redirecionamento por uma tentativa de pagamento vinculada à revisão confirmada do pedido.
- Recalcular e validar o pedido no servidor, resolver a conta correta da loja e o cliente no Asaas, processar o pagamento e devolver somente um resultado seguro.
- Separar estados de processamento, análise, confirmação, recusa e resultado ainda desconhecido. A interface não deve tratar simples criação de cobrança como pagamento aprovado.
- Controlar repetição no servidor com trava e identidade persistente por tentativa. Em falha de rede ou timeout, consultar o provedor e reconciliar antes de permitir nova cobrança. Nunca fazer retentativa automática cega.
- Processar webhooks repetidos ou fora de ordem sem duplicar venda, baixa de estoque, comissão ou confirmação ao cliente.
- Manter o Pix no WhatsApp e a alternativa Pix nas páginas próprias, conforme a configuração da loja. Mudanças de método ou total precisam reconciliar as sessões anteriores; uma confirmação real de pagamento antigo não pode ser ignorada.

**Aceite:** crédito aprovado e recusado funcionam na nossa página; duplo clique, duas abas e timeout não geram cobranças duplicadas; pedido, estoque e CRM refletem o resultado confirmado.

## Etapa 3 — Ofertas coordenadas em todas as páginas

**Entrega:** regras compartilhadas para order bump, produtos complementares e upgrade antes do pagamento.

- Configuração por loja: produtos relacionados, gatilhos por item/categoria/valor, canais de exibição, prioridade, limite de ofertas e sugestões automáticas opcionais.
- Validar disponibilidade, preço, variantes, quantidade, modalidade de entrega e restrições comerciais. Produtos físicos, digitais e serviços usam as informações do catálogo, sem regras fixas para um único nicho.
- Diferenciar complemento de substituição: upgrade substitui a opção principal somente com aceite; um item complementar é somado somente quando escolhido.
- Excluir itens já comprados ou presentes no carrinho, ofertas recusadas e combinações incompatíveis. Itens sem configuração suficiente ficam fora da recomendação automática.
- Exibir cards compactos, com preço e ação clara de adicionar/remover, sem pré-seleção paga. Mostrar imediatamente o total validado e eventual alteração no frete.
- Dar ao agente acesso ao resultado: oferta exibida, aceita, recusada ou removida. O agente evita repetir perguntas e reconhece alterações feitas no site.
- Preservar a regra de atendimento: durante a escolha pode recomendar; depois de o cliente confirmar que deseja pagar, conclui a venda aceita. Uma oferta opcional na página não reinicia a negociação pelo WhatsApp.

**Aceite:** oferta aceita pelo site aparece no pedido do agente; recusa não vira item comprado nem provoca insistência; recomendações funcionam com catálogos de nichos diferentes.

## Etapa 4 — Upsell após a compra

**Entrega:** página própria de confirmação com oferta adicional opcional.

- Confirmar a compra original antes de exibir a oferta de pós-compra.
- Criar pedido adicional vinculado ao original. A recusa ou falha do upsell não altera a compra aprovada.
- Mostrar produto, valor adicional, frete aplicável e condição de pagamento antes do aceite. Não cobrar por visitar a página.
- Primeira versão: conclusão do pedido adicional no checkout próprio com dados pessoais reaproveitados.
- Compra adicional em um clique: habilitar somente com tokenização disponível para a conta, consentimento adequado para reutilização e confirmação explícita do novo valor. Vincular o token ao cliente e à conta corretos; não compartilhar cartões entre organizações.

**Aceite:** a compra principal continua confirmada mesmo se o cliente ignorar o upsell; uma oferta aceita tem pedido, cobrança e receita próprios, ligados ao mesmo lead.

## Etapa 5 — Rastreamento e arquivo do lead

**Entrega:** linha do tempo comercial e funil de conversão que acompanham a jornada inteira.

- Eventos de visualização de página/produto/oferta, clique, alteração do carrinho, aceite/recusa de oferta, checkout iniciado, tentativa de pagamento, análise, confirmação, recusa, abandono e upsell.
- Registrar identificador de evento, organização, lead ou visitante, conversa quando existir, pedido, revisão, oferta, sessão, origem/UTM e horários.
- Usar identidade de visitante antes de conhecer o lead e vinculá-la somente após identificação válida. Um parâmetro de URL editável não autoriza acessar ou modificar dados de outro lead.
- Reutilizar a infraestrutura de dispositivo, sistema, navegador, IP e última interação. Localização por IP é aproximada; GPS depende de autorização e disponibilidade do navegador.
- Eventos de pagamento, itens aceitos e mudança de pedido são gravados no servidor. Webhooks reconciliam a confirmação mesmo se a aba fechar ou o rastreador do navegador for bloqueado.
- Atualizar o arquivo do lead e o contexto do agente com resumo comercial. Registrar eventos previstos em vez de copiar campos de formulários indiscriminadamente.
- Medir conversão, ticket médio, receita adicional por oferta, abandono por etapa e resultado por agente/página, evitando contagem duplicada de eventos.

**Aceite:** a compra é atribuída ao mesmo lead do WhatsApp e o CRM mostra itens originais, ofertas, frete, tentativas e resultado. Eventos de navegação não apagam dados técnicos anteriores.

## Segurança e capacidades do provedor

O Asaas documenta crédito por API e exige o IP do pagador. Débito direto não é suportado nessa integração. Para manter o requisito de página própria, não oferecer débito transparente via Asaas; avaliar separadamente um provedor compatível se essa modalidade for necessária. Tokenização em produção depende de habilitação junto ao Asaas. [Guia oficial](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito)

A captura própria mantém a infraestrutura no escopo PCI DSS; usar HTTPS não resolve sozinho todos os requisitos. Antes da ativação, mapear o caminho dos dados, confirmar a validação aplicável e implementar os controles correspondentes. Número completo e CVV não serão persistidos em CRM, logs, analytics, atendimento, armazenamento do navegador ou filas. Também revisar scripts de terceiros na página de cartão. [Orientação PCI DSS do Asaas](https://docs.asaas.com/docs/pci-dss-1)

A API de pagamento não deve ser presumida idempotente. O controle de tentativa e a reconciliação descritos na etapa 2 são necessários para evitar repetição de cobrança. [Referência do pagamento por cartão](https://docs.asaas.com/reference/pagar-uma-cobranca-com-cartao-de-credito)

## Validação e implantação

1. Implementar pedido/cálculo e cartão; integrar eventos e CRM junto de cada etapa, desde o início.
2. Conectar as ofertas existentes ao serviço único e completar as superfícies loja, produto, carrinho e checkout.
3. Implementar confirmação e upsell; liberar um clique apenas quando as capacidades da conta estiverem verificadas.
4. Testar em sandbox: aprovação, recusa, análise, timeout, duas abas, cliques repetidos, webhooks repetidos, troca Pix/cartão, sessões antigas e alterações concorrentes do carrinho.
5. Validar ofertas adicionadas/removidas, recálculo de frete, estoque, descontos, titular diferente, isolamento entre lojas, eventos sem dados de cartão e recuperação da jornada após recarregar a página.
6. Validar visualmente em 360, 390 e 1440 pixels, teclado e acessibilidade. O resumo, a oferta e a ação de pagamento devem caber numa experiência compacta; o widget do agente não pode cobrir o formulário.
7. Ativar inicialmente para uma loja por configuração controlada. Preservar os links internos já enviados pelo WhatsApp, reconciliar sessões hospedadas existentes e impedir dois meios de cobrança de competirem pelo mesmo pedido.
8. Após aprovação dos critérios, ampliar para as demais lojas. Se for necessário desativar temporariamente o cartão próprio, manter pedido/dados e métodos próprios disponíveis, sem voltar silenciosamente ao checkout externo.

Assinaturas recorrentes e débito transparente precisam de fluxos específicos e não serão tratados como cobranças avulsas por conveniência. Serviços com agenda devem preservar as regras de disponibilidade e agendamento já existentes.

**Pronto para lançamento:** compra com cartão concluída pela página própria, total consistente, dados reaproveitados, ofertas opcionais coordenadas, nenhuma cobrança duplicada nos cenários de falha, rastreamento conferido no CRM e controles de segurança validados.
