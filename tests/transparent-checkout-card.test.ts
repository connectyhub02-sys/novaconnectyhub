import { describe, expect, it, vi } from "vitest";
import { parseCheckoutCard, parseCheckoutCardHolder } from "../src/lib/sales-catalog/card-input";
import { sanitizePaymentAuditPayload } from "../src/lib/security/payment-audit";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as diagnostics from "../src/lib/sales-catalog/payment-diagnostics";

const card = { holderName: "Cliente de teste", number: "4111111111111111", expiryMonth: "12", expiryYear: "2030", ccv: "123" };
const holder = { name: "Cliente de teste", email: "teste@example.com", cpfCnpj: "12345678909", postalCode: "01001000", addressNumber: "10", phone: "11999999999" };

describe("transparent card boundaries", () => {
  it("normalizes formatted inputs and rejects invalid or expired cards", () => {
    expect(parseCheckoutCard({ ...card, number: "4111 1111 1111 1111" }, new Date("2026-09-05"))).toEqual(card);
    expect(() => parseCheckoutCard({ ...card, number: "4111111111111112" })).toThrow("número");
    expect(() => parseCheckoutCard({ ...card, expiryYear: "2020" })).toThrow("validade");
    expect(() => parseCheckoutCard({ ...card, ccv: "1" })).toThrow("segurança");
    expect(parseCheckoutCardHolder({ ...holder, phone: "+55 (11) 99999-9999" })).toEqual(holder);
  });
  it("strips card objects and credentials recursively from audit events", () => {
    const safe = sanitizePaymentAuditPayload({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_test", value: 110, creditCard: card, creditCardToken: "sensitive", creditCardHolderInfo: holder }, nested: [{ cvv: "123", authorization: "secret", status: "approved" }] });
    expect(safe).toEqual({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_test", value: 110 }, nested: [{ status: "approved" }] });
    expect(JSON.stringify(safe)).not.toContain(card.number);
  });
  it("makes exactly one charge request and returns only safe provider fields", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "cus_test" }] }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: "pay_test", status: "CONFIRMED", value: 110, externalReference: "checkout_card:fixture", billingType: "CREDIT_CARD", creditCard: card, creditCardToken: "secret" })));
    const adapter = serverModuleHarness<typeof import("../src/lib/sales-catalog/asaas-direct")>("src/lib/sales-catalog/asaas-direct.ts", { "./payment-diagnostics": diagnostics }, [], { fetch });
    const result = await adapter.createAsaasDirectCardPayment({ accessToken: "sandbox-secret", mode: "sandbox", amount: 110, card, holder, installments: 1, remoteIp: "203.0.113.10", externalReference: "checkout_card:fixture" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe("https://api-sandbox.asaas.com/v3/payments");
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body).toMatchObject({ value: 110, remoteIp: "203.0.113.10", externalReference: "checkout_card:fixture" });
    expect(body).not.toHaveProperty("installmentCount");
    expect(result.id).toBe("pay_test");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain(card.number);
  });
  it("never retries a timed-out charge and hides raw provider errors", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "cus_test" }] }))).mockRejectedValueOnce(new Error(`timeout ${card.number}`));
    const adapter = serverModuleHarness<typeof import("../src/lib/sales-catalog/asaas-direct")>("src/lib/sales-catalog/asaas-direct.ts", { "./payment-diagnostics": diagnostics }, [], { fetch });
    await expect(adapter.createAsaasDirectCardPayment({ accessToken: "secret", mode: "sandbox", amount: 110, card, holder, installments: 1, remoteIp: "203.0.113.10", externalReference: "test" })).rejects.toMatchObject({ definitive: false, message: "Estamos verificando o resultado do pagamento. Não repita a cobrança agora." });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("checks the sum of every installment and does not approve a partially settled purchase", async () => {
    const payment = { id: "pay_1", status: "CONFIRMED", value: 50, externalReference: "checkout_card:fixture", billingType: "CREDIT_CARD" };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [payment, { ...payment, id: "pay_2" }], hasMore: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [payment, { ...payment, id: "pay_2", value: 49 }], hasMore: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [payment, { ...payment, id: "pay_2", status: "PENDING" }], hasMore: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [payment], hasMore: true })));
    const adapter = serverModuleHarness<typeof import("../src/lib/sales-catalog/asaas-direct")>("src/lib/sales-catalog/asaas-direct.ts", { "./payment-diagnostics": diagnostics }, [], { fetch });
    const find = () => adapter.findAsaasDirectPayment({ accessToken: "test", mode: "sandbox" }, "checkout_card:fixture", { amount: 100, installments: 2 });
    expect(await find()).toMatchObject({ status: "CONFIRMED" });
    await expect(find()).rejects.toMatchObject({ definitive: false });
    expect(await find()).toMatchObject({ status: "PARTIALLY_SETTLED" });
    await expect(find()).rejects.toMatchObject({ definitive: false });
    expect(fetch.mock.calls.every(call => call[1].method === "GET")).toBe(true);
  });
  it("allows a safe retry when the customer lookup fails before charging", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("network"));
    const adapter = serverModuleHarness<typeof import("../src/lib/sales-catalog/asaas-direct")>("src/lib/sales-catalog/asaas-direct.ts", { "./payment-diagnostics": diagnostics }, [], { fetch });
    await expect(adapter.createAsaasDirectCardPayment({ accessToken: "test", mode: "sandbox", amount: 100, card, holder, installments: 1, remoteIp: "203.0.113.10", externalReference: "test" })).rejects.toMatchObject({ definitive: true, declined: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe("GET");
  });
  it("does not cancel a previous payment that the gateway already confirmed", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "pay_previous", status: "CONFIRMED" })));
    const adapter = serverModuleHarness<typeof import("../src/lib/sales-catalog/asaas-direct")>("src/lib/sales-catalog/asaas-direct.ts", { "./payment-diagnostics": diagnostics }, [], { fetch });
    await expect(adapter.retireAsaasPayment({ accessToken: "test", mode: "sandbox" }, "pay_previous", false)).rejects.toMatchObject({ definitive: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe("GET");
  });
});
