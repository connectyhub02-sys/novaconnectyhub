import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { updateLeadMetadata } from "@/lib/leads/metadata-update";
import { ensureDirectLeadConversation } from "@/lib/whatsapp/webhook-ingest";

type Row = Record<string, unknown>;
const record = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export type PollVoteResult =
  | { captured: true; leadId: string; queued: boolean }
  | { skipped: "not_a_vote" | "no_phone" | "vote_removed" | "poll_unknown" | "poll_not_from_agent" | "voter_is_agent" };

/**
 * A vote in a group poll posted by one of the company's agents: the vote goes into the voter's lead file
 * and the voter is queued to be called in private by the agent that posted the poll, citing the chosen option.
 * Both agents in the same group receive the vote; the queue keeps a single invite for the poll author.
 */
export async function capturePollVote(client: SupabaseClient, input: { organizationId: string; message: Row; now?: Date }): Promise<PollVoteResult> {
  const message = input.message;
  if (text(message.messageType) !== "PollUpdateMessage") return { skipped: "not_a_vote" };
  const groupJid = text(message.chatid);
  const voterJid = text(message.sender_pn);
  if (!groupJid?.endsWith("@g.us") || !voterJid?.endsWith("@s.whatsapp.net")) return { skipped: "no_phone" };
  const option = text(message.vote);
  if (!option) return { skipped: "vote_removed" };
  const pollId = text(message.quoted) ?? text(record(record(message.content)?.pollCreationMessageKey)?.ID);
  if (!pollId) return { skipped: "poll_unknown" };

  const { data: polls } = await client.from("conversation_messages").select("payload")
    .eq("organization_id", input.organizationId).eq("message_type", "PollCreationMessage").like("provider_message_id", `%${pollId}`).limit(1);
  const pollMessage = record(record(polls?.[0]?.payload)?.message);
  if (!pollMessage) return { skipped: "poll_unknown" };
  const authorPhone = (text(pollMessage.sender_pn) ?? text(pollMessage.sender) ?? "").split("@")[0].replace(/\D/g, "");
  const question = (text(record(record(pollMessage.content)?.pollCreationMessage)?.name) ?? text(pollMessage.text) ?? "").slice(0, 500);

  const { data: instances } = await client.from("whatsapp_instances").select("id, phone_number, metadata")
    .eq("organization_id", input.organizationId).neq("status", "archived");
  const phones = new Set((instances ?? []).map(row => String(row.phone_number ?? "").replace(/\D/g, "")).filter(Boolean));
  const author = (instances ?? []).find(row => String(row.phone_number ?? "").replace(/\D/g, "") === authorPhone);
  const agentId = text(record(author?.metadata)?.agent_id);
  if (!author || !agentId) return { skipped: "poll_not_from_agent" };
  const voterPhone = voterJid.split("@")[0].replace(/\D/g, "");
  if (phones.has(voterPhone)) return { skipped: "voter_is_agent" };

  const now = (input.now ?? new Date()).toISOString();
  const voterName = text(message.senderName);
  const groupName = text(message.groupName)?.slice(0, 200) ?? null;
  const { lead } = await ensureDirectLeadConversation(client, {
    organizationId: input.organizationId, whatsappInstanceId: author.id as string, phone: voterPhone, displayName: voterName,
    summary: `Votou "${option}" na enquete do grupo${groupName ? ` ${groupName}` : ""}.`,
  });
  // The latest vote wins when the person changes their mind; the invite is sent once per poll.
  const saved = await updateLeadMetadata({ client, organizationId: input.organizationId, leadId: lead.id as string,
    buildUpdate: metadata => {
      const votes = record(metadata.poll_votes) ?? {};
      const previous = record(votes[pollId]) ?? {};
      return { metadata: { ...metadata, poll_votes: { ...votes, [pollId]: { ...previous, question, option, group_jid: groupJid, group_name: groupName,
        whatsapp_instance_id: author.id, agent_id: agentId, voted_at: now } } } };
    } });
  const alreadyInvited = Boolean(record(record(saved.metadata.poll_votes)?.[pollId])?.invited_at);
  if (!alreadyInvited) {
    const values = { sender_name: voterName, poll_message_id: pollId, poll_question: question || null, poll_option: option.slice(0, 200), group_name: groupName, last_message_at: now };
    const { data: pending } = await client.from("whatsapp_group_invites").select("id").eq("whatsapp_instance_id", author.id)
      .eq("group_jid", groupJid).eq("sender_jid", voterJid).eq("status", "pending").maybeSingle();
    const write = pending
      ? await client.from("whatsapp_group_invites").update(values).eq("id", pending.id)
      : await client.from("whatsapp_group_invites").insert({ organization_id: input.organizationId, agent_id: agentId, whatsapp_instance_id: author.id,
        group_jid: groupJid, sender_jid: voterJid, purchase_intent: false, status: "pending", ...values });
    // The same vote arrives through every agent in the group: a concurrent insert of the same pending invite is expected.
    if (write.error && write.error.code !== "23505") throw new Error(`Não foi possível registrar o convite da enquete: ${write.error.message}`);
  }
  await client.from("intelligence_events").insert({ scope: "organization", organization_id: input.organizationId, source_type: "whatsapp", source_id: lead.id,
    event_type: "whatsapp.poll_vote", title: "Voto em enquete do grupo", summary: `${voterName ?? voterPhone} votou "${option}"${groupName ? ` em ${groupName}` : ""}.`,
    confidence: 1, visibility: "organization", tags: ["whatsapp", "group", "poll_vote"],
    payload: { lead_id: lead.id, poll_message_id: pollId, question, option, group_jid: groupJid, agent_id: agentId } }).then(() => undefined, () => undefined);
  return { captured: true, leadId: lead.id as string, queued: !alreadyInvited };
}
