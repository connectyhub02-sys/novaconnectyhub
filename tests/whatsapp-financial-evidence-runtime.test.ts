import { describe, expect, it, vi } from "vitest";
import * as catalogShared from "@/lib/sales-catalog/shared";
import * as paymentDiagnostics from "@/lib/sales-catalog/payment-diagnostics";
import * as responsibleHuman from "@/lib/agents/responsible-human";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

type Row = Record<string, unknown>;
const catalog = serverModuleHarness<typeof import("@/lib/client-os/sales-catalog")>(
  "src/lib/client-os/sales-catalog.ts", { "@/lib/sales-catalog/shared": catalogShared },
);
const orderIds = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

function scenario(orderCount: 1 | 2, previousReview?: "open" | "resolved") {
  const now = new Date().toISOString();
  const orders = orderIds.slice(0, orderCount).map(id => ({ id, organization_id: "store", lead_id: "lead", conversation_id: "conversation",
    status: "pending_payment", payment_status: "pending", total: "70,00", subtotal: "70,00", shipping_total: "0,00", metadata: {}, created_at: now, updated_at: now }));
  const items = orders.map(order => ({ id: `item-${order.id}`, order_id: order.id, organization_id: "store", catalog_item_id: "shirt",
    title: "Camiseta vermelha", quantity: 1, unit_price: "70,00", total: "70,00", metadata: {}, fulfillment: { mode: "physical" } }));
  const review = previousReview ? { id: "existing-review", organization_id: "store", lead_id: "lead", conversation_id: "conversation",
    order_id: orderIds[0], status: previousReview, notification_status: "sent", requested_at: now,
    notification_payload: { source: "financial_review", requestText: "Relato de débito anterior confirmado para conferência." } } : null;
  const conversationMetadata = { preserved: "conversation", ...(previousReview === "open" ? {
    human_intervention: { active: true, reason: "financial_review", review_id: review!.id, order_id: review!.order_id },
  } : {}) };
  const leadMetadata = { preserved: "lead", ...(previousReview === "open" ? { financial_review: { id: review!.id, order_id: review!.order_id, status: "open" } } : {}) };
  const db = commerceDatabase({ sales_catalog_orders: orders, sales_catalog_order_items: items,
    sales_catalog_payment_reviews: review ? [review] : [],
    conversations: [{ id: "conversation", organization_id: "store", lead_id: "lead", whatsapp_instance_id: "instance", metadata: conversationMetadata }],
    leads: [{ id: "lead", organization_id: "store", display_name: "Maria Oliveira", phone_number: "5500000000000", metadata: leadMetadata }],
  });
  // Only durable RPC effects and outgoing transports are substituted. The parser,
  // order selection, financial-review lookup, pause, notification and reply paths run unchanged.
  const rpc = vi.fn(async (name: string, args: Row) => {
    if (name === "claim_lead_payment_check") return { data: false, error: null };
    if (name === "record_checkout_payment_evidence") {
      db.tables.sales_catalog_payment_reviews.push({ id: "new-review", organization_id: args.p_organization_id, lead_id: args.p_lead_id,
        conversation_id: args.p_conversation_id, order_id: args.p_order_id, status: "open", notification_status: "pending",
        requested_at: now, notification_payload: null });
      return { data: { id: "new-review" }, error: null };
    }
    if (name === "claim_payment_review_notification") {
      const row = db.tables.sales_catalog_payment_reviews.find(item => item.id === args.p_review_id);
      if (!row || row.notification_status === "sent") return { data: null, error: null };
      row.notification_claimed_at = now;
      return { data: structuredClone(row), error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  const client = Object.assign(db.client, { rpc });
  const notify = vi.fn(async () => ({ status: "sent" as const }));
  const reviews = serverModuleHarness<typeof import("@/lib/sales-catalog/payment-reviews")>("src/lib/sales-catalog/payment-reviews.ts", {
    "./payment-diagnostics": paymentDiagnostics,
    "@/lib/whatsapp/handoff-notifications": { processWhatsappHandoffNotification: notify },
  });
  const transport = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: "delivered-reply" }) }));
  const call = runtimeHarness({ "@/lib/client-os/sales-catalog": catalog, "@/lib/sales-catalog/payment-reviews": reviews,
    "@/lib/agents/responsible-human": responsibleHuman }, { fetch: transport });
  const context = { organization: { id: "store", name: "Loja de teste", plan_code: "pro" }, agent: { id: "agent", name: "Luna", metadata: {} },
    run: { id: "run" }, instance: { id: "instance", metadata: {} }, conversationId: "conversation", conversationMetadata,
    providerChatId: "test-chat", lead: { id: "lead", display_name: "Maria Oliveira", phone_number: "5500000000000", metadata: leadMetadata },
    salesCatalogOrders: orders.map(order => catalog.mapSalesCatalogOrder(order as Parameters<typeof catalog.mapSalesCatalogOrder>[0],
      items.filter(item => item.order_id === order.id) as Parameters<typeof catalog.mapSalesCatalogOrder>[1])),
    behavior: { humanInterventionMinutes: 30, humanHandoffNotifications: true, humanHandoffNotificationNumbers: ["5500000000001"], humanHandoffNotificationCooldownMinutes: 5 },
    credentials: { baseUrl: "https://whatsapp.invalid" },
  };
  async function inbound(text: string, mediaAnalysis = "", attachment = false) {
    return call<Promise<string | null>>("handleLeadFinancialEvidence", { client, context,
      latestInbound: { id: "inbound", direction: "inbound", message_type: attachment ? "image" : "text", text_content: text,
        conversation_id: "conversation", whatsapp_instance_id: "instance", occurred_at: now, payload: {} },
      userText: mediaAnalysis || text, token: "fake", phone: "5500000000000" });
  }
  function assertNoEscalation() {
    expect(rpc.mock.calls.filter(([name]) => name === "record_checkout_payment_evidence")).toEqual([]);
    expect(db.tables.sales_catalog_payment_reviews.filter(row => row.status !== "resolved")).toEqual([]);
    expect(db.tables.conversations[0].metadata).toEqual(conversationMetadata);
    expect(db.tables.leads[0].metadata).toEqual(leadMetadata);
    expect(db.tables.sales_catalog_orders).toEqual(orders);
    expect(db.tables.conversation_messages ?? []).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  }
  return { db, orders, review, rpc, notify, transport, inbound, assertNoEscalation };
}

