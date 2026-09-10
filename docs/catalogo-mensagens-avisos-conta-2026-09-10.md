# Catálogo de avisos: agente do cliente e ConnectyHub

Exemplos gerados das funções usadas no código em 10/09/2026. **Todos os nomes, valores e datas são fictícios.** O catálogo cobre os modelos financeiros padrão e as variantes de recarga. Textos personalizados de planos e condições reais do checkout continuam sendo preservados; a amostra não representa uma cobrança existente.

## Como funciona

Atualização posterior: os avisos abaixo passam a receber também o botão e o link **Sair da lista de avisos da conta**. O aviso inicial enviado pela plataforma pode incluir **Salvar contato**. Esses elementos são acrescentados na entrega; os exemplos desta página mostram o corpo principal. Detalhes em `saida-lista-contato-2026-09-10.md`.

- Um agente cadastrado na conta e disponível envia em primeira pessoa, identificando-se como assistente virtual. A metáfora de combustível se refere aos créditos compartilhados da conta, não a vida, sentimentos ou saldo particular de cada agente.
- A plataforma mantém o texto institucional. Em uma troca de remetente após falha definitiva, também muda o texto; o número global não diz que é o agente do cliente.
- Saldo baixo descreve uma pausa condicional; saldo zero descreve a interrupção das atividades com IA. Não é estimado um horário de interrupção.
- Os textos são determinísticos: não dependem de chamada à IA, não gastam créditos e não geram novas cobranças.
- O histórico registra o remetente usado e o texto efetivamente enviado. A prévia do aviso concluído acompanha esse texto.
- Uma instância criada pela API, sem vínculo com um agente cadastrado no painel, não é escolhida automaticamente. Oferecer esse recurso a integrações externas exigiria escolha explícita da conexão, autorização revogável e definição do destinatário administrativo. Uma alternativa é entregar eventos para a integração do cliente decidir o envio; esse recurso externo não foi implementado nesta etapa.

## Modelos padrão

### Acesso perto do fim (paid_access_ending)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Quero continuar te ajudando. Vim lembrar que o período do seu plano está terminando:
>
> Carlos, seu acesso ao plano Plano Exemplo termina em 13/09/2026. Não há renovação automática desse acesso. Confira suas opções no painel: https://www.connectyhub.com.br/dashboard/planos.

**ConnectyHub**

> Carlos, seu acesso ao plano Plano Exemplo termina em 13/09/2026. Não há renovação automática desse acesso. Confira suas opções no painel: https://www.connectyhub.com.br/dashboard/planos.

### Período de acesso encerrado (paid_access_ended)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Preciso te avisar sobre o acesso que mantém meus atendimentos ativos:
>
> Carlos, o período de acesso ao plano Plano Exemplo terminou em 13/09/2026. Nenhuma nova cobrança foi criada por este aviso. Confira suas opções no painel: https://www.connectyhub.com.br/dashboard/planos.

**ConnectyHub**

> Carlos, o período de acesso ao plano Plano Exemplo terminou em 13/09/2026. Nenhuma nova cobrança foi criada por este aviso. Confira suas opções no painel: https://www.connectyhub.com.br/dashboard/planos.

### Recarga automática autorizada (credit_topup_enabled)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vou te manter por dentro das recargas automáticas que você autorizou:
>
> Carlos, sua recarga automática foi autorizada: 5.000 créditos por R$ 47,00, quando o saldo chegar a 1.000 créditos, dentro do valor mensal autorizado. Acompanhe ou desative em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, sua recarga automática foi autorizada: 5.000 créditos por R$ 47,00, quando o saldo chegar a 1.000 créditos, dentro do valor mensal autorizado. Acompanhe ou desative em https://www.connectyhub.com.br/dashboard/creditos.

### Recarga automática desativada (credit_topup_disabled)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim confirmar que sua recarga automática foi desativada:
>
> Carlos, sua recarga automática foi desativada. Os atendimentos continuam enquanto houver saldo. Para comprar créditos ou autorizar novamente, acesse https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, sua recarga automática foi desativada. Os atendimentos continuam enquanto houver saldo. Para comprar créditos ou autorizar novamente, acesse https://www.connectyhub.com.br/dashboard/creditos.

