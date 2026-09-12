import { describe, expect, it } from "vitest";
import { classifyCheckoutJourney, isEditableCheckoutOrder, isNewPurchaseIntent, type CheckoutJourneyOrder } from "@/lib/whatsapp/order-lifecycle";

const now = "2026-09-13T19:30:00.000Z";
const current: CheckoutJourneyOrder = {
  id: "pizza-order", companyId: "pizzeria", conversationId: "pizza-chat", leadId: "customer",
  status: "pending_payment", paymentStatus: "pending", createdAt: "2026-09-13T19:00:00.000Z",
  updatedAt: "2026-09-13T19:15:00.000Z", checkoutConfirmedAt: "2026-09-13T19:01:00.000Z", latestPaymentSessionId: "pizza-checkout",
};
const yesterday = { ...current, createdAt: "2026-09-12T19:00:00.000Z", checkoutConfirmedAt: "2026-09-12T19:01:00.000Z" };
const paid = { ...yesterday, status: "paid", paymentStatus: "confirmed" };
const classify = (text: string, orders: CheckoutJourneyOrder[] = [current], extra: Partial<Parameters<typeof classifyCheckoutJourney>[0]> = {}) => classifyCheckoutJourney({
  text, conversationId: "pizza-chat", organizationId: "pizzeria", leadId: "customer", instanceId: "pizza-agent", orders, now, ...extra,
});

describe("explicit separation between a new purchase and an existing checkout", () => {
  it.each(["quero fazer um novo pedido", "quero outro pedido", "vamos fazer mais um pedido", "é um pedido novo", "quero um pedido separado",
    "quero pedir de novo", "vou comprar novamente", "vou querer outra pizza", "quero outra limonada"])("starts a fresh journey: %s", text => {
    expect(isNewPurchaseIntent(text)).toBe(true);
    expect(classify(text, [paid, current], { activeOrderId: current.id })).toMatchObject({ kind: "new_purchase", order: null, ambiguous: false });
  });
  it.each(["não quero outro pedido", "não vou pedir de novo", "não precisa fazer novo pedido", "troque por outra pizza",
    "quero outra forma de pagamento", "quero outro atendente", "quero outra opção", "quero outro endereço", "quero outra quantidade"])("does not turn a different action into a new purchase: %s", text => {
    expect(isNewPurchaseIntent(text)).toBe(false);
  });
  it.each(["quero uma pizza", "vou querer duas limonadas", "quero pedir uma pizza"])("can buy again after a completed purchase: %s", text => {
    const before = structuredClone(paid);
    expect(classify(text, [paid])).toMatchObject({ kind: "new_purchase", order: null, reason: "purchase_without_open_order" });
    expect(paid).toEqual(before);
  });
  it.each(["oi", "bom dia", "sim", "top", "quero um atendente", "quero uma informação"])("does not resume or create checkout on an ordinary message: %s", text => {
    expect(classify(text, [yesterday])).toMatchObject({ kind: "normal", order: null });
  });
});

