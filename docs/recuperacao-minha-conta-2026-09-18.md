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
