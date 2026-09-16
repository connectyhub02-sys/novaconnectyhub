# Betel: lote de seis links e teste no celular

Verificação em leitura em 16/09/2026, 00:23–00:34 UTC (15/09 à noite em Brasília).
Não houve replay, reanálise, envio WhatsApp, reinício ou publicação nesta auditoria.

## Lote real

Lote `ca36074a-6049-4148-a3da-18df5ecfe648`, criado 00:18:20 UTC. Motor
`01M2KS96YF24CA0PNWJZS26634` concluiu às 00:22:52, após cerca de 243 segundos.
Preparação, seis etapas por link e fechamento concluíram. Cada linha possui
exatamente um scrape_run: três resultados parciais para revisão e três falhas.
A notificação do lote aparece como enviada; isso não significa entrega das análises.

Há spans repetidos nas linhas 2, 4 e 6. O ledger do broker registra sete dispatches,
todos generation 1. Não afirmar ausência de tentativas HTTP repetidas apenas com
esses dados. Na persistência observada, não houve duplicação de coleta nem recibo.

Seis recibos locais completed/usable correspondem a seis pedidos completed da
ConnectyHub, com seis usage_event_ids distintos e reserva remanescente zero.
Total: **266,8860 créditos** e **R$ 0,667215 de custo LLM do fornecedor**. A relação
foi feita pelo identificador idempotente no mesmo projeto Betel e janela do lote;
não foi inferido vínculo individual de recibo a cada linha. Esse valor não inclui
uso dos provedores de coleta. A operação uncertain do lote anterior continua fora
desta conciliação e não foi alterada.

## Falhas de coleta

Nas linhas 4–6, a leitura direta recebeu 403. Web Unlocker não estava configurado
(SERP não substitui esse recurso). Apify retornou 201 sem conteúdo útil.

GET dos três runs existentes, sem iniciar novos:

- `q1lKIb7xAzjXWcOfh` (00:21:11).
- `q3uV0447cNC28b5Et` (00:21:41).
- `jZAVLdyvhIhZP9skD` (00:22:10).

Todos exibem SUCCEEDED, porém zero requisições coletadas e datasets com zero itens.
Os logs contêm BrowserLaunchError; no primeiro, o Firefox falhou com
`CanCreateUserNamespace() clone() failure: EPERM` e SIGKILL. Isso é falha no
runtime do actor remoto antes da navegação, não evidência de robots/403 nesse
fetch nem falha do navegador da VPS. Uso somado informado nesses runs é cerca de
US$ 0,00359, dentro da franquia previamente configurada; não foi alterado plano,
limite ou sandbox. A documentação de leitura usada foi a
[API de runs do Apify](https://docs.apify.com/api/v2/actor-run-get).

A tarefa Betel prepara validação da fonte antes da chamada à IA. O sucesso técnico
do recibo não comprova análise útil. Essa correção ainda não estava publicada no
momento da auditoria.

## Teste de envio CentralSul

Código `CENTRALSULDELEILOES-COM-BR-121CFFEDD5B7EEA6`. Às 00:25:07, o app registrou
`Invalid Server Actions request`, digest `1111382093@E80`: Origin
`betel-leil-es.vercel.app` divergiu de x-forwarded-host
`betel.connectyhub.com.br`. Next abortou antes do handler.

Às 00:28:59, não havia campanhas, targets, deliveries, publication_parts nem
group_message_events criados desde 00:18, nem correspondências ao código nessas
tabelas. Nenhum recibo LLM foi criado após 00:25. A oportunidade não tinha versão
aprovada. Não foi observado envio causado pela tentativa, e nenhum reenvio foi feito.

O titular esclareceu à tarefa coordenadora que a ação desejada é **aprovar e enviar
um teste**, com aprovação e snapshot no fluxo combinado antes de enviar somente ao
número escolhido. A tarefa Betel prepara esse ajuste e o tratamento explícito da
origem legada. Ausência de versão prévia não deve, por si só, impedir esse fluxo;
as validações de conteúdo e permissões continuam necessárias.

## SQL de idempotência preparado, ainda não aplicado

Arquivo `services/betel-runtime/migrations/20260916003500_market_test_submission.sql`,
idêntico à migration entregue à tarefa Betel; SHA-256
`f5f3f9fbd898fe0087ba6cd795205f9b12a29af3f95c186b3429c7d1761ee77b`.

Claim único por UUID/hash, estado processing e terminal completed/failed/uncertain;
sem expiração nem reabertura automática. Repetição recebe estado e resultado
existentes. Hash divergente ou tentativa de alterar terminal é recusada. Somente
service_role chama as RPCs; leitura direta permitida a ele, DML direto negado.
O app deve validar acesso e conteúdo antes do claim e preservar a chave em retries.

Passaram 26 verificações PostgreSQL reais em banco temporário **vazio** e isolado,
incluindo duas chamadas concorrentes com um único vencedor, proteção dos terminais,
hash divergente e permissões. Banco temporário removido; nenhum dado produtivo
copiado. Aplicação desta migration aguarda o pacote integrado da tarefa Betel.

Evidências privadas em `/opt/betel-isolated-rehearsal/audit/`:
`batch-six-links-readonly.json`, `batch-six-reconciliation-final.json`,
`batch-six-apify-existing-logs.json`, `centralsul-server-action-readonly.json` e
`market-test-submission-sql-test.json`. Não versionar payloads ou credenciais.
