import { describe, expect, it } from "vitest";
import { contentTabs, groupRemotePosts, inPeriod, normalizeCaption, remoteKind } from "../src/lib/social/content-view";
import type { InboxPost } from "../src/lib/meta/inbox-model";

const post = (id: string, network: "instagram" | "facebook", caption: string, timestamp: string, media: InboxPost["media"] = [{ type: "video", url: null, thumbnail: null }]): InboxPost =>
  ({ id, network, caption, timestamp, permalink: null, media, commentsCount: 0 });

describe("one row per content", () => {
  it("joins the same caption on Instagram and Facebook within 15 minutes", () => {
    const groups = groupRemotePosts([
      post("ig1", "instagram", "A substituição já começou.  Sua empresa?", "2026-11-12T21:01:00-03:00"),
      post("fb1", "facebook", "a substituição já começou. sua empresa?", "2026-11-12T21:00:00-03:00"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map(p => p.network).sort()).toEqual(["facebook", "instagram"]);
  });

  it("keeps posts apart when far in time, on the same network or without caption", () => {
    expect(groupRemotePosts([
      post("ig1", "instagram", "Mesma legenda", "2026-11-12T10:00:00Z"),
      post("fb1", "facebook", "Mesma legenda", "2026-11-12T10:16:00Z"),
    ])).toHaveLength(2);
    expect(groupRemotePosts([
      post("ig1", "instagram", "Mesma legenda", "2026-11-12T10:00:00Z"),
      post("ig2", "instagram", "Mesma legenda", "2026-11-12T10:01:00Z"),
    ])).toHaveLength(2);
    expect(groupRemotePosts([
      post("ig1", "instagram", "", "2026-11-12T10:00:00Z"),
      post("fb1", "facebook", "", "2026-11-12T10:00:00Z"),
    ])).toHaveLength(2);
  });

  it("does not let a third post on a repeated network join a full group", () => {
    const groups = groupRemotePosts([
      post("ig1", "instagram", "Oferta", "2026-11-12T10:00:00Z"),
      post("fb1", "facebook", "Oferta", "2026-11-12T10:02:00Z"),
      post("fb2", "facebook", "Oferta", "2026-11-12T10:05:00Z"),
    ]);
    expect(groups.map(g => g.length).sort()).toEqual([1, 2]);
  });

  it("classifies media and periods", () => {
    expect(remoteKind(post("a", "instagram", "x", "2026-11-12T10:00:00Z", [{ type: "image", url: null, thumbnail: null }, { type: "image", url: null, thumbnail: null }]))).toBe("carousel");
    expect(remoteKind(post("a", "instagram", "x", "2026-11-12T10:00:00Z", [{ type: "image", url: null, thumbnail: null }]))).toBe("image");
    const now = Date.parse("2026-11-24T12:00:00Z");
    expect(inPeriod("2026-08-27T12:00:00Z", 90, now)).toBe(true);
    expect(inPeriod("2026-08-25T12:00:00Z", 90, now)).toBe(false);
    expect(inPeriod("2020-01-01T00:00:00Z", null, now)).toBe(true);
    expect(normalizeCaption("  Olá\n\nMundo ")).toBe("olá mundo");
  });

  it("uses the Meta-style status tabs", () => {
    expect(contentTabs.map(t => t.label)).toEqual(["Publicado", "Agendado", "Rascunhos", "Com erro"]);
  });
});
