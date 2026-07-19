export type MetaDispatchAuditEntry = {
  at: string;
  type: string;
  actorId?: string;
  httpStatus?: number;
  message?: string;
  providerMessageId?: string;
  status?: string;
  targetKind?: string;
};

type JsonRecord = Record<string, unknown>;

const maxAuditEntries = 12;

export function appendMetaDispatchAudit(
  metadata: JsonRecord,
  entry: Omit<MetaDispatchAuditEntry, "at"> & { at?: string | null },
): JsonRecord {
  const current = readMetaDispatchAudit(metadata.meta_dispatch_audit);
  const nextEntry = normalizeAuditEntry(entry);

  return {
    ...metadata,
    meta_dispatch_audit: [...current, nextEntry].slice(-maxAuditEntries),
  };
}

export function readMetaDispatchAudit(value: unknown): MetaDispatchAuditEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = readRecord(item);
      const type = readString(record?.type);

      if (!record || !type) {
        return null;
      }

      const at = readString(record.at) ?? new Date(0).toISOString();
      const httpStatus = readNumber(record.httpStatus ?? record.http_status);

      return {
        at,
        type,
        ...(readString(record.actorId ?? record.actor_id) ? { actorId: readString(record.actorId ?? record.actor_id)! } : {}),
        ...(httpStatus ? { httpStatus } : {}),
        ...(readString(record.message) ? { message: readString(record.message)! } : {}),
        ...(readString(record.providerMessageId ?? record.provider_message_id) ? { providerMessageId: readString(record.providerMessageId ?? record.provider_message_id)! } : {}),
        ...(readString(record.status) ? { status: readString(record.status)! } : {}),
        ...(readString(record.targetKind ?? record.target_kind) ? { targetKind: readString(record.targetKind ?? record.target_kind)! } : {}),
      };
    })
    .filter((item): item is MetaDispatchAuditEntry => Boolean(item));
}

function normalizeAuditEntry(entry: Omit<MetaDispatchAuditEntry, "at"> & { at?: string | null }): MetaDispatchAuditEntry {
  return {
    at: readString(entry.at) ?? new Date().toISOString(),
    type: entry.type,
    ...(entry.actorId ? { actorId: entry.actorId } : {}),
    ...(entry.httpStatus ? { httpStatus: entry.httpStatus } : {}),
    ...(entry.message ? { message: entry.message } : {}),
    ...(entry.providerMessageId ? { providerMessageId: entry.providerMessageId } : {}),
    ...(entry.status ? { status: entry.status } : {}),
    ...(entry.targetKind ? { targetKind: entry.targetKind } : {}),
  };
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
