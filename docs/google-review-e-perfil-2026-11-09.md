# Google: revisão OAuth, perfil da empresa e SEO — 09/11/2026

## Autorização e escopo

Magno autorizou corrigir e publicar as pendências do Google e o SEO da ConnectyHub,
reconectar temporariamente o canal ConnectyHub com `youtube.readonly` e
`youtube.upload`, publicar um clipe técnico privado e disponibilizar a demonstração
final como não listada. A conexão deveria ser removida ao final. Nenhuma campanha
paga foi ativada. Telefone provisório confirmado após validação do nono dígito:
**(47) 98855-6936**, WhatsApp `https://wa.me/5547988556936`.

## Código e publicação

- A política pública `/privacidade`, seção 4, passou a explicar HTTPS/TLS,
  criptografia AES-256-GCM dos tokens antes da gravação no banco, separação da
  chave do servidor, acesso autenticado e por empresa, proteções de estado OAuth,
  ausência de senha Google armazenada e tratamento das credenciais somente no
  servidor. O texto descreve mecanismos confirmados no código; não promete
  criptografia universal de todo armazenamento.
- Título e descrição da home explicam agentes de IA, WhatsApp, CRM e automações.
  Instagram, YouTube e TikTok oficiais foram centralizados no código e receberam
  links visíveis no rodapé. O `Organization.sameAs` usa a mesma fonte.
- A base publicada por outra frente (`3e6e95df`) foi incorporada antes do deploy,
  preservando as alterações de coexistência. Release `fd45da28b921104f2d6cd3117cdd9559883a3c8d`
  ativada no slot a às 17h39 BRT. Build, TypeScript e lint passaram.
- Smoke da candidata e do HTTPS público: 15 páginas/canônicas HTTP 200, 25 arquivos
  estáticos, painéis anônimos 307, APIs privadas 401, política nova, links sociais,
  robots, sitemap, llms e Inngest autenticado com 61 funções. IndexNow aceitou as
  15 URLs, HTTP 200.
- Após confirmação do telefone completo, commit `fa4e3d9a` corrige a home e os
  fallbacks das páginas de vídeos e software personalizado; normaliza também o
  número legado exato sem nono dígito quando retornado pela configuração interna.
  A release `fa4e3d9a6aea4c5e3168cdf17e7f468d997767e6` foi ativada no slot b às
  17h58 BRT, preservando `fd45da28` no slot a para retorno. Smoke candidato e
  público passaram: versão correta, 15 páginas/canônicas, 25 assets, proteção
  dos painéis/APIs, política, redes, Inngest autenticado com 61 funções e os dois
  redirecionamentos de contato com `5547988556936`. Navegador confirmou o link
  da home. A notificação IndexNow da segunda publicação também foi aceita.

## Perfil da Empresa no Google

Perfil próprio `15654835879579276835`, conta `connectyhub01@gmail.com`.
Descrição atualizada para apresentar a plataforma, agentes, WhatsApp, CRM,
automações, APIs, software sob medida e produção/edição de vídeos. Site corrigido
para `https://www.connectyhub.com.br/`. A descrição foi relida salva sem aviso de
pendência. As três redes abaixo já estavam corretas e foram preservadas:

- https://www.instagram.com/connectyhub.ai/
- https://www.youtube.com/@connectyhub01
- https://www.tiktok.com/@connectyhub.ia

Uma captura real da home pública foi enviada como imagem adicional; upload
concluído, inicialmente pendente de análise. Na releitura final, a grade de fotos
do painel não exibia pendência; a exibição pública da imagem não foi verificada
independentemente. Logotipo e capa existentes preservados.
Google rejeitou telefone e WhatsApp sem nono dígito. Após confirmação de Magno,
o novo telefone e `wa.me/5547988556936` foram salvos. Na releitura final, o
**WhatsApp já constava salvo sem pendência**; o telefone permanecia em revisão,
com aviso de que a publicação pode levar até sete dias. O número antigo já não
aparecia como telefone atual no editor. A troca remove o contato terminado em
7996. Nenhuma mudança em
categoria, endereço, cobertura, horário, anúncios ou outros perfis de empresas.

