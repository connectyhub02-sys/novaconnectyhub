# Ensaio Linux isolado em host compartilhado — 15/09/2026

## Escopo e resultado

Ensaio autorizado na VPS existente da ConnectyHub, usando somente dados fictícios, diretórios próprios e imagens oficiais fixadas por digest. Não altera a aplicação publicada, bancos produtivos, Betel ou Vision. O runtime Inngest permanece excluído pelo bloqueio anterior de revisão automática.

**Concluído no escopo do ensaio fictício.** Oitava fixture completou todas as fases às 10h43 BRT (13h43 UTC), com 138 verificações aprovadas. Não é publicação do portal nem aprovação de integração de clientes reais. [Evidência sanitizada](evidencias/managed-rehearsal-linux-2026-09-15.json).

## Inventário e preparação observados

Linux amd64, Ubuntu, 8 CPUs, Docker 29.8.0, Compose 5.5.1, cgroup v2 rootful. Inventário inicial: aproximadamente 20,8 GiB de memória disponível e 261 GiB de disco livre. Havia 16 containers produtivos; 15 apresentavam healthcheck saudável, e Caddy não tinha healthcheck. Nenhum reinício registrado nesse inventário.

Node não estava disponível no host. Foi preparado Node 22.23.2 oficial, com SHA-256 conferido, exclusivamente no diretório privado do pacote, sem instalação global. As imagens oficiais PostgreSQL, GoTrue, PostgREST e Node foram preparadas no cache; a imagem do harness foi construída sem rede, somente com COPY, sem npm/apk. Imagens e runtime privado ficam em cache e não são uma instalação de serviço produtivo.

O armazenamento próprio usa arquivo de 2 GiB pré-alocado, loop identificado e ext4 montado com nodev,nosuid,noexec. Não há portas publicadas nem bridge: os serviços compartilham o namespace sem rede do banco e se comunicam por loopback. O orçamento conservador do Compose é 2,25 GiB e 2,75 CPUs, incluindo executor e serviços alternados, mais reserva de 256 MiB para supervisão no host; a supervisão não tem limite próprio por cgroup. Há limites de PID, logs, memória sem swap extra e prazo de execução de 45 minutos. Não há limite de IOPS.

Uma sentinela fictícia separada foi criada com rede none, rootfs somente leitura, 64 MiB, 0,05 CPU, 16 PIDs e logs limitados. Sua finalidade é testar preservação e detecção de alterações sem usar produção como alvo negativo.

## Falhas encontradas na primeira execução Linux

1. **Alocação do armazenamento:** mkfs.ext4 descartava blocos livres através do loop e tornava esparso o arquivo previamente alocado. A verificação bloqueou o preflight antes de criar containers do ensaio. Corrigido com `nodiscard` e verificação da alocação após formatar. Primeiro mount/loop liberado pelo procedimento restrito; imagem fictícia descartada.
2. **Prontidão do PostgreSQL:** a primeira rodada subiu o banco e falhou com exit 2 na etapa anterior à criação de roles. O diagnóstico posterior encontrou banco inicializado e roles ausentes. O teste por socket podia aceitar o servidor temporário do entrypoint; readiness e healthcheck foram alterados para TCP no loopback, que aguarda o servidor final. A limpeza finally encerrou os containers próprios. Evidências exportadas e segundo filesystem liberado.
3. **Alias do teste de disco cheio:** revisão do harness encontrou `objects-pressure` ausente da lista permitida, apesar de ser usado pela fase pressure. A terceira observação foi interrompida antes dos containers e a fixture descartada. O alias agora é aceito explicitamente e continua sendo reescrito para 127.0.0.1; não permite hosts arbitrários.

Depois das correções, 11 testes locais de preparação, limites e guards passaram, sem falhas; o caso PostgreSQL local dessa rodada curta foi omitido. Isso não substitui o resultado Linux.

O primeiro preflight completo após a correção de alocação observou 300 segundos, CPU máxima de 41%, filesystem limitado validado e os 16 containers produtivos inalterados. A execução repete essa observação antes de subir os serviços. Toda alteração no código exige nova fixture e novo hash/imagem.

## Limites da comprovação

Esse pacote testa um subconjunto de Auth, PostgreSQL, REST, gateways próprios, objetos, workers diagnósticos e telemetria. Não inclui Next.js/Studio/Realtime completos, transporte Inngest, integração de clientes reais, chamadas pagas ou carga representativa de produção. Não comprova capacidade comercial nem encerra pendências de backup/recuperação de outros projetos.

### Permissão do código dentro da imagem

Na quarta rodada, banco, roles/replay e subida do Auth passaram em diagnóstico. O executor falhou antes de entrar no harness: `EACCES` ao abrir `/rehearsal/rehearsal/harness.mjs`. O upload privado 0600 havia sido preservado pelo COPY padrão do Docker, enquanto o processo roda como usuário node. Corrigido com `COPY --chmod=0555` exclusivamente para código da imagem; segredos e mounts não foram abertos. Probe Linux real, sem rede, limitado a 64 MiB e UID 1000, confirmou leitura dos arquivos antes da nova execução. A rodada anterior foi encerrada, com evidências exportadas e filesystem liberado pelo procedimento restrito.

### Cópia de objetos para restauração

Na quinta rodada passaram users, exercise, pressure, expired, worker, load e revoked. A carga fictícia de leitura fez 160 requisições em 30 segundos, concorrência máxima 10, zero erros, p50 14 ms e p95 71 ms. Esses números não medem a capacidade produtiva.

