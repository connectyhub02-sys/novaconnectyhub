# Ensaio portátil de autenticação real — decisão técnica

15/09/2026, preparação local; não é instalação ou alteração da VPS.

Não foram encontrados Docker, Podman, PostgreSQL ou Go no PATH. WSL está presente, mas sem distribuição cadastrada. O caminho oficial do Supabase CLI depende de runtime de contêiner: [documentação](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Alternativa selecionada para investigar

Executar processos temporários, sem registro como serviço, PATH global, registro do Windows, instalação de WSL ou regras de firewall. Todos os listeners devem usar `127.0.0.1`, banco/credenciais novos e fictícios; nenhuma variável de produção copiada. Encerrar somente PIDs iniciados pelo ensaio.

- PostgreSQL 17.11: pacote ZIP EDB apontado pelo [site PostgreSQL](https://www.postgresql.org/download/windows/) e [página de binários EDB](https://www.enterprisedb.com/download-postgresql-binaries), arquivo 1260491. Não executar instalador.
- PostgREST v16.3: ZIP Windows no [release oficial](https://github.com/PostgREST/postgrest/releases/tag/v16.3), hash publicado `5ea4b57b10a26be45521e8e31476a91084c8fe91e060951f04985d86e79367fa`.
- Go 1.27.1: ZIP Windows no [site oficial](https://go.dev/dl/), hash publicado `a3911b5e0e1b1053f25ed0675f4c1c6aad1e2bfcf253df2b9be4caabd2edd95d`.
- Supabase Auth v2.197.0: [fonte oficial](https://github.com/supabase/auth/tree/v2.197.0); release sem binário Windows identificado. Compilação local é tentativa de compatibilidade, não suporte Windows confirmado.

Raiz temporária prevista: `%LOCALAPPDATA%/Temp/connectyhub-managed-real-auth`. Downloads, fonte, caches, binários e banco ficam sob essa raiz. Impacto: downloads de centenas de MB, compilação usando CPU local e alguns GB transitórios; volume disponível observado ~20 GB. Antes de crescer sem controle, medir tamanho e interromper a tentativa. Não baixar ferramentas de terceiros para simular sucesso.

O ensaio deve testar: GoTrue cria usuário fictício e emite sessão/JWT; PostgREST verifica assinatura e aplica papéis/RLS de 0150/0151; sessão inválida e usuário B não veem nem alteram A; administrador do produto não vira administrador da infraestrutura; revogação de membro bloqueia acesso com sessão ainda válida. Depois testar Next com sessão real de ensaio. Um build, mock HTTP ou contexto `auth.uid` injetado não comprovam esse percurso.

Se compilação/execução portátil falhar por dependência de sistema, documentar o impedimento e preparar Compose isolado para runtime futuro. Nenhuma etapa autoriza usar o PostgreSQL produtivo para substituir o ambiente de ensaio.

## Resultado observado: PostgreSQL e PostgREST reais

O script `scripts/managed-projects/real-rest-smoke.mjs` foi executado e repetido com sucesso: **12 verificações**, PostgreSQL 17.11 e PostgREST 16.3 reais. Cada execução cria e remove seu próprio banco e login temporários; aplica as migrations 0150/0151 em dados fictícios. O PostgreSQL fica em loopback 15432; o PostgREST de ensaio usa loopback 18301 e é encerrado pelo script.

Verificados: seleção isolada A/B, administrador de produto sem privilégio de infraestrutura, administrador global explícito, JWT inválido recusado, escrita REST válida, leitura cruzada vazia, escrita cruzada proibida, reserva de objeto, finalização exclusiva do backend e revogação de vínculo mesmo com JWT ainda válido. Nenhuma alteração em produção.

**Limite:** neste script o emissor JWT é uma fixture. A assinatura e as permissões são verificadas pelo PostgREST real, mas isso não comprova criação de conta, login, refresh, recuperação ou cookies Next com Supabase Auth.

## Compatibilidade do Auth em investigação

O fonte oficial v2.197.0 importa `golang.org/x/sys/unix` em `cmd/serve_cmd.go` para configurar `SO_REUSEPORT`, incompatível com compilação Windows direta. Uma cópia exclusivamente temporária está sendo compilada com listener padrão do Go, removendo somente essa opção de socket e seus imports. Nenhuma verificação de senha, sessão, JWT ou autorização foi removida. Esse binário, se funcionar, será um **ensaio com adaptação de plataforma**, não um binário oficial suportado para produção. A compilação e o percurso de autenticação continuam pendentes até haver resultado explícito.

### Resultado posterior — autenticação real aprovada

A compilação terminou com sucesso. `node scripts/managed-projects/real-rest-smoke.mjs --auth` concluiu **29 verificações** com Supabase Auth real: criação administrativa de quatro contas fictícias, login por senha e emissão de sessões, aplicação de JWT no PostgREST, refresh real, consulta autenticada de usuário e recusa de sessão inválida. Inclui os cenários de isolamento por projeto e revogação já descritos. Nenhum e-mail foi enviado; contas foram confirmadas somente no ambiente de ensaio.

O banco temporário recebe schema `auth` e papel sem login `postgres`, esperados pelas migrations oficiais. O Auth usa search_path `auth,public`; as fixtures e migrations do produto são criadas explicitamente sob `public`. Os processos Auth/PostgREST e o banco de cada execução são encerrados/removidos ao final. Senhas e tokens não são impressos nem persistidos em relatório.

Continuam pendentes cookies e rotas Next com a sessão real, recuperação de conta e execução no runtime Linux oficial. A adaptação de listener permanece limitada ao ensaio Windows; não deve ser publicada como substituto do contêiner oficial.

### Percurso completo local com Next

O ensaio ampliado `--auth --next` passou 59 verificações. Cookies são emitidos pelo SDK SSR usando a sessão real do Auth; o proxy e as rotas Next validam o usuário. A página do projeto renderizou apenas os dados do cliente autorizado. JWT, cookie inválido e escopo cruzado são recusados. Inclui a coleta serial de três amostras fictícias no receptor privado até PostgREST/PostgreSQL, com métricas globais restritas ao administrador. Recuperação de conta e reprodução no Linux oficial continuam pendentes.

O PostgreSQL temporário foi encerrado com `pg_ctl stop -m fast` após os ensaios. Dados fictícios e binários permanecem na raiz temporária para reprodução; não há serviço Windows instalado. Para repetir, iniciar esse mesmo pgdata com host 127.0.0.1, porta 15432, shared_buffers=32MB e max_connections=20 antes do script. A prévia Vite em 3026 e o sidecar de objetos em 3081 continuam disponíveis localmente.
