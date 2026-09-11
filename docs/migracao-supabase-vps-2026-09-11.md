# Migração do Supabase para a VPS — preparação

## Escopo confirmado

A aplicação permanece hospedada na Vercel. Migrar o Supabase gerenciado para `supabase.connectyhub.com.br`, na VPS Contabo existente, preservando banco, usuários, regras de acesso, funções e arquivos. O Inngest de produção já está na VPS; seus handlers continuam na Vercel. Cloudflare R2 permanece em uso.

**Estado: ensaio e importação inicial no banco principal da VPS concluídos; troca final em andamento.** O ensaio permanece separado em `migration_trial_20260911`. A produção da Vercel foi pausada em 11/09/2026 às 09:32 UTC para drenagem e sincronização final. As três variáveis Supabase foram atualizadas, mas ainda é necessário publicar e validar a implantação antes de retomar o serviço. Não cancelar o Cloud antes da validação completa e da janela de retorno.

## Inventário da origem

Fonte: painel autenticado e consultas SQL somente leitura em 11/09/2026. Contagens registradas em `evidencias/migracao-supabase-2026-09-11/inventory.json`.

- PostgreSQL 17.6; aproximadamente 1,22 GB de tamanho físico do banco.
- 152 tabelas públicas, 174 funções públicas e 253 políticas públicas de acesso.
- 25 usuários; identidades: 18 por e-mail e 7 por Google.
- Dois buckets privados: `lead-archive` com 26 objetos (3.294.932 bytes) e `platform-deliverables` vazio.
- Nenhuma Edge Function publicada e nenhuma tabela na publicação consultada do Realtime.
- Schemas adicionais: auth, storage, realtime, vault e supabase_migrations. Vault sem segredos, pg_cron não instalado e 83 registros no histórico de migrations. Os scripts de roles exportados contêm configurações de timeout dos papéis padrão; o papel temporário de login do CLI não é uma dependência da aplicação.
- Login por e-mail e Google habilitado; cadastro permitido, confirmação de e-mail desativada, login anônimo e associação manual de identidades desativados.
- Site: `https://www.connectyhub.com.br`. Retornos permitidos: `/auth/callback` nos domínios com e sem `www`.
- SMTP personalizado não configurado: a origem usa o serviço de e-mail embutido do Cloud. Não presumir que esse serviço acompanha o banco exportado.

## Destino conferido

O PostgreSQL da instalação Supabase da VPS também está em 17.6. O destino, inicialmente vazio, recebeu a restauração transacional do primeiro snapshot e o histórico de migrations. A extensão `pg_graphql` 1.5.11 foi instalada. Auth, REST e Storage voltaram saudáveis após a importação.

A preparação local em `next.config.ts` permite imagens de `https://supabase.connectyhub.com.br/storage/v1/**`, preservando a compatibilidade com os endereços anteriores durante a transição. Essa alteração ainda não foi publicada.

## Exportação e ensaio concluídos

- A senha redefinida pelo titular permitiu conectar diretamente ao PostgreSQL da origem a partir da VPS. Credenciais armazenadas somente em arquivos privados; não incluídas no repositório.
- Exportação em `trial-20260911T083509Z`: roles, schema e dados pelo CLI Supabase; histórico `supabase_migrations` exportado separadamente. Dump de dados: 1.377.668.222 bytes. Checksums SHA-256 registrados na VPS.
- Backup do destino vazio realizado antes do ensaio. Restauração transacional no banco isolado, incluindo `pg_graphql`, com sucesso.
- Comparação do dump com o banco restaurado: **181 tabelas, 421.789 linhas e zero diferenças de contagem**. Conferidos 25 usuários, 152 tabelas públicas, 174 funções públicas, 253 políticas públicas e 83 migrations.
- Comparação adicional com a origem confirmou igualdade dos hashes de senha, conteúdo das carteiras de créditos, flags RLS, políticas públicas e gatilhos públicos. A comparação de políticas foi executada com `search_path=pg_catalog` em ambos os lados para evitar diferenças apenas de qualificação de nomes na representação SQL.
- Exportação dos dois buckets e download de 26 objetos, totalizando 3.294.932 bytes, com manifesto e SHA-256. Os objetos foram enviados pela API Storage do destino e baixados novamente: todos conferidos byte a byte. Repetir a sincronização após congelar a origem para capturar eventuais arquivos recentes.
- A chamada `backfill_lead_message_archive(10)` retornou 10 em aproximadamente 137 ms no ensaio, dentro de transação revertida. Não houve mensagens ou pagamentos artificiais.

