# Publicações e calendário Meta — 12/10/2026

## Escopo implementado

Editor compartilhado pelo admin e cliente: Post, Reel, Story, Carrossel e Vídeo;
até dez mídias ordenadas, upload MP4 até 100 MB e imagens até 8 MB convertidas
para JPEG, biblioteca por organização, rascunho, aprovação e agendamento.
Calendário consulta o intervalo do mês no servidor com paginação, em vez de
filtrar somente os últimos quarenta registros. Datas exibidas no fuso do navegador.

Instagram: imagens, Reels/vídeos, Stories e carrossel com imagens/vídeos.
Stories exigem account_type BUSINESS; não incluem stickers ou legenda sobreposta.
Facebook: texto/link, foto, álbum de fotos, Reels/vídeos e Stories de foto/vídeo.
Carrossel misto é exclusivo do Instagram; o equivalente do Facebook é um álbum
de fotos, não um anúncio em carrossel. A Meta valida duração, proporção e codecs;
não há transcodificação automática de vídeo nesta versão.

O envio confere grants atuais (não apenas escopos solicitados), conexão ativa,
contrato/plano e ativo selecionado. A seleção de empresa é validada no servidor,
inclusive sessão assistida. O admin tem exceção somente para a operação interna.
O grant isolado de avaliação recebe apenas as rotas de publicações/calendário/
biblioteca e respectivas APIs, continuando sujeito ao isolamento da organização.

## Processamento e limites

Progresso persistido por rede, filho de carrossel, container e vídeo. A fila
existente de cinco minutos retoma processamento assíncrono. Reserva condicional
e lease impedem dois workers de executar o mesmo envio. Resultados publicados
não são reenviados após falha da outra rede. Antes de cada mutação externa é
gravado estado sending; resposta perdida/incerta bloqueia repetição cega e exige
conferência do resultado na Meta. Não há botão para forçar reenvio incerto.

O calendário pode ser preparado antes da aprovação externa. Preparar um
rascunho não publica. Aprovar um rascunho com data futura ativa a fila.
Não há anúncio, impulsionamento ou cobrança de mídia paga nesses endpoints.

## Permissões complementares

`pages_manage_posts` para publicação na Página; `instagram_content_publish`
para a conta profissional vinculada à Página. Dependências de leitura/seleção
incluem pages_show_list, pages_read_engagement e instagram_basic, já presentes
na conexão e/ou revisão atual. Não substituir por instagram_business_* sem
migrar explicitamente do Facebook Login para Instagram Login.

Pedido 1078832598351314 confirmado em análise no portal em 12/10 às 11h40 BRT.
Ele não contém os dois escopos de publicação. Não alterar esse pedido nem
declarar que a aprovação dele libera automaticamente publicação para clientes.

## Roteiro da demonstração complementar

1. Entrar na conta isolada, iniciar conexão Meta e mostrar os ativos exclusivos
   buffalomass.life e buffalomasseliteclub e a autorização de publicação.
2. Abrir Publicações; enviar mídia própria de teste, mostrar formato/ordem,
   criar rascunho e aprovar. Demonstrar um carrossel e um vídeo/Reel.
3. Publicar, acompanhar processamento e mostrar IDs e resultado nas redes.
4. Demonstrar Story empresarial e conferir na conta de teste.
5. No calendário, selecionar dia/horário futuro, criar e aprovar; mostrar
   mudança Agendado → Publicando → Publicado e resultado externo.
6. Usar os vídeos reais na solicitação dos dois escopos. Preparação do editor
   ou testes automatizados não substituem envio confirmado pela Meta.

## Uso permitido para os formulários

**pages_manage_posts:** ConnectyHub allows a business to compose, approve and
schedule organic content for its own selected Facebook Page. After Facebook
Login for Business, the user selects the Page, uploads owned media, reviews a
draft and explicitly approves publication. The app publishes photos, photo
albums, Reels and Stories, stores the provider identifiers and displays delivery
status. This workflow does not create ads or spend an advertising budget.

**instagram_content_publish:** ConnectyHub allows a business to publish and
schedule owned images, Reels, carousels and eligible business-account Stories
to its selected Instagram professional account. Users compose and approve
each draft; the app creates media containers, waits for processing and publishes
only after confirmation. Delivery status and identifiers are displayed in the
editorial calendar. No access to unrelated accounts is requested.

## Referências oficiais consultadas

- [Instagram API / Content Publishing e Reels](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00).
- [SDK oficial Meta: IGUser media e media_publish](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/iguser.py).
- [SDK oficial Meta: Page photos, photo_stories, video_reels e video_stories](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py).
- [Fluxo oficial de Reels Facebook](https://www.postman.com/meta/facebook/folder/simabyk/reels-publishing).

## Verificação

24 testes dirigidos passaram: formatos, ordem e retomada de containers,
resultado incerto, persistência anterior ao envio, processamento assíncrono,
host de upload, isolamento, admin assistido, plano e grant de revisão.
TypeScript e ESLint dirigidos passaram. Publicação em produção, provas visuais,
envios reais e situação das permissões serão registrados após verificação.
