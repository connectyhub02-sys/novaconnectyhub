import "server-only";

type JsonRecord = Record<string, unknown>;

export type WhatsappMessageMediaKind = "audio" | "document" | "image" | "unknown" | "video";

export type ConversationMessageMediaInput = {
  id: string;
  provider_message_id: string | null;
  provider_chat_id: string | null;
  message_type: string | null;
  text_content?: string | null;
  payload: JsonRecord | null;
};

export type ConversationMessageMedia = {
  kind: WhatsappMessageMediaKind;
  url: string | null;
  directUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
  transcription: {
    provider: string | null;
    model: string | null;
    mimeType: string | null;
    byteLength: number | null;
    transcribedAt: string | null;
  } | null;
};

const mediaUrlKeys = new Set([
  "audiourl",
  "downloadurl",
  "fileurl",
  "mediaurl",
  "publicurl",
  "sourceurl",
  "storageurl",
]);

const contextualMediaUrlKeys = new Set(["href", "link", "url"]);

const mediaContainerKeys = new Set([
  "audio",
  "audiomessage",
  "content",
  "document",
  "documentmessage",
  "file",
  "image",
  "imagemessage",
  "media",
  "message",
  "msg",
  "ptt",
  "video",
  "videomessage",
]);

export function resolveConversationMessageMedia(
  message: ConversationMessageMediaInput,
  options: { proxyBasePath?: string | null } = {},
): ConversationMessageMedia {
  const directUrl = readConversationMessageMediaUrl(message);
  const mimeType = readConversationMessageMimeType(message);
  const detectedKind = detectConversationMessageMediaKind(message);
  const kind = detectedKind ?? inferMediaKindFromMimeOrUrl(mimeType, directUrl) ?? "unknown";
  const proxyUrl = kind === "audio" && options.proxyBasePath
    ? `${options.proxyBasePath.replace(/\/$/, "")}/${encodeURIComponent(message.id)}`
    : null;

  return {
    kind,
    url: proxyUrl ?? directUrl,
    directUrl,
    mimeType,
    fileName: readConversationMessageFileName(message),
    transcription: readConversationMessageTranscription(message),
  };
}

export function detectConversationMessageMediaKind(message: ConversationMessageMediaInput): WhatsappMessageMediaKind | null {
  const providerMessage = readProviderMessageRecord(message);
  const content = readRecord(providerMessage?.content);
  const signature = normalizeSearch([
    message.message_type,
    asString(providerMessage?.messageType),
    asString(providerMessage?.mediaType),
    asString(providerMessage?.type),
    asString(providerMessage?.kind),
    asString(providerMessage?.mimetype),
    asString(providerMessage?.mimeType),
    asString(content?.mimetype),
    asString(content?.mimeType),
    providerMessage?.PTT === true || providerMessage?.ptt === true || content?.PTT === true || content?.ptt === true ? "ptt" : "",
    collectMediaSignature(message.payload).join(" "),
  ].filter(Boolean).join(" "));

  if (isAudioSignature(signature)) return "audio";
  if (signature.includes("image") || signature.includes("photo") || signature.includes("jpeg") || signature.includes("png") || signature.includes("webp") || signature.includes("imagemessage")) return "image";
  if (signature.includes("video") || signature.includes("mp4") || signature.includes("quicktime") || signature.includes("videomessage")) return "video";
  if (signature.includes("document") || signature.includes("file") || signature.includes("pdf") || signature.includes("application/") || signature.includes("documentmessage")) return "document";

  return null;
}

export function readConversationMessageMediaUrl(message: ConversationMessageMediaInput) {
  const providerMessage = readProviderMessageRecord(message);
  const payload = readRecord(message.payload);

  return findMediaUrl(providerMessage, true)
    ?? findMediaUrl(payload, false);
}

export function readConversationMessageMimeType(message: ConversationMessageMediaInput) {
  const providerMessage = readProviderMessageRecord(message);
  const content = readRecord(providerMessage?.content);

  return asString(providerMessage?.mimetype)
    ?? asString(providerMessage?.mimeType)
    ?? asString(content?.mimetype)
    ?? asString(content?.mimeType)
    ?? findString(message.payload, ["mimetype", "mimeType", "contentType", "content_type"]);
}

export function readProviderMessageRecord(message: Pick<ConversationMessageMediaInput, "payload">) {
  const payload = readRecord(message.payload);

  if (!payload) {
    return null;
  }

  return readRecord(payload.message)
    ?? readRecord(payload.msg)
    ?? readRecord(payload.data)
    ?? readRecord(payload.result)
    ?? (Array.isArray(payload.messages) ? readRecord(payload.messages[0]) : null)
    ?? payload;
}

export function buildUazapiDownloadBodies(
  message: ConversationMessageMediaInput,
  providerChatId: string | null = null,
  options: { transcribe?: boolean } = {},
): JsonRecord[] {
  const providerMessage = readProviderMessageRecord(message);
  const ids = uniqueStrings([
    message.provider_message_id,
    asString(providerMessage?.messageid),
    asString(providerMessage?.messageId),
    asString(providerMessage?.id),
  ]);
  const chatid = message.provider_chat_id ?? providerChatId;
  const transcribe = options.transcribe ?? false;
  const bodies: JsonRecord[] = [];

  for (const id of ids) {
    bodies.push({ id, transcribe, return_link: true });

    if (chatid) {
      bodies.push({ id, messageid: id, messageId: id, chatid, transcribe, return_link: true });
    }
  }

  return dedupeJsonRecords(bodies);
}

export function extractProviderDownloadUrl(value: unknown) {
  return findString(value, ["fileURL", "fileUrl", "downloadUrl", "download_url", "url", "link"]);
}

