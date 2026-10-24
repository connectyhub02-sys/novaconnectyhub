# Arquivamento e retenção dos históricos — 24/10/2026

## Escopo autorizado e política

Após a recuperação do acesso, o titular autorizou liberar espaço dos históricos
sem perder dados importantes e configurar limpeza automática. Questionou também
se seria necessário contratar mais disco. Não houve contratação ou aumento de VPS.

A limpeza foi limitada a `spans`, `traces` e `history` dos bancos Inngest da
ConnectyHub e da Vision. Retenção local: 7 dias para execuções concluídas e
30 dias para falhas/cancelamentos. Só são elegíveis execuções com término antigo
e concordância de status em `trace_runs` e `function_finishes`. Pendentes, status
desconhecido e sem comprovação de conclusão permanecem intactos.

Eventos, resumos/resultados finais, configurações, Redis/filas e todos os bancos
de negócio permanecem fora das exclusões. Isso preserva clientes, conversas,
carteiras, cobrança, recibos e idempotência da aplicação. Não houve replay manual
ou geração de mensagens/pagamentos de teste.

## Arquivo recuperável fora da VPS

Cada lote removido é capturado por `DELETE RETURNING` dentro de transação ainda
não confirmada. O COPY é comprimido, criptografado com AES-256-GCM e enviado ao
R2 existente. Só depois do download, autenticação, descompressão, hash e tamanho
conferidos o banco confirma a exclusão. Falha desfaz o lote inteiro. Cópia com
crash antes do commit pode ficar redundante; não provoca perda de registros.

Prefixo dedicado: `infrastructure-archives/inngest-retention-v1/`. Não há
expiração automática dos arquivos. A regra de lifecycle consultada no bucket
somente aborta multipart incompleto após sete dias; não exclui objetos completos.
Conteúdo e metadados de diagnóstico ficam criptografados, mesmo no bucket que
também hospeda mídia pública. A chave não é enviada ao bucket.

Chave privada em `/var/lib/connectyhub-retention/archive.key`, modo 600, com
cópia externa em `%LOCALAPPDATA%/ConnectyHub/backups/retention-20261024/archive.key`.
As duas cópias foram comparadas por SHA-256. Nenhum segredo foi versionado.
Schema PostgreSQL é arquivado por execução; cada objeto descreve tabela, colunas,
quantidade de linhas, formato COPY e hash. R2 passa a guardar esses arquivos;
há consumo de armazenamento externo, não uma garantia de custo zero.

## Implementação e verificações iniciais

Código em [deploy/retention](../deploy/retention/README.md), instalado em
`/opt/connectyhub/retention/`. Acrescentado índice concorrente de `traces(run_id)`
nos dois bancos; nenhum schema de negócio alterado. Dependência do host instalada:
`python3-psycopg2` e `libpq5`, sem atualização de Docker ou reinício dos serviços.

Cinco testes passaram: autenticação criptográfica/adulteração, corrupção remota,
ULID, limite de memória e allowlist. Ensaio real de falha de arquivamento preservou
as duas linhas da tabela temporária pela reversão da transação.

Primeiro lote ConnectyHub: 8.019 traces, 9.737 history e 18.288 spans. Primeiro
lote Vision: 14.200 traces, 20.660 history e 68.253 spans. Nos dois projetos,
os três arquivos foram restaurados em tabelas temporárias, com contagem e hash
integral de valores idênticos; tudo revertido ao final do ensaio. Esse teste
valida a restauração dos lotes conferidos, não uma restauração completa da VPS.

Arquivo e serviço têm limites de memória, duração, espaço mínimo e lote, com
redução automática para lotes grandes/lentos. Lock por projeto impede overlap.
Mudança nas colunas revisadas interrompe a rotina para nova avaliação.

