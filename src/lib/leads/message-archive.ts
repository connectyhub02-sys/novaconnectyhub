import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { assertStorageUploadAllowed, recordOrganizationStorageUsage } from "@/lib/storage/quotas";
import { loadUazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";
import { buildUazapiDownloadBodies, extractMimeType, extractProviderDownloadUrl, resolveConversationMessageMedia, type ConversationMessageMediaInput } from "@/lib/whatsapp/message-media";

type Archive = { id: string; organization_id: string; lead_id: string; message_id: string; conversation_id: string | null; attempts: number; claimed_at: string; snapshot: ConversationMessageMediaInput & { whatsapp_instance_id?: string | null } };
const MAX_BYTES = 100 * 1024 * 1024;

export async function archiveLeadMediaBatch(client: SupabaseClient) {
  // Keep each backfill below the database API timeout; the next sweep resumes it.
  const backfill = await client.rpc("backfill_lead_message_archive", { p_limit: 10 });
  if (backfill.error) throw new Error("MESSAGE_ARCHIVE_BACKFILL_FAILED");
  const { data, error } = await client.rpc("claim_lead_media_archives", { p_limit: 10 });
  if (error) throw new Error("MESSAGE_ARCHIVE_QUEUE_FAILED");
  let saved = 0, deferred = 0;
  for (const job of (data ?? []) as Archive[]) {
    try {
      const status = await archiveOne(client, job);
      const result = await client.from("lead_message_archive").update({ media_status: status, claimed_at: null, last_error: null })
        .eq("id", job.id).eq("claimed_at", job.claimed_at);
      if (result.error) throw new Error("ARCHIVE_COMMIT_FAILED");
      saved++;
    } catch {
      // No raw provider body, URL or credential is written to operational errors.
      const result = await client.from("lead_message_archive").update({ media_status: "retry", claimed_at: null, last_error: "MEDIA_ARCHIVE_RETRY_REQUIRED",
        next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7)) * 1000).toISOString() }).eq("id", job.id).eq("claimed_at", job.claimed_at);
      if (result.error) throw new Error("ARCHIVE_RETRY_COMMIT_FAILED");
      deferred++;
    }
  }
  return { saved, deferred, backfilled: backfill.data };
}

async function archiveOne(client: SupabaseClient, job: Archive) {
  const media = resolveConversationMessageMedia(job.snapshot);
  if (media.kind === "unknown") return "not_media";
  const existing = await client.from("lead_files").select("id").eq("archive_id", job.id).maybeSingle();
  if (existing.error) throw new Error("ARCHIVE_LOOKUP_FAILED");
  if (existing.data) return "stored";
  // Only URLs returned by the authenticated provider download API are fetched.
  const { data: instance, error } = await client.from("whatsapp_instances").select("instance_token_encrypted")
    .eq("id", job.snapshot.whatsapp_instance_id).eq("organization_id", job.organization_id).maybeSingle();
  if (error || !instance?.instance_token_encrypted) throw new Error("ARCHIVE_INSTANCE_UNAVAILABLE");
  const token = decryptCredentialValue(instance.instance_token_encrypted);
  const credentials = await loadUazapiCredentials(client);
  let url: string | null = null, mime = media.mimeType ?? "application/octet-stream";
  for (const body of buildUazapiDownloadBodies(job.snapshot, job.snapshot.provider_chat_id, { transcribe: false })) {
    const response = await fetch(`${credentials.baseUrl.replace(/\/$/, "")}/message/download`, { method: "POST", headers: { "Content-Type": "application/json", token }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => null);
    if (response.ok) { url = extractProviderDownloadUrl(result); mime = extractMimeType(result) ?? mime; if (url) break; }
  }
  if (!url || new URL(url).protocol !== "https:") throw new Error("ARCHIVE_DOWNLOAD_UNAVAILABLE");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45000) });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("ARCHIVE_DOWNLOAD_FAILED");
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) throw new Error("ARCHIVE_FILE_LIMIT");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  await assertStorageUploadAllowed({ client, organizationId: job.organization_id, category: "lead_file", files: [{ fileName: media.fileName ?? "arquivo", contentType: mime, sizeBytes: size }] });
  const key = `${job.organization_id}/${job.lead_id}/${job.id}`;
  const upload = await client.storage.from("lead-archive").upload(key, Buffer.concat(chunks), { contentType: mime, upsert: true });
  if (upload.error) throw new Error("ARCHIVE_UPLOAD_FAILED");
  const { data: current } = await client.from("conversation_messages").select("id").eq("id", job.message_id).maybeSingle();
  const file = await client.from("lead_files").insert({ organization_id: job.organization_id, lead_id: job.lead_id, conversation_id: job.conversation_id,
    message_id: current?.id ?? null, archive_id: job.id, file_type: media.kind, mime_type: mime, original_name: media.fileName,
    object_key: key, public_url: `/api/dashboard/lead-archive/${job.id}/file`, byte_size: size, metadata: { storage_bucket: "lead-archive", archive_id: job.id, source_message_id: job.message_id } });
  if (file.error && file.error.code !== "23505") throw new Error("ARCHIVE_FILE_COMMIT_FAILED");
  if (!file.error) await recordOrganizationStorageUsage({ client, organizationId: job.organization_id, category: "lead_file", bytes: size, fileCount: 1, metadata: { archive_id: job.id, source: "lead_message_archive" } });
  return "stored";
}
