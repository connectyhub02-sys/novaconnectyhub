type JsonRecord = Record<string, unknown>;

export type MetaWebhookEvent = {
  assetId: string | null;
  eventType: string;
  sourceEventId: string | null;
  payload: JsonRecord;
};

export function extractMetaWebhookEvents(payload: JsonRecord): MetaWebhookEvent[] {
  const object = readString(payload.object) ?? "meta";
  const entries = readArray(payload.entry);
  const events: MetaWebhookEvent[] = [];

  for (const entryValue of entries) {
    const entry = readRecord(entryValue);
    if (!entry) continue;

    const entryId = readString(entry.id);
    const entryTime = readString(entry.time) ?? String(readNumber(entry.time) ?? Date.now());

    for (const changeValue of readArray(entry.changes)) {
      const change = readRecord(changeValue);
      if (!change) continue;

      const field = readString(change.field) ?? "change";
      const value = readRecord(change.value) ?? {};
      const from = readRecord(value.from);
      const assetId = readString(value.page_id)
        ?? readString(value.recipient_id)
        ?? entryId
        ?? readString(value.owner_id)
        ?? readString(value.media_owner_id)
        ?? readString(from?.id);
      const sourceEventId = [
        entryId,
        entryTime,
        field,
        readString(value.comment_id),
        readString(value.message_id),
        readString(value.post_id),
        readString(value.media_id),
        readString(value.leadgen_id),
      ].filter(Boolean).join(":") || null;

      events.push({
        assetId,
        eventType: `meta.${object}.${field}`,
        sourceEventId,
        payload: {
          object,
          entry,
          change,
        },
      });
    }

    for (const messageValue of readArray(entry.messaging)) {
      const message = readRecord(messageValue);
      if (!message) continue;

      const recipient = readRecord(message.recipient);
      const sender = readRecord(message.sender);
      const body = readRecord(message.message) ?? readRecord(message.postback) ?? {};
      const mid = readString(body.mid) ?? readString(body.message_id);
      const recipientId = readString(recipient?.id) ?? entryId;

      events.push({
        assetId: recipientId,
        eventType: `meta.${object}.messaging`,
        sourceEventId: [recipientId, readString(sender?.id), readString(message.timestamp) ?? String(readNumber(message.timestamp) ?? ""), mid].filter(Boolean).join(":") || null,
        payload: {
          object,
          entry,
          messaging: message,
        },
      });
    }
  }

  return events;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
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

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
