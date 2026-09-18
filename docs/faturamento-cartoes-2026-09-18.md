# Dados de faturamento e cartões — 18/09/2026

## Diagnóstico observado

Betel: assinatura ativa e dois cartões preservados no cofre. O novo já era o
padrão; o anterior continuava selecionável. A operação de troca concluída em
18/09 guardou token criptografado/final, mas descartou dados do titular e não
gravou bandeira/validade. Não havia linha de endereço de faturamento.
O checkout anterior mantém dados seguros do titular na metadata da assinatura;
essa fonte histórica pode ser recuperada para revisão, sem afirmar que contém
os dados enviados na última troca. Os dados dessa última submissão não foram
recuperados nem reconstruídos.

## Comportamento implementado

- Adicionar/trocar cartão persiste nome, e-mail, telefone, documento, CEP e número
  em área privada da organização. São sugestões de faturamento; um endereço e
  contato já confirmados não são sobrescritos. Sem confirmação anterior, a UI
  carrega a sugestão e busca o CEP para revisão/complemento.
- Confirmar grava endereço completo e contato reutilizável. Checkout e cadastro
  de cartão reaproveitam o confirmado. A edição recusa versões antigas com 409;
  as identidades de organização/ator vêm da sessão. CPF/CNPJ completo permanece
  privado; o evento da jornada comercial usa documento mascarado e o proprietário
  da organização, inclusive quando um administrador altera o cartão.
- Novo cartão aparece como padrão imediatamente; anteriores permanecem listados
  quando ainda selecionáveis. A ação de escolher outro padrão aparece somente
  no não padrão quando há mais de um cartão disponível e dentro da validade
  conhecida. Cartões legados sem metadata são identificados honestamente; a
  validação final permanece no servidor. Layout móvel empilha texto e ação.
- Nome completo do cartão, PAN, CVV, token, QR ou código Pix não são copiados ao
  perfil, sugestão ou jornada. O cofre financeiro existente mantém apenas seu
  token criptografado; bandeira, final e validade compõem a identificação segura.
- Contratos `past_due` podem manter seus cartões sem reativar acesso pago,
  mudar vencimento, status, valores ou criar cobranças. Cancelados e operações
  financeiras em andamento continuam protegidos pelos guardas existentes.

## Validação e publicação

106 testes em dez arquivos passaram: acesso ativo/vencido, escopo e privacidade,
contato, validade, replay, defaults, rollback, conflito de versão, consentimento,
orquestração sem cobrança duplicada e DDL/RPCs reais em PGlite. Nove testes SQL
foram repetidos após acrescentar a origem explícita de recuperação histórica.
ESLint aprovado. Prévia local usa componentes reais e chamadas simuladas: conta
vencida navegável, menu superior, estado ativo, dados carregados após troca,
revisão/salvamento, preenchimento posterior, preservação do confirmado, cartões
anteriores e mudança de padrão. Layout 390px revisado. A rejeição de edição antiga
foi comprovada em testes de rota/SQL, não no ensaio de interação da prévia.
Prévia removida antes da publicação. Nenhum formulário real de cartão foi enviado.

Migration 0157: backup privado verificado; ensaio com rollback confirmou
privilégios privados/RLS e hashes inalterados de assinaturas, pagamentos,
faturas, cartões, carteiras e transações de crédito. Aplicada às 10:32 BRT;
version 0157 e as duas colunas novas conferidas. Recuperação da Betel ensaiada
com rollback e aplicada em transação: sugestão `checkout_recovery`, quatro campos
de contato e CEP/número, endereço ainda não confirmado. Hashes financeiros
permaneceram iguais. Build webpack/TypeScript/108 páginas e ESLint passaram.
A confirmação da publicação será registrada após o deploy.

## Pagar agora — diagnóstico, ainda não implementado

A ação existente abre o checkout. O worker de renovação usa o cartão padrão
dentro de sua janela agendada, com claim próprio; isso não é um serviço de
retentativa manual para toda fatura. Antes de expor débito direto manual, exigir
identidade da cobrança, valor/revisão confirmados, idempotência, guardas para
aprovada/cancelada/substituída/processando e conciliação dos efeitos/lead.
Cobranças antigas canceladas/substituídas não podem ser recriadas como tentativa.
Nenhum novo endpoint ou botão de cobrança direta foi adicionado neste pacote.
