# Monitor de capacidade da VPS

Painel administrativo em `/admin/infrastructure`, endpoint autenticado
`GET /api/admin/infrastructure/capacity`. Somente `is_platform_admin` pode ler
as métricas compartilhadas de todos os projetos. Nenhuma ação operacional é
oferecida pelo monitor.

O coletor Python 3 usa `/proc`, `statvfs`, cgroups v2 e `docker ps/inspect`.
Não coleta ambiente, conteúdo de bancos, logs ou credenciais. Não executa
varreduras `du`, consultas SQL ou `docker stats` em cada acesso ao painel.
O timer coleta a cada 30 segundos, mesmo com o painel fechado, e mantém até
120 pontos (aproximadamente uma hora) no próprio host. Não há banco novo.

Instalação no host: diretório `/opt/connectyhub/monitoring` com `collect.py`,
subdiretório `public` legível pelo usuário do app, e unidades service/timer
copiadas para `/etc/systemd/system/`. Executar `systemctl daemon-reload` e
`systemctl enable --now connectyhub-capacity.timer`. Para a primeira leitura,
`systemctl start connectyhub-capacity.service`. A segunda coleta produz deltas
de CPU; ausência/reset dos contadores nunca produz zero artificial.

`state.json` tem modo 600, com contadores internos. Somente
`public/capacity.json` (644) é montado no app, em
`/var/run/connectyhub-metrics`, **somente leitura**, conforme `deploy/compose.yaml`.
O app não recebe socket Docker, `/proc` do host, SSH ou privilégios adicionais.
Gravação usa troca atômica de arquivo e montagem do diretório, não do inode.

O serviço é oneshot, limitado a 25 segundos por execução, prioridade baixa,
filesystem protegido e sem escrita fora do diretório de métricas. systemd
impede sobreposição da mesma unidade. Falha mantém a leitura anterior; após
120 segundos os indicadores ficam desconhecidos/desatualizados. Erros da API
preservam valores anteriores com aviso; 401/403 limpam os dados da tela.

## Interpretação

- Disco: usado / (usado + disponível), compatível com espaço útil ao app;
  blocos reservados não são considerados disponíveis.
- RAM: total menos `MemAvailable`; cache recuperável não é tratado como falta
  de memória. GB na interface são GiB (base 1024), explicado no painel.
- CPU do host: delta das oito primeiras colunas de `/proc/stat`, sem somar
  guest em duplicidade; iowait aparece separado. Serviços: CPU em núcleos
  usados no intervalo, cota real via `cpu.max` e RAM descontando inactive_file.
- Throttling: delta de períodos limitados / delta de períodos de quota.
  Percentual de tempo perdido e percentual da CPU total são medidas distintas.
- Faixas orientativas: CPU 70/90%, disco e memória 80/90%; limitação por cota
  20/50%. Não são diagnóstico automático de causa nem previsão de esgotamento.
- A lista cobre containers em execução/reinício, não centenas de versões
  antigas intencionalmente paradas. Falha de leitura não vira lista saudável.
- Grupos são rótulos derivados do nome do serviço, não permissões por cliente.

Validação: `python -m unittest discover -s deploy/monitoring -p test_collect.py`
e `npx vitest run tests/infrastructure-capacity.test.ts`. Testes de UI devem
cobrir desktop/celular, filtro, lista expandida, vazio, erro e leitura antiga.

Rollback do coletor: `systemctl disable --now connectyhub-capacity.timer`.
Não apagar dados de projetos. Rollback do app usa o slot anterior; montar
o JSON não altera o banco nem os serviços observados.
