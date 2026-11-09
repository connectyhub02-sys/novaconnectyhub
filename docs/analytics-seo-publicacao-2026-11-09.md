# Analytics e SEO da plataforma — 09/11/2026

## Escopo autorizado

Correções e publicação da auditoria, começando por GA4 no site/admin, SEO e
submissão de sitemaps Google/Bing. Não criar nem ativar campanhas pagas.
Base: produção `ed21a005769691e9a511f173b2ebfb0c15048706`, com registro
`80b0d0b4`; branch isolada `codex/analytics-seo`. Master e trabalhos locais preservados.

## Implementação preparada

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

9 testes passaram (política da coleta, relatórios GA4 e navegação); TypeScript sem
erros; lint dos arquivos alterados sem erros. Estes testes não comprovam a coleta
externa. Build, publicação, visita real, API de relatórios e submissões serão
registrados abaixo após verificação.

## Estado externo durante preparação

Conta de serviço e chave criadas; permissão Leitor confirmada em tela. Medição
otimizada desligada no fluxo GA4 para evitar page_view de histórico duplicado e
coleta automática de formulários. IDs e propriedade foram preservados.
API e armazenamento da chave ainda em conclusão. Nenhuma campanha ativada.

## Operação

Configuração pública em build/runtime: NEXT_PUBLIC_GOOGLE_ANALYTICS_MEASUREMENT_ID.
Property ID em GOOGLE_ANALYTICS_PROPERTY_ID. Credencial privada preferencialmente
no cofre criptografado, integração google-analytics, campo
GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON. O runtime também aceita o campo por ambiente.

Após cada publicação com mudanças nas páginas públicas, executar o script IndexNow
com INDEXNOW_KEY no ambiente e conferir o resultado. Sitemap é rastreado pelos
buscadores; submissão não garante indexação, posição ou menção em respostas de IA.
