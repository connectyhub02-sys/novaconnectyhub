export type BillingCycle = "one_time" | "recurring";
export type BillingInterval = "week" | "month" | "quarter" | "year";
export type CommercialTerms = {
  billingCycle: BillingCycle;
  billingInterval: BillingInterval;
  accessDurationDays: number | null;
};

export function readCommercialTerms(value: unknown): CommercialTerms {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const cycle = row.billing_cycle ?? row.billingCycle;
  const interval = row.billing_interval ?? row.billingInterval;
  const days = Number(row.access_duration_days ?? row.accessDurationDays);
  return {
    billingCycle: cycle === "one_time" ? "one_time" : "recurring",
    billingInterval: interval === "week" || interval === "quarter" || interval === "year" ? interval : "month",
    accessDurationDays: Number.isInteger(days) && days > 0 ? days : null,
  };
}

export function serializeCommercialTerms(terms: CommercialTerms) {
  return { billing_cycle: terms.billingCycle, billing_interval: terms.billingInterval, access_duration_days: terms.accessDurationDays };
}

export function snapshotPlanCommercialTerms(plan: Record<string, unknown>) {
  return { ...serializeCommercialTerms(readCommercialTerms(plan)), price_brl: Number(plan.monthly_price_brl ?? 0), included_credits: Number(plan.included_credits ?? 0) };
}

export function billingPeriodEnd(start: Date, terms: CommercialTerms): Date {
  const end = new Date(start);
  if (terms.billingCycle === "one_time") {
    if (!terms.accessDurationDays) throw new Error("Informe a duração do acesso do plano de pagamento único.");
    end.setUTCDate(end.getUTCDate() + terms.accessDurationDays);
  } else if (terms.billingInterval === "week") {
    end.setUTCDate(end.getUTCDate() + 7);
  } else {
    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + (terms.billingInterval === "year" ? 12 : terms.billingInterval === "quarter" ? 3 : 1));
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(day, last));
  }
  return end;
}

export function billingTermsLabel(terms: CommercialTerms) {
  if (terms.billingCycle === "one_time") return "Pagamento único";
  return { week: "Semanal", month: "Mensal", quarter: "Trimestral", year: "Anual" }[terms.billingInterval];
}

export function billingDeadline(periodEnd: string | Date | null, graceDays: number): Date | null {
  if (!periodEnd) return null;
  const timestamp = new Date(periodEnd).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + Math.max(0, graceDays) * 86_400_000);
}

export function isBillingDeadlineReached(periodEnd: string | Date | null, graceDays: number, now = new Date()) {
  const deadline = billingDeadline(periodEnd, graceDays);
  return deadline !== null && now.getTime() >= deadline.getTime();
}

export function billingLocalDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
