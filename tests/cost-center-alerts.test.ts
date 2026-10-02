import { describe, expect, it } from "vitest";
import { computeCostCenterAlerts, persistCostCenterAlerts } from "../src/lib/billing/cost-center-alerts";
import { buildCostCenterMonth, type CostCenterMonthRaw, type CostCenterUsageRow } from "../src/lib/billing/cost-center-report";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as Subscription from "../src/lib/elevenlabs/subscription";

const row = (overrides: Partial<CostCenterUsageRow>): CostCenterUsageRow => ({
  provider: "gemini", feature_code: "chat_completion", model_id: "gemini-3.6-flash", billing_mode: "customer_billable",
  events: 10, charged_events: 10, input_tokens: 0, output_tokens: 0, cached_tokens: 0, thoughts_tokens: 0, characters: 0,
  credits: 0, cost_brl_registered: 0, cost_usd: 0, ...overrides,
});
const raw = (overrides: Partial<CostCenterMonthRaw> = {}): CostCenterMonthRaw => ({
  from: "", to: "", credit_flow: [], fixed_costs: [{ cost_key: "elevenlabs_subscription", name: "ElevenLabs", provider: "elevenlabs", currency: "USD", monthly_amount: 22, allocation: "platform", capacity_units: null, quota_units: null, quota_unit: "character" }],
  cash: { invoices_paid_brl: 0, invoices_paid: 0, payments_without_invoice_brl: 0, refunded_brl: 0 },
  snapshot: { wallet_balance_credits: 0, wallet_reserved_credits: 0, connected_instances: 0, paying_organizations: 0 },
  settings: { usd_brl_reference: { rate: 5 } },
  // Healthy reply at 5x, weak lead analysis at 2x.
  usage: [row({ credits: 1000, cost_usd: 0.4 }), row({ feature_code: "lead_analysis", credits: 500, cost_usd: 0.4 })],
  ...overrides,
});

describe("daily cost center alerts", () => {
  it("flags margin below target, weak features, missing tariffs, voice quota and invoice deviations", () => {
    const month = buildCostCenterMonth("2026-10", raw({ missing_rates: [{ feature_code: "ai_traffic_manager", model_id: null, events: 2 }] }));
    const previous = buildCostCenterMonth("2026-09", raw({ invoices: [{ provider: "gemini", currency: "USD", amount: 1.2, notes: null }] }));
    const alerts = computeCostCenterAlerts(month, { used: 85000, limit: 100000, share: 0.85 }, previous);
    expect(alerts.map(alert => alert.kind)).toEqual(["feature_margin", "missing_rate", "voice_quota", "invoice_deviation"]);
    expect(alerts[0].summary).toContain("Análise do lead: 2.5x");
    expect(alerts[2].title).toBe("Franquia ElevenLabs em 85%");
    expect(alerts[3].title).toContain("difere 50%");
  });

  it("stays quiet when volume is too small or everything is healthy", () => {
    expect(computeCostCenterAlerts(buildCostCenterMonth("2026-10", raw({ usage: [row({ credits: 10, cost_usd: 0.1 })] })), { used: 1, limit: 100, share: 0.01 })).toEqual([]);
    const lowMultiplier = buildCostCenterMonth("2026-10", raw({ usage: [row({ credits: 300, cost_usd: 1.2 })] }));
    expect(computeCostCenterAlerts(lowMultiplier).map(alert => alert.kind)).toEqual(["margin", "feature_margin"]);
  });

  it("records each alert once per day", async () => {
    const stored: Array<Record<string, unknown>> = [];
    const client = { from: () => ({
      select: () => ({ eq: () => ({ eq: (_column: string, source: string) => ({ maybeSingle: async () => ({ data: stored.find(item => item.source_id === source) ?? null, error: null }) }) }) }),
      insert: async (value: Record<string, unknown>) => { stored.push(value); return { error: null }; },
    }) };
    const alerts = [{ key: "margin", kind: "margin" as const, title: "t", summary: "s" }];
    expect(await persistCostCenterAlerts(client as never, alerts, "2026-10-02")).toBe(1);
    expect(await persistCostCenterAlerts(client as never, alerts, "2026-10-02")).toBe(0);
    expect(await persistCostCenterAlerts(client as never, alerts, "2026-10-03")).toBe(1);
    expect(stored[0]).toMatchObject({ event_type: "cost_center.alert", scope: "platform", source_id: "2026-10-02:margin", payload: { kind: "margin" } });
  });
});

describe("monthly reconciliation", () => {
  it("compares estimates with registered invoices and recomputes the result", () => {
    const month = buildCostCenterMonth("2026-09", raw({ invoices: [{ provider: "elevenlabs", currency: "USD", amount: 22, notes: null }, { provider: "gemini", currency: "BRL", amount: 5, notes: null }] }));
    expect(month.reconciliation).toEqual([
      { provider: "gemini", label: "Google Gemini", estimatedBrl: 4, invoicedBrl: 5, deviation: 0.25 },
      { provider: "elevenlabs", label: "ElevenLabs", estimatedBrl: 110, invoicedBrl: 110, deviation: 0 },
    ]);
    // Received 0 − (Gemini invoice 5 + ElevenLabs 110).
    expect(month.invoicedResultBrl).toBe(-115);
    expect(buildCostCenterMonth("2026-09", raw()).invoicedResultBrl).toBeNull();
  });
});

describe("ElevenLabs quota", () => {
  it("reads characters used against the plan limit", () => {
    const { parseElevenLabsSubscription } = serverModuleHarness<typeof Subscription>("src/lib/elevenlabs/subscription.ts");
    expect(parseElevenLabsSubscription({ tier: "creator", character_count: 25000, character_limit: 100000, next_character_count_reset_unix: 1793000000 }, new Date("2026-10-02T00:00:00Z")))
      .toEqual({ tier: "creator", used: 25000, limit: 100000, share: 0.25, resetsAt: new Date(1793000000 * 1000).toISOString(), checkedAt: "2026-10-02T00:00:00.000Z" });
    expect(parseElevenLabsSubscription({ character_count: 1, character_limit: 0 })).toBeNull();
    expect(parseElevenLabsSubscription(null)).toBeNull();
  });
});
