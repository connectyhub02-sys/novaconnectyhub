import { isMetaCommentChannel, type MetaSocialChannel } from "./social-agent-policy";

export type MetaSocialDispatchMode = "dry_run" | "live";

export type MetaSocialDispatchTarget =
  | {
      kind: "direct_message" | "private_comment_reply";
      endpointPath: string;
      contentType: "json";
      body: {
        messaging_type: "RESPONSE";
        recipient: Record<string, string>;
        message: {
          text: string;
        };
      };
    }
  | {
      kind: "public_comment_reply";
      endpointPath: string;
      contentType: "form";
      body: {
        message: string;
      };
    };

export type MetaSocialDispatchReadiness = {
  ok: boolean;
  mode: MetaSocialDispatchMode;
  reason:
    | "ready"
    | "dry_run"
    | "live_activation_required"
    | "missing_permissions"
    | "expired_private_reply_window";
  detail: string;
  requiredPermissions: string[];
  missingPermissions: string[];
  missingAssets: string[];
  warnings: string[];
};

export type MetaSocialDispatchLiveChannelStatus = "disabled" | "ready" | "blocked";
export type MetaSocialDispatchLiveActivationStatus = "disabled" | "ready" | "blocked" | "partially_ready";

export type MetaSocialDispatchLiveChannelActivation = {
  channel: MetaSocialChannel;
  enabled: boolean;
  status: MetaSocialDispatchLiveChannelStatus;
  detail: string;
  requiredPermissions: string[];
  missingPermissions: string[];
  missingAssets: string[];
  warnings: string[];
  activatedAt: string | null;
  activatedBy: string | null;
};

export type MetaSocialDispatchLiveActivationSnapshot = {
  status: MetaSocialDispatchLiveActivationStatus;
  appLiveModeConfirmed: boolean;
  updatedAt: string;
  updatedBy: string | null;
  enabledChannels: number;
  readyChannels: number;
  blockedChannels: number;
  channels: Record<MetaSocialChannel, MetaSocialDispatchLiveChannelActivation>;
};

export type MetaSocialDispatchLiveChannelDraft = Partial<Record<MetaSocialChannel, boolean>>;

const privateReplyWindowMs = 7 * 24 * 60 * 60 * 1000;

export const metaSocialDispatchLiveChannels: readonly MetaSocialChannel[] = [
  "facebook_messenger",
  "instagram_direct",
  "facebook_comments",
  "instagram_comments",
];

export function resolveMetaSocialDispatchTarget(input: {
  channel: MetaSocialChannel;
  pageId?: string | null;
  instagramBusinessId?: string | null;
  externalUserId?: string | null;
  sourceCommentId?: string | null;
  text: string;
  allowPrivateReplies?: boolean;
  allowPublicReplies?: boolean;
}): MetaSocialDispatchTarget {
  const text = normalizeDispatchText(input.text);
  const pageId = normalizeId(input.pageId);
  const instagramBusinessId = normalizeId(input.instagramBusinessId);
  const externalUserId = normalizeId(input.externalUserId);
  const sourceCommentId = normalizeId(input.sourceCommentId);

  if (!isMetaCommentChannel(input.channel)) {
    if (!pageId) {
      throw new Error("Pagina Facebook nao selecionada para envio Meta.");
    }

    if (!externalUserId) {
      throw new Error("Identidade social do lead ausente para envio Meta.");
    }

    return {
      kind: "direct_message",
      endpointPath: `/${pageId}/messages`,
      contentType: "json",
      body: {
        messaging_type: "RESPONSE",
        recipient: { id: externalUserId },
        message: { text },
      },
    };
  }

  if (input.allowPrivateReplies !== false && pageId && sourceCommentId) {
    return {
      kind: "private_comment_reply",
      endpointPath: `/${pageId}/messages`,
      contentType: "json",
      body: {
        messaging_type: "RESPONSE",
        recipient: { comment_id: sourceCommentId },
        message: { text },
      },
    };
  }

  if (input.allowPublicReplies === true && sourceCommentId) {
    return {
      kind: "public_comment_reply",
      endpointPath: input.channel === "instagram_comments"
        ? `/${sourceCommentId}/replies`
        : `/${sourceCommentId}/comments`,
      contentType: "form",
      body: { message: text },
    };
  }

  if (input.channel === "instagram_comments" && instagramBusinessId && input.allowPrivateReplies !== false) {
    throw new Error("Comentario Instagram sem Page ID/source comment suficiente para private reply.");
  }

  throw new Error("Canal de comentarios Meta sem modo de resposta permitido.");
}

