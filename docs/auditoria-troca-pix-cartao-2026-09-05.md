# Troca de Pix para cartão e rastreamento do checkout

Auditoria de 05/09/2026. Este documento omite identificadores de produção, dados pessoais e credenciais.

## Causas verificadas

- Depois de oferecer cartão, a confirmação genérica do lead era resolvida pela preferência da sessão anterior (Pix). Nenhuma sessão de cartão era criada nesse caso.
- O webhook de status do Asaas sobrescrevia o código Pix salvo com `null`, porque a consulta de status não contém os dados retornados pelo endpoint de QR Code. A tentativa de reutilização terminava em `pix_code_missing` e pausa para atendimento humano.
- O checkout Asaas de cartão era criado diretamente para envio pelo WhatsApp. A página interna também tratava uma sessão de cartão pendente como pagamento já registrado, sem oferecer a continuação apropriada.
- Atualizações de uma sessão antiga podiam substituir a referência do pedido depois da troca de método.

## Correções

- Confirmações como “Sim me manda por favor” consideram a oferta de pagamento imediatamente anterior. A escolha explícita mais recente tem precedência sobre o método armazenado.
- Um pedido confirmado e ainda pendente pode continuar o pagamento depois da janela de duas horas. Pedido, dados e frete são reaproveitados.
- O botão de cartão abre um link rastreado para `/checkout/<sessão>`. O checkout hospedado do Asaas é criado ao continuar nessa página. Reenvios pelo WhatsApp preservam a passagem pela página interna.
- A página interna seleciona cartão quando essa é a preferência da sessão. A API não reutiliza uma sessão interna como se fosse uma URL do gateway, verifica o total atual e retorna erro quando o gateway está indisponível.
- Webhooks sem os dados Pix preservam os artefatos já gravados. Eventos não financeiros de sessões substituídas não alteram o checkout atual nem disparam avisos sobre o pagamento antigo. Confirmações financeiras continuam sendo processadas.
- Links de pagamento mantêm a identidade do lead, conversa, pedido e sessão gravados no servidor, mesmo com parâmetros antigos na URL.

## Gateway e CRM

A consulta à integração da loja auditada confirmou Asaas conectado em produção, com Pix e cartão de crédito habilitados. Loja e página do produto chamam o mesmo serviço de sessões de pagamento, que seleciona essa integração. O checkout público também encaminha cartão ao Asaas.

O fluxo registra criação da sessão, criação e clique no link rastreado, abertura/continuação do checkout e atualização financeira, associados ao lead e ao pedido. O tracker das páginas próprias registra navegação e interações com o contexto do lead. Interações dentro da página externa do Asaas não são observáveis pelo tracker da ConnectyHub; o estado financeiro retorna por webhook. A documentação do [Asaas Checkout](https://docs.asaas.com/docs/asaas-checkout) distingue a criação do checkout da confirmação do pagamento.

## Validação

- 445 testes aprovados, incluindo execução do runtime com respostas genéricas, troca nos dois sentidos, pedido antigo, frete preservado e reenvio do link interno.
- Testes comportamentais de criação interna versus checkout hospedado, reutilização, mudança de valor, falha do gateway, preservação de QR Code, eventos da sessão antiga e atribuição de cliques ao CRM.
- ESLint nos arquivos alterados, build de produção e auditoria das rotas de API aprovados.
- Testes de execução usam banco e provedores simulados: não enviam mensagens nem geram cobranças reais.

O teste final de recebimento do botão no WhatsApp e eventual pagamento real depende da interação do responsável pela loja após a publicação.
