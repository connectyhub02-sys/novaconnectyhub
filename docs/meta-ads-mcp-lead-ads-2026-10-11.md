# Ads MCP e Lead Ads — 11/10/2026

## Escopo autorizado

Implementar as conexões, testar nos ativos próprios, preparar demonstrações e
pedidos de permissão. Não iniciar gastos, ativar anúncios ou cadastrar pagamento.

## Implementação

- Painel compartilhado em Meta Ads do admin, cliente e ambiente de avaliação.
- Conexão ao servidor oficial `https://mcp.facebook.com/ads`, descoberta de
  ferramentas e consultas de campanhas e oportunidades. Allowlist de leitura
  no servidor; conta obtida da organização autenticada. Ferramentas de criação,
  ativação e alteração de orçamento não são executáveis nesta primeira entrega.
- Listagem de formulários da Página selecionada, escolha dos formulários a
  importar, assinatura `leadgen` preservando os eventos anteriores e recuperação
  manual dos últimos 25 cadastros.
- Webhook durável, fila por organização, até cinco tentativas e cron de um minuto.
  Migration `0193_meta_lead_ads.sql` aplicada à produção. Tabelas acessíveis somente
  pelo serviço; endpoints verificam sessão, empresa e papel administrativo.
- Importação transacional e idempotente no CRM, com origem/formulário identificados.
  Não inicia mensagens nem atribui consentimento para campanhas. Dados de contato
  são preservados em metadata; não são misturados com outro canal por telefone.

## Validação real

App `1002348522666389`, login `1530551425223156`, organização interna
`c5b8e371-b60d-4a17-94da-0a93e69a285d`. Reconexão autorizada da Página
`293615710491088`, Instagram `17841477596075477` e conta de anúncios
`act_447324504473617`.

`ads_mcp_management`, `leads_retrieval` e `pages_manage_ads` retornaram concedidos
na consulta real das permissões. `ads_management` está selecionado na configuração
de login, mas não foi concedido ao token; não declarar gerenciamento de anúncios
homologado. MCP retornou HTTP 200 para as duas consultas: campanhas `[]`,
opportunity score 100, recomendações `[]`. Conta ativa, sem campanhas retornadas.

Formulário exclusivo `955748034272513`, “ConnectyHub - validacao CRM sem anuncio -
20261011”, criado com nome/e-mail, política de privacidade da ConnectyHub e link
de retorno ao site. Nenhum anúncio associado. Assinatura app-level de `leadgen`
confirmada no portal; assinatura da Página confirmada pela API, preservando
mensagens e feed. Formulário habilitado somente na organização interna.

## Incidente identificado na validação

A versão `cf9c5cec` passou por 45 testes, TypeScript, ESLint, build e smoke de
health/login/assets/auth/Inngest. Após ativação temporária, o Link de reconexão
fez prefetch em produção e iniciou OAuth sem clique, substituindo o metadata da
conexão interna por pending. Retorno imediato ao slot anterior `63386ecd`.
Credenciais não foram apagadas. Conexão interna restaurada a partir do registro
da autorização recém-concluída, conferindo token válido e escopos na Meta.

Correção: âncora de navegação convencional, sem prefetch, e guarda no endpoint
OAuth para ignorar requisições especulativas/RSC antes de qualquer escrita.
Quatro testes de regressão confirmam ausência de consulta de sessão/escrita.
Não publicar a imagem intermediária `ae3ca939` (fixture TypeScript corrigida em
`08f15133`). Estado final de publicação e teste ponta a ponta deve ser registrado
abaixo quando confirmado.

## Avaliação Meta

Novos escopos preparados no rascunho `1078832598351314`: `ads_mcp_management`,
`leads_retrieval`, `pages_manage_ads`. Justificativas de MCP e leads salvas, com
declaração de uso permitido. Ainda não enviado; MCP mostrava 0/1 teste
contabilizado e informava até 24 horas para atualização. Acesso concedido ao
administrador/testador não equivale a aprovação para empresas externas.

Pendentes nesta etapa: gravações/anexos novos, reprodução dos novos recursos
nos ativos isolados da conta de avaliação e confirmação de entrega real ao CRM.
Não conectar ativos internos ao workspace dos avaliadores.

## Publicação e teste pelo painel às 21h14 BRT

`08f151331967e52dd733c16cf7b1957a9d491147` ativo no slot b/3131; fallback a/3130
em `63386ecd`. Smoke público confirmou health/SHA, login e asset 200, admin sem
sessão 307, endpoint novo sem sessão 401 e GET assinado Inngest 200/57 funções.
PUT da URL pública Inngest registrou o mesmo app, `modified: true`; não foi criado
outro app. Builder parado. Após o registro, o contador da entrega avançou de uma
tentativa manual para três tentativas sem novo clique, confirmando processamento
automático; as tentativas continuam recusadas pela Meta.