### Recarga precisa de atenção (credit_topup_action_required)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Preciso da sua atenção: a recarga automática encontrou um impedimento:
>
> Carlos, sua recarga automática precisa de atenção: o cartão autorizado está indisponível. Esta verificação não realizou uma nova cobrança. Confira seu saldo e as opções de recarga em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, sua recarga automática precisa de atenção: o cartão autorizado está indisponível. Esta verificação não realizou uma nova cobrança. Confira seu saldo e as opções de recarga em https://www.connectyhub.com.br/dashboard/creditos.

### Teste operacional (billing_operational_test)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, esta e uma mensagem de teste da ConnectyHub para validar os avisos automaticos de cobranca. Nenhuma cobranca foi feita.

**ConnectyHub**

> Carlos, esta e uma mensagem de teste da ConnectyHub para validar os avisos automaticos de cobranca. Nenhuma cobranca foi feita.

### Assinatura pendente (subscription_pending)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, recebemos sua solicitacao do plano Plano Exemplo. O pagamento ainda esta pendente. Finalize por aqui: https://www.connectyhub.com.br/dashboard/planos. Assim que confirmar, os creditos serao liberados automaticamente.

**ConnectyHub**

> Carlos, recebemos sua solicitacao do plano Plano Exemplo. O pagamento ainda esta pendente. Finalize por aqui: https://www.connectyhub.com.br/dashboard/planos. Assim que confirmar, os creditos serao liberados automaticamente.

### Troca de plano (subscription_replaced)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, trocamos sua solicitacao para o plano Plano Exemplo. O checkout anterior do plano Plano Anterior foi cancelado para evitar cobranca duplicada. Finalize por aqui: https://www.connectyhub.com.br/dashboard/planos.

**ConnectyHub**

> Carlos, trocamos sua solicitacao para o plano Plano Exemplo. O checkout anterior do plano Plano Anterior foi cancelado para evitar cobranca duplicada. Finalize por aqui: https://www.connectyhub.com.br/dashboard/planos.

### Carrinho atualizado (checkout_cart_updated)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, atualizamos seu checkout do plano Plano Exemplo. Adicionais escolhidos: Nenhum. Total atual: R$ 47,00. Finalize por aqui: https://www.connectyhub.com.br/dashboard/planos.

**ConnectyHub**

> Carlos, atualizamos seu checkout do plano Plano Exemplo. Adicionais escolhidos: Nenhum. Total atual: R$ 47,00. Finalize por aqui: https://www.connectyhub.com.br/dashboard/planos.

### Pagamento iniciado (checkout_payment_started)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Estou acompanhando seu pagamento. Ele ainda precisa de confirmação:
>
> Carlos, recebemos sua tentativa de pagamento do plano Plano Exemplo por Pix. Se ainda nao confirmou, conclua no painel: https://www.connectyhub.com.br/dashboard/planos.

**ConnectyHub**

> Carlos, recebemos sua tentativa de pagamento do plano Plano Exemplo por Pix. Se ainda nao confirmou, conclua no painel: https://www.connectyhub.com.br/dashboard/planos.

### Teste iniciado (trial_started)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, parabens. Seu teste gratis ConnectyHub foi liberado com 5.000 creditos. Assine um plano ate 13/09/2026 e o saldo restante soma aos creditos do plano escolhido.

**ConnectyHub**

> Carlos, parabens. Seu teste gratis ConnectyHub foi liberado com 5.000 creditos. Assine um plano ate 13/09/2026 e o saldo restante soma aos creditos do plano escolhido.

### Consumo do teste (trial_credit_milestone)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, você já usou 4.000 créditos do teste e ainda tem 1.000. Assine até 13/09/2026 para somar esse saldo aos créditos do plano escolhido.

**ConnectyHub**

> Carlos, você já usou 4.000 créditos do teste e ainda tem 1.000. Assine até 13/09/2026 para somar esse saldo aos créditos do plano escolhido.

### Teste faltando 3 dias (trial_three_days_remaining)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, faltam 3 dias para seu teste ConnectyHub acabar. Você ainda tem 1.000 créditos de bônus. Assine até 13/09/2026 para somar esse saldo ao plano escolhido; depois disso o saldo expira.

**ConnectyHub**

> Carlos, faltam 3 dias para seu teste ConnectyHub acabar. Você ainda tem 1.000 créditos de bônus. Assine até 13/09/2026 para somar esse saldo ao plano escolhido; depois disso o saldo expira.

### Ultimo dia do teste (trial_one_day_remaining)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, último dia do seu teste ConnectyHub. Ele expira em 13/09/2026. Você ainda tem 1.000 créditos; se assinar agora, esse saldo soma ao plano escolhido. Depois do prazo, ele zera.

