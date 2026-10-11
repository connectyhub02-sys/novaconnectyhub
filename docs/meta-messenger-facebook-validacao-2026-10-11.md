# Messenger e comentários Facebook — validação de 11/10/2026

## Messenger observado

Nos ativos próprios da ConnectyHub, callback Page configurado e verificado em
`https://www.connectyhub.com.br/api/webhooks/meta`, com `messages` e
`messaging_postbacks` inscritos no aplicativo. A Página já possuía a assinatura
do aplicativo, mas o callback Page ainda estava vazio; assinatura na Página e
callback do objeto são etapas diferentes.

Mensagem autorizada de Eliane Dias recebida às 17h43 BRT; o operador revisou e
editou a sugestão do agente e aprovou o envio às 17h44. Run
`bea75ec6-e4a5-4582-84ba-8f85a7a3f245`: HTTP 200, uma tentativa, zero retry,
resposta efetivamente visível no Messenger do participante. Não foi envio
autônomo sem revisão nem teste de uma empresa externa.

Vídeo real de 45,03 segundos, H.264/1920×1080, renderizado e conferido:
`output/meta-review-20261011/comments/edit/messenger-recebimento-resposta.mp4`.
Inclui assinatura da Página, mensagem do participante, revisão, entrega e
monitor. As capturas do Facebook foram recortadas para a conversa de teste.

## Comentários Facebook

`pages_read_user_content` e `pages_manage_engagement` adicionados ao login e
concedidos na reconexão dos mesmos ativos próprios. Grants consultados no
servidor, sem presumir que a seleção de um escopo equivale à concessão.
`ads_management` não foi concedido. App Page `feed` inscrito; assinatura da
Página confirmada com `messages`, `messaging_postbacks` e `feed`.

Regra de demonstração limitada à publicação `293615710491088_122241992222259000`
e à palavra-chave `VALIDACAO FB1110`, com revisão humana. O primeiro comentário
gerou o evento `425bc67b-253a-4c04-b423-7c332a0424aa`, mas o webhook não continha
texto. GET oficial do comentário confirmou HTTP 200 e o texto publicado.

Correção `304c52df`: notificações Page/feed de adição sem texto consultam o
comentário pela credencial criptografada da organização e da Página selecionada.
Identidade e payload original são preservados; ausência/falha na consulta não
dispara uma resposta genérica. Consulta com limite de oito segundos e erros
sanitizados. Reconectar eventos também preserva campos já inscritos em vez de
remover `feed` ao ativar mensagens. 18 testes selecionados, TypeScript e ESLint
passaram. Publicado às 18h06 BRT no slot a/3130, SHA completo
`304c52dfa398d3ec5db582ef0512d1d0aafe9a6d`, fallback b em `a00de7b4`.
Build de produção e smoke da candidata/domínio passaram (health/SHA, home,
login, asset, logout, autorização e Inngest assinado). Sem migration; builder
parado após ativação.

Novo comentário real às 18h07 chegou com o texto recuperado, casou com a regra
e gerou o run `c21ee77b-ae4c-f9ca-efb9-a91e9a3b7cae` em `needs_approval`.
Rascunho IA aprovado sem alteração pelo painel e entregue às 18h07:38:
HTTP 200, uma tentativa, zero retry. Resposta visível no Facebook, abaixo do
comentário de Eliane Dias, publicada como ConnectyHub. Agente e três regras
pausados depois; follow-up desativado, conferidos no servidor.

Vídeo real H.264/1920×1080 de 65,30 segundos, renderizado e conferido:
`output/meta-review-20261011/comments/edit/facebook-comentario-resposta-ia.mp4`.
Abertura mostra a configuração depois do teste, explicitamente identificada
como pausada; demais trechos mostram comentário, aprovação, resposta pública e
confirmação HTTP. Facebook recortado para a publicação autorizada.
Prova conjunta: `.codex-screens/meta-messenger-facebook-entregues-20261011.jpg`.

## Revisão externa ainda pendente

App Review `1078832598351314` continua em rascunho. Formulários de
`pages_messaging`, `pages_manage_metadata`, `pages_read_user_content` e
`pages_manage_engagement` receberam justificativas atualizadas e aceites.
A Página ConnectyHub foi selecionada no formulário do Messenger.
Os quatro ainda mostram 0/1 teste contabilizado; portal informa até 24 horas.
O vídeo novo ainda precisa ser anexado. Comentários/basic do Instagram também
continuam incompletos pelo contador, apesar dos vídeos já anexados.

A conta `meta-review@connectyhub.com.br` permite inspecionar/configurar seu
agente e regras, mas não foi conectada ao atendimento social interno. Não
compartilhar senha pessoal de Facebook, histórico privado ou acesso admin para
resolver isso. A reprodução social isolada pelos avaliadores continua pendente;
as instruções do rascunho explicitam essa limitação. A solicitação não deve ser
descrita como enviada ou pronta para aprovação antes de resolver esses itens.

Antes de ligar os mesmos ativos em outra organização, revisar o roteamento do
webhook: a seleção atual considera também inventários de ativos descobertos e
usa a primeira integração correspondente. Não cadastrar simultaneamente a mesma
Página/conta social nos dois workspaces para tentar viabilizar a revisão.
