import { describe, expect, it } from "vitest";
import {
  matchCommentAutomation,
  normalizeSocialAutomations,
  isSocialOptOut,
} from "../src/lib/meta/comment-automations";
import { resolveMetaSocialQueueDecision } from "../src/lib/meta/social-agent-policy";
import { resolveMetaSocialDispatchTarget } from "../src/lib/meta/social-dispatch-policy";
import { normalizeAgentChannelConfig } from "../src/lib/agents/multichannel";
import {
  evaluateAgentChannelAvailability,
  assertAgentChannelsAvailable,
} from "../src/lib/agents/channel-availability";

const rule = {
  id: "r1",
  name: "Material",
  platform: "instagram",
  enabled: true,
  trigger: "keyword",
  keywords: ["eu quero"],
  action: "private_message",
  text: "Aqui está seu material.",
  requireApproval: true,
};
describe("comment traffic automations", () => {
  it("matches case and accents, only on the configured post and platform", () => {
    const config = {
      rules: [{ ...rule, keywords: ["informação"], postIds: ["post-1"] }],
    };
    expect(
      matchCommentAutomation(config, {
        channel: "instagram_comments",
        text: "Quero INFORMAÇÃO!",
        postId: "post-1",
      })?.id,
    ).toBe("r1");
    expect(
      matchCommentAutomation(config, {
        channel: "instagram_comments",
        text: "informação",
        postId: "foreign",
      }),
    ).toBeNull();
    expect(
      matchCommentAutomation(config, {
        channel: "facebook_comments",
        text: "informação",
        postId: "post-1",
      }),
    ).toBeNull();
    expect(
      matchCommentAutomation(config, {
        channel: "instagram_direct",
        text: "informação",
        postId: "post-1",
      }),
    ).toBeNull();
  });
  it("uses whole phrases, excludes paused rules, and accepts emojis in any-comment rules", () => {
    expect(
      matchCommentAutomation(
        { rules: [rule] },
        {
          channel: "instagram_comments",
          text: "meu quero-quero",
          postId: null,
        },
      ),
    ).toBeNull();
    expect(
      matchCommentAutomation(
        { rules: [rule] },
        {
          channel: "instagram_comments",
          text: "meu quero-quero, eu quero!",
          postId: null,
        },
      )?.id,
    ).toBe("r1");
    expect(
      matchCommentAutomation(
        { rules: [{ ...rule, enabled: false }] },
        { channel: "instagram_comments", text: "eu quero", postId: null },
      ),
    ).toBeNull();
    expect(
      matchCommentAutomation(
        { rules: [{ ...rule, trigger: "any_comment", action: "public_ai" }] },
        { channel: "instagram_comments", text: "🔥", postId: null },
      )?.action,
    ).toBe("public_ai");
  });
  it("prioritizes a keyword offer above a generic public reply", () => {
    expect(
      matchCommentAutomation(
        {
          rules: [
            { ...rule, id: "all", trigger: "any_comment", action: "public_ai" },
            rule,
          ],
        },
        { channel: "instagram_comments", text: "Eu quero!", postId: null },
      )?.id,
    ).toBe("r1");
  });
  it("keeps drafts available and refuses incomplete active rules or unsafe buttons", () => {
    expect(
      normalizeSocialAutomations({ rules: [{ id: "draft" }] }).rules[0].enabled,
    ).toBe(false);
    expect(() =>
      normalizeSocialAutomations({ rules: [{ id: "r", enabled: true }] }),
    ).toThrow();
    for (const url of [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:pass@example.com",
    ])
      expect(() =>
        normalizeSocialAutomations({
          rules: [{ ...rule, buttonTitle: "Abrir", buttonUrl: url }],
        }),
      ).toThrow();
    expect(() => normalizeSocialAutomations({ rules: [rule, rule] })).toThrow();
  });
  it("supports an explicitly automatic public rule without enabling a disabled channel", () => {
    const automation = normalizeSocialAutomations({
      rules: [{ ...rule, action: "public_ai", requireApproval: false }],
    }).rules[0];
    const config = normalizeAgentChannelConfig({
      channels: { instagram_comments: { enabled: true } },
    });
    expect(
      resolveMetaSocialQueueDecision({
        channel: "instagram_comments",
        config,
        automation,
        agentRequiresHumanApproval: true,
      }),
    ).toMatchObject({
      shouldQueue: true,
      requiresHumanApproval: false,
      channelConfig: { allowPublicReplies: true, allowPrivateReplies: false },
    });
    expect(
      resolveMetaSocialQueueDecision({
        channel: "instagram_comments",
        config: null,
        automation,
      }),
    ).toMatchObject({ shouldQueue: false });
    expect(
      resolveMetaSocialQueueDecision({ channel: "instagram_comments", config }),
    ).toMatchObject({ requiresHumanApproval: true });
  });
  it("builds a private reply with a real URL button and rejects public buttons", () => {
    const input = {
      channel: "instagram_comments" as const,
      pageId: "page",
      sourceCommentId: "comment",
      text: "Seu material",
      button: { title: "Ver material", url: "https://example.com/material" },
    };
    expect(resolveMetaSocialDispatchTarget(input)).toMatchObject({
      kind: "private_comment_reply",
      body: {
        recipient: { comment_id: "comment" },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              buttons: [
                {
                  type: "web_url",
                  title: "Ver material",
                  url: "https://example.com/material",
                },
              ],
            },
          },
        },
      },
    });
    expect(() =>
      resolveMetaSocialDispatchTarget({
        ...input,
        allowPrivateReplies: false,
        allowPublicReplies: true,
      }),
    ).toThrow();
  });
  it("recognizes opt-out in private messages", () => {
    expect(isSocialOptOut("Não quero receber mensagens")).toBe(true);
    expect(isSocialOptOut("Eu quero o material")).toBe(false);
  });
});

describe("channel selection gating", () => {
  const ready = {
    allowed: true,
    connected: true,
    hasToken: true,
    scopes: [
      "pages_messaging",
      "instagram_manage_messages",
      "instagram_manage_comments",
      "pages_manage_engagement",
    ],
    metadata: {
      selected_facebook_page_id: "page",
      selected_instagram_business_id: "ig",
      webhook_activation: { ok: true },
    },
  };
  it("requires the actual integration, assets, grants and webhook", () => {
    expect(
      evaluateAgentChannelAvailability(ready).instagram_direct.available,
    ).toBe(true);
    for (const patch of [
      { connected: false },
      { hasToken: false },
      { allowed: false },
      { scopes: ["instagram_basic"] },
      { metadata: {} },
    ])
      expect(
        evaluateAgentChannelAvailability({ ...ready, ...patch })
          .instagram_direct.available,
      ).toBe(false);
  });
  it("blocks forged enables while permitting disable and unchanged legacy saves", () => {
    const unavailable = evaluateAgentChannelAvailability({
      ...ready,
      scopes: [],
    });
    const enabled = normalizeAgentChannelConfig({
      channels: { instagram_direct: { enabled: true } },
    });
    expect(() =>
      assertAgentChannelsAvailable(enabled, null, unavailable),
    ).toThrow();
    expect(() =>
      assertAgentChannelsAvailable(enabled, enabled, unavailable),
    ).not.toThrow();
    expect(() =>
      assertAgentChannelsAvailable(
        normalizeAgentChannelConfig(null),
        enabled,
        unavailable,
      ),
    ).not.toThrow();
  });
});
