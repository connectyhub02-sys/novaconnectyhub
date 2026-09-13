# Aceite da oferta de um item e retomada do esclarecimento — 13/09/2026

## Falha observada

O novo print do titular, posterior à publicação de 12/09 às 23h12, mostrou um loop ainda presente: a agente ofereceu adicionar uma unidade ao pedido, recebeu “sim coloca”, pediu produto e quantidade novamente e não prosseguiu mesmo após receber nome completo, quantidade e preço copiado. A publicação anterior e seus testes não comprovavam a resolução deste percurso real.

Reprodução local com produtos comuns fictícios confirmou três causas: o aceite curto não consultava a oferta específica anterior; a vírgula do preço era classificada como lista de produtos; e a extração de quantidade podia deixar “unidade de” dentro da identidade do item. A proteção contra anúncio de alteração não executada evitava uma falsa confirmação, mas repetia a pendência sem resolvê-la.

## Correção compartilhada

- A resposta curta a uma oferta única, recente e explícita de inclusão preserva produto e quantidade e prepara uma nova prévia. Somente a confirmação posterior do total revisado pode aplicar a alteração e gerar o pagamento.
- As bolhas consecutivas são reunidas para interpretar a oferta; uma pergunta posterior impede usar o aceite para uma oferta anterior. Uma citação explícita só pode apontar para mensagem de saída salva no mesmo escopo e dentro da janela temporal.
- Preços identificados com R$ são removidos da identidade copiada, inclusive entre parênteses ou acompanhados de “cada”. Números de versão/capacidade, quantidades inválidas, negações e perguntas permanecem diferenciados. O preço cobrado vem do catálogo atual.
- Quantidade recebida separadamente é preservada enquanto falta identificar o produto. Detalhes repetidos e repetição do mesmo evento não adicionam outra unidade. Reenvios idênticos da prévia não criam um novo loop de confirmação.
- A identificação para revisar o pedido usa título e códigos do produto/versão; categoria e token isolado não autorizam escolher outro item. Produto removido ou inativo não é substituído pelo item mais parecido.
- Nova inclusão com versões ambíguas ou indisponíveis pede a escolha e preserva a quantidade. Resposta com versão ou código resolve a pendência sem duplicar itens. As opções de itens anteriores continuam protegidas.

Não houve nova migration SQL, alteração de configuração de loja ou intervenção manual nos pedidos/conversas. A correção integra o fluxo comum de carrinho e checkout. Os fluxos especializados de entrega local e mudanças de infraestrutura continuam fora deste pacote.

## Evidência de validação

Reprodução e revisão independentes cobrem aceite curto, oferta em bolhas, pergunta posterior, preço copiado, unidade explícita, dados separados, reenvio, recusa, citação, outra conversa/instância, oferta antiga, mudança de catálogo e variantes. Os arquivos novos têm 26 cenários de continuidade da oferta e 18 de versão/identidade; o parser tem 183 testes após a ampliação.

Validação consolidada concluída: **2.296 testes em 180 arquivos aprovados**, sem falhas, usando dois workers. TypeScript, ESLint dos arquivos alterados, diff-check e revisão independente aprovados. Os testes executam as funções reais de interpretação e preparação do pedido, com banco, transporte e provedor substituídos. Conferem prévia, dados persistidos e ausência de pagamento antes do novo aceite. Não comprovam entrega real pelo WhatsApp ou aprovação bancária. Publicação autorizada em preparação; registrar a conferência de produção após o envio.

## Limites e reteste

Uma oferta sem quantidade, com alternativas, sem identidade suficiente ou com citação não verificável ainda exige esclarecimento. Não é prometido entendimento de toda formulação humana. Produtos fora do catálogo ativo continuam indisponíveis; valores fornecidos na conversa não substituem os configurados na loja.

Reteste previsto na mesma conversa, sem reset: aceitar a oferta de um item, conferir itens/quantidade/frete/pagamento no novo resumo e confirmar uma vez. Repetir com produto e preço copiados e, quando houver versões, responder à escolha solicitada. A observação desse atendimento real permanece responsabilidade do reteste do titular após a publicação verificada.
