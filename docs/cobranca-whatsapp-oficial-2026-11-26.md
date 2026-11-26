# Cobrança das mensagens do WhatsApp oficial — 26/11/2026

## Decisão do titular

Em 26/11/2026, Magno definiu a regra:

- O cliente não deve cadastrar cartão na Meta. Ele paga tudo na ConnectyHub.
- O que a Meta cobra, a ConnectyHub cobra em dobro.
- O que a Meta não cobra também sai grátis para o cliente.

A cobrança é separada dos créditos de IA, em **reais**, e aparece separada no painel do cliente e no centro de custo do admin.

Esta decisão substitui a pendência registrada em 11/10 sobre cobrar 2× por mensagem entregue. A dependência externa continua: para o cliente não pagar a Meta diretamente, a WABA dele precisa estar ligada a uma linha de crédito da ConnectyHub (Solution Partner) ou de um parceiro.

## Como a Meta cobra (conferido em 26/11/2026)

- A cobrança é por mensagem entregue, desde 01/07/2025. Mensagem não entregue não é cobrada.
- O preço depende da categoria e do país do destinatário.
- Tabela BRL do Brasil, vigente desde 01/10/2026:

| Categoria | Custo Meta | Cliente paga (2×) |
|---|---|---|
| Marketing | R$ 0,3217 | R$ 0,6434 |
| Utilidade | R$ 0,035 | R$ 0,07 |
| Autenticação | R$ 0,035 | R$ 0,07 |
| Atendimento | R$ 0,035 | R$ 0,07 |

- O atendimento tem 1.000 mensagens grátis por mês por número. Desde 01/10/2026, utilidade dentro da janela de 24h também passou a ser cobrada.
- Conversas abertas por anúncio Click-to-WhatsApp são grátis durante a janela da Meta.
- A Meta muda a tabela em 1º de janeiro, abril, julho e outubro.
- O webhook de status traz `pricing` com `type` (`regular` = cobrado) e `category`.

Os valores vieram de fontes secundárias concordantes e batem com o modelo da página oficial. **Conferir a tabela oficial BRL antes de vender.** O admin registra novas tarifas com vigência.

## Implementação

Migration `0228_meta_message_billing.sql`, branch `claude/whatsapp-message-billing-20261126`, commit `b2635c8b`.

- `meta_whatsapp_connections.billing_mode`: `customer_meta` (padrão; o cliente paga a Meta) ou `connectyhub_credit_line`. Só no segundo modo há cobrança no saldo.
- O modo só muda pelo admin, com confirmação explícita de que a linha de crédito já foi compartilhada com a WABA. A mudança fica registrada em `maintenance_audit_logs`.
- Tabelas:
  - `meta_message_wallets`: carteira em R$ da organização responsável pela cobrança, com saldo, reservado e diferença pendente.
  - `meta_message_ledger`: extrato.
  - `meta_message_charges`: uma linha por envio.
  - `meta_message_rates`: tarifas com histórico e multiplicador, preço gerado.
  - `meta_message_markets`: prefixo do país para o mercado. Hoje só existe 55 → BR.
- Todas as funções e tabelas são acessíveis somente pelo `service_role`.

Fluxo de uma mensagem:

1. `sendOfficialMessage` reserva o preço da categoria esperada antes de registrar e enviar.
   - Categoria esperada: a do modelo, ou atendimento para respostas livres.
   - Sem saldo, com diferença pendente ou sem tarifa para o destino, **nada é enviado**.
2. A reserva é vinculada à mensagem. Se a Meta recusar de forma definitiva, a reserva é devolvida. Se o resultado for incerto, ela fica retida.
3. O webhook guarda `pricing` em `meta_whatsapp_receipts.pricing` e chama `record_meta_message_pricing`.
   - A função reconcilia a partir dos recibos, por isso funciona mesmo se o aviso da Meta chegar antes do identificador da mensagem.
   - Entregue com `regular`: debita 2× a tarifa da categoria que a Meta cobrou.
   - Entregue grátis: devolve a reserva e marca como `free`.
   - Falha: devolve a reserva.
   - Tudo isso é idempotente.
4. Se a Meta cobrar uma categoria mais cara que a reservada e faltar saldo, a diferença vira `debt_brl`. A diferença bloqueia novos envios e é quitada na próxima recarga.
5. Um cron horário do Inngest (`connectyhub-meta-message-charges`) cuida das pendências:
   - reserva sem entrega há 31 dias é devolvida;
   - mensagem entregue sem dados de cobrança há 2 dias é cobrada pela categoria esperada.
6. Campanhas:
   - Ao iniciar, o sistema confere `destinatários pendentes × preço` contra o saldo disponível.
   - Na revisão, o cliente vê o custo máximo e o saldo.
   - Se faltar saldo durante a fila, a campanha pausa e o destinatário volta para pendente, sem ser descartado.

