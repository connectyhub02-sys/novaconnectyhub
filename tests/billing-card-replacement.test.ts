import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as cardInput from "../src/lib/sales-catalog/card-input";
import * as cardBrand from "../src/lib/sales-catalog/card-brand";
import * as replacementInput from "../src/lib/billing/replacement-card-input";
import * as pixAvailability from "../src/lib/billing/pix-automatic-availability";
import * as policy from "../src/lib/billing/managed-renewal-policy";
import * as diagnostics from "../src/lib/sales-catalog/payment-diagnostics";
import * as guard from "../src/lib/security/public-request-guard";

const card = { number: "4111111111111111", holderName: "Pessoa Teste", expiryMonth: "12", expiryYear: "2035", ccv: "123" };
const holder = { name: "Pessoa Teste", email: "teste@example.test", cpfCnpj: "12345678909", phone: "11999999999", postalCode: "01001000", addressNumber: "10" };
const scope = { organizationId: randomUUID(), actorId: randomUUID(), subscriptionId: randomUUID() };
const body = () => ({ requestId: randomUUID(), card, holder, acceptReplacement: true, consentVersion: policy.replacementConsentVersion });

function harness(options: { blocked?: string; replay?: string; providerStatus?: number; failBegin?: boolean; failFinish?: boolean; configFailure?: boolean } = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(options.providerStatus ? { errors: [{ code: options.providerStatus === 400 ? "invalid_creditCard" : "forbidden", description: `${card.number} ${card.ccv} NEVER_ECHO` }] } : { creditCardToken: "sensitive-provider-token", creditCardNumber: card.number }), { status: options.providerStatus ?? 200 }));
  const adapter = serverModuleHarness<typeof import("../src/lib/sales-catalog/asaas-direct")>("src/lib/sales-catalog/asaas-direct.ts", { "./payment-diagnostics": diagnostics }, [], { fetch });
  const encrypted = "v1:encrypted:fixture:token-ciphertext";
  const encryptCredentialValue = vi.fn(() => encrypted);
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "begin_billing_card_replacement") return { error: options.failBegin ? {} : null, data: { claimed: !options.blocked && !options.replay, state: options.blocked ? "failed" : options.replay ?? "processing", result_code: options.blocked, customer_id: "cus_existing" } };
    if (name === "finish_billing_card_replacement_profile") return { error: options.failFinish ? {} : null, data: { state: args.p_failure ? "failed" : "succeeded", result_code: args.p_failure ?? "replaced" } };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const api = serverModuleHarness<typeof import("../src/lib/billing/card-replacement")>("src/lib/billing/card-replacement.ts", {
    "@/lib/security/credentials-crypto": { encryptCredentialValue },
    "@/lib/sales-catalog/asaas": { loadAsaasPlatformBillingConfig: async () => { if (options.configFailure) throw new Error("secret diagnostic"); return { accessToken: "fixture-api-key", mode: "sandbox" }; } },
    "@/lib/sales-catalog/asaas-direct": adapter,
    "@/lib/sales-catalog/card-input": cardInput,
    "./managed-renewal-policy": policy,
    "./replacement-card-input": replacementInput,
    "./pix-automatic-availability": pixAvailability,
    "@/lib/sales-catalog/card-brand": cardBrand,
  });
  const client = { rpc } as unknown as Parameters<typeof api.replaceSubscriptionCard>[0];
  return { api, fetch, rpc, client, encrypted, encryptCredentialValue };
}