export function resolveMetaSocialDispatchMode(value: unknown = process.env.META_SOCIAL_DISPATCH_MODE): MetaSocialDispatchMode {
  return typeof value === "string" && value.trim().toLowerCase() === "live" ? "live" : "dry_run";
}

export function evaluateMetaSocialDispatchReadiness(input: {
  channel: MetaSocialChannel;
  target: MetaSocialDispatchTarget;
  mode: MetaSocialDispatchMode;
  liveActivation?: MetaSocialDispatchLiveActivationSnapshot | null;
  grantedPermissions: Iterable<string>;
  occurredAt?: string | null;
  now?: Date;
}): MetaSocialDispatchReadiness {
  const requiredPermissions = resolveMetaSocialDispatchPermissions(input.channel, input.target.kind);
  const granted = new Set(Array.from(input.grantedPermissions).map((permission) => permission.trim()).filter(Boolean));
  const missingPermissions = requiredPermissions.filter((permission) => !granted.has(permission));
  const warnings = input.target.kind === "public_comment_reply"
    ? ["public_comment_reply_visible_to_all"]
    : [];
  const liveChannel = resolveMetaSocialDispatchLiveChannelActivation(input.liveActivation, input.channel);

  if (input.mode !== "live") {
    return {
      ok: false,
      mode: input.mode,
      reason: "dry_run",
      detail: "Adapter Meta em modo dry-run. O envio real so ocorre com META_SOCIAL_DISPATCH_MODE=live.",
      requiredPermissions,
      missingPermissions,
      missingAssets: [],
      warnings,
    };
  }

  if (!liveChannel.enabled || liveChannel.status !== "ready") {
    return {
      ok: false,
      mode: input.mode,
      reason: "live_activation_required",
      detail: liveChannel.detail || "Ative o envio live deste canal na integracao Meta antes de enviar respostas reais.",
      requiredPermissions: uniqueStrings([...requiredPermissions, ...liveChannel.requiredPermissions]),
      missingPermissions: uniqueStrings([...missingPermissions, ...liveChannel.missingPermissions]),
      missingAssets: liveChannel.missingAssets,
      warnings: uniqueStrings([...warnings, ...liveChannel.warnings]),
    };
  }

  if (missingPermissions.length > 0) {
    return {
      ok: false,
      mode: input.mode,
      reason: "missing_permissions",
      detail: `Permissoes Meta ausentes para envio: ${missingPermissions.join(", ")}.`,
      requiredPermissions,
      missingPermissions,
      missingAssets: [],
      warnings,
    };
  }

  if (input.target.kind === "private_comment_reply" && isPrivateReplyWindowExpired(input.occurredAt, input.now)) {
    return {
      ok: false,
      mode: input.mode,
      reason: "expired_private_reply_window",
      detail: "Private reply Meta bloqueado: comentario fora da janela de 7 dias.",
      requiredPermissions,
      missingPermissions,
      missingAssets: [],
      warnings,
    };
  }

  return {
    ok: true,
    mode: input.mode,
    reason: "ready",
    detail: "Adapter Meta pronto para envio real.",
    requiredPermissions,
    missingPermissions,
    missingAssets: [],
    warnings,
  };
}

export function buildMetaSocialDispatchLiveActivation(input: {
  metadata: Record<string, unknown> | null | undefined;
  scopes?: string[] | null;
  channels?: MetaSocialDispatchLiveChannelDraft;
  appLiveModeConfirmed?: boolean;
  updatedAt?: string;
  updatedBy?: string | null;
}): MetaSocialDispatchLiveActivationSnapshot {
  const metadata = readRecord(input.metadata) ?? {};
  const existing = normalizeMetaSocialDispatchLiveActivation(metadata.meta_social_dispatch_activation);
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const appLiveModeConfirmed = typeof input.appLiveModeConfirmed === "boolean"
    ? input.appLiveModeConfirmed
    : existing.appLiveModeConfirmed;
  const grantedPermissions = readMetaSocialGrantedPermissions({
    metadata,
    scopes: input.scopes,
  });
  const pageId = readString(metadata.selected_facebook_page_id) ?? readString(metadata.facebook_page_id);
  const instagramBusinessId = readString(metadata.selected_instagram_business_id) ?? readString(metadata.instagram_business_id);
  const reviewReady = isMetaReviewReadyForLive(metadata.review_test);
  const webhookActivationOk = readRecord(metadata.webhook_activation)?.ok === true;
  const channels = Object.fromEntries(metaSocialDispatchLiveChannels.map((channel) => {
    const requested = input.channels && Object.prototype.hasOwnProperty.call(input.channels, channel)
      ? input.channels[channel] === true
      : existing.channels[channel].enabled;

    return [channel, evaluateMetaSocialDispatchLiveChannel({
      appLiveModeConfirmed,
      channel,
      enabled: requested,
      grantedPermissions,
      instagramBusinessId,
      pageId,
      reviewReady,
      updatedAt,
      updatedBy: input.updatedBy ?? null,
      webhookActivationOk,
    })];
  })) as Record<MetaSocialChannel, MetaSocialDispatchLiveChannelActivation>;

  return summarizeMetaSocialDispatchLiveActivation({
    appLiveModeConfirmed,
    channels,
    updatedAt,
    updatedBy: input.updatedBy ?? null,
  });
}

