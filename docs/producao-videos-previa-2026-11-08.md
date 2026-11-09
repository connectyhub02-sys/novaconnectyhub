# Produção e edição de vídeos — prévia local, 08/11/2026

Status atual: publicação autorizada por Magno em 08/11/2026; release em preparação.
Mídia própria enviada ao R2 e validada. Ativação e verificação pública ainda pendentes.
Os registros abaixo preservam o histórico da prévia.

## Base e isolamento

Worktree `C:/Users/conne/Documents/ConnectyHub-video-preview`, branch
`codex/video-services-preview`, criada da revisão publicada
`3fb7961c360c6213f62d52a62ef89814e152b468`.
O health público confirmou esse SHA em 08/11. O checkout principal tem trabalho
em andamento e não foi modificado. Preservada a entrada Redes sociais da produção.

Prévia: http://127.0.0.1:8772/solucoes/producao-de-videos

## Entrega

- Página pública com VSL, referências de estilos, problema/solução, recursos de
  edição, capacidade condicionada de até cinco vídeos/dia, processo, valores e FAQ.
- CSS Modules próprios, sem alteração de `globals.css`, layout raiz ou dependências.
- Cabeçalho público compartilhado pela home e demais páginas, com submenu Soluções:
  agentes IA, desenvolvimento sob medida, produção/edição e todas as soluções.
- `/solucoes-personalizadas` preservada; nome de navegação alterado para
  Desenvolvimento sob medida. Endpoint de reuniões preservado.
- `/solucoes` passa a incluir os dois serviços e textos comerciais. Nova rota no sitemap.
- Exceção restrita à nova página para não mostrar o aviso global de GPS/notificações
  sobre regiões e entregas. As demais páginas e o mecanismo de rastreamento permanecem.

## WhatsApp global

O titular confirmou que o atendimento é o global, com a agente Eliane.
Consulta somente leitura ao cadastro da plataforma confirmou número
`554788556936`, instância conectada e desenvolvimento usando o mesmo agente global.
Não foi enviado teste de mensagem nem validada a resposta da Eliane sobre vídeos.

`/solucoes/producao-de-videos/conversar` resolve `billing_whatsapp_agent_id` e a
instância interna/global, sem usar o override `custom_software_agent_id`.
Em indisponibilidade do banco, usa o número público confirmado acima. Redireciona
com 302/no-store/noindex ao WhatsApp, com mensagem sobre o serviço e interesse
opcional de uma lista fechada. Sem gravar visitas na tabela de desenvolvimento.
O rastreador geral continua sendo o existente; clicar não comprova envio/conversão.

## Mídia própria

Fonte local indicada pelo titular:
`C:/Users/conne/Documents/Edição video AI/connectyhub-content/producoes/vsl-edicao-horizontal-v1/ConnectyHub-VSL-Horizontal-V1-Web.mp4`.

- 1920×1080, 30 fps, H.264/AAC, 90,176 s, 34.337.020 bytes.
- SHA256 `2990f8d5de0d72a73a92ed3d70b56b829c5786bd52c5738ab38f6e048663ef5d`.
- Derivação para celular: 1280×720, 9.931.861 bytes, faststart, imagem proporcional.
- Capa WebP extraída em 0,9 s, 91.204 bytes.
- Player só é montado ao clicar, sem download inicial do MP4. Em 390 px selecionou
  `vsl-720.mp4`, reproduziu com readyState=4 e tempo avançando, sem erro de mídia.
- Arquivos grandes ficam ignorados no Git, em `public/media/video-services/`.
  Capa incluída no código. `CONNECTYHUB_VIDEO_MEDIA_BASE_URL` permite a pasta pública
  R2 antes do build de publicação (a página é pré-renderizada). O servidor de
  prévia não contém credenciais da aplicação.

## Referências externas

Conforme orientação posterior do titular, a seção apresenta referências de vídeos
prontos, não portfólio próprio. Texto de seção explica a direção visual; cada
cartão tem crédito discreto e link para a fonte. Vídeos ficam nos players oficiais,
carregados somente ao clicar; nenhum vídeo de terceiros foi baixado/republicado.

1. Produto/IA — IgnAIte Cinematics, “JBL AI Commercial Spec Ad”:
   https://www.youtube.com/watch?v=6XA3Sa9PpBw
2. Edição com apresentador — Ariful Islam Bappi, “How I Edit Talking Head Videos
   Professionally”: https://www.youtube.com/watch?v=Oaow5ecRESA
3. Motion — VANZ, “2025 2D Animation Reel”:
   https://vimeo.com/1071384508

Título, autor e permissão técnica de embed consultados via oEmbed. Todos os três
players reproduziram na prévia no navegador. Disponibilidade futura depende dos
publicadores. Exemplos demonstram linguagem; não prometem uma reprodução idêntica
nem associam esses trabalhos aos preços iniciais.

