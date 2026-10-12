import { describe, expect, it, vi } from "vitest";
import { advanceOrganicDelivery, OrganicGraphRejected, type OrganicDelivery } from "../src/lib/meta/organic-publishing-runner";
import { normalizeMetaOrganicDraft } from "../src/lib/meta/organic-publishing-policy";

const image = { type: "image" as const, url: "https://cdn.example.com/photo.jpg" };
const video = { type: "video" as const, url: "https://cdn.example.com/video.mp4" };
const delivery = (surface: OrganicDelivery["surface"] = "instagram_feed"): OrganicDelivery => ({ surface, accountId: "123", phase: "preparing", children: [] });

describe("resumable organic delivery", () => {
  it("waits for a reel and resumes without creating a second container", async () => {
    const d = delivery();
    const graph = vi.fn().mockResolvedValueOnce({ id: "container" }).mockResolvedValueOnce({ status_code: "IN_PROGRESS" });
    const save = vi.fn(async () => {});
    const input = { delivery: d, format: "reel" as const, media: [video], caption: "Demo", graph, save, upload: vi.fn() };
    expect(await advanceOrganicDelivery(input)).toBe(false);
    expect(d.containerId).toBe("container");
    graph.mockResolvedValueOnce({ status_code: "FINISHED" }).mockResolvedValueOnce({ id: "published" });
    expect(await advanceOrganicDelivery(input)).toBe(true);
    expect(graph.mock.calls.filter(c => c[1] === "/123/media")).toHaveLength(1);
    const before = graph.mock.calls.length;
    expect(await advanceOrganicDelivery(input)).toBe(true);
    expect(graph).toHaveBeenCalledTimes(before);
  });

  it("blocks retry after a lost response to a public Facebook post", async () => {
    const d = delivery("facebook_page");
    const graph = vi.fn().mockRejectedValue(new Error("timeout"));
    const input = { delivery: d, format: "feed" as const, media: [image], caption: "Demo", graph, save: vi.fn(), upload: vi.fn() };
    await expect(advanceOrganicDelivery(input)).rejects.toThrow("timeout");
    expect(d.phase).toBe("sending");
    await expect(advanceOrganicDelivery(input)).rejects.toThrow("incerto");
    expect(graph).toHaveBeenCalledTimes(1);
  });

  it("allows retry after a definitive API rejection", async () => {
    const d = delivery("facebook_page");
    const graph = vi.fn().mockRejectedValueOnce(new OrganicGraphRejected("Permission missing")).mockResolvedValueOnce({ id: "post" });
    const input = { delivery: d, format: "feed" as const, media: [image], caption: "Demo", graph, save: vi.fn(), upload: vi.fn() };
    await expect(advanceOrganicDelivery(input)).rejects.toThrow("Permission missing");
    expect(d.phase).toBe("preparing");
    expect(await advanceOrganicDelivery(input)).toBe(true);
  });

  it("never sends if the checkpoint cannot be saved", async () => {
    const graph = vi.fn();
    await expect(advanceOrganicDelivery({ delivery: delivery(), format: "reel", media: [video], caption: "Demo", graph, save: vi.fn().mockRejectedValue(new Error("database offline")), upload: vi.fn() })).rejects.toThrow("database offline");
    expect(graph).not.toHaveBeenCalled();
  });

  it("assembles mixed Instagram carousel children in order", async () => {
    const graph = vi.fn().mockResolvedValueOnce({ id: "photo" }).mockResolvedValueOnce({ id: "video" })
      .mockResolvedValueOnce({ status_code: "FINISHED" }).mockResolvedValueOnce({ status_code: "FINISHED" })
      .mockResolvedValueOnce({ id: "parent" }).mockResolvedValueOnce({ status_code: "FINISHED" }).mockResolvedValueOnce({ id: "post" });
    expect(await advanceOrganicDelivery({ delivery: delivery(), format: "carousel", media: [image, video], caption: "Demo", graph, save: vi.fn(), upload: vi.fn() })).toBe(true);
    expect(graph.mock.calls[4][2]).toEqual({ media_type: "CAROUSEL", children: "photo,video", caption: "Demo" });
  });

  it("does not send unsupported caption on Instagram Stories", async () => {
    const graph = vi.fn().mockResolvedValueOnce({ id: "story" }).mockResolvedValueOnce({ status_code: "FINISHED" }).mockResolvedValueOnce({ id: "post" });
    await advanceOrganicDelivery({ delivery: delivery(), format: "story", media: [image], caption: "Internal title", graph, save: vi.fn(), upload: vi.fn() });
    expect(graph.mock.calls[0][2]).toEqual({ media_type: "STORIES", image_url: image.url });
  });

  it("requires Facebook video publishing completion before marking it published", async () => {
    const d = delivery("facebook_page");
    const graph = vi.fn().mockResolvedValueOnce({ video_id: "video", upload_url: "https://rupload.facebook.com/video-upload/v26.0/video" })
      .mockResolvedValueOnce({ status: { processing_phase: { status: "complete" } } }).mockResolvedValueOnce({ success: true });
    const upload = vi.fn();
    const input = { delivery: d, format: "reel" as const, media: [video], caption: "Demo", graph, save: vi.fn(), upload };
    expect(await advanceOrganicDelivery(input)).toBe(false);
    expect(d.id).toBeUndefined();
    graph.mockResolvedValueOnce({ status: { publishing_phase: { status: "complete" } } });
    expect(await advanceOrganicDelivery(input)).toBe(true);
    expect(d.id).toBe("video");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("refuses an upload URL outside the Meta upload host", async () => {
    const upload = vi.fn();
    await expect(advanceOrganicDelivery({ delivery: delivery("facebook_page"), format: "reel", media: [video], caption: "Demo", graph: vi.fn().mockResolvedValue({ video_id: "video", upload_url: "https://evil.example/upload" }), save: vi.fn(), upload })).rejects.toThrow("inválido");
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("organic formats", () => {
  it("rejects mixed Facebook albums and too many items", () => {
    expect(() => normalizeMetaOrganicDraft({ caption: "Demo", format: "carousel", media: [image, video], surfaces: ["facebook_page"] })).toThrow("álbum");
    expect(() => normalizeMetaOrganicDraft({ caption: "Demo", format: "carousel", media: Array(11).fill(image) })).toThrow("10 mídias");
  });
  it("rejects non-public URLs and invalid reel compositions", () => {
    expect(() => normalizeMetaOrganicDraft({ caption: "Demo", media: [{ ...image, url: "http://localhost/x" }] })).toThrow("URL");
    expect(() => normalizeMetaOrganicDraft({ caption: "Demo", format: "reel", media: [image] })).toThrow("vídeo");
  });
});
