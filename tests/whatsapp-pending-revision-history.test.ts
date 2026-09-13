import { describe, expect, it } from "vitest";
import type { OrderRevisionIntent } from "@/lib/whatsapp/order-revision-intent";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

type Message = { id: string; direction: string; text_content: string; occurred_at: string; organization_id: string; conversation_id: string; whatsapp_instance_id: string };
type Draft = { organization_id: string; conversation_id: string; instance_id: string; order_id: string; expected_revision: number;
  source_message_id: string; pending_source_message_id?: string | null; pending_intent: OrderRevisionIntent | null;
  pending_quantity_item_id?: string | null; pending_product_role?: string | null; ready: boolean; applied?: boolean;
  items: { id: string; quantity: number; mention_text: string }[] };
const now = Date.parse("2026-09-13T12:00:00.000Z");
const hour = 60 * 60 * 1000;
const at = (offset: number) => new Date(now + offset).toISOString();
const product = (id: string, title: string) => ({ id, title, tag: `{{produto_${id}}}`, status: "active", price: "70,00", currency: "BRL",
  salesDestination: "connectyhub_checkout", inventory: { status: "in_stock", allowBackorder: false }, offer: { salePrice: null },
  skus: [], attributes: [], fulfillment: { mode: "physical" }, shipping: { profile: "default" }, media: [], description: "", category: "", platformProductCode: null });

function scenario() {
  const message = (id: string, text: string, offset: number, direction = "inbound"): Message => ({ id, direction, text_content: text,
    occurred_at: at(offset), organization_id: "store", conversation_id: "conversation", whatsapp_instance_id: "instance" });
  const anchor = message("anchor", "sim coloca", -4 * hour);
  const named = message("named", "Camiseta vermelha (R$70,00)", -4 * hour + 1000);
  const quantified = message("quantified", "1 unidade de Camiseta vermelha (R$70,00)", -4 * hour + 2000);
  const latest = message("latest", "sim", 0);
  const order = { id: "order", companyId: "store", conversationId: "conversation", leadId: "lead", status: "pending_payment",
    paymentStatus: "pending", fulfillmentStatus: "pending", checkoutRevision: 3, checkoutPaymentLock: null as string | null,
    createdAt: at(-6 * hour), updatedAt: at(-5 * hour), items: [{ catalogItemId: "blue", title: "Camiseta azul", quantity: 1 }] };
  const draft: Draft = { organization_id: "store", conversation_id: "conversation", instance_id: "instance", order_id: "order", expected_revision: 3,
    source_message_id: "", pending_intent: { kind: "add", productText: "", quantity: 1 }, ready: false,
    items: [{ id: "blue", quantity: 1, mention_text: "Camiseta azul" }] };
  const context = { organization: { id: "store" }, conversationId: "conversation", instance: { id: "instance" }, lead: { id: "lead", metadata: {} },
    agent: {}, messages: [anchor, named, quantified, message("greeting", "bom dia", -60000), latest],
    salesCatalog: [product("blue", "Camiseta azul"), product("red", "Camiseta vermelha"), product("bottle", "Garrafa térmica")], salesCatalogOrders: [order] };
  const call = runtimeHarness();
  const recover = () => call<OrderRevisionIntent | null>("recoverRuntimePendingRevisionIntent", context, order, draft, latest);
  const insert = (text: string, direction = "inbound", offset = -50000) => {
    const item = message(`extra-${context.messages.length}`, text, offset, direction);
    context.messages.splice(context.messages.length - 1, 0, item);
    return item;
  };
  return { context, order, draft, latest, anchor, named, quantified, recover, insert, message };
}