export function normalizeMetaSocialDispatchLiveActivation(value: unknown): MetaSocialDispatchLiveActivationSnapshot {
  const record = readRecord(value);
  const channelRecord = readRecord(record?.channels) ?? {};
  const channels = Object.fromEntries(metaSocialDispatchLiveChannels.map((channel) => {
    const raw = readRecord(channelRecord[channel]);
    return [channel, normalizeMetaSocialDispatchLiveChannelActivation(channel, raw)];
  })) as Record<MetaSocialChannel, MetaSocialDispatchLiveChannelActivation>;

  return summarizeMetaSocialDispatchLiveActivation({
    appLiveModeConfirmed: record?.appLiveModeConfirmed === true || record?.app_live_mode_confirmed === true,
    channels,
    updatedAt: readString(record?.updatedAt ?? record?.updated_at) ?? "",
    updatedBy: readString(record?.updatedBy ?? record?.updated_by),
  });
}

export function readMetaSocialGrantedPermissions(input: {
  metadata: Record<string, unknown> | null | undefined;
  scopes?: string[] | null;
}) {
  const metadata = readRecord(input.metadata) ?? {};
  const permissions = new Set<string>();

  for (const scope of input.scopes ?? []) {
    if (scope.trim()) permissions.add(scope.trim());
  }

  const reviewTest = readRecord(metadata.review_test);

  for (const result of readArray(reviewTest?.results)) {
    const record = readRecord(result);

    if (record?.ok !== true) {
      continue;
    }

    for (const permission of readStringArray(record.permissions)) {
      permissions.add(permission);
    }
  }

  return Array.from(permissions).sort();
}

export function resolveMetaSocialDispatchLiveChannelPermissions(channel: MetaSocialChannel) {
  return isMetaCommentChannel(channel)
    ? resolveMetaSocialDispatchPermissions(channel, "private_comment_reply")
    : resolveMetaSocialDispatchPermissions(channel, "direct_message");
}

export function resolveMetaSocialDispatchPermissions(
  channel: MetaSocialChannel,
  targetKind: MetaSocialDispatchTarget["kind"],
) {
  if (targetKind === "public_comment_reply") {
    return channel === "instagram_comments"
      ? ["instagram_manage_comments"]
      : ["pages_manage_engagement"];
  }

  if (targetKind === "private_comment_reply") {
    return channel === "instagram_comments"
      ? ["pages_messaging", "instagram_manage_comments", "instagram_manage_messages"]
      : ["pages_messaging", "pages_manage_metadata"];
  }

  return channel === "instagram_direct"
    ? ["pages_messaging", "instagram_manage_messages"]
    : ["pages_messaging"];
}

function evaluateMetaSocialDispatchLiveChannel(input: {
  appLiveModeConfirmed: boolean;
  channel: MetaSocialChannel;
  enabled: boolean;
  grantedPermissions: Iterable<string>;
  instagramBusinessId: string | null;
  pageId: string | null;
  reviewReady: boolean;
  updatedAt: string;
  updatedBy: string | null;
  webhookActivationOk: boolean;
}): MetaSocialDispatchLiveChannelActivation {
  const requiredPermissions = resolveMetaSocialDispatchLiveChannelPermissions(input.channel);

  if (!input.enabled) {
    return {
      channel: input.channel,
      enabled: false,
      status: "disabled",
      detail: "Canal mantido em dry-run operacional.",
      requiredPermissions,
      missingPermissions: [],
      missingAssets: [],
      warnings: [],
      activatedAt: null,
      activatedBy: null,
    };
  }

  const granted = new Set(Array.from(input.grantedPermissions).map((permission) => permission.trim()).filter(Boolean));
  const missingPermissions = requiredPermissions.filter((permission) => !granted.has(permission));
  const missingAssets = [
    input.pageId ? null : "facebook_page",
    input.channel.startsWith("instagram") && !input.instagramBusinessId ? "instagram_business_account" : null,
  ].filter((asset): asset is string => Boolean(asset));
  const blockers = [
    input.appLiveModeConfirmed ? null : "meta_app_live_mode",
    input.reviewReady ? null : "meta_review_checklist",
    ...missingAssets,
    ...missingPermissions,
  ].filter((item): item is string => Boolean(item));
  const warnings = input.webhookActivationOk ? [] : ["webhook_activation_not_confirmed"];

  if (blockers.length > 0) {
    return {
      channel: input.channel,
      enabled: true,
      status: "blocked",
      detail: `Ativacao live bloqueada: ${blockers.map(formatMetaLiveBlocker).join(", ")}.`,
      requiredPermissions,
      missingPermissions,
      missingAssets,
      warnings,
      activatedAt: null,
      activatedBy: input.updatedBy,
    };
  }

  return {
    channel: input.channel,
    enabled: true,
    status: "ready",
    detail: "Canal liberado para envio social live quando o servidor estiver em META_SOCIAL_DISPATCH_MODE=live.",
    requiredPermissions,
    missingPermissions: [],
    missingAssets: [],
    warnings,
    activatedAt: input.updatedAt,
    activatedBy: input.updatedBy,
  };
}

