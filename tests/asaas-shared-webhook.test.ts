import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commerceDatabase } from "./helpers/commerce-database";
vi.mock("server-only", () => ({}));
import { saveAsaasPaymentIntegration, loadAsaasIntegrationSecrets, disconnectAsaasPaymentIntegration } from "@/lib/sales-catalog/asaas";
import { encryptCredentialValue } from "@/lib/security/credentials-crypto";
import { ensureSharedAsaasWebhook } from "@/lib/sales-catalog/asaas-shared-webhook";

const buffalo = "3f473c21-55aa-425a-a818-a5fa6d826748";
const pizza = "a90c4ce6-b66c-47c4-a3f3-660af7bb178d";
const url = "https://www.connectyhub.com.br/api/webhooks/asaas";
const legacySecret = "test-only-existing-secret-never-a-live-credential";
type Hook = { id: string; url: string; authToken: string; name?: string; events?: string[] };

function fixture(legacy = true) {
  const db = commerceDatabase({ sales_catalog_payment_integrations: legacy ? [{
    id: "integration-buffalo", organization_id: buffalo, provider: "asaas", mode: "production", status: "connected",
    access_token_encrypted: encryptCredentialValue("key-buffalo"), webhook_secret_encrypted: encryptCredentialValue(legacySecret),
    webhook_url: url, metadata: { webhook_provider_id: "hook-shared" }, updated_at: "2026-10-12",
  }] : [] });
  const accounts = new Map<string, Hook[]>([["shared", legacy ? [{ id: "hook-shared", url, authToken: legacySecret }] : []]]);
  let failUpdate = false;
  let creates = 0;
  const transport = vi.fn(async (target: string, init: RequestInit) => {
    const uri = new URL(target), path = uri.pathname.replace(/^\/v3/, "");
    const key = new Headers(init.headers).get("access_token");
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (key === "invalid") return reply({ errors: [{ description: "Invalid key" }] }, 401);
    const account = `${uri.hostname.includes("sandbox") ? "sandbox-" : ""}${key === "key-other" ? "other" : "shared"}`;
    if (!accounts.has(account)) accounts.set(account, []);
    const hooks = accounts.get(account)!;
    if (path === "/myAccount") return reply({ commercialName: "Conta de teste" }); // No account ID, like the real accounts.
    if (path === "/pix/addressKeys") return reply({ data: [] });
    if (path === "/webhooks" && init.method === "GET") return reply({ data: hooks, hasMore: false });
    if (path === "/webhooks" && init.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (hooks.some(h => h.url === body.url)) return reply({ errors: [{ description: "Já existe webhook com os mesmos atributos" }] }, 400);
      const hook = { ...body, id: `hook-${account}` }; hooks.push(hook); creates++; return reply(hook);
    }
    if (path.startsWith("/webhooks/") && init.method === "PUT") {
      if (failUpdate) return reply({ errors: [{ description: "Webhook temporarily unavailable" }] }, 503);
      const hook = hooks.find(h => h.id === path.slice(10));
      if (!hook) throw Error("Unexpected webhook update");
      Object.assign(hook, JSON.parse(String(init.body))); return reply(hook);
    }
    throw Error(`Unexpected provider call (charges forbidden): ${init.method} ${path}`);
  });
  vi.stubGlobal("fetch", transport);
  const connect = (organizationId: string, accessToken = organizationId === buffalo ? "key-buffalo" : "key-pizzeria", mode: "production" | "sandbox" = "production") =>
    saveAsaasPaymentIntegration({ client: db.client as never, organizationId, accessToken, mode });
  return { db, connect, accounts, transport, created: () => creates, fail: () => { failUpdate = true; } };
}

