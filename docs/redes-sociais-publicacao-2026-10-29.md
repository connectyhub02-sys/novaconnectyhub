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
YouTube é independente do Ads. Os quatro valores estavam ausentes tanto do
cofre quanto do ambiente do container ativo na verificação de 29/10.

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

O estado de implantação verificado fica no topo de `estado-operacional.md`.
