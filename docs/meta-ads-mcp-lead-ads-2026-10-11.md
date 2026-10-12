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

## Referências consultadas

- [MCP oficial: início](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-get-started/)
- [Formulários Lead Ads](https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/create)
- [Diagnóstico oficial de leitura de leads](https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md)
