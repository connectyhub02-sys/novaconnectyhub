import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { callWhatsappProvider, resolveClientWhatsappOperationalContext } from "@/lib/whatsapp/channel-operations";
import { ensureDirectLeadConversation } from "@/lib/whatsapp/webhook-ingest";
import { showsPurchaseIntent } from "@/lib/whatsapp/group-rules";

type Row = Record<string, unknown>;
const inviteIntervalMs = 24 * 3600_000;

/**
 * Groups are for guidance: the order is closed in private. When a participant shows purchase intent the
 * agent calls them in private (once a day per person), mentioning their question so the private
 * conversation starts with context; from there the usual attendance and follow-up take over. People who
 * asked not to be contacted, and the agent's responsible humans, are never called.
 */
export async function inviteGroupParticipantToPrivate(client: SupabaseClient, input: {
  organizationId: string; agentId: string; whatsappInstanceId: string; senderJid: string; senderName: string | null;
  question: string; force?: boolean; now?: Date;
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
  const text = `Oi${firstName ? `, ${firstName}` : ""}! Aqui é a ${agentName} 😊 Vi sua mensagem no grupo${question ? ` ("${question}")` : ""} e te chamei aqui pra te ajudar com o pedido com calma. Qual produto te interessou?`;

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
