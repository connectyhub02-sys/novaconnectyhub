import type { MetaAdsAnalytics } from "./ads-analytics";
import type { TrafficManagerPlan } from "@/lib/traffic/traffic-ai-manager";

// A contextual plan for the existing metered AI path. Never feed the legacy
// global credentials, cross-platform totals or CRM counts into paid CPL/ROAS.
export function analyticsPlan(report: MetaAdsAnalytics): TrafficManagerPlan {
  if (report.status !== "ready" || !report.totals) throw new Error("Ainda não há métricas suficientes para analisar com IA.");
  const t = report.totals;
  return {
    platform: "meta", generatedAt: report.fetchedAt, score: 0, status: "attention", statusLabel: "Análise de dados observados",
    summary: `Conta ${report.account.id}, ${report.period.since} a ${report.period.until}, ${report.account.timezone}. ${report.campaigns.length} campanhas com métricas. Não há nota de desempenho calculada.`,
    nextAction: "Avaliar os resultados sem executar alterações. Não sugerir escala de verba sem metas e evidências suficientes.",
    diagnostics: [
      { label: "Métricas Meta Insights", value: JSON.stringify(t), detail: `Moeda ${report.account.currency || "indisponível"}; atribuição dos conjuntos de anúncios; data da conversão. null significa indisponível.` },
      { label: "Leads CRM", value: JSON.stringify(report.crm), detail: "Importações da Página; podem incluir testes. Não são conversões atribuídas nem denominador de CPL." },
      { label: "Pixel/CAPI", value: JSON.stringify(report.pixel ? { enabled: report.pixel.enabled, testMode: report.pixel.testMode, matches: report.pixel.matches, counts: report.pixel.counts } : null), detail: "Recebimento de eventos não comprova atribuição nem deduplicação navegador/servidor." },
      { label: "Limitações da consulta", value: report.errors.join("; ") || "Nenhuma falha informada", detail: "Sem metas comerciais, comparação anterior ou teste causal. Não inventar benchmark." },
    ],
    budgetFocus: report.campaigns.slice(0, 20).map(c => ({ label: `${c.name} (${c.id})`, value: JSON.stringify({ spend: c.spend, clicks: c.clicks, leads: c.leads, purchases: c.purchases, roas: c.roas }) })),
    recommendations: [],
  };
}
