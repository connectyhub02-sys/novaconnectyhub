import { expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { leadContactMessage, sendLeadContactMessage } from "../src/lib/automations/lead-contact-message";
const checkout = serverModuleHarness<typeof import("../src/lib/whatsapp/follow-up-checkout")>("src/lib/whatsapp/follow-up-checkout.ts", {
  "@/lib/sales-catalog/mercado-pago": { buildSalesCatalogCheckoutUrl: (id: string) => `https://fixture.invalid/checkout/${id}`, normalizeCurrencyAmount: (n: unknown) => Number(n) || null },
});
const order = { id: "order", organization_id: "org", lead_id: "lead", status: "pending_payment", payment_status: "pending", total: 90, latest_payment_session_id: "session" };
const session = { id: "session", organization_id: "org", order_id: "order", status: "pending", amount: 90, metadata: {} };
const products = { sales_catalog_order_items: [{ organization_id: "org", order_id: "order", catalog_item_id: "product" }], intelligence_memory: [{ id: "product", organization_id: "org", scope: "organization", memory_type: "sales_catalog_item", metadata: { sales_destination: "connectyhub_checkout" } }] };
it("uses an existing checkout owned by the same lead and organization", async () => {
  const db = commerceDatabase({ ...products, sales_catalog_orders: [order], sales_catalog_payment_sessions: [session] });
  expect(await checkout.loadFollowUpCheckout(db.client as never, "org", "lead", "order")).toBe("https://fixture.invalid/checkout/session");
  expect(await checkout.loadFollowUpCheckout(db.client as never, "org", "other", "order")).toBe("");
  expect(await checkout.loadFollowUpCheckout(db.client as never, "other", "lead", "order")).toBe("");
});
it.each([{ status: "paid" }, { amount: 91 }, { metadata: { gateway_request_inflight: true } }, { expires_at: "2000-01-01" }, { organization_id: "other" }])("does not offer an unusable checkout: %j", patch => {
  const db = commerceDatabase({ ...products, sales_catalog_orders: [order], sales_catalog_payment_sessions: [{ ...session, ...patch }] });
  return expect(checkout.loadFollowUpCheckout(db.client as never, "org", "lead", "order")).resolves.toBe("");
});
it("does not resume checkout after a product changes to an appointment", async () => {
  const db = commerceDatabase({ ...products, sales_catalog_orders: [order], sales_catalog_payment_sessions: [session] });
  db.tables.intelligence_memory[0].metadata = { sales_destination: "appointment" };
  expect(await checkout.loadFollowUpCheckout(db.client as never,"org","lead","order")).toBe("");
});
it.each(["card", "pix"])("keeps the latest customer choice (%s) on the follow-up button without changing the charge", async method => {
  const db = commerceDatabase({ ...products,
    sales_catalog_orders: [{ ...order, conversation_id: "conversation", metadata: { whatsapp_instance_id: "instance" } }],
    sales_catalog_payment_sessions: [{ ...session, method: "pix" }],
    leads: [{ id: "lead", organization_id: "org", metadata: { checkout_runtime_state: {
      order_id: "order", organization_id: "org", conversation_id: "conversation", instance_id: "instance", preferred_payment_method: method,
    } } }],
  });
  expect(await checkout.loadFollowUpCheckout(db.client as never, "org", "lead", "order"))
    .toBe(`https://fixture.invalid/checkout/session?payment_method=${method}`);
  expect(db.tables.sales_catalog_payment_sessions).toHaveLength(1);
  expect(db.tables.sales_catalog_payment_sessions[0].method).toBe("pix");
});
it.each(["order_id", "organization_id", "conversation_id", "instance_id"])("ignores a preference from another %s in the follow-up", async field => {
  const db = commerceDatabase({ ...products,
    sales_catalog_orders: [{ ...order, conversation_id: "conversation", metadata: { whatsapp_instance_id: "instance" } }],
    sales_catalog_payment_sessions: [session],
    leads: [{ id: "lead", organization_id: "org", metadata: { checkout_runtime_state: {
      order_id: "order", organization_id: "org", conversation_id: "conversation", instance_id: "instance", preferred_payment_method: "card", [field]: "another",
    } } }],
  });
  expect(await checkout.loadFollowUpCheckout(db.client as never, "org", "lead", "order")).toBe("https://fixture.invalid/checkout/session");
});
it("distinguishes a missing purchase button from the unsubscribe action", () => {
  expect(checkout.claimsMissingFollowUpCheckout("Conseguiu visualizar o botão de checkout?", "")).toBe(true);
  expect(checkout.claimsMissingFollowUpCheckout("Precisa de ajuda com seu pedido?", "")).toBe(false);
  expect(checkout.claimsMissingFollowUpCheckout("Continue pelo botão de pagamento.", "https://fixture.invalid/checkout/session")).toBe(false);
});
it("sends two URL buttons without duplicate links in text, retaining unrelated URLs", async () => {
  const buy = "https://fixture.invalid/checkout/session", exit = "https://fixture.invalid/sair";
  const send = vi.fn(async (path: string, body: Record<string, unknown>) => { void path; void body; return { ok: true, status: 200 }; });
  await sendLeadContactMessage(send, { ...leadContactMessage(`Continue seu pedido. https://fixture.invalid/ajuda\n${buy}`, exit, [`Continuar pagamento|${buy}`]), hideButtonLinks: true }, async () => true);
  expect(send.mock.calls[0][1]).toMatchObject({ choices: [`Continuar pagamento|${buy}`, `Sair da lista|${exit}`], text: "Continue seu pedido. https://fixture.invalid/ajuda" });
});
it("uses text with both links only after explicit format rejection", async () => {
  const buy = "https://fixture.invalid/checkout/session", exit = "https://fixture.invalid/sair";
  const send = vi.fn(async (path: string, body: Record<string, unknown>) => { void path; void body; return { ok: false, status: 400 }; });
  await sendLeadContactMessage(send, { ...leadContactMessage(`Continue o pedido: ${buy}`, exit, [`Continuar pagamento|${buy}`]), hideButtonLinks: true }, async () => true);
  expect(send.mock.calls[1][0]).toBe("/send/text");
  expect(send.mock.calls[1][1].text).toContain(buy);
  expect(send.mock.calls[1][1].text).toContain(exit);
});
