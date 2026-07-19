import { describe, expect, it } from "vitest";
import { buildMetaOperationalChecklist } from "../src/lib/meta/operational-checklist-policy";
import { buildMetaSocialDispatchLiveActivation } from "../src/lib/meta/social-dispatch-policy";

describe("Meta operational checklist policy", () => {
  it("marks the package ready for tests when all gates are ready in live mode", () => {
    const metadata = buildReadyMetadata({
      canary: { status: "sent", channelLabel: "Facebook Messenger", ranAt: "2026-07-19T12:00:00.000Z" },
    });

    expect(buildMetaOperationalChecklist({
      accountLabel: "Meta Principal",
      integrationStatus: "connected",
      metadata,
      now: new Date("2026-07-19T13:00:00.000Z"),
      runtimeMode: "live",
    })).toMatchObject({
      status: "ready_for_tests",
      ready: 7,
      warning: 0,
      blocked: 0,
      runtimeMode: "live",
    });
  });

  it("keeps internal tests allowed with attention when server is dry-run and canary was blocked by the guard", () => {
    const metadata = buildReadyMetadata({
      canary: {
        status: "blocked",
        detail: "Adapter Meta em modo dry-run.",
        channelLabel: "Instagram Direct",
        ranAt: "2026-07-19T12:00:00.000Z",
      },
    });
    const checklist = buildMetaOperationalChecklist({
      accountLabel: "Meta Principal",
      integrationStatus: "connected",
      metadata,
      now: new Date("2026-07-19T13:00:00.000Z"),
      runtimeMode: "dry_run",
    });

    expect(checklist.status).toBe("needs_attention");
    expect(checklist.blocked).toBe(0);
    expect(checklist.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "runtime_mode",
        status: "warning",
      }),
      expect.objectContaining({
        id: "canary",
        status: "warning",
      }),
    ]));
  });

  it("blocks the package when required operational evidence is missing", () => {
    const checklist = buildMetaOperationalChecklist({
      integrationStatus: "connected",
      metadata: {
        selected_ad_account_id: "act_123",
      },
      now: new Date("2026-07-19T13:00:00.000Z"),
      runtimeMode: "dry_run",
    });

    expect(checklist.status).toBe("blocked");
    expect(checklist.blocked).toBeGreaterThanOrEqual(4);
    expect(checklist.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "app_review",
        status: "blocked",
      }),
      expect.objectContaining({
        id: "webhooks",
        status: "blocked",
      }),
      expect.objectContaining({
        id: "live_activation",
        status: "blocked",
      }),
      expect.objectContaining({
        id: "canary",
        status: "blocked",
      }),
    ]));
  });
});

function buildReadyMetadata(input: {
  canary: {
    status: "sent" | "blocked" | "failed" | "skipped";
    detail?: string;
    channelLabel: string;
    ranAt: string;
  };
}) {
  const reviewTest = {
    ok: true,
    readiness: {
      status: "ready",
      total: 3,
      ready: 3,
      warning: 0,
      blocked: 0,
      generatedAt: "2026-07-19T12:00:00.000Z",
    },
    results: [{
      ok: true,
      permissions: [
        "pages_messaging",
        "pages_manage_metadata",
        "instagram_manage_messages",
      ],
    }],
  };
  const metadata = {
    selected_ad_account_id: "act_123",
    selected_facebook_page_id: "page-123",
    selected_instagram_business_id: "ig-123",
    review_test: reviewTest,
    webhook_activation: {
      ok: true,
      activatedAt: "2026-07-19T12:00:00.000Z",
    },
    webhook_simulation: {
      ingest: {
        normalized: 1,
        failed: 0,
        unmapped: 0,
      },
    },
    meta_social_dispatch_canary: {
      runId: "run-123",
      status: input.canary.status,
      detail: input.canary.detail ?? "Canario Meta processado.",
      channelLabel: input.canary.channelLabel,
      ranAt: input.canary.ranAt,
    },
  };

  return {
    ...metadata,
    meta_social_dispatch_activation: buildMetaSocialDispatchLiveActivation({
      appLiveModeConfirmed: true,
      channels: { instagram_direct: true },
      metadata,
      updatedAt: "2026-07-19T12:00:00.000Z",
      updatedBy: "user-123",
    }),
  };
}
