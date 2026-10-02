import type { SupabaseClient } from "@supabase/supabase-js";

// Admin switches for cost optimizations that could change agent behavior.
// "pilot" applies only to the listed agents so quality can be compared first.
export type OptimizationScope = "off" | "pilot" | "all";
export type AgentCostOptimizations = { cacheFriendlyPrompt: OptimizationScope; pilotAgentIds: string[] };

export const AGENT_COST_OPTIMIZATIONS_KEY = "agent_cost_optimizations";
const defaults: AgentCostOptimizations = { cacheFriendlyPrompt: "off", pilotAgentIds: [] };
const cacheMs = 60_000;
let cached: { at: number; value: AgentCostOptimizations } | null = null;

export function parseAgentCostOptimizations(value: unknown): AgentCostOptimizations {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const scope = record.cacheFriendlyPrompt;
  const ids = Array.isArray(record.pilotAgentIds) ? record.pilotAgentIds : [];
  return {
    cacheFriendlyPrompt: scope === "pilot" || scope === "all" ? scope : "off",
    pilotAgentIds: ids.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200),
  };
}

export function appliesToAgent(scope: OptimizationScope, settings: AgentCostOptimizations, agentId: string | null | undefined) {
  return scope === "all" || (scope === "pilot" && Boolean(agentId) && settings.pilotAgentIds.includes(agentId!));
}

/** Never fails the attendance: unreadable settings mean "off". */
export async function loadAgentCostOptimizations(client: SupabaseClient, now = Date.now()): Promise<AgentCostOptimizations> {
  if (cached && now - cached.at < cacheMs) return cached.value;
  try {
    const { data, error } = await client.from("cost_center_settings").select("value").eq("setting_key", AGENT_COST_OPTIMIZATIONS_KEY).maybeSingle<{ value: unknown }>();
    const value = error ? defaults : parseAgentCostOptimizations(data?.value);
    cached = { at: now, value };
    return value;
  } catch {
    return defaults;
  }
}

export function resetAgentCostOptimizationsCache() {
  cached = null;
}
