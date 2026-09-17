# Cockpit operacional — 16/09/2026

Rota oficial: **Admin OS > Sistema > Infraestrutura**, `/admin/infrastructure`.
Esta entrega substitui o bloqueio fixo do MVP por coleta e operação condicionadas
à configuração real. Não executa migrations dos projetos durante a publicação.

## Implementado

- Coleta HTTP no servidor, cache de 30 segundos por projeto/processo, timeout de
  quatro segundos, sem redirecionar credenciais. A coleta é sob demanda enquanto
  o painel está aberto, não um monitor permanente. A interface continua consultando
  a cada cinco segundos. Endpoints vêm apenas da configuração privada do servidor.
- ConnectyHub herda configurações existentes e verifica app/API, Auth, REST,
  consulta sem linhas de clientes ao banco e API do Supabase Storage. Inngest
  usa `/health`; HTTP 401/403 significa autenticação pendente, não serviço morto.
  RPC de leitura retorna versões aplicadas e flags RLS de quatro tabelas internas.
  Verificar uma API não comprova jobs, workers, backup, R2 ou resultado de negócio.
- Inventário de quatro projetos; `organization_id` opcional e flag de acesso
  cliente desligada. RLS/grants permanecem sem acesso de clientes. Não há API
  cliente operacional nesta entrega nem inferência de organização a partir do nome.
- Preparação de SQL versionado pela interface: versão e nome validados, limite
  de 60 KB, SQL imutável, hash SHA-256 normalizado LF, revisão de comandos e risco,
  gravação e auditoria atômicas. Catálogo do repositório e versões preparadas são
  unidos; versões existentes não podem ser sobrescritas.
- Confirmação digitada vinculada ao projeto/ação/versão e aceite de revisão
  vinculado ao hash atual. Backend revalida origem, sessão, admin da plataforma,
  UUID autorizado em `INFRA_ADMIN_USER_IDS`, catálogo e configuração antes de SQL.
- Executor `vps-sql` com conexão PostgreSQL direta e certificado TLS válido,
  transação, lock consultivo por banco, timeout de lock 5 s/comando 20 s,
  timeout de cliente 25 s e transação ociosa 30 s. SQL, registro no histórico
  Supabase e recibo em `infra_control.receipts` são atômicos.
- Recibo guarda projeto, versão, ator, hash, UUID de execução e horário. A auditoria
  central registra início/resultado/hash/horários, sem SQL bruto ou erro privado.
  Repetição com mesmo hash não reaplica. Versão legada já registrada é recusada;
  hash divergente ou recibo de outro projeto no banco bloqueia a execução.
  Lacunas antigas anteriores a uma versão já aplicada também bloqueiam: a ausência
  de registro não autoriza reaplicar estruturas de uma migração histórica.
- Tela mostra resultado, histórico do banco e auditoria. Perda de conexão ou
  interrupção do processo pode deixar início sem conclusão: conferir recibo e
  histórico no destino antes de repetir. Não há transação distribuída entre
  auditoria central e banco de outro projeto; resultado incerto não é sucesso.

## Limites da pré-validação

Análise lexical e indicação conservadora de risco, não prova de correção semântica
nem ensaio de carga. Sintaxe, dependências e permissões são validadas pelo PostgreSQL
dentro da transação durante a execução. Não há execução para validar o preview.
Comandos de transação/sessão, DO, CALL, operações administrativas, escapes ambíguos,
SQL não transacional e alterações dos próprios ledgers exigem procedimento revisado
no host. Alguns arquivos históricos do repositório usam esses comandos e são
explicitamente bloqueados no cockpit. Migrations não substituem backup revisado.

## Configuração necessária

| Capacidade | Requisito |
|---|---|
| Preparar SQL | Usuário já administrador da plataforma em `INFRA_ADMIN_USER_IDS`; migration 0151 aplicada |
| Executar SQL | Requisitos acima, `INFRA_MIGRATION_EXECUTION_ENABLED=true`, `INFRA_MIGRATION_EXECUTOR=vps-sql`, `INFRA_PROJECT_DATABASE_URLS_JSON.<project>` |
| Banco alvo | PostgreSQL acessível pela aplicação via TLS verificado, credencial de migration dedicada, histórico `supabase_migrations.schema_migrations(version,name,statements)` existente e reconciliado |
| Projeto externo | `INFRA_HEALTH_PROJECTS_JSON.<project>`: app/api/worker/endpoints específicos; supabaseUrl/supabaseKey quando aplicável |
| Inngest protegido | Endpoint `inngest` e `inngestAuthorization` exclusivos do projeto no mesmo JSON |
| Deploy/container/R2/métricas jobs | Coletor do host e integração do publicador com receptor já existente, credenciais por projeto/escopo |