Referência de layout consultada: https://kairogen.ai/ — fundo escuro, ciano,
hierarquia tipográfica, demonstrações, cartões e CTAs. Conteúdo e marca próprios.

## Verificação

- TypeScript sem erros; ESLint dirigido aprovado.
- Três testes de contato aprovados: global versus override de desenvolvimento,
  indisponibilidade de configuração e entrada inválida.
- Redirecionamento HTTP real local confirmou número e mensagem para geral e IA.
- Desktop 1440 px e móvel 390/320 px sem overflow horizontal observado; imagens carregadas.
- Submenu desktop, menu móvel, modal com foco/fechamento e FAQ conferidos.
- VSL própria reproduziu a versão 720p; três referências reproduziram nos embeds.
- Na primeira versão, zero elementos video/iframe antes da interação. A revisão visual abaixo substitui essa estratégia para as prévias curtas; VSL e embeds continuam sob demanda.
- Build completo aprovado: 124 páginas geradas, nova landing estática e redirect
  dinâmico. A primeira tentativa sem credenciais falhou na coleta do sitemap de
  catálogo preexistente; repetição usando o ambiente do projeto apenas no processo
  de build terminou com código 0. Credenciais não copiadas para a worktree ou Git.
- Smoke HTTP: home, soluções, desenvolvimento, agente WhatsApp, nova página e
  sitemap responderam 200. Navegação home → Soluções → Produção/edição conferida.
- A prévia sem credenciais recebe erros 500 do rastreador global preexistente;
  não foi conectada a dados reais para registrar navegação de teste.

Capturas locais em `output/video-services/`. Revisão visual não equivale a teste
em telefone físico nem a escuta perceptiva integral dos vídeos.

## Antes de publicar

1. Revisão do titular sobre texto, visual e referências selecionadas.
2. Aprovar versão final da VSL; enviar arquivos próprios aprovados ao R2, configurar
   a URL e conferir HTTP Range/Content-Type/cache e reprodução do destino público.
3. Confirmar o briefing comercial da Eliane para o novo serviço. Seu prompt e
   conhecimento não foram alterados nesta entrega; não afirmar atendimento homologado.
4. Fazer release isolado conforme `deploy/README.md`, mantendo os demais trabalhos
   fora do commit de publicação e verificando novamente a revisão ativa.


## Revisão visual 2 — referência com vídeos distribuídos

Pedido de Magno: aproximar a composição dos screenshots desktop e mobile da Kairogen,
principalmente pela presença de vídeos em várias seções. Implementação local na mesma
rota e worktree; não publicada.

- Hero com seis cartões inclinados no desktop e faixa deslizável no celular.
- Tipografia central, fundo preto/verde profundo, botões em pílula ciano e pequenos
  detalhes amarelos; fatos comerciais próprios no lugar de estatísticas de clientes.
- VSL em seção dedicada; faixa de sete estilos; três demos de áudio; dois mosaicos
  de quatro vídeos; três referências completas preservadas. São dez clipes distintos
  da referência (alguns reutilizados nos mosaicos), três vídeos completos e a VSL própria.
- Os dez clipes e pôsteres são servidos diretamente de
  `https://kairogen.ai/images/landing/multimodelo/v2/`, com fonte identificada na página
  e no player. Não foram baixados nem atribuídos à ConnectyHub. Lista no arquivo
  `src/app/solucoes/producao-de-videos/showcase-media.ts`.
- HTTP 200 verificado para os dez clipes e pôsteres. Disponibilidade depende do
  publicador; acesso técnico não constitui licença de republicação. Antes do release,
  revisar o uso dessas referências e substituir por fontes autorizadas se necessário.
- Prévias silenciosas com IntersectionObserver: carregam ao entrar no campo visível,
  pausam fora da tela/aba, respeitam movimento reduzido e saveData. Controle manual
  de pausa no rodapé. VSL e player selecionado pausam as prévias; nenhum iframe é
  montado antes do clique. A VSL mantém 720p no celular e 1080p no desktop.
- Estilos limitados aos CSS Modules desta landing. Nenhuma alteração adicional em
  painéis, autenticação, cobrança, dados ou configuração do WhatsApp.

Verificação desta revisão: TypeScript e ESLint dirigido aprovados. Navegador em
1440, 390 e 320 px sem overflow horizontal; pôsteres sem falhas no trecho observado;
seis clipes do hero e três clipes de áudio reproduziram com readyState 4. Modal de
animação reproduziu e pausou todas as prévias. Botão de pausa verificado. Emulação
de movimento reduzido resultou em zero loops montados. VSL 1080p reproduziu e
manteve os loops pausados inclusive ao voltar para a abertura.

