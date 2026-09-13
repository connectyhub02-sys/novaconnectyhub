# Recuperação de pagamento no mesmo pedido — 12/09/2026

## Evidência do reteste

Após a publicação da retomada de vendas, o titular conseguiu receber o checkout da Luna, tentou pagar com cartão e pediu a mudança para Pix. Depois das confirmações, o atendimento foi encaminhado para humano.

A consulta somente de leitura ao Supabase da VPS confirmou que a tentativa de cartão terminou em erro de validação no cadastro do pagador, antes da criação da cobrança. Esse registro não comprova falta de saldo nem recusa do banco. A nova tentativa de Pix recebeu do provedor a indicação de documento do pagador inválido. Durante a retomada, foi criado outro registro de pedido com os mesmos itens e total. A sessão de Pix ficou marcada como requisição em andamento apesar da falha conhecida anterior à cobrança. Não havia revisão financeira aberta para esse atendimento.

Nenhum dado pessoal, identificador de atendimento, credencial ou conteúdo de cartão foi incluído neste relatório. A consulta não criou, cancelou nem pagou cobranças e não alterou o atendimento.

## Causas encontradas

- O ciclo de pedidos excluía pedidos com pagamento falho da recuperação, embora ainda aguardassem pagamento. Uma nova confirmação podia criar outro pedido pelo identificador do novo resumo.
- A retomada exigia URL na última sessão, mas uma tentativa de cartão transparente não tem URL própria. Também agrupava recusas definitivas e pagamentos concluídos em um bloqueio genérico.
- O adaptador Pix distinguia erros anteriores à cobrança, mas a gravação da sessão descartava essa informação. O runtime tratava qualquer erro do gateway como resultado financeiro incerto e encaminhava o atendimento.
- Documento preenchido era considerado resolvido pelo tamanho, e a atualização não substituía um valor que o provedor rejeitou.
- O diagnóstico seguro da tentativa de cartão não chegava à mensagem automática do WhatsApp.
- A revisão do banco identificou lacunas na concorrência entre correção dos dados e início do pagamento, e entre duas recuperações de Pix em sessões distintas.

## Correção implementada

O fluxo passa a distinguir recuperação de pagamento de alteração dos itens. O pedido, quantidades, entrega e consentimento são preservados na troca de método. Falha conhecida anterior à cobrança permite corrigir o cadastro na própria conversa. Resultado incerto, pagamento confirmado, revisão financeira e operação concorrente continuam impedindo repetição.

A falha passa a ter metadados estruturados sem o corpo do provedor nem dados pessoais. A atualização de um campo rejeitado valida pedido, conversa, lead, sessão, revisão e estado financeiro. A nova migration reforça a proteção antes do início do gateway. Nenhuma sessão antiga é considerada segura apenas porque não possui identificador remoto: somente a combinação estrita da rejeição cadastral legada permite solicitar a correção, e o RPC revalida tudo antes de liberar aquela sessão.

O pedido ativo é obtido do estado da própria conversa, inclusive quando há um duplicado histórico. Nenhum pedido antigo é apagado ou mesclado. Repetir o dado rejeitado, informar um CPF/CNPJ inválido ou responder com outro campo mantém a solicitação de correção, sem nova cobrança nem encaminhamento automático. Nome e telefone de faturamento não alteram a identidade nem o número de roteamento do contato. Endereço permanece no fluxo próprio de revisão e recálculo do frete.

## Validação e publicação

Validação final: **2.101 testes em 175 arquivos aprovados**, TypeScript, ESLint e diff-check aprovados. São 57 cenários no novo teste de recuperação do WhatsApp, 67 testes reais da migration com PostgreSQL/PGlite, além dos testes de provedor, notificação e regressões existentes. A primeira rodada identificou uma regressão na seleção do pedido ativo, corrigida; duas fixtures antigas passaram a fornecer o snapshot financeiro agora exigido. Dois testes preexistentes sensíveis a CRLF foram resolvidos normalizando apenas quebras de linha locais, sem alteração versionada nesses arquivos. A rodada completa final passou sem falhas.

Os testes adicionados usam produtos comuns fictícios, banco local e transporte/provedor simulados. Eles não comprovam aprovação bancária ou entrega real após publicação. A transação de publicação foi executada também em PGlite, com comparação integral das tabelas de pedidos/itens/sessões/tentativas/revisões/leads e dos guardas financeiros não alterados, registro da fonte exata e bloqueio de reaplicação. As tabelas temporárias de conferência habilitam RLS e revogam acesso de public/anon/authenticated. A migração de produção e a publicação estão em conclusão.

Migration `0133_sales_catalog_payment_recovery` aplicada transacionalmente pelo SQL Editor autenticado do Supabase da VPS. O recibo confirmou dados inalterados, guardas financeiros não relacionados preservados e RPC restrito ao serviço. Consulta posterior confirmou registro único, gatilho ativo, acesso negado a anon/authenticated e permitido ao serviço. A fonte aplicada é idêntica à testada após normalização de CRLF introduzido pelo editor. A revisão automática havia impedido executar a primeira versão da transação com tabelas temporárias sem RLS; a versão ajustada habilitou RLS e revogou acesso nessas tabelas, passou novamente na validação local e foi executada sem contornar o bloqueio. Nenhuma cobrança, correção cadastral real ou mensagem foi disparada pela aplicação da migration. Publicação da aplicação ainda em conclusão.

O reteste previsto inclui cartão efetivamente recusado → Pix, cadastro inválido → correção → Pix no mesmo pedido, confirmação repetida, resultado desconhecido, pagamento confirmado, revisão humana, concorrência e isolamento entre conversas. Os registros antigos do teste precisam de recuperação sustentada por evidência; apagar o histórico não faz parte da solução.

## Publicação verificada

Único push para master em `f4fcfaaa45d763c697e4d1549157c69ff8ec6da0` (`fix: recover failed checkout payments on the same order`). Vercel `dpl_BsSwbNyXF9yuSqdp2YbxQE4Ueca4` confirmou **Ready / Latest / Production** às **21h18min20s BRT**, com o mesmo commit e domínio principal associado. Build remoto passou compilação, TypeScript e geração das 100 páginas estáticas. Conferência somente de leitura após o Ready: inicial/login HTTP 200, Inngest HTTP 200 autenticado com 43 funções, consulta de checkout inexistente HTTP 404 esperado.

Reteste liberado na mesma conversa. Se o provedor rejeitar um campo cadastral, o cliente ainda precisa informar um valor válido para gerar o Pix; a aplicação da migration não alterou valores reais nem liberou cobrança incerta. Nenhuma conversa foi apagada ou despausada e nenhum Pix/cartão/mensagem real foi gerado pela validação. A confirmação de entrega e conclusão do fluxo real depende do reteste do titular. Esta nota posterior ao push permanece local para evitar outra implantação apenas documental.
