export type MetaWebhookMonitorChannel =
  | "facebook_comments"
  | "facebook_messenger"
  | "instagram_comments"
  | "instagram_direct"
  | "unknown";

export type MetaWebhookMonitorStatus = "received" | "processed" | "ignored" | "failed";
export type MetaWebhookMonitorHealth = "idle" | "healthy" | "warning" | "critical";

export type MetaWebhookMonitorEventLike = {
  channel: MetaWebhookMonitorChannel;
  status: MetaWebhookMonitorStatus;
  receivedAt: string | null;
};

export type MetaWebhookMonitorSummary = {
  total: number;
  received: number;
  processed: number;
  ignored: number;
  failed: number;
  replayable: number;
  processedRate: number;
  health: MetaWebhookMonitorHealth;
  lastReceivedAt: string | null;
  lastFailedAt: string | null;
};

export const metaWebhookMonitorChannels: readonly MetaWebhookMonitorChannel[] = [
  "facebook_comments",
  "facebook_messenger",
  "instagram_comments",
  "instagram_direct",
  "unknown",
];

export function normalizeMetaWebhookMonitorStatus(value: unknown): MetaWebhookMonitorStatus {
  return value === "processed" || value === "ignored" || value === "failed" ? value : "received";
}

export function isReplayableMetaWebhookStatus(value: unknown) {
  const status = normalizeMetaWebhookMonitorStatus(value);
  return status === "received" || status === "ignored" || status === "failed";
}

export function resolveMetaWebhookMonitorChannel(input: {
  eventType?: string | null;
  object?: string | null;
  field?: string | null;
}): MetaWebhookMonitorChannel {
  const eventType = input.eventType?.toLowerCase() ?? "";
  const object = input.object?.toLowerCase() ?? "";
  const field = input.field?.toLowerCase() ?? "";

  if (eventType.includes("instagram.messaging") || (object === "instagram" && eventType.includes("messaging"))) {
    return "instagram_direct";
  }

  if (eventType.includes("page.messaging") || (object === "page" && eventType.includes("messaging"))) {
    return "facebook_messenger";
  }

  if (
    eventType.includes("instagram.comments")
    || (object === "instagram" && /comment|mention/.test(field))
  ) {
    return "instagram_comments";
  }

  if (
    eventType.includes("page.feed")
    || eventType.includes("page.mention")
    || (object === "page" && /comment|feed|mention/.test(field))
  ) {
    return "facebook_comments";
  }

  return "unknown";
}

export function summarizeMetaWebhookMonitorEvents(events: MetaWebhookMonitorEventLike[]): MetaWebhookMonitorSummary {
  const total = events.length;
  const received = events.filter((event) => event.status === "received").length;
  const processed = events.filter((event) => event.status === "processed").length;
  const ignored = events.filter((event) => event.status === "ignored").length;
  const failed = events.filter((event) => event.status === "failed").length;
  const replayable = events.filter((event) => isReplayableMetaWebhookStatus(event.status)).length;
  const lastReceivedAt = maxDate(events.map((event) => event.receivedAt));
  const lastFailedAt = maxDate(events.filter((event) => event.status === "failed").map((event) => event.receivedAt));
  const processedRate = total > 0 ? Math.round((processed / total) * 100) : 0;

  return {
    total,
    received,
    processed,
    ignored,
    failed,
    replayable,
    processedRate,
    health: resolveMonitorHealth({ total, received, failed }),
    lastReceivedAt,
    lastFailedAt,
  };
}

export function summarizeMetaWebhookChannels(events: MetaWebhookMonitorEventLike[]) {
  return metaWebhookMonitorChannels.map((channel) => {
    const channelEvents = events.filter((event) => event.channel === channel);
    const summary = summarizeMetaWebhookMonitorEvents(channelEvents);

    return {
      channel,
      ...summary,
    };
  });
}

function resolveMonitorHealth(input: {
  total: number;
  received: number;
  failed: number;
}): MetaWebhookMonitorHealth {
  if (input.total === 0) return "idle";
  if (input.failed > 0) return input.failed >= Math.max(3, Math.ceil(input.total / 3)) ? "critical" : "warning";
  if (input.received > 0) return "warning";
  return "healthy";
}

function maxDate(values: Array<string | null>) {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) continue;

    const time = Date.parse(value);

    if (Number.isFinite(time) && time > latestTime) {
      latest = value;
      latestTime = time;
    }
  }

  return latest;
}
