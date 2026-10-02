import type { SupabaseClient } from "@supabase/supabase-js";
import type { CostCenterMonth } from "./cost-center-report";

// Daily cost center check. Alerts are platform events shown in Admin > Financeiro;
// nothing is sent to customers and no price is changed automatically.
export type CostCenterAlert = { key: string; kind: "margin" | "feature_margin" | "missing_rate" | "voice_quota" | "invoice_deviation"; title: string; summary: string };

const brl = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
// Below these amounts a ratio is noise, not a trend.
const MIN_CUSTOMER_COST_BRL = 5;
const MIN_FEATURE_COST_BRL = 2;

export function computeCostCenterAlerts(month: CostCenterMonth, voiceQuota?: { used: number; limit: number; share: number } | null, previous?: CostCenterMonth | null): CostCenterAlert[] {
  const alerts: CostCenterAlert[] = [];
  const target = month.targetMarkup;
  const { charged } = month;
  if (charged.customerCostBrl >= MIN_CUSTOMER_COST_BRL && charged.multiplier !== null && charged.multiplier < target) {
    alerts.push({ key: "margin", kind: "margin", title: `Multiplicador do mês abaixo da meta: ${charged.multiplier}x`,
      summary: `Clientes geraram ${brl(charged.customerChargedBrl)} em créditos para ${brl(charged.customerCostBrl)} de custo. Meta: ${target}x.` });
  }
  const weak = month.variable.byFeature.filter(item => item.costBrl >= MIN_FEATURE_COST_BRL && item.multiplier !== null && item.multiplier < target * 0.9);
  if (weak.length) {
    alerts.push({ key: `feature:${weak.map(item => item.key).sort().join(",")}`, kind: "feature_margin", title: `${weak.length} recurso(s) abaixo da meta`,
      summary: weak.map(item => `${item.label}: ${item.multiplier}x (custo ${brl(item.costBrl)})`).join("; ") });
  }
  if (month.missingRates.length) {
    alerts.push({ key: `missing:${month.missingRates.map(item => item.featureCode).sort().join(",")}`, kind: "missing_rate", title: "Uso sem tarifa cadastrada",
      summary: `Não cobrado, aguardando preço: ${month.missingRates.map(item => `${item.featureCode} × ${item.events}`).join(", ")}.` });
  }
  if (voiceQuota && voiceQuota.share >= 0.8) {
    alerts.push({ key: `voice:${voiceQuota.share >= 0.95 ? 95 : 80}`, kind: "voice_quota", title: `Franquia ElevenLabs em ${pct(voiceQuota.share)}`,
      summary: `${voiceQuota.used.toLocaleString("pt-BR")} de ${voiceQuota.limit.toLocaleString("pt-BR")} caracteres usados. Sem excedente habilitado, a voz para ao atingir 100%.` });
  }
  for (const row of previous?.reconciliation ?? []) {
    if (row.deviation !== null && Math.abs(row.deviation) > 0.15) {
      alerts.push({ key: `invoice:${previous!.month}:${row.provider}`, kind: "invoice_deviation", title: `Fatura ${row.label} de ${previous!.month} difere ${pct(row.deviation)} do estimado`,
        summary: `Estimado ${brl(row.estimatedBrl)}, fatura ${brl(row.invoicedBrl ?? 0)}. Revise as tarifas de custo desse fornecedor.` });
    }
  }
  return alerts;
}

/** One record per alert and day; reruns of the check do not duplicate it. */
export async function persistCostCenterAlerts(client: SupabaseClient, alerts: CostCenterAlert[], day: string) {
  let created = 0;
  for (const alert of alerts) {
    const sourceId = `${day}:${alert.key}`.slice(0, 300);
    const existing = await client.from("intelligence_events").select("id").eq("event_type", "cost_center.alert").eq("source_id", sourceId).maybeSingle();
    if (existing.error) throw new Error("Não foi possível conferir alertas do centro de custo.");
    if (existing.data) continue;
    const { error } = await client.from("intelligence_events").insert({
      scope: "platform", source_type: "cost_center", source_id: sourceId, event_type: "cost_center.alert",
      title: alert.title, summary: alert.summary, visibility: "platform", tags: ["cost_center", alert.kind], payload: { kind: alert.kind, key: alert.key, day },
    });
    if (error) throw new Error("Não foi possível registrar alerta do centro de custo.");
    created++;
  }
  return created;
}
