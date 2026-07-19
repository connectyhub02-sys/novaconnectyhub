import { isMetaCommentChannel, isMetaSocialChannel, type MetaSocialChannel } from "./social-agent-policy";

export type MetaSocialCanaryReplyMode = "private" | "public";

export type MetaSocialCanaryDraft = {
  channel: MetaSocialChannel;
  targetId: string;
  text: string;
  replyMode: MetaSocialCanaryReplyMode;
  occurredAt: string;
  externalUserId: string | null;
  sourceCommentId: string | null;
  allowPrivateReplies: boolean;
  allowPublicReplies: boolean;
};

const maxCanaryTextLength = 500;

export function normalizeMetaSocialCanaryDraft(input: {
  channel: unknown;
  targetId: unknown;
  text: unknown;
  replyMode?: unknown;
  occurredAt?: unknown;
  now?: Date;
}): MetaSocialCanaryDraft {
  if (!isMetaSocialChannel(input.channel)) {
    throw new Error("Escolha um canal Meta valido para o canario.");
  }

  const targetId = readRequiredString(input.targetId, "Informe o ID de destino do canario Meta.");
  const text = normalizeCanaryText(input.text);
  const occurredAt = normalizeOccurredAt(input.occurredAt, input.now);
  const commentChannel = isMetaCommentChannel(input.channel);
  const replyMode = commentChannel && input.replyMode === "public" ? "public" : "private";

  return {
    channel: input.channel,
    targetId,
    text,
    replyMode,
    occurredAt,
    externalUserId: commentChannel ? null : targetId,
    sourceCommentId: commentChannel ? targetId : null,
    allowPrivateReplies: !commentChannel || replyMode === "private",
    allowPublicReplies: commentChannel && replyMode === "public",
  };
}

export function buildMetaSocialCanaryProviderChatId(input: {
  channel: MetaSocialChannel;
  externalAccountId: string | null;
  targetId: string;
}) {
  const accountId = input.externalAccountId?.trim() || "meta";
  return `canary:${input.channel}:${accountId}:${input.targetId}`;
}

function normalizeCanaryText(value: unknown) {
  const text = readRequiredString(value, "Informe o texto do canario Meta.")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length > maxCanaryTextLength) {
    throw new Error(`O texto do canario Meta pode ter no maximo ${maxCanaryTextLength} caracteres.`);
  }

  return text;
}

function normalizeOccurredAt(value: unknown, now = new Date()) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    return now.toISOString();
  }

  const time = Date.parse(text);

  if (!Number.isFinite(time)) {
    throw new Error("Informe uma data valida para o evento Meta do canario.");
  }

  return new Date(time).toISOString();
}

function readRequiredString(value: unknown, message: string) {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";

  if (!text) {
    throw new Error(message);
  }

  return text;
}