Capturas: `output/video-services/desktop-v2.png`, `gallery-v2.png`, `mobile-v2.png`.
Prévia: http://127.0.0.1:8772/solucoes/producao-de-videos

Build de produção da revisão 2 aprovado (124 páginas, saída 0); ESLint final aprovado. Nenhum deploy executado.


## Ajuste comercial — duração dos vídeos

Após aprovação visual de Magno, os valores iniciais de edição e produção com IA
passam a indicar vídeos de até 90 segundos de duração final. Vídeos mais longos
entram em produções especiais, sob consulta. Cartões, nota da abertura, ressalva
comercial e FAQ alinhados. Descrição completa dos recursos aguarda o texto que
o titular informou que enviará; não foram prometidos novos itens inclusos.
Alteração apenas na prévia local, sem publicação.


## Correção do cabeçalho — mesmo menu do site

Magno esclareceu que apenas Soluções deve ser reorganizado; a landing deve usar
o cabeçalho do site. Comparado o HTML atual de https://www.connectyhub.com.br/
com a fonte da revisão-base. Restaurados logo em cápsula, links monoespaçados
entre colchetes, Entrar, Teste grátis verde (#00ff88), espaçamentos e breakpoint
de 1440 px. Removida navegação específica de vídeos (Estilos/Valores etc.) e
CTA diferente no cabeçalho. CTAs WhatsApp no conteúdo permanecem.

Home e páginas públicas usam o mesmo componente. Soluções é um submenu com
agentes, desenvolvimento, produção/edição e todas as soluções; Desenvolvimento
substitui a antiga entrada Soluções personalizadas dentro desse submenu.

TypeScript e lint dirigido aprovados. Conferidos desktop 1440/1536, menu móvel
390 e 320 px, fechamento por Escape, acesso a Desenvolvimento e caminho
Home → Soluções → Produção e edição. Ajuste de espaçamento abaixo de 360 px
mantém todos os controles visíveis. Captura: output/video-services/header-corrected.png.
Nenhuma publicação realizada.


## Oferta detalhada enviada por Magno

Incorporada a descrição comercial recebida após a correção do cabeçalho:
- Edição profissional por R$200 (substitui o anterior “a partir de”), até 90s,
  Full HD em um formato escolhido. Resumo no cartão e lista expansível com os
  12 recursos completos, incluindo motion, acervo licenciado, animações, tela
  dividida, áudio, cor, marca e CTA. Recursos aplicados conforme a narrativa.
- Produção com avatar e cenas de IA a partir de R$600, até 90s de vídeo final,
  com imagem/voz autorizadas, cenas selecionadas e integração com edição.
  Quantidade e duração das cenas geradas por IA expressamente definidas na proposta.
- Especiais sob orçamento com VSLs longas, muitas cenas/personagens/ambientes,
  imóveis, decoração, animações complexas, versões, idiomas e recorrência.
- Bloco de pacotes recorrentes: até cinco vídeos por dia condicionado ao volume,
  complexidade e recebimento de materiais. FAQ e resumo inicial alinhados.

A sugestão de uma rodada de ajustes não foi adotada como compromisso; segue
com definição na proposta. O formato único foi incluído porque consta na
descrição expressa da entrega. Roteiro e alterações de direção não receberam
política de cobrança nova.

Lint dirigido e diff-check aprovados. Renderização desktop 1440 e mobile390
conferida, sem overflow; expansão/fechamento dos 12 recursos testados. Captura
output/video-services/pricing-complete.png. Mudança apenas local, sem publicação.


## Publicação autorizada — preparação

Magno autorizou publicar a versão revisada em 08/11/2026. A versão ativa foi
reconfirmada como 3fb7961c360c6213f62d52a62ef89814e152b468, slot b.
A branch codex/video-services-preview permanece sobre essa base. O master remoto
tem histórico divergente; esta publicação isolada não fará force-push nem
incluirá commits de outras frentes. O código será preservado na branch do release.

VSL 1080p, derivação 720p e pôster próprios publicados em:
https://pub-9f5b2802265a4ee2b52bc4e080f3941e.r2.dev/marketing/video-services/vsl-v1-2990f8d5/

HTTP 200, tamanhos, MIME, cache público imutável e Range 206 confirmados para os
três arquivos. SHA256 da VSL 1080p confere com a versão aprovada. A página usa
a pasta versionada por padrão, mantendo a possibilidade de override por ambiente.
Referências externas continuam nas fontes originais, sem cópia para nosso storage.

Pré-release: 3 testes de contato e lint dirigido passaram. Build e smoke do slot
candidato serão exigidos pelo fluxo deploy/README.md antes da ativação. Sem
migrations, alteração de agentes, disparos, pagamentos ou mudanças de DNS.
Briefing comercial e resposta efetiva da Eliane sobre esse serviço continuam
não homologados; os links apenas encaminham ao atendimento global existente.
