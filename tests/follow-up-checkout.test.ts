import { expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { leadContactMessage, sendLeadContactMessage } from "../src/lib/automations/lead-contact-message";
const module = serverModuleHarness<typeof import("../src/lib/whatsapp/follow-up-checkout")>("src/lib/whatsapp/follow-up-checkout.ts", {
  "@/lib/sales-catalog/mercado-pago": { buildSalesCatalogCheckoutUrl: (id: string) => `https://fixture.invalid/checkout/${id}`, normalizeCurrencyAmount: (n: unknown) => Number(n) || null },
});
const order = { id: "order", organization_id: "org", lead_id: "lead", status: "pending_payment", payment_status: "pending", total: 90, latest_payment_session_id: "session" };
const session = { id: "session", organization_id: "org", order_id: "order", status: "pending", amount: 90, metadata: {} };
const products = { sales_catalog_order_items: [{ organization_id: "org", order_id: "order", catalog_item_id: "product" }], intelligence_memory: [{ id: "product", organization_id: "org", scope: "organization", memory_type: "sales_catalog_item", metadata: { sales_destination: "connectyhub_checkout" } }] };
it("uses an existing checkout owned by the same lead and organization", async () => {
  const db = commerceDatabase({ ...products, sales_catalog_orders: [order], sales_catalog_payment_sessions: [session] });
  expect(await module.loadFollowUpCheckout(db.client as never, "org", "lead", "order")).toBe("https://fixture.invalid/checkout/session");
  expect(await module.loadFollowUpCheckout(db.client as never, "org", "other", "order")).toBe("");
  expect(await module.loadFollowUpCheckout(db.client as never, "other", "lead", "order")).toBe("");
});
it.each([{ status: "paid" }, { amount: 91 }, { metadata: { gateway_request_inflight: true } }, { expires_at: "2000-01-01" }, { organization_id: "other" }])("does not offer an unusable checkout: %j", patch => {
  const db = commerceDatabase({ ...products, sales_catalog_orders: [order], sales_catalog_payment_sessions: [{ ...session, ...patch }] });
  return expect(module.loadFollowUpCheckout(db.client as never, "org", "lead", "order")).resolves.toBe("");
});
it("does not resume checkout after a product changes to an appointment", async () => {
  const db = commerceDatabase({ ...products, sales_catalog_orders: [order], sales_catalog_payment_sessions: [session] });
  db.tables.intelligence_memory[0].metadata = { sales_destination: "appointment" };
  expect(await module.loadFollowUpCheckout(db.client as never,"org","lead","order")).toBe("");
});
it("distinguishes a missing purchase button from the unsubscribe action", () => {
  expect(module.claimsMissingFollowUpCheckout("Conseguiu visualizar o botão de checkout?", "")).toBe(true);
  expect(module.claimsMissingFollowUpCheckout("Precisa de ajuda com seu pedido?", "")).toBe(false);
  expect(module.claimsMissingFollowUpCheckout("Continue pelo botão de pagamento.", "https://fixture.invalid/checkout/session")).toBe(false);
});
it("sends two URL buttons without duplicate links in text, retaining unrelated URLs", async () => {
  const buy = "https://fixture.invalid/checkout/session", exit = "https://fixture.invalid/sair";
  const send = vi.fn(async (_path: string, _body: Record<string, unknown>) => ({ ok: true, status: 200 }));
  await sendLeadContactMessage(send, { ...leadContactMessage(`Continue seu pedido. https://fixture.invalid/ajuda\n${buy}`, exit, [`Continuar pagamento|${buy}`]), hideButtonLinks: true }, async () => true);
  expect(send.mock.calls[0][1]).toMatchObject({ choices: [`Continuar pagamento|${buy}`, `Sair da lista|${exit}`], text: "Continue seu pedido. https://fixture.invalid/ajuda" });
});
it("uses text with both links only after explicit format rejection", async () => {
  const buy = "https://fixture.invalid/checkout/session", exit = "https://fixture.invalid/sair";
  const send = vi.fn(async (_path: string, _body: Record<string, unknown>) => ({ ok: false, status: 400 }));
  await sendLeadContactMessage(send, { ...leadContactMessage(`Continue o pedido: ${buy}`, exit, [`Continuar pagamento|${buy}`]), hideButtonLinks: true }, async () => true);
  expect(send.mock.calls[1][0]).toBe("/send/text");
  expect(send.mock.calls[1][1].text).toContain(buy);
  expect(send.mock.calls[1][1].text).toContain(exit);
});
