import { describe, expect, it } from "vitest";
import {
  metaSocialCommentReceivedEventName,
  metaSocialMessageReceivedEventName,
  resolveMetaSocialQueueDecision,
  resolveMetaSocialTrigger,
} from "../src/lib/meta/social-agent-policy";

describe("Meta social agent queue policy", () => {
  it("does not queue Meta channels until the user enables them", () => {
    const decision = resolveMetaSocialQueueDecision({
      channel: "instagram_direct",
      config: null,
    });

    expect(decision).toMatchObject({
      shouldQueue: false,
      reason: "channel_disabled",
      triggerSource: metaSocialMessageReceivedEventName,
    });
  });

  it("routes private social messages through the message queue", () => {
    const decision = resolveMetaSocialQueueDecision({
      channel: "instagram_direct",
      config: {
        channels: {
          instagram_direct: {
            enabled: true,
            autoReply: true,
            requiresHumanApproval: false,
          },
        },
      },
      agentRequiresHumanApproval: false,
    });

    expect(decision.shouldQueue).toBe(true);

    if (!decision.shouldQueue) {
      throw new Error("Expected Instagram Direct to be queued.");
    }

    expect(decision.triggerSource).toBe(metaSocialMessageReceivedEventName);
    expect(decision.requiresHumanApproval).toBe(false);
    expect(decision.finalRunStatus).toBe("needs_approval");
    expect(decision.autoSendBlocked).toBe(true);
  });

  it("routes social comments through the comment queue with approval safeguards", () => {
    const decision = resolveMetaSocialQueueDecision({
      channel: "facebook_comments",
      config: {
        channels: {
          facebook_comments: {
            enabled: true,
            autoReply: false,
            requiresHumanApproval: true,
          },
        },
      },
      agentRequiresHumanApproval: false,
    });

    expect(decision.shouldQueue).toBe(true);

    if (!decision.shouldQueue) {
      throw new Error("Expected Facebook comments to be queued.");
    }

    expect(decision.triggerSource).toBe(metaSocialCommentReceivedEventName);
    expect(decision.publicSurface).toBe(true);
    expect(decision.requiresHumanApproval).toBe(true);
    expect(decision.approvalReasons).toContain("public_social_surface");
    expect(decision.approvalReasons).toContain("channel_auto_reply_disabled");
  });

  it("keeps the agent-level approval rule across social channels", () => {
    const decision = resolveMetaSocialQueueDecision({
      channel: "facebook_messenger",
      config: {
        channels: {
          facebook_messenger: {
            enabled: true,
            autoReply: true,
            requiresHumanApproval: false,
          },
        },
      },
      agentRequiresHumanApproval: true,
    });

    expect(decision.shouldQueue).toBe(true);

    if (!decision.shouldQueue) {
      throw new Error("Expected Facebook Messenger to be queued.");
    }

    expect(decision.requiresHumanApproval).toBe(true);
    expect(decision.approvalReasons).toEqual(["agent_requires_human_approval"]);
  });

  it("keeps direct and comment triggers separate", () => {
    expect(resolveMetaSocialTrigger("instagram_direct")).toBe(metaSocialMessageReceivedEventName);
    expect(resolveMetaSocialTrigger("instagram_comments")).toBe(metaSocialCommentReceivedEventName);
  });
});
