# Publicação de vídeos em várias redes — 29/10/2026

O titular autorizou concluir a programação e publicar a aplicação para testes.
Isso não autoriza enviar vídeos de clientes ou executar análises pagas durante a homologação técnica.

## Implementação

- Redes sociais nos painéis cliente e admin: Publicações, Calendário de posts,
  Biblioteca de mídias, Contas conectadas. Admin opera a própria organização.
  Conteúdo Meta anterior continua acessível no editor de formatos exclusivos.
- OAuth independente YouTube/TikTok, callback vinculado a usuário, organização e
  cookie, estado de uso único, tokens criptografados, seleção manual de conta,
  renovação, desconexão e tentativa de revogação externa.
- MP4 até 100 MiB / 10 minutos, biblioteca R2 com a cobrança de armazenamento já
  existente. FFprobe lê duração, resolução, taxa e codecs; FFmpeg decodifica o
  arquivo para verificar integridade. Temporários são removidos. O upload de
  navegador é limitado e reiniciável, não é multipart resumível nesta versão.
- Diagnóstico técnico separado da avaliação editorial. Gemini avalia as quatro
  redes numa única solicitação, usando o medidor central de créditos e uma
  identidade determinística por empresa/arquivo. Reconsultar não gera nova
  cobrança. Não há criação de roteiro nem bloqueio por nota editorial baixa.
- Rascunho versionado; revisão mostra contas; aprovação atômica exige a versão
  e os destinos revisados. Edição não é permitida após aprovar. Agendamento
  armazena UTC e fuso IANA do navegador, até 90 dias; cancelar não apaga posts
  externos. Revisar novamente é necessário se a conta mudar.
- Uma entrega por destino (Instagram, Facebook, TikTok, YouTube), com estados,
  identificadores, erro, agendamento, lease e resultado próprios. A função
  Inngest existente de publicações executa o novo passo a cada cinco minutos.
  Sucesso parcial fica visível. Interrupções com resultado desconhecido no
  TikTok/Meta não são reenviadas. YouTube reconcilia offset na mesma sessão.
- YouTube: canal OAuth conferido, upload resumível em blocos de 8 MiB,
  privacidade, público infantil e mídia sintética; confirma processamento.
- TikTok: creator_info no editor e na aprovação/envio, privacidade sem default,
  interações desligadas por padrão, declarações comerciais, consentimento,
  Direct Post com PULL_FROM_URL, status consultado até confirmação.
- Instagram/Facebook reutilizam o executor existente com checkpoints. O fluxo
  conjunto oferece Reels, com limites conservadores: Facebook vertical até
  90 s; Instagram quadrado/vertical até 180 s. Demais formatos permanecem no
  editor Meta. Compatibilidade local não garante aprovação externa.
- RLS e grants impedem acesso browser às tabelas/credenciais/sessões. Endpoint,
  aprovação e worker verificam empresa, papel, plano, cobrança e contrato.
  Contas exclusivas da revisão Meta permanecem no fluxo Meta.

## Instalação e configuração

Migrations `0220_social_connections.sql` e `0221_social_publishing.sql`. A
numeração 0213/0214 proposta inicialmente foi substituída: produção já utiliza
0213 a 0219 para cobrança e WhatsApp. Release deve partir de `0c19c471`, que
estava ativo na verificação, preservando essas alterações.

Na manutenção: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY`,
`TIKTOK_CLIENT_SECRET`, usando os campos próprios do cofre. OAuth Google de
YouTube é independente do Ads. Os quatro valores estavam ausentes na verificação
inicial de 29/10; foram cadastrados posteriormente conforme registro abaixo.

Callbacks de produção:

- `https://www.connectyhub.com.br/api/dashboard/social/youtube/callback`
- `https://www.connectyhub.com.br/api/dashboard/social/tiktok/callback`

Habilitar YouTube Data API e consentimento/scopes readonly + upload. TikTok
precisa Login Kit, Content Posting API/video.publish e domínio ou prefixo R2
verificado para PULL_FROM_URL. Revisão/auditoria e contas de teste dependem dos
provedores. TikTok não auditado restringe a visibilidade. Nenhum grant Meta
substitui essas aprovações. Configuração não é prova de publicação funcional.

## Evidências e piloto

Testes locais cobrem OAuth, isolamento, persistência real das migrations em
PGlite, aprovação única, versões, cancelamento, concorrência de claims,
retomada de sessão YouTube, timeout TikTok, status parcial e regras de mídia.
Prévia com componentes reais/dados fictícios: cliente/admin em 1440 e 390 px,
sem erro JavaScript ou overflow horizontal; isso não valida contas reais.

Piloto pendente: configurar aplicativos, conectar uma conta própria em cada
rede, selecionar destinos e enviar um vídeo explicitamente aprovado para teste
(privado/não listado quando suportado); confirmar links e visibilidade real.
Depois validar agendamento, renovação, falha parcial e uma organização cliente.
Nenhum vídeo real foi publicado nem consumo Gemini disparado por estes testes.

