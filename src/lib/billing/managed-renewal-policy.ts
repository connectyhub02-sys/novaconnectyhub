import { billingLocalDate } from "./commercial-terms";

export const managedRenewalConsentVersion = "connectyhub-advance-3-2-1-v1";
export const managedRenewalConsent = "Autorizo as renovações do plano no cartão, com até uma tentativa por dia nos três dias anteriores ao vencimento. O pagamento antecipado preserva o período contratado. Sem confirmação até o vencimento, os serviços do plano serão suspensos.";

export function managedRenewalDay(periodEnd: string | Date | null, now = new Date()) {
  if (!periodEnd) return null;
  const end = new Date(periodEnd);
  if (!Number.isFinite(end.getTime()) || end <= now) return null;
  const today = billingLocalDate(now);
  const due = billingLocalDate(end);
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
  const hour = Number(new Intl.DateTimeFormat("en-US", {timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23"}).format(now));
  return days >= 1 && days <= 3 && hour >= 9 ? today : null;
}