Não transportar credenciais do Studio para o navegador. URLs PostgreSQL não aceitam
query string que permita desabilitar TLS. O executor não cria um histórico vazio
para fingir que migrations antigas estão pendentes. A ausência do histórico bloqueia
a execução. Cada DSN deve corresponder a um único projeto; o mapa é provisionado
apenas no servidor por operador responsável. O usuário do banco precisa permitir
DDL autorizado e gravação no histórico e no schema de recibos.

## Schema e evidência real

Migration `0151_infrastructure_operations.sql` aplicada em transação pelo Studio
existente, com registro em `supabase_migrations.schema_migrations` e `infra_audit`.
SHA-256 LF: `826b1c1d13c57dff1a3c251be98c980fddd1f5e44fd968f9b56ec0609897ec43`.
Verificação real: quatro projetos, zero flags cliente habilitadas, anon sem EXECUTE
na consulta de status, authenticated sem EXECUTE na preparação, service_role com
EXECUTE na consulta. Sem alteração em dados de negócio ou banco de cliente.

Probes reais anteriores ao deploy: app/login, Auth, REST e Supabase Storage HTTP
200. Inngest `/health` HTTP 401: acesso autenticado do coletor ainda pendente.
O portal do subdomínio é um serviço separado na VPS; a publicação da aplicação
principal não atualiza sua imagem. Alias `/infraestrutura` no domínio principal
redireciona para a rota oficial. Ativar o redirecionamento no portal ainda requer
acesso ao publicador/host correspondente.

## Validação e publicação

45 testes direcionados de API, SQL PostgreSQL/PGlite, coletor e reporter aprovados.
Complementos finais de histórico/risco passaram em 20 testes; ESLint e TypeScript
aprovados. Build Next/webpack completo com 108 páginas e catálogo SQL no trace,
usando somente variáveis necessárias do checkout principal no processo, sem novo
arquivo de segredo. Consulta real via service_role: 105 versões no histórico até
0151 e RLS ativo nas quatro tabelas consultadas. Testes locais não comprovam
execução remota em bancos de clientes; essa operação não foi disparada.

Aplicação publicada em `8b0d19434c77b7d4673abb839d0845dbb567fd78`;
[Vercel dpl_3HvEPJMW4w4HKpptUed4qbhaepFL](https://vercel.com/nova-connectyhub-s-projects/novaconnectyhub/3HvEPJMW4w4HKpptUed4qbhaepFL)
Ready / Latest / Production, domínio principal vinculado, às 21:14:36 BRT.
Probes posteriores: `/api/health` 200 com o SHA correto, inventário administrativo
401 sem sessão, alias `/infraestrutura` 307 para `/admin/infrastructure`.

Navegador autenticado em produção: menu Sistema, inventário dos quatro projetos,
detalhe CH com app/API/Auth/REST/banco/Supabase Storage saudáveis, Inngest 401
explicitamente identificado como autenticação pendente, worker sem configuração,
versão de aplicação correta, polling atualizando horários, catálogo mostrando
0151 aplicada e aba de auditoria mostrando `schema_install`. Layout desktop
conferido visualmente. Navegação nova foi usada após o documento anterior permanecer
aberto no navegador. Não foi executado SQL ou criado rascunho de teste em produção.

A própria UI confirmou falta da allowlist infra do usuário, das três configurações
do executor e da autenticação do coletor Inngest. Próximo passo operacional: cadastrar
o admin infra designado, provisionar DSNs TLS de migrations com escopo por projeto,
configurar os coletores ausentes e homologar uma migration autorizada pelo fluxo
do cockpit. Não houve concessão automática de privilégios ou cópia da senha do
Studio para a Vercel. A ativação do portal legado requer seu publicador na VPS.

Referência do driver: [transações node-postgres](https://node-postgres.com/features/transactions)
e [timeouts/TLS do Client](https://node-postgres.com/apis/client).
