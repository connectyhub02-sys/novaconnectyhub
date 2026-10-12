import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adsLeadsGraph, loadAdsLeadsContext, metaRecord, type AdsLeadsContext } from "./ads-leads-context";
import { analyticsAccounts, analyticsPeriod, selectAnalyticsAccount, insightMetrics, sumInsights, type AdsCampaignMetrics, type AdsMetrics } from "./ads-analytics-model";
import { pixelConfiguration } from "./pixel-conversions";

export type AnalyticsInput = { accountId?: string | null; days?: string | null; since?: string | null; until?: string | null };
export async function readInsights(ctx: AdsLeadsContext, params: Record<string, string>) {
  const rows: Record<string, unknown>[] = [];
  let after = "";
  for (let page = 0; page < 20; page++) {
    const body = await adsLeadsGraph(ctx, `${ctx.adAccountId}/insights`, { ...params, limit: "100", ...(after ? { after } : {}) }, false);
    if (!Array.isArray(body.data)) throw new Error("Resposta de métricas incompleta. Atualize a consulta.");
    rows.push(...body.data.map(metaRecord));
    const paging = metaRecord(body.paging);
    if (!paging.next) return rows;
    after = String(metaRecord(paging.cursors).after || "");
    if (!after) throw new Error("Paginação incompleta. Nenhum total parcial foi apresentado.");
  }
  throw new Error("O relatório excede 2.000 registros. Reduza o período.");
}

