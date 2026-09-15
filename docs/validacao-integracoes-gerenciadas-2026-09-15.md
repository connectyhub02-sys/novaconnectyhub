# Integrações gerenciadas — segundo marco local

15/09/2026. Worktree `codex/managed-projects`, base `9d864e13`, piloto anterior `47f0cd65`. Nenhum push, deploy, migration produtiva, cadastro de cliente real ou chamada paga nesta etapa.

## Resultado concreto

| Camada | Implementado e verificado | Limite |
|---|---|---|
| Banco e API REST | PostgreSQL 17.11 e PostgREST 16.3 reais, migrations isoladas, JWT e RLS por cliente | Banco de ensaio, sem migração produtiva |
| Autenticação | Auth v2.197.0 cria quatro contas fictícias, login por senha, refresh e validação de usuário; Next recebe cookies via SDK SSR e valida as mesmas sessões | Binário Auth com adaptação do listener para Windows; Linux oficial e recuperação de conta ainda pendentes |
| Arquivos | Sidecar privado, HMAC por objeto/método/tamanho/hash, catálogo 0151, quota compartilhada, confirmação idempotente, tombstones, recuperação separada e conjunta | Upload da aplicação limitado a 1 MiB; seletor do Chrome não validado; backup online/externo ainda pendente |
| Automações | Leitor fixo de metadados Inngest, vínculo exclusivo app/projeto 0152, rota autenticada e seção no painel; recusa de resposta com escopo divergente | Motor Inngest real ainda não ensaiado; não substitui handlers nem fila produtivos |
| Infraestrutura | Loop serial de coleta, receptor privado separado da Vercel, persistência PostgREST e retenção de sete dias; três amostras fictícias passaram no percurso real; métricas globais invisíveis a cliente | Coletor Linux não instalado; métricas contínuas reais ainda pendentes |

## Evidências de execução

- **41 testes em onze arquivos aprovados:** isolamento, sessão, métricas, recuperação, objetos, catálogo, recuperação conjunta, leitor Inngest e receptor de telemetria.
- **20 verificações HTTP do piloto aprovadas**, incluindo worker separado; **13 verificações HTTP de objetos aprovadas**, até o sidecar de disco real.
- Ensaio real Auth/PostgreSQL/PostgREST: **37 verificações aprovadas**, incluindo receptor de telemetria e isolamento de métricas.
- Ensaio ampliado `--auth --next`: **63 verificações aprovadas**, com cookies, rotas Next, página do projeto renderizada, rota do motor sem vínculo explicitamente não configurada e telemetria real no banco.
- TypeScript e ESLint passaram. `node scripts/managed-projects/build-isolated.mjs` concluiu compilação, TypeScript e 112 páginas estáticas. Usa catálogo vazio e configuração fictícia de build: **esse artefato não deve ser publicado**.

Os testes de recuperação conjunta usam PGlite e escritores parados. Demonstram consistência de catálogo, bytes, permissões e tombstones nesse cenário; não comprovam snapshot online coordenado ou recuperação de desastre na VPS.

## Inngest: contrato e bloqueio do runtime

Consultado o schema oficial da versão v1.44.0: [queries](https://github.com/inngest/inngest/blob/v1.44.0/pkg/coreapi/gql.query.graphql), [tipos](https://github.com/inngest/inngest/blob/v1.44.0/pkg/coreapi/gql.schema.graphql). O leitor solicita metadados de um app e até 50 runs das últimas 24 horas, sem conteúdo de eventos, saídas, configurações, URLs de handlers ou segredos. O cliente não escolhe app, endpoint, credencial, filtro CEL ou consulta GraphQL. O backend usa o vínculo autorizado e recusa resposta fora dele. Um app compartilhado por vários clientes **não deve ser vinculado**; a unicidade no catálogo não prova exclusividade do conteúdo no motor, que precisa de inventário antes do cadastro.

O release oficial contém binário Windows. A revisão automática bloqueou duas vezes o comando de baixar esse release, verificar SHA256 publicado, extrair em Temp e executar `start --help`; a segunda tentativa ocorreu após autorização explícita do usuário. O retorno informou apenas `blocked by policy`, sem justificativa adicional. Nenhum processo Inngest foi iniciado e não houve tentativa de contornar a revisão. A pendência é ensaiar o motor real em ambiente autorizado e permitido pela ferramenta, mantendo listeners em loopback e dados fictícios.

A avaliação da licença SSPL da versão instalada para a futura oferta gerenciada continua separada do teste técnico. Nenhuma oferta comercial nova foi ativada.

## Antes de propor implantação

Restam: motor Inngest real, limites/carga, ensaio do runtime Linux e permissões de volumes, backup externo e restauração operacional. Preparar inventário de cada cliente antes de vincular apps ou migrar recursos. Betel fica por último; Vision exige inventário próprio. Não cadastrar usuários reais automaticamente.

O usuário pediu aviso **antes** da implantação na VPS. Apresentar commit/pacote exato, migrations, serviços/portas/volumes, recursos esperados, testes e retorno possível. Esta etapa não é autorização de implantação.

Conferência visual posterior: o painel de automações mostra explicitamente que ainda não há app exclusivo do motor vinculado. Captura em `docs/evidencias/managed-pilot-engine-pendente.png`; prévia local preservada no navegador.

## Complemento: alertas persistidos

Migration 0153, receptor privado, rota de telemetria e dashboard global usam o mesmo registro transacional. Três amostras altas abrem alerta; histerese registra recuperação; replay e amostras atrasadas não duplicam eventos. Intervalo sem coleta reinicia a contagem. Estado e histórico foram restaurados em banco separado. O ensaio real ampliado de 63 verificações também confirmou o evento aberto renderizado no Next e a recusa da API global para cliente. Captura: `docs/evidencias/managed-pilot-alertas-persistidos.png`, com dados fictícios.

Modelos Docker/Compose foram preparados para sidecar de objetos e receptor de telemetria, com usuário sem root, limites, segredos em arquivo e portas não publicadas. Docker não foi executado: permissões do volume, digest da imagem e isolamento do runtime precisam ser ensaiados antes de qualquer instalação.
