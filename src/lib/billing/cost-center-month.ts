import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCostCenterMonth, costCenterMonthRange, currentCostCenterMonth, type CostCenterMonth, type CostCenterMonthRaw } from "./cost-center-report";

export type CostCenterMonthResult = { ok: true; data: CostCenterMonth } | { ok: false; month: string; error: string };

/** Called only after the admin page authorization. Read-only aggregate. */
export async function getCostCenterMonth(client: SupabaseClient, requestedMonth?: string | null): Promise<CostCenterMonthResult> {
  const month = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : currentCostCenterMonth();
  const { from, to } = costCenterMonthRange(month);
  const { data, error } = await client.rpc("cost_center_month_report", { p_from: from, p_to: to });
  if (error || !data) {
    const missing = error?.code === "PGRST202" || /cost_center_month_report/.test(error?.message ?? "");
    return { ok: false, month, error: missing ? "A migration 0179 do centro de custo ainda não foi aplicada." : "Não foi possível calcular o mês." };
  }
  return { ok: true, data: buildCostCenterMonth(month, data as CostCenterMonthRaw) };
}
