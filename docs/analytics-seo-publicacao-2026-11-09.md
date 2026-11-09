# Analytics e SEO da plataforma — 09/11/2026

## Escopo autorizado

Correções e publicação da auditoria, começando por GA4 no site/admin, SEO e
submissão de sitemaps Google/Bing. Não criar nem ativar campanhas pagas.
Base: produção `ed21a005769691e9a511f173b2ebfb0c15048706`, com registro
`80b0d0b4`; branch isolada `codex/analytics-seo`. Master e trabalhos locais preservados.

## Implementação publicada

- Tag GA4 `G-MN9Q0V72D7` somente nas 15 páginas públicas da plataforma, nos
  domínios oficiais. Consentimento explícito, recusa e retirada no botão Cookies.
  Não carrega inicialmente em admin, dashboard, login, APIs ou catálogos de clientes.
  Navegação SPA envia page_view manual; URLs sem query/fragmento e referenciadores
  externos limitados à origem. Google Signals e personalização de anúncios desligados.
- Admin: resumo GA4 na página inicial e `/admin/analytics` com usuários, sessões,
  visualizações, ativos nos últimos 30 minutos, páginas e origem. Consultas reais à
  Data API, autenticadas no servidor; falhas não aparecem como zero visitantes.
  Propriedade `478860449`, contas de clientes isoladas, autorização platformAdmin.
- Identidade dedicada `connectyhub-analytics-reader@gen-lang-client-0089240657.iam.gserviceaccount.com`,
  autorizada expressamente pelo titular nesta sessão: Leitor na propriedade GA4,
  sem métricas financeiras e sem papel no projeto Google Cloud. Chave privada não
  deve entrar em código, build, log ou documentação.
- Home com canonical própria, fallback de domínio www, números de desempenho sem
  comprovação substituídos por capacidades; sameAs das três redes confirmadas no
  Perfil da Empresa; produção de vídeos incluída nos índices llms.
- Robots permite crawl de login (noindex) e iniciar (redirect), mantendo áreas
  privadas bloqueadas. Falha no catálogo não derruba mais o robots público.
- Script `scripts/submit-platform-indexnow.mjs` valida sitemap e chave pública antes
  de avisar IndexNow; somente páginas da plataforma, sem conteúdo de clientes.

## Verificações locais

Testes focados passaram: GA4/política de coleta (5), Search Console (2) e navegação
(4). TypeScript e lint dos arquivos alterados passaram. Primeiro build e smoke
candidato/público passaram: 15 URLs, 25 assets da home, robots, llms, IndexNow,
proteção dos painéis, APIs privadas 401 e GET Inngest assinado com as 59 funções.
Sem migration ou alteração no banco de clientes.

## Estado externo verificado

Conta de serviço e chave criadas; permissão Leitor confirmada em tela. Medição
otimizada desligada no fluxo GA4 para evitar page_view de histórico duplicado e
coleta automática de formulários. IDs e propriedade foram preservados.
Analytics Data API e Search Console API ativadas após autorização expressa.
Conta de serviço também recebeu acesso Restrito à propriedade Search Console
`https://www.connectyhub.com.br/`, sem acesso à propriedade antiga ou a anúncios.
Chave no cofre criptografado da plataforma, integridade verificada após leitura;
arquivo temporário em texto claro removido da VPS. Backup local privado fora do
repositório, com ACL restrita. Nenhuma campanha ativada.

### Coleta e leitura reais

Primeira publicação `3b07775a`, slot b. Chrome sem script GA antes do consentimento;
ao aceitar, a visita a `/solucoes/producao-de-videos?audit_check=1` enviou exatamente
um page_view HTTP 204, sem query na URL enviada. Navegação SPA para `/docs/api`
enviou outro page_view, HTTP 204. Após recusar, navegar à home não gerou coleta.
Admin sem script GA e com **1 usuário ativo** às 16h57, obtido pela Data API real.
Consolidados inicialmente vazios são resposta real; podem levar 24–48h para atualizar.

