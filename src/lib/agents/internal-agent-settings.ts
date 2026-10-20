import {
  agentResponsibleHumanMetadataKey,
  agentResponsibleHumansMetadataKey,
  emptyAgentResponsibleHuman,
  mergeResponsibleHumansIntoBehaviorConfig,
  normalizeAgentResponsibleHumans,
  readAgentResponsibleHumans,
  serializeAgentResponsibleHuman,
  serializeAgentResponsibleHumans,
} from "./responsible-human";
import { normalizeWhatsappBehaviorSettings } from "../whatsapp/agent-behavior";

/** Keep the saved recipient list authoritative, including after stale editor saves. */
export function internalAgentBehavior(metadata: Record<string, unknown>, behavior: unknown) {
  const normalized = normalizeWhatsappBehaviorSettings(behavior);
  if (!Array.isArray(metadata[agentResponsibleHumansMetadataKey])) return normalized;
  const responsibles = readAgentResponsibleHumans(metadata);
  return {
    ...mergeResponsibleHumansIntoBehaviorConfig(normalized, responsibles),
    humanHandoffNotifications: responsibles.length > 0 && normalized.humanHandoffNotifications,
  };
}

export function internalAgentResponsiblePatch(value: unknown, behavior: unknown) {
  if (value === undefined) return {};
  const responsibles = normalizeAgentResponsibleHumans(value, { requireAtLeastOne: true, requireName: true });
  return {
    [agentResponsibleHumanMetadataKey]: serializeAgentResponsibleHuman(responsibles[0] ?? emptyAgentResponsibleHuman()),
    [agentResponsibleHumansMetadataKey]: serializeAgentResponsibleHumans(responsibles),
    whatsapp_behavior_config: mergeResponsibleHumansIntoBehaviorConfig(normalizeWhatsappBehaviorSettings(behavior), responsibles),
  };
}
