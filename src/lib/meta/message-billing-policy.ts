// Official WhatsApp message billing rules shared by server and panels.
// Money here is always BRL (reais), never AI credits.

export type MetaBillingMode = "customer_meta" | "connectyhub_credit_line";
export type MetaMessageCategory = "marketing" | "marketing_lite" | "utility" | "authentication" | "authentication-international" | "service";

export const META_MESSAGE_CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marketing",
  marketing_lite: "Marketing (lite)",
  utility: "Utilidade",
  authentication: "Autenticação",
  "authentication-international": "Autenticação internacional",
  service: "Atendimento",
};

export const META_MESSAGE_CATEGORY_HINTS: Record<string, string> = {
  marketing: "Campanhas, promoções e disparos em massa",
  utility: "Confirmações, lembretes e avisos de pedido",
  authentication: "Códigos de verificação",
  service: "Respostas livres em até 24h após o contato escrever",
};

export const META_BILLING_MODE_LABELS: Record<MetaBillingMode, string> = {
  customer_meta: "Cliente paga a Meta (cartão na conta Meta)",
  connectyhub_credit_line: "Faturado pela ConnectyHub (saldo em reais)",
};

export function metaBillingMode(value: unknown): MetaBillingMode {
  return value === "connectyhub_credit_line" ? "connectyhub_credit_line" : "customer_meta";
}

/** Category the send is expected to be billed in: template category, or service for free-form replies. */
export function expectedMessageCategory(type: string, templateCategory?: unknown): MetaMessageCategory {
  if (type !== "template") return "service";
  const value = String(templateCategory ?? "").toLowerCase();
  if (value === "utility") return "utility";
  if (value === "authentication") return "authentication";
  return "marketing";
}

/** Meta status.pricing object, normalized. Absent or malformed pricing returns null. */
export function statusPricing(value: unknown): { billable: boolean | null; type: string | null; category: string | null; pricing_model: string | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" && record[key] ? String(record[key]).slice(0, 60) : null);
  const pricing = { billable: typeof record.billable === "boolean" ? record.billable : null, type: text("type"), category: text("category"), pricing_model: text("pricing_model") };
  return pricing.billable === null && !pricing.type && !pricing.category ? null : pricing;
}

export type MetaMessageBillingCode = "balance_insufficient" | "debt" | "rate_missing" | "sender_not_found" | "unavailable";

export const META_MESSAGE_BILLING_MESSAGES: Record<MetaMessageBillingCode, string> = {
  balance_insufficient: "Saldo do WhatsApp oficial insuficiente. Recarregue em Saldo e créditos para continuar enviando.",
  debt: "Há uma diferença de cobrança pendente no saldo do WhatsApp oficial. Recarregue para regularizar antes de enviar.",
  rate_missing: "Ainda não há tarifa cadastrada para este destino ou tipo de mensagem. Fale com o suporte da ConnectyHub.",
  sender_not_found: "Número oficial não encontrado nesta empresa.",
  unavailable: "Não foi possível conferir o saldo do WhatsApp oficial. Nada foi enviado; tente novamente.",
};

export function metaMessageBillingCode(errorMessage: string | undefined | null): MetaMessageBillingCode {
  const text = String(errorMessage ?? "");
  if (text.includes("META_MESSAGE_BALANCE_INSUFFICIENT")) return "balance_insufficient";
  if (text.includes("META_MESSAGE_DEBT")) return "debt";
  if (text.includes("META_MESSAGE_RATE_MISSING")) return "rate_missing";
  if (text.includes("META_MESSAGE_SENDER_NOT_FOUND")) return "sender_not_found";
  return "unavailable";
}

export class MetaMessageBillingError extends Error {
  constructor(public code: MetaMessageBillingCode) {
    super(META_MESSAGE_BILLING_MESSAGES[code]);
    this.name = "MetaMessageBillingError";
  }
}

/** Maximum a campaign may cost: every pending recipient billed at the template category price. */
export function campaignCostEstimate(recipients: number, unitPriceBrl: number | null) {
  if (unitPriceBrl === null || !Number.isFinite(unitPriceBrl) || unitPriceBrl < 0) return null;
  return Math.round(Math.max(0, recipients) * unitPriceBrl * 10000) / 10000;
}

export function formatBrl(value: number | string | null | undefined, precise = false) {
  const amount = Number(value ?? 0);
  return (Number.isFinite(amount) ? amount : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: precise ? 4 : 2,
  });
}