No navegador autenticado como admin, os três botões MCP responderam: descoberta
de ferramentas, campanhas vazias e score 100/recomendações vazias. A conexão
continuou carregada após navegação/consultas com a correção de prefetch. Nenhuma
ferramenta de escrita MCP foi liberada ou executada.

O formulário aparece no painel e a ferramenta oficial Lead Ads Testing Tool
confirmou `Successful webhook integration` para o app. Evento real recebido
às 21h07 BRT e entrega `1074710485326312` persistida na fila da organização própria.
O POST inicial via API havia retornado erros 1892059/1892058; pelo botão Create
lead da ferramenta oficial, a Meta confirmou criação e enviou o webhook.

A importação pelo botão do painel falhou ao ler o cadastro: HTTP 400, código 3,
`Apps in dev mode should only access leads submitted from App special roles
(testers, developers, admin)`. A consulta direta confirmou o mesmo bloqueio com
token da Página e da conexão. Nenhum lead foi inventado/inserido para simular
sucesso; CRM permanece sem esse cadastro. A listagem de papéis no portal mantém
Eliane Dias/connectyhub como administradores e Carla/Magno como testadores.
A causa específica da identificação do autor ainda precisa ser resolvida.

O novo mapa de expansão inclui Pixel/CAPI por cliente, catálogo, conversões de
mensagens, publicações/insights, gestor IA e capacidades adicionais. Pixel existe
apenas como campo legado de manutenção/exibição; não está instalado nas lojas.
Não foram acrescentados escopos sem uso implementado ao rascunho de revisão.
App Review continua não enviado e não significa liberação para empresas externas.

Registro complementar das consultas MCP renderizado e conferido em
`output/meta-ads-leads-20261011/edit/ads-mcp-consultas-reais.mp4` (H.264/1080p,
sem áudio). Mostra UI real, respostas vazias e aviso de escopo ausente. Ainda
precisa do percurso de login e reprodução isolada para ser a demonstração final;
não foi anexado como se comprovasse o fluxo completo. Capturas e fontes ficam no
mesmo diretório, fora do Git.

## Revalidação desde 21h39 BRT: leitura de leads resolvida

O bloqueio anterior foi resolvido para a operação própria. A configuração Business
Login `1530551425223156` gera BUSU e continua reservada às empresas clientes. Para
o portfólio proprietário do app, foi criada a configuração separada **ConnectyHub
validacao interna**, ID `1581800719812884`, com User access token e os mesmos
15 escopos selecionados. A administradora Eliane autorizou somente o portfólio,
Página e Instagram próprios. O token resultante recebeu `ads_management`, além
de MCP, leads e demais escopos. Nenhum token foi registrado neste documento.

O callback inicialmente escolheu a primeira conta ativa retornada pela Meta;
antes de novas consultas, a seleção foi restaurada e conferida como
`act_447324504473617` (Connecty - Conta de anúncios). Cofre e metadata corrigidos,
incluindo hash/preview. A revisão `50008904` preserva a seleção nas reconexões e
usa a configuração interna somente para administrador da plataforma, na
organização com slug interno e plano internal. O login das empresas clientes
continua usando a configuração Business Login padrão. Ativo previamente
selecionado que não consta mais na autorização não é substituído por outro.

Três entregas reais, com dados sintéticos, foram importadas pelo painel:

| Lead Meta | Formulário | Lead CRM |
| --- | --- | --- |
| 1673504157675890 | 1384917313625725 | ba5f7525-e5d4-44f5-8fbc-6fcba66a6783 |
| 1074710485326312 | 955748034272513 | 49022454-4314-42f6-8ba9-b6f93c926849 |
| 928370536788664 | 955748034272513 | a1f65b4f-d814-4899-bb1d-ad9961843515 |

O formulário novo foi preenchido na prévia oficial pela administradora, com nome
de teste e e-mail example.com. O webhook chegou às 21h28 BRT e a primeira importação
concluiu às 21h39. Reimportação retornou imported=0/failed=0 sem duplicar o CRM.
As duas entregas antigas também passaram a imported. Nenhuma conversa, mensagem,
autorização de marketing ou gasto foi criado a partir desses leads.

MCP novamente confirmado no painel: campanhas vazias e score 100 sem recomendações,
na conta selecionada. Isso comprova consulta, não criação ou desempenho de anúncios.

O CRM tinha dois defeitos adicionais: consultava somente leads associados a
conversas WhatsApp e o admin enviava 500 UUIDs por filtro, causando
UND_ERR_HEADERS_OVERFLOW. `50008904` inclui os leads de formulário sem conversa,
mantém filtros de organização/canal e divide organizações em lotes de 50 com
concorrência de dois, ordenação/limite global. 58 testes dirigidos passaram, assim
como TypeScript e ESLint. Publicação e inspeção visual registradas abaixo.