describe("recovering an unresolved revision from scoped customer history", () => {
  it("recovers one addition after repeated priced answers and a four-hour pause without mutating the draft", () => {
    const s = scenario();
    const before = structuredClone(s.draft);
    expect(s.recover()).toEqual({ kind: "add", productText: "camiseta vermelha", quantity: 1 });
    expect(s.recover()).toEqual({ kind: "add", productText: "camiseta vermelha", quantity: 1 });
    expect(s.draft).toEqual(before);
    expect(s.order.items).toHaveLength(1);
  });
  it("uses the latest explicit quantity instead of adding up repeated attempts", () => {
    const s = scenario();
    s.insert("2 unidades");
    expect(s.recover()).toMatchObject({ kind: "add", productText: "camiseta vermelha", quantity: 2 });
  });
  it("uses the final unambiguous product answer in the same pending operation", () => {
    const s = scenario();
    s.insert("Garrafa térmica (R$49,99)");
    expect(s.recover()).toMatchObject({ kind: "add", productText: "garrafa termica", quantity: 1 });
  });
  it("supports an explicit source anchor and ignores products before that source", () => {
    const s = scenario();
    s.draft.pending_source_message_id = "anchor";
    s.context.messages.unshift(s.message("earlier", "2 unidades de Garrafa térmica", -4 * hour - 1000));
    expect(s.recover()).toMatchObject({ productText: "camiseta vermelha", quantity: 1 });
  });
  it("sorts historical messages chronologically before applying the final quantity", () => {
    const s = scenario();
    s.insert("3 unidades");
    s.context.messages.reverse();
    expect(s.recover()).toMatchObject({ productText: "camiseta vermelha", quantity: 3 });
  });
  it.each(["não quero mais essa camiseta", "deixa para depois", "cancele o pedido", "esquece esse produto", "não quero alterar nada", "quero fazer outro pedido"])
    ("does not revive an earlier candidate after the customer says: %s", text => {
      const s = scenario(); s.insert(text); expect(s.recover()).toBeNull();
    });
  it.each(["retire a camiseta azul", "mude o endereço", "quero pagar com Pix", "Camiseta vermelha?", "0 unidades", "Camiseta azul ou Camiseta vermelha"])
    ("does not skip a newer conflicting, incomplete or uncertain answer: %s", text => {
      const s = scenario(); s.insert(text); expect(s.recover()).toBeNull();
    });
  it("never obtains the product from an assistant's claimed update", () => {
    const s = scenario();
    s.named.direction = "outbound"; s.quantified.direction = "outbound";
    s.insert("Adicionei 1 Camiseta vermelha. Total R$130,00. Confirma?", "outbound");
    expect(s.recover()).toBeNull();
  });
  it.each(["organization_id", "conversation_id", "whatsapp_instance_id"] as const)("ignores product answers from another %s", field => {
    const s = scenario(); s.named[field] = "other"; s.quantified[field] = "other"; expect(s.recover()).toBeNull();
  });
  it.each(["organization_id", "conversation_id", "whatsapp_instance_id"] as const)("rejects a latest inbound from another %s", field => {
    const s = scenario(); s.latest[field] = "other"; expect(s.recover()).toBeNull();
  });
  it.each(["organization_id", "conversation_id", "instance_id", "order_id"] as const)("rejects a pending draft from another %s", field => {
    const s = scenario(); s.draft[field] = "other"; expect(s.recover()).toBeNull();
  });
  it.each(["companyId", "conversationId", "leadId"] as const)("rejects a loaded order from another %s", field => {
    const s = scenario(); s.order[field] = "other"; expect(s.recover()).toBeNull();
  });
  it.each(["revision", "paid", "fulfilled", "applied", "ready", "quantity_pending"])("does not reopen a finalized or incompatible state: %s", state => {
    const s = scenario();
    if (state === "revision") s.order.checkoutRevision++;
    if (state === "paid") s.order.paymentStatus = "paid";
    if (state === "fulfilled") s.order.fulfillmentStatus = "fulfilled";
    if (state === "applied") s.draft.applied = true;
    if (state === "ready") s.draft.ready = true;
    if (state === "quantity_pending") s.draft.pending_quantity_item_id = "blue";
    expect(s.recover()).toBeNull();
  });
  it("does not reuse the candidate after a more recent persisted order update", () => {
    const s = scenario(); s.order.updatedAt = at(-hour); expect(s.recover()).toBeNull();
  });
  it("rejects history beyond seven days even if a compatible anchor is present", () => {
    const s = scenario();
    s.order.createdAt = at(-10 * 24 * hour); s.order.updatedAt = at(-9 * 24 * hour);
    s.anchor.occurred_at = at(-8 * 24 * hour); s.named.occurred_at = at(-8 * 24 * hour + 1000); s.quantified.occurred_at = at(-8 * 24 * hour + 2000);
    expect(s.recover()).toBeNull();
  });
  it("does not guess an anchor when the available 80-message history no longer includes it", () => {
    const s = scenario();
    s.draft.pending_source_message_id = "anchor";
    for (let index = 0; index < 80; index++) s.insert("ok", "inbound", -10000 + index);
    s.context.messages = s.context.messages.slice(-80);
    expect(s.recover()).toBeNull();
  });
  it("rejects a missing or incompatible explicit source instead of choosing another command", () => {
    const s = scenario(); s.draft.pending_source_message_id = "missing"; expect(s.recover()).toBeNull();
    s.draft.pending_source_message_id = "named"; s.draft.pending_intent = { kind: "remove", productText: "camiseta azul", quantity: 1 };
    expect(s.recover()).toBeNull();
  });
});
