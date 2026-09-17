# Cockpit de infraestrutura — MVP local, 16/09/2026

Implementação em worktree separada, sem push, deploy, migration em banco real ou alteração de VPS, Supabase e Inngest. O inventário inicial é declarativo; não comprova disponibilidade. Nenhum coletor real foi conectado.

## Entrega

- Menu administrativo **Infraestrutura**, `/admin/infrastructure` e página por projeto.
- Inventário ConnectyHub, Betel, Vision; ambiente, empresa, app/API, Supabase, Inngest, worker e storage. Vision permanece com topologia a confirmar. Betel: VPS/app-production e Vercel como proxy.
- Saúde por serviço, versão/imagem/container, rollback informado, logs estruturados do app, tabelas críticas/RLS/permissões, funções/eventos/falhas/retries/fila/atraso/workers. Valores ausentes ficam desconhecidos; contadores ausentes não viram zero.
- **Deploy VPS nesta entrega:** etapas, executor autenticado, imagens anterior/nova, horário, container/healthcheck, logs resumidos e histórico persistente. Polling de cinco segundos, sem sobrepor requisições; troca de projeto/deploy cancela leitura anterior. Falha de conexão preserva a última leitura com aviso. Telemetria com mais de dois minutos deixa de sustentar saúde; deploy ativo sem progresso recebe alerta.
- Quatro origens separadas: `vercel`, `vps`, `vercel_proxy_vps`, `github_push`. Push não comprova implantação. Na Betel, o publicador de app envia **vps**; atualização exclusiva do proxy envia **vercel_proxy_vps**.
- Catálogo SQL versionado da ConnectyHub lido dos arquivos do pacote, checksum SHA-256 com LF, preview e comparação com versões declaradas pelo coletor. Outros projetos usam catálogo `infra_migrations`, provisionado pelo operador via processo revisado. Nenhum SQL livre é aceito na API de ação. Catálogo carregado uma vez, fora do polling.
- Preparação de aplicar migration, pausar/retomar função, reprocessar/reenviar evento e rollback: confirmação vinculada a projeto/ação/alvo; migration também vinculada ao checksum atual. Migrations exibem pré-validação de risco (baixo, revisão ou destrutiva), possibilidade de transação e razões detectadas. A aplicação fica em estado **preparada/bloqueada por configuração (501)** até existirem, no servidor, `INFRA_MIGRATION_EXECUTION_ENABLED=true`, `INFRA_PROJECT_DATABASE_URLS_JSON.<project>` e `INFRA_MIGRATION_EXECUTOR=vps-sql`; valores nunca chegam ao navegador. O painel informa exatamente os campos ausentes antes da confirmação; confirmar registra uma solicitação auditada, sem executar SQL. Mesmo com a configuração preenchida, o adaptador executor desta entrega continua pendente e nenhuma migration real é disparada.

## Acesso e persistência

Migration **0150_infrastructure_cockpit.sql** aplicada no Supabase da ConnectyHub na VPS em 16/09/2026, após autorização. Cria seis tabelas com RLS e nenhuma policy para clientes, duas RPCs exclusivas de `service_role` e três entradas de inventário. Revoga também grants padrão de `service_role`; concedem-se SELECT, INSERT de auditoria e EXECUTE das RPCs. Eventos/histórico/auditoria não podem ser alterados ou apagados diretamente pela credencial de serviço da aplicação.

Não reaproveita organização cliente como permissão infra. Leitura requer sessão Auth e `profiles.is_platform_admin`. Preparação operacional exige adicionalmente UUID na variável server-only `INFRA_ADMIN_USER_IDS`, separada por vírgulas. Lista vazia nega capacidade operacional. Não há autopromoção pelo formulário.

`INFRA_INGEST_KEYS_JSON` guarda **hashes SHA-256**, não tokens:

```json
[
  { "project": "betel", "actor": "betel-publisher", "sha256": "<64 caracteres hexadecimais>", "scopes": ["deploy"] },
  { "project": "betel", "actor": "betel-collector", "sha256": "<outro hash>", "scopes": ["telemetry"] }
]
```

