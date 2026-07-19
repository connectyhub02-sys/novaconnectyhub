import { describe, expect, it } from "vitest";
import {
  buildMetaSocialCanaryProviderChatId,
  normalizeMetaSocialCanaryDraft,
} from "../src/lib/meta/social-dispatch-canary-policy";

describe("Meta social dispatch canary policy", () => {
  it("normalizes a direct message canary target", () => {
    expect(normalizeMetaSocialCanaryDraft({
      channel: "instagram_direct",
      targetId: "  igsid-123  ",
      text: "  Teste controlado   ConnectyHub. ",
      now: new Date("2026-07-19T12:00:00.000Z"),
    })).toEqual({
      channel: "instagram_direct",
      targetId: "igsid-123",
      text: "Teste controlado ConnectyHub.",
      replyMode: "private",
      occurredAt: "2026-07-19T12:00:00.000Z",
      externalUserId: "igsid-123",
      sourceCommentId: null,
      allowPrivateReplies: true,
      allowPublicReplies: false,
    });
  });

  it("normalizes a public comment reply canary", () => {
    expect(normalizeMetaSocialCanaryDraft({
      channel: "facebook_comments",
      targetId: "comment-123",
      text: "Respondido por aqui.",
      replyMode: "public",
      occurredAt: "2026-07-18T10:00:00.000Z",
    })).toMatchObject({
      channel: "facebook_comments",
      targetId: "comment-123",
      replyMode: "public",
      externalUserId: null,
      sourceCommentId: "comment-123",
      allowPrivateReplies: false,
      allowPublicReplies: true,
      occurredAt: "2026-07-18T10:00:00.000Z",
    });
  });

  it("rejects invalid canary inputs", () => {
    expect(() => normalizeMetaSocialCanaryDraft({
      channel: "whatsapp",
      targetId: "lead-1",
      text: "Oi.",
    })).toThrow("Escolha um canal Meta valido");

    expect(() => normalizeMetaSocialCanaryDraft({
      channel: "facebook_messenger",
      targetId: "",
      text: "Oi.",
    })).toThrow("Informe o ID de destino");
  });

  it("builds a stable canary provider chat id", () => {
    expect(buildMetaSocialCanaryProviderChatId({
      channel: "facebook_messenger",
      externalAccountId: "page-123",
      targetId: "psid-123",
    })).toBe("canary:facebook_messenger:page-123:psid-123");
  });
});
