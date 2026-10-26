export const cardManagementConsentVersion = "connectyhub-card-default-v1";
export const cardManagementConsent = "Autorizo usar este cartão nas próximas renovações do plano, com até uma tentativa por dia nos três dias anteriores ao vencimento. Se minhas recargas automáticas já autorizadas usam o cartão substituído, elas passarão a usar este cartão, mantendo os limites atuais. Salvar ou tornar padrão não realiza cobrança agora e não altera meu plano, ciclo ou vencimento.";
export function cardManagementConsentFor(autoChargeDisabled?: boolean) {
  return autoChargeDisabled
    ? "Defino este cartão como padrão para cobranças. Se minhas recargas automáticas já autorizadas usam o cartão substituído, elas passarão a usar este cartão, mantendo os limites atuais. A cobrança automática da mensalidade continuará desativada. Salvar não realiza cobrança agora."
    : cardManagementConsent;
}