beforeEach(() => { vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "unit-test-only"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.connectyhub.com.br"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("BuffaloMass and Pizzaria sharing Asaas without charges", () => {
  it("preserves the live legacy secret while different API keys share one webhook", async () => {
    const f = fixture(); await f.connect(pizza);
    const a = await loadAsaasIntegrationSecrets(f.db.client as never, buffalo);
    const b = await loadAsaasIntegrationSecrets(f.db.client as never, pizza);
    expect(a?.webhookSecret).toBe(legacySecret); expect(b?.webhookSecret).toBe(legacySecret);
    expect(a?.accessToken).not.toBe(b?.accessToken);
    expect(f.accounts.get("shared")).toHaveLength(1); expect(f.created()).toBe(0);
    expect(f.db.tables.asaas_account_webhooks).toHaveLength(1);
  });
  it("keeps the other company working after disconnect and reconnect", async () => {
    const f = fixture(); await f.connect(pizza);
    await disconnectAsaasPaymentIntegration({ client: f.db.client as never, organizationId: buffalo });
    expect(await loadAsaasIntegrationSecrets(f.db.client as never, buffalo)).toBeNull();
    expect((await loadAsaasIntegrationSecrets(f.db.client as never, pizza))?.webhookSecret).toBe(legacySecret);
    await f.connect(buffalo); await f.connect(pizza, "key-pizzeria-new");
    expect(f.accounts.get("shared")?.[0].authToken).toBe(legacySecret);
    expect(f.created()).toBe(0);
  });
  it("converges simultaneous first connections and reconnects to one durable token", async () => {
    const f = fixture(false);
    await Promise.all([f.connect(buffalo), f.connect(pizza), f.connect("third-company")]);
    const secrets = await Promise.all([buffalo, pizza, "third-company"].map(id => loadAsaasIntegrationSecrets(f.db.client as never, id)));
    expect(new Set(secrets.map(s => s?.webhookSecret)).size).toBe(1);
    expect(secrets[0]?.webhookSecret).toBe(f.accounts.get("shared")?.[0].authToken);
    expect(f.created()).toBe(1);
  });
  it("separates other Asaas accounts and sandbox from production", async () => {
    const f = fixture(); await f.connect(pizza); await f.connect("other-company", "key-other"); await f.connect("sandbox-company", "key-pizzeria", "sandbox");
    expect(f.db.tables.asaas_account_webhooks).toHaveLength(3);
    expect(new Set(f.db.tables.asaas_account_webhooks.map(r => r.secret_hash)).size).toBe(3);
  });
  it("never adopts a webhook with the same name but a different URL", async () => {
    const f = fixture(false); f.accounts.get("shared")!.push({ id: "hook-unrelated", url: "https://other.test/webhooks", authToken: "unrelated", name: "ConnectyHub - Pagamentos" });
    await f.connect(pizza);
    expect(f.accounts.get("shared")?.[0].authToken).toBe("unrelated");
    expect(f.accounts.get("shared")).toHaveLength(2);
  });
  it("does not replace a working company integration when provisioning fails", async () => {
    const f = fixture(); f.fail();
    await expect(f.connect(buffalo, "replacement-key")).rejects.toThrow();
    expect((await loadAsaasIntegrationSecrets(f.db.client as never, buffalo))?.accessToken).toBe("key-buffalo");
    expect(f.accounts.get("shared")?.[0].authToken).toBe(legacySecret);
  });
  it("requires a validated credential before accessing shared webhook state", async () => {
    const f = fixture(); await expect(f.connect(pizza, "invalid")).rejects.toThrow();
    expect(f.transport.mock.calls.every(([target]) => !target.includes("/webhooks"))).toBe(true);
    expect(f.db.tables.sales_catalog_payment_integrations).toHaveLength(1);
  });
  it("fails closed on registry database failure instead of rotating a token", async () => {
    const db = commerceDatabase({}, { table: "asaas_account_webhooks", operation: "upsert" });
    await expect(ensureSharedAsaasWebhook(db.client as never, { mode: "production", webhookId: "hook", url }, legacySecret)).rejects.toThrow(/salvar/);
  });
});
