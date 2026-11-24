# Caixa de entrada Meta e conexões independentes — 24/11/2026

## Pedido e escopo

Magno autorizou separar a conexão de Instagram/Facebook da conexão opcional de WhatsApp oficial e reorganizar o atendimento usando o Meta Business Suite como referência. A publicação original deve acompanhar seus comentários e respostas. Esta entrega não pretende reproduzir todas as ferramentas do Business Suite.

Checkout isolado: `C:/Users/conne/Documents/ConnectyHub-admin-support`, branch `codex/meta-social-workspace-20261124`. Base de produção conferida: `dab097d11ed6d7843bfe75a6d6ad33374c4fc5b9`. Alterações independentes do checkout principal preservadas.

## Implementação

- Caixa de entrada compartilhada por admin e usuário: Mensagens, Comentários e Publicações, filtro Instagram/Facebook e busca nos atendimentos recentes.
- Publicações consultadas na Graph API do perfil selecionado, com mídia disponível, legenda, data, link original, contagem, comentários, respostas e paginação. Validação de propriedade independente do ID recebido.
- Respostas públicas explicitamente identificadas; Direct/Messenger mantidos como mensagens privadas. Envio manual sem geração de IA, com autorização de gestor, plano/contrato, conexão/ativação do canal e janela de 24h para mensagens privadas.
- Cada tentativa é registrada antes do HTTP, vinculada à empresa e ao administrador/usuário que respondeu. Chave de idempotência impede repetição da mesma tentativa; falha ambígua não dispara repetição automática. Nenhum token ou payload bruto é exposto no histórico.
- Comentários recebem autorização assinada, limitada ao perfil, empresa, publicação e comentário, válida por duas horas. URLs de mídia/permalink limitadas aos domínios oficiais esperados; sem proxy aberto.
- Gestão social admin em `/admin/meta/social`; `/admin/meta` preserva o WhatsApp oficial. Cartões separados nas conexões. Usuário continua usando sua própria integração social, independente de conectar WhatsApp.
- Automações e recibos continuam acessíveis em seções recolhidas. Regras, campanhas, permissões, portfólios e credenciais existentes não foram alterados.

## Verificação anterior à ativação

- 80 testes relevantes passaram: leitura e propriedade de posts, autorização, isolamento entre empresas, assinatura/expiração, janela de resposta, opt-out, modo simulação, idempotência, resultado incerto, webhook e analytics existente. Cinco cobrem o novo endpoint, incluindo origem pública atrás do proxy interno. Nenhum POST de mensagem foi feito contra a Meta.
- TypeScript sem erros após ajuste de tipagem de uma tabela de testes preexistente; lint dos arquivos novos/centrais sem erros.
- Índice de idempotência conferido no PostgreSQL de produção, somente leitura: `idx_conversation_messages_instance_provider_message`, único em provider/instância/ID, com `NULLS NOT DISTINCT`. Nenhuma migration necessária.
- Prévia local com dados fictícios: post, mídia, legenda, comentário/resposta e composição pública testados; navegação privada e viewport 390×844 conferidos sem transbordamento horizontal. Envios dessa prévia são simulados.
- Consulta real somente leitura do código novo em 24/11/2026 00h58 BRT: Instagram retornou 24 posts, todos com mídia e próxima página; Facebook retornou 19 posts com mídia. Propriedade confirmada em um post de cada rede; Instagram retornou um comentário, Facebook três comentários e uma resposta. Nenhuma legenda/conversa privada ou credencial registrada no relatório.
- Primeiro candidato `b8039d53` teve compilação cancelada antes de ativação para incorporar correção da origem HTTP atrás do proxy. Candidato final: `f5409278fcb8230b2ec7063537b69bbcdabc8427`.

## Limites

- Histórico local mostra até 100 atendimentos recentes e 100 mensagens por conversa. Conteúdo anterior à conexão pode não estar disponível; registros antigos sem ID de publicação encaminham para a aba Publicações.
- Facebook pode fornecer apenas a imagem de prévia do vídeo; o link original permite abrir a publicação na rede. Mídia e comentários dependem do acesso que a Meta disponibiliza.
- A leitura real comprova acesso aos conteúdos consultados. Os testes simulados de envio não comprovam entrega externa de resposta manual. Nenhuma campanha, mensagem, pagamento, automação pausada ou geração de IA foi ativada para esta entrega.

## Publicação

- Release `f5409278fcb8230b2ec7063537b69bbcdabc8427` ativada no slot **b** em 24/11/2026, aproximadamente 01h12 BRT. Anterior `dab097d11ed6d7843bfe75a6d6ad33374c4fc5b9` mantida no slot a para retorno.
- Build/TypeScript de produção aprovados, 129 páginas geradas. Smoke do candidato e HTTPS público confirmou SHA, 25 arquivos estáticos, login, redirecionamentos protegidos, APIs sem sessão retornando 401 e GET autenticado do Inngest com 61 funções.
- Chrome Connecty autenticado: nova caixa de entrada aberta; vídeo Instagram de 23/11 com comentário e campo público; carrossel Facebook de 14/04 com três comentários e resposta anterior encadeada; cartões distintos Instagram/Facebook e WhatsApp oficial; tela social com os ativos originais selecionados e perfil @connectyhub.ai carregado. Apenas leitura e abertura do compositor vazio, sem envio.
- Viewport de produção 390×844 conferido: largura da página 375, sem transbordamento horizontal; override removido ao concluir. A sessão e o painel ficaram disponíveis ao titular.
- Evidências no checkout principal, `output/meta-inbox-20261124/`: `graph-read-result.json`, `producao-instagram-comentarios.jpg`, `producao-facebook-comentarios.jpg`, `producao-mobile.jpg`, `producao-conexoes-separadas.jpg`. A prévia fictícia está identificada separadamente em `previa-local-comentarios.jpg`.
- Componentes compartilhados publicados para usuário e admin. Conferência autenticada feita na operação própria do admin; não foi realizado envio externo nem nova homologação numa conta de cliente. Publicação desta interface não comprova entrega real de mensagem.

## Referências consultadas

- [Moderação de comentários do Instagram](https://developers.facebook.com/documentation/instagram-platform/comment-moderation).
- [Campos de mídia Instagram](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/v21.0/).
- [Publicações de Página](https://developers.facebook.com/docs/graph-api/reference/page-post/).
- [Comentários e respostas](https://developers.facebook.com/docs/graph-api/reference/comment).
