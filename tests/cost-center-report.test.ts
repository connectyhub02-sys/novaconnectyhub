import { describe, expect, it } from "vitest";
import { buildCostCenterMonth, costCenterMonthRange, currentCostCenterMonth, type CostCenterMonthRaw, type CostCenterUsageRow } from "../src/lib/billing/cost-center-report";
import { joinPromptSections, measurePromptSections } from "../src/lib/whatsapp/prompt-sections";

const row = (overrides: Partial<CostCenterUsageRow>): CostCenterUsageRow => ({
  provider: "gemini", feature_code: "chat_completion", model_id: "gemini-3.6-flash", billing_mode: "customer_billable",
  events: 0, charged_events: 0, input_tokens: 0, output_tokens: 0, cached_tokens: 0, thoughts_tokens: 0, characters: 0,
  credits: 0, cost_brl_registered: 0, cost_usd: 0, ...overrides,
});

const raw = (overrides: Partial<CostCenterMonthRaw> = {}): CostCenterMonthRaw => ({
  from: "2026-09-01T03:00:00Z", to: "2026-10-01T03:00:00Z",
  usage: [
    row({ events: 10, charged_events: 10, input_tokens: 200_000, cached_tokens: 50_000, credits: 400, cost_usd: 0.6 }),
    row({ feature_code: "lead_analysis", events: 10, charged_events: 10, credits: 100, cost_usd: 0.2 }),
    row({ feature_code: "external_ai_generation", events: 5, charged_events: 5, credits: 300, cost_usd: 0.5 }),
    row({ provider: "elevenlabs", feature_code: "voice_reply_whatsapp", model_id: "eleven_multilingual_v2", events: 4, charged_events: 4, characters: 1000, credits: 240, cost_usd: 0.1 }),
    row({ billing_mode: "trial_billable", events: 2, charged_events: 2, credits: 50, cost_usd: 0.1 }),
    row({ billing_mode: "internal_shadow", events: 1, credits: 20, cost_usd: 0.05 }),
  ],
  credit_flow: [{ origin: "paid_plan", transactions: 1, credits: 25000 }, { origin: "consumed", transactions: 30, credits: -1110 }],
  cash: { invoices_paid_brl: 497, invoices_paid: 1, payments_without_invoice_brl: 30, refunded_brl: 7 },
  snapshot: { wallet_balance_credits: 10000, wallet_reserved_credits: 0, connected_instances: 5, paying_organizations: 2 },
  settings: { usd_brl_reference: { rate: 5, as_of: "2026-10-02" }, credit_target_markup: { value: 4 } },
  fixed_costs: [
    { cost_key: "vps", name: "VPS", provider: "vps", currency: "USD", monthly_amount: 20, allocation: "platform", capacity_units: null, quota_units: null, quota_unit: null },
    { cost_key: "uazapi", name: "UAZAPI", provider: "uazapi", currency: "BRL", monthly_amount: 138, allocation: "per_instance", capacity_units: 100, quota_units: null, quota_unit: null },
    { cost_key: "elevenlabs_subscription", name: "ElevenLabs", provider: "elevenlabs", currency: "USD", monthly_amount: 22, allocation: "platform", capacity_units: null, quota_units: 10000, quota_unit: "character" },
  ],
  ...overrides,
});

describe("cost center monthly truth", () => {
  it("reprices USD cost at the reference rate and separates cash from charged credits", () => {
    const month = buildCostCenterMonth("2026-09", raw());
    expect(month.fxUsdBrl).toBe(5);
    // ElevenLabs costs the subscription, not the per-character table: 0.6+0.2+0.5+0.1+0.05 USD.
    expect(month.variable.costUsd).toBeCloseTo(1.45, 6);
    expect(month.variable.costBrl).toBe(7.25);
    expect(month.fixed.totalBrl).toBe(100 + 138 + 110);
    expect(month.cash.receivedBrl).toBe(520);
    expect(month.result.cashResultBrl).toBe(520 - 7.25 - 348);
    expect(month.charged.customerCredits).toBe(1040);
    expect(month.charged.customerChargedBrl).toBe(10.4);
    expect(month.charged.customerCostBrl).toBe(6.5);
    expect(month.charged.multiplier).toBe(1.6);
  });

  it("measures attendance per reply without the API, voice or studio", () => {
    const { attendance } = buildCostCenterMonth("2026-09", raw());
    expect(attendance.replies).toBe(10);
    expect(attendance.creditsPerReply).toBe(50);
    expect(attendance.pricePerReplyBrl).toBe(0.5);
    expect(attendance.costPerReplyBrl).toBe(0.4);
    expect(attendance.repliesPer1000Credits).toBe(20);
    expect(attendance.cachedShare).toBe(0.25);
    expect(attendance.avgInputTokensPerReply).toBe(20000);
  });

  it("reports voice against the subscription, quota and future wallet cost", () => {
    const month = buildCostCenterMonth("2026-09", raw());
    expect(month.voice).toMatchObject({ characters: 1000, quotaUnits: 10000, quotaShare: 0.1, chargedBrl: 2.4, subscriptionBrl: 110, resultBrl: -107.6, tableCostBrl: 0.5 });
    expect(month.fixed.items.find(item => item.cost_key === "uazapi")).toMatchObject({ perUnitBrl: 1.38, usedUnits: 5 });
    expect(month.credits.flow[0]).toMatchObject({ origin: "paid_plan", label: "Inclusos em plano pago" });
    expect(month.credits.liabilityCostBrl).toBe(62.5);
  });

  it("falls back to the tariff rate and target markup when settings are missing", () => {
    const month = buildCostCenterMonth("2026-09", raw({ settings: {}, fixed_costs: [] }));
    expect(month.fxUsdBrl).toBe(6);
    expect(month.targetMarkup).toBe(4);
    expect(month.variable.costUsd).toBeCloseTo(1.55, 6);
    expect(month.notes.some(note => note.includes("ElevenLabs"))).toBe(false);
  });

  it("uses Brasília calendar months", () => {
    expect(costCenterMonthRange("2026-12")).toEqual({ from: "2026-12-01T00:00:00-03:00", to: "2027-01-01T00:00:00-03:00" });
    expect(() => costCenterMonthRange("2026-13")).toThrow();
    expect(currentCostCenterMonth(new Date("2026-10-01T02:00:00Z"))).toBe("2026-09");
    expect(currentCostCenterMonth(new Date("2026-10-01T03:00:00Z"))).toBe("2026-10");
  });
});

describe("prompt sections", () => {
  it("joins exactly like a single array and measures characters only", () => {
    const sections = [{ key: "global", lines: ["A", ""] }, { key: "agent_prompt", lines: ["PROMPT:", "texto"] }, { key: "global", lines: ["Z"] }];
    expect(joinPromptSections(sections)).toBe(["A", "", "PROMPT:", "texto", "Z"].join("\n"));
    expect(measurePromptSections(sections)).toEqual({ global: 5, agent_prompt: 14 });
  });
});
