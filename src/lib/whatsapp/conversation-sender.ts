import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type SenderInput = {
  organizationId: string;
  leadId?: string | null;
  conversationId?: string | null;
  agentId?: string | null;
  defaultWhatsappInstanceId?: string | null;
};

/** Existing customer conversations own their sender. Defaults only start new contacts. */
export async function resolveConversationSender(
  client: SupabaseClient,
  input: SenderInput,
) {
  let conversation: {
    id: string;
    whatsapp_instance_id: string | null;
    provider_chat_id: string | null;
  } | null = null;
  if (input.conversationId || input.leadId) {
    let query = client
      .from("conversations")
      .select("id,whatsapp_instance_id,provider_chat_id")
      .eq("organization_id", input.organizationId)
      .eq("channel", "whatsapp");
    if (input.leadId) query = query.eq("lead_id", input.leadId);
    if (input.conversationId) query = query.eq("id", input.conversationId);
    else
      query = query.order("last_message_at", {
        ascending: false,
        nullsFirst: false,
      });
    const result = await query.limit(1).maybeSingle();
    if (result.error)
      throw new Error("Não foi possível verificar a origem do atendimento.");
    conversation = result.data;
    if (input.conversationId && !conversation) return null;
  }
  let instanceId = conversation
    ? conversation.whatsapp_instance_id
    : input.defaultWhatsappInstanceId;
  // A manual booking may establish the first contact through its explicitly assigned agent.
  if (!conversation && !instanceId && input.agentId) {
    const initial = await client
      .from("whatsapp_instances")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("metadata->>agent_id", input.agentId)
      .eq("status", "connected")
      .order("id")
      .limit(1)
      .maybeSingle();
    if (initial.error)
      throw new Error("Não foi possível verificar o WhatsApp do agente.");
    instanceId = initial.data?.id;
  }
  if (!instanceId) return null;
  let agentId = input.agentId;
  if (conversation && !agentId) {
    const run = await client
      .from("agent_runs")
      .select("agent_id")
      .eq("organization_id", input.organizationId)
      .eq("metadata->>conversationId", conversation.id)
      .eq("run_status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (run.error)
      throw new Error("Não foi possível verificar o agente do atendimento.");
    agentId = run.data?.agent_id;
    if (!agentId) return null;
  }
  const instance = await client
    .from("whatsapp_instances")
    .select("id,status,metadata")
    .eq("organization_id", input.organizationId)
    .eq("id", instanceId)
    .maybeSingle();
  if (instance.error)
    throw new Error("Não foi possível verificar o WhatsApp do atendimento.");
  const assignedAgent = instance.data?.metadata?.agent_id;
  if (
    instance.data?.status !== "connected" ||
    typeof assignedAgent !== "string" ||
    (agentId && assignedAgent !== agentId)
  )
    return null;
  return {
    conversation,
    whatsappInstanceId: instanceId,
    agentId: agentId ?? assignedAgent,
  };
}
