# Minha Conta durante regularização — 18/09/2026

O relato de produção foi reproduzido no código publicado: a master e o health
retornavam `bc3582fd`, sem a correção local. Não era uma alteração já publicada
retida em cache. O menu restrito omitia Minha Conta, o proxy redirecionava a
página para planos e o shell aplicava o bloqueio visual à conta.

Leitura direta do caso Andre Sampaio confirmou proprietário não administrador
da plataforma, contrato Scale `past_due`, organização principal `past_due` e
resolvedor `allowed=false`, motivo `paid_expired`. As organizações vinculadas
também recebem esse bloqueio do contrato responsável pela carteira. Nenhum
estado financeiro ou de acesso foi alterado na auditoria.

O hotfix inclui Minha Conta no menu lateral restrito e usa a mesma lista de
páginas de recuperação no proxy e shell. Libera `/dashboard/minha-conta` e
suas faturas, mantendo autenticação, escopo e permissões de responsável. Conta,
segurança, endereço e APIs de faturamento já possuíam exceções; suas autorizações
internas foram preservadas. Métodos de pagamento passam a listar também o
contrato vencido, com as restrições próprias de alteração ainda aplicadas.

O avatar superior continua sendo um menu, cujo item Minha conta navega para a
página. O controle recebe nome acessível explícito. Agentes, automações,
integrações e APIs operacionais continuam bloqueados pelo contrato vencido.
Os nove testes de acesso incluem cliente ativo/vencido, APIs 402, redirecionamento
dos recursos pagos, faturas, conta, métodos/endereço e visitante sem sessão.
ESLint passou. Evidência de build e publicação será acrescentada após confirmação.

Não houve cobrança, QR, tentativa de pagamento, cancelamento ou migração SQL.
A persistência dos dados do titular e demais melhorias de cartão constituem um
pacote separado, ainda não incluído neste hotfix de navegação.

Publicado: `6b02d2e74d93b8adada135ed1569c3cd04e93119`, master oficial,
Vercel success no projeto existente, health `ok` com SHA exato conferido em
18/09 às 10:20 BRT. Build webpack/TypeScript/108 páginas passou. Caso vencido
foi verificado por leitura do estado real e por testes/preview com permissões
simuladas. Posteriormente, a sessão compartilhada já autenticada como Andre
permitiu conferir o percurso real: agentes redirecionam para
`/dashboard/planos?regularizar=1`, o menu restrito mostra Minha Conta e seu clique
abre `/dashboard/minha-conta` com o perfil correto, segurança, métodos e
faturamento. A sessão real ativa da Betel também foi consultada em leitura.

Na conferência de faturas foi encontrado um defeito independente: a expressão
de UUID omitia três caracteres e um hífen do quarto grupo, rejeitando IDs
válidos como 404 antes de consultar o banco. Correção preserva a autorização e
filtros por organização nas três consultas. Quatro testes da página renderizada
cobrem IDs reais em active/past_due, entrada malformada e fatura ausente de outra
organização. Os nove testes de recuperação também passaram. Publicação desse
complemento será confirmada pelo SHA e pela abertura da fatura real do Andre.
