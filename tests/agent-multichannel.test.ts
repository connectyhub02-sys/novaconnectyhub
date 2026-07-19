import { describe, expect, it } from "vitest";
import {
  buildAgentChannelRuntimeInstruction,
  defaultAgentChannelConfig,
  isAgentChannelEnabled,
  normalizeAgentChannelConfig,
} from "../src/lib/agents/multichannel";

describe("agent multichannel config", () => {
  it("keeps WhatsApp enabled as the primary channel", () => {
    const config = normalizeAgentChannelConfig({
      primaryChannel: "instagram_direct",
      channels: {
        whatsapp: {
          enabled: false,
          autoReply: false,
        },
      },
    });

    expect(config.primaryChannel).toBe("whatsapp");
    expect(config.channels.whatsapp.enabled).toBe(true);
    expect(config.channels.whatsapp.mode).toBe("primary");
  });

  it("defaults Meta channels to paused until the user enables them", () => {
    const config = normalizeAgentChannelConfig(null);

    expect(config.channels.instagram_direct.enabled).toBe(false);
    expect(config.channels.instagram_comments.enabled).toBe(false);
    expect(config.channels.facebook_messenger.enabled).toBe(false);
    expect(config.channels.facebook_comments.enabled).toBe(false);
  });

  it("preserves enabled Meta channels and public comment safeguards", () => {
    const config = normalizeAgentChannelConfig({
      channels: {
        instagram_comments: {
          enabled: true,
          allowPublicReplies: true,
          allowPrivateReplies: true,
          requiresHumanApproval: true,
        },
      },
    });

    expect(isAgentChannelEnabled(config, "instagram_comments")).toBe(true);
    expect(config.channels.instagram_comments.allowPublicReplies).toBe(true);
    expect(config.channels.instagram_comments.allowPrivateReplies).toBe(true);
    expect(config.channels.instagram_comments.requiresHumanApproval).toBe(true);
  });

  it("builds channel-specific runtime guidance without replacing the main prompt", () => {
    const instruction = buildAgentChannelRuntimeInstruction({
      channelId: "facebook_comments",
      config: {
        ...defaultAgentChannelConfig,
        channels: {
          ...defaultAgentChannelConfig.channels,
          facebook_comments: {
            ...defaultAgentChannelConfig.channels.facebook_comments,
            enabled: true,
          },
        },
      },
    });

    expect(instruction).toContain("comentario publico");
    expect(instruction).toContain("nao exponha dados pessoais");
    expect(instruction).toContain("aprovacao humana");
  });
});
