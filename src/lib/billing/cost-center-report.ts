import { CONNECTY_CREDIT_UNIT_BRL, INCLUDED_CREDIT_TARGET_MARKUP, TARIFF_REFERENCE_USD_BRL } from "./credit-economics";

// Monthly truth of the cost center: what was used, what it cost in USD and BRL at
// the current reference rate, what was charged and what actually came in as cash.
// Admin-only. Taxes and payment fees are intentionally out of scope for now.

export type CostCenterUsageRow = {
  provider: string;
  feature_code: string;
  model_id: string;
  billing_mode: string;
  events: number;
  charged_events: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  thoughts_tokens: number;
  characters: number;
  credits: number;
  cost_brl_registered: number;
  cost_usd: number;
};

export type CostCenterFixedCostRow = {
  cost_key: string;
  name: string;
  provider: string | null;
  currency: "BRL" | "USD";
  monthly_amount: number;
  allocation: "platform" | "per_instance";
  capacity_units: number | null;
  quota_units: number | null;
  quota_unit: string | null;
};

export type CostCenterMonthRaw = {
  from: string;
  to: string;
  usage: CostCenterUsageRow[];
  credit_flow: Array<{ origin: string; transactions: number; credits: number }>;
  cash: { invoices_paid_brl: number; invoices_paid: number; payments_without_invoice_brl: number; refunded_brl: number };
  snapshot: { wallet_balance_credits: number; wallet_reserved_credits: number; connected_instances: number; paying_organizations: number };
  settings: Record<string, unknown>;
  fixed_costs: CostCenterFixedCostRow[];
};

export type CostCenterGroup = {
  key: string;
  label: string;
  events: number;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  costUsd: number;
  costBrl: number;
  chargedBrl: number;
  multiplier: number | null;
};

export type CostCenterMonth = {
  month: string;
  fxUsdBrl: number;
  fxAsOf: string | null;
  targetMarkup: number;
  cash: { receivedBrl: number; invoicesPaid: number; refundedBrl: number };
  variable: { costUsd: number; costBrl: number; byMode: CostCenterGroup[]; byProvider: CostCenterGroup[]; byFeature: CostCenterGroup[] };
  fixed: { totalBrl: number; items: Array<CostCenterFixedCostRow & { monthlyBrl: number; perUnitBrl: number | null; usedUnits: number | null }> };
  result: { cashResultBrl: number };
  charged: { customerCredits: number; customerChargedBrl: number; customerCostBrl: number; marginBrl: number; multiplier: number | null; costPerCreditBrl: number | null };
  attendance: { replies: number; creditsPerReply: number | null; costPerReplyBrl: number | null; pricePerReplyBrl: number | null; repliesPer1000Credits: number | null; cachedShare: number | null; avgInputTokensPerReply: number | null };
  voice: { characters: number; quotaUnits: number | null; quotaShare: number | null; chargedBrl: number; subscriptionBrl: number; resultBrl: number; tableCostBrl: number };
  credits: { flow: Array<{ origin: string; label: string; transactions: number; credits: number }>; walletBalance: number; walletReserved: number; liabilityCostBrl: number | null };
  snapshot: { connectedInstances: number; payingOrganizations: number };
  notes: string[];
};

const modeLabels: Record<string, string> = {
  customer_billable: "Clientes",
  trial_billable: "Teste grátis",
  internal_shadow: "Uso interno ConnectyHub",
  platform_absorbed: "Absorvido pela plataforma",
  free: "Isento",
  unknown: "Sem modo",
};

const providerLabels: Record<string, string> = { gemini: "Gemini", elevenlabs: "ElevenLabs" };

const originLabels: Record<string, string> = {
  purchase: "Comprados (pacotes)",
  paid_plan: "Inclusos em plano pago",
  trial: "Teste grátis",
  administrative: "Concedidos pelo admin / contrato",
  consumed: "Consumidos",
  refund: "Estornos",
  expired: "Expirados",
  administrative_removal: "Removidos pelo admin",
};

