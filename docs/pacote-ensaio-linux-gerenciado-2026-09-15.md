# Ensaio gerenciado — revisão 3 para VPS compartilhada

> Atualização de execução (15/09/2026): o ensaio Linux autorizado foi concluído com 138 checks, restauração, sentinela, watchdog e cleanup. As descrições de pendências locais abaixo preservam o estado de revisão 3 anterior à execução. Resultado atual, correções e limites: [relatório Linux](ensaio-linux-gerenciado-2026-09-15.md). Não houve publicação do portal nem migração de clientes.
15/09/2026. **Preparação local implementada; ainda não homologada no Docker/Linux.** Substitui a [revisão 2](pacote-ensaio-linux-gerenciado-2026-09-15-rev02.md). Não houve SSH, execução na VPS, instalação, pull/build Docker, alteração de firewall/mount/container produtivo, deploy ou chamada paga. Voz 17731ed é outro pacote, já publicado.

## Decisão e substituição das guardas

**Docker vazio era uma guarda conservadora, não requisito técnico do produto.** Foi substituída por namespace de rede sem interface externa, labels/marcador da rodada, comparação dos containers preexistentes e limites dos containers próprios. Não requer contratar outro servidor nem parar Supabase/Inngest/Redis existentes.

**Filesystem limitado continua necessário neste ensaio.** Bind mount e max_wal_size não limitam todo o diretório. Mas não precisa ser partição/disco dedicado: `storage.mjs` prepara um arquivo ext4 de 2 GiB previamente alocado, associa um loop device novo e monta somente em subdiretório novo. Não remonta, redimensiona ou formata volumes existentes nem altera fstab.

Não anunciar “pronto para executar na VPS”: faltam capacidade/ferramentas/imagens confirmadas e homologação Linux. A alternativa está implementada e tem recusas explícitas; não é somente a remoção da condição anterior.

## Rede e escopo

