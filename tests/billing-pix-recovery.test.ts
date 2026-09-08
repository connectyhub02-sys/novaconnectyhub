import { describe, expect, it, vi } from "vitest";
import * as crypto from "node:crypto";
import * as references from "../src/lib/billing/payment-reference";
import * as customer from "../src/lib/sales-catalog/checkout-customer";
import { serverModuleHarness } from "./helpers/server-module-harness";

function gateway(failure: "customer" | "validation" | "timeout" | "server" | "qr" | "none") {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/customers")) {
      if (String(JSON.parse(String(init?.body ?? "{}"))?.externalReference ?? "").length > 100) return { ok: false, status: 400, json: async () => ({ errors: [{ description: "O identificador externo não deve ultrapassar 100 caracteres." }] }) };
      if (failure === "customer") throw new Error("Customer lookup unavailable");
      return { ok: true, status: 200, json: async () => url.includes("?") ? { data: [{ id: "cus_test" }] } : { id: "cus_test" } };
    }
    if (url.endsWith("/pixQrCode")) {
      if (failure === "qr") throw new Error("QR timeout");
      return { ok: true, status: 200, json: async () => ({ payload: "pix-test", encodedImage: "image" }) };
    }
    if (failure === "timeout") throw new Error("Charge timeout");
    if (String(JSON.parse(String(init?.body ?? "{}"))?.externalReference ?? "").length > 100) return { ok: false, status: 400, json: async () => ({ errors: [{ description: "externalReference exceeds 100 characters" }] }) };
    if (failure === "validation" || failure === "server") return { ok: false, status: failure === "validation" ? 400 : 500, json: async () => ({ errors: [{ code: "invalid", description: "Provider rejected request" }] }) };
    return { ok: true, status: 200, json: async () => ({ id: "pay_test", status: "PENDING" }) };
  });
  const api = serverModuleHarness<typeof import("../src/lib/sales-catalog/asaas")>("src/lib/sales-catalog/asaas.ts", { "./checkout-customer": customer, "node:crypto": crypto, "@/lib/billing/payment-reference": references }, [], { fetch });
  const create = () => api.createAsaasPixPayment({ accessToken: "test", mode: "sandbox", amount: 9.99, description: "Plano", externalReference: "invoice-test", payerEmail: "test@example.test", payerName: "Teste", payerDocument: "12345678909" });
  return { api, fetch, create };
}

describe("Pix creation failures and method switch", () => {
  it.each(["customer", "validation"] as const)("allows retry after a definitive %s failure", async failure => {
    const g = gateway(failure);
    await expect(g.create()).rejects.toMatchObject({ name: "AsaasPixCreationError", safeToRetry: true, providerPaymentId: null });
    if (failure === "customer") expect(g.fetch.mock.calls.some(([url]) => url.endsWith("/payments"))).toBe(false);
  });
  it.each(["timeout", "server", "qr"] as const)("keeps the hold after %s uncertainty", async failure => {
    await expect(gateway(failure).create()).rejects.toMatchObject({ safeToRetry: false, providerPaymentId: failure === "qr" ? "pay_test" : null });
  });
  it("returns the payment and QR from the same successful creation", async () => {
    await expect(gateway("none").create()).resolves.toMatchObject({ payment: { id: "pay_test" }, pixQrCode: { payload: "pix-test" } });
  });
  it("fits long customer references within Asaas limits without changing the payment identity", async () => {
    const g = gateway("none");
    const reference = "connectyhub_subscription:" + ["3f473c21-55aa-425a-a818-a5fa6d826748", "56351d8e-5e74-475e-8b59-e5dd57aea150", "b025a8a3-9d2f-479c-a3e0-c648dd2a4877", "a07c3e81-5434-4520-a531-cf38e3cfc8bf"].join(":");
    const create = (externalReference: string) => g.api.createAsaasPixPayment({ accessToken: "test", mode: "sandbox", amount: 9.99, description: "Plano", externalReference, payerName: "Teste", payerDocument: "12345678909" });
    await create(reference);
    await create(reference);
    await create(reference.replace("a07c3e81", "b07c3e81"));
    await create("x".repeat(100));
    const bodies = (endpoint: string) => g.fetch.mock.calls.filter(([url]) => url.endsWith(endpoint)).map(([, init]) => JSON.parse(String(init?.body)));
    const customers = bodies("/customers"), payments = bodies("/payments");
    expect(customers[0].externalReference.length).toBeLessThanOrEqual(100);
    expect(customers[1].externalReference).toBe(customers[0].externalReference);
    expect(customers[2].externalReference).not.toBe(customers[0].externalReference);
    expect(customers[3].externalReference).toBe("x".repeat(100));
    expect(payments[0].externalReference.length).toBeLessThanOrEqual(100);
    expect(references.expandPlatformBillingReference(payments[0].externalReference)).toBe(reference);
  });
  it("releases only a definitive failure with an unchanged claim; Pix becomes the active method", async () => {
    const { api } = gateway("none");
    const mod = serverModuleHarness<typeof import("../src/lib/billing/pix-creation")>("src/lib/billing/pix-creation.ts", { "@/lib/sales-catalog/asaas": api });
    const eq = vi.fn(() => q), update = vi.fn(() => q), maybeSingle = vi.fn(async () => ({ data: { id: "pay" }, error: null }));
    const q = { update, eq, select: () => q, maybeSingle };
    const client = { from: vi.fn(() => q) };
    const claim = { paymentId: "pay", organizationId: "org", updatedAt: "2026-09-08T03:00:00Z", payload: { pix_creation_pending: true } };
    expect(await mod.releaseFailedBillingPixClaim(client as never, claim, new api.AsaasPixCreationError("timeout", false))).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
    expect(await mod.releaseFailedBillingPixClaim(client as never, claim, new api.AsaasPixCreationError("invalid customer", true))).toBe(true);
    expect(eq.mock.calls).toEqual(expect.arrayContaining([["id", "pay"], ["organization_id", "org"], ["updated_at", claim.updatedAt], ["payload->>pix_creation_pending", "true"]]));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ pix_creation_pending: false }) }));
    maybeSingle.mockResolvedValueOnce({ data: null as never, error: null });
    expect(await mod.releaseFailedBillingPixClaim(client as never, claim, new api.AsaasPixCreationError("invalid", true))).toBe(false);
    expect(mod.billingUsesPix({ payment_method: "pix", native_card_attempt_id: "historical" })).toBe(true);
    expect(mod.billingUsesPix({ native_card_attempt_id: "current", payment_method: "card" })).toBe(false);
  });
});