Timer habilitado: `connectyhub-retention.timer`, diariamente às 01h15 BRT com
até cinco minutos de atraso aleatório. Primeira execução agendada observada:
25/10 às 01h18. Execução no servidor, independente do computador do titular.
VACUUM comum após a rotina permite reutilizar espaço. Compactação inicial com
devolução ao filesystem é manutenção separada, condicionada à folga disponível.

## Estado em andamento

Antes: 98% ocupado, cerca de 7,6 GiB disponíveis. Cache reproduzível do builder
ConnectyHub foi reduzido com teto de 2 GB e reserva de 1 GB: ferramenta reportou
6,765 GB recuperados. Builder parado novamente; imagens em uso/rollback,
volumes e backups preservados. Filesystem chegou a 96%, com cerca de 13 GiB livres.

Às 11h58 BRT, arquivamento inicial dos dois bancos em andamento, com limites de
recursos independentes. Não interpretar espaço reutilizável das linhas removidas
como bytes já devolvidos ao disco. Medição final, compactação física e verificação
final de saúde ainda pendentes neste registro. Não declarar limpeza integral
concluída com base apenas na habilitação do timer.

Fontes técnicas: [Inngest self-hosted](https://www.inngest.com/docs/self-hosting)
informa ausência de remoção automática das linhas PostgreSQL;
[PostgreSQL 17](https://www.postgresql.org/docs/17/routine-vacuuming.html) distingue
reutilização por VACUUM comum e compactação com espaço adicional/bloqueio.

### Continuação protegida no servidor — 12h19 BRT

Dez testes aprovados, incluindo onze combinações de elegibilidade em tabelas
temporárias e as guardas do encerramento inicial. Controlador de execução única
`connectyhub-initial-space-recovery.service` ativo; aguarda confirmação explícita
de fim do arquivamento de cada projeto antes de compactar suas tabelas. Não basta
a saída zero por orçamento de tempo. Estima margem, limita memória por container
e cancela o rewrite se a folga cair abaixo de 5 GiB. Falha exige atenção; não
apaga mais dados para contornar limite. Estado em
`/var/lib/connectyhub-retention/initial-status.json`, inicialmente `running` /
`waiting_for_archives`, com 11,728 GiB disponíveis.

Essa execução pode continuar na VPS com o computador desligado. O timer diário
permanece separado e usa VACUUM comum. A compactação inicial pode atrasar consultas
e gravações de diagnósticos enquanto mantém a tabela bloqueada; não compacta
bancos de clientes. Medição final e saúde após a compactação continuam pendentes.

### Conferência antes da continuação em segundo plano — 12h23 BRT

9.892.299 linhas de diagnóstico arquivadas/removidas da ConnectyHub e 4.892.014
da Vision; aproximadamente 1,35/0,72 GiB de objetos criptografados desses lotes.
Não são bytes já devolvidos ao filesystem. Disco em 96%, 11,57 GiB disponíveis.
Controlador continua `running` / `waiting_for_archives`, sem compactações ainda.
Banco/Auth/REST/pooler/Inngest da ConnectyHub saudáveis; banco Inngest Vision
saudável e worker em execução. Auth health, leitura REST e leitura administrativa
de usuários com credencial de serviço retornaram 200, assim como health público
da aplicação. Não foi testada a senha pessoal do titular.

Timer diário confirmado habilitado. Acompanhamento neste chat a cada 15 minutos
criado no Codex (`conclus-o-da-limpeza-da-vps-connectyhub`), silencioso durante
progresso normal, com aviso de conclusão/falha e atualização deste relatório.
Somente o acompanhamento deverá ser pausado ao encerrar; o timer da VPS continua.
O trabalho principal e a compactação protegida rodam no servidor, sem depender
do acompanhamento local. Ainda não declarar capacidade resolvida nem ampliar a
VPS sem avaliar o resultado final.

### Acompanhamento — 12h54 BRT

Arquivamento ConnectyHub concluído; Vision ainda em processamento normal.
Compactadas traces e history da ConnectyHub: 3.977.887.744 e 2.906.406.912 bytes
devolvidos respectivamente. Filesystem em 94%, aproximadamente 17,6 GiB livres.
A primeira tentativa de compactar spans foi cancelada pelo lock timeout de
cinco segundos, sem rewrite confirmado. Consulta posterior identificou VACUUM
em andamento com ShareUpdateExclusiveLock nessa tabela. Não interrompido.
O controlador segue `running`, aguardando a Vision; sua segunda passagem já
prevê tentar novamente as tabelas adiadas. Não houve reinício/duplicação dos
serviços nem necessidade de intervenção do titular nesta observação.

### Interrupção conservadora da compactação — 16h04 BRT

Arquivamento inicial concluído nos dois projetos: 606.387 execuções / 13.046.543
linhas ConnectyHub e 896.040 execuções / 31.736.699 linhas Vision. Lotes confirmados
apenas após arquivo criptografado, download e hash. Aproximadamente 1,75 GiB e
4,48 GiB de arquivos de diagnóstico no R2, sem contar schemas. Registros de negócio,
eventos, resumos/resultados, filas e Redis continuam fora da exclusão.

Às 16h, o REINDEX TABLE não concorrente de `connectyhub.spans`, iniciado às
15h42 BRT pelo controlador, mantinha 99 sessões esperando e esgotou as conexões
do banco Inngest. O health HTTP permanecia 200 e **não detectava esse bloqueio**.
Interrompido apenas o controlador de recuperação inicial; a consulta REINDEX ainda
ativa foi cancelada por SIGINT no backend identificado (não no supervisor do banco).
Nenhum container/banco foi reiniciado, nenhuma sessão de cliente foi terminada
manualmente e nenhum replay foi solicitado.

Após o cancelamento: consultas SQL voltaram, zero sessões esperando locks nos
dois Inngest e zero índices inválidos no banco ConnectyHub. App/Auth/REST e os
dois Inngest responderam HTTP 200. Isso não comprova recuperação de todas as
execuções atrasadas nem login pessoal. Estado inicial registrado como
`attention_required` / `maintenance_stopped_for_connection_pressure`.

Espaço disponível: 15,234 GiB, contra cerca de 7,8 GiB no incidente; o ganho líquido
inclui cache e duas compactações já concluídas, com crescimento normal entre medições.
Bancos Inngest atuais: ConnectyHub 30,90 GiB; Vision 121,50 GiB. Somente traces e
history da ConnectyHub foram compactadas; não declarar o restante concluído.
Timer diário continua habilitado e usa VACUUM comum, sem REINDEX/VACUUM FULL.

A estimativa anterior de término entre 16h45 e 17h45 e de 50–80 GiB adicionais
precisa ser revista: não há processo de compactação inicial ativo neste momento.
Não reiniciar o controlador antigo nem apagar seu checkpoint. Opções para a próxima
etapa: reconstrução concorrente, índice a índice, com espaço e conexões monitorados
(mais lenta, recupera somente parte do espaço), ou janela combinada para compactação
com bloqueio e coordenação das automações. A opção concorrente ainda não foi
implementada/publicada; índices atuais foram inventariados e estão válidos.
Não excluir dados adicionais ou contratar disco para contornar o impedimento.

Referência: [REINDEX concorrente e bloqueios no PostgreSQL 17](https://www.postgresql.org/docs/17/sql-reindex.html).

### Continuação escolhida pelo titular — índices concorrentes

O titular escolheu explicitamente índices concorrentes com menor impacto.
Implementada e iniciada nova unidade `connectyhub-retention-online-indexes.service`,
com `REINDEX INDEX CONCURRENTLY` individual e checkpoint separado
`online-index-status.json`. Controlador bloqueante anterior permanece parado;
seu `attention_required` é histórico e não deve disparar repetição da manutenção.

Plano exclui índices das duas tabelas já compactadas; segue catálogo real dos
dois Inngest, apenas spans/traces/history. Guarda de disco em 8 GiB, conexões em
80% e bloqueios atribuídos ao próprio backend; conexão de monitoramento aberta
antes da manutenção. Cancelamento automático, limite de memória de manutenção,
sem paralelismo SQL; quatro testes de proteção passaram. Não promete carga zero.
Nenhum VACUUM FULL, exclusão adicional de linhas ou compra de disco nesta etapa.

Checkpoint impede duplicação. Falha/índice transitório inválido exige revisão;
nada é descartado automaticamente. Resultado final será ganho dos índices,
sem declarar compactação dos heaps concluída. Novo acompanhamento a cada 15 min:
`conclus-o-dos-ndices-concorrentes-da-vps`; timer diário original preservado.

### Conclusão da recuperação concorrente — 19h54 BRT; conferência às 19h56

`online-index-status.json` terminou `complete` / `finished` em 24/10/2026,
22h54 UTC (19h54 BRT). Serviço finalizou com sucesso, sem processo de índice
remanescente. Todos os 30 índices planejados foram concluídos: 13 ConnectyHub
e 17 Vision. Esta é a conclusão da alternativa concorrente escolhida pelo titular,
não da compactação integral dos heaps. Controlador antigo continua parado e seu
`attention_required` permanece somente como registro da interrupção anterior.

| Medida | Antes | Depois verificado |
|---|---:|---:|
| Espaço livre desde o incidente | aproximadamente 7,8 GiB / 98% ocupado | 36,19 GiB / 88% ocupado |
| Espaço livre na etapa concorrente | 15,226 GiB | 36,19 GiB |
| Banco Inngest ConnectyHub, antes da etapa concorrente | 30,90 GiB | 25,096 GiB |
| Banco Inngest Vision, antes da etapa concorrente | 121,50 GiB | 104,109 GiB |

Índices reduziram 25.301.024.768 bytes (23,56 GiB): 6.354.665.472 bytes
ConnectyHub e 18.946.359.296 bytes Vision. Ganho líquido de filesystem nessa
etapa foi aproximadamente 20,96 GiB, pois os serviços continuaram gravando.
Desde o diagnóstico inicial, a folga aumentou aproximadamente 28,4 GiB; não somar
cache, compactações e índices como se fossem o ganho líquido atual.

Conferência SQL nos dois Inngest: zero índices públicos inválidos, zero sessões
esperando locks e zero reconstruções em andamento. Bancos Supabase dos dois
projetos responderam SQL e estão primários. Auth/REST de ambos, health público
ConnectyHub, relay e Inngest dos dois projetos responderam HTTP 200. Containers
essenciais ativos/saudáveis onde há healthcheck. Essas evidências não comprovam
login pessoal nem conclusão de todas as mensagens, cobranças ou execuções atrasadas.

Preservação: arquivos antigos de diagnóstico continuam criptografados e verificados
no R2; clientes, conversas, cobranças, resultados, eventos e filas não foram alvo
da reconstrução de índices. Esta etapa não excluiu linhas adicionais. Nenhuma
compra de disco, reinício de banco ou retomada do controlador bloqueante.

`connectyhub-retention.timer` confirmado ativo e habilitado; próximo disparo
observado em 25/10 às 01h18 BRT. A política diária usa VACUUM comum e permanece
ativa após encerrar o acompanhamento do chat. O acompanhamento recorrente dos
índices será removido por ter concluído seu propósito; isso não altera o timer VPS.

Não há necessidade imediata de ampliar o disco para concluir esta recuperação.
A folga de 36,2 GiB resolve a urgência, mas 88% de uso ainda exige observar a
tendência de crescimento e o resultado dos ciclos diários; não é garantia de
capacidade indefinida. Espaço livre dentro dos heaps pode ser reutilizado pelo
PostgreSQL e não aparece como livre no filesystem. Compactação adicional dos
heaps dependeria de outro plano/janela, não está incluída na conclusão dos índices.
Validação dos backups que falharam no incidente e backup independente de objetos
contra exclusão continuam pendências separadas já registradas.
