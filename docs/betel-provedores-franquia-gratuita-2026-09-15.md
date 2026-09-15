# Betel: franquias gratuitas dos provedores — 15/09/2026

Decisão do titular transmitida pela coordenação: Gecko principal, seguida por Bright Data e Apify sequencialmente; estas duas últimas somente dentro de franquia gratuita comprovada, sem excedentes ou recarga. Esta auditoria apenas consultou contas e preparou evidência. Não publicou o novo fluxo nem iniciou coletas.

## Apify

Conta autenticada no navegador **BetelLeiloes / Betel Personal**. O token efetivo do `app_config` foi usado apenas em GET `/v2/users/me` e `/v2/users/me/limits`, ambos HTTP200 às 22:06:13 UTC, confirmando a mesma identidade.

- Plano `FREE`, `isPaying:false`, mensalidade zero e US$5 de uso incluído.
- Limite efetivo `maxMonthlyUsageUsd:5`, uso `0.0856113373680101` dólar. A interface arredonda para US$0,09 usados e US$4,91 restantes.
- Billing → Limits informa expressamente que os serviços pausam ao atingir o limite, até o próximo período.
- Subscription mostra nenhum método de pagamento cadastrado.

São evidências de franquia e bloqueio na conta atual. Tarifas unitárias dos atores continuam existindo e consomem essa franquia; não significa capacidade ilimitada ou gratuidade de qualquer ator/assinatura. Nenhum ator foi executado, contratado ou repetido nesta auditoria. [Referência de cobrança](https://docs.apify.com/account/billing), [API de limites](https://docs.apify.com/api/v2/users-me-limits-get).

## Bright Data

GET `/status` com a chave efetiva confirmou a mesma conta visível no Perfil do navegador. Billing → Overview mostrou saldo depositado US$0, consumo monetário US$0 e 5.000/5.000 créditos gratuitos, renovando em 01/10. Configurações de pagamento mostraram nenhum método cadastrado. O detalhe de créditos inclui a zona existente `serp_api1`; os totais visíveis não permitem calcular consumo preciso por chamada.

A [regra oficial de franquia gratuita](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier) inclui SERP API: sem fundos depositados, as chamadas são bloqueadas quando a franquia acaba. Com fundos, o consumo passa automaticamente ao saldo pago. Portanto, esta evidência depende de manter a conta sem depósitos, recarga ou mudança de plano.

GET `/customer/balance` retornou403 para a chave atual. Não ampliamos permissões: a confirmação de saldo vem do painel autenticado. GET `/status` sem zona retornou `zone_not_found`; não equivale a teste da SERP nem prova que a zona configurada falha. A área de usuários/chaves apresentou erro interno ao carregar, mas o Perfil e as páginas de faturamento estavam disponíveis. Nenhuma chamada SERP, desbloqueio, proxy ou coleta foi executada.

## Preparação para o pacote do app

Na VPS, evidências sanitizadas estão em `audit/provider-free-tier-readonly.json` e `audit/provider-free-enforcement-20260915.json`, relativas a `/opt/betel-isolated-rehearsal`. O arquivo privado `secrets/provider-free-only-proofs.json` contém as duas provas no contrato informado pela tarefa Betel: `freeOnly`, `providerHardCap`, SHA256 da credencial efetiva, referência de evidência e validade de 24 horas, até **16/09/2026 às 22:06:13 UTC**.

**Provas preparadas, ainda não ativadas no ambiente da aplicação.** A implementação sequencial e seus controles pertencem ao pacote em preparação pela tarefa Betel. Expiração, troca de chave, mudança de plano, depósito ou ausência de prova válida devem impedir o uso até revalidação. O arquivo não contém as chaves, não autoriza excedentes e não substitui a conferência do estado futuro da conta.

Nenhuma alteração de produção, reinício, recarga ou teste pago nesta rodada.
