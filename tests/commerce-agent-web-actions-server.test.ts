import { describe, expect, it } from "vitest";
import * as crypto from "node:crypto";
import * as contract from "../src/lib/commerce-agent/web-actions";
import type * as Server from "../src/lib/commerce-agent/web-actions-server";
import type { CommerceAgentResolvedContext } from "../src/lib/commerce-agent/server";
import { serverModuleHarness } from "./helpers/server-module-harness";

type RecordRow = Record<string, unknown>;
const org = "11111111-1111-4111-a111-111111111111";
const productId = "22222222-2222-4222-a222-222222222222";
const action: contract.WebAction = { id: "33333333-3333-4333-a333-333333333333", kind: "request_add_to_cart_confirmation", productId, productTitle: "Café Especial", quantity: 2, reason: "Lead pediu o item." };
const confirmation = { accepted: true, actionId: action.id, productId, quantity: 2 };

function fixture() {
  const rows: Record<string, RecordRow[]> = { commerce_agent_actions: [], intelligence_events: [], intelligence_memory: [
    { id: productId, organization_id: org, scope: "organization", memory_type: "sales_catalog_item", title: "Café Especial", status: "active", salesDestination: "connectyhub_checkout", price: "12", offer: { salePrice: null }, inventory: {}, metadata: { status: "active" } },
  ] };
  let failTable = "";
  class Query {
    filters: Array<(r: RecordRow) => boolean> = [];
    patch: RecordRow | null = null;
    constructor(public table: string) {}
    eq(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this; }
    filter() { return this; }
    order() { return this; }
    limit() { return this; }
    select() { return this; }
    update(patch: RecordRow) { this.patch = patch; return this; }
    async insert(row: RecordRow) { if (failTable === this.table) return { error: {} }; rows[this.table].push(structuredClone(row)); return { error: null }; }
    async upsert(row: RecordRow) { if (failTable === this.table) return { error: {} }; if (!rows[this.table].some(item => item.id === row.id)) rows[this.table].push(structuredClone(row)); return { error: null }; }
    result(single = false) {
      if (failTable === this.table) return { data: null, error: {} };
      const found = rows[this.table].filter(row => this.filters.every(filter => filter(row)));
      if (this.patch) found.forEach(row => Object.assign(row, this.patch));
      return { data: structuredClone(single ? found[0] ?? null : found), error: null };
    }
    async maybeSingle() { return this.result(true); }
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(this.result()).then(resolve); }
  }
  const context = { ok: true, client: { from: (table: string) => new Query(table) },
    organization: { id: org }, settings: { commerceAgent: { mode: "assistant" } },
    commerceSessionId: "session", leadId: "lead", conversationId: "conversation", agentId: "agent", agentName: "Luna",
    surface: "store", productId: null, visitorId: "visitor", sessionId: "browser-session", pagePath: "/loja/test",
  } as unknown as Extract<CommerceAgentResolvedContext, { ok: true }>;
  const server = serverModuleHarness<typeof Server>("src/lib/commerce-agent/web-actions-server.ts", {
    "node:crypto": crypto, "./web-actions": contract,
    "@/lib/client-os/sales-catalog": { mapSalesCatalogItem: (row: unknown) => row },
    "@/lib/sales-catalog/shared": { isSalesCatalogDisplayableProduct: (row: RecordRow) => row.status === "active" },
  });
  const execute = (extra: RecordRow = {}) => server.handleWebAction(context, { web_action_id: action.id, phase: "execute", confirmation, ...extra });
  return { rows, context, server, execute, fail: (table: string) => { failTable = table; } };
}

