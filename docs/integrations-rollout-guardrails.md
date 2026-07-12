# Central de Integracoes - Guardrails de rollout

## Fase 0 - Mercado Pago protegido

O Mercado Pago ja possui um fluxo funcional no catalogo de vendas. A Central de Integracoes deve reaproveitar esse estado e direcionar o usuario para o fluxo existente, sem recriar ou alterar a cobranca nesta primeira etapa.

Pontos protegidos:

- `src/components/connectyhub-os/sales-catalog-console.tsx`
  - UI atual de conexao, reconexao e desconexao do Mercado Pago.
  - Mensagens de status do usuario.
  - Fluxo de checkout Pix/cartao dentro do catalogo.
- `src/app/api/dashboard/sales-catalog/route.ts`
  - Acao de inicio OAuth do Mercado Pago.
  - Salvamento de webhook secret.
  - Desconexao da conta do cliente.
- `src/app/api/dashboard/sales-catalog/payments/mercado-pago/connect/route.ts`
  - Entrada guiada para OAuth.
- `src/app/api/dashboard/sales-catalog/payments/mercado-pago/callback/route.ts`
  - Retorno oficial OAuth e persistencia dos tokens.
- `src/app/api/webhooks/mercado-pago/route.ts`
  - Recebimento de eventos de pagamento.
- `src/lib/sales-catalog/mercado-pago.ts`
  - Configuracao OAuth, renovacao de token e chamadas de pagamento.
- `supabase/migrations/0023_sales_catalog_payment_gateway_skus.sql`
  - Tabelas `sales_catalog_payment_integrations` e `sales_catalog_payment_sessions`.

Regra de implementacao:

1. A Central de Integracoes pode ler `sales_catalog_payment_integrations` para mostrar status.
2. A Central de Integracoes pode apontar o usuario para `/dashboard/links`, onde o fluxo atual vive.
3. A Central de Integracoes nao deve duplicar tokens, callbacks ou webhooks do Mercado Pago.
4. Qualquer mudanca futura no Mercado Pago precisa validar: OAuth, callback, webhook, geracao de checkout/Pix, atualizacao de pedido e exibicao de status no painel.

## Fase 1 - Central sem risco

A primeira versao da Central deve nascer como uma camada transversal:

- Mostrar status do Mercado Pago sem alterar sua integracao.
- Exibir Meta/Google em modo acompanhamento planejado.
- Exibir E-commerce, Agenda, Envios e Webhook Universal como blocos de produto.
- Usar SQL novo somente para o modelo base e Webhook Universal.

## Fase 2 - Modelo base

O modelo novo fica separado das tabelas de pagamento atuais. Isso evita que a evolucao de Meta, Google, E-commerce, Agenda, Frete e Webhook Universal quebre o checkout ja entregue.
