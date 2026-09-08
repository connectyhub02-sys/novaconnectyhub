# Interface responsiva — ConnectyHub

Implementação decorrente da auditoria de 07/09/2026. Abrange os componentes compartilhados do admin e do cliente, além das lojas e páginas de produto. A aparência depende também da identidade visual configurada por cada loja.

## Alterações

- Paleta clara com ação principal azul, cores distintas para indicadores, textos de estado com contraste e superfícies legíveis. Compatibilidade com os módulos que ainda usam classes do tema antigo, preservando prévias explicitamente escuras.
- Navegação móvel com atalhos e menu pesquisável, foco pelo teclado, fechamento por Escape e restauração do foco. Atalhos respeitam o conjunto de links da conta, inclusive no acesso restrito.
- Tipografia dos módulos: rótulos antes em 8–10 px passaram a 11 px. Controles móveis e campos têm altura mínima adequada ao toque. Grades de quatro/cinco indicadores passam a duas colunas em telas estreitas.
- Clientes: ações em linhas que se adaptam à largura, busca flexível, estados traduzidos e indicadores compactos com rolagem horizontal no celular.
- Atendimento: lista e conversa ocupam a largura disponível; sacola/conta do cliente acessível no celular; CRM do lead sempre acessível. O arquivo do lead tem alternância entre dados/jornada e conversas no celular.
- Altura da conversa calculada com o espaço disponível e o viewport visual; barra de atalhos se recolhe quando o navegador informa abertura do teclado. Corrigida a diferença de renderização inicial das permissões de notificação entre servidor e navegador. A regra de permissão de notificações existente foi preservada.
- Diálogos de cobrança, clientes, integrações, importação e configurações recebem contenção de foco e rolagem em telas baixas.
- Pagamento de plano: desconto identificado como desconto da compra; falha de integração, pagamento em análise, confirmação e checkout encerrado têm apresentações distintas. Mensagens não inferem recusa bancária sem diagnóstico do provedor. Detalhes de armazenamento ficam recolhidos e o resumo tem superfícies claras.
- Lojas: abertura compacta no celular, busca funcional a partir do produto, termo preservado no catálogo e contexto de acompanhamento preservado na URL.
- Removidos avaliações/depoimentos fictícios, parcelamento fixo sem base na configuração e marcas de pagamento não vinculadas à disponibilidade real. Condições efetivas continuam no checkout. Imagem ausente usa uma apresentação menor no celular.
- Carrinho com foco contido, retorno ao botão de origem e área segura inferior; carregamento público com texto adequado à página.

## Validação

- 704 testes em 89 arquivos aprovados, incluindo cobrança, permissões, integração, histórico e testes novos de apresentação de status. Os testes da antiga paleta foram atualizados para exigir contraste mínimo de 4,5:1 dos rótulos brancos nas ações.
- ESLint dos módulos compartilhados e arquivos de interação alterados: sem erros.
- Revisão automatizada local com Playwright e dados fictícios: 320, 360, 390, 430, 768, 1024 e 1440 px para clientes, componentes de indicadores/tabela, cobrança e atendimento. Nenhum controle cortado nos resultados finais dessas amostras.
- Verificados abrir/fechar controle de cliente, menu pesquisável, sacola móvel, abas do arquivo do lead e Escape. Diálogo de cliente também inspecionado em 390 × 600 px.
- Lojas/produtos: amostra pública da Vision Business Group e estado indisponível do checkout da BuffaloMass. Busca preserva o termo e os parâmetros de organização/acompanhamento. Operações de escrita da revisão visual foram bloqueadas e nenhum pagamento foi enviado.
- Conferência adicional no servidor de produção local: loja, produto e checkout indisponível nas sete larguras, sem erros de JavaScript ou transbordamento horizontal; busca de produto funcionando. Preços longos se ajustam em 320 px. Login e cadastro conferidos em 320, 390 e 1440 px.
- Arquivos e rota temporários de revisão foram removidos antes da compilação de produção. Evidências locais em `.codex-screens/ui-refresh/`.

As larguras foram emuladas em Chromium. Isso não equivale a um teste físico de Safari/iPhone ou Android, nem à inspeção manual de cada uma das 70 rotas com todos os dados possíveis. A cobertura ampla vem dos componentes compartilhados, da revisão de código e dos testes; a revisão visual usa as amostras descritas acima.

## Teste de Pix da BuffaloMass

O checkout antigo retornou “loja temporariamente indisponível” na revisão. A alteração visual não libera contas suspensas e não modifica permissões financeiras. Confirmar a situação publicada antes do pagamento real: se a loja continuar indisponível, regularizar a conta proprietária antes de tentar a compra na loja.

Compilação de produção aprovada. Publicação segue pela integração do GitHub com o Vercel; conferir o status da implantação antes do teste real.
