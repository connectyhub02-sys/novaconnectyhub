import { describe, expect, it } from "vitest";
import {
  metaPageWebhookFields,
  normalizeMetaPageWebhookFields,
  summarizeMetaPageSubscription,
} from "../src/lib/meta/webhook-activation-policy";

describe("Meta webhook activation policy", () => {
  it("defaults to the supported Page webhook fields", () => {
    expect(normalizeMetaPageWebhookFields(undefined)).toEqual(metaPageWebhookFields);
  });

  it("keeps only supported fields and removes duplicates", () => {
    expect(normalizeMetaPageWebhookFields([
      "messages",
      "comments",
      "messages",
      "feed",
      "messaging_postbacks",
    ])).toEqual(["messages", "feed", "messaging_postbacks"]);
  });

  it("reports missing subscribed fields", () => {
    expect(summarizeMetaPageSubscription({
      requestedFields: metaPageWebhookFields,
      subscribedFields: ["feed", "messages"],
    })).toMatchObject({
      ok: false,
      missingFields: ["mention", "messaging_postbacks"],
      subscribedFields: ["feed", "messages"],
    });
  });
});
