import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganizationSalesCatalogSettings } from "@/lib/client-os/sales-catalog";
import { normalizeBrazilianWhatsappPhone } from "@/lib/agents/responsible-human";
import type { WhatsappFollowUpEventData } from "@/lib/whatsapp/proactive-followup";

// A recorded offline visit can open an initial return conversation using the
// company's chosen WhatsApp. It never fabricates a previous customer message.
export async function offlineReturnContext(
  client: SupabaseClient,
  org: string,
  leadId: string,
  returnId: string,
): Promise<WhatsappFollowUpEventData | null> {
  const lead = await client
    .from("leads")
    .select("status,metadata,phone_number")
    .eq("organization_id", org)
    .eq("id", leadId)
    .single();
  if (lead.error) throw new Error(lead.error.message);
  if (
    lead.data.status === "archived" ||
    lead.data.metadata?.whatsapp_opt_out === true ||
    lead.data.metadata?.opt_out?.requested_at
  )
    return null;
  const phone = normalizeBrazilianWhatsappPhone(lead.data.phone_number);
  if (!phone) return null;
  const existing = await client
    .from("conversations")
    .select("id,status,whatsapp_instance_id")
    .eq("organization_id", org)
    .eq("lead_id", leadId)
    .eq("channel", "whatsapp")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data && ["closed", "archived"].includes(existing.data.status))
    return null;
  const settings = await getOrganizationSalesCatalogSettings(client, org),
    instanceId =
      existing.data ? existing.data.whatsapp_instance_id :
      settings?.automationSettings.defaultWhatsappInstanceId;
  if (!instanceId) return null;
  const instance = await client
    .from("whatsapp_instances")
    .select("id,status,metadata")
    .eq("organization_id", org)
    .eq("id", instanceId)
    .single();
  if (instance.error) throw new Error(instance.error.message);
  const agentId = instance.data.metadata?.agent_id;
  if (instance.data.status !== "connected" || typeof agentId !== "string")
    return null;
  let conversationId = existing.data?.id;
  if (!conversationId) {
    const created = await client
      .from("conversations")
      .insert({
        organization_id: org,
        lead_id: leadId,
        whatsapp_instance_id: instanceId,
        channel: "whatsapp",
        provider: "uazapi",
        provider_chat_id: `${phone}@s.whatsapp.net`,
        status: "open",
        metadata: {
          created_from: "recorded_visit_return",
          is_group_chat: false,
          chat_kind: "direct",
        },
      })
      .select("id")
      .single();
    if (created.error) {
      if (created.error.code === "23505") return null;
      throw new Error(created.error.message);
    }
    conversationId = created.data.id;
  }
  const messages = await client
    .from("conversation_messages")
    .select("id")
    .eq("organization_id", org)
    .eq("conversation_id", conversationId)
    .limit(1);
  if (messages.error) throw new Error(messages.error.message);
  if (messages.data?.length) return null;
  const previous = await client
    .from("agent_runs")
    .select("id")
    .eq("organization_id", org)
    .eq("agent_id", agentId)
    .eq("metadata->>returnId", returnId)
    .eq("trigger_source", "recorded_visit_return")
    .limit(1)
    .maybeSingle();
  if (previous.error) throw new Error(previous.error.message);
  let runId = previous.data?.id;
  if (!runId) {
    const run = await client
      .from("agent_runs")
      .insert({
        agent_id: agentId,
        organization_id: org,
        run_status: "completed",
        trigger_source: "recorded_visit_return",
        input_summary: "Preparação de convite após visita registrada",
        output_summary: "Retorno preparado para avaliação de envio",
        finished_at: new Date().toISOString(),
        metadata: { conversationId, leadId, returnId },
      })
      .select("id")
      .single();
    if (run.error) throw new Error(run.error.message);
    runId = run.data.id;
  }
  return {
    organizationId: org,
    leadId,
    agentId,
    agentRunId: runId!,
    conversationId: conversationId!,
    whatsappInstanceId: instanceId,
    returnId,
    initialReturn: true,
  };
}
