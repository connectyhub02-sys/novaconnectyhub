import { describe, expect, it, vi } from "vitest";
import * as crypto from "node:crypto";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as model from "../src/lib/meta/inbox-model";
import type { InboxContext } from "../src/lib/meta/inbox-content";
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const ctx = { organizationId: "org-a", instagramId: "111", pageId: "222", token: "user-secret", pageToken: "page-secret", config: { appSecret: "app-secret", graphVersion: "v24.0" } } as InboxContext;
function fixture(responses: unknown[]) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 }));
  const lib = serverModuleHarness<typeof import("../src/lib/meta/inbox-content")>("src/lib/meta/inbox-content.ts", { "node:crypto": crypto, "./ads-leads-context": { metaRecord: record }, "./inbox-model": model }, [], { fetch });
  return { lib, fetch };
}
describe("social inbox content ownership and pagination", () => {
  it("rejects a foreign Facebook post without making a Graph request", async () => {
    const f = fixture([]);
    await expect(f.lib.readInboxPost(ctx, "facebook", "333_444")).rejects.toThrow(/fora/);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("rejects a readable Instagram post owned by another account", async () => {
    const f = fixture([{ id: "555", owner: { id: "999" } }]);
    await expect(f.lib.readInboxComments(ctx, "instagram", "555")).rejects.toThrow(/fora/);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("returns post media, caption and nested replies without leaking raw paging URLs or tokens", async () => {
    const f = fixture([{ id: "555", owner: { id: "111" }, caption: "Nossa publicação", media_type: "VIDEO", media_url: "https://scontent.cdninstagram.com/v.mp4", thumbnail_url: "https://scontent.cdninstagram.com/v.jpg" }, { data: [{ id: "777", text: "Pergunta", from: { id: "888", username: "pessoa" }, replies: { data: [{ id: "779", text: "Resposta" }], paging: { next: "https://graph.facebook.com/?access_token=secret", cursors: { after: "reply-cursor" } } } }], paging: { next: "https://graph.facebook.com/?access_token=secret", cursors: { after: "comment-cursor" } } }]);
    const result = await f.lib.readInboxComments(ctx, "instagram", "555");
    expect(result.post.caption).toBe("Nossa publicação");
    expect(result.post.media[0].type).toBe("video");
    expect(result.comments[0].replies[0].text).toBe("Resposta");
    expect(result.comments[0].repliesAfter).toBe("reply-cursor");
    expect(result.after).toBe("comment-cursor");
    expect(JSON.stringify(result)).not.toContain("access_token");
    expect(f.lib.verifyCommentTarget(ctx, result.comments[0].replyToken).comment).toBe("777");
    expect(() => f.lib.verifyCommentTarget({ ...ctx, organizationId: "org-b" }, result.comments[0].replyToken)).toThrow(/conexão/);
    expect(() => f.lib.verifyCommentTarget({ ...ctx, instagramId: "999" }, result.comments[0].replyToken)).toThrow(/conexão/);
    expect(() => f.lib.verifyCommentTarget(ctx, `x${result.comments[0].replyToken}`)).toThrow(/Atualize/);
  });
  it("binds next-page requests to the selected account, not a provider URL", async () => {
    const f = fixture([{ data: [] }]);
    await f.lib.readInboxPosts(ctx, "instagram", "cursor-with/slash");
    const [url, init] = f.fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/v24.0/111/media");
    expect(url.searchParams.get("after")).toBe("cursor-with/slash");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(init.redirect).toBe("error");
  });
  it("refuses expired action tickets", async () => {
    const f = fixture([{ id: "555", owner: { id: "111" } }, { data: [{ id: "777" }] }]);
    const result = await f.lib.readInboxComments(ctx, "instagram", "555");
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3 * 3600000);
    try { expect(() => f.lib.verifyCommentTarget(ctx, result.comments[0].replyToken)).toThrow(/conexão/); } finally { now.mockRestore(); }
  });
});
describe("safe Meta media", () => {
  it.each(["javascript:alert(1)", "https://evil.com/p.jpg", "https://cdninstagram.com.evil.com/a", "https://user:pass@fbcdn.net/a", "https://fbcdn.net/a?access_token=x", "http://fbcdn.net/a"])("blocks %s", value => expect(model.safeSocialUrl(value, true)).toBeNull());
  it("permits provider CDN URLs and Instagram permalinks", () => {
    expect(model.safeSocialUrl("https://scontent.fbcdn.net/a.jpg", true)).toBeTruthy();
    expect(model.safeSocialUrl("https://www.instagram.com/p/ABC/")).toBeTruthy();
  });
});
