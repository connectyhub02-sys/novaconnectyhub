# Publicações e conexões sociais — 24/11/2026

Pedido de Magno: usar a organização do Meta Business Suite como referência, tornar a criação de publicações encontrável e publicar um vídeo nas redes escolhidas em uma área comum, nos painéis administrativo e do usuário. Evidências de referência: capturas de 01h17/01h19 fornecidas pelo titular.

## Implementação

- Grupo Redes sociais na navegação com Publicações, Calendário e Biblioteca. Publicações abre a lista de conteúdos, com Criar publicação destacado, busca, rede, datas e abas Todos, Publicados, Agendados, Rascunhos e Precisam de atenção.
- Tabela responsiva com miniatura, legenda/título, redes, data, estado e comentários quando fornecidos pela Meta. Resultados por destino em detalhes; falha parcial e resultado incerto permanecem visíveis. Sem métricas inventadas.
- Consulta somente leitura dos posts Facebook/Instagram dos ativos selecionados da organização, com paginação da Meta; histórico da ConnectyHub e formatos Meta anteriores preservados. Até 100 itens recentes do fluxo de vídeo e até 40 itens do fluxo Meta, conforme limites existentes.
- Editor de vídeo único: mesmo arquivo, redes selecionáveis, legenda comum ou por rede; revisão de destinos e aprovação versionada preservadas. Fotos/carrosséis/stories continuam pelo editor Meta, acessível na mesma área. Não foi criado conversor automático de mídia.
- YouTube mantém título, privacidade, declaração infantil e mídia sintética; informa formato compatível com Shorts pela proporção/duração. TikTok mantém consulta atual da conta, privacidade não pré-selecionada, interações, divulgação comercial e aceite explícito.
- Calendário mensal com agenda por dia, redes, estados e fuso do navegador; envio continua com limite de 28 dias do motor existente. Redes processam entregas independentemente.
- Reconectar, Trocar contas e Desconectar explícitos no gerenciamento Meta admin e contas sociais; painel cliente preserva handlers próprios e ganha atalhos para criar/ver conteúdo e trocar contas. Nova desconexão admin usa escopo autorizado, gestor/plano, origem e limite de requisições. Remove apenas credenciais sociais/Ads da empresa; não revoga o grant inteiro do Facebook nem apaga credenciais WhatsApp.
- Página `/admin/meta/social` passa a ser gerenciamento de conexão com atalhos claros, sem mural extenso de legendas. Nomes de ativos são obtidos do catálogo salvo; identificadores continuam disponíveis para conferência.

## Validação e limites

- 57 testes em 9 arquivos: filtros/estados, calendário, Shorts, legado parcial/incerto, autorização por organização, endpoints de leitura/desconexão, políticas, fila/armazenamento, provedores e navegação.
- TypeScript e ESLint verificados; build de produção e conferência publicada ainda pendentes neste registro inicial.
- Prévia local com dados fictícios: tabela, detalhes por destino, editor YouTube/TikTok e calendário; 390 × 844 sem transbordamento horizontal. Gravações bloqueadas na prévia.
- Não foram publicados posts, acionadas campanhas, gerada IA, removidas conexões nem alterados ativos/portfólios. Aprovação dos apps e envio externo real não são comprovados por estes testes de interface.

Referências oficiais consultadas: [YouTube Shorts de até três minutos](https://support.google.com/youtube/answer/15424877?hl=en), [diretrizes de compartilhamento TikTok](https://developers.tiktok.com/doc/content-sharing-guidelines/). Os requisitos e permissões de cada rede continuam aplicáveis.

## Publicação

Pendente de build, smoke e verificação da versão ativa.