const featureLabels: Record<string, string> = {
  chat_completion: "Resposta do agente",
  lead_analysis: "Análise do lead",
  lead_memory: "Memória do lead",
  clone_memory: "Memória do agente",
  conversation_state: "Resumo e estado da conversa",
  conversation_learning: "Aprendizado da conversa",
  human_handoff_detection: "Detecção de pedido humano",
  follow_up_generation: "Follow-up",
  audio_transcription: "Transcrição de áudio",
  media_image_analysis: "Leitura de imagem",
  media_video_analysis: "Leitura de vídeo",
  media_document_analysis: "Leitura de documento",
  content_generation: "Conteúdos e campanhas",
  external_ai_generation: "API de IA",
  external_ai: "API de IA",
  voice_reply_whatsapp: "Voz no WhatsApp",
  voice_generation_audio: "Voz Gemini",
  text_to_speech: "Voz pela API/Estúdio",
  prompt_assistant: "Assistente de prompt",
};

// Everything the WhatsApp attendance pays for besides the main reply itself.
const nonAttendanceFeature = /^(external_ai|studio_|text_to_speech|voice_clone|voice_reply_whatsapp|voice_generation_audio)/;

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const money = (value: number) => Math.round(value * 100) / 100;
const precise = (value: number) => Math.round(value * 1e6) / 1e6;
const ratio = (a: number, b: number) => (b > 0 ? precise(a / b) : null);

function readNumberSetting(settings: Record<string, unknown>, key: string, field: string) {
  const value = settings[key];
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>)[field] : null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function group(rows: CostCenterUsageRow[], keyOf: (row: CostCenterUsageRow) => string, labelOf: (key: string) => string, fx: number, costOf: (row: CostCenterUsageRow) => number) {
  const groups = new Map<string, CostCenterGroup>();
  for (const row of rows) {
    const key = keyOf(row);
    const item = groups.get(key) ?? { key, label: labelOf(key), events: 0, inputTokens: 0, outputTokens: 0, credits: 0, costUsd: 0, costBrl: 0, chargedBrl: 0, multiplier: null };
    item.events += num(row.events);
    item.inputTokens += num(row.input_tokens);
    item.outputTokens += num(row.output_tokens);
    item.credits += num(row.credits);
    item.costUsd += costOf(row);
    groups.set(key, item);
  }
  return [...groups.values()].map(item => {
    const costBrl = item.costUsd * fx;
    const chargedBrl = item.credits * CONNECTY_CREDIT_UNIT_BRL;
    return { ...item, costUsd: precise(item.costUsd), costBrl: money(costBrl), chargedBrl: money(chargedBrl), credits: money(item.credits), multiplier: costBrl > 0 ? Math.round((chargedBrl / costBrl) * 100) / 100 : null };
  }).sort((a, b) => b.costBrl - a.costBrl);
}

