import { describe, expect, it, vi } from "vitest";
import { buildMetaCrmSnapshot } from "../src/lib/meta/event-normalizer";
import { extractMetaWebhookEvents, type MetaWebhookEvent } from "../src/lib/meta/webhook-events";

vi.mock("server-only", () => ({}));

describe("Meta event normalizer", () => {
  it("maps Instagram messaging events to private CRM conversations", () => {
    const snapshot = buildMetaCrmSnapshot({
      assetId: "17841400000000000",
      eventType: "meta.instagram.messaging",
      sourceEventId: "ig-event-1",
      payload: {
        object: "instagram",
        messaging: {
          sender: { id: "ig-user-1" },
          recipient: { id: "17841400000000000" },
          timestamp: 1_700_000_000_000,
          message: {
            mid: "ig-mid-1",
            text: "Quero saber o valor",
          },
        },
      },
    } satisfies MetaWebhookEvent);

    expect(snapshot).toMatchObject({
      channel: "instagram_direct",
      externalAccountId: "17841400000000000",
      externalUserId: "ig-user-1",
      providerChatId: "instagram_direct:17841400000000000:ig-user-1",
      providerMessageId: "instagram_direct:ig-mid-1",
      direction: "inbound",
      messageType: "text",
      textContent: "Quero saber o valor",
    });
  });

  it("maps Facebook comment changes to public CRM conversations", () => {
    const snapshot = buildMetaCrmSnapshot({
      assetId: "page-1",
      eventType: "meta.page.feed",
      sourceEventId: "fb-comment-event-1",
      payload: {
        object: "page",
        change: {
          field: "feed",
          value: {
            page_id: "page-1",
            post_id: "post-1",
            comment_id: "comment-1",
            created_time: 1_700_000_000,
            message: "Tenho interesse",
            from: {
              id: "fb-user-1",
              name: "Maria Cliente",
            },
          },
        },
      },
    } satisfies MetaWebhookEvent);

    expect(snapshot).toMatchObject({
      channel: "facebook_comments",
      externalAccountId: "page-1",
      externalUserId: "fb-user-1",
      displayName: "Maria Cliente",
      providerChatId: "facebook_comments:page-1:post-1:fb-user-1",
      providerMessageId: "facebook_comments:comment-1",
      direction: "inbound",
      messageType: "comment",
      textContent: "Tenho interesse",
      sourcePostId: "post-1",
      sourceCommentId: "comment-1",
    });
  });

  it("does not turn leadgen events into chat messages", () => {
    const snapshot = buildMetaCrmSnapshot({
      assetId: "page-1",
      eventType: "meta.page.leadgen",
      sourceEventId: "leadgen-event-1",
      payload: {
        object: "page",
        change: {
          field: "leadgen",
          value: {
            page_id: "page-1",
            leadgen_id: "lead-1",
          },
        },
      },
    } satisfies MetaWebhookEvent);

    expect(snapshot).toBeNull();
  });

  it("uses the subscribed asset id for comment changes instead of the commenter id", () => {
    const events = extractMetaWebhookEvents({
      object: "instagram",
      entry: [{
        id: "ig-business-1",
        time: 1_700_000_000,
        changes: [{
          field: "comments",
          value: {
            media_id: "media-1",
            comment_id: "comment-1",
            message: "quero",
            from: {
              id: "ig-user-1",
              username: "cliente",
            },
          },
        }],
      }],
    });

    expect(events[0]).toMatchObject({
      assetId: "ig-business-1",
      eventType: "meta.instagram.comments",
    });
  });
});
