import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeSocialAutomations,
  type SocialFollowUp,
} from "./comment-automations";
import { normalizeAgentChannelConfig } from "../agents/multichannel";
import { metaSocialMessageReceivedEventName } from "./social-agent-policy";

export function socialFollowUpIsDue(input: {
  config: SocialFollowUp;
  channel: string;
  inboundAt: string;
  sentAt: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const inbound = Date.parse(input.inboundAt);
  const sent = Date.parse(input.sentAt);
  return (
    input.config.enabled &&
    ["instagram_direct", "facebook_messenger"].includes(input.channel) &&
    (input.config.platform === "both" ||
      input.channel.startsWith(input.config.platform)) &&
    Number.isFinite(inbound) &&
    Number.isFinite(sent) &&
    sent >= inbound &&
    inbound <= now &&
    now - inbound < 23 * 3600000 &&
    now - sent >= input.config.delayMinutes * 60000
  );
}

export async function assertSocialFollowUpCurrent(
  client: SupabaseClient,
  org: string,
  conversationId: string,
  metadata: Record<string, unknown>,
  config: unknown,
) {
  const expected = normalizeSocialAutomations({
    followUp: metadata.social_follow_up,
  }).followUp!;
  const current = normalizeSocialAutomations(config).followUp!;
  if (!current.enabled || JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error("Follow-up alterado ou desativado.");
  if (
    !socialFollowUpIsDue({
      config: current,
      channel: String(metadata.channel),
      inboundAt: String(metadata.occurredAt),
      sentAt: String(metadata.follow_up_source_sent_at),
    })
  )
    throw new Error("Follow-up fora da janela permitida.");
  const conversation = await client
    .from("conversations")
    .select("status")
    .eq("organization_id", org)
    .eq("id", conversationId)
    .maybeSingle();
  if (
    conversation.error ||
    !conversation.data ||
    ["closed", "resolved", "archived"].includes(conversation.data.status)
  )
    throw new Error("Conversa encerrada ou indisponível.");
  const [inbound, outbound] = await Promise.all(
    ["inbound", "outbound"].map((direction) =>
      client
        .from("conversation_messages")
        .select("id,text_content")
        .eq("organization_id", org)
        .eq("conversation_id", conversationId)
        .eq("direction", direction)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  const lastText = String(inbound.data?.text_content || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (
    /\b(parar|pare|sair|remover|descadastrar|cancelar inscricao|nao quero receber|nao me mande|nao enviar|stop|unsubscribe|nao tenho interesse|nao quero mais)\b/.test(
      lastText,
    )
  )
    throw new Error("Contato não deseja continuação.");
  if (
    inbound.error ||
    outbound.error ||
    inbound.data?.id !== metadata.messageId ||
    outbound.data?.id !== metadata.follow_up_source_outbound_id
  )
    throw new Error("A conversa mudou depois do agendamento do follow-up.");
}

export async function queueDueSocialFollowUps(client: SupabaseClient) {
  // Only real, successfully sent private replies can start a follow-up; never a comment alone.
  const sources = await client
    .from("agent_runs")
    .select("id,agent_id,organization_id,metadata")
    .eq("run_status", "completed")
    .eq("metadata->>meta_dispatch_status", "sent")
    .in("metadata->>channel", ["instagram_direct", "facebook_messenger"])
    .is("metadata->>social_follow_up", null)
    .gte("created_at", new Date(Date.now() - 24 * 3600000).toISOString())
    .order("created_at", { ascending: false })
    .limit(200);
  if (sources.error) throw new Error("Falha ao consultar follow-ups sociais.");
  let queued = 0;
  for (const source of sources.data ?? []) {
    if (!source.organization_id) continue;
    const agent = await client
      .from("agent_registry")
      .select("metadata,status")
      .eq("id", source.agent_id)
      .eq("organization_id", source.organization_id)
      .eq("scope", "organization")
      .maybeSingle();
    if (
      agent.error ||
      !agent.data ||
      ["paused", "archived"].includes(agent.data.status)
    )
      continue;
    const followUp = normalizeSocialAutomations(
      agent.data.metadata?.social_automations,
    ).followUp!;
    const meta = source.metadata ?? {};
    if (
      !socialFollowUpIsDue({
        config: followUp,
        channel: String(meta.channel),
        inboundAt: String(meta.occurredAt),
        sentAt: String(meta.meta_dispatched_at),
      })
    )
      continue;
    const channel =
      meta.channel === "instagram_direct"
        ? "instagram_direct"
        : "facebook_messenger";
    if (
      !normalizeAgentChannelConfig(agent.data.metadata?.multichannel_config)
        .channels[channel].enabled
    )
      continue;
    const hash = createHash("sha256")
      .update(`meta-follow-up:${source.id}`)
      .digest("hex")
      .slice(0, 32);
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
    const metadata = {
      channel,
      messageId: meta.messageId,
      conversationId: meta.conversationId,
      leadId: meta.leadId,
      occurredAt: meta.occurredAt,
      providerChatId: meta.providerChatId,
      externalAccountId: meta.externalAccountId,
      externalUserId: meta.externalUserId,
      organizationIntegrationId: meta.organizationIntegrationId,
      textContentPreview: meta.textContentPreview,
      social_follow_up: followUp,
      follow_up_source_run_id: source.id,
      follow_up_source_sent_at: meta.meta_dispatched_at,
      follow_up_source_outbound_id: meta.outbound_conversation_message_id,
    };
    try {
      await assertSocialFollowUpCurrent(
        client,
        source.organization_id,
        String(meta.conversationId),
        metadata,
        agent.data.metadata?.social_automations,
      );
    } catch {
      continue;
    }
    const inserted = await client
      .from("agent_runs")
      .insert({
        id,
        agent_id: source.agent_id,
        organization_id: source.organization_id,
        trigger_source: metaSocialMessageReceivedEventName,
        run_status: "queued",
        input_summary: "Retomada de conversa privada dentro da janela Meta.",
        metadata,
      });
    if (inserted.error && inserted.error.code !== "23505")
      throw new Error("Falha ao preparar follow-up social.");
    if (!inserted.error) queued++;
  }
  return { checked: sources.data?.length ?? 0, queued };
}