Referências oficiais consultadas: [TikTok Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post),
[status TikTok](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status),
[upload resumível YouTube](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol).

Versão `35626c22` publicada no slot a, migrations instaladas, health público
e Inngest assinado conferidos. 104 testes locais aprovados. O estado de
implantação detalhado fica no topo de `estado-operacional.md`.

### Configuração assistida dos provedores — 29/10/2026

- Titular autorizou configurar aplicativos e testar conexões das próprias contas
  na organização BuffaloMass, com desconexão depois dos testes. Navegador
  autenticado confirmou essa organização e as integrações ainda em preparação.
- Google: branding/consentimento inicial ConnectyHub criado no projeto existente
  `gen-lang-client-0089240657`, público externo em testes, após autorização
  específica do aceite da política de dados. UI confirmou a criação do OAuth.
  Cliente web `ConnectyHub YouTube` criado com o callback acima; credencial
  armazenada e conferida no cofre criptografado, após autorização explícita.
  YouTube Data API v3 ativada e usuário `connectyhub01@gmail.com` adicionado aos
  testes. Não houve publicação pública do aplicativo.
  Nome, links públicos do site/privacidade/termos e domínio `connectyhub.com.br`
  salvos no branding com confirmação do Google. App permanece em testes;
  cadastramento do domínio não comprova propriedade verificada pelo Google.
- Console Google mostra aviso genérico de possível violação de política em
  vários projetos. Não se confirmou suspensão nem bloqueio deste projeto.
- YouTube real: titular corrigiu a conta de destino para ConnectyHub, pois o
  canal YouTube BuffaloMass está excluído. Nova tentativa concluiu consentimento,
  seleção do canal `UCZxrEBjTBx4HDDBlaCLR_Qw` e Verificar conexão no painel
  BuffaloMass. Banco confirmou status connected, tokens criptografados e seleção
  do canal às 19:11 UTC. Depois o painel confirmou desconexão e revogação.
  Primeira tentativa retornou erro após longa espera; a nova sessão funcionou.
  Nenhum vídeo enviado, crédito Gemini consumido ou renovação forçada.
- TikTok: titular concluiu cadastro de desenvolvedor. Organização ConnectyHub
  `7702151276024464392`, app `7702129647836678196` e Sandbox `ConnectyHub Testes`
  (`7702121750129084422`) criados. Chave e segredo do Sandbox no cofre criptografado
  com conferência dos valores, sem registros em código/documentação.
  Sandbox salvo com ícone oficial redimensionado sem IA para 1024 px, categoria
  Business, descrição, site, termos/privacidade, Login Kit e callback acima,
  Content Posting API/Direct Post. Scopes disponíveis user.info.basic,
  video.publish e video.upload; o sistema solicita apenas basic e publish.
  Produção permanece rascunho, sem revisão/submissão; não está liberada a clientes.
- Prefixo TikTok `https://www.connectyhub.com.br/` confirmado Verified.
  Regra exata no Caddy serve o arquivo público
  `tiktokmpV0w9KFrbgYSMVdXsz0zBeO5waud0FH.txt`; validação/reload e HTTPS com
  corpo exato confirmados. Backup em
  `/opt/connectyhub/proxy/Caddyfile.before-tiktok-20261029T185801Z`.
  Prefixo de mídia `https://pub-9f5b2802265a4ee2b52bc4e080f3941e.r2.dev/meta/organic/`
  verificado no Sandbox após upload do arquivo
  `meta/organic/tiktoksQG6Ce8lWM44nWuQRCvfGkHmvZQIeeLU.txt` e GET HTTPS com
  conteúdo exato. O portal confirmou Verified. Produção ainda precisa da
  configuração correspondente e revisão.
- TikTok real: @connectyhub.ia cadastrada como target user após login do titular.
  Consentimento para perfil/publicação e termos autorizado especificamente.
  Retorno OAuth, seleção de ConnectyHub e Verificar conexão concluídos no painel
  BuffaloMass. Banco confirmou status connected, tokens criptografados, conta
  selecionada e scopes user.info.basic/video.publish às 19:18 UTC. Ao concluir,
  painel confirmou desconexão e revogação. Nenhum vídeo enviado.
- Ícone final: `public/brand/connectyhub-app-icon-1024.png`, redimensionado por
  Sharp/Lanczos3 a partir do original de 512 px, por escolha explícita do titular,
  sem IA. Tentativa gerada descartada; não usada no app. Original preservado.
- Nenhum segredo registrado nesta documentação. Publicação externa real,
  agendamento, renovação e falha parcial continuam sem homologação. Cadastro
  de aplicativos e sucesso OAuth não comprovam publicação funcional.
