import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadUazapiCredentials, type UazapiCredentials } from "./uazapi-credentials";

type Row = Record<string, unknown>;
const minute = 60_000;
/** The provider may still be finishing a slow send; only then a missing message counts as not delivered. */
const settleMs = 3 * minute;
const lookbackMs = 6 * 60 * minute;
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The agent run that produced a reply, from its tracking id (agent_text_<run>_1:delivery:<id>). */
export function agentRunIdFromTrack(trackId: unknown) {
  if (typeof trackId !== "string" || !trackId.startsWith("agent_")) return null;
  return trackId.split(":delivery:")[0].match(uuidPattern)?.[0] ?? null;
}

/**
 * Sends the provider answered with an error or a timeout are "uncertain": they may have gone out.
 * Each one is looked up at the provider by its tracking id. Found: it is confirmed as sent and nothing is
 * repeated. Missing after a few minutes: it is marked as not delivered, its operation becomes
 * resendable, and an agent reply goes back to the queue once, reusing the text already written.
 */
export async function reconcileUncertainDeliveries(client: SupabaseClient, now = new Date(), limit = 40) {
  const { data: rows, error } = await client.from("whatsapp_outbound_deliveries")
    .select("id,whatsapp_instance_id,status,payload,updated_at")
    .eq("status", "uncertain").gte("updated_at", new Date(now.getTime() - lookbackMs).toISOString())
    .lte("updated_at", new Date(now.getTime() - minute).toISOString()).order("updated_at").limit(limit);
  if (error) throw new Error(error.message);
  if (!rows?.length) return { checked: 0, sent: 0, failed: 0, requeued: 0 };
  const credentials = await loadUazapiCredentials(client);
  const tokens = new Map<string, string | null>();
  let sent = 0, failed = 0, requeued = 0;
  for (const row of rows as Row[]) {
    const instanceId = row.whatsapp_instance_id as string;
    if (!tokens.has(instanceId)) tokens.set(instanceId, await instanceToken(client, instanceId));
    const token = tokens.get(instanceId);
    const trackId = (row.payload as Row | null)?.track_id;
    if (!token || typeof trackId !== "string") continue;
    const found = await findByTrack(credentials, token, trackId).catch(() => undefined);
    if (found === undefined) continue; // Provider unavailable: try again on the next run.
    if (found) {
      await client.from("whatsapp_outbound_deliveries").update({ status: "sent", provider_message_id: found, updated_at: now.toISOString() })
        .eq("id", row.id).eq("status", "uncertain");
      await settleOperations(client, row.id as string, now);
      sent += 1;
      continue;
    }
    if (Date.parse(row.updated_at as string) > now.getTime() - settleMs) continue;
    await client.from("whatsapp_outbound_deliveries").update({ status: "failed", updated_at: now.toISOString() }).eq("id", row.id).eq("status", "uncertain");
    await settleOperations(client, row.id as string, now);
    failed += 1;
    if (await requeueAgentRun(client, agentRunIdFromTrack(trackId), now)) requeued += 1;
  }
  return { checked: rows.length, sent, failed, requeued };
}

async function instanceToken(client: SupabaseClient, instanceId: string) {
  const { data } = await client.from("whatsapp_instances").select("instance_token_encrypted,status").eq("id", instanceId).maybeSingle();
  if (!data?.instance_token_encrypted || data.status !== "connected") return null;
  try { return decryptCredentialValue(data.instance_token_encrypted); } catch { return null; }
}

/** Provider message id when the tracked message exists, "" when it does not, undefined when the provider did not answer. */
async function findByTrack(credentials: UazapiCredentials, token: string, trackId: string): Promise<string | undefined> {
  const response = await fetch(`${credentials.baseUrl}/message/find`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", token },
    body: JSON.stringify({ track_id: trackId, limit: 1 }), signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return undefined;
  const data = await response.json().catch(() => null) as { messages?: Row[] } | null;
  if (!data || !Array.isArray(data.messages)) return undefined;
  const message = data.messages[0];
  if (!message) return "";
  return [message.messageid, message.id].find((value): value is string => typeof value === "string" && value.length > 0) ?? "found";
}

/** An operation is sent when all its parts are; resendable when none is uncertain and one did not go out. */
async function settleOperations(client: SupabaseClient, deliveryId: string, now: Date) {
  const { data: operations } = await client.from("whatsapp_outbound_operations").select("id,delivery_ids,status")
    .contains("delivery_ids", [deliveryId]).in("status", ["uncertain", "sending"]).limit(5);
  for (const operation of (operations ?? []) as Row[]) {
    const ids = operation.delivery_ids as string[];
    const { data: parts } = await client.from("whatsapp_outbound_deliveries").select("id,status,provider_message_id").in("id", ids);
    const statuses = (parts ?? []).map(part => part.status as string);
    if (statuses.length !== ids.length || statuses.some(status => status === "uncertain" || status === "sending")) continue;
    const allSent = statuses.every(status => status === "sent" || status === "queued");
    const first = (parts ?? []).find(part => part.id === ids[0]);
    await client.from("whatsapp_outbound_operations").update(allSent
      ? { status: "sent", response_status: 200, response: { success: true, ...(first?.provider_message_id ? { id: first.provider_message_id, messageid: first.provider_message_id } : {}) }, updated_at: now.toISOString() }
      : { status: "failed", updated_at: now.toISOString() }).eq("id", operation.id).in("status", ["uncertain", "sending"]);
  }
}

/** Once, and only while it is still the reply the lead is waiting for: the run is processed again from its saved text. */
async function requeueAgentRun(client: SupabaseClient, runId: string | null, now: Date) {
  if (!runId) return false;
  const { data: run } = await client.from("agent_runs").select("id,run_status,created_at,metadata").eq("id", runId).maybeSingle();
  const metadata = (run?.metadata ?? {}) as Row;
  if (!run || run.run_status !== "failed" || metadata.delivery_reconciliation_requeued_at
    || Date.parse(run.created_at as string) < now.getTime() - 50 * minute) return false;
  const { error } = await client.from("agent_runs").update({ run_status: "queued", started_at: null, finished_at: null, error_message: null,
    metadata: { ...metadata, delivery_reconciliation_requeued_at: now.toISOString() } }).eq("id", runId).eq("run_status", "failed");
  return !error;
}
