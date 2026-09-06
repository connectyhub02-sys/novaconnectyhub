# Checkout transparente — entrega e homologação

Implementação local do plano aprovado em `plano-checkout-transparente-connectyhub.md`. A captura própria de cartão **ainda não foi ativada em produção**. A integração disponível nesta sessão é de produção; a homologação real em Sandbox e a validação aplicável à captura de cartões estão pendentes.

## Publicação autorizada em 06/09/2026

Após a entrega local do commit `7a4ab78`, o usuário autorizou a publicação mesmo com a habilitação de cartão pendente. As migrações `0076` e `0077` foram aplicadas juntas em uma transação no banco de produção, registradas no histórico de migrações e acompanhadas da atualização do cache de schema.

A publicação do código não habilita a captura própria: nenhuma referência de validação foi criada e nenhuma loja foi ativada. Cartão fica indisponível nas lojas ainda não habilitadas; não há redirecionamento automático para o checkout externo. A homologação Sandbox e a validação aplicável continuam necessárias para liberar pagamentos reais por cartão.

## Implementação

- Formulário de cartão na página ConnectyHub, com identificação do pedido reaproveitada, parcelas e opção de titular diferente. A API Asaas processa a cobrança; o navegador permanece na loja.
- O pedido existente continua sendo a referência para itens, dados pessoais, frete e valor. Revisões e travas persistentes impedem pagar um total antigo ou modificar itens durante uma cobrança de resultado desconhecido.
- Adicionar/remover ofertas atualiza itens e totais numa transação e recalcula o frete. Pagamentos anteriores são conferidos/encerrados antes de mudar o valor. Uma criação concorrente de Pix impede a alteração do carrinho.
- A tentativa de cartão é registrada antes da chamada financeira. Duas abas e solicitações repetidas recuperam a tentativa em andamento. Timeout de cobrança exige conciliação, sem repetir o débito automaticamente. Falha anterior à cobrança, na consulta do cliente, permite nova tentativa segura.
- Webhook autenticado e tarefa de conciliação consultam o provedor. Parcelas são conferidas pelo total, quantidade e referência; liquidação parcial não confirma a compra inteira. Um resultado antigo não desfaz aprovação ou estorno já registrados.
- Estoque do cartão transparente: atualização e marcador de processamento na mesma transação, evitando uma segunda baixa após falha e repetição da tarefa. Comissões e atendimento após pagamento continuam nas rotinas existentes.
- Ofertas na loja, produto, carrinho, checkout e confirmação. A configuração permite escolher superfícies, produto principal, categoria e subtotal mínimo. A disponibilidade, as variações, o preço e o recebedor são conferidos; nenhuma oferta paga vem pré-selecionada.
- Recusas recentes são compartilhadas entre páginas e agente. A janela atual é de 24 horas. O agente recebe também as seleções e remoções, sem reiniciar a negociação quando o cliente já pediu para pagar.
- Upsell posterior gera um pedido adicional, vinculado ao original e ao mesmo lead, com dados pessoais reaproveitados e pagamento próprio. Repetir o aceite recupera o mesmo pedido adicional. A compra original permanece confirmada.
- Pix continua disponível dentro da estrutura, conforme a configuração da loja, inclusive após a pessoa ter escolhido cartão.

## Arquivo do lead

Os eventos comerciais reutilizam a atribuição de organização, lead, conversa, visitante, sessão, pedido e origem já existente. Visualizações, cliques, produtos, ofertas, mudanças de carrinho e tentativas entram na linha do tempo. O carrinho de navegação continua no armazenamento da loja e envia snapshots com produtos e quantidades ao servidor; o agente recebe esse contexto para conferir o pedido existente antes de criar outro.

O aceite/remoção de itens no checkout, a criação do upsell, o início e o resultado da cobrança e a baixa de estoque são registrados no servidor. Não dependem de a aba continuar aberta. Os registros financeiros são transacionais; o histórico de navegação depende da disponibilidade do navegador e da rede.

