# Alimentação: montagem por unidade — 14/09/2026

O titular autorizou a retomada: “As melhorias de alimentação, pode continuar então.” A pausa anterior foi revogada; esta entrega não depende do reteste de Gustavo/Renata nem do vínculo de calendário da Renata. Base preservada: `4ecc86709f7fe874723f51993425e97a485434ad`. P2.2–2.3 e as decisões condicionais de P3 continuam pendentes no plano dos 32 perfis.

## Comportamento implementado

- Painel do catálogo permite habilitar montagem e cadastrar tamanhos, frações, sabores, incompatibilidades, bordas, adicionais e escolhas de combos. A empresa escolhe explicitamente preço fixo, maior sabor ou média ponderada; limites, preços e disponibilidade vêm do cadastro.
- Loja e página do produto preservam a montagem de cada unidade no carrinho. Duas pizzas podem ter sabores, adicionais e observações diferentes. Cada unidade gera sua própria linha financeira, evitando perda de centavos por média de preços. Observação livre não vira adicional cobrado.
- WhatsApp recebe as opções cadastradas, valida a proposta contra o catálogo e exige confirmação do resumo e total. Pergunta sobre combo não autoriza incluí-lo. Montagem incompleta ou política grande demais direciona pelo botão “Montar pedido”. Links continuam exclusivamente em botões.
- Pedido já criado e ainda editável pode abrir “Revisar montagem”. O checkout recalcula a montagem e a entrega de todo o carrinho, mostra o novo total e só aplica após confirmação, usando o protocolo existente de revisão, versão, idempotência e aposentadoria de cobranças.
- Nova cobrança revalida montagem, valores, estoque agregado do produto e entrega. Consulta/reconciliação de uma tentativa anterior continua possível quando o cadastro muda. SQL também confere valores na gravação, revisão e início de pagamento.
- Montagem marcada como exclusivamente local impede frete nacional, inclusive em carrinho misto. Área parcial da cidade, taxas, mínimo, isenção, horários e retirada usam as regras compartilhadas já publicadas em P1.2/P1.3. Retirada exige habilitação; nenhuma área ou horário é presumido.
- Busca indexada passa a incluir sabores e escolhas. A loja carrega o catálogo em páginas de 500, removendo o antigo corte de 160 itens; a conversa mantém a busca completa além do lote inicial.

## Limites explícitos

É necessário configurar os produtos e a operação de cada empresa. A conferência do banco após a migração encontrou **zero produtos com montagem habilitada**. Não houve ativação de cardápio, alteração de cliente, mensagem, pedido, reserva ou pagamento real de teste.

Esta etapa usa estoque do produto final e disponibilidade manual das escolhas; não baixa ingredientes, lotes ou insumos e não cria nova reserva atômica de estoque para pedidos não pagos. Montagem requer produto físico com checkout avulso e no máximo um SKU ativo; não combina uma matriz de variantes SKU com a composição. Limites de fechamento incluem 20 unidades por produto e 100 linhas financeiras. Edição de montagem de pedido criado ocorre pelo checkout, não por alteração autônoma integral em linguagem natural.

Disponibilidade de equipe/cozinha, agendamento de pedidos futuros e reteste real pelo titular não estão comprovados por esta entrega. Os testes de conversa e cobrança usam dados e provedores fictícios.

## Validação

Suíte geral: **2.682 testes aprovados**, zero falhas/pendências. Após os ajustes finais de revisão, entrega, cobrança e confirmação, **115 testes em oito arquivos** passaram novamente. Casos incluem preço fixo/maior/ponderado, frações e arredondamento, limites/incompatibilidades, unidades distintas, recuperação do rascunho, confirmação antes de cobrar, revisão com replay, isolamento de checkout e permissões SQL. A suíte geral antecedeu esses últimos ajustes; a rodada direcionada cobriu os módulos afetados.

Build Next.js 16.3.2/webpack e TypeScript finais aprovados; ESLint dos arquivos alterados e diff-check sem erros. Componentes reais conferidos em prévia isolada, desktop e 390px: adicional só na primeira pizza, segunda unidade preservada, limite excedido bloqueando fechamento e ausência de overflow horizontal. Ajuste final do rótulo de adicionais mostra o custo da quantidade selecionada, com o mesmo arredondamento do cálculo.

## Banco verificado

Migration `0142_food_composition` aplicada em transação com preflight dos corpos de revisão anteriores, registro no histórico e recarga do schema. MD5 do SQL normalizado para LF: `ee04a5a47c176b8df4f55baea7fedce9`, igual ao arquivo versionado. MD5 bruto registrado: `f9235b017b82c83c113134c0ec76dbd2` (editor armazenou CRLF).

As seis funções novas estão com execução negada a anon/authenticated e permitida a service_role. Ambos os triggers de proteção estão habilitados; índice `catalog_runtime_search_idx` válido e proteção de composição presente na revisão. O helper imutável de busca preservou suas permissões anteriores. Corpos originais de `begin_sales_catalog_order_revision` e `finish_sales_catalog_order_revision` preservados, MD5 `81c3938707ff425fb2aeac6bfb49877e` e `f765b902eb2935f7553b0d868a6e3e66`, respectivamente. Nenhuma linha de pedido/configuração foi atualizada pela migração.

Aplicativo em publicação nesta revisão documental; confirmação do commit e da implantação será registrada após o deploy.
