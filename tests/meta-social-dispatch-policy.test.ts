import { describe, expect, it } from "vitest";
import {
  buildMetaSocialDispatchLiveActivation,
  evaluateMetaSocialDispatchReadiness,
  resolveMetaSocialDispatchMode,
  resolveMetaSocialDispatchTarget,
} from "../src/lib/meta/social-dispatch-policy";

describe("Meta social dispatch policy", () => {
  it("routes direct Instagram messages through the page messages endpoint", () => {
    expect(resolveMetaSocialDispatchTarget({
      channel: "instagram_direct",
      externalUserId: "igsid-123",
      pageId: "page-123",
      text: "  Oi, Maria.  ",
    })).toEqual({
      kind: "direct_message",
      endpointPath: "/page-123/messages",
      contentType: "json",
      body: {
        messaging_type: "RESPONSE",
        recipient: { id: "igsid-123" },
        message: { text: "Oi, Maria." },
      },
    });
  });

  it("prefers private replies for Facebook comments when the source comment exists", () => {
    expect(resolveMetaSocialDispatchTarget({
      channel: "facebook_comments",
      pageId: "page-123",
      sourceCommentId: "comment-123",
      text: "Vou te chamar no privado.",
    })).toEqual({
      kind: "private_comment_reply",
      endpointPath: "/page-123/messages",
      contentType: "json",
      body: {
        messaging_type: "RESPONSE",
        recipient: { comment_id: "comment-123" },
        message: { text: "Vou te chamar no privado." },
      },
    });
  });

  it("uses Instagram public comment replies only when public replies are allowed", () => {
    expect(resolveMetaSocialDispatchTarget({
      allowPrivateReplies: false,
      allowPublicReplies: true,
      channel: "instagram_comments",
      sourceCommentId: "ig-comment-123",
      text: "Respondido por aqui.",
    })).toEqual({
      kind: "public_comment_reply",
      endpointPath: "/ig-comment-123/replies",
      contentType: "form",
      body: { message: "Respondido por aqui." },
    });
  });

  it("blocks comment dispatches without a permitted reply mode", () => {
    expect(() => resolveMetaSocialDispatchTarget({
      allowPrivateReplies: false,
      channel: "facebook_comments",
      sourceCommentId: "comment-123",
      text: "Oi.",
    })).toThrow("Canal de comentarios Meta sem modo de resposta permitido.");
  });

  it("keeps dispatches blocked in dry-run mode", () => {
    const target = resolveMetaSocialDispatchTarget({
      channel: "facebook_messenger",
      externalUserId: "psid-123",
      pageId: "page-123",
      text: "Oi.",
    });

    expect(resolveMetaSocialDispatchMode(undefined)).toBe("dry_run");
    expect(evaluateMetaSocialDispatchReadiness({
      channel: "facebook_messenger",
      target,
      mode: "dry_run",
      grantedPermissions: ["pages_messaging"],
    })).toMatchObject({
      ok: false,
      reason: "dry_run",
      missingPermissions: [],
    });
  });

  it("requires channel permissions before live dispatch", () => {
    const target = resolveMetaSocialDispatchTarget({
      allowPrivateReplies: false,
      allowPublicReplies: true,
      channel: "facebook_comments",
      sourceCommentId: "comment-123",
      text: "Respondido por aqui.",
    });
    const liveActivation = buildReadyLiveActivation("facebook_comments", [
      "pages_messaging",
      "pages_manage_metadata",
    ]);

    expect(evaluateMetaSocialDispatchReadiness({
      channel: "facebook_comments",
      target,
      mode: "live",
      liveActivation,
      grantedPermissions: ["pages_messaging", "pages_manage_metadata"],
    })).toMatchObject({
      ok: false,
      reason: "missing_permissions",
      missingPermissions: ["pages_manage_engagement"],
    });
  });

  it("blocks expired private replies in live mode", () => {
    const target = resolveMetaSocialDispatchTarget({
      channel: "facebook_comments",
      pageId: "page-123",
      sourceCommentId: "comment-123",
      text: "Te chamei no privado.",
    });
    const liveActivation = buildReadyLiveActivation("facebook_comments", [
      "pages_messaging",
      "pages_manage_metadata",
    ]);

    expect(evaluateMetaSocialDispatchReadiness({
      channel: "facebook_comments",
      target,
      mode: "live",
      liveActivation,
      grantedPermissions: ["pages_messaging", "pages_manage_metadata"],
      occurredAt: "2026-07-01T12:00:00.000Z",
      now: new Date("2026-07-19T12:00:00.000Z"),
    })).toMatchObject({
      ok: false,
      reason: "expired_private_reply_window",
      missingPermissions: [],
    });
  });

  it("requires operational live activation before live dispatch", () => {
    const target = resolveMetaSocialDispatchTarget({
      channel: "facebook_messenger",
      externalUserId: "psid-123",
      pageId: "page-123",
      text: "Oi.",
    });

    expect(evaluateMetaSocialDispatchReadiness({
      channel: "facebook_messenger",
      target,
      mode: "live",
      grantedPermissions: ["pages_messaging"],
    })).toMatchObject({
      ok: false,
      reason: "live_activation_required",
    });
  });

  it("builds ready live activation only after review, app live and assets are confirmed", () => {
    const activation = buildReadyLiveActivation("instagram_direct", [
      "pages_messaging",
      "instagram_manage_messages",
    ]);

    expect(activation).toMatchObject({
      status: "ready",
      appLiveModeConfirmed: true,
      enabledChannels: 1,
      readyChannels: 1,
      blockedChannels: 0,
    });
    expect(activation.channels.instagram_direct).toMatchObject({
      enabled: true,
      status: "ready",
      missingPermissions: [],
      missingAssets: [],
    });
  });

  it("keeps live activation blocked when Meta prerequisites are missing", () => {
    const activation = buildMetaSocialDispatchLiveActivation({
      appLiveModeConfirmed: false,
      channels: { instagram_comments: true },
      metadata: {
        selected_facebook_page_id: "page-123",
        review_test: {
          ok: true,
          readiness: { status: "ready" },
          results: [{ ok: true, permissions: ["pages_messaging"] }],
        },
      },
      updatedAt: "2026-07-19T12:00:00.000Z",
      updatedBy: "user-123",
    });

    expect(activation.status).toBe("blocked");
    expect(activation.channels.instagram_comments).toMatchObject({
      enabled: true,
      status: "blocked",
      missingPermissions: ["instagram_manage_comments", "instagram_manage_messages"],
      missingAssets: ["instagram_business_account"],
    });
  });
});

function buildReadyLiveActivation(
  channel: "facebook_messenger" | "instagram_direct" | "facebook_comments" | "instagram_comments",
  permissions: string[],
) {
  return buildMetaSocialDispatchLiveActivation({
    appLiveModeConfirmed: true,
    channels: { [channel]: true },
    metadata: {
      selected_facebook_page_id: "page-123",
      selected_instagram_business_id: "ig-123",
      webhook_activation: { ok: true },
      review_test: {
        ok: true,
        readiness: { status: "ready" },
        results: [{ ok: true, permissions }],
      },
    },
    updatedAt: "2026-07-19T12:00:00.000Z",
    updatedBy: "user-123",
  });
}
