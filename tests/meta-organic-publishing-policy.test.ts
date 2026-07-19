import { describe, expect, it } from "vitest";
import {
  normalizeMetaOrganicDraft,
  resolveMetaOrganicPublishTargets,
} from "../src/lib/meta/organic-publishing-policy";

describe("Meta organic publishing policy", () => {
  it("normalizes a draft for both Meta surfaces", () => {
    expect(normalizeMetaOrganicDraft({
      caption: "  Novo post da campanha.  ",
      linkUrl: "https://connectyhub.com/oferta",
      mediaUrl: "https://cdn.connectyhub.com/post.jpg",
      surfaces: ["facebook_page", "instagram_feed"],
      title: "  Campanha Meta  ",
    })).toEqual({
      caption: "Novo post da campanha.",
      linkUrl: "https://connectyhub.com/oferta",
      mediaUrl: "https://cdn.connectyhub.com/post.jpg",
      surfaces: ["facebook_page", "instagram_feed"],
      title: "Campanha Meta",
    });
  });

  it("builds Facebook photo and Instagram image publish targets", () => {
    expect(resolveMetaOrganicPublishTargets({
      caption: "Legenda aprovada",
      instagramBusinessId: "ig-123",
      mediaUrl: "https://cdn.connectyhub.com/post.jpg",
      pageId: "page-123",
      surfaces: ["facebook_page", "instagram_feed"],
    })).toEqual([
      {
        surface: "facebook_page",
        kind: "facebook_photo",
        endpointPath: "/page-123/photos",
        body: {
          url: "https://cdn.connectyhub.com/post.jpg",
          caption: "Legenda aprovada",
          published: "true",
        },
      },
      {
        surface: "instagram_feed",
        kind: "instagram_image",
        createEndpointPath: "/ig-123/media",
        createBody: {
          image_url: "https://cdn.connectyhub.com/post.jpg",
          caption: "Legenda aprovada",
        },
        publishEndpointPath: "/ig-123/media_publish",
      },
    ]);
  });

  it("allows a text-only Facebook feed post", () => {
    expect(resolveMetaOrganicPublishTargets({
      caption: "Texto para Facebook",
      linkUrl: "https://connectyhub.com",
      pageId: "page-123",
      surfaces: ["facebook_page"],
    })).toEqual([
      {
        surface: "facebook_page",
        kind: "facebook_feed",
        endpointPath: "/page-123/feed",
        body: {
          message: "Texto para Facebook",
          link: "https://connectyhub.com/",
        },
      },
    ]);
  });

  it("blocks Instagram feed publishing without media", () => {
    expect(() => resolveMetaOrganicPublishTargets({
      caption: "Legenda sem imagem",
      instagramBusinessId: "ig-123",
      surfaces: ["instagram_feed"],
    })).toThrow("Instagram exige uma URL publica de imagem para publicar no feed.");
  });
});
