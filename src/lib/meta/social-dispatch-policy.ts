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
  reason: "ready" | "dry_run" | "missing_permissions" | "expired_private_reply_window";
  detail: string;
  requiredPermissions: string[];
  missingPermissions: string[];
  warnings: string[];
};

const privateReplyWindowMs = 7 * 24 * 60 * 60 * 1000;

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

  if (input.mode !== "live") {
    return {
      ok: false,
      mode: input.mode,
      reason: "dry_run",
      detail: "Adapter Meta em modo dry-run. O envio real so ocorre com META_SOCIAL_DISPATCH_MODE=live.",
      requiredPermissions,
      missingPermissions,
      warnings,
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
    warnings,
  };
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
