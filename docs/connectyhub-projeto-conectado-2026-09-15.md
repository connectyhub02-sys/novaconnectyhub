# ConnectyHub como projeto real no portal — 15/09/2026

Primeira conexão administrativa em leitura com a operação existente. Nenhum banco, atendimento, saldo, tarifa, arquivo físico ou automação produtiva foi migrado ou alterado. O portal passa a mostrar uma seleção real, atualizada periodicamente, sem conceder SQL arbitrário ou acesso a credenciais.

## Identidade e escopo

Projeto do portal: `fdf6122a-b883-4d41-968d-71ba1d31d48a`, nome ConnectyHub, slug `connectyhub-producao`. Empresa vinculada: **ConnectyHub Interno**, UUID `c5b8e371-b60d-4a17-94da-0a93e69a285d`, o mesmo identificador da organização de origem. Não foi utilizada uma empresa QA.

A identidade foi confirmada pelo slug técnico `connectyhub-platform-whatsapp` utilizado em `src/lib/admin/platform-whatsapp-console.ts`, pelo plano `internal`, pelo proprietário marcado como administrador na origem e por registros operacionais reais. Organizações semelhantes com plano trial e as prévias de voz em organização própria ficaram fora do vínculo. Não é uma identificação jurídica nem agregação automática de todas as empresas do proprietário.

| Área | Fonte real e limites |
|---|---|
| Banco | Catálogo global do PostgreSQL produtivo, tamanho e estatísticas de até 400 tabelas public/auth/storage. Contagens de linhas são estimativas, sem conteúdo SQL arbitrário. |
| Organização | Contagens exatas de membros, leads e arquivos das tabelas selecionadas, restritas à organização interna. Não são totais de todos os clientes. |
| Arquivos | Até 50 metadados de lead_files/studio_assets da organização, sem conteúdo, nomes pessoais, object keys ou URLs privadas. Contabilidade organization_storage_usage apresenta o timestamp do último recálculo. Lista global de até 50 buckets do Supabase, sem atribuí-los à organização. Não há inventário direto do R2 nem verificação física/download de objetos. |
| Consumo | usage_events da organização nos últimos 30 dias, agrupado por moeda, billing_mode e estado. Custos registrados e créditos aparecem separados; valores ausentes não viram zero. Não equivale a fatura conciliada nem inclui Vercel/Contabo, outras organizações ou Voice Previews. |
| Carteira | Somente credit_wallets da própria organização; ausência não leva à escolha de outra carteira. Nenhuma reserva/débito é executada. |
| APIs | Até 100 projetos IA/Voz da organização, somente nome, ID, tipo e estado. Sem chaves. |
| Automações | Até 100 cadastros de agentes da organização ou globais da plataforma, lidos do Supabase. Cadastro não prova execução. Inngest existente **não conectado** nesta etapa: nenhum runtime, retry, dispatch, replay ou controle de execuções foi instalado. |

## Comunicação e acesso

`collect-connectyhub.sql` contém consultas fixas, em transação `REPEATABLE READ READ ONLY`, com statement timeout de 8 segundos e lock timeout de 1 segundo. Um coletor próprio no host executa o arquivo via socket local do container PostgreSQL existente; não recebe SQL, nomes de tabela, URL ou parâmetros do navegador. Não criamos usuário/chave produtiva no processo web. A capacidade Docker do coletor é administrativa no host: a segurança de leitura depende do script fixo protegido e da transação; não deve ser transformado em um executor de solicitações externas.

O resultado minimizado é persistido somente em `portal_source_connections` no banco do portal. Timer `connectyhub-managed-source.timer` atualiza a cada minuto. Falha conserva a última coleta com estado failed; a UI destaca pendência ou idade superior a três minutos. “Atualizar visualização” relê o snapshot, não força uma consulta produtiva. Origem, data e escopo ficam visíveis em cada seção.

RLS da conexão permite somente administrador de infraestrutura. Política restritiva oculta o próprio projeto real de usuários comuns, mesmo com vínculo explícito de operador. A função de acesso impede escrita em recursos gerenciados conectados e o endpoint de mutações do portal recusa essa conexão. O estado técnico local `paused` desabilita a fila diagnóstica; o cartão usa “Conectado”, pois não representa pausa da operação produtiva.

Somente GET em `/api/connected-projects/{id}`; autenticação e privilégio são verificados antes da leitura. Cache HTTP privado/no-store. Não copiar a sessão de produção, usuários de clientes ou segredos para o painel. Os cadastros de QA continuam visíveis e identificados como homologação.

## Implantação e recuperação

A schema `connected-source.sql` é aplicada **apenas ao managed_portal**. O bootstrap novo inclui a tabela vazia; `connect-production.py` realiza o vínculo fixo somente após verificar a origem. Para atualização de instalação anterior, aplicar essa SQL uma vez, recarregar o schema PostgREST e executar o vínculo. Reexecução do vínculo existente preserva o identificador. Não criar vínculo por correspondência parcial de nome.

O backup do portal inclui a tabela e o snapshot. Depois de restaurar, revalidar identidade e acesso do coletor; manter o indicador desatualizado até a primeira coleta válida. O script de verificação recebe credenciais por stdin e registra apenas resultados resumidos. Segredos e snapshots de consumo não ficam no Git.

Testes preparados e executados nesta entrega: autorização antes da consulta, ausência de vínculo, preservação de erro/timestamp; matriz SQL em transação revertida com cliente explicitamente vinculado como operador e projeto temporariamente active; administrador lê, cliente não vê projeto/snapshot e nenhum deles ganha escrita na origem. O código de verificação HTTP cobre login, todas as seções, ausência de campos secretos, recusa de POST e isolamento de outro usuário. Evidências finais de publicação ficam no estado operacional e no diretório de evidências datado.
