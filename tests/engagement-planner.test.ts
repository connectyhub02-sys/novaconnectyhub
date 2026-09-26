import { describe, expect, it } from "vitest";
import * as contactWindow from "../src/lib/automations/contact-window";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Planner = typeof import("../src/lib/automations/engagement-planner");
type Row = Record<string, unknown>;
const hour = 3600_000;
const now = new Date("2026-09-26T15:00:00Z");
const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * hour).toISOString();

function setup(tables: Record<string, Row[]>, options: { policy?: Row | null; catalog?: Row[] } = {}) {
  const db = commerceDatabase(tables);
  const persisted: Array<{ data: Row }> = [];
  const policy = options.policy === undefined ? { follow_up_enabled: true, window_start: "09:00", window_end: "20:00", timezone: "America/Sao_Paulo" } : options.policy;
  const planner = serverModuleHarness<Planner>("src/lib/automations/engagement-planner.ts", {
    "./contact-window": contactWindow,
    "./dispatch": {
      loadAutomationPolicy: async () => policy,
      persistFollowUpDispatch: async (_client: unknown, data: Row) => { persisted.push({ data }); return { id: "d", status: "pending" }; },
    },
    "./relationship-profile": {
      contactContext: async (_client: unknown, organizationId: string, leadId: string) => ({ organizationId, leadId, conversationId: "c", whatsappInstanceId: "i", agentId: "a", agentRunId: "r" }),
      relatedProductScore: (a: { title: string }, b: { title: string }) => (a.title.toLowerCase().includes(b.title.toLowerCase()) ? 2 : 0),
      sellableRecommendation: () => true,
    },
    "@/lib/client-os/sales-catalog": { listOrganizationSalesCatalog: async () => options.catalog ?? [] },
  });
  return { db, persisted, planner };
}

const session = (extra: Row = {}) => ({ id: "s", organization_id: "org", lead_id: "lead", conversation_id: "c", first_seen_at: at(3), last_seen_at: at(2),
  metadata: { commerce_journey: [{ surface: "store" }, { surface: "product", product_id: "whey" }], commerce_cart_snapshot: { product_ids: [] } }, ...extra });

describe("visited the store and did not buy", () => {
  it("follows up on the product left in the cart", async () => {
    const s = setup({ commerce_sessions: [session({ metadata: { commerce_cart_snapshot: { product_ids: ["creatine"] }, commerce_journey: [] } })] });
    expect(await s.planner.planBrowseFollowUps(s.db.client as never, now)).toEqual({ browse: 1 });
    expect(s.persisted[0].data).toMatchObject({ browseProductId: "creatine", browseKind: "cart", browseSessionId: "s" });
  });

  it("follows up on the last product page when there is no cart", async () => {
    const s = setup({ commerce_sessions: [session()] });
    await s.planner.planBrowseFollowUps(s.db.client as never, now);
    expect(s.persisted[0].data).toMatchObject({ browseProductId: "whey", browseKind: "view" });
  });

  it.each([
    ["an order was started (payment recovery owns it)", { sales_catalog_orders: [{ organization_id: "org", lead_id: "lead", created_at: at(2.5) }] }],
    ["the lead is chatting right now", { conversation_messages: [{ organization_id: "org", lead_id: "lead", occurred_at: at(0.2) }] }],
    ["the same product was followed up recently", { automation_dispatches: [{ organization_id: "org", lead_id: "lead", event_data: { browseProductId: "whey" }, created_at: at(48) }] }],
  ])("stays quiet when %s", async (_label, extra) => {
    const s = setup({ commerce_sessions: [session()], ...extra });
    expect(await s.planner.planBrowseFollowUps(s.db.client as never, now)).toEqual({ browse: 0 });
  });

  it("ignores a visit that only saw the home page", async () => {
    const s = setup({ commerce_sessions: [session({ metadata: { commerce_journey: [{ surface: "store" }] } })] });
    expect(await s.planner.planBrowseFollowUps(s.db.client as never, now)).toEqual({ browse: 0 });
  });
});

describe("reactivation", () => {
  const lead = { id: "lead", organization_id: "org", status: "active", last_message_at: at(35 * 24), metadata: {} };
  const talked = [
    { organization_id: "org", lead_id: "lead", direction: "inbound", text_content: "vocês tem creatina?" },
    { organization_id: "org", lead_id: "lead", direction: "inbound", text_content: "vou pensar" },
  ];

  it("contacts a lead who talked and did not buy, with a related novelty", async () => {
    const s = setup({ leads: [lead], conversation_messages: talked }, { catalog: [
      { id: "old", title: "Creatina", createdAt: at(90 * 24) },
      { id: "new", title: "Creatina", createdAt: at(5 * 24) },
    ] });
    expect(await s.planner.planReactivations(s.db.client as never, now)).toEqual({ reactivations: 1 });
    expect(s.persisted[0].data).toMatchObject({ reactivation: true, reactivationMonth: "2026-09", reactivationProductId: "new" });
  });

  it.each([
    ["the lead bought", { sales_catalog_orders: [{ organization_id: "org", lead_id: "lead", payment_status: "confirmed", created_at: at(40 * 24) }] }],
    ["the lead barely talked", { conversation_messages: [talked[0]] }],
    ["the lead asked to leave the list", { leads: [{ ...lead, metadata: { whatsapp_opt_out: true } }] }],
    ["a return is already scheduled", { customer_lead_visits: [{ organization_id: "org", lead_id: "lead", return_status: "pending" }] }],
  ])("does not contact when %s", async (_label, extra) => {
    const s = setup({ leads: [lead], conversation_messages: talked, ...extra });
    expect(await s.planner.planReactivations(s.db.client as never, now)).toEqual({ reactivations: 0 });
  });
});

describe("message context", () => {
  const context = serverModuleHarness<typeof import("../src/lib/automations/relationship-context")>("src/lib/automations/relationship-context.ts", {
    "@/lib/client-os/sales-catalog": { listOrganizationSalesCatalog: async () => [{ id: "whey", title: "Whey", price: "150", offer: { salePrice: null }, category: "Suplementos", assignedAgentIds: [] }] },
    "@/lib/sales-catalog/public-urls": { buildLeadAwareSalesCatalogProductUrl: ({ productId }: { productId: string }) => `https://loja.invalid/produto/${productId}` },
    "./relationship-profile": { sellableRecommendation: () => true },
    "./contact-window": contactWindow,
  });
  const base = { organizationId: "org", leadId: "lead", conversationId: "c", whatsappInstanceId: "i", agentId: "a", agentRunId: "r" };
  const client = commerceDatabase({}).client;

  it("offers help about the product seen without exposing the visit, with a real product link", async () => {
    const result = await context.relationshipContext(client as never, { ...base, browseProductId: "whey", browseKind: "view", browseSessionId: "s" } as never, "America/Sao_Paulo");
    expect(result.context).toContain("Nunca diga que viu ele navegando");
    expect(result.link).toBe("https://loja.invalid/produto/whey");
  });

  it("resumes a quiet lead's topic without pressure", async () => {
    const result = await context.relationshipContext(client as never, { ...base, reactivation: true, reactivationMonth: "2026-09" } as never, "America/Sao_Paulo");
    expect(result.context).toContain("Reativação");
    expect(result.link).toBe("");
  });
});
