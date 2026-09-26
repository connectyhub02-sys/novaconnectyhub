import { describe, expect, it, vi } from "vitest";
import * as contactWindow from "../src/lib/automations/contact-window";
import * as returnRules from "../src/lib/automations/return-rules";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Planner = typeof import("../src/lib/automations/post-sale-planner");
type Row = Record<string, unknown>;
const day = 86400000;
const now = new Date("2026-09-26T15:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * day).toISOString();

function setup(tables: Record<string, Row[]>, options: { policy?: Row | null; catalog?: Row[]; bumps?: string[] } = {}) {
  const db = commerceDatabase(tables);
  const rpc = vi.fn(async () => ({ data: {}, error: null }));
  const persisted: Array<{ data: Row; when: Date }> = [];
  const policy = options.policy === undefined
    ? { follow_up_enabled: true, returns_enabled: true, window_start: "09:00", window_end: "20:00", timezone: "America/Sao_Paulo" } : options.policy;
  const planner = serverModuleHarness<Planner>("src/lib/automations/post-sale-planner.ts", {
    "./contact-window": contactWindow,
    "./return-rules": returnRules,
    "./dispatch": {
      loadAutomationPolicy: async () => policy,
      persistFollowUpDispatch: async (_client: unknown, data: Row, when: Date) => { persisted.push({ data, when }); return { id: "d", status: "pending" }; },
    },
    "./relationship-profile": {
      contactContext: async (_client: unknown, organizationId: string, leadId: string) => ({ organizationId, leadId, conversationId: "conversation",
        whatsappInstanceId: "instance", agentId: "agent", agentRunId: "run", referenceMessageId: "message" }),
      relatedProductScore: (a: { category: string }, b: { category: string }) => (a.category === b.category ? 3 : 0),
      sellableRecommendation: () => true,
    },
    "@/lib/client-os/sales-catalog": {
      listOrganizationSalesCatalog: async () => options.catalog ?? [],
      getOrganizationSalesCatalogSettings: async () => ({ orderBumps: { items: (options.bumps ?? []).map(productId => ({ productId, active: true })) } }),
    },
  });
  const client = Object.assign(db.client, { rpc });
  return { db, rpc, persisted, planner, client };
}

const paidOrder = (id: string, createdDaysAgo: number, extra: Row = {}) => ({ id, organization_id: "org", lead_id: "lead", payment_status: "confirmed",
  status: "paid", created_at: ago(createdDaysAgo), updated_at: ago(0), shipping_method: "Entrega local", metadata: { agent_id: "agent" }, ...extra });

describe("returns from paid orders", () => {
  it("registers a return for each product with a rule, using the store's activity default", async () => {
    const s = setup({
      sales_catalog_orders: [paidOrder("order", 1)],
      sales_catalog_payment_sessions: [{ order_id: "order", status: "approved", paid_at: ago(1) }],
      sales_catalog_order_items: [
        { organization_id: "org", order_id: "order", catalog_item_id: "pizza", title: "Pizza de calabresa" },
        { organization_id: "org", order_id: "order", catalog_item_id: "soda", title: "Refrigerante" },
      ],
      intelligence_memory: [{ id: "pizza", organization_id: "org", metadata: {} }, { id: "soda", organization_id: "org", metadata: { return_after_days: 0 } }],
      agent_registry: [{ id: "agent", organization_id: "org", metadata: { prompt_builder_config: { templateId: "pizzaria_delivery" } } }],
    });
    expect(await s.planner.planOrderReturns(s.client as never, now)).toEqual({ returns: 1 });
    expect(s.rpc).toHaveBeenCalledWith("record_customer_visit_v2", expect.objectContaining({
      p_description: "Pizza de calabresa", p_occurred: ago(1), p_return: ago(-6), p_key: "order-return:order:pizza",
      p_repeat_days: 7, p_repeat_remaining: 2, p_source: "product_rule", p_order: "order", p_item: "pizza",
    }));
  });

  it("does nothing when the owner turned returns off", async () => {
    const s = setup({ sales_catalog_orders: [paidOrder("order", 1)], sales_catalog_order_items: [{ organization_id: "org", order_id: "order", catalog_item_id: "pizza", title: "Pizza" }] },
      { policy: { follow_up_enabled: true, returns_enabled: false } });
    await s.planner.planOrderReturns(s.client as never, now);
    expect(s.rpc).not.toHaveBeenCalled();
  });
});

describe("post-sale", () => {
  const catalog = [
    { id: "whey", category: "Suplementos", billingCycle: "one_time" },
    { id: "creatine", category: "Suplementos", billingCycle: "one_time" },
    { id: "shirt", category: "Roupas", billingCycle: "one_time" },
  ];
  const tables = (orderDaysAgo: number, extra: Record<string, Row[]> = {}) => ({
    sales_catalog_orders: [paidOrder("order", orderDaysAgo)],
    sales_catalog_order_items: [{ organization_id: "org", order_id: "order", catalog_item_id: "whey", title: "Whey" }],
    ...extra,
  });

  it("asks how it went the day after a local purchase", async () => {
    const s = setup(tables(1.2), { catalog });
    expect(await s.planner.planPostSale(s.client as never, now)).toEqual({ postSale: 1 });
    expect(s.persisted[0].data).toMatchObject({ postSaleKind: "checkin", postSaleOrderId: "order" });
  });

  it("waits the usual transit before asking about a shipped order", async () => {
    const s = setup(tables(2, { sales_catalog_orders: [paidOrder("order", 2, { shipping_method: "Correios - SEDEX" })] }), { catalog });
    expect(await s.planner.planPostSale(s.client as never, now)).toEqual({ postSale: 0 });
  });

  it("suggests a complementary product ten days later, preferring the store's cart offers", async () => {
    const s = setup(tables(10.2), { catalog, bumps: ["shirt"] });
    await s.planner.planPostSale(s.client as never, now);
    expect(s.persisted[0].data).toMatchObject({ postSaleKind: "crosssell", crossSellProductId: "shirt" });
  });

  it("yields to a return the owner scheduled around the same days", async () => {
    const s = setup(tables(1.2, { customer_lead_visits: [{ organization_id: "org", lead_id: "lead", return_status: "pending", return_at: ago(-1) }] }), { catalog });
    expect(await s.planner.planPostSale(s.client as never, now)).toEqual({ postSale: 0 });
  });

  it("needs the smart follow-up on", async () => {
    const s = setup(tables(1.2), { catalog, policy: { follow_up_enabled: false, returns_enabled: true } });
    expect(await s.planner.planPostSale(s.client as never, now)).toEqual({ postSale: 0 });
  });
});

describe("birthday", () => {
  it("plans the message on the lead's birthday in the company's timezone", async () => {
    const s = setup({ leads: [
      { id: "lead", organization_id: "org", status: "active", metadata: { birthday: { day: 26, month: 9 } } },
      { id: "other", organization_id: "org", status: "active", metadata: { birthday: { day: 27, month: 9 } } },
      { id: "none", organization_id: "org", status: "active", metadata: {} },
    ] });
    expect(await s.planner.planBirthdays(s.client as never, now)).toEqual({ birthdays: 1 });
    expect(s.persisted[0].data).toMatchObject({ leadId: "lead", birthdayYear: 2026 });
  });
});
