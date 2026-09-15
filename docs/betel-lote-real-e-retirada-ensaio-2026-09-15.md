# Betel: lote real e retirada do ensaio — 15/09/2026

## Correção do vínculo de evento no broker

O lote `89695f70-924c-44fe-b66a-64b5df147752`, com cinco links fornecidos pelo titular, não chegou ao handler na primeira execução. O motor apresentou `FAILED` em cerca de 85 ms: o broker recusou `unsubmitted_event`, pois comparava o identificador externo do payload com o ULID do recibo interno do motor. São identificadores diferentes do mesmo evento.

`services/managed-inngest-broker/production.mjs` agora reconhece o identificador determinístico externo registrado no ledger e exige correspondência de nome e hash de dados/versão. Um callback assinado que chega antes da confirmação HTTP pode usar a entrada durável pré-envio, sem converter uma entrega incerta em confirmada. Assinatura, namespace, função, corte temporal e propriedade do evento continuam exigidos. Payload alterado e identificador desconhecido são recusados.

29 testes passaram, incluindo callback com identificador externo, rejeição de payload adulterado e corrida real entre callback e confirmação HTTP. Publicado às **21:34:23 UTC**, SHA256 `00c98b0ee0199d563fdbb843f5f6c286f1a730ba6bac3bf79ad7ef042f21804f`. Somente o serviço do broker foi reiniciado, após verificar ausência de execuções ativas; aplicação, banco e motor não foram reiniciados.

## Recuperação única e resultado real

Às 21:35:58 UTC, consulta independente confirmou cinco linhas pendentes, zero vínculos de oportunidade/coleta, zero coletas e zero recibos LLM desde a criação do lote. Com autorização específica, foi recuperada **uma vez** a execução original `01M2KF9RJJ04G5GSZ238Q9XPEP`, originando `01M2KFZ0ZF2B6PBAMCGKYANQYC`. Não foi criado outro lote nem reenviado o evento pela aplicação.

O callback passou pela correção e teve um único dispatch. O motor encerrou a execução como `FAILED` às **21:40:59.576 UTC**, cerca de 301 segundos após começar. Entretanto, o handler continuou trabalhando e persistiu os cinco resultados. Não houve reinício ou nova tentativa depois de começar os efeitos reais.

Consulta independente no banco às **21:47:41 UTC** confirmou:

- lote `concluido`, notificação com estado `sent`;
- linhas 1 e 2 `pronto_para_revisao`, cada uma com oportunidade e coleta próprias;
- linhas 3, 4 e 5 `falha`, sem oportunidade;
- cinco coletas distintas, uma por linha.

A tarefa responsável pelo app verificou que os dois resultados são **parciais**, com confiança 12/24 e nenhum comparável de mercado; os outros três falharam por falta dos dados mínimos de extração. Isso não comprova cinco análises comerciais prontas. A mesma tarefa prepara divisão em etapas por link para lotes futuros; essa alteração do app **não está incluída nesta publicação**. O estado `FAILED` do motor não autoriza repetir este lote, cujos efeitos já persistiram.

## Conciliação de chamadas de IA

Quatro operações que o app marcou como incertas foram consultadas diretamente na ConnectyHub, sem geração, replay nem alteração de carteira:

| Operação | Request ConnectyHub | Estado observado | Créditos cobrados | Reservados |
|---|---|---|---:|---:|
| `7bc6405c-40fc-4906-95ed-e2d98050d834` | `ad3512b0-60e2-4b40-92d7-fc2c13a24f74` | completed | 50.567760 | 0 |
| `b71141fd-4111-476a-95ef-1f7bcee76887` | `bb75e532-afd4-4a55-9d78-8af7e52c62a9` | uncertain / result_pending | 0 | 517.623600 |
| `c9012aab-b55d-4e76-888e-7f941dd25696` | `17177aa6-358b-421b-880c-88cf3b42a7c3` | completed | 39.743640 | 0 |
| `594871ad-af5d-4592-9396-aa1b24b81dc6` | `40c7e63f-eab2-4a28-8dd2-be3dcab74873` | completed | 29.439720 | 0 |

As três concluídas somam 119.751120 créditos **nessa amostra de quatro operações**, não no lote inteiro. A operação incerta não deve ser tratada como gratuita nem repetida para descobrir o resultado. A tarefa Betel recuperou a primeira por GET: resposta `MAX_TOKENS`, JSON truncado e sem comparáveis úteis. Conclusão financeira/técnica não equivale a resultado de negócio utilizável. Permanecem pendentes as conciliações locais dos demais recibos e a resolução da operação ainda incerta.

## Evidência dos provedores de coleta

Leitura da configuração efetiva no banco às 21:50:05 UTC confirmou chave/base/SERP zone da Bright Data, chave/base da Gecko e token/base/atores de busca e conteúdo da Apify. Não havia override desses provedores no ambiente do container, nem zona Web Unlocker cadastrada. Presença de configuração não comprova saldo nem chamada bem-sucedida.

No payload persistido, a primeira linha registrou Gecko HTTP402 e Apify `TIMED-OUT`; a segunda registrou Gecko HTTP402. As três falhas não têm esses marcadores e não produziram pesquisa de mercado. Não foi encontrado marcador Bright Data nos payloads ou nos logs do container durante o lote. Isso **não prova que nenhuma chamada ocorreu**: resposta vazia ou falta de instrumentação podem não gerar marcador. A seleção e o fallback do código são auditados pela tarefa do app; nenhuma nova coleta paga ou teste de fornecedor foi disparado nesta leitura.

## Aplicação de ensaio retirada

Com autorização do titular, às **21:30:45 UTC** foi removida somente `betel-ai-rehearsal` (`c6cf064c-27d6-5d07-aac1-ef89dc7c0c53`), com uma função sintética sem cron. Seu serviço dedicado `betel-inngest-broker.service` foi parado e desabilitado para impedir ressincronização automática.

`betel-ai` manteve suas 12 funções e a ConnectyHub manteve 45, com UUIDs e definições preservados. Não houve reinício de produção/ingress/motor nem remoção de containers, bancos ou credenciais. Evidências, configuração e ledger do ensaio foram preservados em cópia privada fora da VPS. Não recriar ou ressincronizar esse ensaio ao retomar a tarefa.

## Recuperação e limites

- Arquivo privado do ensaio: 6.984 bytes, SHA256 `77d921b2a0c2becb55973cf61f3dbea6bfaf7f50da70f8b52f57d6edb756a99f`.
- Suplemento da correção do broker, configuração, snapshot do ledger e auditorias: 17.009 bytes, SHA256 `b3fd917930236d1384e9138291e670eabeb59393d9c9e8899af4235c2f796a55`, criado às 21:47:11 UTC e copiado/verificado fora da VPS.
- São complementos privados do backup operacional anterior; não substituem o dump restaurado nem estabelecem backup remoto recorrente. Segredos, URLs dos imóveis e conteúdo de respostas não estão neste relatório.
- Supabase Studio ConnectyHub: endereço SQL respondeu 200 HTML com a credencial própria do Studio e 401 sem ela; a credencial do Inngest também foi recusada. O usuário informou falha nas abas normal/anônima. A credencial correta foi entregue em arquivo privado, sem alteração de senha ou proteção; login no navegador ainda precisa ser confirmado. Não atribuir a causa a cache/extensão sem evidência.

[Ativação anterior](betel-ativacao-operacional-2026-09-15.md).
