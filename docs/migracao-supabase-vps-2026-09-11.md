# Migração do Supabase para a VPS — 11/09/2026

## Estado de produção

O Supabase passou para `https://supabase.connectyhub.com.br`, na VPS Contabo. A Vercel continua hospedando a aplicação e os handlers; o Inngest opera na VPS e o Cloudflare R2 permanece em uso.

A produção foi reaberta às **09:49:57 UTC (06:49:57 BRT)**. Banco, usuários, regras de acesso, funções SQL, histórico de migrations e arquivos foram transferidos. O Supabase Cloud foi preservado em modo somente leitura; o app do Inngest Cloud permanece arquivado. Nenhuma assinatura foi cancelada.

As verificações técnicas abaixo passaram. Ainda dependem de confirmação do titular o login completo no navegador e a conferência visual do painel. O SMTP autenticou, mas a entrega real de e-mail não foi testada. A migração não equivale a um teste integral de todos os fluxos de negócio.

## Dados transferidos e conferidos

- PostgreSQL 17.6 na origem e no destino.
- **181 tabelas exportadas, 421.808 registros e zero diferenças de contagem** no snapshot final, antes de retomar os serviços.
- 152 tabelas públicas, 174 funções públicas, 253 políticas públicas e 83 registros de migrations.
- 25 usuários; 18 identidades por e-mail e sete por Google. Hashes de senha iguais aos da origem.
- Conteúdo das carteiras de créditos, flags RLS, políticas públicas e gatilhos públicos iguais aos da origem congelada. Comparação de definições com `search_path=pg_catalog` nos dois lados.
- Dois buckets privados: `lead-archive` com 26 objetos, somando 3.294.932 bytes, e `platform-deliverables` vazio. Objetos enviados pela API Storage e baixados novamente; os 26 arquivos conferiram byte a byte.
- Nenhuma Edge Function publicada na origem, nenhuma tabela na publicação Realtime consultada, Vault sem segredos e `pg_cron` não instalado. Não havia trabalhos desses recursos para transferir.
- Roles, schema, ownership e privilégios restaurados pelo procedimento oficial. `pg_graphql` 1.5.11 instalado. Histórico de migrations exportado e restaurado separadamente.

Inventário e evidências resumidas, sem credenciais: `evidencias/migracao-supabase-2026-09-11/inventory.json`.

## Execução da troca

1. Ensaio isolado em `migration_trial_20260911`: 181 tabelas, 421.789 registros, sem diferenças de contagem. Backup do destino vazio e restauração transacional concluídos.
2. Vercel pausada às 09:32:49 UTC. Inngest parado durante a sincronização final, preservando seus volumes PostgreSQL e Redis.
3. Origem colocada em modo somente leitura e conexões de aplicação drenadas. Snapshot final: `final-20260911T093810Z`, dump de dados com 1.377.691.905 bytes.
4. Schema final comparado ao inicial antes da atualização transacional do destino. A atualização preservou as versões físicas dos arquivos de Storage; depois os objetos foram sincronizados e verificados novamente.
5. Três variáveis existentes da Vercel atualizadas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`. Alvos compartilhados Production/Preview preservados. As outras credenciais, incluindo a chave de criptografia da aplicação, não foram substituídas. As mesmas três configurações foram atualizadas no `.env.local`, fora do Git.
6. Como a Vercel não compilava um projeto pausado, uma regra temporária de manutenção foi criada com autorização específica do titular. O projeto foi despausado para compilar; a regra foi removida após a implantação ficar Ready e o destino passar nas verificações. Conferência final: zero regras temporárias restantes.
7. Implantação da troca: `dpl_8GmV5AXnpTGKUmgQjHLpWBWTT9DZ`, commit `b7556554f893a368a9e459c9b08c90fc12caaa4b`, com aliases públicos ativos. Inngest retomado após a reabertura.

Não foi criada nova migration SQL de aplicação. Os 83 registros existentes foram preservados.

## Autenticação e e-mail

- Cadastro permitido, login anônimo desativado, confirmação de e-mail desativada e telefone desativado, acompanhando a origem.
- Site `https://www.connectyhub.com.br`; callbacks `/auth/callback` nos domínios com e sem `www`.
- Google habilitado com a credencial existente. Callback `https://supabase.connectyhub.com.br/auth/v1/callback` acrescentado ao cliente Google; callback Cloud preservado durante a transição.
- Sessões múltiplas, sem duração máxima ou timeout de inatividade; acesso de 3.600 segundos, refresh com rotação e reutilização de 10 segundos.
- Códigos de acesso por e-mail com oito dígitos e validade de 3.600 segundos, acompanhando a origem. Alteração de e-mail exige confirmação nos dois endereços.
- TOTP habilitado, SMS MFA desativado, máximo de 10 fatores e janela AAL1 de 15 minutos. Origem sem Auth Hooks personalizados.
- Resend em São Paulo, domínio `connectyhub.com.br` verificado. DKIM, SPF/MX de `send` e DMARC adicionados no DNS autoritativo da Vercel.
- Credencial com permissão de envio restrita ao domínio. SMTP `smtp.resend.com:587`, STARTTLS, remetente `no-reply@connectyhub.com.br`, nome ConnectyHub. Autenticação retornou **235**; nenhuma mensagem de teste foi enviada.
- Notificações adicionais de segurança por e-mail desativadas na origem. Os seis templates de autenticação foram conferidos e usam o conteúdo padrão: confirmação, convite, recuperação, acesso por link, alteração de e-mail e reautenticação. Passkeys, servidor OAuth próprio, CAPTCHA e bloqueio de senhas vazadas estavam desativados na origem.

