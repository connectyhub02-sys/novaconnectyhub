import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAgentPromptBuilderConfig, promptBuilderMetadataKey } from "@/lib/whatsapp/agent-prompt-templates";
import { activityDefaultDestination } from "@/lib/whatsapp/activity-profile";

export async function loadCatalogActivityDefaults(client: SupabaseClient, companyId: string, agentId?: string | null) {
  let query = client.from("agent_registry").select("id,metadata").eq("organization_id", companyId);
  if (agentId) query = query.eq("id", agentId);
  const result = await query.limit(100);
  if (result.error) throw new Error("Não foi possível consultar a atividade do catálogo.");
  const agents = (result.data ?? []).filter(agent => agent.metadata?.controls_all_whatsapp_agents !== true
    && agent.metadata?.[promptBuilderMetadataKey]);
  if (agents.length !== 1) return { destination: "connectyhub_checkout" as const, activity: null };
  const config = normalizeAgentPromptBuilderConfig(agents[0].metadata?.[promptBuilderMetadataKey]);
  return { destination: activityDefaultDestination(config.templateId), activity: config.templateId };
}
