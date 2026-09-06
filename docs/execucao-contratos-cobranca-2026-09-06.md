# Execução: cobrança e acesso ConnectyHub

Data: 06/09/2026. Escopo aprovado no plano de cobrança, produtos e bloqueio integral.

## Implementação

- Catálogo de planos com pagamento único ou recorrente, período semanal/mensal/trimestral/anual e duração explícita do plano avulso. Preço e condições ficam registrados no contrato; alterações no catálogo não alteram a compra anterior.
- Compra própria de produtos ConnectyHub dentro do painel, com contrato independente, checkout Pix/cartão e conteúdo privado administrável. Produtos avulsos pagos permanecem em **Meus produtos** durante suspensão do plano. Créditos comprados não expiram junto com o bônus de teste.
- Decisão central por contrato, empresas dependentes, vencimento e hora exata. Preservada a política vigente: avisos desde D−3 e três dias de carência. Contratos cancelados e planos avulsos terminam ao final do período sem carência artificial ou nova dívida.
- Guardas no servidor, painel, banco, API, loja, checkout, envio dos agentes, publicações e entrega de webhooks. A integração por chave existente também consulta o contrato. Retomada preserva revogações administrativas e restaura somente pausas financeiras elegíveis.
- Renovação transacional por período, itens avulsos excluídos dos próximos ciclos e pagamento conciliado uma única vez. Cartão avulso não cria assinatura externa. Retentativa de uma fatura recorrente utiliza a cobrança existente; troca para Pix também preserva essa cobrança.
- Confirmação financeira baseada no provedor e validação de valor/referências. Evento tardio não desfaz quitação. Comprovante não libera recursos. Reembolso parcial sem identificação dos itens abre conferência; não revoga automaticamente compras sem relação com ele.
- Avisos com trava contra duplicação, retentativas limitadas e registro de resultado incerto. Pix disponível no checkout e, após geração confirmada, no botão de copiar enviado pelo agente da plataforma. Eventos, avisos e acesso aos produtos alimentam a jornada do cliente autenticado e o arquivo do lead com telefone verificado.

## Validação

- Build de produção Next.js concluído.
- 80 arquivos / 600 testes da implementação inicial aprovados: cobrança avulsa, renovação, prazo exato, idempotência, RLS com sessão antiga, isolamento contratual, biblioteca, preservação de créditos comprados, avisos e arquivo do lead. Mais três testes cobrem a apresentação da fatura vencida, exclusão de faturas quitadas e falha na consulta financeira.
- Migrações 0082–0092 ensaiadas no banco real com transação e **rollback**, incluindo execução do arquivo de jornada. Foram corrigidas diferenças entre os índices reais de conversas e o modelo inicial de teste.
- Prévia sobre 581 organizações: 2 internas, 5 contratos ativos, 1 em carência, 1 contrato vencido, 1 trial vigente, 569 trials vencidos e 2 cadastros pendentes. Organizações não equivalem a usuários: um titular pode possuir várias empresas.
- Nenhum registro de entrega de token direto do provedor foi encontrado nas 49 instâncias consultadas. A exportação pelo painel do cliente foi restringida; isso não comprova inexistência de cópias antigas feitas por outros meios.

| Conta | Decisão na conferência | Fim da carência, Brasília |
|---|---|---|
| BuffaloMass | Bloqueio devido | 05/09/2026, 20:17:33 |
| Betel Leiloes | Em carência | 09/09/2026, 17:23:32 |
| Imobiliaria guilherme pilger | Ativa | 22/09/2026, 09:39:56 |

## Limites da comprovação

Os testes automatizados usam provedores simulados. Não foi digitado cartão nem liquidada uma compra real da própria ConnectyHub nesta execução. Aprovação, recebedor, conciliação, entrega do WhatsApp e liberação precisam ser conferidos juntos no teste operacional de quitação. Não confundir pagamento de um lead à loja de um cliente com pagamento da assinatura à ConnectyHub.

Pagamentos com resultado incerto ficam retidos para conciliação, sem segunda cobrança automática. Reembolsos parciais exigem identificar os itens atingidos na conferência humana. Envios já aceitos externamente antes do vencimento não podem ser desfeitos pela autorização interna.

## Publicação

Migrações 0082–0092 aplicadas em transação e confirmadas no Supabase em 06/09/2026. Commit inicial `f87cad8` publicado na `master`, com Vercel em estado Ready e domínio de produção atribuído.

Na conferência em produção, a sessão da BuffaloMass foi redirecionada para regularização, com apenas Meus produtos e Pagamento do plano no menu. A biblioteca e o checkout próprio da assinatura abriram com a conta suspensa. A fatura existente de R$ 497 foi identificada para exibição em destaque, sem criar outra cobrança. O ajuste complementar inclui esse acesso direto na página de planos.

Foram arquivados 83 eventos financeiros históricos. O contexto financeiro do cliente contém a suspensão do contrato e a regra de confirmação pelo sistema. A chamada anônima à função de concessão de créditos foi recusada com código `42501`.