describe("card replacement service and provider boundary", () => {
  it.each(["pix_automatic", "unknown"])("never creates a financial operation for unsupported method %s", async method => {
    const h = harness();
    const code = method === "pix_automatic" ? "pix_automatic_unavailable" : "invalid_input";
    await expect(h.api.replaceSubscriptionCard(h.client, scope, { ...body(), method }, "203.0.113.1")).rejects.toMatchObject({ code });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.rpc.mock.calls[1][1].p_failure).toBe(code);
  });
  it("calls only standalone tokenization with the original customer and stores only ciphertext/last four", async () => {
    const h = harness();
    const result = await h.api.replaceSubscriptionCard(h.client, scope, body(), "203.0.113.1");
    expect(result.ok).toBe(true);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.fetch.mock.calls[0][0]).toBe("https://api-sandbox.asaas.com/v3/creditCard/tokenizeCreditCard");
    const sent = JSON.parse((h.fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toEqual({ customer: "cus_existing", creditCard: card, creditCardHolderInfo: holder, remoteIp: "203.0.113.1" });
    expect(h.rpc.mock.calls[1][1]).toMatchObject({ p_token_encrypted: h.encrypted, p_last_four: "1111", p_failure: null, p_card_metadata: { brand: "visa", exp_month: "12", exp_year: "2035" }, p_holder: holder });
    for (const text of [JSON.stringify(h.rpc.mock.calls), JSON.stringify(result)]) {
      expect(text).not.toContain(card.number); expect(text).not.toContain("sensitive-provider-token"); expect(text).not.toContain("ccv"); expect(text).not.toContain("creditCardToken");
    }
  });
  it.each(["forbidden", "not_found", "inactive_plan", "automatic_renewal_required", "unsupported_provider", "billing_busy"])("never contacts the gateway for %s", async blocked => {
    const h = harness({ blocked });
    await expect(h.api.replaceSubscriptionCard(h.client, scope, body(), "203.0.113.1")).rejects.toMatchObject({ code: blocked });
    expect(h.fetch).not.toHaveBeenCalled(); expect(h.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([[400, "tokenization_rejected"], [403, "gateway_configuration"], [503, "gateway_unavailable"]] as const)("records a sanitized error for HTTP %s", async (providerStatus, code) => {
    const h = harness({ providerStatus });
    await expect(h.api.replaceSubscriptionCard(h.client, scope, body(), "203.0.113.1")).rejects.toMatchObject({ code });
    expect(h.rpc.mock.calls[1][1]).toMatchObject({ p_token_encrypted: null, p_failure: code });
    expect(JSON.stringify(h.rpc.mock.calls)).not.toContain("NEVER_ECHO");
  });
  it("keeps validation and missing consent out of the gateway", async () => {
    const h = harness();
    await expect(h.api.replaceSubscriptionCard(h.client, scope, { ...body(), acceptReplacement: false }, "203.0.113.1")).rejects.toMatchObject({ code: "invalid_input" });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.rpc.mock.calls[1][1].p_failure).toBe("invalid_input");
  });
  it("requires a durable audit before tokenizing", async () => {
    const h = harness({ failBegin: true });
    await expect(h.api.replaceSubscriptionCard(h.client, scope, body(), "203.0.113.1")).rejects.toMatchObject({ code: "internal_error" });
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("does not overwrite a potentially committed success when the database response is lost", async () => {
    const h = harness({ failFinish: true });
    await expect(h.api.replaceSubscriptionCard(h.client, scope, body(), "203.0.113.1")).rejects.toMatchObject({ code: "internal_error" });
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });
  it("recovers success on replay without retokenizing", async () => {
    const h = harness({ replay: "succeeded" });
    expect(await h.api.replaceSubscriptionCard(h.client, scope, body(), "203.0.113.1")).toMatchObject({ ok: true });
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("reports a missing credential without leaking its diagnostic", async () => {
    const h = harness({ configFailure: true });
    await expect(h.api.replaceSubscriptionCard(h.client, scope, body(), "203.0.113.1")).rejects.toMatchObject({ code: "gateway_configuration" });
    expect(h.fetch).not.toHaveBeenCalled();
  });
});

describe("cookie-authenticated payment method route", () => {
  function route(authenticated = true) {
    const h = harness();
    const replace = vi.fn<(...args: Parameters<typeof h.api.replaceSubscriptionCard>) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    const read = vi.fn(async () => ({ eligible: true }));
    const api = serverModuleHarness<typeof import("../src/app/api/dashboard/billing/subscriptions/[subscriptionId]/payment-method/route")>("src/app/api/dashboard/billing/subscriptions/[subscriptionId]/payment-method/route.ts", {
      "next/server": { NextResponse },
      "@/lib/supabase/profile": { getCurrentWorkspace: async () => authenticated ? { user: { id: scope.actorId }, organization: { id: scope.organizationId } } : null },
      "@/lib/supabase/service": { createServiceClient: () => h.client },
      "@/lib/billing/card-replacement": { ...h.api, replaceSubscriptionCard: replace, readCardReplacement: read },
      "@/lib/security/public-request-guard": guard,
    });
    return { api, replace, read };
  }
  const url = `https://example.test/api/dashboard/billing/subscriptions/${scope.subscriptionId}/payment-method`;
  const context = { params: Promise.resolve({ subscriptionId: scope.subscriptionId }) };
  function request(origin = "https://example.test", extra = {}) { return new NextRequest(url, { method: "POST", headers: { origin, "Content-Type": "application/json", "x-forwarded-for": randomUUID() }, body: JSON.stringify({ ...body(), ...extra }) }); }
  it("requires login and rejects cross-origin requests", async () => {
    expect((await route(false).api.POST(request(), context)).status).toBe(401);
    const h = route();
    expect((await h.api.POST(request("https://attacker.test"), context)).status).toBe(403);
    expect(h.replace).not.toHaveBeenCalled();
  });
  it("derives organization and actor from the session, ignoring submitted identities", async () => {
    const h = route();
    const response = await h.api.POST(request(undefined, { organizationId: randomUUID(), actorId: randomUUID() }), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(h.replace.mock.calls[0][1]).toEqual(scope);
  });
  it("does not mutate on GET", async () => {
    const h = route();
    expect((await h.api.GET(new NextRequest(url), context)).status).toBe(200);
    expect(h.read).toHaveBeenCalledOnce(); expect(h.replace).not.toHaveBeenCalled();
  });
  it("rejects oversized JSON even without content-length", async () => {
    const h = route();
    expect((await h.api.POST(request(undefined, { extra: "x".repeat(12001) }), context)).status).toBe(413);
    expect(h.replace).not.toHaveBeenCalled();
  });
});