**ConnectyHub**

> Carlos, último dia do seu teste ConnectyHub. Ele expira em 13/09/2026. Você ainda tem 1.000 créditos; se assinar agora, esse saldo soma ao plano escolhido. Depois do prazo, ele zera.

### Teste sem creditos (trial_no_credits)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, seus creditos do teste acabaram. Para reativar atendimentos automaticos, IA e voz, escolha um plano no painel ConnectyHub.

**ConnectyHub**

> Carlos, seus creditos do teste acabaram. Para reativar atendimentos automaticos, IA e voz, escolha um plano no painel ConnectyHub.

### Teste expirado (trial_expired)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Preciso te avisar sobre o acesso que mantém meus atendimentos ativos:
>
> Carlos, seu teste gratis ConnectyHub acabou em 13/09/2026. O saldo restante do beneficio expirou. Para reativar atendimentos automaticos, escolha um plano no painel.

**ConnectyHub**

> Carlos, seu teste gratis ConnectyHub acabou em 13/09/2026. O saldo restante do beneficio expirou. Para reativar atendimentos automaticos, escolha um plano no painel.

### Pagamento pendente (payment_pending)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Estou acompanhando seu pagamento. Ele ainda precisa de confirmação:
>
> Carlos, seu pagamento do plano Plano Exemplo ainda está em confirmação. Não repita a cobrança. Assim que o pagamento for confirmado, seus créditos serão liberados e eu aviso por aqui.

**ConnectyHub**

> Carlos, seu pagamento do plano Plano Exemplo ainda está em confirmação. Não repita a cobrança. Assim que o pagamento for confirmado, seus créditos serão liberados e eu aviso por aqui.

### Pagamento aprovado (payment_approved)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Recebi a confirmação do seu pagamento e vim te avisar:
>
> Carlos, pagamento confirmado. Seu plano Plano Exemplo foi ativado na ConnectyHub com 5.000 creditos inclusos. Se havia saldo de teste ainda valido, ele foi somado na sua carteira. Valor: R$ 47,00.

**ConnectyHub**

> Carlos, pagamento confirmado. Seu plano Plano Exemplo foi ativado na ConnectyHub com 5.000 creditos inclusos. Se havia saldo de teste ainda valido, ele foi somado na sua carteira. Valor: R$ 47,00.

### Pagamento recusado (payment_rejected)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te avisar que o pagamento não foi aprovado. Preciso da sua atenção para regularizar:
>
> Carlos, o pagamento do plano Plano Exemplo não foi aprovado. Seus dados continuam salvos, mas para liberar os atendimentos você precisa concluir o pagamento no painel.

**ConnectyHub**

> Carlos, o pagamento do plano Plano Exemplo não foi aprovado. Seus dados continuam salvos, mas para liberar os atendimentos você precisa concluir o pagamento no painel.

### Pagamento cancelado (payment_canceled)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Recebi a informação de que o pagamento foi cancelado. Confira os detalhes:
>
> Carlos, a cobrança do plano Plano Exemplo foi cancelada. Se quiser continuar, confira as opções de pagamento no seu painel.

**ConnectyHub**

> Carlos, a cobrança do plano Plano Exemplo foi cancelada. Se quiser continuar, confira as opções de pagamento no seu painel.

### Pagamento estornado (payment_refunded)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Recebi a confirmação do estorno e vim te atualizar:
>
> Carlos, o estorno do pagamento do plano Plano Exemplo foi confirmado. O prazo para aparecer na fatura depende do banco emissor. Acompanhe pelo painel.

**ConnectyHub**

> Carlos, o estorno do pagamento do plano Plano Exemplo foi confirmado. O prazo para aparecer na fatura depende do banco emissor. Acompanhe pelo painel.

### Plano ativado manualmente (manual_plan_activated)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, seu plano Plano Exemplo foi ativado manualmente pela equipe ConnectyHub com 5.000 creditos. Ele fica valido ate 13/09/2026. Boas vendas.

**ConnectyHub**

> Carlos, seu plano Plano Exemplo foi ativado manualmente pela equipe ConnectyHub com 5.000 creditos. Ele fica valido ate 13/09/2026. Boas vendas.

### Plano renovado manualmente (manual_plan_renewed)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, seu plano Plano Exemplo foi renovado manualmente pela equipe ConnectyHub. O novo ciclo vence em 13/09/2026 e seus creditos disponiveis sao 1.000.