Gerar tokens aleatórios de pelo menos 32 bytes (base64url), guardar o original somente no ambiente/cofre do publicador e configurar seu hash na ConnectyHub. Separar projeto, executor e finalidade; não usar service role do Supabase ou chave Inngest como token de ingestão. Comparação em tempo constante. Rotacionar mantendo `actor` para continuar um deploy existente; retirar o hash anterior após a transição. Nunca usar variável `NEXT_PUBLIC_`.

Eventos válidos e atualizações de deployment/auditoria são transacionais. UUID de deploy global, executor/projeto imutáveis; sequência contígua, início `queued`, progresso sem retrocesso, replay idêntico idempotente. Mesmo número com outro conteúdo retorna 409. Finalização exige etapa anterior `healthcheck` e saúde `healthy` (exceto push GitHub). Conclusão e rollback confirmado são terminais; após falha, o rollback pode informar progresso e só termina com `rollback_ok`/saúde saudável. Falha do rollback volta a `failed`. Etapas opcionais podem ser puladas mantendo ordem; isso não prova que um teste/backup omitido aconteceu.

Auditoria registra actor (UUID Auth ou `script:<identidade configurada>`), projeto, ação, alvo de comando, horário, resultado e motivo. Eventos de deploy guardam estado anterior/depois. Tentativas inválidas e replays também são registrados. Requisições sem sessão/permissão ou token válido recebem registro global sem projeto confiável; não se persiste corpo não validado, token, confirmação nem erro privado do banco. Falha de auditoria bloqueia a requisição com 503. A aba mostra 100 registros do projeto; auditoria global é consultável pelo operador no backend. Snapshots periódicos são registrados na auditoria, mas omitidos da aba para não esconder ações.

## Conectar scripts reais de publicação VPS

O receptor `POST /api/infrastructure/{project}/events` é apenas telemetria. Não executa comandos, shell, SSH, Docker, SQL ou API operacional. O host continua responsável por deploy/backup/teste/rollback e pela precisão da observação.

1. Após publicação autorizada deste pacote e do schema, provisionar token de escopo `deploy` para o projeto.
2. No script da Betel que publica `app-production`, gerar um UUID por tentativa e manter a sequência/payload em arquivos locais duráveis. Capturar imagem anterior/nova antes de publicar, usando tags/digests sem credenciais.
3. Enviar `queued` antes de começar; depois `package`, `build`, `tests`, `backup`, `switch`, `healthcheck`, `completed`, conforme as etapas efetivamente executadas. Para operações demoradas, enviar novo evento `progress` da mesma etapa com sequência seguinte. Não marcar concluído apenas porque o container iniciou.
4. Após falha, enviar `failed`. Se o script executar rollback autorizado, informar `rollback`/`progress` enquanto ocorre; após comprovar a recuperação, enviar `rollback` com `health=healthy` e `code=rollback_ok`. Falha da recuperação deve registrar `failed`. Iniciar uma nova tentativa usando outro UUID.
5. Diante de timeout, repetir **o mesmo arquivo** com mesmo UUID/sequence/conteúdo. Não avançar a fila do repórter sem confirmação; tratar 409 como divergência a investigar, sem renumerar eventos antigos. Se a publicação continuar offline, manter spool local para reenvio sequencial. O helper retorna erro; cabe ao publicador decidir sua política de continuidade, sem substituir seu tratamento de falhas existente.

Exemplo de arquivo inicial (identificadores fictícios):

```json
{
  "kind": "deploy",
  "deployId": "a30a3a19-b65d-4a44-a92c-57c05c56f7ba",
  "sequence": 1,
  "stage": "queued",
  "origin": "vps",
  "app": "app-production",
  "currentImage": "betel:previous",
  "newImage": "betel:20260916",
  "container": "running",
  "health": "unknown",
  "code": "started"
}
```

