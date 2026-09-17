# Cockpit operacional por fases — 16/09/2026

Rota oficial: `/admin/infrastructure`. Prioridade: ConnectyHub e Betel.
Complementa [a primeira camada operacional](infraestrutura-operacional-2026-09-16.md).
Admin OS reúne leitura, preparação SQL e controle de jobs no mesmo projeto.
Credenciais, endpoints privados e respostas brutas de provedores não são devolvidos
ao navegador. Controle interno exige admin da plataforma + allowlist infra;
nenhuma operação crítica é automática durante publicação.

## Fase 0 — diagnóstico antes das mudanças

O checkout salvo estava em `2301a693`, enquanto a master já continha `6a9cb977`,
com coleta HTTP, execução SQL transacional e migration 0151 publicada. A cópia
foi sincronizada por fast-forward, preservando notas locais e arquivos anteriores.
O portal do subdomínio continua sendo outro serviço. GitHub/Vercel não atualizam
automaticamente esse portal nem o app-production da Betel.

| Área | Estado observado antes do complemento | Falta / fonte |
|---|---|---|
| CH app/API/Auth/REST/banco/Storage | Funcional, HTTP real e RPC de histórico | Saúde HTTP não comprova resultado de negócio |
| CH Inngest | HTTP 401, autenticação bloqueada | `INFRA_HEALTH_PROJECTS_JSON.connectyhub.inngestAuthorization` |
| Betel app | Login público VPS HTTP 200 em 16/09 | Adicionado probe público de disponibilidade, sem inferir estado do banco |
| Betel Supabase | Auth HTTP 403 sem credencial em 16/09 | `INFRA_HEALTH_PROJECTS_JSON.betel.supabaseKey`; nenhuma chave CH reutilizada |
| Betel Inngest | Registros locais apontam destino privado `127.0.0.1:28111` | Loopback do host não é acessível pela Vercel; requer adaptador/collector no host |
| SQL | Catálogo, preparação, hash, auditoria e executor existentes | Allowlist, conexão TLS por projeto e habilitação do executor |
| Inventário externo | Destinos parcialmente declarados, cartão “Sem evidência” | Diagnóstico agora agregado por projeto; configuração separada de saúde |
| Deploy VPS | Endpoint/helper e histórico implementados/testados | Publicador do host ainda precisa enviar eventos autenticados |
| Storage R2 / uso | Sem métricas integradas | Implementar adaptador de métricas; health Supabase não representa R2/bytes |

Rotas existentes: inventário `GET /api/admin/infrastructure`, detalhe por projeto,
`GET/POST .../{project}/migrations`, `POST .../{project}/actions`, ingestão
`POST /api/infrastructure/{project}/events`. Banco: `infra_projects`,
`infra_telemetry`, `infra_deployments`, `infra_deploy_events`, `infra_migrations`,
`infra_audit`; RPCs `infra_record_deploy`, `infra_record_telemetry`,
`infra_prepare_migration`, `infra_database_status`. Migrations 0150/0151 já
aplicadas na CH pela entrega anterior. Este complemento não requer SQL novo.

## Fases 1–2 — cadastro e leituras

Inventário dos quatro projetos com empresa, ambiente e destinos declarados.
Estado pronto/incompleto/bloqueado calculado no servidor, separado do health;
cada cartão lista nomes de configurações, vínculo de organização e destinos
faltantes. UUID de organização vem do cadastro; nunca é inferido pelo nome.
Flag cliente permanece sem liberar rotas/permissões para clientes.

ConnectyHub herda apenas seu próprio ambiente. Betel recebe defaults públicos
verificados de login e origem Supabase, substituíveis por
`INFRA_HEALTH_PROJECTS_JSON.betel`. Auth 401/403 é bloqueio de autenticação,
não serviço morto. REST/Storage exigem chave própria. Banco Betel precisa de
endpoint dedicado de leitura em `.database`; migrations usam DSN próprio.
Vision e Hora Space continuam com destinos a confirmar, sem probes presumidos.
JSON malformado bloqueia coleta explicitamente, sem fallback para outro projeto.

O cache HTTP é de 30 segundos/processo e a UI consulta a cada cinco segundos.
Leitura de jobs pelo adaptador tem timeout de quatro segundos. Falta de tabelas,
funções, execuções e deploys agora descreve o receptor/configuração necessária.
Bucket count/bytes/R2 continuam sem integração; UI informa essa limitação.

## Fase 3 — SQL

Preserva preparação imutável, SHA-256, revisão, confirmação digitada por
projeto/ação/versão, auditoria antes de executar, TLS obrigatório, transação,
lock, timeout e recibo atômico no destino. Catálogo cruza histórico real;
lacunas históricas precisam de reconciliação. Sem DSN não presume aplicação.

Complemento: DROP/TRUNCATE/DELETE/UPDATE e ALTER destrutivo são bloqueados por
padrão antes de abrir transação, mesmo com revisão/confirmacão. DML de inserção
e mudanças RLS aparecem entre riscos. Não há override desse bloqueio via browser;
o caso excepcional requer procedimento autorizado no host e backup. Funções e
demais SQL continuam exigindo revisão; análise lexical não é sandbox SQL nem
garantia semântica. Somente operadores internos de confiança podem preparar SQL.

