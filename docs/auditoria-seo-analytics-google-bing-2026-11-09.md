# Auditoria de SEO, Analytics e Google/Bing — ConnectyHub

Verificado em 09/11/2026, aproximadamente 16h–16h25, horário de Brasília.
Escopo: a própria plataforma ConnectyHub e seu site público. Não inclui campanhas,
catálogos ou métricas de empresas clientes. Auditoria de leitura: nenhuma campanha,
permissão, propriedade, configuração de produção ou orçamento foi alterado.

## Atualização após execução autorizada

As constatações abaixo descrevem o diagnóstico anterior às mudanças. A execução,
os resultados reais e as pendências estão em
[Analytics e SEO publicados](analytics-seo-publicacao-2026-11-09.md).

Correção da observação inicial do Bing: ao carregar a tabela completa, apareceram
dois sitemaps anteriores, e não zero. O sitemap principal com www havia sido
descoberto em 14/10/2026 e lido em 03/11, com 14 URLs; o índice WordPress legado
tinha quatro URLs, última leitura em maio/2025. O principal foi explicitamente
reenviado em 09/11. A indicação inicial de zero não comprovava ausência de cadastro.

## Conclusão

A ConnectyHub já aparece no Google e tem cadastro no Bing e Perfil da Empresa
verificado. A presença orgânica é muito pequena. Há uma base técnica de SEO,
mas faltam distribuição dos sitemaps, consolidação de URLs e medição GA4 real.
O painel administrativo não está conectado às fontes Google e não implementa
a leitura de relatórios GA4. A integração de Google Ads também está pendente.

Não é necessário criar outro aplicativo para indexar o site. Para trazer dados
Google ao admin, é preciso uma integração de API autorizada. Já existe um projeto
Google da ConnectyHub, mas o escopo observado hoje é YouTube, com revisão pendente.

## Evidências observadas nas contas

As sessões foram identificadas pelos seletores de conta das próprias páginas.
A conta ConnectyHub 01 contém Search Console, Perfil da Empresa, Bing Webmaster
Tools e a propriedade Analytics relevante. Outra conta ConnectyHub contém uma
propriedade GA4 distinta, sem fluxo de dados; não deve ser confundida com a primeira.

### Google Analytics

Propriedade recomendada para recuperar a medição existente, localizada na conta 01:

| Campo | Valor observado |
|---|---|
| Conta | ConnectyHub — `346387494` |
| Propriedade | connectyhub.com.br — `478860449` |
| Fluxo Web | connectyhub.com.br — `10288620382` |
| URL configurada | `https://connectyhub.com.br` |
| Measurement ID | `G-MN9Q0V72D7` |
| Coleta | Inativa; aviso de nenhum dado recebido e nenhum recebimento nas últimas 48h |

O HTML das 15 páginas do sitemap não contém tag GA4/GTM. O DOM da home após
execução do JavaScript também não contém scripts de Google Analytics/Tag Manager.
A busca no código não encontrou instalação de `gtag`, Google Tag Manager ou
chamadas à Analytics Data API. Existem campos de configuração, inclusive um
Property ID cujo texto diz que a leitura será habilitada futuramente.

A outra propriedade, `457488378`, conta `328068956`, nome “connectyhub”, está sem
nenhum fluxo. Não criar uma terceira propriedade para resolver a ausência de tag.

O rastreador próprio `ConnectyTracker` envia eventos internos. Isso não equivale
a coleta GA4. `getAdminMarketingOverview` lê até 1.200 eventos de inteligência e
depois filtra os de tracking; seu contador não é um relatório completo de usuários
GA4 nem deve ser apresentado como total histórico de visitantes do site.