describe("editing eligibility and order identity", () => {
  it.each(["draft", "pending_payment"])("allows unpaid %s orders", status => {
    expect(isEditableCheckoutOrder({ ...current, status })).toBe(true);
  });
  it.each(["paid", "in_preparation", "shipped", "delivered", "cancelled", "needs_human"])("rejects %s even when paymentStatus has not caught up", status => {
    expect(isEditableCheckoutOrder({ ...current, status })).toBe(false);
    expect(classify("adicione uma limonada", [{ ...current, status }])).toMatchObject({ kind: "revision", order: null, reason: "order_not_editable" });
  });
  it.each(["confirmed", "refunded", "failed", "proof_sent"])("rejects %s payment state even when orderStatus is pending", paymentStatus => {
    expect(isEditableCheckoutOrder({ ...current, paymentStatus })).toBe(false);
  });
  it("rejects fulfilled orders", () => {
    expect(isEditableCheckoutOrder({ ...current, fulfillmentStatus: "fulfilled" })).toBe(false);
  });
  it.each(["adicione uma limonada", "aumente para duas pizzas", "reduza para uma pizza", "retire a limonada", "troque a pizza por limonada",
    "altere o endereço", "top, adicione uma limonada", "quero cartão, mas troque a pizza"])("targets only the editable current order: %s", text => {
    expect(classify(text)).toMatchObject({ kind: "revision", order: current, reason: "order_change" });
  });
  it.each(["mude o pagamento para cartão", "cartão em vez de Pix", "me manda o link para pagar", "pix"])("resumes a payment without changing its items: %s", text => {
    expect(classify(text)).toMatchObject({ kind: "payment_resume", order: current });
  });
  it("does not send a checkout for a paid order", () => {
    expect(classify("me manda o link para pagar", [paid])).toMatchObject({ kind: "payment_resume", order: null, reason: "order_not_editable" });
  });
  it("keeps financial history separately selectable", () => {
    expect(classify("qual o status do pedido?", [paid])).toMatchObject({ kind: "history", order: paid });
    expect(classify("já paguei", [paid])).toMatchObject({ kind: "history", order: paid });
  });
});

describe("scope, time and ambiguity", () => {
  it.each([{ conversationId: "another-chat" }, { conversationId: null }, { companyId: "another-store" }, { leadId: "another-customer" }, { instanceId: "another-agent" }])("ignores out-of-scope orders: %j", change => {
    expect(classify("me manda o link para pagar", [{ ...current, ...change }])).toMatchObject({ order: null, reason: "order_not_found" });
  });
  it("accepts legacy orders without instance metadata when their conversation matches", () => {
    expect(classify("me manda o link para pagar")).toMatchObject({ order: current });
  });
  it("resumes one explicitly requested old pending checkout", () => {
    expect(classify("me manda o link para pagar", [yesterday])).toMatchObject({ kind: "payment_resume", order: yesterday });
  });
  it("does not make a historic order current because bookkeeping updated it today", () => {
    expect(classify("adicione uma limonada", [yesterday])).toMatchObject({ kind: "revision", order: null, ambiguous: true });
  });
  it("can revise an older order explicitly selected as the active journey", () => {
    expect(classify("adicione uma limonada", [yesterday], { activeOrderId: yesterday.id })).toMatchObject({ kind: "revision", order: yesterday });
  });
  it("requires selection when more than one pending checkout could be intended", () => {
    const second = { ...current, id: "lemonade-order" };
    expect(classify("me manda o link para pagar", [current, second])).toMatchObject({ order: null, ambiguous: true, reason: "order_selection_required" });
    expect(classify("adicione uma limonada", [current, second], { activeOrderId: second.id })).toMatchObject({ order: second, ambiguous: false });
  });
  it("does not fall through from a missing or closed active order to another pending order", () => {
    expect(classify("me manda o link para pagar", [current], { activeOrderId: "missing" })).toMatchObject({ order: null, reason: "active_order_unavailable" });
    expect(classify("adicione uma limonada", [current, { ...paid, id: "paid-order" }], { activeOrderId: "paid-order" })).toMatchObject({ order: null, reason: "order_not_editable" });
  });
  it("keeps earlier orders outside an explicitly started fresh journey", () => {
    expect(classify("me manda o link para pagar", [yesterday], { activeStartedAt: "2026-09-13T18:59:00.000Z" })).toMatchObject({ order: null });
    expect(classify("me manda o link para pagar", [current, yesterday], { activeStartedAt: "2026-09-13T18:59:00.000Z" })).toMatchObject({ order: current });
  });
  it("does not let another conversation's fresh update supersede the active order", () => {
    expect(classify("adicione uma limonada", [current, { ...current, id: "other-order", conversationId: "another-chat", updatedAt: now }])).toMatchObject({ order: current });
  });
  it("does not accept an order created after the customer's request", () => {
    expect(classify("me manda o link para pagar", [{ ...current, createdAt: "2026-09-14T19:00:00.000Z" }])).toMatchObject({ order: null });
  });
});