Recarga:

- Há quatro produtos ocultos, "Saldo WhatsApp oficial R$ 50/100/250/500", com `metadata.product_kind = meta_message_balance`. Eles são comprados pelo checkout atual, por Pix ou cartão.
- O trigger em `billing_payment_fulfillments` credita o valor no saldo em R$, nunca em créditos de IA. É idempotente por pagamento.
- Esses produtos podem ser comprados de novo.

Painéis:

- **Cliente**, em `/dashboard/creditos`, agora chamado "Saldo e créditos":
  - dois cartões separados, Créditos de IA (em créditos) e Saldo WhatsApp oficial (em R$);
  - números indicando quem paga a Meta;
  - tabela de preços, consumo do mês, recarga e extrato;
  - a seção de créditos de IA continua abaixo.
- **Admin**, em Financeiro: bloco "WhatsApp oficial (Meta)" com:
  - receita, custo Meta, margem e recargas do mês;
  - saldo guardado para clientes, reservado e diferenças pendentes;
  - categorias e clientes;
  - troca do modo de faturamento por número;
  - tarifas e ajuste manual.
  - O centro de custo de IA não foi alterado.

## Verificação

- Migration ensaiada duas vezes em produção, em transação desfeita. Foram confirmados:
  - padrão sem cobrança;
  - bloqueio sem saldo e para destino sem tarifa;
  - crédito idempotente;
  - reserva idempotente;
  - aviso da Meta antes do identificador da mensagem;
  - cobrança única de R$ 0,6434 em marketing;
  - diferença de categoria virando pendência, bloqueando envios e sendo quitada pela recarga;
  - mensagem grátis e falha sem cobrança;
  - relatório, nova tarifa, expiração e permissões (anon/authenticated sem acesso).
- Backup `/var/backups/connectyhub/manual/pre-0228-20261126T131457Z.dump` (639 MB, SHA-256 `6411fcf5…`, legível por `pg_restore -l`).
- Migration aplicada e registrada como 0228. Os dois números conectados em produção ficaram em `customer_meta`.
- Testes:
  - 79 testes em 11 arquivos relacionados passaram, incluindo o novo teste de política e o de campanha pausada sem saldo;
  - tipos e lint dos arquivos alterados aprovados;
  - na suíte completa, as 8 falhas restantes também ocorrem no commit de produção anterior (`2b192c8a`), sem estas mudanças. As demais variaram entre execuções por tempo esgotado.

## Publicação

Release `b2635c8b` ativa no slot b em 26/11/2026; slot a (`54575794`) preservado. O Inngest foi ressincronizado. As telas autenticadas ainda não foram conferidas no navegador.

## Solution Partner (pesquisa de 26/11/2026)

- Só um Solution Partner tem linha de crédito e fatura o uso da API diretamente aos clientes. Ele é responsável perante a Meta por todo o gasto das WABAs que usam a sua linha.
- Solution Partner é um status de Meta Business Partner pedido à parte. A documentação diz que é um processo longo, sem critérios públicos.
- O upgrade para Tech Partner é outro processo. Exige 2.500 mensagens por dia em média, 10 contas ativas e treinamento Blueprint, e mesmo assim **não** dá linha de crédito.
- A API de compartilhamento de crédito lista as moedas AUD, EUR, GBP, IDR, INR e USD. **BRL não aparece.** Confirmar com a Meta como fica a linha de crédito para o Brasil.
- Uma linha de crédito não pode ser trocada depois de anexada a uma WABA. Se um parceiro for usado como ponte, a migração posterior precisa ser planejada.
- Alternativa enquanto isso: Multi-Partner Solution com um Solution Partner existente, que compartilha a linha de crédito dele com os clientes cadastrados pelo nosso Embedded Signup (`extras.setup.solutionID`).

## Limites e pendências

- **Nenhum número está faturado pela ConnectyHub.** Antes de trocar um número para `connectyhub_credit_line`:
  1. Obter a linha de crédito: ser Solution Partner ou contratar um parceiro.
  2. Compartilhá-la com a WABA do cliente.
  3. Fazer um piloto com envio real: entrega, cobrança única, falha sem cobrança e conciliação com a fatura do fornecedor.
- Ainda não houve envio real cobrado, nem compra real de recarga.
- Só há tarifa para o Brasil. Destinos de outros países são bloqueados quando o número é faturado pela ConnectyHub.
- O estorno de uma recarga não debita o saldo automaticamente. Tratar manualmente pelo ajuste.
- A integração por API de coexistência (`connectyhub_meta_coexistence`) não passa por este saldo.
- Ainda não existe recarga automática do saldo em R$.
- Margem no admin é antes de impostos, taxas do checkout e custos fixos. O custo real é o da fatura da Meta ou do parceiro.