**ConnectyHub**

> Carlos, seu plano Plano Exemplo foi renovado manualmente pela equipe ConnectyHub. O novo ciclo vence em 13/09/2026 e seus creditos disponiveis sao 1.000.

### Plano faltando 3 dias (paid_plan_three_days_remaining)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Quero continuar te ajudando. Vim lembrar que o período do seu plano está terminando:
>
> Carlos, seu plano Plano Exemplo vence em 3 dias, em 13/09/2026. Você ainda tem 1.000 créditos. Renove antes do vencimento para manter seus agentes atendendo sem pausa.

**ConnectyHub**

> Carlos, seu plano Plano Exemplo vence em 3 dias, em 13/09/2026. Você ainda tem 1.000 créditos. Renove antes do vencimento para manter seus agentes atendendo sem pausa.

### Renovacao Pix diaria (paid_plan_renewal_reminder)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Quero continuar te ajudando. Vim lembrar que o período do seu plano está terminando:
>
> Carlos, seu plano Plano Exemplo vence em 3 dia(s), em 13/09/2026. Para manter painel e agentes ativos, renove por Pix ou cartao no painel: https://www.connectyhub.com.br/dashboard/planos.

**ConnectyHub**

> Carlos, seu plano Plano Exemplo vence em 3 dia(s), em 13/09/2026. Para manter painel e agentes ativos, renove por Pix ou cartao no painel: https://www.connectyhub.com.br/dashboard/planos.

### Plano faltando 1 dia (paid_plan_one_day_remaining)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Quero continuar te ajudando. Vim lembrar que o período do seu plano está terminando:
>
> Carlos, seu plano Plano Exemplo vence em 1 dia, em 13/09/2026. Para evitar pausa nos atendimentos automaticos, renove pelo painel.

**ConnectyHub**

> Carlos, seu plano Plano Exemplo vence em 1 dia, em 13/09/2026. Para evitar pausa nos atendimentos automaticos, renove pelo painel.

### Plano vence hoje (paid_plan_due_today)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Quero continuar te ajudando. Vim lembrar que o período do seu plano está terminando:
>
> Carlos, seu plano Plano Exemplo vence hoje (13/09/2026). Renove ainda hoje para manter seus agentes e painel ativos: https://www.connectyhub.com.br/dashboard/planos.

**ConnectyHub**

> Carlos, seu plano Plano Exemplo vence hoje (13/09/2026). Renove ainda hoje para manter seus agentes e painel ativos: https://www.connectyhub.com.br/dashboard/planos.

### Plano em carencia (paid_plan_grace_period)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Preciso te avisar sobre o acesso que mantém meus atendimentos ativos:
>
> Carlos, seu plano Plano Exemplo venceu em 13/09/2026 e esta em carencia ha 1 dia(s). Regularize para evitar bloqueio dos agentes: https://www.connectyhub.com.br/dashboard/planos.

**ConnectyHub**

> Carlos, seu plano Plano Exemplo venceu em 13/09/2026 e esta em carencia ha 1 dia(s). Regularize para evitar bloqueio dos agentes: https://www.connectyhub.com.br/dashboard/planos.

### Plano vencido (paid_plan_expired)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Preciso te avisar sobre o acesso que mantém meus atendimentos ativos:
>
> Carlos, seu plano Plano Exemplo venceu em 13/09/2026. Seus dados continuam salvos, mas recursos pagos ficam pausados ate a renovacao.

**ConnectyHub**

> Carlos, seu plano Plano Exemplo venceu em 13/09/2026. Seus dados continuam salvos, mas recursos pagos ficam pausados ate a renovacao.

### Cartao falhou D-3 (payment_card_retry_failed)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te avisar que o pagamento não foi aprovado. Preciso da sua atenção para regularizar:
>
> Carlos, tentamos renovar seu plano Plano Exemplo no cartao, mas o pagamento nao foi aprovado. Atualize o cartao ou pague por Pix antes de 13/09/2026: https://www.connectyhub.com.br/dashboard/planos.

**ConnectyHub**

> Carlos, tentamos renovar seu plano Plano Exemplo no cartao, mas o pagamento nao foi aprovado. Atualize o cartao ou pague por Pix antes de 13/09/2026: https://www.connectyhub.com.br/dashboard/planos.

