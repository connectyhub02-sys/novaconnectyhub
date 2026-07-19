import {
  normalizeAgentChannelConfig,
  type AgentChannelConfigItem,
  type AgentChannelId,
} from "../agents/multichannel";

export type MetaSocialChannel = Exclude<AgentChannelId, "whatsapp">;

export const metaSocialMessageReceivedEventName = "connectyhub/meta.message.received" as const;
export const metaSocialCommentReceivedEventName = "connectyhub/meta.comment.received" as const;

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
      finalRunStatus: "needs_approval";
      autoSendBlocked: true;
      autoSendBlockReason: "meta_social_response_adapter_pending";
    };

const metaSocialChannels: readonly MetaSocialChannel[] = [
  "instagram_direct",
  "instagram_comments",
  "facebook_messenger",
  "facebook_comments",
];

export function isMetaSocialChannel(value: unknown): value is MetaSocialChannel {
  return typeof value === "string" && metaSocialChannels.includes(value as MetaSocialChannel);
}

export function isMetaCommentChannel(channel: MetaSocialChannel) {
  return channel === "instagram_comments" || channel === "facebook_comments";
}

export function resolveMetaSocialTrigger(channel: MetaSocialChannel): MetaSocialAgentEventName {
  return isMetaCommentChannel(channel)
    ? metaSocialCommentReceivedEventName
    : metaSocialMessageReceivedEventName;
}

export function resolveMetaSocialQueueDecision(input: {
  channel: MetaSocialChannel;
  config: unknown;
  agentRequiresHumanApproval?: boolean;
}): MetaSocialQueueDecision {
  const config = normalizeAgentChannelConfig(input.config);
  const channelConfig = config.channels[input.channel];
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
    publicSurface ? "public_social_surface" : null,
    channelConfig.requiresHumanApproval ? "channel_requires_human_approval" : null,
    channelConfig.autoReply ? null : "channel_auto_reply_disabled",
    input.agentRequiresHumanApproval === true ? "agent_requires_human_approval" : null,
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
    finalRunStatus: "needs_approval",
    autoSendBlocked: true,
    autoSendBlockReason: "meta_social_response_adapter_pending",
  };
}
