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

## Respostas da IA e comparação de rede — 00:45–00:51 UTC

Foram lidas as respostas persistidas dos seis pedidos, não apenas seus recibos.
Todos terminaram com `STOP`, JSON válido e error_code nulo. O tempo entre criação
e liquidação foi de 4,0 a 15,1 segundos; não representa latência pura do modelo.
Nenhuma resposta mostrou MAX_TOKENS, bloqueio de conteúdo ou texto interrompido.

| Linha/fonte | Request ID da ConnectyHub | Tempo (s) | Confiança bruta da IA | Conteúdo e limite observado |
|---|---|---:|---:|---|
| 1 — Zuk 231208 | `165f5b7d-cd2d-415d-9656-3d33c40a6368` | 15,09 | 0,80 | Dados de localização, área e lance; faltam avaliação e quartos |
| 2 — Supera 98538/212309 | `c4ce9825-3edd-4aae-98c0-712fbe1bf0ff` | 5,89 | 0,05 | 17 campos ausentes; redirecionamento para leilão 99696 |
| 3 — CentralSul 243487 | `8d084520-1fc6-4c56-9159-75447342d7b0` | 11,09 | 0,85 | Dados de localização, área, lance e avaliação; revisão final ainda exige quartos |
| 4 — Machado 15337 | `cf3e0ef3-21b6-4dfc-8b4d-2da63d0ed5fe` | 5,03 | 0 | 17 campos ausentes; resposta explica bloqueio, sem dados do imóvel |
| 5 — Machado 14915 | `cda59382-f910-40a6-bf59-4cce4dd891be` | 4,91 | 0 | 17 campos ausentes; resposta explica bloqueio, sem dados do imóvel |
| 6 — Machado 14921 | `22cdf87c-54dd-46a7-ac6a-6f89c2752a80` | 4,00 | 0,10 | 17 campos ausentes; resposta explica bloqueio, sem dados do imóvel |

A atribuição por linha usa uma única operação dentro de cada janela sequencial
do scrape_run, corroborada pelos resultados persistidos das primeiras três linhas.
O recibo financeiro não possui FK para a linha; não apresentar isso como vínculo
criptográfico ou correlação por payload completo. A confiança bruta acima é diferente
da confiança combinada pelo adaptador/pesquisa de mercado na Betel.

O perfil do lote permitia 60.000 caracteres de texto e 35s por fetch. Os pedidos
contabilizaram 645–5.562 tokens de entrada. Não há evidência de rejeição por limite
na API; também não foi reconstruído o prompt completo para provar cobertura de
todo o HTML original. A expressão `usable` no recibo local verifica término/texto,
não utilidade imobiliária: isso explica por que JSONs sem dados receberam esse rótulo.

GET direto no namespace de rede do app, com os cabeçalhos existentes do coletor,
confirmou às 00:45:36:

- Zuk: 200, 285.832 caracteres, 614ms.
- Supera: 302 para outro leilão (99696), depois 200, 59.524 caracteres, 201ms.
- CentralSul: 200, 332.788 caracteres, 994ms.
- Machado 15337/14915/14921: 403 em 185/40/94ms, servidor Cloudflare,
  `cf-mitigated: challenge` e título `Just a moment...`.

A tarefa coordenadora confirmou os três Machado abertos normalmente no Chrome
local, com descrições, fotos e PDFs, sem login/CAPTCHA. Assim, **as fontes estão
acessíveis no navegador local**, enquanto o coletor recebe uma resposta de bloqueio.
Não declarar que os imóveis/páginas não existem.

A política efetiva permite saída pública TCP80/443 e continua negando destinos
privados, host e metadata. App e banco tinham zero reinícios e OOMKilled=false,
com início anterior ao lote. A resposta HTTP403 demonstra chegada à origem;
não é um bloqueio de egress nem falha DNS/TLS nesse teste. Não há comparação de
requisições equivalentes antes da migração para atribuir causalidade à mudança
de IP/hospedagem. Nenhuma regra de rede foi relaxada.

Configuração dos três runs Apify lida via GET: build `u8gClHFAIyDHCQq0J`,
playwright:adaptive, 512MB, timeout do actor40s versus timeout por página60s,
concorrência máxima200, três retries, uma reinicialização por run. Picos de memória
399–494MB; EPERM/SIGKILL não prova isoladamente OOM. A documentação oficial expõe
[controles de concorrência, timeout e retries](https://apify.com/apify/website-content-crawler/input-schema)
e explica a relação entre [memória e recursos](https://docs.apify.com/actors/running/usage-and-resources).
A tarefa Betel prepara parâmetros específicos para uma página; nenhuma mudança
de runtime do actor ou nova execução foi testada nesta auditoria. Não retirar
sandbox, ignorar HTTPS/robots ou comprar proxy por inferência.

Evidências adicionais: `batch-six-llm-response-audit.json`,
`batch-six-link-response-timeline.json`, `batch-six-app-direct-http.json` e
`apify-existing-runtime-config.json`, no diretório privado de auditoria.

## Pacote 1 publicado — 00:49 UTC

Substitui o estado preparado da migration acima. Fonte
`dece33dfccfc80b13a4759e43bcffe6b2b35560800d79e1067c73e93dafb2965`, imagem
`e0e28e3daf4e0f47385ff7c487fcfe1a16ba3cc054216d9b482ab50379a0f537`, tag
`betel-production:20260916-i`. Imagem anterior b7e6d2ff preservada.

Pacote da tarefa Betel: fluxo aprovar+enviar teste, tratamento de resultado no modal,
origem legada explícita e guard antes da IA quando não há fonte útil ou há troca de
identidade no redirecionamento Supera. Não inclui ainda reparo validado da coleta
Machado/Apify nem todo o ajuste de visibilidade das falhas.

Compilação VPS passou. SQL aplicada às 00:49:11 após motor sem execução ativa;
tabela vazia, RLS e grants conferidos. App publicado às 00:49:29, com App/Auth/REST/
Storage200, guard de dependências sem serviços retomados, 12 funções Betel e45 CH
inalteradas. Banco, motor e broker preservados. Provas de franquia continuam válidas
até 16/09 às22:06 UTC, sem renovação automática.

Às00:50:44, duas requisições sem cookies e com ID de ação comprovadamente ausente
no manifest verificaram a proteção de origem: legado autorizado chegou ao404 de
ação inexistente, domínio externo recebeu500/E80. O E80 desse horário é o teste
negativo esperado, não nova falha de cliente. Nenhum handler de negócio foi executado.
Não houve envio real, nova IA ou replay do lote. A validação de aprovação/envio
real ainda depende do teste do titular.

Evidências: `market-test-submission-applied.json`, `package-i-publication.json`,
`package-i-origin-check.json`. Os logs completos de build permanecem privados.
