type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const paymentEvents = new Set(["payment_pending", "payment_approved", "payment_rejected", "payment_canceled", "payment_refunded"]);

export function subscriptionNoticeType(status: string) {
  if (status === "canceled") return "subscription_canceled";
  if (status === "paused") return "subscription_paused";
  return status === "pending" ? "subscription_pending" : "billing_update";
}

export function accessPeriodNotice(periodEnd: Date | null, now: Date) {
  if (!periodEnd || !Number.isFinite(periodEnd.getTime())) return null;
  if (now >= periodEnd) return "paid_access_ended" as const;
  return periodEnd.getTime() - now.getTime() <= 86400000 ? "paid_access_ending" as const : null;
}

export function canonicalPaymentNoticeKey(paymentId: string | null, eventType: string, original: string) {
  return paymentId && paymentEvents.has(eventType) ? `billing:payment:${paymentId}:${eventType}` : original;
}

export function accountNoticeMetadata(payload: unknown, metadata: RecordValue, appUrl: string) {
  const stored = record(payload);
  const result = { ...metadata };
  for (const key of ["purchase_kind", "automatic_topup", "purchase_product_id", "commercial_terms"]) {
    if (stored[key] !== undefined) result[key] = stored[key];
  }
  const terms = record(result.commercial_terms);
  const credits = Number(terms.included_credits ?? 0);
  const isTopup = result.automatic_topup === true || (result.purchase_kind === "product" && terms.billing_cycle === "one_time" && credits > 0);
  if (isTopup) {
    result.credit_topup = true;
    result.credit_amount = credits;
    result.checkout_url = `${appUrl}/dashboard/creditos`;
    result.checkout_public_url = result.checkout_url;
  } else if (result.purchase_kind === "product") {
    result.checkout_url = text(stored.checkout_url) ?? text(metadata.checkout_url) ?? `${appUrl}/dashboard/meus-produtos`;
    result.checkout_public_url = text(stored.checkout_public_url) ?? (String(result.checkout_url).startsWith("/") ? `${appUrl}${result.checkout_url}` : result.checkout_url);
  }
  return result;
}

export function buildAccountCreditNotice(input: { eventType: string; amountBrl: number; metadata: RecordValue }, customer: string) {
  const m = input.metadata;
  const url = text(m.checkout_public_url) ?? text(m.checkout_url) ?? "/dashboard/creditos";
  const credits = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(Number(m.credit_amount ?? 0));
  const amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.amountBrl);
  if (input.eventType === "credit_topup_enabled") return `${customer}, sua recarga automática foi autorizada: ${credits} créditos por ${amount}, quando o saldo chegar a ${Number(m.threshold_credits ?? 0).toLocaleString("pt-BR")} créditos, dentro do valor mensal autorizado. Acompanhe ou desative em ${url}.`;
  if (input.eventType === "credit_topup_disabled") return `${customer}, sua recarga automática foi desativada. Os atendimentos continuam enquanto houver saldo. Para comprar créditos ou autorizar novamente, acesse ${url}.`;
  if (input.eventType === "credit_topup_action_required") {
    const reason = m.reason === "monthly_cap" ? "o valor mensal autorizado para compras automáticas foi atingido" : m.reason === "card_unavailable" ? "o cartão autorizado está indisponível" : "as condições do pacote mudaram e precisamos de uma nova autorização";
    return `${customer}, sua recarga automática precisa de atenção: ${reason}. Esta verificação não realizou uma nova cobrança. Confira seu saldo e as opções de recarga em ${url}.`;
  }
  const recharge = m.automatic_topup === true ? "recarga automática" : "recarga";
  if (input.eventType === "payment_approved") return `${customer}, sua ${recharge} foi confirmada: ${credits} créditos adicionados à conta, por ${amount}. Acompanhe o saldo em ${url}.`;
  if (input.eventType === "payment_pending") return `${customer}, o pagamento da sua ${recharge} está em conferência. Não repita a cobrança. Avisarei quando houver confirmação. Acompanhe em ${url}.`;
  if (input.eventType === "payment_refunded") return `${customer}, o estorno do pagamento da sua ${recharge} foi confirmado. Confira o saldo atualizado e o histórico em ${url}.`;
  if (input.eventType === "payment_canceled") return `${customer}, o pagamento da sua ${recharge} foi cancelado. Confira o saldo e as opções para continuar em ${url}.`;
  if (input.eventType === "payment_rejected") return `${customer}, não foi possível concluir sua ${recharge}. Confira o cartão e a autorização antes de uma nova tentativa. Seus atendimentos continuam enquanto houver saldo. Acesse ${url}.`;
  return `${customer}, houve uma atualização na sua ${recharge}. Confira os detalhes e o saldo em ${url}.`;
}
