# Worker de projetos gerenciados — piloto

Este serviço executa apenas `diagnostic.ping`. Não está instalado na VPS e não substitui os handlers Inngest publicados. Consulte `docs/piloto-projetos-gerenciados-2026-09-15.md`.

## Fronteiras

- Aplicativo: autenticação existente, autorização por RLS e criação idempotente do job. Flag `MANAGED_PROJECTS_ENABLED` desligada por padrão.
- Gateway interno: lê chave de serviço de arquivo privado; chama somente `managed_claim` e `managed_finish` no PostgREST. Não publica portas no exemplo Compose.
- Worker: lê chave exclusiva do projeto de arquivo; recebe somente sua próxima tarefa. Nunca recebe chave de serviço. Ao finalizar, apresenta o token da lease.
- Banco: decide projeto, status, limite, concorrência e validade da lease. Chave cadastrada como SHA-256 em `managed_workers`; expiração/revogação ficam no banco. Não cadastrar clientes ou chaves reais antes do ensaio completo.

O gateway tem limite de rajada por hash e limite de tamanho do corpo. Sua saúde HTTP significa processo em execução, não comprova banco saudável. Segredos não devem aparecer em Dockerfile, Git, logs ou tela. Use arquivo privado montado via secrets e permissões adequadas ao UID do processo. A imagem usa usuário `node`; conferir leitura dos arquivos no ensaio Docker antes de instalar.

## Ensaios atuais

`node scripts/managed-projects/smoke.mjs` exige piloto Vite na porta 3026 e testa worker separado contra os endpoints/SQL reais do piloto. `node scripts/managed-projects/gateway-smoke.mjs` inicia gateway real e PostgREST simulado em portas efêmeras de loopback, verifica autenticação, claim/finish imediato, restrição de ações e limitação de frequência. Não faz chamadas pagas.

`compose.example.yml` é modelo para ambiente isolado, com rede interna, sem portas públicas, limites e filesystem somente leitura. Docker não foi executado nesta máquina. Não executar na rede de produção para compensar a falta de ambiente de ensaio.

## Recuperação e próximos adaptadores

O job vencido fica `uncertain`; o worker não repete operações externas por conta própria. Acrescentar um novo handler exige contrato próprio de idempotência, permissão, timeout, efeito externo e contabilização. O worker atual não tem heartbeat para trabalhos longos.

O coletor Python lê `/proc`, filesystem e estado de contêineres explicitamente permitidos; não lê ambientes nem logs privados. Ele emite uma amostra JSON e não instala agendamento. Coleta periódica, envio privado, retenção, banco e alertas sustentados ainda precisam de ensaio.

Atualização local posterior: `telemetry.mjs` executa ciclos seriais; `telemetry-gateway-main.mjs` recebe em loopback 3082, valida chave própria e campos permitidos e persiste diretamente no PostgREST privado. A coleta não depende de polling de funções Vercel. A migration 0153 registra amostra, estado e evento em transação única; mantém sete dias de amostras e trinta dias de eventos. O ensaio `real-telemetry.mjs` confirmou três ciclos até PostgreSQL/PostgREST reais e isolamento das métricas; os valores foram fictícios. Nenhum coletor contínuo está instalado. O controlador SQL de alertas persiste estado e eventos, exige três amostras consecutivas, reinicia contagem após gap e aplica histerese e intervalo de cinco minutos entre lembretes. Replay não incrementa contagem. Não emite notificações externas.

`inngest-reader.mjs` consulta somente metadados do app exclusivo vinculado ao projeto; não aceita GraphQL livre. O contrato está baseado no schema oficial v1.44.0. A migration 0152 e a rota `/api/managed-projects/:id/engine` fazem parte do segundo marco local; nenhum vínculo produtivo foi criado. Consulte o bloqueio de execução do motor real e as limitações em `docs/validacao-integracoes-gerenciadas-2026-09-15.md`.

Reversão do piloto: parar seus processos locais, preservar relatórios desejados e descartar apenas dados fictícios. Para produção futura será necessário backup, ensaio de migration e plano próprio de retorno; não há rollback produtivo executado ou necessário nesta etapa.