describe("web actions persistence, scope and consent", () => {
  it("does not query the action catalog for ordinary conversation", async () => {
    const f = fixture(); f.fail("intelligence_memory");
    expect(await f.server.prepareWebAction(f.context, "Olá, tudo bem?")).toBeNull();
  });
  it("plans only public catalog items in the organization and skips observer", async () => {
    const f = fixture();
    f.rows.intelligence_memory.push({ ...f.rows.intelligence_memory[0], id: org, organization_id: "other", title: "Produto privado" });
    expect((await f.server.prepareWebAction(f.context, "Não encontro Café Especial"))?.action).toMatchObject({ kind: "open_product", productId });
    expect(await f.server.prepareWebAction(f.context, "Não encontro Produto privado")).toBeNull();
    f.context.settings.commerceAgent.mode = "observer";
    expect(await f.server.prepareWebAction(f.context, "Não encontro Café Especial")).toBeNull();
  });
  it("stores proposal, clear consent and browser result in existing action and lead events", async () => {
    const f = fixture();
    await f.server.issueWebAction(f.context, action);
    expect(f.rows.commerce_agent_actions[0]).toMatchObject({ action_type: "add_to_cart", status: "suggested", catalog_item_id: productId, lead_id: "lead", created_by_agent_id: "agent", request_payload: { web_action: action } });
    const permit = await f.execute();
    expect(permit).toMatchObject({ action: { kind: "add_to_cart_after_confirmation", quantity: 2 } });
    const completion = { web_action_id: action.id, phase: "complete", outcome: "applied" };
    await f.server.handleWebAction(f.context, completion);
    await f.server.handleWebAction(f.context, completion);
    expect(f.rows.commerce_agent_actions[0]).toMatchObject({ status: "applied", applied_at: expect.any(String) });
    expect(f.rows.intelligence_events).toHaveLength(3);
    expect(f.rows.intelligence_events[2]).toMatchObject({ source_id: "lead", producer_agent_id: "agent", payload: { quantity: 2, product_id: productId, lead_id: "lead", conversation_id: "conversation", status: "applied", result_source: "lead_browser_report" } });
  });
  it.each([null, "sim", { ...confirmation, accepted: false }, { ...confirmation, quantity: 3 }, { ...confirmation, productId: org }, { ...confirmation, actionId: org }])("rejects absent or mismatched consent: %j", async consent => {
    const f = fixture(); await f.server.issueWebAction(f.context, action);
    await expect(f.execute({ confirmation: consent })).rejects.toMatchObject({ status: 403 });
    expect(f.rows.commerce_agent_actions[0].status).toBe("suggested");
  });
  it.each(["leadId", "conversationId", "agentId", "commerceSessionId", "visitorId", "sessionId", "pagePath", "surface"] as const)("rejects changed %s", async field => {
    const f = fixture(); await f.server.issueWebAction(f.context, action);
    Object.assign(f.context, { [field]: "other" });
    await expect(f.execute()).rejects.toMatchObject({ status: 403 });
  });
  it("rejects another organization, expiration, disabled mode and unavailable product", async () => {
    const f = fixture(); await f.server.issueWebAction(f.context, action);
    f.context.organization.id = "other";
    await expect(f.execute()).rejects.toMatchObject({ status: 403 });
    f.context.organization.id = org;
    f.context.settings.commerceAgent.mode = "observer";
    await expect(f.execute()).rejects.toMatchObject({ status: 403 });
    f.context.settings.commerceAgent.mode = "assistant";
    f.rows.intelligence_memory[0].salesDestination = "appointment";
    await expect(f.execute()).rejects.toThrow("indisponível");
    (f.rows.commerce_agent_actions[0].metadata as RecordRow).expires_at = 0;
    await expect(f.execute()).rejects.toThrow("expirada");
  });
  it("allows only one execution permit in concurrent or replayed requests", async () => {
    const f = fixture(); await f.server.issueWebAction(f.context, action);
    const results = await Promise.allSettled([f.execute(), f.execute()]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    await expect(f.execute()).rejects.toThrow("já foi tratada");
  });
  it("rejects completion without an execution permit and respects decline", async () => {
    const f = fixture(); await f.server.issueWebAction(f.context, action);
    await expect(f.server.handleWebAction(f.context, { web_action_id: action.id, phase: "complete", outcome: "applied" })).rejects.toThrow();
    await f.server.handleWebAction(f.context, { web_action_id: action.id, phase: "reject" });
    await expect(f.execute()).rejects.toThrow();
    expect(f.rows.intelligence_events[1]).toMatchObject({ payload: { status: "rejected" } });
  });
  it.each(["commerce_agent_actions", "intelligence_events"])("fails closed if mandatory %s persistence fails", async table => {
    const f = fixture(); f.fail(table);
    await expect(f.server.issueWebAction(f.context, action)).rejects.toThrow();
  });
  it("does not grant execution if archiving acceptance fails and recovers completion logging", async () => {
    const f = fixture(); await f.server.issueWebAction(f.context, action);
    f.fail("intelligence_events");
    await expect(f.execute()).rejects.toThrow();
    f.fail("");
    await expect(f.execute()).rejects.toThrow();
    f.fail("intelligence_events");
    const failed = { web_action_id: action.id, phase: "complete", outcome: "failed" };
    await expect(f.server.handleWebAction(f.context, failed)).rejects.toThrow();
    f.fail("");
    await f.server.handleWebAction(f.context, failed);
    expect(f.rows.intelligence_events.at(-1)).toMatchObject({ payload: { status: "failed" } });
  });
});
