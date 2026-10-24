# Retenção dos diagnósticos Inngest

## Recuperação concorrente autorizada em 24/10

O controlador bloqueante inicial foi interrompido após REINDEX de spans esgotar
as conexões do Inngest. **Não reiniciar `finish_initial.py` nem apagar seu estado.**
Após escolha explícita do titular, `online_indexes.py` executa somente
`REINDEX INDEX CONCURRENTLY`, um índice por vez, sem apagar linhas nem reescrever
o heap. Traces/history ConnectyHub já compactados são excluídos do plano.

Unidade única `connectyhub-retention-online-indexes.service`; novo checkpoint
`/var/lib/connectyhub-retention/online-index-status.json`, independente do registro
histórico `initial-status.json`. Mostra plano, índice/etapa atual, progresso,
conexões, bloqueios e tamanhos antes/depois dos índices concluídos.

Cada projeto usa o mesmo flock da retenção diária; singleton impede outra cópia.
Antes de começar exige índices válidos e folga de duas vezes o índice atual mais
6 GiB, mínimo 10 GiB. Guarda com conexão reservada, a cada 2 segundos, cancela se:
livres abaixo de 8 GiB; conexões de clientes em 80% do máximo; cinco consultas
bloqueadas pela manutenção, ou bloqueio persistente por três amostras. Falha da
guarda também cancela. Espera autovacuum sem bloquear clientes; lock_timeout 2s,
statement_timeout 3h por índice, maintenance_work_mem 64MB, sem workers paralelos.
Esses limites não representam uma quota de CPU do comando SQL; a consulta roda
no PostgreSQL e pode acrescentar carga. A unidade limita o supervisor a 256 MiB.

Falha interrompe o plano em `attention_required`. REINDEX concorrente cancelado
pode deixar índice transitório inválido: nunca removê-lo pelo nome sozinho.
Conferir OID/tabela, validade do substituto e dependências antes de qualquer ação.
`--resume` é explícito e exige inventário válido; não reinicia índices concluídos.
Não há retry automático nem fallback bloqueante. SIGTERM solicita cancelamento
do SQL corrente. Ao concluir, o estado é `complete` **somente para índices**;
espaço livre dentro dos heaps pode continuar reservado ao banco para reutilização.

Testes: `python3 -m unittest -v test_online_indexes`. Acompanhamento do chat
`conclus-o-dos-ndices-concorrentes-da-vps` verifica a cada 15 minutos e fica
silencioso em progresso normal. Timer diário da VPS permanece habilitado.

Rotina do host para os bancos independentes Inngest da ConnectyHub e da Vision.
Só remove linhas de `spans`, `traces` e `history`. Não remove eventos, resumos
de execuções, registros de finalização, configurações, Redis, dados de clientes,
carteiras, pagamentos, recibos de envio nem chaves de idempotência da aplicação.

## Política e garantias

- Execuções concluídas: detalhes disponíveis no PostgreSQL por pelo menos 7 dias.
- Falhas/cancelamentos: detalhes disponíveis por pelo menos 30 dias.
- Exige concordância entre `trace_runs` e `function_finishes`, status terminal
  e data de término anterior ao corte. Execuções ativas, desconhecidas e sem
  comprovante independente de finalização ficam intactas.
- Cada lote usa uma transação. `COPY (WITH ... DELETE RETURNING ...)` captura
  exatamente as linhas retiradas; a exclusão só é confirmada depois do arquivo
  criptografado ser enviado ao R2, baixado, autenticado, descomprimido e conferido
  por SHA-256. Falha de rede, limite de memória ou erro SQL provoca rollback.
- Cada arquivo contém tabela, colunas, contagem, formato COPY, hash e referência
  ao schema PostgreSQL também arquivado. AES-256-GCM, nonce aleatório por objeto
  e caminho do objeto autenticado como AAD. Nenhum diagnóstico é enviado em claro.
- Os objetos ficam em `infrastructure-archives/inngest-retention-v1/` no R2
  já utilizado pela aplicação. Não há expiração automática de arquivos externos.
  Eles ocupam armazenamento R2; não são uma promessa de custo zero.
- Arquivo enviado seguido de crash antes do commit pode ficar redundante no R2;
  isso preserva dados. Crash depois do commit e antes do log local não elimina
  a cópia externa, que tem metadados próprios e pode ser descoberta pelo prefixo.
- O lock por projeto impede duas rotinas simultâneas no mesmo banco.
  Esquema diferente do baseline interrompe a rotina para revisão.

## Instalação

Dependências do host: Python 3, `python3-psycopg2`, boto3 e cryptography.
Copiar `retention.py` para `/opt/connectyhub/retention/`. Estado privado em
`/var/lib/connectyhub-retention/`, modo 700. Chave AES de 32 bytes em
`archive.key`, modo 600, com segunda cópia privada fora da VPS antes da limpeza.
Nunca versionar chave, dumps, conteúdo de diagnósticos ou credenciais.

