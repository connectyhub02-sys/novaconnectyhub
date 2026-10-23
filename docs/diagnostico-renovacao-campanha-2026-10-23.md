# Renovação automática após campanha — diagnóstico de 23/10/2026

Investigação somente leitura do banco de produção, das funções SQL instaladas,
do código e do Asaas. Aplicação pública saudável na versão
`772654304cbe4eed6cc4e0c555189e1e520ba147`. Sem alteração financeira, tentativa
de débito, mensagem, mudança de configuração ou deploy.

## Causa confirmada

No caso investigado, o cartão ativo e seu consentimento antecedem o vencimento.
A primeira compra promocional teve pagamento por cartão aprovado e fulfillment
registrado. A assinatura, porém, preservou `auto_charge_disabled=true` junto de
`campaign_requires_authorization=true`, oriundos do ciclo inicial da campanha.

O encadeamento foi conferido nas funções efetivamente instaladas:

1. `apply_platform_campaign_period` adiciona os dois marcadores no ciclo zero.
2. `fulfill_confirmed_billing_payment` compõe `m` a partir do payload pago e
   grava esse conjunto em `organization_subscriptions.metadata`, sem retirar
   esses marcadores após a autorização/pagamento por cartão.
3. Na preparação do ciclo seguinte, `apply_platform_campaign_period` retira os
   marcadores do pagamento novo. A assinatura permanece bloqueada.
4. `processPaidBillingLifecycleNotifications`, em
   `src/lib/billing/paid-lifecycle-notifications.ts`, consulta o bloqueio da
   assinatura antes de chamar `attemptManagedAsaasRenewal`. Por isso, a nova
   fatura sem bloqueio não basta para permitir a tentativa.

O banco confirmou zero tentativas automáticas para a assinatura e fatura de
renovação sem ID no provedor. O GET de pagamentos do cliente no Asaas retornou
HTTP 200, uma única cobrança histórica por cartão e `hasMore=false`; nenhuma
cobrança da renovação. Não há evidência de recusa bancária nessa renovação.

A política global está habilitada. A rotina criou a fatura e registrou lembretes
e aviso de vencimento, portanto há evidência de execução do ciclo financeiro
durante a janela relevante. O bloqueio identificado antecede a chamada ao Asaas.

## Alcance e próximo passo

A consulta encontrou uma assinatura com cartão ativo e a combinação dos dois
marcadores de campanha. A outra assinatura com cartão ativo está bloqueada por
ativação administrativa de contrato personalizado, com origem diferente.
Não remover `auto_charge_disabled` em massa nem tratar toda desativação como bug.

A correção deve separar o bloqueio temporário de autorização da campanha da
desativação administrativa persistente e reconhecer a autorização comprovada
do cartão. Deve cobrir a passagem compra promocional paga → assinatura → nova
fatura → elegibilidade automática, preservando Pix, ausência de consentimento,
desativações administrativas e proteções contra duplicidade.

A janela atual é D−3/D−2/D−1 após 09h de São Paulo. A assinatura investigada já
venceu; corrigir a origem do marcador não autoriza nem implementa recuperação
automática de dívida vencida. Regularização da fatura e decisão comercial sobre
continuidade do cliente são etapas separadas.

Diagnóstico concluído. Correção, testes de regressão, reparo específico dos dados
e publicação permanecem pendentes; nenhuma dessas etapas foi executada nesta
investigação. Identificadores, dados de cartão e credenciais foram omitidos deste
relatório versionável.

## Correção autorizada e preparada

O titular autorizou corrigir e publicar. A instrução posterior autorizou também
uma tentativa pontual da fatura vencida, **somente depois da correção**.

Migration `0210_campaign_card_renewal_authorization.sql`: após o fulfillment,
retira os dois marcadores temporários apenas da assinatura ligada ao pagamento
promocional aprovado, com acordo ativo, autorização original por cartão e cartão
atualmente ativo. Preserva o payload financeiro histórico e registra evento
idempotente. Cartão substituído não apaga a prova da autorização original.
Pix, ausência de fulfillment, tentativa incerta/recusada, contrato personalizado,
origem administrativa, acordo cancelado e pagamento obsoleto não liberam o bloqueio.
O RPC de reserva de renovação passa também a conferir o opt-out da assinatura.