- PostgreSQL usa `network_mode: none`; os demais serviços usam `network_mode: service:database`. DSNs/URLs usam 127.0.0.1 dentro desse namespace, **não o localhost do host**. Sem bridge, veth, DNS de serviços, portas publicadas ou socket Docker nos containers.
- Docker documenta [none com somente loopback](https://docs.docker.com/engine/network/drivers/none/), [compartilhamento de namespace](https://docs.docker.com/engine/network/#container-networks) e [network_mode no Compose](https://docs.docker.com/reference/compose-file/services/#network_mode). Não usa extra_hosts, incompatível com esse modo. Os processos fictícios compartilham portas e confiança interna; não é desenho de rede para hospedar clientes independentes.
- Runner verifica UUID nas labels, projeto Compose, arquivo de configuração, binds dentro da raiz e network_mode apontando ao ID exato do PostgreSQL próprio. Host/bridge/namespace estrangeiro/capabilities extras/devices/PID compartilhado são recusados. Harness Linux verifica somente loopback, ausência de rota IPv4 e recusa de TCP para TEST-NET 192.0.2.1, sem sondar produção.
- Preflight guarda hashes de configuração, mounts, redes, início/status e reinícios dos containers existentes, sem gravar segredos/ambientes. Compara antes/depois das etapas e no monitoramento. Mudança interrompe somente o ensaio; **não reverte nem reinicia produção**. Deploy/manutenção concorrente também pode causar recusa.
- Limpeza valida ownership e consumidores estrangeiros do namespace antes de remover recursos. Não usa prune, --remove-orphans ou reinício do Docker. Root/socket Docker continuam uma fronteira de confiança.

## Recursos e impacto

| Serviço | RAM | CPUs | Porta privada |
|---|---:|---:|---:|
| database | 512 MiB | 0,50 | 5432 |
| auth | 256 MiB | 0,25 | 9999 |
| rest | 128 MiB | 0,25 | 3000 |
| managed-gateway | 128 MiB | 0,25 | 3080 |
| worker diagnóstico | 128 MiB | 0,25 | nenhuma |
| telemetry-gateway | 128 MiB | 0,25 | 3082 |
| objects | 256 MiB | 0,25 | 3081 |
| executor | 512 MiB | 0,50 | nenhuma |
| objects-pressure | 256 MiB | 0,25 | 3081 |
| Soma conservadora | **2.304 MiB** | **2,75** | **zero portas no host** |

Objects/objects-pressure alternam: máximo previsto de oito containers, 2.048 MiB/2,5 CPUs. Sem swap adicional, rootfs read-only, capabilities removidas, no-new-privileges, restart no, 64 PIDs (DB 128), logs 5 MiB × 2 por container (até 90 MiB fora do arquivo ext4). Runner inspeciona limites efetivos de RAM/swap/CPU/PIDs/logs/rootfs. DB: buffers 64 MiB, 30 conexões, pool REST 3, shm 32 MiB, tmpfs 24 MiB, WAL alvo 128 MiB. ENOSPC é testado em tmpfs de 1 MiB exclusivo do sidecar temporário.

Reservar mais 256 MiB para supervisor/watchdog/CLI, **sem cgroup imposto ao supervisor**, além de overhead Docker/kernel. Heap indicado 128 MiB, watchdog 64 MiB; saída/dump têm buffers limitados. Não há teto de IOPS: formatação/dump/restauração têm volume limitado, mas podem competir por I/O. Exige janela de baixa carga; não promete impacto zero nem capacidade comercial.

Arquivo ext4 aloca 2 GiB e contém dados originais/restaurados, dump, credenciais e evidências. Requer 10 GiB livres antes de alocar e 8 GiB no filesystem Docker. Preflight exige ≥4 GiB de RAM disponível e CPU abaixo de 70% por cinco minutos. Monitor interrompe com RAM ≤2 GiB, OOM, filesystem do ensaio >75%, alteração dos containers existentes, prazo ou falha. Não aumenta plano/limites automaticamente.

## Imagens antes da janela de execução

Digests linux/amd64 fixados no Compose/Dockerfile: PostgreSQL 17.11 Alpine 3.23, GoTrue 2.197.0, PostgREST 16.3 e Node 22 Alpine. Inventário anterior: ~202 MiB comprimidos, sem deduplicação; reservar 2 GiB para imagens/cache. Imagem própria somente copia módulos Node, sem npm/apk.

**Run não executa pull/build; pull_policy é never.** Limites dos serviços não controlam todo o consumo de BuildKit/downloads no daemon. Imagem própria usa tag `connectyhub-managed-rehearsal:HASH` e label `com.connectyhub.rehearsal.source=HASH`; HASH é SHA256 do manifesto de fontes da raiz Linux revisada. Preflight recusa imagens ausentes ou label divergente. Label é controle de procedência do build conduzido pela equipe, não assinatura do fornecedor.

Opções futuras sem novo contrato: construir/exportar usando algum Docker Linux já disponível à equipe, ou preparar/importar cache no Docker da própria VPS numa janela separada, avaliada quanto a CPU/I/O. Nenhuma opção foi executada ou autorizada por inferência. Não foi confirmado outro Linux disponível; este ambiente de testes é Windows nativo. Se faltarem imagens, **a decisão necessária é como/quando preparar o cache**, não contratar daemon dedicado.

Exemplo para revisão, em Docker Linux já disponível, fora do run compartilhado; **não executado**:

```sh
SOURCE_HASH=$(node --input-type=module -e "import {sourceManifest,hash} from './services/managed-rehearsal/lib.mjs'; console.log(hash(JSON.stringify(await sourceManifest())))")
docker build --platform linux/amd64 --file services/managed-rehearsal/Dockerfile \
  --build-arg REHEARSAL_SOURCE_HASH="$SOURCE_HASH" \
  --tag "connectyhub-managed-rehearsal:$SOURCE_HASH" .
```

Os três digests oficiais também precisam existir no cache alvo. Nenhum instalador/download oculto integra o runner.

## Provisionamento e procedimento futuro

Pré-requisitos **existentes**, sem instalação automática: Linux amd64, root local, Docker rootful/Compose, cgroup v2, Node, findmnt, fallocate, losetup, mkfs.ext4, mount e umount. Parent deve ser root:root 0700, canônico sem symlink, em ext4/xfs, fora dos mounts de containers e DockerRootDir. Preparar esse diretório novo é ação administrativa futura, não mudança de mounts produtivos.

`storage-provision` cria `managed-storage-UUID/data.ext4` com abertura exclusiva, aloca 2 GiB e verifica tamanho/blocos/link único. Confere loop/backing file/offset/leitura antes de formatar; mkfs recebe somente o loop recém-criado e validado, nunca device informado pelo operador. Monta em subdiretório novo/vazio com nodev,nosuid,noexec, registrando inode/device e identidade do mount. Controles baseados em [fallocate](https://man7.org/linux/man-pages/man1/fallocate.1.html) e [losetup](https://man7.org/linux/man-pages/man8/losetup.8.html). Reserva blocos no filesystem; não comprova armazenamento físico/thin provisioning do provedor.

Exemplo sequencial após revisão/autorização da janela, usando exatamente os caminhos retornados:

```sh
node services/managed-rehearsal/runner.mjs storage-provision --parent /var/lib/connectyhub-rehearsals
node services/managed-rehearsal/runner.mjs prepare --parent /var/lib/connectyhub-rehearsals/managed-storage-UUID/mount
node services/managed-rehearsal/runner.mjs preflight --root /var/lib/connectyhub-rehearsals/managed-storage-UUID/mount/managed-rehearsal-UUID
node --max-old-space-size=128 services/managed-rehearsal/runner.mjs run --root /var/lib/connectyhub-rehearsals/managed-storage-UUID/mount/managed-rehearsal-UUID --reviewed
```

Credenciais fictícias novas expiram em 24 horas. Código alterado após prepare exige outra rodada. Bootstrap cria roles mínimas/Auth/quatro contas, aplica 0150–0153 com ledger de hashes e reaplica. Harness cobre login/refresh/RLS A/B/admin explícito, registros, arquivos/consumo/idempotência, leases/uncertain, worker diagnóstico, revogação, telemetria, 160 requisições em 30 segundos e restauração offline. Não inclui Next/Studio/Realtime completos nem Inngest.

Watchdog confirma partida antes dos serviços e limita runtime a 45 minutos. SIGINT/TERM/finally encerram só a rodada. Falha de host/daemon pode impedir parada; isso exige intervenção. Sucesso só é registrado após limpeza e comparação final dos containers preexistentes.

## Encerramento restrito

`stop --root RAIZ` remove containers próprios após validar ownership/mounts. Imagens ficam em cache. Exportar e verificar evidências antes de liberar armazenamento. `purge --root RAIZ --discard-fictional-data` exige stopped.json e ausência de containers próprios; remove só data/restore/backup/secrets/inputs, preservando evidências dentro da imagem.

```sh
node services/managed-rehearsal/runner.mjs storage-release --storage-root /var/lib/connectyhub-rehearsals/managed-storage-UUID --reviewed-release
```

Release recusa referência de qualquer container ao diretório, mount extra, arquivo substituído ou loop divergente. Usa umount normal e detach exato, sem lazy/force/global/detach-all. Conserva a imagem e escreve released.json fora dela. Para descartar a imagem fictícia na mesma chamada, após exportar evidências, acrescentar `--discard-fictional-image`: verifica inode/device/link único e ausência de associação antes de unlink. Apaga também evidências ainda dentro da imagem; não é secure erase. Diretório pequeno com marcadores permanece. Imagem já liberada não é reanexada/apagada automaticamente; remoção posterior exige revisão do escopo.

Provisionamento interrompido deixa pending.json/storage.json para identificar os recursos exatos. Fases parcialmente concluídas precisam de revisão administrativa; o script não tenta limpar devices desconhecidos nem repetir mkfs por tentativa.

## Evidência, impedimentos e próxima decisão

**Executado localmente:** 13 testes aprovados sem skips, incluindo 107 checks HTTP com PG/Auth/PostgREST/gateways/objetos reais e restauração em banco/diretório novos. Novas regressões cobrem snapshot sem segredos, mudança de container existente, namespace/capability indevidos, consumidor estrangeiro, sparse file, loop/mount divergente e sobreposição de diretórios. Após reforço de PID/logs/sem-download, 11 regressões passaram novamente; PostgreSQL foi omitido nessa repetição curta, já aprovado na rodada completa. [Evidência nativa](evidencias/managed-rehearsal-native-2026-09-15.json). Processos dessa rodada encerrados.

**Não executado:** Compose real, namespace none compartilhado, imagens Linux, UID/cgroup/logs, provisionamento/liberação loop-ext4, tmpfs cheio, watchdog/cleanup Docker e restauração Linux. Teste puro não comprova suporte no kernel da VPS. Homologação deverá incluir container sentinela fictício preexistente e verificar sua preservação; mudança deliberada nele deve provocar recusa sem reversão automática. Produção não é alvo de testes negativos.

Impedimentos concretos: ambiente local sem Docker/Linux executável; imagens não construídas/importadas; capacidade/ferramentas/loop no destino não inspecionados nesta etapa restrita à preparação local. Se loop indisponível, não remover quota: avaliar adaptação para volume limitado já existente/vazio ou Linux de testes já disponível. O runner atual aceita somente seu loop validado; outras opções exigem adaptação explícita. Sem opções existentes, devolver decisão de ambiente/janela, sem compra/instalação automática. Capacidade livre insuficiente implica adiar, sem parar produção para liberar espaço.

Prévia fictícia preservada: `http://127.0.0.1:3026/infraestrutura/vps`. Operação de clientes/mudança produtiva seguem fora desta entrega.

**Bloqueios anteriores preservados:** runtime Inngest rejeitado duas vezes por revisão automática (`blocked by policy`), sem nova tentativa/alternativa. Duas pastas fictícias antigas em Temp cuja remoção foi bloqueada continuam intactas; seus PostgreSQL já estavam parados. Nenhum novo mecanismo foi usado para contornar esses bloqueios.