describe("financial evidence in the real WhatsApp runtime", () => {
  it.each([1, 2] as const)("keeps the agent active for 'mas nem paguei ainda' with %i scoped orders", async count => {
    const s = scenario(count);
    expect(await s.inbound("mas nem paguei ainda")).toBeNull();
    s.assertNoEscalation();
    expect(s.rpc.mock.calls.filter(([name]) => name === "claim_lead_payment_check")).toHaveLength(count === 1 ? 1 : 0);
  });

  it.each([
    "Por favor, você sabe se foi debitado",
    "Não sei se foi debitado e descontou da conta",
    "Obrigado. Posso pagar agora?",
    "Ainda não paguei, vou pagar mais tarde",
  ])("does not turn uncertainty or postponement into evidence: %s", async text => {
    const s = scenario(1);
    expect(await s.inbound(text)).toBeNull();
    s.assertNoEscalation();
  });

  it.each(["Já paguei", "Não paguei mas foi debitado", "Não paguei e descontou da minha conta", "Foi debitado, como resolvo?", "Já paguei e não sei por que aparece pendente",
    "Meu banco informou que foi debitado", "Luna disse que paguei, mas meu banco informou que foi debitado"])("opens review for a real claim without approving payment: %s", async text => {
    const s = scenario(1);
    expect(await s.inbound(text)).toMatch(/registrei o caso|conferir/);
    expect(s.rpc).toHaveBeenCalledWith("record_checkout_payment_evidence", expect.objectContaining({
      p_organization_id: "store", p_lead_id: "lead", p_conversation_id: "conversation", p_message_id: "inbound", p_order_id: orderIds[0], p_kind: "claim",
    }));
    expect(s.db.tables.sales_catalog_payment_reviews).toHaveLength(1);
    expect(s.db.tables.sales_catalog_payment_reviews[0]).toMatchObject({ status: "open", order_id: orderIds[0], notification_status: "sent" });
    expect(s.db.tables.conversations[0].metadata).toMatchObject({ preserved: "conversation", human_intervention: { active: true, reason: "financial_review", review_id: "new-review" } });
    expect(s.db.tables.leads[0].metadata).toMatchObject({ preserved: "lead", financial_review: { id: "new-review", status: "open" } });
    expect(s.notify).toHaveBeenCalledOnce();
    expect(s.transport).toHaveBeenCalledOnce();
    expect(s.db.tables.conversation_messages).toHaveLength(1);
    expect(s.db.tables.conversation_messages[0]).toMatchObject({ direction: "outbound", conversation_id: "conversation", lead_id: "lead" });
    expect(s.db.tables.sales_catalog_orders).toEqual(s.orders);
    expect(s.rpc.mock.calls.some(([name]) => /apply_verified|create.*payment/.test(name))).toBe(false);
  });

  it("opens an unassigned review for a genuine debit with two possible orders", async () => {
    const s = scenario(2);
    await s.inbound("Não paguei mas foi debitado");
    expect(s.rpc).toHaveBeenCalledWith("record_checkout_payment_evidence", expect.objectContaining({ p_order_id: null }));
    expect(s.db.tables.sales_catalog_payment_reviews[0]).toMatchObject({ order_id: null, status: "open",
      notification_payload: { requestText: expect.stringContaining("identifique o pedido") } });
    expect(s.notify).toHaveBeenCalledOnce();
    expect(s.db.tables.sales_catalog_orders).toEqual(s.orders);
  });

  it("preserves an existing legitimate review and its pause after a later negative statement", async () => {
    const s = scenario(1, "open");
    expect(await s.inbound("mas nem paguei ainda")).toMatch(/está em conferência/);
    expect(s.rpc.mock.calls.filter(([name]) => name === "record_checkout_payment_evidence")).toEqual([]);
    expect(s.db.tables.sales_catalog_payment_reviews).toEqual([s.review]);
    expect(s.db.tables.conversations[0].metadata).toMatchObject({ human_intervention: { active: true, reason: "financial_review", review_id: "existing-review" } });
    expect(s.db.tables.leads[0].metadata).toMatchObject({ financial_review: { id: "existing-review", status: "open" } });
    expect(s.notify).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_orders).toEqual(s.orders);
  });

  it("does not reopen a resolved review after a negative statement", async () => {
    const s = scenario(1, "resolved");
    expect(await s.inbound("mas nem paguei ainda")).toBeNull();
    s.assertNoEscalation();
    expect(s.db.tables.sales_catalog_payment_reviews).toEqual([s.review]);
  });

  it("does not escalate an ambiguous attachment without a receipt or payment claim", async () => {
    const s = scenario(1);
    expect(await s.inbound("mas nem paguei ainda", "Imagem de uma tela, sem detalhes legíveis", true)).toBeNull();
    s.assertNoEscalation();
  });

  it("routes an attached receipt to review while leaving the order unpaid", async () => {
    const s = scenario(1);
    await s.inbound("Segue a imagem", "Comprovante de Pix enviado", true);
    expect(s.rpc).toHaveBeenCalledWith("record_checkout_payment_evidence", expect.objectContaining({ p_kind: "attachment", p_order_id: orderIds[0] }));
    expect(s.db.tables.sales_catalog_payment_reviews[0]).toMatchObject({ status: "open" });
    expect(s.db.tables.sales_catalog_orders).toEqual(s.orders);
  });

  it.each([
    ["Não paguei, essa foto é do produto e não um comprovante", "Foto de camiseta azul", true],
    ["Não tenho comprovante; segue foto da camiseta", "Foto de camiseta azul", true],
    ["Ela disse que eu paguei, mas nem paguei ainda", "", false],
    ["A Luna falou que eu paguei", "", false],
    ["O atendente afirmou que eu paguei", "", false],
  ] as const)("keeps denials and attributed claims out of financial review: %s", async (text, analysis, attachment) => {
    const s = scenario(2);
    expect(await s.inbound(text, analysis, attachment)).toBeNull();
    s.assertNoEscalation();
  });

  it("preserves review of independently identified proof despite negative lead text", async () => {
    const s = scenario(1);
    await s.inbound("Não tenho comprovante", "Comprovante de Pix enviado", true);
    expect(s.rpc).toHaveBeenCalledWith("record_checkout_payment_evidence", expect.objectContaining({ p_kind: "attachment", p_order_id: orderIds[0] }));
    expect(s.db.tables.sales_catalog_payment_reviews[0]).toMatchObject({ status: "open" });
    expect(s.db.tables.sales_catalog_orders).toEqual(s.orders);
  });
});