`schema-baseline.json` contém as colunas revisadas das três tabelas por projeto.
Criá-lo durante a implantação revisada; não atualizar automaticamente após uma
mudança de versão do Inngest. Os containers e banco são allowlists no script.
Credenciais são lidas em memória da configuração Docker, sem impressão nos logs.

Índice auxiliar, criado concorrentemente nos dois bancos para evitar varredura
completa de traces em cada lote:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_traces_retention_run_id
ON public.traces(run_id);
```

Copiar as unidades para `/etc/systemd/system/`, validar com `systemd-analyze
verify`, recarregar systemd e habilitar `connectyhub-retention.timer`. Agenda:
01h15 de Brasília, com até 5 minutos de atraso aleatório. Executa na VPS mesmo
com o computador do titular desligado. Unidade limita CPU, memória e duração.
O orçamento padrão da execução é 90 minutos, com VACUUM posterior; o limite da
unidade é três horas. O próximo ciclo revisita pendências sem perder registros.

```sh
python3 /opt/connectyhub/retention/retention.py --project connectyhub --dry-run --max-batches 1
systemctl status connectyhub-retention.timer connectyhub-retention.service
journalctl -u connectyhub-retention.service
```

A rotina reduz lotes grandes automaticamente e para antes de iniciar outro
lote quando há menos de 3 GiB disponíveis. Esse piso evita agravar falta de
espaço; não substitui capacidade suficiente. Falhas permanecem visíveis no
systemd. O monitor de capacidade existente continua mostrando uso de disco.

## Recuperação de espaço físico

O VACUUM comum após a limpeza permite que o banco reutilize espaço e mantenha
um tamanho estável sob carga estável. Não promete devolver todos os bytes ao
filesystem. A compactação inicial por `VACUUM FULL` é manutenção separada:
precisa de espaço para a cópia, bloqueia a tabela e deve ser executada uma tabela
por vez, depois de medir a folga. Nunca é chamada pelo timer diário.

Na recuperação inicial de 24/10, `finish_initial.py` aguarda a conclusão comprovada
dos serviços de arquivamento, estima folga por tabela e chama `compact.py` em
sequência. É uma execução única em `connectyhub-initial-space-recovery.service`.
Pode reconstruir primeiro os índices de spans para ganhar margem. Cancela o
comando se a disponibilidade cair abaixo de 5 GiB; o PostgreSQL desfaz o rewrite.
As alocações de manutenção respeitam o limite de memória do container. Não se
confunde com exclusão de mais dados nem com limpeza recorrente por VACUUM FULL.
Bloqueio temporário da tabela pode atrasar gravação de diagnósticos/consulta ao
painel do Inngest; os bancos de negócio não recebem essa manutenção.

Estado privado e atômico: `/var/lib/connectyhub-retention/initial-status.json`.
`complete` exige todas as seis tabelas; `attention_required` exige investigação.
Saída zero do archiver sem `project_complete` não é tratada como conclusão.
O controlador recusa repetir uma execução que já tem arquivo de estado; não
remover esse arquivo para forçar uma repetição sem revisar o resultado anterior.

Uma restauração de diagnóstico arquivado requer a chave, o objeto e o schema.
`--restore-check <chave-do-objeto>` baixa/descriptografa e carrega em tabela
temporária; confere quantidade e hash de todos os valores e sempre faz rollback.
Esse ensaio não grava em tabelas de produção nem dispara funções:

```sh
python3 /opt/connectyhub/retention/retention.py --project connectyhub --restore-check infrastructure-archives/inngest-retention-v1/.../spans.copy.gz.aes
```

Para restauração permanente, usar instância isolada de PostgreSQL 17 com schema
do arquivo. Não sobrescrever a fila ou banco de produção para consultar um
diagnóstico antigo. Interromper futuras limpezas com
`systemctl disable --now connectyhub-retention.timer`. A limpeza de um lote em
andamento só é interrompida com rollback da transação; lotes já concluídos
continuam recuperáveis no arquivo criptografado.

## Verificação

`python3 -m unittest -v test_retention test_initial` cobre autenticação criptográfica, corrupção
no armazenamento, limite de memória, ULID e allowlist. Na implantação também
ensaiar rollback real após falha de upload e restauração de arquivos reais em
tabela temporária. `RETENTION_TEMP_TABLE_TEST=1 python3 -m unittest -v
test_eligibility` testa onze combinações de status/data somente em tabelas
temporárias, sempre revertidas. Testes simulados não substituem a conferência do R2.

Fontes: [Inngest self-hosted](https://www.inngest.com/docs/self-hosting),
[códigos de estado v1.44.0](https://github.com/inngest/inngest/blob/v1.44.0/pkg/enums/run_status.go),
[finalização independente](https://github.com/inngest/inngest/blob/v1.44.0/pkg/cqrs/base_cqrs/history_driver.go),
[VACUUM PostgreSQL 17](https://www.postgresql.org/docs/17/routine-vacuuming.html).