### Creditos abaixo de 20% (paid_low_credits_20)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Estou ficando sem combustível para atender. Restam 1.000 créditos no saldo compartilhado da sua conta. Se esse saldo acabar, meus atendimentos que usam IA ficam pausados até uma recarga. Acompanhe o saldo e as opções no painel: https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, seu saldo está baixo: restam 1.000 créditos ConnectyHub. Eles são usados pela IA nos seus projetos e atendimentos. Acompanhe o consumo ou compre mais créditos: https://www.connectyhub.com.br/dashboard/creditos.

### Creditos abaixo de 10% (paid_low_credits_10)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Meu combustível está perto de acabar. Restam 1.000 créditos no saldo compartilhado da sua conta. Se esse saldo acabar, meus atendimentos que usam IA ficam pausados até uma recarga. Acompanhe o saldo e as opções no painel: https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, restam apenas 1.000 créditos ConnectyHub. Recarregue para continuar as atividades de IA que utilizam saldo: https://www.connectyhub.com.br/dashboard/creditos.

### Plano sem creditos (paid_no_credits)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Fiquei sem créditos para continuar os atendimentos com IA. O saldo compartilhado da sua conta acabou e aguardo uma recarga para retomar essas atividades. A mensalidade do plano é separada. Acompanhe o saldo e as opções no painel: https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, seu saldo de créditos acabou. Novas atividades de IA que consomem saldo aguardam uma recarga. A mensalidade do plano é separada. Veja seu consumo e compre créditos: https://www.connectyhub.com.br/dashboard/creditos.

### Assinatura pausada (subscription_paused)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, sua assinatura ConnectyHub esta pausada. Acesse o painel para regularizar e manter os atendimentos ativos.

**ConnectyHub**

> Carlos, sua assinatura ConnectyHub esta pausada. Acesse o painel para regularizar e manter os atendimentos ativos.

### Assinatura cancelada (subscription_canceled)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, sua assinatura ConnectyHub foi cancelada. O painel continua acessivel, mas recursos pagos dependem de um plano ativo.

**ConnectyHub**

> Carlos, sua assinatura ConnectyHub foi cancelada. O painel continua acessivel, mas recursos pagos dependem de um plano ativo.

### Atualizacao geral (billing_update)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te trazer uma atualização da sua conta ConnectyHub:
>
> Carlos, tivemos uma atualizacao no billing ConnectyHub referente ao plano Plano Exemplo. Acompanhe pelo painel.

**ConnectyHub**

> Carlos, tivemos uma atualizacao no billing ConnectyHub referente ao plano Plano Exemplo. Acompanhe pelo painel.

## Resultados de recarga manual e automática

### Recarga manual (payment_pending)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Estou acompanhando seu pagamento. Ele ainda precisa de confirmação:
>
> Carlos, o pagamento da sua recarga está em conferência. Não repita a cobrança. Avisarei quando houver confirmação. Acompanhe em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, o pagamento da sua recarga está em conferência. Não repita a cobrança. Avisarei quando houver confirmação. Acompanhe em https://www.connectyhub.com.br/dashboard/creditos.

### Recarga manual (payment_approved)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Recebi a confirmação do seu pagamento e vim te avisar:
>
> Carlos, sua recarga foi confirmada: 5.000 créditos adicionados à conta, por R$ 47,00. Acompanhe o saldo em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, sua recarga foi confirmada: 5.000 créditos adicionados à conta, por R$ 47,00. Acompanhe o saldo em https://www.connectyhub.com.br/dashboard/creditos.

### Recarga manual (payment_rejected)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te avisar que o pagamento não foi aprovado. Preciso da sua atenção para regularizar:
>
> Carlos, não foi possível concluir sua recarga. Confira o cartão e a autorização antes de uma nova tentativa. Seus atendimentos continuam enquanto houver saldo. Acesse https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, não foi possível concluir sua recarga. Confira o cartão e a autorização antes de uma nova tentativa. Seus atendimentos continuam enquanto houver saldo. Acesse https://www.connectyhub.com.br/dashboard/creditos.

### Recarga manual (payment_canceled)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Recebi a informação de que o pagamento foi cancelado. Confira os detalhes:
>
> Carlos, o pagamento da sua recarga foi cancelado. Confira o saldo e as opções para continuar em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, o pagamento da sua recarga foi cancelado. Confira o saldo e as opções para continuar em https://www.connectyhub.com.br/dashboard/creditos.