export async function getMetaAdsAnalytics(client: SupabaseClient, organizationId: string, input: AnalyticsInput = {}) {
  const ctx = await loadAdsLeadsContext(client, organizationId);
  const integration = await client.from("organization_integrations").select("metadata").eq("id", ctx.integrationId).eq("organization_id", organizationId).single();
  if (integration.error) throw new Error("Não foi possível consultar os ativos desta empresa.");
  const accounts = analyticsAccounts(metaRecord(integration.data.metadata), ctx.adAccountId);
  const accountId = selectAnalyticsAccount(accounts, ctx.adAccountId, input.accountId);
  const reportCtx = { ...ctx, adAccountId: accountId };
  if (!ctx.scopes.some(s => s === "ads_read" || s === "ads_management")) throw new Error("Reconecte a Meta com acesso de leitura de anúncios.");
  // Verify live access before loading account-specific reports. Metadata alone
  // must not be interpreted as a currently valid grant.
  const account = await adsLeadsGraph(reportCtx, accountId, { fields: "id,name,currency,timezone_name,account_status" }, false);
  if (account.id !== accountId) throw new Error("A Meta não confirmou a conta selecionada.");
  const timezone = typeof account.timezone_name === "string" ? account.timezone_name : "America/Sao_Paulo";
  const period = analyticsPeriod(input, timezone);
  const params = { time_range: JSON.stringify({ since: period.since, until: period.until }), use_unified_attribution_setting: "true", action_report_time: "conversion" };
  const fields = "spend,impressions,clicks,actions,action_values";
  const errors: string[] = [];
  const [campaignResult, dailyResult, pixelResult, crmResult] = await Promise.allSettled([
    readInsights(reportCtx, { ...params, level: "campaign", fields: `campaign_id,campaign_name,${fields}` }),
    readInsights(reportCtx, { ...params, level: "account", fields: `date_start,${fields}`, time_increment: "1" }),
    readPixelDiagnostics(client, organizationId, accountId, period),
    readLeadDiagnostics(client, organizationId, ctx.pageId, period),
  ]);
  const campaigns: AdsCampaignMetrics[] = campaignResult.status === "fulfilled" ? campaignResult.value.map(r => ({ id: String(r.campaign_id), name: String(r.campaign_name || r.campaign_id), ...insightMetrics(r) })).sort((a, b) => b.spend - a.spend) : [];
  const daily = dailyResult.status === "fulfilled" ? dailyResult.value.map(r => ({ date: String(r.date_start), ...insightMetrics(r) })).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const failure = (label: string, result: PromiseRejectedResult) => errors.push(`${label}: ${result.reason instanceof Error ? result.reason.message : "Consulta indisponível."}`);
  if (campaignResult.status === "rejected") failure("Campanhas", campaignResult);
  if (dailyResult.status === "rejected") failure("Evolução diária", dailyResult);
  if (pixelResult.status === "rejected") failure("Pixel", pixelResult);
  if (crmResult.status === "rejected") failure("CRM", crmResult);
  const totals: AdsMetrics | null = campaignResult.status === "fulfilled" ? sumInsights(campaigns) : null;
  return { organizationId, accounts, selectedAccountId: accountId, connectedAccountId: ctx.adAccountId, pageId: ctx.pageId,
    account: { id: accountId, name: String(account.name || accountId), currency: typeof account.currency === "string" && /^[A-Z]{3}$/.test(account.currency) ? account.currency : null, timezone, status: Number(account.account_status) },
    period, fetchedAt: new Date().toISOString(), status: campaignResult.status === "rejected" ? "error" as const : campaigns.length ? "ready" as const : "empty" as const,
    totals, campaigns, daily, dailyAvailable: dailyResult.status === "fulfilled", errors,
    pixel: pixelResult.status === "fulfilled" ? pixelResult.value : null, crm: crmResult.status === "fulfilled" ? crmResult.value : null,
    mcpAuthorized: ctx.scopes.includes("ads_mcp_management"),
  };
}
type Period = ReturnType<typeof analyticsPeriod>;
async function readPixelDiagnostics(client: SupabaseClient, org: string, account: string, period: Period) {
  const config = await pixelConfiguration(client, org);
  const matches = config?.ad_account_id === account;
  const base = { id: config?.pixel_id as string | undefined, name: config?.pixel_name as string | undefined,
    enabled: config?.enabled === true && matches, testMode: Boolean(config?.test_event_code), matches, configured: Boolean(config) };
  if (!config || !matches) return { ...base, counts: null, latest: [] };
  const query = () => client.from("meta_conversion_events").select("id", { count: "exact", head: true }).eq("organization_id", org)
    .eq("pixel_id", config.pixel_id).gte("created_at", period.start).lt("created_at", period.end);
  const [sent, test, failed, pending, cancelled, latest] = await Promise.all([
    query().eq("status", "sent").is("test_event_code", null), query().eq("status", "sent").not("test_event_code", "is", null),
    query().eq("status", "failed"), query().in("status", ["pending", "sending"]), query().eq("status", "cancelled"),
    client.from("meta_conversion_events").select("id,event_name,status,test_event_code,created_at,sent_at,error_message")
      .eq("organization_id", org).eq("pixel_id", config.pixel_id).gte("created_at", period.start).lt("created_at", period.end).order("created_at", { ascending: false }).limit(10),
  ]);
  if ([sent, test, failed, pending, cancelled, latest].some(r => r.error)) throw new Error("Falha ao consultar recibos CAPI.");
  return { ...base, counts: { sent: sent.count ?? 0, test: test.count ?? 0, failed: failed.count ?? 0, pending: pending.count ?? 0, cancelled: cancelled.count ?? 0 },
    latest: (latest.data ?? []).map(r => ({ id: String(r.id), name: String(r.event_name), status: String(r.status), test: Boolean(r.test_event_code), createdAt: String(r.created_at), sentAt: r.sent_at as string | null })) };
}
async function readLeadDiagnostics(client: SupabaseClient, org: string, page: string, period: Period) {
  const query = () => client.from("meta_lead_deliveries").select("id", { count: "exact", head: true })
    .eq("organization_id", org).eq("page_id", page).gte("created_at", period.start).lt("created_at", period.end);
  const [imported, failed, pending] = await Promise.all([query().eq("status", "imported").not("lead_id", "is", null), query().eq("status", "failed"), query().eq("status", "pending")]);
  if ([imported, failed, pending].some(r => r.error)) throw new Error("Falha ao consultar importações de leads.");
  return { imported: imported.count ?? 0, failed: failed.count ?? 0, pending: pending.count ?? 0 };
}
export type MetaAdsAnalytics = Awaited<ReturnType<typeof getMetaAdsAnalytics>>;
