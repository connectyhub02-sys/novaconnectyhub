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
TypeScript e ESLint dirigidos passaram. Produção publicada no commit
`26a84311d6149f863b9ae8433104c8a59f67393b`, slot b/3131; fallback
`a46a0a607473633c75049641cdc555cefc30a0cb`, slot a/3130. Build de produção,
health/SHA, login/asset/loja e bloqueio das APIs sem sessão passaram. Consulta
Inngest assinada no candidato confirmou 58 funções e autenticação. Não foi
executado um novo registro explícito; rota e configuração foram preservadas.
Builder parado após a publicação. Nenhuma migration necessária.

No navegador da conta isolada meta-review, confirmados editor com os cinco
formatos, criação de dois rascunhos e calendário mensal. Selecionar 20/10/2026
preencheu 09:00; o segundo rascunho persistiu com essa data e apareceu na grade
mensal após consulta ao servidor. Ambos permanecem em rascunho: nenhum envio
ou agendamento aprovado. A tentativa anterior de preencher datetime-local
pelo controle do navegador não persistiu; seleção visual do dia funcionou.
Evidências: `output/meta-publicacoes-20261012/rascunho-com-data.png` e
`output/meta-publicacoes-20261012/calendario-com-rascunho.png`.

O admin usa o mesmo editor e sua autorização foi coberta pelos testes; a sessão
Chrome disponível estava como cliente e mostrou acesso restrito na rota admin.
Não contar isso como validação visual de uma sessão administradora.

### Pendências verificadas

- Upload pelo Chrome connectyhub02 bloqueado pela falta de “Permitir acesso a
  URLs de arquivo” na extensão. Solicitada habilitação ao titular; imagens de
  teste e MP4 próprio de seis segundos estão em output/meta-publicacoes-20261012.
- `pages_manage_posts` e `instagram_content_publish` ainda não foram acrescentados
  no portal/configurações nem concedidos na reconexão. Confirmação específica
  para ampliar o acesso foi solicitada e segue pendente nesta etapa.
- Pedido anterior 1078832598351314 preservado em análise. Não houve envio de
  solicitação complementar nem modificação dos anexos anteriores.
- Justificativas e roteiro de demonstração estão preparados neste documento.
  Vídeos integrais novos, upload real, publicação de cada formato e execução
  agendada na Meta ainda não foram validados. Não apresentar os testes internos
  ou as capturas do editor como demonstração integral de publicação.
- Sem anúncios, impulsionamentos, pagamentos ou gastos de mídia.

## Retomada autorizada — 12/10/2026

O titular autorizou expressamente acrescentar `pages_manage_posts` e
`instagram_content_publish` ao app/configurações e reconectar apenas os ativos
próprios e isolados já escolhidos. Também informou ter habilitado acesso a
arquivos locais na extensão do perfil connectyhub02. Não pedir essas mesmas
autorizações novamente; o upload ainda precisa ser confirmado na prática.

Nesta retomada, o inventário encontrou apenas Chrome Connecty (perfil 4), com
a aba Meta 1614700014 no caso de uso Pages. connectyhub02 não apareceu.
A aba foi localizada/reivindicada, mas leitura e screenshot falharam por
timeouts de controle; a última tentativa reiniciou a sessão da ferramenta.
Nenhuma permissão foi alterada, reconexão feita ou publicação enviada nesta
tentativa. Solicitada reabertura dos dois perfis com extensão conectada.

Mídias locais conferidas: dois JPEGs próprios e MP4 H.264/AAC, 1080x1920,
seis segundos. Após recuperar o navegador, retomar adição dos dois escopos,
configurações de login, reconexão isolada e demonstrações reais. O pedido já
em análise deve ser preservado; não afirmar envio complementar sem confirmação
do portal.