export function extractProviderTranscript(value: unknown) {
  return findString(value, [
    "transcription",
    "transcript",
    "transcribedText",
    "transcribed_text",
    "speechText",
    "speech_text",
    "audioText",
    "audio_text",
  ]);
}

export function extractMimeType(value: unknown) {
  return findString(value, ["mimetype", "mimeType", "contentType", "content_type"]);
}

export function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

export function readProviderError(value: unknown) {
  return findString(value, ["error", "message", "detail", "details"]);
}

function readConversationMessageFileName(message: ConversationMessageMediaInput) {
  const providerMessage = readProviderMessageRecord(message);
  const content = readRecord(providerMessage?.content);

  return asString(providerMessage?.fileName)
    ?? asString(providerMessage?.filename)
    ?? asString(content?.fileName)
    ?? asString(content?.filename)
    ?? null;
}

function readConversationMessageTranscription(message: ConversationMessageMediaInput): ConversationMessageMedia["transcription"] {
  const payload = readRecord(message.payload);
  const raw = readRecord(payload?.media_transcription) ?? readRecord(payload?.mediaTranscription);

  if (!raw) {
    return null;
  }

  return {
    provider: asString(raw.provider),
    model: asString(raw.model),
    mimeType: asString(raw.mime_type) ?? asString(raw.mimeType),
    byteLength: asNumber(raw.byte_length) ?? asNumber(raw.byteLength),
    transcribedAt: asString(raw.transcribed_at) ?? asString(raw.transcribedAt),
  };
}

function findMediaUrl(value: unknown, mediaContext: boolean, depth = 0): string | null {
  if (!value || depth > 5) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMediaUrl(item, mediaContext, depth + 1);
      if (found) return found;
    }

    return null;
  }

  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const recordIsMedia = mediaContext || recordHasMediaSignature(record);

  for (const [key, item] of Object.entries(record)) {
    const normalizedKey = normalizeKey(key);
    const stringValue = asString(item);

    if (stringValue && isHttpUrl(stringValue)) {
      if (mediaUrlKeys.has(normalizedKey) || (recordIsMedia && contextualMediaUrlKeys.has(normalizedKey))) {
        return stringValue;
      }
    }
  }

  for (const [key, item] of Object.entries(record)) {
    if (readRecord(item) || Array.isArray(item)) {
      const nestedMediaContext = recordIsMedia || mediaContainerKeys.has(normalizeKey(key));
      const found = findMediaUrl(item, nestedMediaContext, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function recordHasMediaSignature(record: JsonRecord) {
  const signature = normalizeSearch(collectMediaSignature(record, 0, 2).join(" "));

  return isAudioSignature(signature)
    || signature.includes("image")
    || signature.includes("video")
    || signature.includes("document")
    || signature.includes("media")
    || signature.includes("mime");
}

function collectMediaSignature(value: unknown, depth = 0, maxDepth = 4): string[] {
  if (!value || depth > maxDepth) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectMediaSignature(item, depth + 1, maxDepth));
  }

  const record = readRecord(value);
  if (!record) {
    return typeof value === "string" ? [value] : [];
  }

  const parts: string[] = [];

  for (const [key, item] of Object.entries(record)) {
    const normalizedKey = normalizeKey(key);

    if (
      normalizedKey.includes("type")
      || normalizedKey.includes("kind")
      || normalizedKey.includes("mime")
      || normalizedKey.includes("media")
      || mediaContainerKeys.has(normalizedKey)
    ) {
      parts.push(key);
    }

    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      parts.push(String(item));
    } else if (readRecord(item) || Array.isArray(item)) {
      parts.push(...collectMediaSignature(item, depth + 1, maxDepth));
    }
  }

  return parts;
}

function inferMediaKindFromMimeOrUrl(mimeType: string | null, url: string | null): WhatsappMessageMediaKind | null {
  const signature = normalizeSearch([mimeType, url].filter(Boolean).join(" "));

  if (isAudioSignature(signature)) return "audio";
  if (signature.includes("image") || /\.(jpe?g|png|webp|gif)(\?|#|$)/.test(signature)) return "image";
  if (signature.includes("video") || /\.(mp4|mov|webm|3gp)(\?|#|$)/.test(signature)) return "video";
  if (signature.includes("pdf") || signature.includes("document") || signature.includes("application/")) return "document";

  return null;
}

function isAudioSignature(signature: string) {
  return signature.includes("audio")
    || signature.includes("voice")
    || signature.includes("opus")
    || signature.includes("ptt")
    || signature.includes("ogg")
    || signature.includes("audiomessage")
    || signature.includes("audio message")
    || signature.includes("pttmessage")
    || signature.includes("ptt message")
    || /\.(aac|m4a|mp3|oga|ogg|opus|wav|webm)(\?|#|$)/.test(signature);
}

function findString(value: unknown, keys: string[], depth = 0): string | null {
  if (!value || depth > 5) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys, depth + 1);
      if (found) return found;
    }

    return null;
  }

  const record = readRecord(value);
  if (!record) return null;

  const keySet = new Set(keys.map((key) => key.toLowerCase()));

  for (const [key, item] of Object.entries(record)) {
    if (keySet.has(key.toLowerCase())) {
      const found = asString(item);
      if (found) return found;
    }
  }

  for (const item of Object.values(record)) {
    if (readRecord(item) || Array.isArray(item)) {
      const found = findString(item, keys, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function dedupeJsonRecords(values: JsonRecord[]) {
  const seen = new Set<string>();
  const deduped: JsonRecord[] = [];

  for (const value of values) {
    const key = JSON.stringify(value);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(value);
  }

  return deduped;
}

function asString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(value: string) {
  return normalizeSearch(value).replace(/[^a-z0-9]/g, "");
}
