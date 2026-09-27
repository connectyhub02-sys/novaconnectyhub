import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { callWhatsappProvider, resolveClientWhatsappOperationalContext } from "@/lib/whatsapp/channel-operations";
import { ensureDirectLeadConversation } from "@/lib/whatsapp/webhook-ingest";
import { showsPurchaseIntent } from "@/lib/whatsapp/group-rules";

type Row = Record<string, unknown>;
const inviteIntervalMs = 24 * 3600_000;

const quietMinutesWithoutRoom = 45;
const invitesPerRun = 5;

/** During the conversation: remember who talked to the agent in the group and their latest question. */
export async function noteGroupParticipant(client: SupabaseClient, input: {
  organizationId: string; agentId: string; whatsappInstanceId: string; groupJid: string; senderJid: string; senderName: string | null; question: string; now?: Date;
}) {
  const now = (input.now ?? new Date()).toISOString();
  const intent = showsPurchaseIntent(input.question);
  const { data: pending } = await client.from("whatsapp_group_invites").select("id, purchase_intent").eq("whatsapp_instance_id", input.whatsappInstanceId)
    .eq("group_jid", input.groupJid).eq("sender_jid", input.senderJid).eq("status", "pending").maybeSingle();
  const values = { question: input.question.slice(0, 500), last_message_at: now, ...(input.senderName ? { sender_name: input.senderName } : {}) };
  if (pending) {
    await client.from("whatsapp_group_invites").update({ ...values, purchase_intent: pending.purchase_intent === true || intent }).eq("id", pending.id);
    return;
  }
  await client.from("whatsapp_group_invites").insert({ organization_id: input.organizationId, agent_id: input.agentId, whatsapp_instance_id: input.whatsappInstanceId,
    group_jid: input.groupJid, sender_jid: input.senderJid, purchase_intent: intent, status: "pending", ...values });
}

/**
 * Every 5 minutes: once the group's question room has closed (or 45 minutes after the person's last
 * message when the group has no room), call in private the people the agent talked to, a few at a time.
 */
export async function sendPendingGroupInvites(client: SupabaseClient, now = new Date()) {
  const { data } = await client.from("whatsapp_group_invites").select("*").eq("status", "pending")
    .lt("last_message_at", new Date(now.getTime() - 2 * 60_000).toISOString()).order("last_message_at", { ascending: true }).limit(100);
  const invites = (data ?? []) as Array<Row & { id: string; organization_id: string; agent_id: string; whatsapp_instance_id: string; group_jid: string; sender_jid: string; sender_name: string | null; question: string | null; purchase_intent: boolean; last_message_at: string }>;
  const perInstance = new Map<string, number>();
  const results = [];
  for (const invite of invites) {
    const { data: target } = await client.from("whatsapp_channel_targets").select("reply_mode").eq("whatsapp_instance_id", invite.whatsapp_instance_id).eq("provider_jid", invite.group_jid).maybeSingle();
    const roomOpen = target?.reply_mode === "all";
    const quiet = now.getTime() - new Date(invite.last_message_at).getTime() >= quietMinutesWithoutRoom * 60_000;
    // A room that is still open keeps its people until it closes; without a room, 45 minutes of quiet.
    if (roomOpen && !quiet) continue;
    if ((perInstance.get(invite.whatsapp_instance_id) ?? 0) >= invitesPerRun) continue;
    perInstance.set(invite.whatsapp_instance_id, (perInstance.get(invite.whatsapp_instance_id) ?? 0) + 1);
    const result = await inviteGroupParticipantToPrivate(client, {
      organizationId: invite.organization_id, agentId: invite.agent_id, whatsappInstanceId: invite.whatsapp_instance_id, senderJid: invite.sender_jid,
      senderName: invite.sender_name, question: invite.question ?? "", force: true, purchaseIntent: invite.purchase_intent, now,
    }).catch((error: unknown) => ({ skipped: error instanceof Error ? error.message.slice(0, 200) : "falha" }));
    const sent = "invited" in result;
    await client.from("whatsapp_group_invites").update({ status: sent ? "sent" : "skipped", sent_at: sent ? now.toISOString() : null, result: sent ? "invited" : String(result.skipped) }).eq("id", invite.id);
    results.push({ id: invite.id, ...result });
  }
  return results;
}

