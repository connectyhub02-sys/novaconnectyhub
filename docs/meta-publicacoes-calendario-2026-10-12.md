# Publicações e calendário Meta — 12/10/2026

## Escopo implementado

Editor compartilhado pelo admin e cliente: Post, Reel, Story, Carrossel e Vídeo;
até dez mídias ordenadas, upload MP4 até 100 MB e imagens até 8 MB convertidas
para JPEG, biblioteca por organização, rascunho, aprovação e agendamento.
Calendário consulta o intervalo do mês no servidor com paginação, em vez de
filtrar somente os últimos quarenta registros. Datas exibidas no fuso do navegador.

Instagram: imagens, Reels/vídeos, Stories e carrossel com imagens/vídeos.
Stories exigem conta empresarial; elegibilidade validada pela Meta ao criar a mídia.
O IGUser do Facebook Login não expõe account_type. Não incluem stickers ou legenda sobreposta.
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

## Conexão e primeiras entregas reais — 12/10/2026 13h40 BRT

As autorizações pendentes acima foram recebidas. `pages_manage_posts` e
`instagram_content_publish` acrescentados ao app e às duas configurações de login:
USER 1581800719812884 e BUSU 1530551425223156, ambas com 17 escopos selecionados.
Não foram incluídos email ou catalog_management no consentimento. Configuração
WhatsApp separada preservada. Reconexão real concluída nos ativos isolados
buffalomass.life / buffalomasseliteclub e, separadamente, na operação própria
ConnectyHub / connectyhub.ai. O admin confirmou os dois novos grants na conexão.
Painel /admin/meta/publicacoes abriu com sessão Platform Admin e os cinco formatos.

Uploads JPEG e MP4 funcionaram pela extensão. As entregas abaixo foram feitas
somente na conta isolada meta-review, nunca nos ativos internos da operação:

| Conteúdo | Facebook | Instagram |
|---|---|---|
| Imagem com legenda | 839794832549513_122154131553087692 | 18153412630486587 |
| Álbum/carrossel | 839794832549513_122154131727087692 | 17999902107007166 |
| Reel | Upload 1116816004063224, ainda não finalizado nesta checagem | 18151742440543008 |
| Story | Upload 1085258137759287, ainda não finalizado | Bloqueado pela consulta account_type; correção preparada |

Links confirmados visualmente: Instagram /buffalomasseliteclub/p/DeZprDgDbA0/,
/p/DeZpvtdDc9o/ e /reel/DeZpzfcErbx/. Facebook: post
839794832549513/posts/122154131553087692. Não confundir upload com publicação.

Testes reais revelaram três correções: conta de avaliação sem documento era
barrada no worker; consulta account_type não existe no IGUser via Facebook Login;
Facebook deixa processamento not_started até receber finish após upload_complete.
Grant confiável é conferido no dono da organização e só dispensa cadastro da conta
isolada ativa, mantendo plano, contrato e grants Meta. Correção de vídeo preserva
os IDs e só confirma entrega depois de publishing_phase complete.

Vídeos principais renderizados e inspecionados em
output/meta-publicacoes-20261012/edit: facebook-publicacao-login-final.mp4 (137,53 s)
e instagram-publicacao-login-final.mp4 (167,73 s). Percurso real: reconexão, escolha
dos ativos de teste, upload, rascunho, aprovação, processamento, IDs e post externo.
O vídeo Instagram também mostra carrossel e Reel. Não incluem ainda Story validado
nem conclusão do agendamento. Captura Facebook recortada ao diálogo do post para
não expor contatos pessoais na lateral. Os vídeos antigos da revisão foram preservados.

Agendamento aprovado pela UI para 12/10 às 13h43 BRT, título “Demonstração —
calendário com entrega”, nas duas redes; falta observar execução da fila. A entrada
datetime-local via fill da extensão só persistiu após interação de teclado nativa;
não foi necessário alterar o componente. O rascunho desta tentativa sem data foi arquivado; os dois rascunhos antigos
de demonstração continuam sem aprovação e não serão publicados.

Portal nesta checagem: os dois escopos novos ainda em 0/1, Ready for testing;
Meta avisa até 24h para contabilizar. Menu pages_manage_posts → Actions → Add to
App Review está desabilitado. Nenhum formulário novo disponível para anexar ou
enviar agora. Pedido anterior 1078832598351314 continua Review in progress,
sem alteração dos anexos. Não afirmar que os novos vídeos foram anexados ou que
esses dois escopos já foram enviados. Sem anúncios, impulsionamentos ou gastos.


## Correções publicadas e agendamento entregue — 12/10/2026 13h47 BRT

Produção `3915c1f1eded02c2545eff3056e6b591223142a4`, slot b/3131;
fallback `3842f3d129a7012b06cca68023e5383ad2a4bf8a`, slot a/3130.
A candidata intermediária 2cb3c6e4 não foi ativada. As correções de cadastro
restritas à avaliação, elegibilidade de Stories e finalização do upload Facebook
estão no release ativo. 27 testes dirigidos, TypeScript, ESLint, build e smoke
público passaram; GET Inngest assinado confirmou 58 funções. Builder parado.

Agendamento de 13h43 foi processado pela fila às 13h45 nas duas redes:
Facebook `839794832549513_122154133269087692` e Instagram `18144975910587329`.
Não houve clique em Publicar nesse item após a aprovação. A fila é de cinco
minutos, portanto a interface deve comunicar que não há precisão de minuto exato.
Story retomado pela UI preservando vídeo Facebook 1085258137759287 e criando
container Instagram; ambas as redes em processamento nesta checagem. Reel
Facebook recebeu finish para o vídeo existente 1116816004063224, sem novo upload.

## Entrega final e vídeos completos — 12/10/2026 13h55 BRT

UI confirmou Story e Reel publicados nas duas redes às 13h50, sem erros pendentes.
Story: Facebook 1085258137759287, Instagram 17919810927243658.
Reel: Facebook 1116816004063224, Instagram 18151742440543008.
Story Instagram reproduzido no perfil isolado, capturado no segmento
21-instagram-story-final. Reel Facebook visualmente confirmado. Cinco itens
publicados no total, dois rascunhos antigos não aprovados e uma tentativa arquivada.
O formato Vídeo usa o pipeline implementado e testes dirigidos; nesta rodada a
validação real de vídeo foi feita por Reel e Story, não por um novo post Vídeo.

Vídeos finais substituem a montagem anterior, incorporando a conclusão dos
Stories/Reels e do agendamento. Facebook: edit/facebook-publicacao-login-final.mp4;
Instagram: edit/instagram-publicacao-login-final.mp4. Render H264 1920x1080,
manifesto e folhas de contato revisados; capturas reais, sem simular entrega.
Evidência do painel: publicacoes-confirmadas.png. Formulário novo segue bloqueado
na última checagem externa descrita acima; vídeos prontos localmente, NÃO anexados.
Revisão anterior preservada. Acompanhamento deve verificar desbloqueio e anexar
estes vídeos quando disponível, sem repetir publicações só para contadores.

## Acompanhamento — 12/10/2026 18h44 BRT

Review → A testar no Chrome Connecty: instagram_content_publish e pages_manage_posts permanecem em 0 of 1 API call(s) required. Ainda dentro das 24h informadas pela Meta; revisão anterior continua Review in progress. Vídeos finais permanecem locais, não anexados. Sem novas chamadas/publicações, alteração do pedido, implantação ou gastos. Nenhuma mudança relevante a notificar.
