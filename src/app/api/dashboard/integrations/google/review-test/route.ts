import { NextResponse } from "next/server";
import { assertBillableAccess, formatBillingAccessError, statusForBillingAccessError } from "@/lib/billing/trial";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { getClientTrafficOverview, type TrafficProviderSummary } from "@/lib/traffic/admin-traffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleReviewSeverity = "required" | "recommended";

type GoogleReviewTestResult = {
  id: string;
  label: string;
  ok: boolean;
  permission: string;
  permissions?: string[];
  status: number | null;
  detail: string;
  endpoint: string;
  surface?: string;
  severity?: GoogleReviewSeverity;
  action?: string;
};

export async function POST() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const organizationId = workspace.organization?.id;

  if (!organizationId) {
    return NextResponse.json({ error: "Selecione uma empresa antes de testar a conexao Google." }, { status: 400 });
  }

  try {
    await assertBillableAccess({ organizationId });
  } catch (error) {
    return NextResponse.json(
      formatBillingAccessError(error, "Acesso bloqueado por plano ou creditos."),
      { status: statusForBillingAccessError(error, 500) },
    );
  }

  const overview = await getClientTrafficOverview(organizationId);
  const paidProvider = overview.paidProviders.find((provider) => provider.platform === "Google" && provider.kind === "paid")
    ?? emptyProvider("Google Ads", "paid", "Conecte Google em Integracoes e selecione a conta Google Ads.");
  const organicProvider = overview.organicProviders.find((provider) => provider.platform === "Google" && provider.kind === "organic")
    ?? emptyProvider("Google Search Console", "organic", "Search Console ou GA4 ainda nao configurado.");
  const tracking = overview.tracking;
  const hasCustomerId = Boolean(tracking.googleAdsCustomerId);
  const hasConversionId = Boolean(tracking.googleAdsConversionId);
  const hasGa4 = Boolean(tracking.googleAnalyticsMeasurementId);
  const hasSearchConsole = Boolean(tracking.googleSearchConsoleSiteUrl);
  const ranAt = new Date().toISOString();
  const results: GoogleReviewTestResult[] = [
    {
      id: "google_oauth",
      label: "OAuth Google",
      ok: paidProvider.status === "online" || hasCustomerId,
      permission: "GOOGLE_ADS_REFRESH_TOKEN",
      permissions: ["Google Ads API"],
      status: null,
      detail: paidProvider.status === "offline"
        ? paidProvider.detail
        : "OAuth Google encontrado para este workspace.",
      endpoint: "oauth2.googleapis.com/token",
      surface: "google_oauth",
      severity: "required",
      action: "Reconecte Google em Integracoes se o OAuth estiver expirado.",
    },
    {
      id: "google_ads_account",
      label: "Conta Google Ads",
      ok: hasCustomerId,
      permission: "GOOGLE_ADS_CUSTOMER_ID",
      status: null,
      detail: hasCustomerId
        ? `Conta ${tracking.googleAdsCustomerId} selecionada.`
        : "Conta Google Ads ainda nao selecionada em Integracoes.",
      endpoint: "customers:listAccessibleCustomers",
      surface: "google_ads",
      severity: "required",
      action: "Selecione a conta Google Ads no fluxo guiado.",
    },
    {
      id: "google_ads_report",
      label: "Leitura de campanhas",
      ok: paidProvider.status === "online",
      permission: "Google Ads API",
      status: null,
      detail: paidProvider.detail,
      endpoint: "googleAds:searchStream",
      surface: "google_ads",
      severity: "required",
      action: "Confira Developer Token, refresh token e permissoes da conta.",
    },
    {
      id: "google_conversion_tag",
      label: "Tag de conversao",
      ok: hasConversionId,
      permission: "GOOGLE_ADS_CONVERSION_ID",
      status: null,
      detail: hasConversionId
        ? `Conversion ID ${tracking.googleAdsConversionId} configurado.`
        : "Conversion ID ainda nao configurado para medir conversoes.",
      endpoint: "gtag/conversion",
      surface: "google_tags",
      severity: "recommended",
      action: "Adicione o Google Ads Conversion ID em Integracoes.",
    },
    {
      id: "google_organic_context",
      label: "Busca organica",
      ok: organicProvider.status === "online" || hasGa4 || hasSearchConsole,
      permission: "Search Console / GA4",
      status: null,
      detail: organicProvider.status === "online"
        ? organicProvider.detail
        : hasGa4 || hasSearchConsole
          ? "GA4 ou Search Console configurado para contexto organico."
          : "Search Console ou GA4 ainda nao configurado; opcional para o dashboard.",
      endpoint: "searchconsole.searchanalytics.query",
      surface: "google_organic",
      severity: "recommended",
      action: "Vincule Search Console ou GA4 quando quiser cruzar pago e organico.",
    },
  ];
  const readiness = summarizeReadiness(results, ranAt);
  const ok = readiness.blocked === 0;
  const summary = ok
    ? readiness.warning > 0
      ? `Google pronto com ${readiness.warning} alerta(s) operacional(is).`
      : "Checklist Google executado com sucesso."
    : `Checklist Google com ${readiness.blocked} bloqueio(s).`;

  return NextResponse.json({
    ok,
    ranAt,
    readiness,
    summary,
    results,
  });
}

function summarizeReadiness(results: GoogleReviewTestResult[], generatedAt: string) {
  const blocked = results.filter((result) => !result.ok && result.severity === "required").length;
  const warning = results.filter((result) => !result.ok && result.severity !== "required").length;
  const ready = results.filter((result) => result.ok).length;

  return {
    status: blocked > 0 ? "blocked" as const : warning > 0 ? "warning" as const : "ready" as const,
    total: results.length,
    ready,
    warning,
    blocked,
    generatedAt,
  };
}

function emptyProvider(name: string, kind: TrafficProviderSummary["kind"], detail: string): TrafficProviderSummary {
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    platform: "Google",
    kind,
    status: "warning",
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    engagements: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    averagePosition: null,
    detail,
  };
}
