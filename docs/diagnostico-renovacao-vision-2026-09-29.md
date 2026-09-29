# Renovação Vision / André Sampaio — 29/09/2026

Diagnóstico solicitado pelo titular após notar plano vencido com cartão salvo.
Somente leitura de produção; nenhuma cobrança, alteração de assinatura ou
mudança de regra realizada.

## Evidências

- Perfil André Sampaio possui três organizações com nomes semelhantes a Vision;
  somente a principal, **Vision Business Group**, tem a assinatura investigada.
- Plano Scale mensal, ativado originalmente por administração, R$ 497,00;
  período registrado de 16/08/2026 a **16/09/2026, 20h24 BRT**.
  Assinatura atualmente `past_due`, Asaas, sem acordo externo.
- Fatura de renovação criada em **13/09**, valor R$ 497,00, ainda `open`;
  pagamento local `pending`, sem identificador de cobrança no provedor e sem
  data de pagamento. Zero registros em `billing_card_attempts` para a conta.
- Primeiro cadastro de cartão ativo ocorreu em **24/09/2026, 17h09 BRT**,
  oito dias depois do vencimento. Recibo em `billing_payment_method_changes`
  indica que não substituiu cartão anterior. Credencial criptografada presente;
  seu conteúdo não foi lido ou exposto.
- Avisos de renovação e vencimento constam enviados entre 13 e 16/09.
- Política global mantém cobrança automática habilitada, janela de três dias
  anteriores e zero dias de tolerância. Isso não habilita tentativa posterior.

## Causa

`managedRenewalDay` recusa períodos já vencidos e só retorna elegibilidade em
D−3, D−2 e D−1 após 09h de São Paulo. A função SQL instalada
`claim_managed_asaas_renewal` também exige assinatura ativa e a mesma janela.
Quando havia janela de tentativa, ainda não existia cartão cadastrado; quando
ele foi cadastrado, a janela já havia encerrado e a assinatura estava vencida.

O cadastro de cartão é explicitamente sem cobrança: `cardManagementConsent`
informa que salvar/tornar padrão não debita nem altera plano, ciclo ou vencimento.
Portanto, não há evidência de recusa bancária neste caso; não houve tentativa
local registrada. O caso antecede a migração da aplicação em 28/09 e não foi
causado pela falha de origem do acesso assistido corrigida em 29/09.

## Próximo passo e limites

A fatura pendente deve ser regularizada pelo checkout autenticado da própria
assinatura, com confirmação do pagamento. O cartão salvo pode servir às próximas
renovações elegíveis após regularização. Isso não garante aprovação futura pelo
emissor. Cobrar automaticamente um vencido após cadastro seria mudança de regra
e do consentimento atual, não um reparo técnico silencioso.

Nenhuma consulta direta ao extrato do Asaas, tentativa de débito, alteração de
vencimento ou liberação manual foi feita. A conclusão sobre ausência de tentativa
é sustentada pelos registros da ConnectyHub e pelas condições do código/SQL.