A inspeção visual da primeira correção mostrou um terceiro limite: a organização
interna não está entre as 500 mais recentes. `0ca313e7` acrescenta a operação de
slug/plano interno à seleção administrativa quando ausente, mantendo o recorte
dos clientes. Novo teste de regressão passou (59 casos distintos no total).
Essa revisão foi publicada no slot b/3131 às 22h09 BRT, com smoke local/público
de health/SHA/login/asset/auth/Inngest aprovado. A UI mostrou os três registros
filtrados por meta_lead_ads e zero mensagens. O filtro de nomes do WhatsApp exibiu
os nomes sintéticos como "Lead sem nome"; `b807ffc2` usa o nome submetido no
formulário para esse canal, mantendo a regra anterior nos demais canais.

Às 22h04 BRT, a reconexão pelo botão normal foi validada em produção em `50008904`:
OAuth usou `1581800719812884`, retornou `meta_connected`, preservou Página
`293615710491088` e conta `act_447324504473617`, mantendo ads_management. Capturas
reais do consentimento e retorno em `output/meta-ads-leads-20261011/oauth/`.
O screencast CDP não atravessou as navegações externas; não há vídeo contínuo
dessa reconexão. As capturas não devem ser descritas como gravação contínua.

Registro complementar exportado sem cortes ou alterações de conteúdo:
`output/meta-ads-leads-20261011/edit/ads-leads-importacao-real.mp4`, H.264,
1600×754, 78,67 segundos, sem áudio. Quadros e duração conferidos. Mostra consultas
e importações reais; ainda não substitui a demonstração integral de login e CRM.

App Review `1078832598351314` continua **não enviado**. `ads_management` foi
adicionado e sua justificativa/declaração de uso permitido foi salva e relida.
`ads_management` e `ads_mcp_management` ainda mostram 0/1 chamadas contabilizadas,
com aviso de atualização em até 24h. Há formulários de uso permitido incompletos.
Falta reproduzir Ads/Lead Ads nos ativos separados do avaliador, completar as
gravações integrais e anexar; não compartilhar ativos internos com a conta de revisão.
Pixel/CAPI por cliente permanece pendente de implementação e teste.

Consulta atual da organização de avaliação `4cd0a6bd-4e3c-4773-a9ef-511c802b48df`
confirmou conexão social, Página `839794832549513`, selected_ad_account_id=null,
ad_accounts=[] e ausência de ads_mcp_management/leads_retrieval/pages_manage_ads.
O titular autorizou criar a conta de anúncios e os ativos necessários para testes.
O login do Magno solicitado inicialmente foi resolvido pelo titular em outro
perfil do Chrome (`connectyhub02`). A UI confirmou acesso total ao portfólio
BuffaloMass `1604084310967369`. A resposta me/businesses=[] do token antigo não
indicava inexistência de portfólio; aquele token não o disponibilizava.
Foi criada a conta exclusiva `ConnectyHub - Revisao Meta - Testes`, ID
`38906178892358750`, em BRL e America/Sao Paulo, sem cadastrar pagamento.
A Meta confirmou a criação; Magno recebeu acesso total pelo portfólio.
A conta antiga Buffalo Mass aparece desativada no seletor e não foi utilizada.
Reconexão pelo login BUSU normal iniciada na conta `meta-review@connectyhub.com.br`,
selecionando somente BuffaloMass, Página buffalomass.life, Instagram
buffalomasseliteclub e a nova conta de anúncios; solicitada criação de pixel
separado nesse fluxo. Resultado final registrado após confirmação abaixo.
O acompanhamento existente, a cada duas horas, foi atualizado para essas pendências;
não pode considerar os vídeos da rodada social suficientes para a nova rodada Ads.

`b807ffc2` publicado no slot a/3130 às 22h21 BRT; slot b/0ca313e7 preservado.
Smoke na candidata e no domínio público passou: health/SHA, login, asset,
proteção de rotas e Inngest assinado com 57 funções. Builder parado.
UI administrativa confirmou os três leads `meta_lead_ads`, com seus nomes
submetidos preservados e zero mensagens. Evidência:
`output/meta-ads-leads-20261011/validated/crm-meta-confirmado.png`.

### Ativos isolados e consultas confirmadas às 22h28–22h35 BRT

A reconexão BUSU terminou com 16 escopos concedidos, incluindo ads_management,
ads_mcp_management, leads_retrieval e pages_manage_ads. Conta selecionada
`act_38906178892358750`, Página `839794832549513`; a API retornou account_status=1.
O dataset/pixel novo tem ID `3238629089675785`, nome BuffaloMass. Foi criado pelo
onboarding e depois associado somente à conta `38906178892358750` em Configurações
do portfólio, com confirmação "Ativos de negócios atribuídos". Não recebeu eventos:
instalação nas páginas e Pixel/CAPI por cliente continuam pendentes.

