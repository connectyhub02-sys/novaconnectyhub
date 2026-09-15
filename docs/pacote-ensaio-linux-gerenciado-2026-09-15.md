# Ensaio Linux gerenciado — revisão 2, preparação completa

15/09/2026. Esta revisão substitui o [modelo inicial 2f10b66](pacote-ensaio-linux-gerenciado-2026-09-15-rev01.md), preservado como histórico. **Não houve execução Linux, instalação na VPS, push, deploy, cliente real ou chamada paga.** O pacote de voz 17731ed é outro trabalho, já registrado como publicado.

## Entregáveis

Em `services/managed-rehearsal`: `compose.review.yml`, Dockerfile e allowlist de build; `lib.mjs` (credenciais novas, marcador, hashes, roles/seed e caminhos); `runner.mjs` (prepare/preflight/run/stop/purge, prazo e restauração); `harness.mjs` (testes HTTP finitos); `preparation.test.mjs` e `native-http.test.mjs` (verificação local).

Bootstrap, executor, harness e limpeza estão implementados. Faltam a revisão e **execução no ambiente Linux**, não escrever esses scripts. Não inclui Next/Studio/Realtime/Storage completo: objetos usam o sidecar gerenciado; `kong` é somente alias privado do PostgREST compatível com o receptor existente. O teste anterior de 63 checks com Next continua evidência separada.

## Orçamento incluindo executor

| Serviço | Memória configurada | CPUs | Porta interna |
|---|---:|---:|---:|
| database | 512 MiB | 0,50 | 5432 |
| auth | 256 MiB | 0,25 | 9999 |
| rest | 128 MiB | 0,25 | 3000 |
| managed-gateway | 128 MiB | 0,25 | 3080 |
| worker diagnóstico | 128 MiB | 0,25 | nenhuma |
| telemetry-gateway | 128 MiB | 0,25 | 3082 |
| objects | 256 MiB | 0,25 | 3081 |
| executor de testes | 512 MiB | 0,50 | nenhuma |
| objects-pressure, descartável | 256 MiB | 0,25 | 3081 |
| **Soma conservadora** | **2.304 MiB** | **2,75** | **zero portas públicas** |

O runner alterna objects e objects-pressure, mantendo no máximo oito containers simultâneos na sequência prevista (2.048 MiB/2,5 CPUs). Reservar ainda **256 MiB para supervisor/watchdog/CLI**: orçamento conservador **2,5 GiB**, mais overhead Docker/kernel. Essa reserva de host **não é limite cgroup imposto**; somente containers têm limites no Compose. Watchdog tem heap máximo de 64 MiB e dump/saídas têm buffers limitados. Nenhum build Next ou instalação npm integra a janela.

PostgreSQL: shared_buffers 64 MiB, 30 conexões, pool REST 3, WAL alvo 128 MiB, shm 32 MiB e tmpfs 24 MiB. Rootfs somente leitura, capabilities removidas, no-new-privileges, restart no e sem swap adicional. DB roda como UID/GID 70; demais processos, 1000. Permissões de binds 0700, donos preparados; segredos montados 0444 atrás de diretório privado 0700 e env files 0600. Secrets Compose não são cofre criptografado.

