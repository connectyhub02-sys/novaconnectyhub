import type { SalesCatalogCommerceAgentSettings } from "@/lib/sales-catalog/shared";
import { normalizeWhatsappBehaviorSettings } from "@/lib/whatsapp/agent-behavior";
import { normalizeAgentPromptBuilderConfig, promptBuilderMetadataKey } from "@/lib/whatsapp/agent-prompt-templates";
import { activityDefaultDestination } from "@/lib/whatsapp/activity-profile";
import { resolveLeadPersonalName } from "@/lib/whatsapp/lead-names";

type AgentIdentity = { agent_code?: string | null; metadata: Record<string, unknown> | null };

export function resolveStoreLeadName(lead: { display_name: string | null; metadata: Record<string, unknown> | null } | null, agentName: string) {
  if (!lead) return null;
  const name = resolveLeadPersonalName({ displayName: lead.display_name, metadata: lead.metadata });
  if (!name) return null;
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (normalize(name) !== normalize(agentName)) return name;
  const evidence = lead.metadata?.lead_name_evidence as { source?: string; name?: string } | undefined;
  // A matching name is valid when the visitor actually supplied it.
  return evidence?.source === "lead_message" && typeof evidence.name === "string" && normalize(evidence.name) === normalize(name) ? name : null;
}

export function isPublicStoreAgent(agent: AgentIdentity) {
  return agent.agent_code !== "agente-whatsapp-global" && agent.metadata?.controls_all_whatsapp_agents !== true;
}

export function resolveAgentStoreSettings(agent: AgentIdentity, legacy: SalesCatalogCommerceAgentSettings): SalesCatalogCommerceAgentSettings {
  const behavior = normalizeWhatsappBehaviorSettings(agent.metadata?.whatsapp_behavior_config);
  const activity = normalizeAgentPromptBuilderConfig(agent.metadata?.[promptBuilderMetadataKey]).templateId;
  const verticalPlaybook = activity === "imobiliaria" || activity === "corretor_imoveis" ? "real_estate"
    : activity === "pizzaria_delivery" || activity === "restaurante_lanchonete" ? "food"
    : activity === "moda_varejo" ? "fashion"
    : activity === "esteticista" || activity === "estetica_clinica" ? "beauty"
    : activityDefaultDestination(activity) === "appointment" ? "services" : "generic";
  return {
    ...legacy,
    enabled: isPublicStoreAgent(agent) && behavior.agentEnabled && (behavior.storefrontEnabled ?? legacy.enabled),
    mode: behavior.storefrontMode ?? legacy.mode,
    surfaces: ["store", "product", "cart", "checkout"],
    verticalPlaybook,
  };
}