Fontes: `src/app/layout.tsx`, `src/components/tracking/connecty-tracker.tsx`,
`src/lib/tracking/admin-marketing.ts`, `src/lib/maintenance-vault.ts`,
`src/lib/traffic/admin-traffic.ts` e
[propriedade GA4](https://analytics.google.com/analytics/web/#/a346387494p478860449/admin/streams).

### Google Search Console

Há duas propriedades de prefixo de URL verificadas. Não foi vista uma propriedade
de domínio da ConnectyHub no seletor.

| Propriedade | Indexação exibida | Desempenho com filtro de 3 meses | Sitemaps enviados |
|---|---|---|---|
| `https://www.connectyhub.com.br/` | 3 indexadas; 6 não indexadas | 0 cliques; 3 impressões; posição média 2 | Nenhum |
| `https://connectyhub.com.br/` | 1 indexada; 1 não indexada | 3 cliques; 32 impressões; CTR 9,4%; posição média 19,6 | Nenhum |

O relatório de indexação com www informa atualização de 05/11. As métricas de
performance estavam atualizadas há cerca de 4,5 horas. O gráfico sem www cobre
08/08–07/11/2026; com www, os dados visíveis começam em 28/10. Não somar as
contagens de páginas como se fossem URLs únicas, nem interpretar posição 2 em
apenas três impressões como bom ranqueamento geral.

Na propriedade com www, os seis casos excluídos são:

- Quatro bloqueios por robots: `/login`, `/login?email=&next=/dashboard`, `/iniciar`
  e `/iniciar?plan=scale`. São URLs de acesso/contratação, não páginas de aquisição
  que devam ser liberadas indiscriminadamente.
- Uma cópia sem canônica escolhida pelo usuário; URL específica não inspecionada.
- Uma alternativa com canônica adequada; isso não constitui necessariamente erro.

Sem www, a única página indexada listada foi a home, rastreada em 29/10. A exclusão
é um 404, cujo endereço não foi aprofundado. O site hoje redireciona para www,
mas a home não declara `rel=canonical`, confirmado tanto no HTML quanto no DOM.
É preciso alinhar esse sinal; não há evidência suficiente para atribuir toda a
baixa cobertura apenas a essa ausência.

Busca de marca autenticada mostrou a home, cadastro e Perfil da Empresa.
Também mostrou `connectyhub.net` acima do domínio .com.br. A propriedade desse
outro domínio não foi presumida e a posição observada é personalizada.

Fontes: [Search Console com www](https://search.google.com/search-console?resource_id=https%3A%2F%2Fwww.connectyhub.com.br%2F),
[Search Console sem www](https://search.google.com/search-console?resource_id=https%3A%2F%2Fconnectyhub.com.br%2F).

### Bing e presença em respostas de IA

A propriedade `https://connectyhub.com.br/` existe no Bing Webmaster Tools.

- Search Performance, janela de três meses: **0 cliques e 9 impressões**.
- Site Explorer, janela de seis meses: **23 URLs**, gráfico com **19 indexadas,
  7 avisos e 0 erros**; 1 clique, 10 impressões e 3 backlinks. As categorias do
  gráfico não devem ser somadas como grupos exclusivos.
- Há login/iniciar nos exemplos; `/iniciar` aparece explicitamente como indexada.
- Sitemaps: a observação inicial de **0 registros** foi corrigida após o
  carregamento da tabela completa; ver a atualização acima.
- AI Performance: **0 citações e 0 páginas citadas** no intervalo 08/08–07/11.
  Isso cobre o relatório Microsoft exibido, não toda menção possível em ChatGPT,
  Gemini ou qualquer outro produto.
- IndexNow: seis submissões históricas de **2025**, origem **Yoast**, inclusive
  `/home/`, `/home2/` e outras rotas antigas. Nenhum envio nas últimas 19h.
- Na aplicação atual, `/indexnow-key.txt` retorna **404**, com mensagem de chave
  não configurada. A função `submitIndexNowUrls` existe, mas a busca no código
  local só encontrou sua definição, sem chamadores.

O histórico Yoast é evidência de envios antigos, não de integração ativa da versão
Next.js. Há necessidade de conciliar URLs legadas, destinos equivalentes e 404/410,
evitando redirecionar indiscriminadamente todo conteúdo antigo para a home.

Fonte: [Bing Webmaster Tools](https://www.bing.com/webmasters/home?siteUrl=https%3A%2F%2Fconnectyhub.com.br%2F).

### Perfil da Empresa no Google

O perfil “connectyhub” está **confirmado/verificado** e a sessão tem administração.
Categoria principal exibida: Agência de Marketing. Site: `https://connectyhub.com.br/`.
Horário: 24 horas. Telefone exibido termina em **7996**; o WhatsApp da home termina
em **6936**. Isso pode ser intencional, mas deve ser conferido antes de padronizar.
Há links sociais para YouTube, Instagram e TikTok.

A descrição ainda cita “Agente ChatHub”. Recomenda-se atualizar a oferta e identidade
para o produto atual, revisar categorias/serviços coerentes com a atividade real,
fotos, demonstrações, avaliações e URL do site com UTM. Nenhuma edição foi feita.
Cadastro verificado não comprova integração do Business Profile com o admin.

### Aplicativo Google e Google Ads

Projeto observado no Cloud: **Connectyhub**, `gen-lang-client-0089240657`.
APIs habilitadas listadas: **Gemini API e YouTube Data API v3**.
Escopos declarados na tela de acesso a dados: **youtube.readonly e youtube.upload**.
Não apareceram Analytics Data API, Search Console API ou Google Ads API na lista.

A Central de verificação informa marca e acesso a dados em análise. No detalhe,
última avaliação em **05/11/2026**:

- Página inicial, branding e escopos mínimos: etapas concluídas.
- Política de privacidade: precisa especificar mecanismos de proteção de dados sensíveis.
- Funcionalidade: vídeo de demonstração insuficiente para demonstrar o aplicativo.

O portal orienta corrigir e responder à conversa existente com a equipe Google.
Nenhum e-mail foi lido/enviado e nada foi reenviado. A pendência é concreta, mas
é da revisão YouTube observada; não representa um Google Ads já aprovado.
Havia ainda um aviso geral do Cloud sobre possível violação de política em vários
projetos. O aviso não identificou aqui qual projeto foi afetado; impacto específico
na ConnectyHub não foi estabelecido.

No Google Ads, a conta 01 listou apenas duas contas Vision; não foram abertas.
A outra conta ConnectyHub não listou contas Ads. Portanto **não foi localizada
conta anunciante própria da ConnectyHub nessas sessões**, sem concluir que ela
não possa existir sob outro acesso/gerenciador.

O admin publicado mostra GA4 Measurement ID, Customer ID, Conversion ID e Search
Console Site não configurados, OAuth incompleto e criação de campanha desabilitada.
Os zeros exibidos são ausência de leitura válida, não prova de gasto zero.

O código já possui OAuth, leitura de campanhas Ads e Search Console, mas exige
`GOOGLE_ADS_DEVELOPER_TOKEN` para iniciar. A documentação atual do Google informa
que esse token foi descontinuado em **09/09/2026** e o nível de acesso passou ao
projeto Cloud. A validação local precisa ser atualizada, junto da versão da API
e permissões; não basta preencher um token antigo. Fonte:
[migração oficial Google Ads](https://developers.google.com/google-ads/api/docs/api-policy/developer-token).

Fontes locais: `src/lib/client-os/guided-oauth.ts`,
`src/lib/client-os/growth-sync.ts`, `src/lib/traffic/admin-traffic.ts`,
`src/app/api/dashboard/integrations/google/`.
Fontes externas: [revisão OAuth](https://console.cloud.google.com/auth/verification?project=gen-lang-client-0089240657),
[admin Google Ads](https://www.connectyhub.com.br/admin/trafego/google-ads).

## Base pública auditada

Foram lidas todas as **15 URLs do sitemap principal**, mais links públicos
complementares, robots, llms e redirecionamentos. Evidência técnica em
`output/auditoria-seo-2026-11-09/public-audit.json`.

- As 15 páginas retornaram HTTP 200, com título, descrição e `index, follow`.
- 14 das 15 têm canônica; falta na home.
- HTTP e o domínio sem www convergem para HTTPS com www.
- `robots.txt`, `sitemap.xml`, `llms.txt` e `llms-full.txt`: HTTP 200.
- Há dados estruturados Organization, WebSite e SoftwareApplication; páginas de
  solução têm estruturas adicionais. JSON legível não comprova elegibilidade
  para todos os resultados enriquecidos; Rich Results não foi executado.
- O robots libera páginas públicas e OAI-SearchBot. Não há bloqueio explícito
  de Google-Extended. A ausência de bloqueio no arquivo não prova acesso efetivo
  de todos os IPs dos robôs por firewall/CDN.
- A página de produção de vídeos está no sitemap publicado, mas não aparece no
  llms.txt observado. Deve entrar na lista mantida junto das demais soluções.
- O schema Organization não tem `sameAs` para consolidar os perfis oficiais.
- Os números de prova social da home são literais no código: 14.382 conversas,
  98% e 2.108 clones. Sua atualidade não foi comprovada. Validar origem/data ou
  substituir por evidência real antes de usá-los como credibilidade editorial.

Páginas do sitemap: home; soluções; produção de vídeos; soluções personalizadas;
docs/API; cadastro; privacidade; termos; exclusão de dados; agente IA WhatsApp;
automação WhatsApp; catálogo WhatsApp; API WhatsApp; IA para imobiliárias;
IA para e-commerce.

O checkout local tem muitas alterações de outros trabalhos e diverge da versão
publicada em alguns pontos. Não foi feito deploy ou alteração no código. Uma
implementação deve partir da revisão de produção correta, preservando esses trabalhos.

## Plano de execução e critérios de aceite

| Ordem | Trabalho | Comprovação necessária |
|---|---|---|
| 1 | Instalar GA4 `G-MN9Q0V72D7` no site público da plataforma; tratar navegação SPA e preferências de medição | Visita controlada aparece no Realtime/DebugView, sem duplicar page_view nem enviar dados pessoais em URLs/eventos |
| 2 | Criar leitura GA4 server-side no admin para a propriedade `478860449` | Data API real retorna usuários, sessões, páginas, origens e eventos; números conferem no GA4 para mesmo período/fuso |
| 3 | Conectar Search Console ao admin com leitura mínima, independente de Ads | Relatório real de impressões, cliques, consultas e páginas; status distingue erro, ausência de dados e zero verdadeiro |
| 4 | Corrigir canônica da home, revisar sitemap/links e cadastrar sitemap principal no Google e Bing | Portais confirmam leitura válida; inspeção de URLs prioritárias mostra descoberta/rastreamento e canônica coerente |
| 5 | Ativar IndexNow no fluxo de publicação | Arquivo de chave público correto, resposta aceita, registro com data/URLs e atividade nova no Bing; aceite não equivale a indexação |
| 6 | Revisar indexação de login/iniciar e URLs legadas | Noindex efetivamente visto pelo robô e retirada das URLs indevidas, sem abrir painéis ou dados privados |
| 7 | Consolidar identidade e conteúdo público | Perfil da Empresa, site, schema e redes consistentes; páginas úteis por oferta, casos verificáveis, FAQ e links internos |
| 8 | Resolver revisão Google existente e planejar APIs de marketing | Política fiel às proteções reais, vídeo do fluxo real, aprovação externa e teste autorizado de leitura |
| 9 | Localizar/definir conta Ads própria e atualizar integração | Customer ID correto, acesso API válido e campanhas/conversões lidas; ativação e verba permanecem uma etapa própria |

Para GA4: medir `page_view`, clique de contato/WhatsApp, início de cadastro e
`sign_up` confirmado; adotar `generate_lead` apenas quando o lead for realmente
criado. Separar site público, uso autenticado e lojas de clientes. Não transformar
um clique em venda nem mandar e-mails, telefones, tokens ou conteúdo de conversa
para o Analytics. Acesso à Data API usa identidade autorizada e Property ID,
não apenas o Measurement ID. Fonte:
[Analytics Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart).

Para remoção de páginas de acesso: já há `noindex` no código de login/iniciar,
mas robots pode impedir o rastreador de ler a diretiva. Planejar a combinação
por rota; manter autenticação intacta. Fonte:
[noindex e rastreamento](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

Para crescimento orgânico: trabalhar páginas com intenção específica, incluindo
agentes/CRM, automações, API, voz, software sob medida e produção de vídeos; usar
problemas reais, demonstrações, limites, preços aplicáveis e casos autorizados.
Não gerar dezenas de páginas repetidas por cidade/palavra-chave. Criar conteúdo
editorial útil ligado às ofertas e obter referências legítimas de parceiros e
perfis oficiais. Aferir evolução em janelas de 28/90 dias, após estabelecer a coleta.

## Busca com IA e limites

OAI-SearchBot é o controle específico de busca no ChatGPT; GPTBot é um controle
separado de treinamento. Permitir busca não exige liberar treinamento. O site já
permite ambos hoje; não houve mudança dessa preferência. Fonte:
[documentação oficial OpenAI](https://developers.openai.com/api/docs/bots).

Para as experiências de IA da Pesquisa Google, a base é conteúdo acessível e
indexável. Para Gemini Apps, Google-Extended controla usos de treinamento e
grounding; não confundir esse produto com Googlebot. Não existe comprovação
nesta auditoria de citação atual da ConnectyHub no ChatGPT ou Gemini.
Fontes: [IA na Pesquisa Google](https://developers.google.com/search/docs/appearance/ai-features),
[Google-Extended](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers).

Sitemap e IndexNow ajudam a descoberta/atualização, sem garantir inclusão ou
posição. `llms.txt` é um recurso complementar, não certificado de ranqueamento.
Fontes: [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview),
[IndexNow](https://www.indexnow.org/documentation).

Não foram executados Lighthouse/PageSpeed, teste móvel sistemático, auditoria de
backlinks completa, logs de IPs reais dos crawlers, URL Inspection de cada página,
teste de coleta GA4 ou chamadas autenticadas de API. O Search Console com www
não tinha dados de Core Web Vitals suficientes. Os tempos HTTP guardados no JSON
são observações pontuais, não métricas de experiência de usuários reais.

Próximo resultado concreto esperado: GA4 recebendo eventos reais e exibindo-os no
admin, sitemap aceito nos dois motores e inspeção das páginas comerciais mais
importantes. Aprovação OAuth, indexação, citações e posição dependem de verificação
externa posterior; permanecem pendentes.
