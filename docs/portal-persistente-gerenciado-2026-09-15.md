# Portal gerenciado persistente — 15/09/2026

## Entrega observada

Portal de homologação publicado em https://infraestrutura.connectyhub.com.br, com login próprio, empresas, usuários, projetos, registros JSON, arquivos privados e diagnóstico de fila. O titular entrou e a navegação autenticada foi conferida em projetos, arquivos, automações, clientes e infraestrutura. O ambiente principal da ConnectyHub continua na Vercel com Supabase/Inngest próprios anteriores; não foi migrado para este portal.

O painel não é uma instalação completa de Supabase por projeto. Usa um PostgreSQL independente com isolamento lógico/RLS e serviços Auth/REST exclusivos da homologação. Não importa tabelas SQL, funções, usuários, storage ou integrações da Betel/Vision. O motor Inngest deste portal permanece desabilitado; a fila demonstrada executa somente `diagnostic.ping`, sem mensagens externas, fornecedor de IA ou cobrança.

## Implantação

- Raiz exclusiva `/opt/connectyhub-managed-portal`, Compose `connectyhub-managed-portal`; oito serviços próprios: database, auth, rest, facade, web, objects, diagnostic e telemetry.
- Volume ext4 prealocado de 8 GiB, montagem systemd com `nodev,nosuid,noexec`. Banco e objetos persistem nessa montagem. Inicialização automática depende dela; não foi realizado reboot da VPS.
- Portas publicadas somente em loopback: web 3126 e receptor de métricas 3128. Demais serviços privados. Containers sem privilégios extras, filesystem somente leitura fora dos volumes/tmpfs e limites de memória/CPU/processos/logs.
- DNS A de `infraestrutura` criado na autoridade Vercel, apontando à VPS existente. Caddy recebeu apenas esse virtual host, com HTTPS, limite de corpo de 2 MB e `X-Robots-Tag: noindex, nofollow`; configuração validada e recarregada sem reiniciar o proxy.
- Imagem Linux conferida: `sha256:07c3f3810d5f8f7be559122e5044ecbf3caae25550b7499f720441f7521bf45c`. Dependências próprias fixadas em `services/managed-portal/package-lock.json`; build Next/TypeScript aprovado no Linux.
- Credencial administrativa guardada apenas em arquivo privado local `~/.codex/private/connectyhub-managed-portal/acesso.json`. Senhas, chaves, dumps e arquivos não pertencem ao Git. O e-mail de login é identificador, não uma caixa postal provisionada.

## Verificações

34 verificações HTTP reais passaram com usuários exclusivos de QA: login/cookies seguros, criação de empresa/usuário/projeto, participação por projeto, negação entre organizações, negação de infraestrutura a cliente, registro persistido, upload/download privado e execução diagnóstica concluída. Testes não dispararam mensagens nem consumo faturável.

O reinício de todos os oito serviços da homologação preservou login, registro, objeto e uma única execução concluída. A mesma verificação passou após o backup. Os 16 containers anteriores permaneceram ativos com datas de início anteriores a esta tarefa e zero reinícios; 15 têm healthcheck e estavam saudáveis. A captura autenticada das métricas mostrou amostra recente, CPU 2%, RAM 12,2% e disco 13,2%; são valores pontuais do host, não capacidade garantida nem custo de cliente.

Na preparação, duas falhas reais foram corrigidas: validação de Origin agora admite a origem HTTPS explicitamente configurada atrás do proxy HTTP privado; a política SELECT do banco exclusivo permite `INSERT RETURNING` pelo administrador de infraestrutura, sem depender da visibilidade da linha recém-criada em função STABLE. A política foi alterada apenas no banco de homologação; migrations de produção não foram aplicadas.

Testes locais direcionados já aprovados: 24 testes de sessão/origem, isolamento, objetos e alertas persistentes. Evidências adicionais executáveis: `runtime/verify.mjs`, `verify-persistence.mjs` e `verify-backup.py`.

## Backup e recuperação

Primeiro backup consistente: `20260915T143301Z`. Inclui dump PostgreSQL com ACLs/ownership, objetos privados, configuração Compose e segredos necessários. SHA256 conferido. Dump restaurado em PostgreSQL efêmero sem rede e sem portas, com dados e RLS entre clientes verificados; conteúdo do objeto de QA recuperado do arquivo compactado. Container de ensaio removido depois da conferência, sem escrever no banco ativo.

Cópia externa conferida no computador do titular, fora do Git e com ACL privada: `~/.codex/private/connectyhub-managed-portal/backups/20260915T143301Z`. Essa cópia contém segredos e precisa permanecer privada. A cópia externa é manual nesta entrega, não um backup remoto automático recorrente.

Timer diário habilitado para **05:30 UTC / 02:30 de Brasília**. O procedimento atual pausa brevemente somente este portal para consistência do banco e arquivos. O HTTP 502 observado durante a primeira cópia foi dessa pausa; houve retorno a HTTP 200 e revalidação da persistência. Retenção e exportação externa ainda manuais: revisar espaço semanalmente e confirmar cópia externa antes de remover backups antigos. Não é promessa de disponibilidade contínua.

Para restaurar uma instância completa, preservar configuração/segredos, recriar os papéis Auth/REST com os atributos do bootstrap, importar o dump e restaurar objetos em volume separado antes de trocar o destino. O ensaio automatizado recria papéis sem login apenas para validar dump/RLS; não instala uma segunda aplicação completa nem substitui exercício de desastre do host.

## Limites e continuidade

- QA A/B e contas sintéticas permanecem visíveis; existem empresas de uma primeira tentativa interrompida. Não representam clientes migrados.
- Registro JSON até 16 KiB; arquivo até 1 MiB por envio. Limites por projeto não equivalem a um banco SQL dedicado.
- O worker diagnóstico atende até os primeiros 50 projetos ativos; não cadastrar mais que isso neste estágio. Não executa handlers Inngest.
- Consulta administrativa de contas limitada a 200; paginação não implementada. Troca de senha existe, mas não foi executada pelo titular nesta validação; recuperação por e-mail não configurada.
- Alertas persistidos aparecem no painel; não há envio externo. Telemetria agrega recursos do host para administradores.
- Antes de migrar Betel/Vision: definir stack SQL/Auth/Storage real, importação/validação integral, contratos de endpoint e motor de automações autorizado. Este portal não comprova esses requisitos.
- Sem nova assinatura, alteração de tarifas, síntese, débito ou publicação adicional da aplicação principal na Vercel.

O pacote `17731ed` solicitado anteriormente já estava contido na produção `e597e610`, deployment Vercel `dpl_2Re2Xbn3MwGLn9J5jTFFmnfNCWU9`; nenhuma republicação duplicada foi feita para esse pedido.
