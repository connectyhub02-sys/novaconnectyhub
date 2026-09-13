# Cortesia e negação de pagamento após checkout — 13/09/2026

## Incidente observado

O reteste após `de51657` confirmou que a alteração do carrinho chegou ao mesmo pedido e o checkout de cartão foi entregue. A falha seguinte ocorreu na continuidade: “blz obrigado” virou confirmação do fechamento; uma dúvida recebeu pedido de identificação de produto; “mas nem paguei ainda” foi classificada como relato de pagamento e criou uma revisão financeira com pausa da IA.

A consulta de produção encontrou uma única evidência nessa revisão, do tipo relato textual, originada nessa frase negativa. O pedido ativo permanecia pendente, com checkout de cartão criado. A constatação identifica o falso relato; não equivale a confirmação de recebimento, recusa ou ausência de débito no banco do cliente. Evidências privadas ficam em arquivos locais ignorados pelo Git.

## Correções

- Cortesia acompanhada de agradecimento não deixa um “blz” ou “sim” residual como autorização. Comandos explícitos na mesma mensagem continuam válidos.
- Um checkout entregue encerra a validade da prévia anterior. Perguntas de outro assunto e despedidas não podem encaminhar uma resposta curta ao fechamento antigo. Preservados resumos divididos em bolhas, escolha de pagamento e retomada explícita após esclarecimento comercial.
- Alegações da IA sobre alteração são substituídas pelo conteúdo do pedido salvo durante uma dúvida. Uma revisão realmente pendente continua exigindo seu dado faltante; o texto do modelo não grava itens nem comprova uma alteração.
- Evidência de pagamento considera negação, adiamento e incerteza por trecho. “Nem paguei” não abre revisão; “não paguei, mas foi debitado” continua sendo relato a conferir. Comprovantes não aprovam pagamentos automaticamente.

## Validação e operação

Testes cobrem a sequência real de revisão, checkout, agradecimentos, dúvida e negação, além de contrapontos com autorização explícita, débito relatado, revisão financeira legítima já existente e isolamento entre conversas. I/O financeiro e WhatsApp são simulados; os testes não efetuam cobranças nem enviam mensagens.

Validação final aprovada: **2.512 testes em 188 arquivos**, 148 casos novos, TypeScript, ESLint e revisão independente. O reparo operacional passou em cinco simulações PGlite com o trigger real, incluindo rollback por evidência adicional, atendimento humano assumido, tentativa incerta e pausa de outra origem. Publicação em andamento. Não há migration de esquema neste pacote. A revisão incorreta já persistida exige reparo operacional separado e restrito: preservar evidência/histórico, impedir aviso financeiro enganoso e conferir que pedidos, itens, sessões e tentativas permaneçam inalterados. Não fechar revisões legítimas com base em uma negação posterior. A conversa ainda não está liberada para reteste nesta etapa.