A ficha técnica reaproveita dispositivo, navegador, sistema, IP e última interação. Localização por IP é aproximada; GPS depende da autorização e disponibilidade do navegador. Eventos sem contexto novo não apagam o snapshot anterior do carrinho.

Número completo do cartão, CVV e tokens de cartão não entram nos eventos, CRM, filas ou armazenamento da aplicação no navegador. A resposta pública usa apenas campos necessários ao estado do pagamento. Auditorias de webhook e metadados de rastreamento têm filtragem de campos sensíveis. O formulário é limpo após a tentativa; o widget do agente fica oculto enquanto o formulário de pagamento está em foco.

## Validação feita

Verificação local em 06/09/2026: **478 testes aprovados**, ESLint sem erros e build de produção aprovado. A política de scripts também foi verificada com `next start`, além do servidor de desenvolvimento.

- Suite automatizada com rotas e regressões do projeto, integração com respostas simuladas do Asaas e transações PostgreSQL executadas com PGlite.
- Casos de concorrência por pedido, revisão/valor divergente, timeout, resultado repetido/fora de ordem, estorno, estoque com rollback, isolamento de produtos entre lojas, seleção/remoção de ofertas e repetição do upsell.
- Chromium em 360, 390 e 1440 pixels: formulário, recusa, limpeza de campos, política de scripts com nonce e ausência de dados de cartão nos eventos/armazenamento.
- Ensaio de interação em 390 pixels: adicionar/remover oferta recalcula total e frete; timeout mantém uma única solicitação financeira e bloqueia nova cobrança em outra aba.
- TypeScript, ESLint, build de produção e geração/auditoria da documentação da API.

Os ensaios de navegador interceptam requisições financeiras e usam cartões fictícios. Eles não representam uma transação homologada junto ao Asaas. Nenhuma cobrança real foi feita para validar esta entrega.

## Implantação

1. Homologar em ambiente separado com integração Asaas **Sandbox** e webhook correspondente. Não trocar a integração da loja que está atendendo clientes por uma conta de testes.
2. Aplicar, em ordem, as migrações `0076_transparent_checkout_attempts.sql` e `0077_commerce_offer_history.sql`. Conferir os RPCs, permissões `service_role` e atualização do cache de schema.
3. Na organização de homologação, configurar `sales_catalog_checkout_capabilities.transparent_card_enabled` e uma `validation_reference` que identifique a validação. A tabela não permite habilitar sem essa referência e não é acessível ao navegador.
4. Verificar no Sandbox: aprovação, recusa, parcelas, resultado incerto, confirmação por webhook com a aba fechada, concorrência, frete, troca Pix/cartão e sessão hospedada antiga. Conferir pedido, estoque e eventos do mesmo lead no CRM.
5. Confirmar a validação aplicável à infraestrutura que recebe os dados do cartão. A captura própria está no escopo PCI DSS; a implementação de controles de código não constitui certificação. [Orientação do Asaas](https://docs.asaas.com/docs/pci-dss-1).
6. Após homologação, aplicar as migrações em produção e liberar inicialmente uma organização com referência da validação. Publicar código e ativação como uma liberação coordenada. Conferir o registro da função de conciliação no Inngest.
7. Ampliar a ativação por loja após conferir os resultados do piloto.

**Não publicar a substituição do fluxo antes dessa preparação.** O formulário próprio está desabilitado por padrão; publicar somente o código deixaria o cartão indisponível nas lojas ainda não habilitadas. Não há retorno silencioso ao checkout externo. Os links internos existentes continuam apontando ao mesmo pedido depois da liberação.

Débito direto e assinaturas não são convertidos em crédito avulso. Upsell de um clique com cartão salvo permanece desabilitado: a versão entregue exige um novo aceite e pagamento. A tokenização de produção depende de habilitação do Asaas. [Capacidades documentadas](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito).
