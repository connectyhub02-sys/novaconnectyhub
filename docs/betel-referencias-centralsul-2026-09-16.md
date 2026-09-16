# CentralSul: verificação das referências na aprovação de teste

## Diagnóstico confirmado

Lote `7a286fd7-6b60-4284-8850-f4cfb1d66863`, iniciado em 16/09/2026 às
13:10:51 UTC. Imóvel `047ee549-50b5-4a08-8583-57c4be3e6c27`, análise
`e408b948-102e-47f6-9bc1-a8196d127106`, código
`CENTRALSULDELEILOES-COM-BR-E685AB8051E24229`.

A seleção de três referências passou nas regras de domínio, conforme auditoria
da tarefa Betel. O fluxo de aprovação também verifica se os anúncios podem ser
abertos pelo servidor, antes de registrar a confirmação ou produzir efeitos.

Às 13:22:31 UTC, o verificador da versão publicada m foi executado isoladamente
dentro do container do app, somente para três URLs já coletadas. Foi usado o
código da fonte publicada, com transpilação e instrumentação de metadados HTTP,
mantendo HTTPS, validação de destino público, endereço DNS fixado e limites de
redirecionamento/tempo. Não foi chamada a preparação de outros trios nem qualquer
rota de aprovação, salvamento, coleta paga ou envio.

| Anúncio | Resultado do GET da VPS | QA no Chrome informado pela tarefa Betel |
| --- | --- | --- |
| Viva Real 2794593421 | HTTP 403, sem redirecionamento | Página de venda aberta, R$ 300 mil, 60 m² |
| Viva Real 2496753819 | HTTP 403, sem redirecionamento | Página de venda aberta, R$ 285 mil, 53 m² |
| Zap 2911604226 | HTTP 403, sem redirecionamento | Página de aluguel aberta, R$ 1.800/mês, 48 m² |

Os resultados comprovam recusa da consulta automatizada atual. Não comprovam
anúncio removido, erro no parser, bloqueio exclusivamente por IP ou a resposta
exata da tentativa original, cujos detalhes não foram registrados no log.
Não foi tentado contornar a restrição nem afrouxar a validação.

## Efeitos consultados

Leitura às 13:21:43 UTC: análise ainda `human_review`, atualizada às
13:13:16.178 UTC; nenhuma versão de publicação para esse código. Desde o início
do lote: zero registros em `market_test_submissions`, campanhas, destinos,
entregas, partes de publicação e eventos de mensagem dos grupos. O bloqueio é
compatível com a saída anterior ao `claim_market_test_submission` no código.

## Evidência e escopo da correção

Relatórios privados da VPS:
`audit/centralsul-current-effects-readonly.json` e
`audit/centralsul-three-reference-diagnostic.json`.
O segundo também está no diretório privado local `betel-migration-catalog`.
Hash da fonte `reference-access.ts` executada:
`c7c4f3693b729faa1b727d411349791d02a2fc2bc12e2f22db4a14c5258f7734`.

O pacote de interface autorizado deve exibir as URLs recusadas e o motivo de
cada falha, distinguindo a prévia da verificação de acesso. Ele não altera o
verificador, não resolve o HTTP 403 e não libera aprovação sem referências
confirmadas. A publicação e sua verificação devem ser registradas somente após
conclusão, no estado operacional.
