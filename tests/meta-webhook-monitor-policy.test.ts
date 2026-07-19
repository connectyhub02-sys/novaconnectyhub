import { describe, expect, it } from "vitest";
import {
  isReplayableMetaWebhookStatus,
  resolveMetaWebhookMonitorChannel,
  summarizeMetaWebhookChannels,
  summarizeMetaWebhookMonitorEvents,
} from "../src/lib/meta/webhook-monitor-policy";

describe("Meta webhook monitor policy", () => {
  it("maps Meta event types to operational channels", () => {
    expect(resolveMetaWebhookMonitorChannel({ eventType: "meta.instagram.messaging" })).toBe("instagram_direct");
    expect(resolveMetaWebhookMonitorChannel({ eventType: "meta.page.messaging" })).toBe("facebook_messenger");
    expect(resolveMetaWebhookMonitorChannel({ eventType: "meta.instagram.comments" })).toBe("instagram_comments");
    expect(resolveMetaWebhookMonitorChannel({ eventType: "meta.page.feed" })).toBe("facebook_comments");
  });

  it("allows replay only for non-processed events", () => {
    expect(isReplayableMetaWebhookStatus("received")).toBe(true);
    expect(isReplayableMetaWebhookStatus("ignored")).toBe(true);
    expect(isReplayableMetaWebhookStatus("failed")).toBe(true);
    expect(isReplayableMetaWebhookStatus("processed")).toBe(false);
  });

  it("summarizes monitor health from status counts", () => {
    const summary = summarizeMetaWebhookMonitorEvents([
      { channel: "instagram_direct", status: "processed", receivedAt: "2026-07-19T12:00:00.000Z" },
      { channel: "instagram_direct", status: "received", receivedAt: "2026-07-19T12:01:00.000Z" },
      { channel: "facebook_comments", status: "failed", receivedAt: "2026-07-19T12:02:00.000Z" },
    ]);

    expect(summary).toMatchObject({
      total: 3,
      processed: 1,
      received: 1,
      failed: 1,
      replayable: 2,
      processedRate: 33,
      health: "warning",
      lastFailedAt: "2026-07-19T12:02:00.000Z",
    });
  });

  it("summarizes channels independently", () => {
    const channels = summarizeMetaWebhookChannels([
      { channel: "instagram_direct", status: "processed", receivedAt: "2026-07-19T12:00:00.000Z" },
      { channel: "instagram_direct", status: "failed", receivedAt: "2026-07-19T12:01:00.000Z" },
      { channel: "facebook_messenger", status: "processed", receivedAt: "2026-07-19T12:02:00.000Z" },
    ]);

    expect(channels.find((channel) => channel.channel === "instagram_direct")).toMatchObject({
      total: 2,
      processed: 1,
      failed: 1,
    });
    expect(channels.find((channel) => channel.channel === "facebook_messenger")).toMatchObject({
      total: 1,
      processed: 1,
      failed: 0,
    });
  });
});