No teste de login Google pelo Chrome, o subdomínio ainda alcançou a página antiga da Vercel. O resolvedor do Windows e uma chamada HTTPS no mesmo computador já alcançavam corretamente a VPS; solicitado reinício completo do navegador para validar o acesso. A ferramenta não permite abrir a página interna de limpeza de DNS do Chrome.

O navegador pode exigir novo login porque o endereço do Supabase mudou. Usuários e senhas foram preservados; sessões e links antigos não devem ser presumidos compatíveis com o novo emissor de autenticação.

## Verificações após a troca

- Todos os containers Supabase e Inngest saudáveis.
- Site, login e documentação pública: HTTP 200.
- Configurações Auth: HTTP 200, e-mail e Google ativos, telefone desativado.
- Consulta de carteiras com chave de serviço: HTTP 200. Consulta anônima: nenhuma carteira visível. O objeto privado consultado não foi servido pela rota pública sem autenticação.
- Conferidos 16 arquivos JavaScript da página de login: endereço da VPS presente, endereço do projeto Cloud ausente.
- GET assinado do handler Inngest: HTTP 200, assinatura válida, 43 funções, API e eventos apontando para `inngest.connectyhub.com.br`. GET sem assinatura retorna 401, como esperado.
- Entre 09:50 e 09:54:35 UTC: **202 execuções finalizadas como Completed e nenhuma como Failed**, incluindo arquivamento de mensagens. Agendas diárias e semanais conferidas por registro, sem disparo artificial.
- Backup pós-migração concluído às **09:51:44 UTC**, `Result=success`, `ExecMainStatus=0`.
- Nenhuma cobrança ou mensagem de WhatsApp artificial disparada como teste. A amostra de execuções não comprova todos os cenários futuros.

## Operação, retenção e retorno

Configuração privada: `/opt/connectyhub/supabase`. Snapshots, manifestos e relatórios detalhados: `/opt/connectyhub/migration-supabase`, acesso restrito ao root. Backups diários e suas limitações: `preparacao-vps-contabo-2026-09-11.md`.

O banco Cloud permanece congelado e não recebe novas operações. Não basta reverter variáveis: **após a reabertura, novas escritas existem somente na VPS**. Um retorno exige nova manutenção, interrupção dos produtores e reconciliação dessas escritas antes de reativar a origem. O helper privado `unfreeze-source.py` somente remove o modo de leitura; não reconcilia dados e não deve ser executado isoladamente.

Antes de cancelar o Cloud: concluir login e teste de entrega de e-mail, conferir o primeiro Auto Backup da Contabo, manter cópia externa recuperável e observar a operação. O backup local não substitui uma cópia fora da máquina. Preservar o histórico antigo do Inngest pelo período necessário; ele não foi reexecutado nem convertido para o banco do novo serviço.

## Referências oficiais

- [Restaurar do Supabase gerenciado para self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Copiar objetos de Storage](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3)
- [OAuth no Supabase self-hosted](https://supabase.com/docs/guides/self-hosting/self-hosted-oauth)