`stage`: `queued|package|build|tests|backup|switch|healthcheck|completed|failed|rollback`.
`container`: `unknown|running|stopped|restarting|exited`.
`health`: `healthy|warning|error|unknown`.
`code`: `started|progress|step_ok|step_failed|health_ok|health_failed|rollback_ok`.
O executor vem do token; não pode ser enviado no JSON. Início/fim são horários de recepção do servidor; um spool reenviado depois não representa horário original de execução.

Helper incluído (Node 20+):

```sh
# Configurar no ambiente privado do processo, sem gravar token no repositório:
# INFRA_REPORT_URL=https://www.connectyhub.com.br
# INFRA_REPORT_PROJECT=betel
# INFRA_REPORT_TOKEN=<token do publicador, obtido do cofre>
node scripts/infra-report.mjs /caminho/privado/spool/deploy-001.json
```

O helper usa HTTPS (HTTP permitido apenas em localhost), não segue redirects, limita o arquivo a 64 KiB, tem timeout de dez segundos e até três tentativas para falha transitória. Não imprime corpo, token, headers, URL nem erro externo. **Não foi executado contra o receptor real.**

## Telemetria Supabase, Inngest e app

O mesmo receptor aceita `kind=telemetry` com token separado. Preparar coletor no host, com leituras mínimas e credenciais próprias do serviço. Nenhuma credencial de Supabase/Inngest chega ao navegador ou a este payload. Exemplo:

```json
{
  "kind": "telemetry",
  "observedAt": "<ISO-8601 UTC atual>",
  "payload": {
    "services": { "app": "unknown", "api": "unknown", "auth": "unknown", "rest": "unknown", "database": "unknown", "storage": "unknown", "inngest": "unknown", "worker": "unknown" },
    "version": "unknown", "image": "unknown", "container": "unknown",
    "rollbackAvailable": null,
    "appliedMigrations": null,
    "appLogs": [],
    "tables": [],
    "inngest": { "functions": [], "events": [], "failures": null, "retries": null, "queued": null, "delaySeconds": null, "workers": null }
  }
}
```

Enviar a cada 30–60 segundos; janela de observação ±2 minutos, snapshots antigos não substituem novos. Sincronizar relógios. `appliedMigrations=null` significa sem acesso ao histórico; `[]` declara histórico verificado vazio. As versões devem coincidir exatamente com o prefixo do catálogo (`0001`, `0150`, etc.). Não inferir aplicação pela existência de uma tabela; o MVP compara versões, não checksum do SQL aplicado nem drift de schema. Para catálogo de outros projetos, importação revisada precisa fornecer versão/nome/SQL sem segredo/checksum SHA-256 LF.

Tabela crítica: `{ "name": "profiles", "health": "healthy", "rls": "enabled", "permissions": "verified" }`. RLS aceita `enabled|disabled|unknown`, permissões `verified|warning|unknown`. Função: `{ "id": "sync-orders", "status": "active" }` (`active|paused|unknown`). Evento: `{ "id": "event-id", "status": "failed", "retries": 1 }` (`completed|failed|running|queued`). `completed` técnico não comprova resultado de negócio; o coletor deve apurar falhas funcionais separadamente.

App logs: `{ "code": "health_ok", "at": "<ISO-8601>" }`, códigos `process_started|process_stopped|request_failed|health_ok|health_failed`. Só códigos e identificadores operacionais públicos são aceitos, sem stdout/stderr, payload de evento, URL autenticada, DSN, e-mail ou texto livre. Identificadores passam por validação restrita, mas o publicador continua responsável por não colocar segredos em tags/nomes aparentemente válidos. Listas de tabelas/funções/eventos/logs limitadas a 100; migrations aplicadas a 2.000; corpo total 64 KiB. Normalizar métricas no coletor, sem despejar respostas inteiras das APIs.

## Validação local e limites

Resultado desta entrega: **30 testes em cinco arquivos aprovados**, ESLint e diff-check sem erros. PostgreSQL PGlite confirmou isolamento/grants, atomicidade (inclusive falha de INSERT revertendo a atualização do deploy), replay, transições e rollback. Helper testado contra HTTP local, com reenvio idêntico e sem impressão de corpo/credenciais.

