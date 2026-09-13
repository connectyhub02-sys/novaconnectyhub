# Reteste de retomada das vendas — 12/09/2026

A publicação anterior das revisões de pedido foi concluída, mas o titular relatou novas falhas em Gustavo e Luna no reteste real. A liberação anterior não comprova resolução do atendimento completo. Este registro complementa e limita o diagnóstico anterior.

## Evidência observada

- Gustavo: agradecimento pela isenção de frete interpretado como remoção de produto. A negação posterior de qualquer alteração foi interpretada como mudança de entrega. A proposta ficou sem endereço/CEP, enquanto pedido original e cadastro continuaram com esses dados. Perguntas repetidas vieram do handler de revisão, com execuções concluídas e sem revisão aplicada no banco.
- O carrinho em discussão tinha mais itens do que o pedido persistido originalmente. O início da revisão a partir do pedido antigo podia abandonar a alteração ainda não aplicada. Recuperar esse rascunho exige escopo, evidência e nova confirmação, sem reescrever silenciosamente o pedido.
- Luna: depois da confirmação, havia uma resposta gerada prometendo checkout, mas o envio continha somente um cumprimento. O reconhecimento de resumo exigia um formato restrito de linhas/quantidades; resumo em prosa podia deixar a autorização de fechamento sem correspondência. A proteção removia a promessa não executada sem fornecer a pendência útil.
- Duas respostas anteriores da Luna já estavam incompletas antes do envio. Os registros de uso mostraram raciocínio e saída consumindo praticamente todo o limite de 1.600 tokens. Isso sustenta a hipótese de esgotamento do orçamento, mas o motivo bruto de término não havia sido registrado. Saída incompleta antes do envio e corte posterior de promessa são fenômenos diferentes.
- Frete da empresa conferido diretamente no banco: entrega ativa para SC, tarifa padrão R$ 70 e isenção por subtotal a partir de R$ 800. A configuração estava salva. A cotação textual podia usar item isolado, não havia cotação na retomada sem CEP na última mensagem, e o contexto de regras não descrevia os limiares estaduais. O cálculo final deve usar o carrinho completo.

## Correção publicada

1. Separar agradecimento, negação, referência a ação concluída e solicitação efetiva, preservando comandos positivos independentes.
2. Preservar endereço confirmado durante coleta de substituição; recuperar propostas incompletas do mesmo atendimento e expor esse estado à IA.
3. Reconciliar o rascunho posterior ao pedido antigo com catálogo e histórico de prévia, apresentando nova confirmação antes de aplicar.
4. Reconhecer quantidade e confirmação em resumos em prosa; devolver uma pendência clara se o fechamento não puder ser executado.
5. Dar espaço à resposta dentro do orçamento de geração, limitar raciocínio conforme o modelo e detectar saída incompleta, sem repetição paga automática.
6. Fornecer cotação de todo o carrinho na retomada e explicitar a regra automática de frete grátis; manter isolamento entre conversas do mesmo contato.

Não é uma migração completa para ferramentas de LLM: o runtime ainda combina geração de texto e controles de comércio. Esta etapa corrige os caminhos observados e suas transições. A melhoria deve ser julgada por pedidos, alterações e entregas efetivamente registrados, não por linguagem convincente.

## Validação e limites

Validação final local: **1.942 testes aprovados em 171 arquivos**, TypeScript e ESLint dos arquivos alterados aprovados. A primeira rodada detectou uma regressão em confirmação fragmentada entre mensagens; corrigida preservando os limites dos turnos e aprovada na segunda rodada completa. A revisão independente acrescentou proteção para SKU/preço selecionado no frete, invalidação por alterações reais, endereço novo junto do aceite e gratidão mencionando produto durante uma alteração pendente. Nenhuma migration adicional necessária; utiliza a migration0132 já publicada.

Os testes usam produtos comuns fictícios e fronteiras de WhatsApp, gateway e banco simuladas. Os registros privados de investigação ficam em arquivos ignorados no diretório temporário do checkout; conteúdo de clientes e credenciais não fazem parte deste documento. Nenhuma mensagem, pedido ou cobrança foi enviada pela investigação. Reteste real continua necessário depois da implantação.

## Conferência da publicação

Complemento publicado em 12/09 às 19h18 BRT, dentro da autorização existente do titular. Commit `43740dab642908a0e244321e7bd2a0ecbede8ebd` enviado à master; Vercel `dpl_26d275stX3KLQfPhFciFeDp5p4Bj` conferida em **Ready / Latest / Production**, com o domínio principal atribuído e build de 50 segundos. O painel mostrou a mesma origem Git.

Conferência posterior somente de leitura: página inicial e login HTTP 200; Inngest HTTP 200 autenticado com 43 funções; consulta de checkout inexistente HTTP 404 esperado. Nenhuma SQL adicional aplicada nesta etapa. Recibo sanitizado em `tmp/retest-release-smoke.json`, ignorado pelo Git. O atendimento completo no WhatsApp, com uma nova resposta de Luna e Gustavo, permanece para reteste do titular na mesma conversa, sem apagar o histórico. Disponibilidade dos serviços e testes simulados não equivalem à comprovação desse atendimento real.

Este registro posterior à publicação fica local para a próxima integração, evitando outro deploy exclusivamente documental.