export function buildCostCenterMonth(month: string, raw: CostCenterMonthRaw): CostCenterMonth {
  const settings = raw.settings ?? {};
  const fx = readNumberSetting(settings, "usd_brl_reference", "rate") ?? TARIFF_REFERENCE_USD_BRL;
  const fxAsOf = (() => {
    const value = settings.usd_brl_reference;
    const asOf = value && typeof value === "object" ? (value as Record<string, unknown>).as_of : null;
    return typeof asOf === "string" ? asOf : null;
  })();
  const targetMarkup = readNumberSetting(settings, "credit_target_markup", "value") ?? INCLUDED_CREDIT_TARGET_MARKUP;
  const usage = raw.usage ?? [];
  const fixedRows = raw.fixed_costs ?? [];
  const voiceSubscription = fixedRows.find(row => row.provider === "elevenlabs");
  // With a subscription and no overage, ElevenLabs costs the subscription, not the per-character table.
  const realCostUsd = (row: CostCenterUsageRow) => (voiceSubscription && row.provider === "elevenlabs" ? 0 : num(row.cost_usd));

  const variableUsd = usage.reduce((total, row) => total + realCostUsd(row), 0);
  const fixedItems = fixedRows.map(row => {
    const monthlyBrl = money(num(row.monthly_amount) * (row.currency === "USD" ? fx : 1));
    const perUnitBrl = row.allocation === "per_instance" && row.capacity_units ? precise(monthlyBrl / row.capacity_units) : null;
    return { ...row, monthly_amount: num(row.monthly_amount), monthlyBrl, perUnitBrl, usedUnits: row.allocation === "per_instance" ? num(raw.snapshot?.connected_instances) : null };
  });
  const fixedBrl = fixedItems.reduce((total, item) => total + item.monthlyBrl, 0);
  const receivedBrl = money(num(raw.cash?.invoices_paid_brl) + num(raw.cash?.payments_without_invoice_brl) - num(raw.cash?.refunded_brl));

  const customer = usage.filter(row => row.billing_mode === "customer_billable");
  const customerCredits = customer.reduce((total, row) => total + num(row.credits), 0);
  const customerCostBrl = customer.reduce((total, row) => total + realCostUsd(row), 0) * fx;
  const customerChargedBrl = customerCredits * CONNECTY_CREDIT_UNIT_BRL;

  const attendance = customer.filter(row => row.provider === "gemini" && !nonAttendanceFeature.test(row.feature_code));
  const mainReplies = attendance.filter(row => row.feature_code === "chat_completion");
  const replies = mainReplies.reduce((total, row) => total + num(row.charged_events), 0);
  const attendanceCredits = attendance.reduce((total, row) => total + num(row.credits), 0);
  const attendanceCostBrl = attendance.reduce((total, row) => total + num(row.cost_usd), 0) * fx;
  const replyInput = mainReplies.reduce((total, row) => total + num(row.input_tokens), 0);
  const replyCached = mainReplies.reduce((total, row) => total + num(row.cached_tokens), 0);
  const replyEvents = mainReplies.reduce((total, row) => total + num(row.events), 0);
  const creditsPerReply = ratio(attendanceCredits, replies);

  const voiceRows = usage.filter(row => row.provider === "elevenlabs");
  const voiceCharacters = voiceRows.reduce((total, row) => total + num(row.characters), 0);
  const voiceChargedBrl = voiceRows.filter(row => row.billing_mode === "customer_billable").reduce((total, row) => total + num(row.credits), 0) * CONNECTY_CREDIT_UNIT_BRL;
  const subscriptionBrl = voiceSubscription ? money(num(voiceSubscription.monthly_amount) * (voiceSubscription.currency === "USD" ? fx : 1)) : 0;
  const quotaUnits = voiceSubscription?.quota_units ? num(voiceSubscription.quota_units) : null;

  const costPerCredit = customerCredits > 0 ? customerCostBrl / customerCredits : null;
  const walletBalance = num(raw.snapshot?.wallet_balance_credits);
  const notes = [
    `Custos convertidos pela cotação de referência R$ ${fx.toFixed(2).replace(".", ",")}${fxAsOf ? ` (${brazilianDate(fxAsOf)})` : ""}. Registros antigos guardavam o custo a R$ ${TARIFF_REFERENCE_USD_BRL}/US$ e são reconvertidos.`,
    "Caixa = faturas pagas + pagamentos aprovados sem fatura − estornos no mês. Créditos cobrados não são dinheiro recebido.",
    "Impostos e taxas de pagamento ainda não entram nesta conta.",
  ];
  if (voiceSubscription) notes.push("ElevenLabs entra pela assinatura mensal; o custo por caractere da tabela aparece só como referência.");
  if (voiceSubscription && !quotaUnits) notes.push("Cadastre a franquia mensal da ElevenLabs para acompanhar o uso da assinatura.");

  return {
    month,
    fxUsdBrl: fx,
    fxAsOf,
    targetMarkup,
    cash: { receivedBrl, invoicesPaid: num(raw.cash?.invoices_paid), refundedBrl: money(num(raw.cash?.refunded_brl)) },
    variable: {
      costUsd: precise(variableUsd),
      costBrl: money(variableUsd * fx),
      byMode: group(usage, row => row.billing_mode, key => modeLabels[key] ?? key, fx, realCostUsd),
      byProvider: group(usage, row => row.provider, key => providerLabels[key] ?? key, fx, realCostUsd),
      byFeature: group(customer, row => `${row.provider}:${row.feature_code}`, key => { const feature = key.split(":")[1]; return featureLabels[feature] ?? (feature.startsWith("studio_") ? "Ferramentas do Estúdio" : feature); }, fx, row => num(row.cost_usd)).slice(0, 12),
    },
    fixed: { totalBrl: money(fixedBrl), items: fixedItems },
    result: { cashResultBrl: money(receivedBrl - variableUsd * fx - fixedBrl) },
    charged: {
      customerCredits: money(customerCredits),
      customerChargedBrl: money(customerChargedBrl),
      customerCostBrl: money(customerCostBrl),
      marginBrl: money(customerChargedBrl - customerCostBrl),
      multiplier: customerCostBrl > 0 ? Math.round((customerChargedBrl / customerCostBrl) * 100) / 100 : null,
      costPerCreditBrl: costPerCredit === null ? null : precise(costPerCredit),
    },
    attendance: {
      replies,
      creditsPerReply: creditsPerReply === null ? null : Math.round(creditsPerReply * 10) / 10,
      costPerReplyBrl: replies > 0 ? precise(attendanceCostBrl / replies) : null,
      pricePerReplyBrl: creditsPerReply === null ? null : money(creditsPerReply * CONNECTY_CREDIT_UNIT_BRL),
      repliesPer1000Credits: creditsPerReply ? Math.floor(1000 / creditsPerReply) : null,
      cachedShare: ratio(replyCached, replyInput),
      avgInputTokensPerReply: replyEvents > 0 ? Math.round(replyInput / replyEvents) : null,
    },
    voice: {
      characters: voiceCharacters,
      quotaUnits,
      quotaShare: quotaUnits ? ratio(voiceCharacters, quotaUnits) : null,
      chargedBrl: money(voiceChargedBrl),
      subscriptionBrl,
      resultBrl: money(voiceChargedBrl - subscriptionBrl),
      tableCostBrl: money(voiceRows.reduce((total, row) => total + num(row.cost_usd), 0) * fx),
    },
    credits: {
      flow: (raw.credit_flow ?? []).map(row => ({ origin: row.origin, label: originLabels[row.origin] ?? row.origin, transactions: num(row.transactions), credits: money(num(row.credits)) }))
        .sort((a, b) => Math.abs(b.credits) - Math.abs(a.credits)),
      walletBalance: money(walletBalance),
      walletReserved: money(num(raw.snapshot?.wallet_reserved_credits)),
      liabilityCostBrl: costPerCredit === null ? null : money(walletBalance * costPerCredit),
    },
    snapshot: { connectedInstances: num(raw.snapshot?.connected_instances), payingOrganizations: num(raw.snapshot?.paying_organizations) },
    notes,
  };
}

export function brazilianDate(isoDate: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate.split("-").reverse().join("/") : isoDate;
}

/** Calendar month in Brasília time (UTC−3, no daylight saving since 2019). */
export function costCenterMonthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Mês inválido.");
  const [year, monthIndex] = month.split("-").map(Number);
  const next = monthIndex === 12 ? `${year + 1}-01` : `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return { from: `${month}-01T00:00:00-03:00`, to: `${next}-01T00:00:00-03:00` };
}

export function currentCostCenterMonth(now = new Date()) {
  const brasilia = new Date(now.getTime() - 3 * 3600_000);
  return `${brasilia.getUTCFullYear()}-${String(brasilia.getUTCMonth() + 1).padStart(2, "0")}`;
}
