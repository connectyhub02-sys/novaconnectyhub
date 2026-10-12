import type { CreativeReport } from "./creative-policy";

export type CampaignSettings = { country: string; ageMin: number; ageMax: number; days: number; dailyBudget: number; currency: string; destination: string; placement: "facebook_feed" | "feeds"; category: "NONE" };
export type CampaignMedia = { id: string; url: string; contentType: string };
export type CampaignSnapshot = { name: string; accountId: string; accountName: string; pageId: string; instagramId: string; settings: CampaignSettings; budgetMode: "CBO" | "ABO"; totalMinor: number; dailyMinor: number; adSets: { name: string; dailyMinor: number }[]; ads: { name: string; headline: string; primaryText: string }[]; media: CampaignMedia; additionalMedia?: CampaignMedia[]; targeting: Record<string, unknown> };
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function campaignSettings(raw: unknown): CampaignSettings {
  const r = record(raw), country = String(r.country || "").toUpperCase();
  const ageMin = Number(r.ageMin), ageMax = Number(r.ageMax), days = Number(r.days), dailyBudget = Number(r.dailyBudget);
  if (!/^[A-Z]{2}$/.test(country) || !Number.isInteger(ageMin) || ageMin < 18 || !Number.isInteger(ageMax) || ageMax < ageMin || ageMax > 65) throw Error("Confira país e faixa etária (18 a 65+).");
  if (!Number.isInteger(days) || days < 1 || days > 90 || !Number.isFinite(dailyBudget) || dailyBudget <= 0 || dailyBudget > 100000 || Math.abs(dailyBudget * 100 - Math.round(dailyBudget * 100)) > .00001) throw Error("Informe verba diária com até duas casas e duração de 1 a 90 dias.");
  if (!["BRL", "USD", "EUR"].includes(String(r.currency))) throw Error("Moeda não suportada nesta versão.");
  let url: URL; try { url = new URL(String(r.destination)); } catch { throw Error("Informe o site de destino."); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || url.hostname === "localhost") throw Error("Use um endereço HTTPS público, sem credenciais.");
  if (r.category !== "NONE") throw Error("Campanhas de categorias especiais precisam ser configuradas no Gerenciador da Meta nesta versão.");
  if (!["facebook_feed", "feeds"].includes(String(r.placement))) throw Error("Selecione os posicionamentos.");
  return { country, ageMin, ageMax, days, dailyBudget, currency: String(r.currency), destination: url.href, placement: r.placement as CampaignSettings["placement"], category: "NONE" };
}
export function executionSnapshot(report: CreativeReport, settings: CampaignSettings, assets: Pick<CampaignSnapshot, "accountId" | "accountName" | "pageId" | "instagramId" | "media" | "additionalMedia">): CampaignSnapshot {
  const c = report.campaign;
  if (!c || !c.ads.length || c.ads.length > 10 || !c.adSets.length || c.adSets.length > c.ads.length) throw Error("A proposta precisa de pelo menos um anúncio por conjunto, até 10 anúncios.");
  if (!assets.pageId || !/^act_\d+$/.test(assets.accountId) || (settings.placement === "feeds" && !assets.instagramId)) throw Error("Conecte os ativos de publicação e anúncios desta empresa.");
  const media=[assets.media,...(assets.additionalMedia??[])];if(media.length>10 || (media.length>1&&media.some(m=>m.contentType!=="image/jpeg")))throw Error("Carrossel pago aceita de 2 a 10 imagens JPG.");
  const dailyMinor = Math.round(settings.dailyBudget * 100), share = Math.floor(dailyMinor / c.adSets.length);
  if (!share) throw Error("A verba é insuficiente para dividir entre os conjuntos.");
  return { ...assets, name: c.name, settings, budgetMode: c.budgetMode, dailyMinor, totalMinor: dailyMinor * settings.days,
    adSets: c.adSets.map((s, i) => ({ name: s.name, dailyMinor: share + (i === 0 ? dailyMinor % c.adSets.length : 0) })),
    ads: c.ads.map(a => ({ name: a.name, headline: a.headline, primaryText: a.primaryText })),
    targeting: { geo_locations: { countries: [settings.country] }, age_min: settings.ageMin, age_max: settings.ageMax,
      publisher_platforms: settings.placement === "feeds" ? ["facebook", "instagram"] : ["facebook"], facebook_positions: ["feed"],
      ...(settings.placement === "feeds" ? { instagram_positions: ["stream"] } : {}), targeting_automation: { advantage_audience: 0 } } };
}
export function campaignPayload(s: CampaignSnapshot) {
  return { name: s.name, objective: "OUTCOME_TRAFFIC", special_ad_categories: "[]", status: "PAUSED", spend_cap: String(s.totalMinor),
    ...(s.budgetMode === "CBO" ? { daily_budget: String(s.dailyMinor), bid_strategy: "LOWEST_COST_WITHOUT_CAP" } : { is_adset_budget_sharing_enabled: "false" }) };
}
export function adSetPayload(s: CampaignSnapshot, campaignId: string, index: number, start: string, end: string) {
  return { name: s.adSets[index].name, campaign_id: campaignId, status: "PAUSED", optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS", destination_type: "WEBSITE",
    targeting: JSON.stringify(s.targeting), start_time: start, end_time: end,
    ...(s.budgetMode === "ABO" ? { daily_budget: String(s.adSets[index].dailyMinor), bid_strategy: "LOWEST_COST_WITHOUT_CAP" } : {}) };
}
export function assertBudgetApproval(snapshot: CampaignSnapshot, expectedHash: string, raw: unknown) {
  const r = record(raw);
  if (r.approveSpend !== true || r.hash !== expectedHash || Number(r.totalMinor) !== snapshot.totalMinor || r.currency !== snapshot.settings.currency) throw Error("Revise novamente o criativo e aprove explicitamente a verba desta versão.");
}
