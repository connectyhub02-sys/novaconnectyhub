import { describe, expect, it } from "vitest";
import {
  createMetaWebhookSimulationPayload,
  type MetaWebhookSimulationScenario,
} from "../src/lib/meta/webhook-fixtures";
import { extractMetaWebhookEvents } from "../src/lib/meta/webhook-events";

describe("Meta webhook fixtures", () => {
  it("generates a Facebook comment event for the existing extractor", () => {
    const fixture = createMetaWebhookSimulationPayload({
      scenario: "facebook_comment",
      facebookPageId: "page-1",
      now: new Date("2026-07-19T12:00:00.000Z"),
      suffix: "test",
    });
    const events = extractMetaWebhookEvents(fixture.payload);

    expect(fixture.assetId).toBe("page-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      assetId: "page-1",
      eventType: "meta.page.feed",
      sourceEventId: "page-1:1784462400:feed:fb_comment_test:page-1_post_test",
    });
  });

  it("generates an Instagram Direct event for the existing extractor", () => {
    const fixture = createMetaWebhookSimulationPayload({
      scenario: "instagram_direct",
      instagramBusinessId: "ig-1",
      now: new Date("2026-07-19T12:00:00.000Z"),
      suffix: "test",
    });
    const events = extractMetaWebhookEvents(fixture.payload);

    expect(fixture.assetId).toBe("ig-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      assetId: "ig-1",
      eventType: "meta.instagram.messaging",
    });
  });

  it("requires the asset expected by each scenario", () => {
    const scenario: MetaWebhookSimulationScenario = "instagram_comment";

    expect(() => createMetaWebhookSimulationPayload({ scenario, facebookPageId: "page-1" }))
      .toThrow("Instagram Business obrigatorio");
  });
});
