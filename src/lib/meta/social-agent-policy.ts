import {
  normalizeAgentChannelConfig,
  type AgentChannelConfigItem,
  type AgentChannelId,
} from "../agents/multichannel";
import {
  commentAutomationChannelConfig,
  type CommentAutomation,
  type SocialFollowUp,
} from "./comment-automations";

export type MetaSocialChannel = Exclude<AgentChannelId, "whatsapp">;

export const metaSocialMessageReceivedEventName =
  "connectyhub/meta.message.received" as const;
export const metaSocialCommentReceivedEventName =
  "connectyhub/meta.comment.received" as const;

export type MetaSocialAgentEventName =
  | typeof metaSocialMessageReceivedEventName
  | typeof metaSocialCommentReceivedEventName;

export type MetaSocialQueueDecision =
  | {
      shouldQueue: false;
      reason: "channel_disabled";
      triggerSource: MetaSocialAgentEventName;
      channelConfig: AgentChannelConfigItem;
    }
  | {
      shouldQueue: true;
      reason: "ready";
      triggerSource: MetaSocialAgentEventName;
      channelConfig: AgentChannelConfigItem;
      autoReply: boolean;
      requiresHumanApproval: boolean;
      approvalReasons: string[];
      publicSurface: boolean;
      finalRunStatus: "needs_approval" | "completed";
      autoSendBlocked: boolean;
      autoSendBlockReason: "human_approval_required" | null;
    };

const metaSocialChannels: readonly MetaSocialChannel[] = [
  "instagram_direct",
  "instagram_comments",
  "facebook_messenger",
  "facebook_comments",
];

export function isMetaSocialChannel(
  value: unknown,
): value is MetaSocialChannel {
  return (
    typeof value === "string" &&
    metaSocialChannels.includes(value as MetaSocialChannel)
  );
}

export function isMetaCommentChannel(channel: MetaSocialChannel) {
  return channel === "instagram_comments" || channel === "facebook_comments";
}

export function resolveMetaSocialTrigger(
  channel: MetaSocialChannel,
): MetaSocialAgentEventName {
  return isMetaCommentChannel(channel)
    ? metaSocialCommentReceivedEventName
    : metaSocialMessageReceivedEventName;
}

export function resolveMetaSocialQueueDecision(input: {
  channel: MetaSocialChannel;
  config: unknown;
  agentRequiresHumanApproval?: boolean;
  automation?: CommentAutomation | null;
  followUp?: SocialFollowUp | null;
}): MetaSocialQueueDecision {
  const config = normalizeAgentChannelConfig(input.config);
  const baseConfig = config.channels[input.channel];
  const channelConfig =
    input.automation && baseConfig.enabled
      ? commentAutomationChannelConfig(input.automation)
      : input.followUp && baseConfig.enabled
        ? {
            ...baseConfig,
            autoReply: !input.followUp.requireApproval,
            requiresHumanApproval: input.followUp.requireApproval,
          }
        : baseConfig;
  const triggerSource = resolveMetaSocialTrigger(input.channel);

  if (!channelConfig.enabled) {
    return {
      shouldQueue: false,
      reason: "channel_disabled",
      triggerSource,
      channelConfig,
    };
  }

  const publicSurface = channelConfig.mode === "public";
  const approvalReasons = [
    publicSurface && !input.automation ? "public_social_surface" : null,
    channelConfig.requiresHumanApproval
      ? "channel_requires_human_approval"
      : null,
    channelConfig.autoReply ? null : "channel_auto_reply_disabled",
    input.agentRequiresHumanApproval === true &&
    !input.automation &&
    !input.followUp
      ? "agent_requires_human_approval"
      : null,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    shouldQueue: true,
    reason: "ready",
    triggerSource,
    channelConfig,
    autoReply: channelConfig.autoReply,
    requiresHumanApproval: approvalReasons.length > 0,
    approvalReasons,
    publicSurface,
    finalRunStatus: approvalReasons.length ? "needs_approval" : "completed",
    autoSendBlocked: approvalReasons.length > 0,
    autoSendBlockReason: approvalReasons.length
      ? "human_approval_required"
      : null,
  };
}
