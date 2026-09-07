/** Shared commercial rules for ConnectyHub and each seller. Monetary arithmetic uses cents. */
export const campaignIntervals = [
  "week",
  "month",
  "quarter",
  "semester",
  "year",
] as const;
export type CampaignInterval = (typeof campaignIntervals)[number];
export const intervalLabels: Record<CampaignInterval, string> = {
  week: "Semanal",
  month: "Mensal",
  quarter: "Trimestral",
  semester: "Semestral",
  year: "Anual",
};
export type CampaignOperation =
  "initial" | "renewal" | "reactivation" | "upgrade";
export type CampaignStage = {
  cycles: number;
  kind: "percent" | "price";
  value: number;
};
export type CampaignOption = {
  id: string;
  interval: CampaignInterval;
  price: number;
  permanentDiscount: number;
};
export type CampaignConfig = {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: "draft" | "active" | "paused";
  targetIds: string[];
  originIds: string[];
  audience: "all" | "new" | "existing" | "inactive" | "selected";
  buyerIds: string[];
  operations: CampaignOperation[];
  stages: CampaignStage[];
  options: CampaignOption[];
  maxUses: number;
  message: string;
};
export type CampaignPricing = {
  version: 1;
  campaign_id: string;
  campaign_revision: number;
  name: string;
  option_id: string;
  interval: CampaignInterval;
  cycle: number;
  list_price_brl: number;
  price_brl: number;
  renewal_price_brl: number;
  next_price_brl: number;
  discount_brl: number;
  remaining_cycles: number;
  stages: CampaignStage[];
  recurring: boolean;
};
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function moneyCents(value: unknown) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > 10000000 ||
    Math.abs(number * 100 - Math.round(number * 100)) > 0.000001
  )
    throw new Error("Informe um valor válido, com até duas casas decimais.");
  return Math.round(number * 100);
}
function percent(value: unknown) {
  const n = moneyCents(value) / 100;
  if (n >= 100) throw new Error("O desconto deve ser menor que 100%.");
  return n;
}
const strings = (v: unknown, max = 300) => {
  if (
    !Array.isArray(v) ||
    v.length > max ||
    v.some((x) => typeof x !== "string" || !x.trim() || x.length > 120)
  )
    throw new Error("Selecione os produtos, planos e clientes válidos.");
  return [...new Set(v.map((x) => (x as string).trim()))];
};
export function parseCampaign(input: unknown): CampaignConfig {
  const r = object(input),
    name = String(r.name ?? "").trim(),
    description = String(r.description ?? "").trim();
  const starts = Date.parse(String(r.startsAt)),
    ends = Date.parse(String(r.endsAt));
  if (
    !name ||
    name.length > 100 ||
    description.length > 500 ||
    !Number.isFinite(starts) ||
    !Number.isFinite(ends) ||
    ends <= starts
  )
    throw new Error("Informe nome e validade da campanha.");
  if (!["draft", "active", "paused"].includes(String(r.status)))
    throw new Error("Estado de campanha inválido.");
  if (
    !["all", "new", "existing", "inactive", "selected"].includes(
      String(r.audience),
    )
  )
    throw new Error("Público inválido.");
  const operations = strings(r.operations, 4) as CampaignOperation[];
  if (
    !operations.length ||
    operations.some(
      (x) => !["initial", "renewal", "reactivation", "upgrade"].includes(x),
    )
  )
    throw new Error("Selecione quando a oferta pode ser usada.");
  const targetIds = strings(r.targetIds),
    buyerIds = strings(r.buyerIds ?? []),
    originIds = strings(r.originIds ?? []);
  if (!targetIds.length || (r.audience === "selected" && !buyerIds.length))
    throw new Error("Selecione os participantes da campanha.");
  if (!Array.isArray(r.options) || !r.options.length || r.options.length > 5)
    throw new Error("Configure pelo menos uma opção de pagamento.");
  const options = r.options.map((v) => {
    const o = object(v);
    const interval = o.interval as CampaignInterval;
    if (!campaignIntervals.includes(interval))
      throw new Error("Período inválido.");
    const price = moneyCents(o.price) / 100,
      permanentDiscount = percent(o.permanentDiscount ?? 0);
    if (price <= 0 || priceAfterDiscount(price, permanentDiscount) < 0.01)
      throw new Error("O preço do período deve ser maior que zero.");
    return { id: interval, interval, price, permanentDiscount };
  });
  if (new Set(options.map((o) => o.id)).size !== options.length)
    throw new Error("Não repita o período de pagamento.");
  if (!Array.isArray(r.stages) || r.stages.length > 12)
    throw new Error("Configure até 12 etapas de desconto.");
  const stages: CampaignStage[] = r.stages.map((v) => {
    const s = object(v),
      cycles = Number(s.cycles),
      kind = s.kind;
    if (
      !Number.isInteger(cycles) ||
      cycles < 1 ||
      cycles > 120 ||
      !["percent", "price"].includes(String(kind))
    )
      throw new Error("Cada etapa precisa de 1 a 120 cobranças.");
    const value =
      kind === "percent" ? percent(s.value) : moneyCents(s.value) / 100;
    if (
      kind === "price" &&
      (value <= 0 || options.some((o) => value > o.price))
    )
      throw new Error(
        "O preço promocional deve ser positivo e não superar o preço normal.",
      );
    return { cycles, kind: kind as CampaignStage["kind"], value };
  });
  const maxUses = Number(r.maxUses ?? 1);
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100)
    throw new Error("Limite de usos inválido.");
  const message = String(r.message ?? "").trim();
  if (message.length > 1000)
    throw new Error("Use até 1.000 caracteres no aviso.");
  const result = {
    name,
    description,
    startsAt: new Date(starts).toISOString(),
    endsAt: new Date(ends).toISOString(),
    status: r.status as CampaignConfig["status"],
    targetIds,
    originIds,
    audience: r.audience as CampaignConfig["audience"],
    buyerIds,
    operations,
    options,
    stages,
    maxUses,
    message,
  };
  for (const option of options)
    for (let i = 0; i <= stages.reduce((n, s) => n + s.cycles, 0); i++)
      if (campaignCyclePrice(option, stages, i) < 0.01)
        throw new Error("O desconto não pode zerar a cobrança.");
  return result;
}
export function priceAfterDiscount(price: number, discount: number) {
  const cents = moneyCents(price);
  return (cents - Math.round((cents * discount) / 100)) / 100;
}
export function campaignCyclePrice(
  option: CampaignOption,
  stages: CampaignStage[],
  cycle: number,
) {
  if (!Number.isInteger(cycle) || cycle < 0)
    throw new Error("Período de cobrança inválido.");
  const regular = priceAfterDiscount(option.price, option.permanentDiscount);
  let end = 0;
  const stage = stages.find((s) => {
    end += s.cycles;
    return cycle < end;
  });
  return stage
    ? Math.min(
        regular,
        stage.kind === "price"
          ? stage.value
          : priceAfterDiscount(option.price, stage.value),
      )
    : regular;
}
export function quoteCampaign(
  id: string,
  revision: number,
  config: CampaignConfig,
  optionId: string,
  cycle = 0,
  recurring = true,
): CampaignPricing {
  const option = config.options.find((o) => o.id === optionId);
  if (!option) throw new Error("Escolha um período disponível.");
  if (!recurring && config.stages.reduce((n, s) => n + s.cycles, 0) > 1)
    throw new Error("Descontos em várias cobranças exigem uma assinatura.");
  const price = campaignCyclePrice(option, config.stages, cycle);
  return {
    version: 1,
    campaign_id: id,
    campaign_revision: revision,
    name: config.name,
    option_id: option.id,
    interval: option.interval,
    cycle,
    list_price_brl: option.price,
    price_brl: price,
    renewal_price_brl: priceAfterDiscount(
      option.price,
      option.permanentDiscount,
    ),
    next_price_brl: recurring
      ? campaignCyclePrice(option, config.stages, cycle + 1)
      : 0,
    discount_brl: (moneyCents(option.price) - moneyCents(price)) / 100,
    remaining_cycles: recurring
      ? Math.max(0, config.stages.reduce((n, s) => n + s.cycles, 0) - cycle - 1)
      : 0,
    stages: config.stages,
    recurring,
  };
}
export function isCampaignEligible(
  config: CampaignConfig,
  context: {
    targetId: string;
    originId?: string;
    buyerId: string;
    previousPurchase: boolean;
    inactive: boolean;
    operation: CampaignOperation;
    uses: number;
    now?: number;
  },
) {
  const now = context.now ?? Date.now();
  return (
    config.status === "active" &&
    now >= Date.parse(config.startsAt) &&
    now < Date.parse(config.endsAt) &&
    config.targetIds.includes(context.targetId) &&
    config.operations.includes(context.operation) &&
    context.uses < config.maxUses &&
    (!config.originIds.length ||
      config.originIds.includes(context.originId ?? "")) &&
    (config.audience === "all" ||
      (config.audience === "new" && !context.previousPurchase) ||
      (config.audience === "existing" && context.previousPurchase) ||
      (config.audience === "inactive" && context.inactive) ||
      (config.audience === "selected" &&
        config.buyerIds.includes(context.buyerId)))
  );
}
export function campaignPriceNotice(pricing: CampaignPricing) {
  const currency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (!pricing.recurring)
    return `${pricing.name}: ${currency(pricing.price_brl)} nesta compra.`;
  let offset = 0;
  const stages = pricing.stages.flatMap((stage) => {
    const start = Math.max(offset, pricing.cycle),
      end = offset + stage.cycles;
    offset = end;
    if (end <= pricing.cycle) return [];
    const amount = Math.min(
      pricing.renewal_price_brl,
      stage.kind === "price"
        ? stage.value
        : priceAfterDiscount(pricing.list_price_brl, stage.value),
    );
    return [`${end - start} cobrança(s) de ${currency(amount)}`];
  });
  return `${pricing.name}: ${currency(pricing.price_brl)} nesta cobrança. ${stages.length ? "Programação a partir de agora: " + stages.join("; depois ") + ". " : ""}Próxima cobrança ${intervalLabels[pricing.interval].toLowerCase()}: ${currency(pricing.next_price_brl)}. Após as etapas promocionais: ${currency(pricing.renewal_price_brl)} por período.`;
}
