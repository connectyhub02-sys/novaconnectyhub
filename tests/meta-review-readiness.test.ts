import { describe, expect, it } from "vitest";
import {
  createMetaReviewResult,
  hasMetaPermissionSet,
  summarizeMetaReviewReadiness,
} from "../src/lib/meta/review-readiness";

describe("Meta review readiness", () => {
  it("marks readiness as blocked when a required capability fails", () => {
    const summary = summarizeMetaReviewReadiness([
      createMetaReviewResult({
        id: "oauth_permissions",
        ok: true,
        detail: "ok",
        endpoint: "local",
      }),
      createMetaReviewResult({
        id: "social_agent_permissions",
        ok: false,
        detail: "missing",
        endpoint: "local",
      }),
    ], "2026-07-19T12:00:00.000Z");

    expect(summary).toEqual({
      status: "blocked",
      total: 2,
      ready: 1,
      warning: 0,
      blocked: 1,
      generatedAt: "2026-07-19T12:00:00.000Z",
    });
  });

  it("keeps recommended failures as warnings", () => {
    const summary = summarizeMetaReviewReadiness([
      createMetaReviewResult({
        id: "page_webhook_subscription",
        ok: false,
        detail: "missing subscription",
        endpoint: "graph",
      }),
    ], "2026-07-19T12:00:00.000Z");

    expect(summary.status).toBe("warning");
    expect(summary.warning).toBe(1);
    expect(summary.blocked).toBe(0);
  });

  it("accepts either Instagram content publishing permission name", () => {
    expect(hasMetaPermissionSet([
      "instagram_basic",
      "instagram_business_content_publish",
    ], {
      all: ["instagram_basic"],
      any: ["instagram_content_publish", "instagram_business_content_publish"],
    })).toBe(true);
  });
});