Imagens oficiais e digests linux/amd64 permanecem os da tabela da revisão 1: PostgreSQL 17.11 Alpine 3.23, GoTrue v2.197.0, PostgREST v16.3 e Node 22 Alpine. Fontes: [PostgreSQL](https://hub.docker.com/_/postgres), [Node](https://hub.docker.com/_/node), [Auth](https://hub.docker.com/v2/repositories/supabase/gotrue/tags/v2.197.0), [PostgREST](https://hub.docker.com/v2/repositories/postgrest/postgrest/tags/v16.3). Download comprimido agregado informado: **211.422.563 bytes (~202 MiB)**, sem deduplicar camadas. Reservar 2 GiB para imagens expandidas/build. Imagem local apenas copia módulos Node nativos, sem npm/apk. Imagens não foram baixadas/construídas nesta preparação.

## Preflight obrigatório e quota comprovada

- Linux amd64, execução administrativa local, Docker rootful existente com cgroup v2, quatro CPUs ou mais e **daemon sem outros containers**. Um host de produção com containers existentes é recusado. O script usa explicitamente o socket local; não usa SSH/contexto remoto nem descobre VPS.
- Pai da rodada deve ser mount ext4/xfs dedicado **já provisionado**, entre 1 e 4 GiB, contendo somente a rodada e eventual lost+found. findmnt/statfs comprovam capacidade máxima real. O runner não cria filesystem, loopback ou quota. **Não aceita alegação de quota no YAML nem project quota em filesystem maior.**
- Dados originais/restaurados, dump e evidências ficam sob esse limite físico. Exige mais de 50% livre no início e para se ultrapassar 75% usado durante a execução. Logs Docker ficam fora, limitados a 5 MiB × 2 por container (até 90 MiB). O filesystem do Docker precisa ter 8 GiB livres. max_wal_size não é teto de todo o banco.
- OOM observado, memória disponível abaixo de 2 GiB, prazo vencido ou falha dos testes encerram o ensaio. No início exige ≥4 GiB de memória disponível e CPU abaixo de 70% durante cinco minutos. Não aumenta limites/plano automaticamente.
- Projeto/rede/diretório têm UUID exclusivo. Rede interna sem portas publicadas, sem redes externas, docker.sock montado ou env produtivo. Verifica labels/mounts antes de limpar. Sonda TCP única sem payload para endereço público não produtivo deve falhar; não testa conexões em recursos de clientes. Administrador do host continua confiável, não isolado pela rede Docker.

O teste de falta de espaço usa um **tmpfs de 1 MiB exclusivo**, escrevendo 2 MiB no sidecar temporário. Não enche o disco do host. O limite físico da rodada e o tmpfs só serão considerados comprovados quando preflight/testes Linux passarem, não a partir da análise estática.

## Procedimento após revisar host e janela

Na raiz do checkout revisado, em máquina/VM Linux de ensaio com mount previamente preparado:

```sh
node services/managed-rehearsal/runner.mjs prepare --parent /mnt/managed-rehearsal
node services/managed-rehearsal/runner.mjs preflight --root /mnt/managed-rehearsal/managed-rehearsal-UUID
node --max-old-space-size=128 services/managed-rehearsal/runner.mjs run --root /mnt/managed-rehearsal/managed-rehearsal-UUID --reviewed
```

Substituir UUID pelo caminho retornado, sem reaproveitar rodada executada. No Linux, preparar como root para atribuir donos dos binds; em Windows, prepare pode gerar fixtures, mas preflight/run recusam execução. Fonte alterada após prepare exige nova rodada: hashes de scripts, migrations e serviços são conferidos.

Credenciais CSPRNG novas por rodada, somente arquivos privados; JWT de serviço expira em 24h, workers em duas horas. Preflight exige ao menos uma hora restante. Quatro contas fictícias `.example`, duas organizações/projetos. Auth tem login/refresh reais, auto-confirmação de ensaio, sem SMTP. Nenhuma senha de produção é importada.

Bootstrap idempotente cria roles, schema Auth e marcador no banco `managed_rehearsal`; Auth aplica suas migrations. Depois prepara tabelas-base fictícias e migrations **0150–0153**, transacionais com ledger SHA256. Reaplica bootstrap/seed/migrations para verificar repetição. Alteração em migration aplicada é recusada. REST usa authenticator NOINHERIT; Auth tem role própria conforme seu bootstrap, sem superusuário. Não aplica migrations em banco produtivo.

## Testes e recuperação executados pelo runner

1. Readiness e quatro contas; JWT inválido, refresh, RLS A/B, administrador explícito, proibição de ler worker hashes, escrita indevida e limite de arquivo de 1 MiB no banco.
2. Arquivos de 0 bytes, 1 KiB e 1 MiB: reserva/bytes/hash, confirmação idempotente, contabilização única, escopo de capability, exclusão/tombstone, pending e quota compartilhada. Sidecar temporário testa escrita recusada por falta de espaço.
3. Duas claims concorrentes, lease/conclusão, chave de outro projeto, contabilização única; lease vencido no fixture gera uncertain sem replay. Worker em processo separado conclui diagnostic.ping. Revoga membro e chave, testa recusa e recompõe somente as permissões fictícias.
4. Três amostras sintéticas abrem alerta uma vez; replay, chave inválida e isolamento global. Histerese/retenção têm testes unitários anteriores e não são alegadas como novamente cobertas em todos os ramos aqui.
5. **160 requisições REST em 30 segundos**, etapas 1/5/10 req/s e até dez concorrentes; p50/p95 e erros no relatório. Não prova capacidade comercial nem consumo de todos os módulos.
6. Para escritores/Auth/REST/objetos; dump lógico do banco e manifesto SHA256 dos arquivos/tombstones; copia para diretórios novos e compara hashes. Para conjunto original, inicia banco novo e restaura roles/dump. Repete login, RLS, bytes, pending, idempotência e alerta. Original preservado até concluir comparação.

Recuperação offline, sem escritores: **não comprova backup online nem cópia externa**. O ensaio nativo local usa banco PostgreSQL novo e diretório de objetos novo; o runner Linux usa diretórios de PG/objetos novos. O gateway atual pode representar chave de worker desconhecida/revogada como HTTP 503 por erro do RPC; o teste confirma recusa e preservação dos dados, não promete normalização desses erros para 401/403.

## Prazo e limpeza restrita

Pull/build têm prazo de dez minutos cada, antes de iniciar serviços. Depois o watchdog separado precisa confirmar partida **antes do primeiro container** e impõe 45 minutos de runtime. Supervisor usa finally, SIGINT/SIGTERM e timeout por comando. Watchdog encerra o projeto se o supervisor morrer e o prazo vencer. A janela completa inclui preflight e downloads além do runtime. Falha do próprio host/daemon pode impedir parada; nesse caso a intervenção fica explícita, sem prometer garantia impossível. restart no evita religar automaticamente.

Parada manual e descarte posterior, preservando evidências:

```sh
node services/managed-rehearsal/runner.mjs stop --root /mnt/managed-rehearsal/managed-rehearsal-UUID
node services/managed-rehearsal/runner.mjs purge --root /mnt/managed-rehearsal/managed-rehearsal-UUID --discard-fictional-data
```

Limpeza valida marcador, UUID, realpath, symlinks, labels Compose, mounts e ausência de portas. Só remove containers/rede próprios e, em purge, filhos data/restore/backup/secrets/inputs. Não usa prune, não apaga imagem compartilhada nem reinicia Docker. Imagens ficam em cache. Não existe rollback produtivo: produção não é tocada.

## Evidência e pendências

As regressões locais verificam credenciais/escopo, guardas de limpeza, orçamento incluindo executor, timeouts e reaplicação em PostgreSQL temporário real. O harness nativo usa Auth/PostgREST/gateways/objetos reais em loopback e registra separadamente que não verificou containers, isolamento de rede nem tmpfs Linux. Resultado detalhado de sucesso em `docs/evidencias/managed-rehearsal-native-2026-09-15.json`; ver complemento do estado operacional para contagens finais.

Rodada final: **8 testes aprovados, sem skips**, incluindo **107 checks HTTP** nas fases users/exercise/expired/worker/load/revoked/restored. Bootstrap e migrations reaplicados em PostgreSQL temporário separado; tentativa de replay com hash adulterado recusada. Os processos dessa rodada foram encerrados e seus diretórios temporários fictícios removidos. Auth nativo usa a adaptação de listener Windows documentada anteriormente; o teste não prova a imagem Linux oficial.

Resíduos locais de duas tentativas anteriores permanecem em Temp (`managed-rehearsal-tests-VyDVcq` e `managed-rehearsal-http-6VXuD4`). Seus PostgreSQL foram parados explicitamente. A revisão automática bloqueou a remoção posterior desses diretórios com retorno genérico `blocked by policy`; nenhuma forma alternativa foi tentada. Contêm apenas fixtures, não dados de clientes. Não confundir essa pendência de limpeza local com falha na restauração da rodada final.

Pendente, após revisão de host/janela: Compose config/runtime real, build das imagens, UID/cgroup, limite físico do mount, sonda de rede, tmpfs cheio, watchdog/limpeza Docker e restauração em volumes Linux. **Os scripts dessas etapas estão entregues; a execução não ocorreu.** Preview fictício local preservado em `http://127.0.0.1:3026/infraestrutura/vps`.

**Bloqueio automático:** o comando do runtime Inngest foi rejeitado duas vezes, inclusive após autorização explícita, com retorno apenas `blocked by policy`. Nenhum runtime/serviço/download Inngest foi transferido, reformulado ou incluído no ensaio.