Build Next/webpack com TypeScript e **108 páginas aprovado**. Sem env, a primeira coleta de páginas falhou no sitemap de catálogo já existente. O build final usou chaves sintéticas e um servidor fictício em localhost, que respondeu catálogo vazio a GET/HEAD; não houve credencial ou consulta de produção. O resultado é um artefato de QA e precisa ser reconstruído com configuração real antes de qualquer publicação autorizada. Traces conferidos incluem os 150 arquivos SQL necessários ao preview.

Prévia com componentes/shell reais e respostas fictícias conferida em 1440px e 390px: polling atualizou a etapa, confirmação gerou uma única solicitação bloqueada, cinco abas sem overflow, estados vazio/antigo/erro e nenhum erro JavaScript. Rota temporária removida; screenshots e resultado locais em `tmp/infra-qa/` (não versionados). Isso não substitui um teste ponta a ponta com Auth/Supabase/coletores reais.

Arquivos principais:

| Área | Arquivos |
|---|---|
| Telas e navegação | `src/app/admin/infrastructure/{page.tsx,[project]/page.tsx}`, `src/components/connectyhub-os/infrastructure-console.tsx`, `connecty-shell.tsx` |
| Leitura, catálogo e ações | `src/app/api/admin/infrastructure/route.ts`, `[project]/route.ts`, `[project]/migrations/route.ts`, `[project]/actions/route.ts` |
| Receptor dos scripts | `src/app/api/infrastructure/[project]/events/route.ts`, `scripts/infra-report.mjs` |
| Contrato, validação e segurança | `src/lib/infrastructure/{model,validation,server}.ts` |
| Schema / configuração | `supabase/migrations/0150_infrastructure_cockpit.sql`, `.env.example`, `next.config.ts` (inclusão do catálogo SQL no pacote do servidor) |
| Testes | `tests/infrastructure-{sql,validation,routes,reporter}.test.ts`, regressão `tests/admin-api-consoles.test.ts` |

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx vitest run tests/infrastructure-sql.test.ts tests/infrastructure-validation.test.ts tests/infrastructure-routes.test.ts tests/infrastructure-reporter.test.ts tests/admin-api-consoles.test.ts
npx tsc --noEmit
npx eslint src/lib/infrastructure src/app/admin/infrastructure src/app/api/admin/infrastructure src/app/api/infrastructure src/components/connectyhub-os/infrastructure-console.tsx tests/infrastructure-*.test.ts
npm run build -- --webpack
```

Os testes SQL carregam a migration real em PostgreSQL descartável PGlite, com grants padrão similares aos do Supabase. Não conectam ao banco real. Para ensaio integral manual, usar exclusivamente Supabase local descartável com as migrations do projeto, usuário admin local, env local e tokens de teste; enviar eventos com o helper para localhost e conferir o polling. Usuário cliente deve receber 403, admin comum deve ler sem poder solicitar comandos, admin infra deve ver confirmação e 501 auditado. Repetir evento não duplica histórico; outro projeto/token não consegue atualizar o deploy.

Conferir no navegador desktop/celular: inventário, Betel/proxy, mudança automática de etapa, histórico, healthcheck e logs; migrations aplicadas/pendentes/desconhecidas e preview; funções/eventos e bloqueios; auditoria; estado vazio; telemetria antiga; erro com última leitura preservada. Os testes de interface desta entrega usam componentes reais com respostas fictícias, não comprovam coletores nem execução remota.

Pendências explícitas: aplicar schema e publicar somente com autorização; configurar admins/hashes; conectar os publicadores/coletores reais de cada projeto; cadastrar catálogos externos e conferir precisão das observações. História consultada pela UI limitada a 50 deploys e 100 eventos do deploy selecionado; banco preserva o restante. Falta paginação completa, política operacional de retenção/limpeza, rate limiting de ingestão no gateway e adaptadores remotos de execução. Nenhuma dessas pendências autoriza declarar Supabase/Inngest/deploys reais operacionais.
