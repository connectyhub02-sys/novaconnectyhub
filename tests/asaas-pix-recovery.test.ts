import * as crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { compactPlatformBillingReference } from "@/lib/billing/payment-reference";
import { parseCheckoutAddress } from "@/lib/sales-catalog/checkout-customer";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type * as Asaas from "@/lib/sales-catalog/asaas";
import type * as Sessions from "@/lib/sales-catalog/payment-sessions";

type ResponseFixture = { status?: number; body?: unknown; timeout?: boolean };
const payer = { payerName: "Maria Exemplo", payerEmail: "maria@example.test", payerDocument: "12345678909", payerPhone: "5548999990000" };
const input = { accessToken: "fixture-not-a-secret", mode: "sandbox" as const, amount: 90, description: "Curso de desenho", externalReference: "fixture-pix", ...payer };

function adapter(fixtures: ResponseFixture[]) {
  const fetch = vi.fn(async (url: string) => {
    expect(url).toMatch(/^https:\/\/api-sandbox\.asaas\.com\/v3\//);
    const next = fixtures.shift();
    if (!next) throw new Error("Unexpected extra provider request");
    if (next.timeout) throw new Error("Simulated timeout");
    const status = next.status ?? 200;
    return { status, ok: status < 400, json: async () => next.body };
  });
  const api = serverModuleHarness<typeof Asaas>("src/lib/sales-catalog/asaas.ts", {
    "node:crypto": crypto,
    "./checkout-customer": { parseCheckoutAddress },
    "@/lib/billing/payment-reference": { compactPlatformBillingReference },
  }, [], { fetch, Error });
  return { api, fetch };
}

const invalidDocument = { status: 400, body: { errors: [{ code: "invalid_object", description: "O CPF/CNPJ informado é inválido. fixture-private-provider-body" }] } };

describe("Asaas Pix failures describe whether a charge could exist", () => {
  it.each(["invalid_object", "invalid_cpfCnpj"])("returns a bounded document correction for %s before creating a payment", async code => {
    const a = adapter([{ status: 400, body: { errors: [{ code, description: "O CPF/CNPJ informado é inválido. fixture-private-provider-body" }] } }]);
    const error = await a.api.createAsaasPixPayment(input).catch(error => error);
    expect(error).toBeInstanceOf(a.api.AsaasPixCreationError);
    expect(error).toMatchObject({ safeToRetry: true, providerPaymentId: null,
      paymentRecovery: { safe_to_retry: true, stage: "customer_create", category: "validation", field: "customer_document" } });
    expect(error.message).toContain("CPF ou CNPJ");
    expect(error.message).not.toContain("fixture-private-provider-body");
    expect(JSON.stringify(error.paymentRecovery)).not.toContain("fixture-private-provider-body");
    expect(a.fetch.mock.calls.map(call => call[0])).toEqual(["https://api-sandbox.asaas.com/v3/customers"]);
  });

  it.each([
    { code: "unknown-provider-code", description: "CPF inválido" },
    { code: "invalid_object", description: "Confira o cadastro" },
  ])("does not invent a correction field from an unclassified error %j", async error => {
    const a = adapter([{ status: 400, body: { errors: [error] } }]);
    const result = await a.api.createAsaasPixPayment(input).catch(error => error);
    expect(result.paymentRecovery).toEqual({ safe_to_retry: true, stage: "customer_create", category: "validation" });
  });

  it("does not silently choose one field when several fields were rejected", async () => {
    const a = adapter([{ status: 422, body: { errors: [{ code: "invalid_cpfCnpj" }, { code: "invalid_object", description: "E-mail inválido" }] } }]);
    const result = await a.api.createAsaasPixPayment(input).catch(error => error);
    expect(result.paymentRecovery.field).toBeUndefined();
  });

  it.each([{ timeout: true }, { status: 500, body: {} }, { status: 403, body: { errors: [{ code: "forbidden" }] } }])(
    "distinguishes customer preparation failure from a possibly submitted charge: %j", async failure => {
      const a = adapter([failure]);
      const result = await a.api.createAsaasPixPayment(input).catch(error => error);
      expect(result.safeToRetry).toBe(true);
      expect(result.paymentRecovery).toMatchObject({ stage: "customer_create", category: failure.status === 403 ? "integration" : "unknown" });
      expect(a.fetch).toHaveBeenCalledOnce();
    });

  it.each([{ timeout: true }, { status: 500, body: {} }, { status: 200, body: {} }])(
    "keeps the result uncertain after a payment request: %j", async failure => {
      const a = adapter([{ body: { id: "customer-fixture" } }, failure]);
      const result = await a.api.createAsaasPixPayment(input).catch(error => error);
      expect(result).toMatchObject({ safeToRetry: false, providerPaymentId: null,
        paymentRecovery: { safe_to_retry: false, stage: "payment_create", category: "unknown" } });
      expect(a.fetch.mock.calls.map(call => call[0])).toEqual([
        "https://api-sandbox.asaas.com/v3/customers", "https://api-sandbox.asaas.com/v3/payments",
      ]);
    });

  it("retains a known payment ID when obtaining the QR code fails", async () => {
    const a = adapter([{ body: { id: "customer-fixture" } }, { body: { id: "payment-fixture" } }, { timeout: true }]);
    const result = await a.api.createAsaasPixPayment(input).catch(error => error);
    expect(result).toMatchObject({ safeToRetry: false, providerPaymentId: "payment-fixture",
      paymentRecovery: { safe_to_retry: false, stage: "pix_qr_code", category: "unknown" } });
    expect(a.fetch).toHaveBeenCalledTimes(3);
  });

  it("allows correction of a definitive payment validation failure without repeating the request", async () => {
    const a = adapter([{ body: { id: "customer-fixture" } }, { status: 422, body: { errors: [{ code: "invalid_value" }] } }]);
    const result = await a.api.createAsaasPixPayment(input).catch(error => error);
    expect(result).toMatchObject({ safeToRetry: true,
      paymentRecovery: { safe_to_retry: true, stage: "payment_create", category: "validation" } });
    expect(a.fetch).toHaveBeenCalledTimes(2);
  });

  it("reads only the recovery contract and rejects contradictory QR recovery", () => {
    const { api } = adapter([]);
    const known = { safe_to_retry: true, stage: "customer_create", category: "validation", field: "customer_document" };
    expect(api.readAsaasPaymentRecovery({ ...known, raw: "fixture-private-provider-body" })).toEqual(known);
    expect(api.readAsaasPaymentRecovery({ ...known, stage: "pix_qr_code" })).toBeNull();
    expect(api.readAsaasPaymentRecovery({ ...known, category: "unknown" })).toBeNull();
    expect(api.readAsaasPaymentRecovery({ ...known, field: "credit_card_number" })).toBeNull();
    expect(api.readAsaasPaymentRecovery({ ...known, safe_to_retry: "true" })).toBeNull();
    expect(new api.AsaasPixCreationError("Known charge", true, "payment-fixture").safeToRetry).toBe(false);
    expect(new api.AsaasPixCreationError("Known charge", true, null, { stage: "pix_qr_code", category: "unknown" }).safeToRetry).toBe(false);
  });

  const legacy = { provider: "asaas", method: "pix", status: "error", provider_status: "gateway_error", provider_payment_id: null,
    failure_reason: "O CPF/CNPJ informado é inválido.", metadata: { gateway_error: "O CPF/CNPJ informado é inválido.", gateway_request_inflight: true } };
  it("recognizes the exact legacy customer rejection without changing the session", () => {
    const { api } = adapter([]);
    const before = structuredClone(legacy);
    expect(api.readAsaasPixSessionRecovery(legacy)).toEqual({ safe_to_retry: true, stage: "customer_create", category: "validation", field: "customer_document" });
    expect(legacy).toEqual(before);
  });
  it.each([
    { provider: "another-provider" }, { method: "card" }, { status: "pending" }, { provider_status: "unknown" },
    { provider_payment_id: "known-payment" }, { provider_payment_id: undefined }, { failure_reason: "Timeout" },
    { metadata: { ...legacy.metadata, gateway_error: "Timeout" } },
    { metadata: { ...legacy.metadata, gateway_request_inflight: false } },
    { metadata: { ...legacy.metadata, payment_recovery: {} } },
  ])("does not infer a safe legacy retry from partial or conflicting evidence %j", patch => {
    expect(adapter([]).api.readAsaasPixSessionRecovery({ ...legacy, ...patch })).toBeNull();
  });
});

function sessionScenario(fixtures: ResponseFixture[], failSave = false) {
  const a = adapter(fixtures);
  const order = { id: "order-fixture", organization_id: "store-fixture", lead_id: "lead-fixture", conversation_id: "conversation-fixture",
    customer_name: payer.payerName, customer_email: payer.payerEmail, customer_document: payer.payerDocument, customer_phone: payer.payerPhone,
    destination_cep: null, destination_address: null, shipping_method: null, subtotal: "90,00", shipping_total: "0", total: "90,00", checkout_revision: 3, metadata: {} };
  const db = commerceDatabase({ sales_catalog_orders: [order], sales_catalog_order_items: [{ id: "item-fixture", order_id: order.id,
    title: "Curso de desenho", quantity: 1, unit_price: "90,00", total: "90,00", fulfillment: { mode: "digital" }, metadata: {} }] },
  failSave ? { table: "sales_catalog_payment_sessions", operation: "update" } : undefined);
  const rpc = vi.fn(async (name: string, args: Record<string, string>) => {
    if (name === "begin_checkout_gateway_request") {
      const session = db.tables.sales_catalog_payment_sessions.find(row => row.id === args.p_session_id)!;
      session.metadata = { ...session.metadata as Record<string, unknown>, gateway_request_inflight: true };
    }
    return { data: null, error: null };
  });
  const client = { ...db.client, rpc };
  const api = serverModuleHarness<typeof Sessions>("src/lib/sales-catalog/payment-sessions.ts", {
    "node:crypto": crypto,
    "./asaas": { ...a.api, ensureAsaasAccessToken: async () => ({ id: "integration-fixture", accessToken: input.accessToken, mode: "sandbox" }) },
    "./checkout-customer": { loadCheckoutCustomer: async (_client: unknown, _org: unknown, row: unknown) => row },
    "@/lib/billing/contract-access": { assertContractAccess: async () => undefined },
    "@/lib/commerce/store-payment-guard": { assertStoreAgreementPayable: async () => undefined },
    "@/lib/client-os/sales-catalog": { getOrganizationSalesCatalogSettings: async () => null,
      mapSalesCatalogPaymentSession: (row: Record<string, unknown>) => ({ ...row, providerStatus: row.provider_status, failureReason: row.failure_reason }) },
    "@/lib/sales-catalog/checkout-guards": { requiresSalesCatalogShippingBeforePayment: () => false },
    "@/lib/platform-product-sales": { resolveSalesCatalogOrderPaymentOwner: async () => ({ owner: "client", commercialFlowType: "client_direct",
      revenueOwnerType: "client", commissionEligible: false, platformProductIds: [], catalogItemIds: ["product-fixture"] }) },
    "./mercado-pago": { normalizeCurrencyAmount: (value: unknown) => value == null ? null : Number(String(value).replace(",", ".")),
      buildSalesCatalogCheckoutUrl: (id: string) => `https://shop.example/checkout/${id}`, buildMercadoPagoAdditionalInfo: () => ({}) },
  }, [], { Error });
  const run = () => api.createSalesCatalogPixPaymentSession({ client: client as never, organizationId: order.organization_id,
    orderId: order.id, preferredMethod: "pix", source: "whatsapp_agent" });
  return { ...a, db, run, rpc };
}

describe("Pix session recovery persists the provider boundary", () => {
  it("releases a customer validation reservation and requests correction without retrying the document", async () => {
    const s = sessionScenario([invalidDocument]);
    const result = await s.run();
    const recovery = { safe_to_retry: true, stage: "customer_create", category: "validation", field: "customer_document" };
    expect(result).toMatchObject({ gatewayUnavailable: true, paymentRecovery: recovery });
    expect(s.db.tables.sales_catalog_payment_sessions).toHaveLength(1);
    expect(s.db.tables.sales_catalog_payment_sessions[0]).toMatchObject({ status: "error", metadata: { gateway_request_inflight: false, payment_recovery: recovery, checkout_revision: 3 } });
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
    expect(s.db.tables.sales_catalog_orders[0]).toMatchObject({ customer_document: payer.payerDocument, total: "90,00" });
    expect(s.fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("fixture-private-provider-body");
  });

  it("keeps a payment timeout reserved even when the provider has not returned an ID", async () => {
    const s = sessionScenario([{ body: { id: "customer-fixture" } }, { timeout: true }]);
    const result = await s.run();
    expect(result).toMatchObject({ gatewayUnavailable: true, paymentRecovery: { safe_to_retry: false, stage: "payment_create" } });
    expect(s.db.tables.sales_catalog_payment_sessions[0]).toMatchObject({ status: "error", metadata: { gateway_request_inflight: true } });
    expect(s.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the known Pix payment available for reconciliation when the QR endpoint fails", async () => {
    const s = sessionScenario([{ body: { id: "customer-fixture" } }, { body: { id: "payment-fixture" } }, { status: 500, body: {} }]);
    const result = await s.run();
    expect(result).toMatchObject({ paymentRecovery: { safe_to_retry: false, stage: "pix_qr_code" } });
    expect(s.db.tables.sales_catalog_payment_sessions[0]).toMatchObject({ provider_payment_id: "payment-fixture", status: "error",
      metadata: { gateway_request_inflight: true } });
    expect(s.db.tables.sales_catalog_orders[0].metadata).toMatchObject({ latest_provider_payment_id: "payment-fixture" });
    expect(s.fetch).toHaveBeenCalledTimes(3);
  });

  it("does not report an available retry if the recovery state was not saved", async () => {
    const s = sessionScenario([invalidDocument], true);
    await expect(s.run()).rejects.toThrow("Não foi possível registrar o resultado");
    expect(s.db.tables.sales_catalog_payment_sessions[0].metadata).toMatchObject({ gateway_request_inflight: true });
    expect(s.fetch).toHaveBeenCalledOnce();
  });
});