## Demonstração real YouTube

Operação usada: **ConnectyHub Interno**, sem publicar em empresa cliente.
Canal: `UCZxrEBjTBx4HDDBlaCLR_Qw` (ConnectyHub).

O consentimento completo foi capturado em inglês, com as duas permissões. Após
OAuth, o canal apareceu na lista e foi selecionado pelo painel. Foi enviado o
clipe original `connectyhub-review-test.mp4` (5 s, H.264, 720×1280, sem áudio),
com título e descrição próprios, privacidade **Privado**, não destinado a crianças
e sem declaração de mídia realista alterada. A publicação foi aprovada no painel,
passou por fila/processamento e chegou a **Publicada** com link real:
https://www.youtube.com/watch?v=8TTlh-axRag . O Studio confirmou conteúdo e
visibilidade privada. A conexão foi removida pelo painel, que confirmou
**Conta desconectada e autorização revogada**.

Nova demonstração montada com capturas reais completas e narração em inglês:
6 min 52 s, 1920×1080, H.264/AAC, aproximadamente 11 MB. Explica finalidade,
consentimento, uso de `channels.list(mine=true)`, `videos.insert` e
`videos.list(status,processingDetails)`, aprovação, resultado, privacidade e
desconexão. Esperas foram encurtadas; não é apresentada como gravação contínua.
Arquivo decodificado integralmente sem erro e quadros de consentimento,
publicação e desconexão conferidos.

Upload concluído no YouTube Studio: `https://youtu.be/6OQgMwbvOOI`, **não listado**.
As verificações de direitos autorais e diretrizes terminaram sem problemas; só
então foi confirmado o salvamento da visibilidade, seguido de “Vídeo publicado”.
O novo link foi salvo em Google Auth Platform > Acesso a dados, com confirmação
do aviso de atualização da solicitação e toast de mudanças salvas. Os escopos
permaneceram os mesmos. A solicitação Google ainda não está aprovada.

## Estado das revisões e comunicação

- Google projeto `gen-lang-client-0089240657`: em análise, com exigências de
  proteção de dados na política e demonstração funcional, avaliação de 05/11.
  Home, marca e escopos mínimos constavam concluídos. Escopos solicitados são
  apenas `youtube.readonly` e `youtube.upload`.
- Meta app `1002348522666389`, pedido `1092207727013801`: **Review in progress**.
- TikTok app `7702129647836678196`: **Production / In review**.

O portal Google pede resposta à conversa da equipe de verificação após resolver
as pendências. Pesquisa Gmail focada no projeto e no suporte oficial encontrou
somente o email enviado em 05/11 sobre o logo, sem resposta nessa conversa.
Após autorização explícita de Magno, a mensagem preparada em
`output/google-review/google-verification-followup.txt` foi enviada às **17h54 BRT**
de `connectyhub01@gmail.com` para `api-oauth-support@google.com`, com a política,
a nova demonstração e pedido de retomada da revisão. Gmail confirmou “Mensagem
enviada” e a conversa foi aberta em Enviados, com remetente, destinatário e corpo
conferidos. [Comprovante no Gmail](https://mail.google.com/mail/u/0/#sent/KtbxLthtDkzsSvgPmSrvHvhvPGBfJbkVJV).
Não há comprovação de leitura, resposta, retomada efetiva ou aprovação pelo Google.

Evidências locais (fora do Git): `output/google-review/`, incluindo smoke público,
capturas do perfil, passos reais, roteiro, narração, vídeo e cronologia. Fontes:
https://support.google.com/cloud/answer/13804565?hl=en e telas autenticadas dos
portais correspondentes. Aprovação, indexação e posicionamento dependem das
plataformas; cadastro ou teste concluído não equivale a aprovação do app.
