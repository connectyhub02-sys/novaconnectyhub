import { describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
function fixture(resolution = "unconfirmed", origin?: string, timeout = false, lookupFailure = false) {
  const db = commerceDatabase({
    sales_catalog_payment_reviews: [{ id: "review", organization_id: "org", lead_id: "lead", conversation_id: "conversation", order_id: "order", status: "resolved", resolution, resolution_notice_state: "pending" }],
    conversations: [{ id: "conversation", organization_id: "org", lead_id: "lead", whatsapp_instance_id: "instance", provider_chat_id: "chat" }],
    leads: [{ id: "lead", organization_id: "org", phone_number: "11999999999" }],
    whatsapp_instances: [{ id: "instance", organization_id: "org", instance_token_encrypted: "test" }],
    sales_catalog_orders: [{ id: "order", organization_id: "org", payment_status: resolution === "confirmed" ? "confirmed" : "failed", metadata: { financial_confirmation: { origin } } }],
  }, lookupFailure ? { table: "sales_catalog_orders", operation: "select" } : undefined);
  const fetch = vi.fn(async () => { if (timeout) throw Error("timeout"); return new Response(JSON.stringify({ messageid: "provider-id" })); });
  const resolutionService = serverModuleHarness<typeof import("../src/lib/sales-catalog/payment-review-resolution")>("src/lib/sales-catalog/payment-review-resolution.ts", {
    "@/lib/billing/contract-access": { getContractAccess: async () => ({ allowed: true }), assertContractAccess: async () => ({ allowed: true }) },
    "@/lib/security/credentials-crypto": { decryptCredentialValue: () => "test" },
    "@/lib/whatsapp/uazapi-credentials": { loadUazapiCredentials: async () => ({ baseUrl: "https://provider.example.test" }) },
  }, [], { fetch });
  return { db, fetch, run: () => resolutionService.sendResolvedPaymentReviewNotices(db.client as never) };
}
describe("audited financial review return to the lead", () => {
  it("sends the unconfirmed result once and saves the conversation", async () => {
    const f = fixture(); await f.run(); await f.run();
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.db.tables.conversation_messages[0]).toMatchObject({ provider_message_id: "provider-id", text_content: expect.stringContaining("ainda não identificou") });
    expect(f.db.tables.sales_catalog_payment_reviews[0].resolution_notice_state).toBe("sent");
  });
  it("returns an authorized manual confirmation without duplicating provider confirmation", async () => {
    const manual = fixture("confirmed", "operator"); await manual.run();
    expect(manual.db.tables.conversation_messages[0].text_content).toContain("confirmou o recebimento");
    const provider = fixture("confirmed"); await provider.run();
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(provider.db.tables.sales_catalog_payment_reviews[0].resolution_notice_state).toBe("superseded");
  });
  it("does not blindly retry a message after an ambiguous timeout", async () => {
    const f = fixture("unconfirmed", undefined, true); await f.run(); await f.run();
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.db.tables.sales_catalog_payment_reviews[0].resolution_notice_state).toBe("unknown");
  });
  it("does not assert nonreceipt when the order cannot be read", async () => {
    const f = fixture("unconfirmed", undefined, false, true); await f.run();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.db.tables.sales_catalog_payment_reviews[0].resolution_notice_state).toBe("pending");
  });
});
