import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWhatsappBehaviorSettings } from "@/lib/whatsapp/agent-behavior";
import {
  resolveMetaSocialQueueDecision,
  type MetaSocialChannel,
} from "./social-agent-policy";

// Re-read mutable user controls immediately before an autonomous send.
export async function assertMetaAutomaticSendAllowed(input: {
  client: SupabaseClient;
  organizationId: string;
  agentId: string;
  conversationId: string | null;
  channel: MetaSocialChannel;
}) {
  const { client, organizationId, agentId, conversationId, channel } = input;
  const agent = await client
    .from("agent_registry")
    .select("status,metadata,requires_human_approval")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .eq("scope", "organization")
    .maybeSingle();
  if (
    agent.error ||
    !agent.data ||
    ["paused", "archived"].includes(agent.data.status) ||
    !normalizeWhatsappBehaviorSettings(
      agent.data.metadata?.whatsapp_behavior_config,
    ).agentEnabled
  )
    throw new Error(
      "Envio automático bloqueado: agente indisponível ou pausado.",
    );
  const decision = resolveMetaSocialQueueDecision({
    channel,
    config: agent.data.metadata?.multichannel_config,
    agentRequiresHumanApproval: agent.data.requires_human_approval !== false,
  });
  if (!decision.shouldQueue || decision.requiresHumanApproval)
    throw new Error(
      "Configuração alterada: esta resposta precisa de revisão humana.",
    );
  const conversation = await client
    .from("conversations")
    .select("lead_id,metadata,channel")
    .eq("id", conversationId ?? "")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (
    conversation.error ||
    !conversation.data ||
    conversation.data.channel !== channel
  )
    throw new Error("Conversa inválida para envio automático.");
  if (
    Date.parse(
      conversation.data.metadata?.human_intervention?.paused_until ?? "",
    ) > Date.now()
  )
    throw new Error("Atendimento pausado para intervenção humana.");
  if (conversation.data.lead_id) {
    const lead = await client
      .from("leads")
      .select("metadata")
      .eq("id", conversation.data.lead_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (lead.error || !lead.data)
      throw new Error("Contato indisponível para envio automático.");
    if (
      lead.data.metadata?.whatsapp_opt_out === true ||
      lead.data.metadata?.opt_out?.requested_at
    )
      throw new Error("Contato com opt-out: envio automático bloqueado.");
  }
  return decision.channelConfig;
}
