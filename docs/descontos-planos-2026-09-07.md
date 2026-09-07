# Descontos dos planos ConnectyHub

Admin → Planos → Descontos do plano oferece percentuais de primeira compra e cobrança anual (0 desativa; máximo 99,99%). A prévia separa a primeira cobrança elegível e a renovação. O preço cadastrado é sempre o total do intervalo escolhido: em planos anuais, informe o preço dos 12 meses.

- Primeira compra: apenas no checkout inicial de um plano, uma vez por proprietário da conta. Abrange suas empresas; trocar de plano ou abrir uma empresa não reinicia o benefício. Pagamentos anteriores aprovados ou estornados impedem uma nova promoção. Recusas podem ser tentadas novamente no mesmo checkout. Uma reserva impede usar o benefício simultaneamente em duas empresas.
- Anual: aplica-se quando o plano é recorrente e tem intervalo anual. A renovação anual preserva o valor contratado com desconto. Não cria uma opção anual para um plano mensal; o intervalo continua sendo configurado no cadastro do plano.
- Combinação: usa o maior percentual na primeira compra, sem acumular. Nas próximas cobranças, permanece somente o desconto anual contratado, quando aplicável.
- Adicionais: não recebem o desconto do plano. Os recorrentes são somados às renovações; os avulsos só entram na cobrança atual.
- Contratos e faturas existentes não recebem mudanças retroativas ao editar o catálogo. Uma ativação manual seguida de uma renovação não é um checkout inicial promocional.

O contrato (`commercial_terms.price_brl`) mantém o preço de renovação. A fatura/pagamento guarda `plan_pricing`, preço de tabela, desconto e preço efetivo. O desconto não é perdido na edição dos adicionais nem copiado para o cálculo da renovação. Cartão e Pix usam o mesmo total da fatura. A autorização de cartão valida separadamente o valor de hoje e o de renovação, que pode ser maior.

As condições entram na jornada financeira do cliente e no contexto consultado pelo agente. A notificação da primeira cobrança informa o fim do desconto e o valor seguinte. PAN/CVV não são incluídos nessa informação.

Validação: testes de cálculo e arredondamento, elegibilidade e reserva por proprietário, recusa/reembolso, exclusão de adicionais, recorrência maior que a primeira cobrança, criação da próxima fatura pelo preço normal e acesso restrito às funções financeiras. Tela verificada em 390 e 1366 px, com prévia mensal/anual e envio dos percentuais.

Exemplo: plano mensal de R$ 100,00 com 90% de primeira compra → R$ 10,00 agora, R$ 100,00 na renovação. Plano anual de R$ 1.200,00 com desconto anual de 20% e primeira compra de 90% → R$ 120,00 no primeiro ano, R$ 960,00 nos anos seguintes.
