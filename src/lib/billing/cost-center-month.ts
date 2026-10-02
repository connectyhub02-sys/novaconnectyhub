import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCostCenterMonth, costCenterMonthRange, currentCostCenterMonth, type CostCenterMonth, type CostCenterMonthRaw } from "./cost-center-report";
import { AGENT_COST_OPTIMIZATIONS_KEY, parseAgentCostOptimizations, type AgentCostOptimizations } from "./cost-optimizations";
import { computeCostCenterAlerts, persistCostCenterAlerts } from "./cost-center-alerts";
import { readElevenLabsQuota, type ElevenLabsQuota } from "@/lib/elevenlabs/subscription";

export type CostCenterMonthResult = { ok: true; data: CostCenterMonth & { voiceQuota?: ElevenLabsQuota | null } } | { ok: false; month: string; error: string };

/** Called only after the admin page authorization. Read-only aggregate. */
export async function getCostCenterMonth(client: SupabaseClient, requestedMonth?: string | null): Promise<CostCenterMonthResult> {
  const month = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : currentCostCenterMonth();
  const { from, to } = costCenterMonthRange(month);
  const { data, error } = await client.rpc("cost_center_month_report", { p_from: from, p_to: to });
  if (error || !data) {
    const missing = error?.code === "PGRST202" || /cost_center_month_report/.test(error?.message ?? "");
    return { ok: false, month, error: missing ? "A migration 0179 do centro de custo ainda não foi aplicada." : "Não foi possível calcular o mês." };
  }
  const trial = await client.from("billing_plans").select("included_credits").eq("plan_code", "trial").maybeSingle<{ included_credits: number | string | null }>();
  const trialCredits = trial.error ? null : Number(trial.data?.included_credits ?? 0) || null;
  // The provider only reports the current billing period, so the live quota belongs to the current month.
  const voiceQuota = month === currentCostCenterMonth() ? await readElevenLabsQuota(client) : null;
  return { ok: true, data: { ...buildCostCenterMonth(month, data as CostCenterMonthRaw), trialCredits, voiceQuota } };
}

export type AgentOptimizationAdmin = {
  settings: AgentCostOptimizations;
  agents: Array<{ id: string; name: string; organization: string; status: string }>;
};

/** Admin-only: current switches and the agents that can join a pilot. */
export async function getAgentOptimizationAdmin(client: SupabaseClient): Promise<AgentOptimizationAdmin> {
  const [setting, agents] = await Promise.all([
    client.from("cost_center_settings").select("value").eq("setting_key", AGENT_COST_OPTIMIZATIONS_KEY).maybeSingle<{ value: unknown }>(),
    client.from("agent_registry").select("id,name,status,organizations(name)").neq("status", "archived").order("name").limit(300),
  ]);
  return {
    settings: parseAgentCostOptimizations(setting.data?.value),
    agents: (agents.data ?? []).map(agent => {
      const org = (agent as { organizations?: { name?: string } | Array<{ name?: string }> | null }).organizations;
      const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
      return { id: String(agent.id), name: String(agent.name ?? "Agente"), organization: orgName ?? "Plataforma ConnectyHub", status: String(agent.status ?? "") };
    }),
  };
}

function previousMonth(month: string) {
  const [year, index] = month.split("-").map(Number);
  return index === 1 ? `${year - 1}-12` : `${year}-${String(index - 1).padStart(2, "0")}`;
}

/** Daily check (Inngest): records alerts for the admin; never changes prices or wallets. */
export async function runCostCenterDailyCheck(client: SupabaseClient, now = new Date()) {
  const month = currentCostCenterMonth(now);
  const [current, previous] = await Promise.all([getCostCenterMonth(client, month), getCostCenterMonth(client, previousMonth(month))]);
  if (!current.ok) return { status: "skipped", reason: current.error };
  const alerts = computeCostCenterAlerts(current.data, current.data.voiceQuota, previous.ok ? previous.data : null);
  const created = await persistCostCenterAlerts(client, alerts, now.toISOString().slice(0, 10));
  return { status: "checked", month, alerts: alerts.length, created };
}