## Autenticação e e-mail

- Credencial Google preservada em arquivo privado na VPS. Novo callback `https://supabase.connectyhub.com.br/auth/v1/callback` adicionado ao cliente OAuth existente; callback Cloud mantido para transição. Console confirmou salvamento.
- Google e URLs de retorno configurados no serviço Auth do destino, que voltou saudável. Cadastro do destino permanece desabilitado até a troca final; telefone desativado para acompanhar a origem.
- Origem sem Auth Hooks personalizados. Sessões sem duração máxima ou timeout de inatividade; múltiplas sessões permitidas; validade de acesso de 3.600 segundos e rotação de refresh com intervalo de reutilização de 10 segundos.
- TOTP habilitado, SMS MFA desativado, máximo de 10 fatores; janela AAL1 de 15 minutos aplicada ao Auth no reinício.
- Resend escolhido e conta criada pelo titular. Domínio `connectyhub.com.br` verificado em São Paulo. Registros DKIM, SPF/MX do subdomínio `send` e DMARC adicionados no DNS autoritativo da Vercel, preservando a hospedagem.
- Chave `ConnectyHub Supabase Auth VPS` criada com **Sending access restrito a connectyhub.com.br**. A tentativa anterior de escopo All domains foi bloqueada e nenhuma chave ampla foi criada.
- Após o titular fornecer a credencial, SMTP configurado no Auth da VPS: `smtp.resend.com:587`, STARTTLS, remetente `no-reply@connectyhub.com.br`, nome ConnectyHub. A autenticação retornou código 235. Nenhuma mensagem de teste foi enviada; entrega real de e-mail ainda não foi validada.
- As APIs públicas do destino responderam: configurações Auth 200 com e-mail/Google ativos e telefone desativado; consulta interna das carteiras 200; consulta anônima sem nenhuma carteira visível.
- Ainda conferir todos os templates e demais opções do Auth antes da mudança de produção. Notificações adicionais de segurança por e-mail estão desabilitadas na origem; modelo de recuperação de senha usa conteúdo padrão.

## Sequência de execução pendente

1. Concluir SMTP e conferir as opções restantes de autenticação.
2. Concluir verificações de ownership, privilégios e isolamento de acesso no ensaio. Preparar a importação final sem descartar a origem.
3. Copiar objetos pela API de Storage ou S3 compatível; verificar contagens, tamanhos e hashes. Copiar metadados SQL não transfere os arquivos.
4. Configurar Auth, OAuth, SMTP, URLs, API e recursos adicionais existentes na origem. Manter o destino de teste isolado dos envios e cobranças reais.
5. Preparar uma janela controlada de troca: interromper ou reter produtores de escrita, drenar execuções relevantes, capturar os dados finais e conferir a restauração. Não trocar a aplicação para uma cópia defasada.
6. Alterar somente as variáveis Supabase necessárias da Vercel e republicar, pois variáveis públicas são incorporadas ao build. Preservar as demais credenciais da aplicação e sua chave de criptografia.
7. Retomar o Inngest na VPS e verificar login, isolamento entre contas, créditos, arquivos e automações. Validar a correção pendente do arquivamento primeiro no ambiente restaurado, sem mensagens ou pagamentos artificiais.
8. Registrar resultados e manter a origem preservada durante a observação. Um retorno após novas escritas no destino exige reconciliação dos dados; não basta reverter variáveis.

## Referências oficiais

- [Restaurar do Supabase gerenciado para self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Copiar objetos de Storage](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3)
- [OAuth no Supabase self-hosted](https://supabase.com/docs/guides/self-hosting/self-hosted-oauth)
