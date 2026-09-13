import { describe, expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

const call = runtimeHarness({}, { fetch: async () => ({ ok: true, status: 200, text: async () => '{"id":"sent-test"}' }) });
function context(text: string) {
  const createdAt = new Date(Date.now() - 60000).toISOString();
  const current = { id: "current", companyId: "store", leadId: "lead", conversationId: "conversation", createdAt,
    status: "pending_payment", paymentStatus: "pending", total: "130,00", items: [{ catalogItemId: "shirt", title: "Camiseta azul", quantity: 2 }],
    checkoutRevision: 22, checkoutPaymentLock: null };
  return {
    organization: { id: "store", plan_code: "pro" }, instance: { id: "instance" }, agent: { id: "agent" }, conversationId: "conversation",
    conversationMetadata: {}, credentials: { baseUrl: "https://whatsapp.invalid" }, behavior: {}, run: { id: "run" },
    lead: { id: "lead", metadata: { checkout_runtime_state: { organization_id: "store", conversation_id: "conversation", instance_id: "instance", order_id: "current", stage: "payment_sent" } } as Record<string, unknown> },
    messages: [{ id: "inbound", conversation_id: "conversation", direction: "inbound", text_content: text, occurred_at: new Date().toISOString(), payload: {}, message_type: "text" }],
    salesCatalog: [{ id: "shirt", title: "Camiseta azul", price: "60,00", currency: "BRL", offer: { salePrice: null }, status: "active",
      salesDestination: "connectyhub_checkout", skus: [], attributes: [], media: [], fulfillment: { mode: "physical" }, inventory: { status: "in_stock", allowBackorder: false },
      tag: "{{produto_shirt}}", description: "", category: "", platformProductCode: null }],
    salesCatalogOrders: [current],
  };
}

describe("saved order clarification after revision has been cleared", () => {
  it.each(["o que não entendi", "como assim?", "mas nem paguei ainda", "blz obrigado", "já adicionou?"])(
    "reports actual saved items for %s when the model claims a change", text => {
      const ctx = context(text);
      const before = structuredClone(ctx);
      const reply = call<string>("guardUnexecutedOrderRevisionClaim", "Já atualizei seu pedido com três camisetas.", ctx);
      expect(reply).toContain("2x Camiseta azul");
      expect(reply).toContain("130,00");
      expect(reply).not.toMatch(/três|Me informe|alteração confirmada|já atualizei/i);
      expect(ctx).toEqual(before);
    },
  );

  it("sends and persists a factual correction without changing orders or payments", async () => {
    const ctx = context("o que não entendi");
    const order = { id: "current", organization_id: "store", status: "pending_payment", payment_status: "pending" };
    const session = { id: "session", order_id: "current", method: "card", status: "created" };
    const db = commerceDatabase({ conversation_messages: ctx.messages, sales_catalog_orders: [order], sales_catalog_payment_sessions: [session] });
    const reply = await call<Promise<{ text: string }[]>>("sendAgentResponse", { client: db.client, context: ctx, token: "fake", phone: "5500000000000", text: "Atualizei seu pedido com três camisetas." });
    expect(reply[0].text).toContain("2x Camiseta azul");
    expect(db.tables.sales_catalog_orders).toEqual([order]);
    expect(db.tables.sales_catalog_payment_sessions).toEqual([session]);
    expect(db.tables.conversation_messages.at(-1)?.text_content).toBe(reply[0].text);
  });

  it("does not endorse a model claim that an explicit new edit was applied", () => {
    const ctx = context("adicione uma camiseta azul");
    expect(call<string>("guardUnexecutedOrderRevisionClaim", "Adicionei uma camiseta no pedido.", ctx)).toMatch(/Ainda não há uma alteração confirmada/);
  });

  it("keeps a real pending product unresolved even if the saved order exists", () => {
    const ctx = context("não entendi");
    ctx.lead.metadata.checkout_order_revision = { organization_id: "store", conversation_id: "conversation", instance_id: "instance", order_id: "current", request_id: "revision", expected_revision: 22, items: [], pending_intent: { kind: "add", productText: "camiseta" } };
    expect(call<string>("guardUnexecutedOrderRevisionClaim", "Atualizei o pedido.", ctx)).toMatch(/alteração ainda está pendente/);
  });

  it("does not use another conversation's order or guess between ambiguous orders", () => {
    const ctx = context("como assim?");
    ctx.salesCatalogOrders[0].conversationId = "other";
    expect(call("guardUnexecutedOrderRevisionClaim", "Atualizei o pedido.", ctx)).toBeNull();
    ctx.salesCatalogOrders[0].conversationId = "conversation";
    ctx.lead.metadata = {};
    ctx.salesCatalogOrders.push({ ...ctx.salesCatalogOrders[0], id: "second" });
    expect(call<string>("guardUnexecutedOrderRevisionClaim", "Atualizei o pedido.", ctx)).not.toContain("2x Camiseta azul");
  });
});
