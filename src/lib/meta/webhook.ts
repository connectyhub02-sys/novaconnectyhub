import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

type OrganizationIntegrationRow = {
  id: string;
  organization_id: string;
  metadata: JsonRecord | null;
};

export type MetaWebhookEvent = {
  assetId: string | null;
  eventType: string;
  sourceEventId: string | null;
  payload: JsonRecord;
};

export type MetaWebhookIngestResult = {
  received: number;
  stored: number;
  unmapped: number;
};

export function verifyMetaWebhookSignature(input: {
  appSecret: string;
  rawBody: string;
  signature: string | null;
}) {
  if (!input.signature?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", input.appSecret).update(input.rawBody).digest("hex")}`;
  const received = input.signature.trim();

  if (Buffer.byteLength(received) !== Buffer.byteLength(expected)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export async function ingestMetaWebhook(input: {
  payload: unknown;
  headers: Headers;
  client?: SupabaseClient;
}): Promise<MetaWebhookIngestResult> {
  const payload = readRecord(input.payload) ?? {};
  const events = extractMetaWebhookEvents(payload);
  const assetIds = Array.from(new Set(events.map((event) => event.assetId).filter((id): id is string => Boolean(id))));
  const client = input.client ?? createServiceClient();
  const integrations = assetIds.length ? await loadMetaIntegrations(client) : [];
  const headers = sanitizeHeaders(input.headers);
  const receivedAt = new Date().toISOString();
  let stored = 0;
  let unmapped = 0;

  for (const event of events) {
    const integration = event.assetId ? findIntegrationByAssetId(integrations, event.assetId) : null;

    if (!integration) {
      unmapped += 1;
      continue;
    }

    const { error } = await client.from("integration_events").insert({
      organization_id: integration.organization_id,
      organization_integration_id: integration.id,
      provider_id: "meta-ads",
      direction: "inbound",
      event_type: event.eventType,
      status: "received",
      source_event_id: event.sourceEventId,
      payload: event.payload,
      headers,
      received_at: receivedAt,
    });

    if (error) {
      throw new Error(`Nao foi possivel registrar webhook Meta: ${error.message}`);
    }

    stored += 1;
  }

  return {
    received: events.length,
    stored,
    unmapped,
  };
}

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
        ?? readString(from?.id)
        ?? readString(value.recipient_id)
        ?? entryId;
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

async function loadMetaIntegrations(client: SupabaseClient) {
  const { data, error } = await client
    .from("organization_integrations")
    .select("id, organization_id, metadata")
    .eq("provider_id", "meta-ads")
    .in("status", ["connected", "pending", "available", "error"]);

  if (error) {
    throw new Error(`Nao foi possivel carregar integracoes Meta: ${error.message}`);
  }

  return (data ?? []) as OrganizationIntegrationRow[];
}

function findIntegrationByAssetId(rows: OrganizationIntegrationRow[], assetId: string) {
  return rows.find((row) => readIntegrationAssetIds(row.metadata).has(assetId)) ?? null;
}

function readIntegrationAssetIds(metadata: JsonRecord | null) {
  const ids = new Set<string>();

  for (const key of [
    "facebook_page_id",
    "selected_facebook_page_id",
    "instagram_business_id",
    "selected_instagram_business_id",
    "ad_account_id",
    "selected_ad_account_id",
  ]) {
    const value = readString(metadata?.[key]);
    if (value) ids.add(value);
  }

  for (const page of readArray(metadata?.facebook_pages)) {
    const record = readRecord(page);
    const id = readString(record?.id);
    if (id) ids.add(id);
  }

  for (const instagram of readArray(metadata?.instagram_accounts)) {
    const record = readRecord(instagram);
    const id = readString(record?.id);
    const parentId = readString(record?.parentId ?? record?.parent_id);
    if (id) ids.add(id);
    if (parentId) ids.add(parentId);
  }

  return ids;
}

function sanitizeHeaders(headers: Headers) {
  const safe: JsonRecord = {};

  for (const [key, value] of headers.entries()) {
    if (/authorization|cookie|token|secret|signature/i.test(key)) {
      safe[key] = "[redacted]";
    } else {
      safe[key] = value.slice(0, 500);
    }
  }

  return safe;
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
