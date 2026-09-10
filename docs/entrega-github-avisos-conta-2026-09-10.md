# Entrega dos avisos da conta

Este conjunto reúne o roteamento pelo agente do cliente com contingência da ConnectyHub, os avisos financeiros e de recarga, a voz conforme o remetente, a saída da lista, a reativação no painel e o cartão de contato no início do cadastro.

## Aplicação em produção

O envio ao GitHub não aplica mudanças no banco. Antes de publicar esta versão da aplicação, aplicar nesta ordem:

1. `0120_notification_sender_preferences.sql`
2. `0121_account_billing_notice_outbox.sql`
3. `0122_account_notice_opt_out.sql`

Essas tabelas e funções são necessárias ao novo fluxo de envio. Sem elas, os avisos não podem concluir as verificações de remetente e preferência do destinatário.

As validações anteriores de código, SQL local, interface e compilação foram concluídas. Ainda não foram aplicadas as migrações no banco de produção nem realizados novos envios ou cobranças reais nesta entrega. Conferir os botões e o cartão de contato no WhatsApp real após ativação.

## Documentação

- `entrega-remetente-avisos-conta-2026-09-10.md`: seleção e configuração do remetente.
- `cobertura-avisos-financeiros-conta-2026-09-10.md`: eventos cobertos e correções financeiras.
- `catalogo-mensagens-avisos-conta-2026-09-10.md`: textos de exemplo por remetente.
- `saida-lista-contato-2026-09-10.md`: saída da lista, reativação e contato.
- `verificacao-recarga-e-avisos-creditos-2026-09-10.md`: auditoria inicial, preservada como registro histórico.

As seções de estado local nos relatórios acima registram o momento de suas respectivas verificações; não comprovam ativação em produção.