Chamadas autenticadas reais GA4 runReport/runRealtimeReport: HTTP 200.
Search Console searchAnalytics/query: HTTP 200, **0 cliques e 3 impressões**.
Nova tela `/admin/seo` publicada em `951e351d`: 28 dias consolidados no fuso Pacífico,
cliques, impressões, CTR, posição, páginas e buscas. Consultas anônimas podem ser
omitidas pelo Google. Não soma a propriedade sem www. `/admin/trafego` reutiliza
a identidade somente no escopo da plataforma, independente da configuração Ads.
Segunda revisão **951e351d9ac0d2d1c9bb64a471ca815412de39ff** ativa no **slot a**
desde aproximadamente 17h08 de Brasília. Build completo e smoke candidato/público
passaram, incluindo `/admin/seo` protegido. Admin autenticado mostrou 0 cliques,
3 impressões, posição 2 e quatro linhas de páginas; buscas sem linhas disponíveis.
`/admin/trafego` confirmou Search Console online com 11 dias carregados e 3 impressões.
GA4 permaneceu com 1 ativo após a publicação. Slot b `3b07775a` preservado para retorno.
Sem rollback de banco, migrations ou mudanças em campanhas.

### Sitemaps e indexação

- Google: sitemap enviado, **Processado, 15 páginas encontradas** em 09/11.
- Página de vídeos: detectada pelo sitemap; indexação solicitada e aceita na fila
  prioritária. Isso ainda não comprova inclusão nos resultados.
- Home: inspeção revelou cópia sem canônica declarada no rastreamento de 07/11;
  Google escolheu a versão sem www. Canônica corrigida já publicada; solicitação
  de releitura aceita na fila prioritária, comprovante salvo.
- Bing: sitemap principal reenviado e lido em 09/11, **Success, 15 URLs**.
  Antes mostrava 14 URLs da leitura de 03/11. Há também um sitemap WordPress legado com quatro
  URLs; nenhuma exclusão arbitrária foi feita.
- IndexNow: 15 URLs aceitas com HTTP **202** após a primeira ativação; arquivo de
  chave validado. Portal Bing ainda não refletia o novo lote na primeira conferência.
  Após a segunda ativação, o hook automático recebeu **HTTP 200**, 15 URLs aceitas.

Evidências em `output/analytics-seo/`: `browser-ga4-proof.json`,
`admin-ga4-visita-real.png`, `google-sitemap-processado.png`,
`bing-sitemap-enviado.png`, `google-video-indexacao-solicitada.png`,
`google-home-indexacao-solicitada.png`, `admin-search-console-real.png`,
`admin-trafego-search-console-online.png`, `public-smoke-951e351d.json` e verificações
de API/smoke. Nenhuma chave privada consta nas evidências.

## Operação

Configuração pública em build/runtime: NEXT_PUBLIC_GOOGLE_ANALYTICS_MEASUREMENT_ID.
Property ID em GOOGLE_ANALYTICS_PROPERTY_ID. Credencial privada preferencialmente
no cofre criptografado, integração google-analytics, campo
GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON. O runtime também aceita o campo por ambiente.

O hook em `deploy/release.sh`, instalado na VPS, executa o IndexNow após cada
ativação saudável, com INDEXNOW_KEY no ambiente. Resultado fica em
`releases/<SHA>/indexnow.log`; falha do provedor gera pendência sem desfazer uma
aplicação saudável. Backup do release.sh anterior preservado.

## Pendências e limites

- Indexação das 15 páginas, posições e citações em ChatGPT/Gemini dependem dos
  buscadores. Sitemap/IndexNow não garantem inclusão; llms é complementar.
- Retirada de login antigo depende de novo rastreamento do noindex. URLs WordPress
  legadas precisam de correspondência de conteúdo antes de definir redirecionamentos.
- Esta entrega mede visitas. Conversões de contato, lead criado e cadastro confirmado
  ainda precisam de instrumentação/validação próprias. Não interpretar visita como venda.
  Histórico anterior à instalação não é recuperado.
- Telefone divergente no Perfil da Empresa permanece sem mudança por falta de evidência
  sobre o número oficial. Revisão OAuth YouTube, conta Ads própria e modernização da
  integração Ads seguem separadas; nenhuma campanha ativada.
- Conteúdo/casos autorizados, desempenho/PageSpeed e backlinks legítimos exigem trabalho
  posterior. Não foram presumidos resultados de auditorias não realizadas.
