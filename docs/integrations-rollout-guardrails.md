# Central de Integracoes - Guardrails de rollout

## Fase 0 - Mercado Pago em standby

O Mercado Pago ja possui codigo funcional no catalogo de vendas, mas a conexao fica oculta no painel do cliente enquanto a conta/aplicativo oficial nao estiver liberada. O codigo deve continuar preservado para reativacao futura, sem remover rotas, helpers, webhooks ou historico de sessoes existentes.

Pontos protegidos:

- `src/components/connectyhub-os/sales-catalog-console.tsx`
  - Mensagens antigas de retorno OAuth do Mercado Pago.
  - Fluxo de checkout Pix/cartao em sessoes Mercado Pago ja criadas.
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

1. Nao deletar codigo Mercado Pago.
2. Nao exibir Mercado Pago como opcao principal para clientes durante o rollout PagBank.
3. Manter compatibilidade com sessoes antigas `provider = mercado_pago`.
4. Qualquer reativacao futura precisa validar: OAuth, callback, webhook, geracao de checkout/Pix, cartao, atualizacao de pedido e exibicao de status no painel.

## Fase 1 - PagBank principal

O PagBank passa a ser o gateway principal para pagamentos recebidos pelos clientes da ConnectyHub.

Fluxo do cliente:

1. O painel mostra um unico botao: Conectar PagBank.
2. O botao abre diretamente a URL oficial `connect.pagbank.com.br/oauth2/authorize`.
3. Quem ja tem conta faz login e autoriza as permissoes PagBank.
4. Quem nao tem conta usa o link indicado separado, configurado em `PAGBANK_AFFILIATE_CONNECT_URL`, e depois volta para conectar.
5. Apos autorizar, o PagBank retorna para `/api/dashboard/sales-catalog/payments/pagbank/callback`.
6. A ConnectyHub troca o `code` por `access_token` e `refresh_token`, salva a conexao e libera Pix no checkout.

Pontos obrigatorios:

- `PAGBANK_CLIENT_ID`, `PAGBANK_CLIENT_SECRET` e `PAGBANK_CONNECT_TOKEN` precisam estar no cofre/env.
- `PAGBANK_REDIRECT_URI` deve bater com o app PagBank.
- `PAGBANK_WEBHOOK_TOKEN` deve ser configurado antes da producao.
- O checkout de venda do cliente deve usar `provider = pagbank`.
- Pagamentos de billing/produtos da propria ConnectyHub podem continuar usando Mercado Pago enquanto nao forem migrados.

## Fase 2 - Central sem risco

A primeira versao da Central deve nascer como uma camada transversal:

- Mostrar status do PagBank como pagamento principal.
- Exibir Meta/Google em modo acompanhamento planejado.
- Exibir E-commerce, Agenda, Envios e Webhook Universal como blocos de produto.
- Usar SQL novo somente para o modelo base e Webhook Universal.

## Fase 3 - Modelo base

O modelo novo fica separado das tabelas de pagamento atuais. Isso evita que a evolucao de Meta, Google, E-commerce, Agenda, Frete e Webhook Universal quebre o checkout ja entregue.
