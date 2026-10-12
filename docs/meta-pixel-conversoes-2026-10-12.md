# Pixel e API de Conversões por empresa — 12/10/2026

## Entrega

Seleção de Pixel/Dataset em Integrações Meta, Meta Ads do cliente e Meta Ads do
admin. O laboratório isolado de revisão também tem o componente. A lista vem
da conta de anúncios selecionada pela própria organização; o servidor rejeita
Pixels de outra conta. Tokens existentes permanecem no servidor.

Medição integrada à loja, produtos, carrinho e checkout hospedados na
ConnectyHub: PageView, ViewContent, AddToCart e InitiateCheckout. Purchase é
produzido exclusivamente pelo servidor, quando pedido e sessão confirmam o
pagamento. Valor vem do pedido; não é aceito Purchase vindo do navegador.

O visitante pode recusar e continuar comprando ou revogar posteriormente. A
preferência e a identidade pseudônima são separadas por organização. Sem
consentimento não há Pixel nem evento na fila. O worker confere novamente
consentimento, conta, Pixel e revisão antes de transmitir. Alteração de
configuração invalida eventos antigos. RLS e chaves compostas isolam os dados.

Em modo normal, navegador e servidor compartilham event_id para deduplicação.
URLs de checkout e páginas com query string usam somente servidor, com URL
canônica sem parâmetros privados. O identificador fbclid é retido por empresa
apenas após consentimento, por até 90 dias. No modo de teste, somente CAPI é
enviada, com test_event_code; não se mistura ao Pixel normal do navegador.

Fila idempotente, retentativas limitadas e recibos visíveis no painel. Inngest
`connectyhub-meta-conversions` executa a cada minuto. Migration 0194 aplicada
com RLS; schema PostgREST recarregado. Registro do app Inngest confirmado com
58 funções.

## Evidência real

- Revisão: organização `4cd0a6bd-4e3c-4773-a9ef-511c802b48df`, conta
  `act_38906178892358750`, Pixel `3238629089675785` (BuffaloMass).
- Operação própria: organização `c5b8e371-b60d-4a17-94da-0a93e69a285d`, conta
  `act_447324504473617`, Pixel `2723052154518590` (Connecty - Pixel da Meta).
- Ambas listadas, selecionadas e salvas pelo painel autenticado, em modo de
  teste. Nenhum ativo interno foi conectado à organização de revisão.
- Revisão recebeu 4 PageView (um sintético e três pela loja), 2 ViewContent
  e 1 AddToCart.
  A fila automática entregou os eventos de navegação, todos com recibo
  `events_received: 1`. Eventos de teste no portal mostraram **Processado**.
- Pixel próprio recebeu PageView da loja interna, igualmente processado no
  portal Meta. ID: `7c1d5f43-817d-43c0-ad6b-8744df8c4c41`.
- Após a publicação final, novo teste próprio
  `test_80cb622a-770c-460a-be70-eabbfb72ae99` também foi processado, com origem
  pública `https://www.connectyhub.com.br/meta-pixel-test` e recibo 1.
- Recusa inicial não criou evento; aceitar habilitou navegação; revogar e
  recarregar não aumentou a contagem. Consentimentos usados no navegador foram
  encerrados após o teste. As duas configurações permanecem em modo de teste.
- Produto fictício da revisão `f62ed8cf-a53f-4b11-ae91-950106fb7341`, sem preço
  e sem pagamento, preservado para demonstrar ViewContent; descrição informa
  explicitamente que não é oferta comercial.
- Para o teste de carrinho, esse item recebeu temporariamente preço de R$ 1 e
  destino checkout. O botão Adicionar ao carrinho gerou AddToCart
  `1a05ddff-40b1-4b1a-a072-f77407a10888`, processado pela Meta. Item removido
  pelo próprio carrinho e configuração restaurada para sem preço/site externo.
  Nenhum pedido, checkout ou pagamento foi iniciado.
- Evidências locais: `output/meta-pixel-20261012/meta-events-review.png` e
  `meta-events-connectyhub.png`. Não contêm tokens.

Um teste inicial usou a origem interna do container no source_url. Corrigido
para a origem pública canônica, com teste de regressão. Esse evento ficou
restrito a Eventos de teste; as visitas reais já usavam o domínio público.

## Verificações e limites

32 testes dirigidos passaram: isolamento, seleção de ativos, consentimento,
expiração, idempotência, compra confirmada, cookies, origem pública e cliques.
ESLint, build Next/TypeScript e smoke passaram. Produção final
`1d6b9d9bf035fb51b6fbcb27ac2f503e1a012e9b` no slot b/3131; fallback a/3130
em `d7f21f9e`. Health público confirmou SHA; login/asset/loja HTTP 200,
API protegida 401 sem sessão; Inngest assinado 200 e 58 funções, registro
confirmado. Builder parado. Banco permanece com migration 0194.

Não houve anúncios, ativação de campanhas, pagamento ou gasto. Purchase e
InitiateCheckout estão implementados; esta rodada não realizou
compra real nem confirmou entrega desses dois eventos. Deduplicação Pixel/CAPI
em modo normal ainda precisa de piloto consentido: os testes reais realizados
aqui usaram CAPI em modo de teste.

Sites externos, páginas arbitrárias sem contexto de organização, CRM→Lead CAPI,
catálogos dinâmicos e otimização automática de campanhas não fazem parte desta
entrega. O painel antigo de métricas do admin ainda usa configuração global e
pode mostrar rastreamento pendente; o novo componente Pixel e API de Conversões
usa a conexão por empresa. Unificar essa fonte é uma próxima etapa.

App Review não foi alterado por esta entrega. Recursos para empresas externas
continuam sujeitos às permissões aprovadas e acesso efetivo aos ativos. A
presença do painel e sucesso em contas próprias/testadoras não comprovam
Advanced Access nem todas as funcionalidades Meta concluídas.
