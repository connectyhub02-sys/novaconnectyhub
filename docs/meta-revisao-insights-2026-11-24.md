# Revisão Meta — read_insights e instagram_manage_insights (24/11/2026)

Submissão `1123065153928058` (não enviada). `instagram_manage_contents` foi retirada da submissão
porque a exclusão de publicações pelo painel ainda não existe; continua no app em "Ready for testing".

## read_insights — descrição de uso

ConnectyHub is a social media management platform for small businesses. A business owner connects their
Facebook Page with Facebook Login for Business and then opens "Redes sociais > Publicações" (Posts), a list
of the Page's published posts and reels. ConnectyHub uses read_insights to read post-level insights
(post_media_view and post_total_media_view_unique) only for the posts of the Page the owner selected, and
shows views and viewers in the same row as each post. When the same content was also published on the
linked Instagram account, both results are shown side by side with the total, so the owner can see how a
piece of content performed across networks without leaving ConnectyHub. Insights are requested on demand
only for the posts visible on screen (up to 25 at a time), the post ID is checked against the selected
Page before any request, and the data is shown only to members of the business that owns the Page.

## instagram_manage_insights — descrição de uso

ConnectyHub is a social media management platform for small businesses. After the owner connects the
Facebook Page and its linked Instagram professional account with Facebook Login for Business, the
"Redes sociais > Publicações" (Posts) screen lists the account's published media. ConnectyHub uses
instagram_manage_insights to read media insights (views, reach and total_interactions) for media owned by
the connected Instagram account and shows them in the same row as each post, together with the Facebook
results of the same content and the total. Before requesting insights, ConnectyHub confirms that the
media's owner is the connected account; it does not read insights or profile data of other business
accounts. Insights are requested on demand only for the posts visible on screen (up to 25 at a time) and
are shown only to members of the business that owns the account.

## Roteiro do vídeo

1. Contas conectadas → Instagram e Facebook → Gerenciar → Reconectar → Continuar na Meta.
2. Facebook Login for Business: Página ConnectyHub, negócio ConnectyHub, Instagram connectyhub.ai,
   tela de permissões com "estatísticas de Página" e "estatísticas da conta do Instagram" → Guardar.
3. Retorno ao ConnectyHub com "Autorização concluída".
4. Redes sociais → Publicações: colunas Visualizações, Alcance e Interações por rede e total.
5. Abrir os detalhes de uma publicação cruzada com os valores de cada rede.
