import { describe, expect, it, vi } from "vitest";
import * as crypto from "node:crypto";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as dispatch from "../src/lib/meta/social-dispatch-policy";
import * as agent from "../src/lib/meta/social-agent-policy";
import * as model from "../src/lib/meta/inbox-model";
import * as approval from "../src/lib/meta/social-approval-policy";
import type { ClientCompany } from "../src/lib/client-os/companies";
type Row = Record<string, unknown>;
const record = (v: unknown): Row => v && typeof v === "object" ? v as Row : {};
function fixture(options: { foreign?: boolean; staleAsset?: boolean; expired?: boolean; optOut?: boolean; networkFailure?: boolean; storageFailure?: boolean; providerFailure?: boolean; contractBlocked?: boolean; live?: boolean } = {}) {
  const calls: { table: string; filters: Row; op: string }[] = [];
  let stored: Row | null = null;
  const from = (table: string) => {
    const filters: Row = {}; let op = "select", values: Row = {};
    const run = () => {
      calls.push({ table, filters: { ...filters }, op });
      if (table === "conversations") return { data: options.foreign ? null : { id: "c-a", lead_id: "l-a", channel: "instagram_direct", provider_chat_id: "chat", metadata: { external_account_id: options.staleAsset ? "999" : "111", external_user_id: "888" } }, error: options.foreign ? { code: "404" } : null };
      if (table === "leads") return { data: { metadata: options.optOut ? { opt_out: { requested_at: "yes" } } : {} }, error: null };
      if (table === "conversation_messages") {
        if (op === "insert") {
          if (options.storageFailure) return { data: null, error: { code: "storage_failure" } };
          if (stored) return { data: null, error: { code: "23505" } };
          stored = { ...values, id: "m-a" }; return { data: { id: "m-a" }, error: null };
        }
        if (op === "update") { stored = { ...stored, ...values }; return { data: null, error: null }; }
        if (filters.provider_message_id) return { data: stored, error: null };
        return { data: { occurred_at: new Date(Date.now() - (options.expired ? 48 : 1) * 3600000).toISOString() }, error: null };
      }
      return { data: null, error: null };
    };
    const q = { select: () => q, insert: (v: Row) => { op = "insert"; values = v; return q; }, update: (v: Row) => { op = "update"; values = v; return q; }, eq: (k: string, v: unknown) => { filters[k] = v; return q; }, order: () => q, limit: () => q, single: async () => run(), maybeSingle: async () => run(), then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve) };
    return q;
  };
  const liveActivation = { channels: { instagram_direct: { enabled: true, status: "ready" }, instagram_comments: { enabled: true, status: "ready" } } };
  const ctx = { organizationId: "org-a", instagramId: "111", pageId: "222", pageToken: "token-secret", scopes: ["instagram_basic", "instagram_manage_comments", "instagram_manage_messages", "pages_messaging", "pages_manage_metadata"], metadata: {}, config: { appSecret: "secret", graphVersion: "v24.0" } };
  const fetch = vi.fn(async () => { if (options.networkFailure) throw new Error("network lost"); return new Response(JSON.stringify(options.providerFailure ? { error: { message: "raw secret" } } : { message_id: "sent-id" }), { status: options.providerFailure ? 400 : 200 }); });
  const lib = serverModuleHarness<typeof import("../src/lib/meta/inbox-reply")>("src/lib/meta/inbox-reply.ts", {
    "node:crypto": crypto,
    "@/lib/billing/trial": { assertBillableAccess: async () => {} },
    "@/lib/billing/contract-access": { assertContractAccess: async () => { if (options.contractBlocked) throw new Error("Contrato suspenso"); } },
    "@/lib/billing/plan-entitlements": { resolveMetaSocialChannelsEntitlement: () => ({ allowed: true }) },
    "./social-approval-policy": approval, "./social-agent-policy": agent, "./inbox-model": model,
    "./ads-leads-context": { metaRecord: record },
    "./inbox-content": { loadInboxContext: async () => ctx, inboxAsset: () => "111", graphId: (v: string) => /^\d+$/.test(v), verifyCommentTarget: (_ctx: unknown, token: string) => { if (token !== "valid") throw new Error("Assinatura inválida"); return { network: "instagram", comment: "777", timestamp: "2020-01-01", post: "555", asset: "111", authorId: "888" }; } },
    "./social-dispatch-policy": { ...dispatch, normalizeMetaSocialDispatchLiveActivation: () => liveActivation, resolveMetaSocialDispatchMode: () => options.live === false ? "dry_run" : "live" },
  }, [], { fetch, URLSearchParams });
  const input = { client: { from } as never, company: { id: "org-a", role: "owner", planCode: "internal", status: "active" } as ClientCompany, userId: "user-a", conversationId: "c-a", requestId: "00000000-0000-4000-a000-000000000001", text: "Resposta humana" };
  return { lib, input, fetch, calls, getStored: () => stored };
}
describe("explicit inbox replies", () => {
  it.each([{ foreign: true }, { staleAsset: true }, { expired: true }, { optOut: true }, { storageFailure: true }, { contractBlocked: true }, { live: false }])("refuses unsafe/unavailable dispatch before HTTP: %j", async options => {
    const f = fixture(options); await expect(f.lib.sendInboxReply(f.input)).rejects.toThrow(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("does not allow a read-only member to dispatch", async () => {
    const f = fixture(); await expect(f.lib.sendInboxReply({ ...f.input, company: { ...f.input.company, role: "member" } })).rejects.toThrow(/gestores/); expect(f.calls).toEqual([]); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("claims the request durably, sends once, then returns the saved receipt", async () => {
    const f = fixture(); const first = await f.lib.sendInboxReply(f.input); const second = await f.lib.sendInboxReply(f.input);
    expect(first.status).toBe("sent"); expect(second.repeated).toBe(true); expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.calls.filter(c => c.table === "conversations" || c.table === "conversation_messages" || c.table === "leads").every(c => c.op === "insert" || c.filters.organization_id === "org-a")).toBe(true);
    expect(record(f.getStored()?.payload).actor_id).toBe("user-a");
  });
  it("does not retry an ambiguous send after transport failure", async () => {
    const f = fixture({ networkFailure: true }); expect((await f.lib.sendInboxReply(f.input)).status).toBe("uncertain"); expect((await f.lib.sendInboxReply(f.input)).status).toBe("uncertain"); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("records provider refusal without leaking its raw error", async () => {
    const f = fixture({ providerFailure: true }); const result = await f.lib.sendInboxReply(f.input); expect(result.status).toBe("failed"); expect(JSON.stringify(result)).not.toContain("raw secret");
  });
  it("rejects reuse of a request key with different content", async () => {
    const f = fixture(); await f.lib.sendInboxReply(f.input); await expect(f.lib.sendInboxReply({ ...f.input, text: "Outra resposta" })).rejects.toThrow(/já utilizado/); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("sends a public reply to the verified comment, never a private message", async () => {
    const f = fixture();
    const result = await f.lib.sendInboxReply({ ...f.input, conversationId: undefined, commentToken: "valid" });
    expect(result.status).toBe("sent");
    const [url, init] = f.fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/v24.0/777/replies");
    expect(String(init.body)).toBe("message=Resposta+humana");
  });
  it("refuses a fabricated comment target before storage or dispatch", async () => {
    const f = fixture(); await expect(f.lib.sendInboxReply({ ...f.input, conversationId: undefined, commentToken: "forged" })).rejects.toThrow(/Assinatura/); expect(f.calls).toEqual([]); expect(f.fetch).not.toHaveBeenCalled();
  });
});
