# Continuidade do checkout e recuperação do Pix

## Problema e correção

O frete grátis retornava a string `R$ 0,00`. A prévia mostrava o total correto, mas a validação utilizava um conversor de valores de cobrança que rejeita zero em strings. Assim, o aceite do cliente voltava à mesma confirmação. O runtime agora aceita zero somente no cálculo do frete; uma cobrança continua exigindo valor positivo.

Respostas como “gostei, pode finalizar” passam a autorizar o fechamento quando existe um resumo recente. Perguntas, recusas, alterações e decisões adiadas não autorizam cobrança. O aceite do endereço salvo é vinculado à conversa, ao endereço e à mensagem de confirmação, persistido no lead e limitado à janela do checkout. Mudanças de destino e novas conversas invalidam esse aceite.

O fechamento reserva um identificador de pedido derivado da organização, lead, conversa e mensagem do resumo. A chave primária existente impede que workers concorrentes criem dois pedidos para o mesmo resumo. Os itens precisam estar salvos antes da criação do pagamento. Cobranças Pix existentes e válidas são reutilizadas. Tentativas em conferência, pagas ou com referência externa que ainda precisa ser resolvida não dão origem a outra cobrança automaticamente.

A geração e o envio são etapas distintas. Uma resposta livre da IA não pode substituir a execução do pagamento. Falhas de geração retornam uma resposta controlada e acionam o fluxo humano existente. Entrega incerta no WhatsApp é registrada e encaminhada para conferência, sem enviar automaticamente outro formato. O formato nativo com resumo, copiar Pix e checkout permanece; os fallbacks já existentes continuam disponíveis para rejeições definitivas do formato.

As etapas e falhas recebem vínculo com lead, pedido, conversa e execução. A última etapa também fica nos metadados do lead para o contexto do agente. O resumo da execução usa o texto efetivamente entregue, em vez do rascunho da IA.

## Escopo e validação

- Alteração no runtime compartilhado dos agentes da ConnectyHub, sem condição específica para uma loja ou cliente.
- Sem migração de banco: usa campos JSON existentes e a chave primária do pedido.
- 26 testes específicos de recuperação: frete zero, consentimento natural, preservação/invalidação do endereço, repetição, concorrência, falha do gateway e entrega incerta.
- Suíte completa: 98 arquivos, 772 testes aprovados (`npx vitest run --maxWorkers=4`).
- Build de produção, TypeScript e lint dos arquivos alterados aprovados.
- Fixtures antigas foram atualizadas para o cartão nativo de Pix e para a consulta de contrato personalizado já existente.
- Apenas dados fictícios e provedores simulados nos testes. Nenhuma cobrança real ou mensagem a clientes foi produzida para validar esta alteração.

## Limites operacionais

O recebimento financeiro continua dependendo do resultado confirmado pelo provedor. Confirmação de envio da mensagem não significa pagamento recebido. Tentativas externas com resultado incerto exigem consulta/conferência; esta correção não limpa bloqueios financeiros nem cancela cobranças existentes automaticamente.
