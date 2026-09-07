# Campanhas e benefícios — implementação

Data: 7 de setembro de 2026. Plano de referência: `plano-campanhas-comerciais-2026-09-07.md`.

## Onde configurar

- Admin: `/admin/campanhas-comerciais`, para planos e produtos próprios de venda direta da ConnectyHub.
- Empresa: `/dashboard/campanhas-comerciais`, para produtos e assinaturas próprios da empresa selecionada. A conta precisa ter acesso operacional ativo.

O editor permite escolher produtos/planos, público (primeira compra, compradores anteriores, inativos, selecionados ou todos), operações (contratação, renovação, reativação e upgrade), janela de adesão, limite de utilizações e etapas com percentual ou preço final. Cada etapa informa quantos períodos de cobrança dura. Opções semanal, mensal, trimestral, semestral e anual possuem seu preço total de referência e desconto permanente próprio. O simulador apresenta a sequência e o valor posterior.

Um período semestral pago corresponde a seis meses de acesso. Não corresponde a seis cobranças mensais. Produtos avulsos não recebem programação de várias mensalidades. O valor promocional não altera o preço base do catálogo. As condições aceitas são congeladas no contrato; editar ou encerrar a campanha afeta novas adesões.

## Cobrança e continuidade

O servidor verifica produto, comprador, empresa, versão, validade e utilização. Usa uma campanha por contratação e não soma descontos automaticamente. Frete e adicionais ficam separados. A promoção de loja não muda o preço de um produto revendido da plataforma.

Recusa, reenvio de Pix e repetição de webhook não consomem um período promocional. Somente confirmação financeira autoritativa avança a sequência. No fim das etapas, a próxima fatura usa o preço regular contratado e registra o encerramento do benefício.

As lojas passam a ter contratos recorrentes próprios, períodos e cancelamento da renovação. Cada checkout comporta uma assinatura; produtos avulsos podem acompanhar a primeira compra e não reaparecem automaticamente nas renovações. Cartão recorrente exige autorização explícita no checkout e token protegido vinculado à conta recebedora. Pix exige o pagamento de cada período pelo comprador. A rotina verifica renovações a cada cinco minutos e usa as tentativas diárias D−3, D−2 e D−1 quando há autorização válida. Conta suspensa não inicia operações; conciliação financeira de pagamentos anteriores continua.

Trocas preservam o tempo restante já pago, acrescentando sua duração ao novo período; não fazem estorno ou abatimento monetário proporcional automático. Cobrança anterior precisa ser retirada no provedor antes de aceitar outra condição. Se há processamento ou resposta inconclusiva, o sistema suspende novas tentativas e registra a necessidade de conferência. Ao trocar uma oferta em uma renovação de loja, um novo pedido conserva o vínculo financeiro original. Contratos antigos com recorrência nativa ainda ativa no provedor exigem migração financeira antes de aceitar uma nova campanha.

## Jornada, agentes e divulgação

Ofertas públicas aparecem no catálogo, produto e carrinho com suas condições. Campanhas reservadas a compradores selecionados ficam fora da publicidade pública. O checkout identificado verifica elegibilidade e registra a seleção e as condições contratadas. Os agentes consultam campanhas da empresa, contratos, períodos pagos, próxima cobrança e eventos; as condições ainda não contratadas são apresentadas como ofertas sujeitas à conferência do checkout.

Eventos de exposição, clique, aplicação, revisão de pedido, confirmação financeira, cancelamento e fim do benefício alimentam a jornada correspondente. O cliente direto da ConnectyHub pertence à jornada financeira da plataforma; o lead da loja permanece isolado na empresa. Comprovante enviado pelo comprador não confirma recebimento.

O editor inclui prévia e agendamento da divulgação pelo canal WhatsApp autorizado, com seleção explícita de destinatários, limites do canal e nova conferência de elegibilidade/versão antes do envio. Salvar uma campanha não envia mensagens. O registro distingue programação, submissão ao canal e necessidade de revisão; submissão não é confirmação de entrega.

## Validação desta entrega

- 692 testes passaram em 87 arquivos, incluindo os testes reais das funções SQL com PGlite.
- Compilação de produção e verificação TypeScript aprovadas.
- As migrações 0095–0105 foram executadas primeiro em transação com `ROLLBACK` no banco conectado, sem alterar dados definitivamente durante essa conferência.
- Interface conferida em desktop e 390 px, incluindo edição, simulação, validação de percentual e prévia da divulgação com dados fictícios.
- Nenhuma campanha comercial foi ativada, nenhum anúncio foi enviado e nenhuma cobrança real foi criada para validar esta implementação. Aprovação bancária, entrega real de WhatsApp e execução futura do ciclo completo dependem de uma contratação autorizada e dos retornos dos respectivos serviços; não são comprovadas pela suíte local.

As tabelas novas usam RLS e não concedem escrita financeira aos papéis públicos. APIs e funções SQL conferem o proprietário. As migrações não alteram preços de contratos anteriores nem criam adesões para usuários existentes.
