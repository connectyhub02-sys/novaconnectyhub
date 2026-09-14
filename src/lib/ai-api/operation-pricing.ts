import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActiveBillingRates } from "@/lib/billing/metered-usage";
import { aiModelDefinition } from "./model-catalog";

export type AiUnits = Record<string, number>;
export type AiPrice = { id: string; cost: number; credits: number };
export type AiPriceCard = Record<string, AiPrice>;
type Decimal = { coefficient: bigint; scale: number };
const powerOfTen = (scale: number) => BigInt(10) ** BigInt(scale);

// Interpret the supplied quantity/rate as its decimal representation before
// multiplication. An epsilon after floating-point arithmetic would also erase
// legitimate fractions just above a microcredit boundary.
function decimal(value: number): Decimal {
  if (!Number.isFinite(value) || value < 0) throw new Error("Valor de cobrança inválido.");
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const coefficient = BigInt(integer + fraction);
  const scale = fraction.length - Number(exponent);
  return scale < 0 ? { coefficient: coefficient * powerOfTen(-scale), scale: 0 } : { coefficient, scale };
}
function addDecimal(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return { coefficient: a.coefficient * powerOfTen(scale - a.scale) + b.coefficient * powerOfTen(scale - b.scale), scale };
}
function decimalNumber(value: Decimal): number {
  const result = Number(`${value.coefficient}e-${value.scale}`);
  if (!Number.isFinite(result)) throw new Error("Valor de cobrança inválido.");
  return result;
}
function ceilCredits(value: Decimal): number {
  if (value.scale <= 6) return decimalNumber(value);
  const divisor = powerOfTen(value.scale - 6);
  return decimalNumber({ coefficient: (value.coefficient + divisor - BigInt(1)) / divisor, scale: 6 });
}
export const aiMoney = (n: number) => ceilCredits(decimal(n));
export async function loadAiPriceCard(client: SupabaseClient, modelId: string, planCode: string | null) {
  const model = aiModelDefinition(modelId);
  if (!model) throw new Error("Modelo não cadastrado.");
  const base = await resolveActiveBillingRates(client, { provider: "gemini", featureCode: "external_ai", modelId: model.providerId, planCode });
  const card: AiPriceCard = {};
  for (const rate of base) if (["input_token", "output_token"].includes(rate.unit)) {
    card[rate.unit === "input_token" ? "input" : "output"] = { id: rate.id ?? "base", cost: rate.providerCostPerUnit, credits: rate.connectyPricePerUnit };
  }
  const rows = await client.from("ai_operation_rates").select("*").in("model_id", [modelId, "*"]).eq("active", true).order("effective_from");
  if (rows.error) throw new Error("Não foi possível carregar os preços deste recurso.");
  const now = Date.now();
  const matching = (rows.data ?? []).filter(row => (!row.plan_code || row.plan_code === planCode)
    && Date.parse(row.effective_from) <= now && (!row.effective_to || Date.parse(row.effective_to) > now))
    .sort((a, b) => Number(a.model_id !== "*") - Number(b.model_id !== "*") || Number(!!a.plan_code) - Number(!!b.plan_code)
      || Date.parse(a.effective_from) - Date.parse(b.effective_from));
  for (const row of matching) card[row.meter] = { id: row.id, cost: Number(row.provider_cost), credits: Number(row.credit_price) };
  if(model.id.startsWith('pro-3.1')) {
    const long=await resolveActiveBillingRates(client,{provider:'gemini',featureCode:'external_ai_long_context',modelId:model.providerId,planCode});
    for(const rate of long)if(['input_token','output_token'].includes(rate.unit))card[rate.unit==='input_token'?'long_input':'long_output']={id:rate.id??'long',cost:rate.providerCostPerUnit,credits:rate.connectyPricePerUnit};
    if(card.long_input)card.long_cached_input={...card.long_input,cost:card.long_input.cost/10,credits:card.long_input.credits/10};
  }
  if(model.family!=='music')delete card.song;
  if(model.id!=='music-realtime-exp')delete card.audio_second;
  return card;
}

/** No guessed zero rates: an unpriced dimension blocks dispatch/settlement. */
export function priceAiUnits(card: AiPriceCard, units: AiUnits, minimum = true) {
  let cost = 0;
  let credits: Decimal = { coefficient: BigInt(0), scale: 0 };
  const breakdown: Array<{ meter: string; units: number; cost: number; credits: number; rate_id: string }> = [];
  for (const [meter, quantity] of Object.entries(units)) {
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Medição de consumo inválida.");
    if (!quantity) continue;
    const rate = card[meter];
    if (!rate || !Number.isFinite(rate.credits) || rate.credits <= 0 || !Number.isFinite(rate.cost) || rate.cost < 0) throw new Error(`Tarifa ausente para ${meter}.`);
    const amount = decimal(quantity), unitPrice = decimal(rate.credits);
    const lineCredits = { coefficient: amount.coefficient * unitPrice.coefficient, scale: amount.scale + unitPrice.scale };
    cost += quantity * rate.cost;
    credits = addDecimal(credits, lineCredits);
    breakdown.push({ meter, units: quantity, cost: quantity * rate.cost, credits: decimalNumber(lineCredits), rate_id: rate.id });
  }
  const roundedCredits = ceilCredits(credits);
  return { cost: Math.round(cost * 1e8) / 1e8, credits: minimum && breakdown.length ? Math.max(1, roundedCredits) : roundedCredits, breakdown };
}

export function addAiUnits(...items: AiUnits[]): AiUnits {
  const result: AiUnits = {};
  for (const item of items) for (const [key, n] of Object.entries(item)) result[key] = (result[key] ?? 0) + n;
  return result;
}

export function batchAiPrices(card: AiPriceCard): AiPriceCard {
  return {...Object.fromEntries(Object.entries(card).filter(([key]) => ['search','maps'].includes(key))),
    ...Object.fromEntries(Object.entries(card).filter(([key]) => key.startsWith("batch_")).map(([key, value]) => [key.slice(6), value]))};
}
