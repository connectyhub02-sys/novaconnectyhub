# Renovação dos contratos pelo Asaas

Implementação de 06/09/2026. A ConnectyHub passa a controlar as tentativas de renovação, sem criar novas assinaturas automáticas no provedor.

## Comportamento

- Uma tentativa diária em D−3, D−2 e D−1, a partir das 09h em America/Sao_Paulo, no processamento periódico existente. Não há tentativa automática no dia do vencimento.
- A confirmação interrompe as tentativas. O pagamento antecipado preserva o período já adquirido e renova o período seguinte.
- Ao vencer sem confirmação, o acesso operacional é suspenso, incluindo APIs. Permanecem disponíveis a regularização e os produtos avulsos adquiridos. As configurações são preservadas.
- Avisos, tentativas e resultados integram a jornada financeira do cliente e o contexto consultado pelo agente. O motivo de uma recusa não é inventado.
- Trocar a fatura para Pix interrompe as tentativas automáticas daquela fatura. Sua confirmação não ativa o cartão de uma tentativa recusada.
- Produtos e contratos avulsos não entram na renovação automática.

## Cobrança e dados do cartão

O checkout solicita autorização expressa e versionada para o calendário antecipado. A tokenização ocorre antes do primeiro débito; o token criptografado só é ativado após a aprovação daquela tentativa. PAN e CVV não são gravados no banco, nos eventos nem no CRM. A tabela de credenciais só permite acesso pelo serviço.

As tentativas diárias reutilizam a mesma fatura e a mesma cobrança externa. Há reserva transacional e unicidade por contrato, período e dia. Erros inconclusivos mantêm a cobrança em conferência: uma resposta perdida nunca autoriza outro débito. Webhooks são autenticados e reconciliados com consulta ao provedor. Eventos antigos não são usados para atribuir uma recusa a uma tentativa mais recente.

O PagBank foi desativado para novas cobranças, inclusive com barreira nos adaptadores. Os registros históricos e a conciliação de transações existentes são preservados. Contratos antigos sem acordo externo foram direcionados para o Asaas. Acordos externos existentes não são substituídos silenciosamente; um contrato com acordo externo não recebe tentativas concorrentes.

## Migração e validação

Migração: `0093_managed_asaas_renewals.sql`. Atualiza a política para três dias anteriores e zero dias de tolerância após o vencimento. Ensaio no banco real executado em transação com rollback antes da publicação.

Validação: 622 testes em 82 arquivos, verificação TypeScript, ESLint dos arquivos alterados e build de produção. Os testes cobrem calendário brasileiro, autorização, uma tentativa por dia, mesma fatura, resposta incerta, aprovação, Pix, isolamento das credenciais, bloqueio e ausência de renovação de avulsos.

## Dependência operacional

A conta de produção do Asaas precisa ter tokenização habilitada. Essa habilitação não foi confirmada nesta execução, e nenhum débito real foi disparado para testar o recurso. Sem tokenização/autorização válida, não há tentativa automática. Cartões salvos no PagBank não são transferidos ao Asaas: o cliente deve cadastrar e autorizar o cartão no checkout da ConnectyHub.

Documentação oficial consultada:

- https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito
- https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito
- https://docs.asaas.com/reference/pagar-uma-cobranca-com-cartao-de-credito
- https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito
