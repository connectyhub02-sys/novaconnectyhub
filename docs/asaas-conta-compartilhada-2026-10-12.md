# Conta Asaas compartilhada entre empresas — 12/10/2026

## Pedido e causa

Titular autorizou corrigir, testar sem cobranças reais e publicar. Ele reconectará a
Pizzaria Macedo&Dias depois da publicação usando a mesma conta Asaas da BuffaloMass.
Não conectar a pizzaria em seu lugar nem criar cobranças para homologar.

Antes, cada conexão gerava um novo authToken e, em caso de webhook duplicado,
substituía o token remoto sem atualizar as outras empresas. API Keys diferentes
da mesma conta Asaas não isolam o webhook. Além disso, /myAccount não retornou um
ID de conta/carteira nessas conexões, portanto não usar nome comercial, chave de
API ou provider_account_id vazio como identidade compartilhada.

## Solução

- Descobrir o webhook pela URL exata usando a chave validada do próprio cliente.
  Usar o ID remoto desse webhook + ambiente como identidade compartilhada. Não
  aceitar ID do navegador nem reaproveitar webhook apenas por nome parecido.
- Migration 0201 mantém um token canônico criptografado por webhook. Adota os
  tokens legados, com inserção única e sem sobrescrita durante reconexão. Conexões
  simultâneas relêem o vencedor da inserção antes de configurar o token no Asaas.
- Cada organização conserva sua API Key e suas regras de acesso. O webhook não
  concede acesso de uma empresa ao painel, pedidos ou credenciais da outra.
- A leitura do segredo usa o registro compartilhado, inclusive para empresas
  legadas. Desconexão só desativa a conexão da organização e não altera o webhook
  remoto nem remove o token canônico. O registro não contém API Keys de clientes.
- Falha ao configurar o webhook interrompe a conexão nova, preservando o registro
  anterior. Continua o fallback para e-mail técnico se Asaas rejeitar o e-mail de
  contato do titular. Não cadastrar uma conexão como operacional com webhook falho.
- Conciliação consulta o pagamento no provedor e confere sua identidade/referência
  antes de atualizar a sessão. A organização vem da sessão/pedido; nunca do nome,
  e-mail do comprador ou da empresa que se conectou por último.

## Validação

135 testes em sete arquivos passaram, com TypeScript e ESLint. Incluem duas
empresas com chaves distintas, primeira conexão simultânea, reconexão, desconexão,
outro recebedor, sandbox separado, webhook homônimo com URL diferente, falhas de
provisionamento/banco e chave inválida. Os cenários BuffaloMass/Pizzaria usam seus
IDs reais, mas banco e transporte financeiro são isolados e simulados: nenhum
pagamento real foi criado, pago, cancelado ou estornado.

Teste do handler em ambos os sentidos confirmou que um pagamento atualiza somente
pedido/sessão da organização correta. Payload com referência contraditória não
troca o dono identificado pelo ID e consulta independente. Referência contraditória
no próprio registro consultado do provedor adia a conciliação sem marcar pago.
Regressões Pix, checkout hospedado, cartão e renovação também passaram.

Consulta externa somente GET em /webhooks da conta da BuffaloMass confirmou um
webhook na URL esperada, com o ID salvo, enabled=true e interrupted=false.
Asaas não expôs authToken nessa leitura; não alegar comparação do segredo remoto.
Registro compartilhado após migração foi comparado em memória com o segredo local
existente e permaneceu igual, sem exibir credenciais.
Pizzaria estava disabled e sem credencial ativa; nenhuma chamada em seu nome.

Migration aplicada/registrada em transação, após backup privado de schema em
config/before-0201-schema.sql. Adotou um webhook legado. Teste SQL com service_role
inseriu o mesmo ID duas vezes e preservou o primeiro token; transação revertida,
zero fixtures persistidas. authenticated/anon sem acesso; service_role somente
SELECT/INSERT (revogadas permissões herdadas de UPDATE/DELETE). Operações de
conexão não têm autorização SQL para rotacionar o token canônico.

## Publicação e próximo teste

Publicado em 12/10/2026 às 19h15 BRT: aplicação
`fa3d4781990c629fe45b0f282dad97889576089b`, slot a/3130; fallback
`d01a8d6e7608fb410e8f6bff74ee527a2c01ee5c`, slot b/3131. Ajuste SQL de privilégios
`d602c225` aplicado no banco; não altera o pacote da aplicação.
Build de produção passou. Smoke do candidato e do domínio público confirmou
health/SHA, login e JS 200, conexão Asaas sem sessão 401 e GET do webhook 405.
Inngest assinado retornou 200, 58 funções e authenticated=true. Consulta externa
GET após ativação confirmou BuffaloMass connected, um webhook habilitado e não
interrompido, segredo canônico igual ao legado local. Pizzaria continua disabled.

A reconexão real da Pizzaria pelo titular permanece
pendente. Depois dela, conferir o mesmo ID/token canônico nas duas integrações,
mantendo contas/empresas independentes. Entrega de confirmação de pagamento real
não foi homologada nesta etapa porque o titular proibiu criar cobranças reais.

Referências: https://docs.asaas.com/docs/sobre-os-webhooks e
https://docs.asaas.com/reference/atualizar-webhook-existente.
