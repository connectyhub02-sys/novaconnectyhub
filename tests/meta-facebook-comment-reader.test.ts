import { describe, expect, it, vi } from "vitest";
import * as crypto from "node:crypto";
import { serverModuleHarness } from "./helpers/server-module-harness";
import type { MetaWebhookEvent } from "../src/lib/meta/webhook-events";

function fixture(body: unknown = { id: "456_789", message: "Quero conhecer" }, status = 200) {
  const filters: unknown[][] = [];
  const query = { select: () => query, eq: (...args: unknown[]) => { filters.push(args); return query; },
    maybeSingle: async () => ({ data: { encrypted_value: "page-private-token" }, error: null }) };
  const from = vi.fn(() => query);
  const fetch = vi.fn(async () => Response.json(body, { status }));
  const reader = serverModuleHarness<typeof import("../src/lib/meta/facebook-comment-reader")>("src/lib/meta/facebook-comment-reader.ts", {
    "node:crypto": crypto,
    "@/lib/client-os/guided-oauth": { loadMetaGuidedOAuthConfig: async () => ({ graphVersion: "v25.0", appSecret: "secret" }) },
    "@/lib/security/credentials-crypto": { decryptCredentialValue: (value: string) => value },
  }, [], { fetch });
  const event: MetaWebhookEvent = { assetId: "123", eventType: "meta.page.feed", sourceEventId: "event",
    payload: { object: "page", change: { field: "feed", value: { item: "comment", verb: "add", comment_id: "456_789", post_id: "123_456", from: { id: "person" } } } } };
  const input = { client: { from } as never, event, integration: { organization_id: "tenant", metadata: { selected_facebook_page_id: "123" } } };
  return { reader, input, filters, from, fetch };
}

describe("Sparse Facebook comment notifications", () => {
  it("reads text using only the selected tenant credential, retaining webhook identity and original evidence", async () => {
    const f = fixture(); const resolved = await f.reader.hydrateFacebookComment(f.input);
    expect(resolved.payload.change).toMatchObject({ value: { message: "Quero conhecer", from: { id: "person" } } });
    expect(f.input.event.payload.change).not.toHaveProperty("value.message");
    expect(f.filters).toContainEqual(["organization_id", "tenant"]);
    expect(f.filters).toContainEqual(["scope", "organization"]);
    expect(JSON.stringify(resolved)).not.toContain("page-private-token");
    expect(String((f.fetch.mock.calls[0] as unknown[])[0])).not.toContain("page-private-token");
  });
  it.each(["other-page", "123/../outside"])("rejects an unselected Page %s before credential access", async (assetId) => {
    const f = fixture(); f.input.event.assetId = assetId;
    await expect(f.reader.hydrateFacebookComment(f.input)).rejects.toThrow("fora da Pagina");
    expect(f.from).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(["remove", "edited"])("does not hydrate %s events", async verb => {
    const f = fixture(); (f.input.event.payload.change as { value: { verb: string } }).value.verb = verb;
    expect(await f.reader.hydrateFacebookComment(f.input)).toBe(f.input.event); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("does not re-fetch notifications already containing text", async () => {
    const f = fixture(); Object.assign((f.input.event.payload.change as { value: object }).value, { message: "Original" });
    expect(await f.reader.hydrateFacebookComment(f.input)).toBe(f.input.event); expect(f.from).not.toHaveBeenCalled();
  });
  it.each([{ id: "wrong", message: "other" }, { id: "456_789" }])("refuses mismatched or missing content", async body => {
    const f = fixture(body); await expect(f.reader.hydrateFacebookComment(f.input)).rejects.toThrow("indisponivel");
  });
  it("does not expose provider credentials/errors", async () => {
    const f = fixture({ error: "page-private-token" }, 403);
    await expect(f.reader.hydrateFacebookComment(f.input)).rejects.toThrow("HTTP 403");
  });
});
