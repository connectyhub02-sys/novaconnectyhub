import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as policy from "../src/lib/meta/whatsapp-policy";
import * as mode from "../src/lib/meta/whatsapp-signup-mode";

type Call = { table: string; ops: Array<[string, unknown[]]> };
// Minimal Supabase double: records every chained call; `respond` decides the result.
function fakeClient(respond: (call: Call) => { data?: unknown; error?: unknown }) {
  const calls: Call[] = [], rpcs: Array<[string, unknown]> = [];
  const builder = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, key: string) {
        if (key === "then") {
          const result = { data: null, error: null, ...respond(call) };
          return (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve(result).then(ok, fail);
        }
        return (...args: unknown[]) => { call.ops.push([key, args]); return proxy; };
      },
    });
    return proxy;
  };
  const client = {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: unknown) => { rpcs.push([name, args]); return { data: name === "meta_whatsapp_number_separate" ? true : "lead-1", error: null }; },
  };
  return { client, calls, rpcs };
}
const op = (call: Call, name: string) => call.ops.find(([key]) => key === name)?.[1];

describe("panel signup mode policy", () => {
  it("uses the WhatsApp Business app onboarding only for coexistence", () => {
    expect(mode.officialSignupExtras("coexistence")).toMatchObject({ featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3", version: "v4" });
    expect(mode.officialSignupExtras("cloud").featureType).toBe("");
    expect(mode.officialSignupMode("anything")).toBe("cloud");
  });
  it("accepts the coexistence finish event that returns only the WABA", () => {
    expect(mode.officialSignupFinish({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "2133522687196167" } }))
      .toEqual({ event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", coexistence: true, wabaId: "2133522687196167", phoneNumberId: undefined });
    expect(mode.officialSignupFinish({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL" })).toBeNull();
    expect(mode.officialSignupFinish({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "../x" } })?.wabaId).toBeUndefined();
  });
  const app = { id: "11111", display_phone_number: "+55 11 91018-8233", verified_name: "Eliane", is_on_biz_app: true, platform_type: "CLOUD_API" };
  const fresh = { id: "22222", display_phone_number: "+55 47 99999-0000", verified_name: "Campanhas", is_on_biz_app: false, platform_type: "CLOUD_API" };
  it("decides coexistence from Meta's number data", () => {
    expect(mode.selectOfficialSignupPhone([app, fresh], undefined, "coexistence")).toMatchObject({ phone: app, coexistence: true });
    expect(mode.selectOfficialSignupPhone([app, fresh], "22222", "cloud")).toMatchObject({ phone: fresh, coexistence: false });
    expect(() => mode.selectOfficialSignupPhone([app], "11111", "cloud")).toThrow("app WhatsApp Business");
    expect(() => mode.selectOfficialSignupPhone([fresh], "22222", "coexistence")).toThrow("não confirmou");
    expect(() => mode.selectOfficialSignupPhone([{ ...app, platform_type: "NOT_APPLICABLE" }], undefined, "coexistence")).toThrow("Cloud API");
    expect(() => mode.selectOfficialSignupPhone([app, { ...app, id: "33333" }], undefined, "coexistence")).toThrow("mais de um");
    expect(() => mode.selectOfficialSignupPhone([app], "99999", "coexistence")).toThrow("não pertence");
  });
  it("allows the company's own QR attendance and archived history, not another active company", () => {
    const own = { organization_id: "internal", phone_number: "5511910188233", status: "connected" };
    const archived = { organization_id: "other", phone_number: "551110188233", status: "archived" };
    expect(mode.coexistenceInstanceConflict([own, archived], "internal", "5511910188233")).toBe(false);
    expect(mode.coexistenceInstanceConflict([{ ...archived, status: "connected" }], "internal", "5511910188233")).toBe(true);
    expect(mode.coexistenceInstanceConflict([{ ...own, organization_id: "other", phone_number: "5547988556936" }], "internal", "5511910188233")).toBe(false);
  });
  it("parses echoes and sync outcomes without trusting malformed entries", () => {
    const echoes = mode.coexistenceEchoes({ message_echoes: [
      { from: "5511910188233", to: "5547999990000", id: "wamid.echo", timestamp: "1763550000", type: "text", text: { body: "Oi, aqui é do celular" } },
      { to: "group@g.us", id: "wamid.bad", timestamp: "1763550000", type: "text" },
    ] });
    expect(echoes).toEqual([{ id: "wamid.echo", to: "5547999990000", type: "text", text: "Oi, aqui é do celular", timestamp: 1763550000000 }]);
    expect(mode.historySyncOutcome({ history: [{ metadata: { progress: 100 } }] })).toBe("completed");
    expect(mode.historySyncOutcome({ history: [{ errors: [{ code: 2593109 }] }] })).toBe("declined");
    expect(mode.historySyncOutcome({ history: [{ metadata: { progress: 40 } }] })).toBeNull();
  });
});

function cloudModule(fetch: ReturnType<typeof vi.fn>) {
  return serverModuleHarness<typeof import("../src/lib/meta/whatsapp-cloud")>("src/lib/meta/whatsapp-cloud.ts", {
    "node:crypto": crypto,
    "./whatsapp-policy": policy,
    "./whatsapp-signup-mode": mode,
    "@/lib/security/credentials-crypto": { encryptCredentialValue: (v: string) => `enc:${v}`, decryptCredentialValue: (v: string) => v.replace(/^enc:/, "") },
    "@/lib/client-os/guided-oauth": { loadMetaGuidedOAuthConfig: async () => ({ appId: "1002348522666389", appSecret: "secret", graphVersion: "v25.0" }) },
  }, [], { fetch });
}
function graph(phone: Record<string, unknown>) {
  return vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(async (url) => {
    const path = url.pathname.replace(/^\/v25\.0\//, "");
    if (path === "debug_token") return Response.json({ data: { app_id: "1002348522666389", is_valid: true, scopes: ["whatsapp_business_management", "whatsapp_business_messaging"] } });
    if (path.endsWith("/phone_numbers")) return Response.json({ data: [phone] });
    if (path.endsWith("/subscribed_apps") || path.endsWith("/smb_app_data")) return Response.json({ success: true, request_id: "r1" });
    return Response.json({ error: { code: 100 } }, { status: 400 });
  });
}
const bizPhone = { id: "11111", display_phone_number: "+55 11 91018-8233", verified_name: "Eliane", is_on_biz_app: true, platform_type: "CLOUD_API" };

describe("panel coexistence connection", () => {
  it("links the app number without /register, subscribes and requests each sync once", async () => {
    const fetch = graph(bizPhone);
    const db = fakeClient((call) => {
      if (call.table === "integration_credentials") return { data: [] };
      if (call.table === "whatsapp_instances") return { data: [{ organization_id: "internal", phone_number: "5511910188233", status: "connected" }] };
      if (call.table === "connectyhub_meta_coexistence") return { data: [] };
      if (call.table === "meta_whatsapp_connections" && op(call, "select")) return { data: { phone_number_id: "11111" } };
      return {};
    });
    const result = await cloudModule(fetch).connectOfficial(db.client as never, "internal", "admin", "token", "2133522687196167", undefined, "coexistence");
    expect(result).toMatchObject({ coexistence: true, sync: { contacts: "requested", history: "requested" } });
    const paths = fetch.mock.calls.map(([url]) => (url as URL).pathname);
    expect(paths.some((p) => p.endsWith("/register"))).toBe(false);
    expect(paths.filter((p) => p.endsWith("/11111/smb_app_data"))).toHaveLength(2);
    const order = paths.map((p) => p.split("/").pop());
    expect(order.indexOf("subscribed_apps")).toBeLessThan(order.indexOf("smb_app_data"));
    const bodies = fetch.mock.calls.filter(([url]) => (url as URL).pathname.endsWith("smb_app_data")).map(([, init]) => JSON.parse(String(init?.body)).sync_type);
    expect(bodies).toEqual(["smb_app_state_sync", "history"]);
    expect(db.rpcs.map(([name]) => name)).not.toContain("meta_whatsapp_number_separate");
    expect(db.calls.find((c) => c.table === "meta_whatsapp_connections" && (op(c, "update")?.[0] as Record<string, unknown>)?.coexistence === true)).toBeTruthy();
  });
  it("does not repeat a sync that was already claimed", async () => {
    const fetch = graph(bizPhone);
    const db = fakeClient((call) => (call.table === "whatsapp_instances" || call.table === "connectyhub_meta_coexistence" || call.table === "integration_credentials" ? { data: [] } : {}));
    const result = await cloudModule(fetch).connectOfficial(db.client as never, "internal", "admin", "token", "2133522687196167", undefined, "coexistence");
    expect(result).toMatchObject({ sync: { contacts: "skipped", history: "skipped" } });
    expect(fetch.mock.calls.some(([url]) => (url as URL).pathname.endsWith("smb_app_data"))).toBe(false);
  });
  it("refuses a number still connected by QR in another company", async () => {
    const db = fakeClient((call) => call.table === "whatsapp_instances" ? { data: [{ organization_id: "client-b", phone_number: "5511910188233", status: "connected" }] } : { data: [] });
    await expect(cloudModule(graph(bizPhone)).connectOfficial(db.client as never, "internal", "admin", "token", "2133522687196167", undefined, "coexistence")).rejects.toThrow("outra empresa");
    expect(db.rpcs.map(([name]) => name)).not.toContain("connect_meta_whatsapp_sender");
  });
  it("refuses an app number in the ordinary flow and never registers coexistence", async () => {
    const db = fakeClient(() => ({ data: [] }));
    const cloud = cloudModule(graph(bizPhone));
    await expect(cloud.connectOfficial(db.client as never, "internal", "admin", "token", "2133522687196167", "11111", "cloud")).rejects.toThrow("app WhatsApp Business");
    await expect(cloud.registerOfficialNumber(db.client as never, { coexistence: true, phone_number_id: "11111", encrypted_token: "enc:t" } as never, "123456")).rejects.toThrow("Não registre");
  });
});

describe("official webhook for coexistence numbers", () => {
  function webhookModule() {
    return serverModuleHarness<typeof import("../src/lib/meta/whatsapp-webhook")>("src/lib/meta/whatsapp-webhook.ts", {
      "./whatsapp-policy": policy,
      "./whatsapp-signup-mode": mode,
      "./whatsapp-recipient": { recordRecipientIdentity: async () => {} },
      "./whatsapp-contact-profile": { officialInboundProfileName: () => null },
      "@/lib/supabase/service": { createServiceClient: () => { throw new Error("explicit client required"); } },
    });
  }
  it("stores app echoes as sent records without CRM archive, opt-out or AI", async () => {
    const db = fakeClient((call) => call.table === "meta_whatsapp_connections" && op(call, "maybeSingle") ? { data: { organization_id: "internal", waba_id: "2133522687196167", coexistence: true } } : {});
    const now = Math.floor(Date.now() / 1000);
    const result = await webhookModule().ingestOfficialWhatsApp({ object: "whatsapp_business_account", entry: [{ id: "2133522687196167", changes: [
      { field: "smb_message_echoes", value: { metadata: { phone_number_id: "11111" }, message_echoes: [{ from: "5511910188233", to: "5547999990000", id: "wamid.echo", timestamp: String(now), type: "text", text: { body: "parar" } }] } },
      { field: "history", value: { metadata: { phone_number_id: "11111" }, history: [{ metadata: { progress: 100 }, threads: [{ messages: [{ id: "old", from: "5547999990000", type: "text", text: { body: "oi" } }] }] }] } },
    ] }] }, db.client as never);
    expect(result.stored).toBe(1);
    const inserted = db.calls.filter((c) => c.table === "meta_whatsapp_messages" && op(c, "upsert")).map((c) => (op(c, "upsert") as unknown[])[0]);
    expect(inserted).toEqual([expect.objectContaining({ direction: "outbound", status: "sent", provider_message_id: "wamid.echo", content: { source: "business_app_echo" } })]);
    // History is not replayed as inbound messages, nothing is archived and no opt-out is inferred from an echo.
    expect(db.rpcs).toEqual([]);
    expect(db.calls.some((c) => c.table === "meta_whatsapp_contacts")).toBe(false);
    expect(db.calls.some((c) => c.table === "meta_whatsapp_connections" && (op(c, "update")?.[0] as Record<string, unknown>)?.history_sync_state === "completed")).toBe(true);
  });
  it("marks a coexistence number disconnected when the business offboards", async () => {
    const db = fakeClient((call) => call.table === "meta_whatsapp_connections" && op(call, "select") ? { data: [{ organization_id: "internal", phone_number_id: "11111" }] } : {});
    await webhookModule().ingestOfficialWhatsApp({ object: "whatsapp_business_account", entry: [{ id: "2133522687196167", changes: [{ field: "account_update", value: { event: "PARTNER_REMOVED", waba_info: { waba_id: "2133522687196167" } } }] }] }, db.client as never);
    const update = db.calls.find((c) => c.table === "meta_whatsapp_connections" && op(c, "update"))!;
    expect(op(update, "update")?.[0]).toEqual({ status: "disconnected", webhook_subscribed: false });
    expect(update.ops).toContainEqual(["eq", ["coexistence", true]]);
    expect(db.calls.some((c) => c.table === "meta_whatsapp_campaigns" && (op(c, "update")?.[0] as Record<string, unknown>)?.status === "paused")).toBe(true);
  });
});

it("migration 0224 adds coexistence state without opening access", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon;create role authenticated;create role service_role;create schema if not exists auth;create table auth.users(id uuid primary key);create table organizations(id uuid primary key);create table leads(id uuid primary key);");
    await db.exec(readFileSync("supabase/migrations/0189_meta_whatsapp_official.sql", "utf8").split("create function")[0]);
    await db.exec(readFileSync("supabase/migrations/0224_meta_whatsapp_panel_coexistence.sql", "utf8"));
    await db.exec("insert into organizations values('00000000-0000-0000-0000-000000000001')");
    await db.exec("insert into meta_whatsapp_connections(organization_id,waba_id,phone_number_id,display_phone,encrypted_token) values('00000000-0000-0000-0000-000000000001','1','2','+55','x')");
    const row = await db.query<{ coexistence: boolean }>("select coexistence from meta_whatsapp_connections");
    expect(row.rows[0].coexistence).toBe(false);
    await expect(db.exec("update meta_whatsapp_connections set history_sync_state='bogus'")).rejects.toThrow();
    await expect(db.exec("insert into meta_whatsapp_oauth_attempts(state_hash,organization_id,user_id,expires_at,mode) values('s','00000000-0000-0000-0000-000000000001',gen_random_uuid(),now(),'other')")).rejects.toThrow();
    for (const table of ["meta_whatsapp_connections", "meta_whatsapp_oauth_attempts"])
      expect((await db.query<{ allowed: boolean }>("select has_table_privilege('authenticated',$1,'SELECT') allowed", [table])).rows[0].allowed).toBe(false);
  } finally { await db.close(); }
}, 30000);
