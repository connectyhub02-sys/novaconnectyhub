import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { isHumanInterventionActive } from "./human-intervention";
import { loadUazapiCredentials, type UazapiCredentials } from "./uazapi-credentials";

type JsonRecord = Record<string, unknown>;

export type ConversationStage = "new_lead" | "awaiting_payment" | "paid" | "human";

/** WhatsApp Business labels the system keeps on each conversation; the lead never sees them. */
export const stageLabels: ReadonlyArray<{ stage: ConversationStage; name: string; color: number }> = [
  { stage: "new_lead", name: "Novo lead", color: 1 },
  { stage: "awaiting_payment", name: "Aguardando pagamento", color: 4 },
  { stage: "paid", name: "Pago", color: 9 },
  { stage: "human", name: "Atendimento humano", color: 11 },
];

const activityWindowMs = 15 * 60 * 1000;

type StageOrder = { status: string | null; payment_status: string | null; latest_payment_session_id: string | null };

/** The CRM stage of a direct conversation: a human in charge wins, then the latest order's payment. */
export function resolveConversationStage(input: { conversationMetadata: unknown; latestOrder: StageOrder | null; now?: number }): ConversationStage {
  if (isHumanInterventionActive(input.conversationMetadata, input.now)) return "human";
  const order = input.latestOrder;
  if (order && (order.payment_status === "confirmed" || order.status === "paid")) return "paid";
  if (order && order.status !== "cancelled" && order.latest_payment_session_id
    && ["pending", "failed", null].includes(order.payment_status)) return "awaiting_payment";
  return "new_lead";
}

/** Label changes needed on one chat, given the ids currently on it ("owner:labelid" or "labelid"). */
export function planStageLabelChange(current: string[], desiredId: string, stageIds: string[]) {
  const onChat = new Set(current.map(value => value.split(":").at(-1) ?? value));
  return {
    remove: stageIds.filter(id => id !== desiredId && onChat.has(id)),
    add: onChat.has(desiredId) ? null : desiredId,
  };
}

/**
 * Keeps the stage label of recently active direct conversations in sync. Runs from a cron,
 * never inside the attendance, so a provider failure cannot delay or break a reply.
 * Numbers that are not WhatsApp Business (labels cannot be created) are skipped.
 */
export async function syncWhatsappStageLabels(client: SupabaseClient, now = Date.now()) {
  const since = new Date(now - activityWindowMs).toISOString();
  const [active, paidOrPending] = await Promise.all([
    client.from("conversations").select("id, whatsapp_instance_id, provider_chat_id, metadata")
      .eq("provider", "uazapi").gte("last_message_at", since).limit(200),
    client.from("sales_catalog_orders").select("conversation_id").gte("updated_at", since).not("conversation_id", "is", null).limit(200),
  ]);
  if (active.error || paidOrPending.error) throw new Error("Nao foi possivel carregar conversas para etiquetas.");
  const extraIds = [...new Set((paidOrPending.data ?? []).map(row => row.conversation_id as string))]
    .filter(id => !(active.data ?? []).some(row => row.id === id));
  const extra = extraIds.length
    ? await client.from("conversations").select("id, whatsapp_instance_id, provider_chat_id, metadata").in("id", extraIds)
    : { data: [], error: null };
  const conversations = [...(active.data ?? []), ...(extra.data ?? [])].filter(row => {
    const metadata = (row.metadata ?? {}) as JsonRecord;
    return metadata.is_group_chat !== true && typeof row.provider_chat_id === "string" && row.provider_chat_id.endsWith("@s.whatsapp.net");
  });
  if (!conversations.length) return { instances: 0, labeled: 0, skipped: 0 };

  const instanceIds = [...new Set(conversations.map(row => row.whatsapp_instance_id as string))];
  const { data: instances } = await client.from("whatsapp_instances").select("id, status, instance_token_encrypted, metadata")
    .in("id", instanceIds).eq("status", "connected");
  const credentials = await loadUazapiCredentials(client);
  let labeled = 0;
  let skipped = 0;

  for (const instance of instances ?? []) {
    if (((instance.metadata ?? {}) as JsonRecord).admin_whatsapp === true || !instance.instance_token_encrypted) continue;
    let token: string;
    try { token = decryptCredentialValue(instance.instance_token_encrypted); } catch { continue; }
    const labelIds = await ensureStageLabelIds(credentials, token).catch(() => null);
    if (!labelIds) { skipped += 1; continue; }
    const stageIds = Object.values(labelIds);
    for (const conversation of conversations.filter(row => row.whatsapp_instance_id === instance.id)) {
      const { data: order } = await client.from("sales_catalog_orders").select("status, payment_status, latest_payment_session_id")
        .eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(1).maybeSingle<StageOrder>();
      const stage = resolveConversationStage({ conversationMetadata: conversation.metadata, latestOrder: order ?? null, now });
      const phone = (conversation.provider_chat_id as string).split("@")[0];
      const changed = await applyStageLabel(credentials, token, phone, labelIds[stage], stageIds).catch(() => false);
      if (changed) labeled += 1;
    }
  }
  return { instances: (instances ?? []).length, labeled, skipped };
}

async function ensureStageLabelIds(credentials: UazapiCredentials, token: string) {
  const byName = async () => {
    const labels = await uazapi<Array<{ name?: string; labelid?: string }>>(credentials, token, "GET", "/labels");
    return new Map((labels ?? []).filter(label => label.name && label.labelid).map(label => [label.name!.trim().toLowerCase(), label.labelid!]));
  };
  let known = await byName();
  const missing = stageLabels.filter(label => !known.has(label.name.toLowerCase()));
  if (missing.length) {
    for (const label of missing) {
      await uazapi(credentials, token, "POST", "/label/edit", { labelid: "new", name: label.name, color: label.color, delete: false });
    }
    known = await byName();
  }
  const ids = Object.fromEntries(stageLabels.map(label => [label.stage, known.get(label.name.toLowerCase())])) as Record<ConversationStage, string | undefined>;
  return Object.values(ids).every(Boolean) ? ids as Record<ConversationStage, string> : null;
}

async function applyStageLabel(credentials: UazapiCredentials, token: string, phone: string, desiredId: string, stageIds: string[]) {
  const details = await uazapi<JsonRecord>(credentials, token, "POST", "/chat/details", { number: phone });
  const current = Array.isArray(details?.wa_label) ? (details.wa_label as unknown[]).filter((value): value is string => typeof value === "string") : [];
  const plan = planStageLabelChange(current, desiredId, stageIds);
  for (const id of plan.remove) await uazapi(credentials, token, "POST", "/chat/labels", { number: phone, remove_labelid: id });
  if (plan.add) await uazapi(credentials, token, "POST", "/chat/labels", { number: phone, add_labelid: plan.add });
  return plan.remove.length > 0 || Boolean(plan.add);
}

async function uazapi<T = unknown>(credentials: UazapiCredentials, token: string, method: "GET" | "POST", path: string, body?: JsonRecord): Promise<T | null> {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", token },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Uazapi ${path} respondeu ${response.status}.`);
  return await response.json().catch(() => null) as T | null;
}