A restauração parou na cópia dos objetos: `fs.cp` com recusa de sobrescrita rejeitou o diretório de destino precriado pelo preflight (`EEXIST`). O novo helper exige destino canônico vazio e copia cada filho com recusa de sobrescrita. A regressão local comprova conteúdo aninhado e preservação do destino já preenchido. Nova execução completa exigida; o dump e os objetos fictícios anteriores não foram usados para dispensar essa repetição. Resultado dos testes locais após a correção: 12 aprovados, um teste de PostgreSQL local omitido.

### Inventário durante substituição de containers

Na sexta rodada, as sete fases anteriores voltaram a passar; dump e manifest foram gerados e os objetos foram copiados. Durante o down previsto para restaurar em outro banco, o monitor interrompeu a chamada Docker (exit 130), encerrando somente o ensaio. A mensagem original do monitor era mascarada pelo erro do subprocesso. A inspeção conjunta de IDs produtivos e efêmeros próprios tinha uma corrida possível quando o Compose removia containers.

A conferência de estrangeiros agora solicita ao Docker apenas containers sem a label do projeto descartável. O inventário próprio repete até três vezes somente quando uma nova listagem comprova alteração dos IDs; falhas com conjunto estável continuam sendo erro. Validação de ownership, namespace e limites permanece após a inspeção. A causa original do monitor agora tem registro sanitizado e precedência sobre o erro do subprocesso interrompido. Testes de desaparecimento transitório, erro persistente e limite de repetição passaram; resultado local total: 13 aprovados e um PostgreSQL local omitido. A hipótese de corrida não foi provada pelo log antigo, pois a causa estava mascarada; a nova rodada deve comprovar o ciclo completo e expor qualquer causa restante.

Compatibilidade da listagem: o daemon rejeitou `label!=` em `docker ps` na sétima preflight, antes de qualquer serviço do ensaio. Substituído por listagem com ID completo e label explícita, seleção local exata e posterior inspect apenas dos IDs estrangeiros. Containers sem label e de outros projetos são preservados na comparação. O template passou no Docker real; teste local cobre seleção e IDs inválidos. A primeira comparação agora ocorre antes da observação de 300 segundos. Essa rodada foi liberada e seu registrador auxiliar encerrado. Total local final neste ponto: 14 testes aprovados, um PostgreSQL local omitido.


## Resultado final observado

Fonte executada: `a70ec167f8a4cb4ec28c3b2cee00daefaa2c273783189ab90445fdf8e0510f37`. O preflight final observou 300 segundos, CPU máxima de 47,8%, filesystem dedicado com capacidade útil de 2.040.373.248 bytes e 1.916.092.416 bytes disponíveis. Havia 17 containers preexistentes nessa rodada: 16 produtivos e a sentinela fictícia.

As oito fases do harness passaram, totalizando **138 checks**: criação/login/refresh de usuários, RLS A/B e administrador explícito, persistência, reserva/finalização idempotente de objetos, isolamento e tombstone, quota, disco cheio em tmpfs de 1 MiB, leases e estado incerto, worker diagnóstico, telemetria/alertas, revogação, carga e restauração. As migrations 0150–0153 e seeds foram reaplicadas no banco fictício pelo runner.

Carga final: **160 GET em 30 segundos**, concorrência máxima 10, **zero erros**, p50 15 ms e p95 60 ms. O restore usou dump lógico com escritores parados e objetos com checksums, em novos containers/diretórios; validou RLS, registros, conteúdo dos objetos, tombstone, reserva pendente, resultado/idempotência de jobs e isolamento de alertas após restaurar.

35 snapshots observaram os nove tipos de serviço e confirmaram os limites de memória/swap, CPU, PID, logs, rootfs somente leitura, ausência de portas, cap_drop e ausência de OOM. Máximo **observado** simultaneamente: oito containers rodando, soma de limites de 2 GiB e 2,5 CPUs. Esse máximo amostrado não substitui o envelope conservador do Compose.

A sentinela preservou configuração e ciclo de vida durante o ensaio. Após o término, sua parada deliberada foi detectada pelo guard, sem reversão automática; ela foi removida. O watchdog independente foi testado no caminho real com prazo reduzido de quatro segundos e um banco fictício: encerrou de um para zero containers. Não foi necessário deixar o teste parado por 45 minutos para validar essa rotina.

**Produção preservada:** os mesmos 16 containers, com identidade, configuração, mounts, redes, StartedAt, status, contagem de reinícios e saúde iguais ao inventário inicial; 15 healthchecks saudáveis e zero reinícios. Caddy segue sem healthcheck. Nenhum dado/serviço produtivo foi usado como alvo de testes negativos.

**Limpeza concluída:** zero containers e processos do ensaio, zero mounts/loops próprios e zero arquivos ext4 de dados fictícios. Evidência copiada para Windows e SHA-256 conferido antes de liberar o último armazenamento. A cópia final, com registro de cleanup, tem SHA-256 `8a5875be1751a1271ff791ed3b40d35ad4afbf89e7632ca65c0be7701e13d0a6`.

Permanecem apenas cache oficial de imagens e camadas do harness, diretório privado de Node/arquivo oficial (~156 MB decimais), código (~121 KB), auditoria (~332 KB no instante medido) e pequenos marcadores dos storages liberados. Não foi executado prune do Docker. A fonte e a evidência foram registradas na worktree; sem push ou deploy.

## Próximo marco

O ensaio de host compartilhado está encerrado. Permanecem fora desta comprovação: runtime/vínculo real do Inngest bloqueado anteriormente, paridade completa Supabase Cloud, publicação do portal/Next/Studio/Realtime, onboarding de clientes reais, plano de operação contínua e backup externo de produção. O teste de restauração aqui é dos dados fictícios desse pacote. Não autoriza migrar Betel/Vision nem declarar a plataforma gerenciada pronta para clientes.