No laboratório `/dashboard/meta/revisao`, a conta dedicada consultou tools/list,
campanhas ([]) e oportunidade (100, sem recomendações), com sucesso real. A rota
comum `/dashboard/trafego/meta-ads` permanece fora do acesso restrito dos avaliadores;
as instruções devem apontar ao laboratório. Vídeo complementar exportado dos
primeiros 18 quadros contínuos: `output/meta-ads-leads-20261011/isolated/ads-mcp-conta-avaliacao.mp4`,
53,47 segundos. Não inclui login completo nem comprova importação Lead Ads.

Formulários de teste criados na Página isolada:
- `943621031729570`: lead de ferramenta oficial `3317576941777312`;
- `974733731704131`: lead da prévia preenchida pelo Magno `3072622633071956`.

Ambos tiveram webhook recebido, mas leitura com o token BUSU retornou Graph #3,
"Apps in dev mode should only access leads submitted from App special roles".
Estão em falha de importação, sem mensagem automática. Não confundir esses dois
leads com os três importados com sucesso na operação interna. A tentativa de
criar o primeiro lead via Graph retornou erro 2/1892059; o envio foi confirmado
posteriormente na ferramenta oficial. Nenhum anúncio foi criado ou ativado.

`abfaf197` permite selecionar configuração USER de validação somente para grant
de avaliação ativo, confiável e correspondente à empresa, além da exceção interna
anterior. Configuração `1581800719812884` indicada na metadata da integração de
revisão. Clientes comuns continuam usando BUSU. 20 testes dirigidos, TypeScript
e ESLint passaram; publicação e reconexão dessa revisão registradas abaixo.

Às 22h38, a justificativa ads_mcp_management foi atualizada com a conta isolada e
o endereço do laboratório. O portal ainda mostra 0/1 chamadas para MCP; vídeo
integral ainda pendente e pedido não enviado.

### Fontes

- [Business Login: restrições de BUSU para portfólio proprietário](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)

- [MCP oficial: início](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-get-started/)
- [Formulários Lead Ads](https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/create)
- [Diagnóstico oficial de leitura de leads](https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md)

## Validação isolada concluída — 11/10/2026, 22h43–22h55 BRT

Produção publicada em `abfaf1978007ac7cb146f6b3b9e195b97d5a0e42`, slot b/3131;
fallback a/3130 em `b807ffc292738876d7fd455066e2b864311b25af`. Build e smoke
público/candidato passaram (health com SHA, login, asset, proteção admin/API e
Inngest assinado com 57 funções). Builder parado.

A reconexão USER do grant restrito de avaliação foi concluída como Magno,
selecionando apenas a Página buffalomass.life, empresa BuffaloMass e Instagram
buffalomasseliteclub atuais. A integração retornou connected, manteve a Página
839794832549513 e conta act_38906178892358750, com 16 escopos. Clientes comuns
continuam no fluxo BUSU. Esta exceção de validação não equivale a aprovação para
empresas externas.

O erro Graph #3 foi resolvido nessa conexão. Pelo laboratório da conta de revisão,
a importação do formulário 974733731704131 retornou queued 1/imported 1/failed 0;
o formulário 943621031729570 retornou queued 2/imported 2/failed 0. Três registros
foram confirmados como imported no banco:

- 3072622633071956 → lead a28ac670-1cdd-4150-88a4-5935f5b1ab02.
- 3317576941777312 → lead d80f3154-6ef0-48df-9f24-e1d97c4f1ff2.
- 1091955880411716 → lead 4886eb4e-1a88-4237-a8cd-930558ae83c6.

O terceiro foi recuperado pela listagem do formulário; não atribuir sua criação
à última ação de envio sem evidência adicional. O painel exibiu os três como
Importado no CRM. A consulta MCP de campanhas após USER retornou isError false,
ad_entities vazio. O Graph confirmou o pixel 3238629089675785 associado somente
à conta consultada act_38906178892358750. Pixel ainda sem instalação/eventos;
CAPI por cliente continua pendente. Não houve anúncio ativado ou pagamento.

Evidência visual: output/meta-ads-leads-20261011/validated/lead-ads-avaliadores-importados.png.
A captura mostra o resultado real no laboratório; não substitui gravação contínua
com login, autorização, operação e visualização do lead no CRM.

**App Review permanece em rascunho, não enviado.** Consulta ao formulário
ads_mcp_management após esses testes ainda mostra 0/1 chamadas, prazo informado
pelo portal de até 24 horas, e nenhum vídeo nesse campo. Permanecem demonstrações
integrais, anexos e demais requisitos da rodada. Não anunciar todas as permissões
aprovadas nem confundir app publicado com Advanced Access.