Requisitos por projeto `P`:

- `INFRA_ADMIN_USER_IDS`: UUID do administrador da plataforma designado.
- `INFRA_MIGRATION_EXECUTION_ENABLED=true` e `INFRA_MIGRATION_EXECUTOR=vps-sql`.
- `INFRA_PROJECT_DATABASE_URLS_JSON.P`: DSN PostgreSQL com TLS válido, sem
  parâmetros de URL que alterem SSL, usuário dedicado e histórico reconciliado.
- Migrações 0150/0151 na CH para auditoria/preparação. Não aplicar em cliente
  automaticamente nem usar credenciais de Studio como atalho.

## Fase 4 — jobs editáveis por adaptador

Implementado cliente real HTTPS de leitura/comandos no servidor do Admin OS.
Configuração: `INFRA_JOB_ADAPTERS_JSON.P={"url":"https://host/infra-jobs","token":"..."}`.
Token aleatório base64url de 32–256 caracteres, exclusivo por projeto; URL sem
credenciais embutidas, query string ou fragmento. Configuração ausente/inválida,
resposta antiga, erro de rede ou projeto divergente bloqueiam ações.

**O adaptador do host ainda precisa ser instalado/integrado ao Inngest de cada
projeto.** A chave de eventos Inngest não equivale a credencial administrativa.
Nenhum endpoint nativo de pausa/replay foi inventado nem acionado nesta entrega.
O cliente HTTP foi homologado com fronteira simulada, não no Inngest de produção.

Contrato implementado:

- GET na URL configurada, `Authorization: Bearer <token>` e `X-Infra-Project: P`.
  Retorna somente `project`, `revision`, `observedAt`, `actions` e `snapshot`.
  `snapshot` usa o objeto `inngest` do contrato de telemetria existente:
  funções `{id,status}`, execuções `{id,status,retries}`, contadores nullable
  `failures,retries,queued,delaySeconds,workers`. Até 100 itens por lista e
  corpo de 64 KiB. Timestamp dentro de dois minutos.
- Capacidades aceitas: `inngest_pause`, `inngest_resume`, `inngest_retry`,
  `inngest_resend`. O host deve declarar somente capacidades implementadas.
  Pausa exige função ativa; retomada exige pausada; retry/resend exige execução
  falha. Não existe disparo arbitrário com payload livre.
- POST na mesma URL, mesmas credenciais e `Idempotency-Key`; corpo contém
  `project,actor,action,target,revision,operationId`. Confirmação digitada e
  allowlist são verificadas no Admin OS; estado/capacidade/alvo são relidos
  antes do POST. Hash idempotente vincula projeto/ação/alvo/revisão.
- Host **deve** validar projeto do token, alvo, capacidade e revisão de forma
  atômica, persistir o recibo por operationId e impedir repetição concorrente.
  Revisão é uma geração imutável do estado, muda após operação/mudança relevante;
  não é simplesmente o horário de cada GET. Não configurar um proxy sem estas
  proteções. Retornar somente `project,operationId,status`, com status
  `accepted`, `completed` ou `rejected`.
- `accepted` não vira conclusão. Timeout, erro HTTP ou recibo inválido vira
  resultado incerto e requer reconciliação no host. Não há retry automático.
  Auditoria indisponível impede envio; falha posterior de auditoria exige
  consultar o recibo. Segredos/erros brutos jamais entram na auditoria.

## Fase 5 — deploy auditável

Mantidos helper e receptor reais. Testes controlados conferem retry idempotente,
sequência, isolamento de projeto/executor e histórico/auditoria no PGlite.
No publicador: `INFRA_REPORT_URL`, `INFRA_REPORT_PROJECT`, `INFRA_REPORT_TOKEN`;
no Admin OS: hash do token em `INFRA_INGEST_KEYS_JSON`, escopo `deploy` e/ou
`telemetry`. Enviar arquivo JSON estruturado por `scripts/infra-report.mjs`.
Não executar deploy artificial de cliente para produzir histórico. Vercel,
push GitHub, VPS e proxy continuam separados na UI.

## Fase 6 — camada cliente

`organization_id` e `client_access_enabled` já existem; acesso cliente segue
fechado. RLS/grants não permitem que anon/authenticated leiam/operem as tabelas
infra diretamente. APIs exigem admin da plataforma; ações também exigem allowlist.
A flag sozinha não habilita APIs cliente. Não há SQL/jobs cross-org autorizado
por simples seleção de nome no inventário.

## Validação e publicação

Validação local aprovada: 59 testes em oito arquivos, TypeScript, ESLint,
diff-check e build webpack com 108 páginas. Suíte inclui SQL real em PostgreSQL descartável: sucesso,
rollback, idempotência, conflitos, projeto errado e bloqueio destrutivo; rotas
cobrem sessão/permissão/origem/confirmacão; adaptador de jobs cobre escopo,
revisão, auditoria, recibo, timeout e ausência de retry. Nenhuma migration de
cliente, pausa, replay, mensagem ou cobrança real usada para testar.

Publicação e conferência em produção serão registradas após validação.