/**
 * The private follow-up of a group conversation: mentions the person's question so the private chat starts
 * with context; from there the usual attendance and follow-up take over. Once a day per person; people who
 * asked not to be contacted, and the agent's responsible humans, are never called.
 */
export async function inviteGroupParticipantToPrivate(client: SupabaseClient, input: {
  organizationId: string; agentId: string; whatsappInstanceId: string; senderJid: string; senderName: string | null;
  question: string; force?: boolean; purchaseIntent?: boolean; now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!input.force && !showsPurchaseIntent(input.question)) return { skipped: "no_intent" as const };
  const phone = input.senderJid.split("@")[0].replace(/\D/g, "");
  if (phone.length < 10) return { skipped: "invalid_phone" as const };
  const { data: agent } = await client.from("agent_registry").select("name, persona_name, metadata").eq("id", input.agentId).maybeSingle();
  if (JSON.stringify(agent?.metadata ?? {}).includes(phone.slice(-8))) return { skipped: "responsible" as const };
  const { data: existing } = await client.from("leads").select("id, metadata").eq("organization_id", input.organizationId).eq("phone_number", phone).maybeSingle();
  const metadata = (existing?.metadata ?? {}) as Row;
  if (metadata.whatsapp_opt_out === true || (metadata.opt_out as Row | undefined)?.requested_at) return { skipped: "opt_out" as const };
  const last = typeof metadata.group_private_invite_at === "string" ? new Date(metadata.group_private_invite_at).getTime() : 0;
  if (now.getTime() - last < inviteIntervalMs) return { skipped: "recent" as const };

  const agentName = (agent?.persona_name as string | null)?.trim() || (agent?.name as string | null) || "atendimento";
  const firstName = input.senderName?.trim().split(/\s+/)[0] ?? null;
  const question = input.question.replace(/\s+/g, " ").trim().slice(0, 90);
  const greeting = `Oi${firstName ? `, ${firstName}` : ""}! Aqui é a ${agentName} 😊`;
  const text = (input.purchaseIntent ?? showsPurchaseIntent(input.question))
    ? `${greeting} Obrigada por participar do grupo! Vi seu interesse${question ? ` ("${question}")` : ""} e te chamei aqui pra te ajudar com o pedido com calma. Qual produto você quer levar?`
    : `${greeting} Obrigada por participar do grupo! Sobre a sua dúvida${question ? ` ("${question}")` : ""}, ficou alguma coisa em que eu possa te ajudar por aqui?`;

  const { lead, conversation } = await ensureDirectLeadConversation(client, {
    organizationId: input.organizationId, whatsappInstanceId: input.whatsappInstanceId, phone, displayName: input.senderName, summary: text,
  });
  const context = await resolveClientWhatsappOperationalContext(client, input.organizationId, input.agentId);
  const response = await callWhatsappProvider(context, "/send/text", {
    number: phone, text, delay: 3000, linkPreview: false, track_source: "connectyhub", track_id: `group_private_invite_${lead.id}_${now.getTime()}`,
  });
  const providerMessageId = response && typeof response === "object"
    ? (typeof (response as Row).messageid === "string" ? (response as Row).messageid as string : typeof (response as Row).id === "string" ? (response as Row).id as string : null) : null;
  await client.from("conversation_messages").insert({
    organization_id: input.organizationId, conversation_id: conversation.id, lead_id: lead.id, whatsapp_instance_id: input.whatsappInstanceId,
    provider: "uazapi", provider_message_id: providerMessageId, provider_chat_id: `${phone}@s.whatsapp.net`, direction: "outbound", message_type: "text",
    text_content: text, occurred_at: now.toISOString(),
    payload: { delivery_source: "group_private_invite", author_type: "agent", author_source: "group_private_invite", group_question: input.question.slice(0, 500) },
  });
  await client.from("leads").update({ metadata: { ...((lead.metadata as Row | null) ?? metadata), group_private_invite_at: now.toISOString() } }).eq("id", lead.id);
  return { invited: true as const, leadId: lead.id, conversationId: conversation.id };
}