Não há backfill em massa nem débito dentro da migration. O reparo pontual usará
o mesmo verificador; a cobrança manual autorizada é uma operação separada, com
referências fixas, reserva durável e no máximo uma chamada de débito. A janela
automática D−3/D−2/D−1 permanece igual.

Validação local: 129 testes aprovados em sete arquivos carregados pela rodada
de campanhas, contratos, ativação personalizada e regressões da nova migration.
Publicação e tentativa real ainda pendentes neste registro de preparação.

## Publicação e reparo verificados — 23/10/2026, 13h16 BRT

Release `910dbe12422896c8d5fb0efd1d3057f18e3bb7e8` publicada no slot b/3131;
slot a preserva `77265430` para retorno. Build Linux/webpack, TypeScript e 120
páginas aprovados. Candidata e domínio público confirmaram SHA/saúde, 19 assets,
autenticação das APIs e Inngest assinado com 58 funções. Builder parado.

Migration 0210 aplicada e registrada após ensaio transacional com rollback.
Reparo individual pelo mesmo verificador aplicado uma vez e auditado; repetição
retornou false. Comparações na transação confirmaram: demais assinaturas idênticas;
assinatura alvo preservada exceto os dois marcadores, o recibo de autorização e
updated_at; pagamentos, faturas, tentativas e carteira existentes preservados.
Reserva automática do vencido recusada, sem criar tentativa. ACL e trigger ativos.

Backup privado de schema e dados financeiros em
`/opt/connectyhub/app/ops/campaign-renewal-20261023/`, copiado para
`%LOCALAPPDATA%/ConnectyHub/backups/campaign-renewal-20261023/`, hashes iguais:
schema `74589646…`, dados `35f40aa7…`. Restauração integral não ensaiada.
Rollback de aplicação não reverte a migration; eventual retorno SQL exige
restaurar a função anterior e retirar o novo trigger, preservando pagamentos
posteriores. Não restaurar o dump financeiro inteiro sobre operações novas.

Até esta etapa nenhuma cobrança foi executada. A tentativa pontual autorizada
posteriormente está sendo preparada com o código financeiro publicado.

## Tentativa pontual autorizada — 23/10/2026, 13h20 BRT

Depois da correção e publicação, reconferidos a mesma fatura, valor/revisão,
cartão ativo, ausência de tentativa e ausência de cobrança correspondente no
Asaas. O script privado exige esses invariantes, reserva a tentativa pelo RPC
financeiro existente e permite no máximo uma criação de fatura externa sem
débito e uma chamada de `payWithCreditCard`. Não muda o cron nem simula data.

Foi realizada **uma única tentativa**, recusada pelo Asaas: HTTP 400,
`invalid_object`, diagnóstico `declined / check_card_limit` (verificar limite
disponível). GET posterior confirmou a mesma cobrança `PENDING`, valor correto,
referência correspondente e sem data de pagamento. Fatura externa pendente não
significa pagamento em andamento no cartão: a tentativa local terminou
`rejected`, com efeito concluído e motivo persistido.

Fatura local continua aberta, assinatura `past_due`, vencimento anterior
preservado, `paid_at` nulo e zero fulfillment para a renovação. Nenhuma segunda
tentativa ou crédito concedido. O bloqueio indevido da campanha está removido;
novas renovações elegíveis usarão a política existente após regularização,
sujeitas à aprovação do emissor. A dívida atual permanece pendente.

Evidência privada em `execute-result.jsonl` na pasta operacional acima, com
IDs fixos e contagem de chamadas; nunca repetir o modo execute para reconciliar.
Outra tentativa exige nova instrução e reconferência da mesma cobrança externa.
