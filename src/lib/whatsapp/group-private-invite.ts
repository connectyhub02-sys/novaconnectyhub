import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { callWhatsappProvider, isOperationalAgentEnabled, resolveClientWhatsappOperationalContext } from "@/lib/whatsapp/channel-operations";
import { updateLeadMetadata } from "@/lib/leads/metadata-update";
import { ensureDirectLeadConversation } from "@/lib/whatsapp/webhook-ingest";
import { showsPurchaseIntent } from "@/lib/whatsapp/group-rules";

type Row = Record<string, unknown>;
const inviteIntervalMs = 24 * 3600_000;

const quietMinutesWithoutRoom = 45;
// Poll voters are called once the voting cools down: one hour after the person's last vote.
const quietMinutesAfterPollVote = 60;
const invitesPerRun = 5;
// Private calls only in business hours (Brasília); outside them the invite waits in the queue.
const inviteHours = { from: 8, to: 21 };

function withinInviteHours(now: Date) {
  const hour = Number(now.toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }));
  return hour >= inviteHours.from && hour < inviteHours.to;
}

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
  if (!withinInviteHours(now)) return [];
  const { data } = await client.from("whatsapp_group_invites").select("*").eq("status", "pending")
    .lt("last_message_at", new Date(now.getTime() - 2 * 60_000).toISOString()).order("last_message_at", { ascending: true }).limit(100);
  const invites = (data ?? []) as Array<Row & { id: string; organization_id: string; agent_id: string; whatsapp_instance_id: string; group_jid: string; sender_jid: string; sender_name: string | null; question: string | null; purchase_intent: boolean; last_message_at: string;
    poll_message_id: string | null; poll_question: string | null; poll_option: string | null; group_name: string | null }>;
  const perInstance = new Map<string, number>();
  const results = [];
  for (const invite of invites) {
    const { data: target } = await client.from("whatsapp_channel_targets").select("reply_mode").eq("whatsapp_instance_id", invite.whatsapp_instance_id).eq("provider_jid", invite.group_jid).maybeSingle();
    const roomOpen = target?.reply_mode === "all";
    const sinceLast = now.getTime() - new Date(invite.last_message_at).getTime();
    const quiet = sinceLast >= quietMinutesWithoutRoom * 60_000;
    // A poll voter waits for the voting to cool down; a room that is still open keeps its people until it closes;
    // without a room, 45 minutes of quiet.
    if (invite.poll_option ? sinceLast < quietMinutesAfterPollVote * 60_000 : roomOpen && !quiet) continue;
    if ((perInstance.get(invite.whatsapp_instance_id) ?? 0) >= invitesPerRun) continue;
    perInstance.set(invite.whatsapp_instance_id, (perInstance.get(invite.whatsapp_instance_id) ?? 0) + 1);
    const result = await inviteGroupParticipantToPrivate(client, {
      organizationId: invite.organization_id, agentId: invite.agent_id, whatsappInstanceId: invite.whatsapp_instance_id, senderJid: invite.sender_jid,
      senderName: invite.sender_name, question: invite.question ?? "", force: true, purchaseIntent: invite.purchase_intent, now,
      poll: invite.poll_option ? { messageId: invite.poll_message_id, question: invite.poll_question, option: invite.poll_option, groupName: invite.group_name } : null,
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
  poll?: { messageId: string | null; question: string | null; option: string; groupName: string | null } | null;
}) {
  const now = input.now ?? new Date();
  if (!input.force && !showsPurchaseIntent(input.question)) return { skipped: "no_intent" as const };
  const phone = input.senderJid.split("@")[0].replace(/\D/g, "");
  if (phone.length < 10) return { skipped: "invalid_phone" as const };
  // Other agents of the company (same group) are never "invited".
  const { data: ownNumbers } = await client.from("whatsapp_instances").select("id").eq("organization_id", input.organizationId).eq("phone_number", phone).limit(1);
  if (ownNumbers?.length) return { skipped: "company_number" as const };
  const { data: agent } = await client.from("agent_registry").select("name, persona_name, metadata").eq("id", input.agentId).maybeSingle();
  if (JSON.stringify(agent?.metadata ?? {}).includes(phone.slice(-8))) return { skipped: "responsible" as const };
  const { data: existing } = await client.from("leads").select("id, metadata").eq("organization_id", input.organizationId).eq("phone_number", phone).maybeSingle();
  const metadata = (existing?.metadata ?? {}) as Row;
  if (metadata.whatsapp_opt_out === true || (metadata.opt_out as Row | undefined)?.requested_at) return { skipped: "opt_out" as const };
  const last = typeof metadata.group_private_invite_at === "string" ? new Date(metadata.group_private_invite_at).getTime() : 0;
  if (now.getTime() - last < inviteIntervalMs) return { skipped: "recent" as const };
  if (input.poll?.messageId && ((metadata.poll_votes as Row | undefined)?.[input.poll.messageId] as Row | undefined)?.invited_at) return { skipped: "already_invited" as const };
  // Someone already talking to the agent in private is not greeted again: the vote stays in the lead file.
  if (existing?.id) {
    const { data: recent } = await client.from("conversation_messages").select("id").eq("organization_id", input.organizationId).eq("lead_id", existing.id)
      .eq("direction", "inbound").eq("provider_chat_id", `${phone}@s.whatsapp.net`).gte("occurred_at", new Date(now.getTime() - inviteIntervalMs).toISOString()).limit(1);
    if (recent?.length) return { skipped: "already_talking" as const };
  }
  const context = await resolveClientWhatsappOperationalContext(client, input.organizationId, input.agentId);
  if (!isOperationalAgentEnabled(context)) return { skipped: "agent_disabled" as const };

  const agentName = (agent?.persona_name as string | null)?.trim() || (agent?.name as string | null) || "o atendimento";
  const typedName = input.senderName?.trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "") || null;
  // Profile names typed in lowercase ("marcio") are greeted with a capital letter.
  const firstName = typedName ? typedName.charAt(0).toLocaleUpperCase("pt-BR") + typedName.slice(1) : null;
  const question = input.question.replace(/\s+/g, " ").trim().slice(0, 90);
  const greeting = `Oi${firstName ? `, ${firstName}` : ""}! Aqui é ${agentName} 😊`;
  const text = input.poll
    ? `${greeting} Vi que você votou em *${input.poll.option}* na enquete${input.poll.groupName ? ` do grupo ${input.poll.groupName}` : " do grupo"}. Quer que eu te mostre o que temos para isso?`
    : (input.purchaseIntent ?? showsPurchaseIntent(input.question))
      ? `${greeting} Valeu por participar do grupo! Vi seu interesse${question ? ` ("${question}")` : ""} e te chamei aqui para te ajudar com o pedido com calma. Qual produto você quer levar?`
      : `${greeting} Valeu por participar do grupo! Sobre a sua dúvida${question ? ` ("${question}")` : ""}, ficou alguma coisa em que eu possa te ajudar por aqui?`;

  const { lead, conversation } = await ensureDirectLeadConversation(client, {
    organizationId: input.organizationId, whatsappInstanceId: input.whatsappInstanceId, phone, displayName: input.senderName, summary: text,
  });
  const response = await callWhatsappProvider(context, "/send/text", {
    number: phone, text, delay: 3000, linkPreview: false, track_source: "connectyhub", track_id: `group_private_invite_${lead.id}_${now.getTime()}`,
  });
  const providerMessageId = response && typeof response === "object"
    ? (typeof (response as Row).messageid === "string" ? (response as Row).messageid as string : typeof (response as Row).id === "string" ? (response as Row).id as string : null) : null;
  await client.from("conversation_messages").insert({
    organization_id: input.organizationId, conversation_id: conversation.id, lead_id: lead.id, whatsapp_instance_id: input.whatsappInstanceId,
    provider: "uazapi", provider_message_id: providerMessageId, provider_chat_id: `${phone}@s.whatsapp.net`, direction: "outbound", message_type: "text",
    text_content: text, occurred_at: now.toISOString(),
    payload: { delivery_source: "group_private_invite", author_type: "agent", author_source: "group_private_invite", group_question: input.question.slice(0, 500),
      ...(input.poll ? { poll_vote: { poll_message_id: input.poll.messageId, question: input.poll.question, option: input.poll.option } } : {}) },
  });
  await updateLeadMetadata({ client, organizationId: input.organizationId, leadId: lead.id as string, buildUpdate: current => {
    const votes = (current.poll_votes as Row | undefined) ?? {};
    const pollId = input.poll?.messageId;
    return { metadata: { ...current, group_private_invite_at: now.toISOString(),
      ...(pollId ? { poll_votes: { ...votes, [pollId]: { ...((votes[pollId] as Row | undefined) ?? {}), invited_at: now.toISOString() } } } : {}) } };
  } });
  return { invited: true as const, leadId: lead.id, conversationId: conversation.id };
}
