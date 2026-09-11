# Migração do Inngest para a VPS — 11/09/2026

## Escopo e estado

O agendamento, a fila e o histórico das novas execuções de produção passaram do Inngest Cloud para `https://inngest.connectyhub.com.br`, na VPS Contabo `13.140.34.227`. Os handlers continuam executando na Vercel. O Supabase foi transferido para a mesma VPS na etapa seguinte, descrita em `migracao-supabase-vps-2026-09-11.md`. Cloudflare R2 permanece em uso.

Foram registrados **43 funções, 31 funções com cron e 26 com evento**. Uma função pode ter ambos os tipos de gatilho. O Cloud tinha 41 funções sincronizadas; o novo ambiente inclui os agendamentos e webhooks da API de IA já existentes no código de produção.

Inventário: `evidencias/migracao-inngest-2026-09-11/functions.json`. A comparação normalizada de ID, nome e gatilhos do inventário com o banco do Inngest na VPS produziu o mesmo SHA-256: `4846ba365c7d4a4ef8e7fb35c24523a0d7fd07f427ab18f97d59eb41f00b4bbb`.

## Alterações aplicadas

- Preservadas as chaves de evento e assinatura existentes, verificadas contra o endpoint de produção antes da transferência. A chave de assinatura da VPS usa o valor hexadecimal sem o prefixo do Cloud.
- Vercel, projeto `novaconnectyhub`, ambiente Production: `INNGEST_BASE_URL=https://inngest.connectyhub.com.br` e `INNGEST_DEV=0`.
- Desativada a integração automática do projeto nas configurações Vercel do Inngest Cloud. O app Cloud `connectyhub` foi arquivado antes da ativação das agendas na VPS; seu histórico continua disponível.
- Redeploy da mesma revisão `11f9f719fcf120669319d952dd66e691d953ba2b`, implantação `3ivYS6T37L57YFwtM2yJwRFhc4bc`, concluído com estado Ready. Nenhuma mudança de código entrou nesse redeploy.
- Compose do Inngest: `--sdk-url https://www.connectyhub.com.br/api/inngest --poll-interval 300`, permitindo sincronizar alterações posteriores da aplicação a cada cinco minutos.
- Caddy libera as rotas de comunicação do SDK (`POST /e/*`, `POST /fn/register`, `GET /v0/runs/*`) para a autenticação nativa do Inngest. O restante, incluindo painel administrativo, permanece protegido por Basic Auth. Não foi removida a autenticação nativa dessas rotas.
- PostgreSQL e Redis persistentes permanecem com portas internas. Backups/configuração anterior foram preservados para retorno.
- Arquivos temporários locais/remotos usados para transferir as duas chaves foram removidos após a validação.

## Transição e validações

- Antes do arquivamento, as pendências observadas eram varreduras periódicas (arquivos, catálogo e filas/guardas WhatsApp), cujo trabalho é consultado no banco. A fila de arquivo possui retomada de claims antigos após cinco minutos. O arquivamento cancela as execuções Cloud pendentes, não transporta seu estado para a VPS.
- Na lista de eventos Cloud consultada após a troca, o último evento de aplicação era de 04:00:15 BRT, concluído antes da janela de transição. Não foi observado evento de aplicação recebido durante a troca. O histórico antigo não foi reexecutado em massa.
- GET assinado de `/api/inngest`: HTTP 200, autenticação válida, 43 funções e origens da API/eventos apontando para o subdomínio da VPS.
- Evento inofensivo `connectyhub/admin.ping`, ID externo `vps-migration-admin-ping-2026-09-11`, recebido como `01M27QRX7J4TFNN0Q61939D8CV` e concluído na VPS.
- As primeiras agendas concluíram para IA, webhooks IA, agenda, follow-up, checkout, automação da plataforma, catálogo, filas WhatsApp, filas Meta, publicação Meta, saídas WhatsApp e renovações de lojas. Não foram enviados WhatsApps nem cobrados pagamentos artificiais como testes.
- As agendas diárias/semanais foram verificadas pelo registro e gatilhos; não foram acionadas manualmente. Registro correto não equivale a teste funcional de todos os fluxos de negócio.
- Backup pós-migração concluído às **08:07:36 UTC**, `Result=success`, `ExecMainStatus=0`.
- Na amostra final, 19 funções distintas concluíram 80 execuções. As nove falhas finalizadas eram da rotina de arquivamento descrita abaixo; não representam nove funções diferentes. A correção local passou no ESLint do arquivo e em `git diff --check`.

## Falha anterior à migração: arquivamento

O Cloud já apresentava falhas em todas as execuções recentes de `ConnectyHub Lead Message Archive`. A VPS reproduziu `MESSAGE_ARCHIVE_BACKFILL_FAILED`.

Diagnóstico somente leitura no Supabase gerenciado:

- Selecionar os primeiros 100 registros candidatos: aproximadamente 6,8 ms.
- Sanitizar os mesmos 100 registros: aproximadamente 8.787 ms.
- O papel `authenticator` tem `statement_timeout=8s` e `lock_timeout=8s`; `service_role` não possui override.
- Sanitizar os primeiros dez registros: aproximadamente 54 ms. Medição de uma amostra, sem garantia para todo conteúdo futuro.

A redução de `p_limit: 100` para `p_limit: 10` em `src/lib/leads/message-archive.ts` foi publicada no commit `b7556554f893a368a9e459c9b08c90fc12caaa4b`, durante a migração autorizada do Supabase. Não exige migration SQL. Antes da publicação, `backfill_lead_message_archive(10)` retornou dez linhas em aproximadamente 137 ms no banco de ensaio, em transação revertida. Após a retomada, execuções naturais da rotina concluíram na VPS. Continuar observando o consumo da fila e mensagens individuais muito grandes.

## Validação após migrar o Supabase

O serviço Inngest foi interrompido durante a sincronização final do banco e retomado após reabrir a produção às 09:49:57 UTC. PostgreSQL e Redis persistentes foram preservados. A implantação `dpl_8GmV5AXnpTGKUmgQjHLpWBWTT9DZ` respondeu ao GET assinado com HTTP 200, autenticação válida, 43 funções e ambos os endereços de API apontando para a VPS.

Entre 09:50 e 09:54:35 UTC, a consulta de finalizações registrou 202 execuções Completed e nenhuma Failed, incluindo o arquivamento. Backup posterior concluído às 09:51:44 UTC. Essa amostra não substitui testes completos dos fluxos diários e semanais; não foram disparadas cobranças ou mensagens artificiais.

## Operação e retorno

- Configuração: `/opt/connectyhub/inngest/compose.yaml` e `.env`; credenciais não devem entrar no Git.
- Configuração anterior: `compose.before-production-migration.yaml` e `.env.before-production-migration`, no mesmo diretório.
- Em atualização normal da aplicação, aguardar a sincronização de até cinco minutos e conferir contagem de funções/erros do app. Não reativar a integração Cloud por engano.
- Para retorno, primeiro interromper novas agendas da VPS e inventariar/drenar suas execuções e eventos. Só então remover as duas variáveis novas da Vercel, republicar e reativar o Cloud. Restaurar a configuração anterior da VPS antes de reativar o Cloud evita que o polling registre funções no destino errado. Nunca deixar agendas ativas nos dois ambientes.
- Não usar `docker compose down -v`. Não cancelar contas nem apagar o histórico Cloud antes de concluir a validação e a retenção necessária.

As rotinas de backup e limitações de restauração estão em `preparacao-vps-contabo-2026-09-11.md`.