function summarizeMetaSocialDispatchLiveActivation(input: {
  appLiveModeConfirmed: boolean;
  channels: Record<MetaSocialChannel, MetaSocialDispatchLiveChannelActivation>;
  updatedAt: string;
  updatedBy: string | null;
}): MetaSocialDispatchLiveActivationSnapshot {
  const enabled = Object.values(input.channels).filter((channel) => channel.enabled);
  const ready = enabled.filter((channel) => channel.status === "ready");
  const blocked = enabled.filter((channel) => channel.status === "blocked");
  const status: MetaSocialDispatchLiveActivationStatus = enabled.length === 0
    ? "disabled"
    : blocked.length > 0 && ready.length > 0
      ? "partially_ready"
      : blocked.length > 0
        ? "blocked"
        : "ready";

  return {
    status,
    appLiveModeConfirmed: input.appLiveModeConfirmed,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    enabledChannels: enabled.length,
    readyChannels: ready.length,
    blockedChannels: blocked.length,
    channels: input.channels,
  };
}

function normalizeMetaSocialDispatchLiveChannelActivation(
  channel: MetaSocialChannel,
  record: Record<string, unknown> | null,
): MetaSocialDispatchLiveChannelActivation {
  const enabled = record?.enabled === true;
  const status = normalizeLiveChannelStatus(record?.status, enabled);

  return {
    channel,
    enabled,
    status,
    detail: readString(record?.detail) ?? (enabled ? "Canal aguardando nova validacao live." : "Canal mantido em dry-run operacional."),
    requiredPermissions: readStringArray(record?.requiredPermissions ?? record?.required_permissions),
    missingPermissions: readStringArray(record?.missingPermissions ?? record?.missing_permissions),
    missingAssets: readStringArray(record?.missingAssets ?? record?.missing_assets),
    warnings: readStringArray(record?.warnings),
    activatedAt: readString(record?.activatedAt ?? record?.activated_at),
    activatedBy: readString(record?.activatedBy ?? record?.activated_by),
  };
}

function normalizeLiveChannelStatus(value: unknown, enabled: boolean): MetaSocialDispatchLiveChannelStatus {
  if (!enabled) {
    return "disabled";
  }

  if (value === "ready" || value === "blocked") {
    return value;
  }

  return "blocked";
}

function resolveMetaSocialDispatchLiveChannelActivation(
  activation: MetaSocialDispatchLiveActivationSnapshot | null | undefined,
  channel: MetaSocialChannel,
) {
  return activation?.channels[channel] ?? normalizeMetaSocialDispatchLiveChannelActivation(channel, null);
}

function isMetaReviewReadyForLive(value: unknown) {
  const record = readRecord(value);
  const readiness = readRecord(record?.readiness);
  const status = readString(readiness?.status);

  return record?.ok === true && (status === "ready" || status === "warning");
}

function formatMetaLiveBlocker(value: string) {
  const labels: Record<string, string> = {
    facebook_page: "Pagina Facebook",
    instagram_business_account: "Instagram Business",
    meta_app_live_mode: "Live Mode confirmado",
    meta_review_checklist: "checklist Meta aprovado",
  };

  return labels[value] ?? value;
}

function normalizeDispatchText(value: string) {
  const text = value.trim();

  if (!text) {
    throw new Error("Texto aprovado ausente para envio Meta.");
  }

  return text;
}

function normalizeId(value: string | null | undefined) {
  const text = value?.trim();
  return text || null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isPrivateReplyWindowExpired(value: string | null | undefined, now = new Date()) {
  const text = value?.trim();

  if (!text) {
    return false;
  }

  const time = Date.parse(text);

  if (!Number.isFinite(time)) {
    return false;
  }

  return now.getTime() - time > privateReplyWindowMs;
}