### Recarga manual (payment_refunded)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Recebi a confirmação do estorno e vim te atualizar:
>
> Carlos, o estorno do pagamento da sua recarga foi confirmado. Confira o saldo atualizado e o histórico em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, o estorno do pagamento da sua recarga foi confirmado. Confira o saldo atualizado e o histórico em https://www.connectyhub.com.br/dashboard/creditos.

### Recarga automática (payment_pending)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Estou acompanhando seu pagamento. Ele ainda precisa de confirmação:
>
> Carlos, o pagamento da sua recarga automática está em conferência. Não repita a cobrança. Avisarei quando houver confirmação. Acompanhe em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, o pagamento da sua recarga automática está em conferência. Não repita a cobrança. Avisarei quando houver confirmação. Acompanhe em https://www.connectyhub.com.br/dashboard/creditos.

### Recarga automática (payment_approved)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Recebi a confirmação do seu pagamento e vim te avisar:
>
> Carlos, sua recarga automática foi confirmada: 5.000 créditos adicionados à conta, por R$ 47,00. Acompanhe o saldo em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, sua recarga automática foi confirmada: 5.000 créditos adicionados à conta, por R$ 47,00. Acompanhe o saldo em https://www.connectyhub.com.br/dashboard/creditos.

### Recarga automática (payment_rejected)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Vim te avisar que o pagamento não foi aprovado. Preciso da sua atenção para regularizar:
>
> Carlos, não foi possível concluir sua recarga automática. Confira o cartão e a autorização antes de uma nova tentativa. Seus atendimentos continuam enquanto houver saldo. Acesse https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, não foi possível concluir sua recarga automática. Confira o cartão e a autorização antes de uma nova tentativa. Seus atendimentos continuam enquanto houver saldo. Acesse https://www.connectyhub.com.br/dashboard/creditos.

### Recarga automática (payment_canceled)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Recebi a informação de que o pagamento foi cancelado. Confira os detalhes:
>
> Carlos, o pagamento da sua recarga automática foi cancelado. Confira o saldo e as opções para continuar em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, o pagamento da sua recarga automática foi cancelado. Confira o saldo e as opções para continuar em https://www.connectyhub.com.br/dashboard/creditos.

### Recarga automática (payment_refunded)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Recebi a confirmação do estorno e vim te atualizar:
>
> Carlos, o estorno do pagamento da sua recarga automática foi confirmado. Confira o saldo atualizado e o histórico em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, o estorno do pagamento da sua recarga automática foi confirmado. Confira o saldo atualizado e o histórico em https://www.connectyhub.com.br/dashboard/creditos.

### Recarga impedida: monthly_cap (credit_topup_action_required)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Preciso da sua atenção: a recarga automática encontrou um impedimento:
>
> Carlos, sua recarga automática precisa de atenção: o valor mensal autorizado para compras automáticas foi atingido. Esta verificação não realizou uma nova cobrança. Confira seu saldo e as opções de recarga em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, sua recarga automática precisa de atenção: o valor mensal autorizado para compras automáticas foi atingido. Esta verificação não realizou uma nova cobrança. Confira seu saldo e as opções de recarga em https://www.connectyhub.com.br/dashboard/creditos.

### Recarga impedida: offer_changed (credit_topup_action_required)

**Agente do cliente**

> Sou Ana, seu assistente virtual.
>
> Preciso da sua atenção: a recarga automática encontrou um impedimento:
>
> Carlos, sua recarga automática precisa de atenção: as condições do pacote mudaram e precisamos de uma nova autorização. Esta verificação não realizou uma nova cobrança. Confira seu saldo e as opções de recarga em https://www.connectyhub.com.br/dashboard/creditos.

**ConnectyHub**

> Carlos, sua recarga automática precisa de atenção: as condições do pacote mudaram e precisamos de uma nova autorização. Esta verificação não realizou uma nova cobrança. Confira seu saldo e as opções de recarga em https://www.connectyhub.com.br/dashboard/creditos.

## Estado da entrega

Alterações locais, ainda sem publicação. Nenhuma mensagem real foi enviada. O roteamento e a fila anteriores continuam dependendo das migrações 0120 e 0121. A personalização de voz não cria uma nova migração.

Validação desta etapa: 59 testes aprovados, incluindo texto conforme o remetente real, troca de voz na contingência, preservação de dados financeiros e exclusão de instâncias avulsas da API. ESLint sem erros (um aviso preexistente). Compilação de produção concluída, incluindo TypeScript e 93 páginas estáticas.
