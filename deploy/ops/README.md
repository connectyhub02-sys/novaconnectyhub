# Operações da VPS

- `inngest-retention.sh <container-postgres> [dias=3] [--vacuum-full]`: apaga o histórico de execuções do Inngest
  (spans, traces, trace_runs, history, events e execuções concluídas) mais antigo que N dias, em lotes. A fila e o
  estado em andamento ficam no Redis e não são tocados; execuções não concluídas são preservadas. `--vacuum-full`
  só na primeira vez (devolve espaço ao disco; trava cada tabela por alguns minutos).
- `connectyhub-inngest-retention.cron`: instalado em `/etc/cron.d/connectyhub-inngest-retention` (06:30/06:45 UTC).
  Instalação: copiar o script para `/opt/connectyhub/ops/` (LF, chmod 750) e o cron para `/etc/cron.d/` (chmod 644).
