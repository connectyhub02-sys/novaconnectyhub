import type {
  AdminTrafficOverview,
  TrafficCampaign,
  TrafficProviderSummary,
} from "@/lib/traffic/admin-traffic";

export type TrafficManagerPlatform = "meta" | "google";

export type TrafficManagerPriority = "critical" | "high" | "medium" | "low";

export type TrafficManagerStatus = "critical" | "attention" | "stable" | "growth";

export type TrafficManagerRecommendation = {
  id: string;
  priority: TrafficManagerPriority;
  category: "tracking" | "creative" | "budget" | "conversion" | "organic" | "sync";
  title: string;
  detail: string;
  action: string;
  impact: string;
  metricLabel: string;
  metricValue: string;
};

export type TrafficManagerPlan = {
  platform: TrafficManagerPlatform;
  generatedAt: string;
  score: number;
  status: TrafficManagerStatus;
  statusLabel: string;
  summary: string;
  nextAction: string;
  diagnostics: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  budgetFocus: Array<{
    label: string;
    value: string;
  }>;
  recommendations: TrafficManagerRecommendation[];
};

type PlatformName = "Meta" | "Google";

const priorityRank: Record<TrafficManagerPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function buildTrafficManagerPlan(
  overview: AdminTrafficOverview,
  platform: TrafficManagerPlatform,
): TrafficManagerPlan {
  const platformName = platform === "meta" ? "Meta" : "Google";
  const paidProvider = getPaidProvider(overview, platformName);
  const organicProvider = getOrganicProvider(overview, platformName);
  const campaigns = overview.campaigns
    .filter((campaign) => campaign.platform === platformName)
    .sort((left, right) => right.spend - left.spend);
  const trackingConfigured = hasTrackingConfigured(overview, platform);
  const internalLeads = platform === "meta" ? overview.leadAttribution.meta : overview.leadAttribution.google;
  const recommendations = buildRecommendations({
    campaigns,
    internalLeads,
    organicProvider,
    paidProvider,
    platform,
    platformName,
    trackingConfigured,
  });
  const score = scoreTraffic({
    internalLeads,
    paidProvider,
    trackingConfigured,
  });
  const status = resolveStatus(score, paidProvider, recommendations);

  return {
    platform,
    generatedAt: overview.generatedAt,
    score,
    status,
    statusLabel: statusLabel(status),
    summary: buildSummary({
      internalLeads,
      paidProvider,
      platformName,
      recommendations,
      trackingConfigured,
    }),
    nextAction: recommendations[0]?.action ?? "Manter leitura diaria, preservar campanhas vencedoras e testar uma variacao de criativo por semana.",
    diagnostics: buildDiagnostics({
      internalLeads,
      paidProvider,
      trackingConfigured,
    }),
    budgetFocus: buildBudgetFocus(campaigns),
    recommendations,
  };
}

function buildRecommendations(input: {
  campaigns: TrafficCampaign[];
  internalLeads: number;
  organicProvider: TrafficProviderSummary;
  paidProvider: TrafficProviderSummary;
  platform: TrafficManagerPlatform;
  platformName: PlatformName;
  trackingConfigured: boolean;
}) {
  const items: TrafficManagerRecommendation[] = [];
  const paid = input.paidProvider;
  const cpa = ratio(paid.spend, paid.conversions);
  const conversionRate = ratioPercent(paid.conversions, paid.clicks);
  const topCampaign = input.campaigns[0] ?? null;
  const strongCampaign = findStrongCampaign(input.campaigns);
  const wasteCampaigns = input.campaigns.filter((campaign) => campaign.spend > 20 && campaign.conversions === 0);

  if (paid.status !== "online") {
    items.push({
      id: "sync-source",
      priority: "critical",
      category: "sync",
      title: "Fonte sem leitura confiavel",
      detail: paid.detail,
      action: `Sincronizar ${input.platformName} e revisar a conta selecionada antes de tomar decisao de verba.`,
      impact: "Evita decisao no escuro",
      metricLabel: "status",
      metricValue: paid.status,
    });
  }

  if (!input.trackingConfigured) {
    items.push({
      id: "tracking",
      priority: "critical",
      category: "tracking",
      title: "Rastreamento incompleto",
      detail: "A conta possui leitura parcial de tags, pixel, conversao ou propriedade organica.",
      action: input.platform === "meta"
        ? "Conferir Pixel, conta de anuncios, pagina Facebook e Instagram Business nas integracoes."
        : "Conferir Customer ID, tag de conversao, GA4 e Search Console nas integracoes.",
      impact: "Melhora atribuicao e reduz falsos negativos",
      metricLabel: "tracking",
      metricValue: "parcial",
    });
  }

  if (paid.spend > 0 && paid.conversions === 0) {
    items.push({
      id: "no-conversions",
      priority: "high",
      category: "conversion",
      title: "Gasto sem conversao reportada",
      detail: `Foram investidos ${formatMoney(paid.spend)} sem leads reportados pela plataforma no periodo.`,
      action: "Pausar conjuntos sem evento, validar pagina/checkout e criar teste com objetivo de lead ou mensagem.",
      impact: "Contem desperdicio de verba",
      metricLabel: "CPA",
      metricValue: "--",
    });
  }

  if (paid.ctr > 0 && paid.ctr < 0.8) {
    items.push({
      id: "low-ctr",
      priority: "high",
      category: "creative",
      title: "CTR abaixo do saudavel",
      detail: `CTR medio em ${formatPercent(paid.ctr)} indica criativo, promessa ou publico com baixa resposta.`,
      action: "Criar 3 variacoes de gancho, trocar primeira linha do criativo e isolar o melhor publico.",
      impact: "Aumenta cliques sem elevar verba",
      metricLabel: "CTR",
      metricValue: formatPercent(paid.ctr),
    });
  }

  if (cpa > 0 && cpa >= 80) {
    items.push({
      id: "high-cpa",
      priority: "high",
      category: "budget",
      title: "CPA acima do limite operacional",
      detail: `CPA atual em ${formatMoney(cpa)} precisa de revisao antes de escalar.`,
      action: "Mover verba das campanhas caras para campanha com melhor CTR/conversao e reduzir orcamento de testes fracos.",
      impact: "Protege margem da operacao",
      metricLabel: "CPA",
      metricValue: formatMoney(cpa),
    });
  }

  if (wasteCampaigns.length > 0) {
    const wasteSpend = wasteCampaigns.reduce((total, campaign) => total + campaign.spend, 0);

    items.push({
      id: "waste-campaigns",
      priority: "medium",
      category: "budget",
      title: "Campanhas consumindo verba sem lead",
      detail: `${wasteCampaigns.length} campanha(s) somam ${formatMoney(wasteSpend)} sem conversao.`,
      action: "Marcar campanhas sem lead para revisao diaria e limitar orcamento ate corrigir evento ou criativo.",
      impact: "Libera verba para testes melhores",
      metricLabel: "verba em risco",
      metricValue: formatMoney(wasteSpend),
    });
  }

  if (strongCampaign) {
    items.push({
      id: "scale-winner",
      priority: "medium",
      category: "budget",
      title: "Campanha candidata a escala",
      detail: `${strongCampaign.name} concentra leads com CPA de ${formatMoney(ratio(strongCampaign.spend, strongCampaign.conversions))}.`,
      action: "Aumentar verba em passos pequenos e manter uma copia de teste para novo criativo/publico.",
      impact: "Escala com controle",
      metricLabel: "leads",
      metricValue: formatNumber(strongCampaign.conversions),
    });
  }

  if (input.organicProvider.engagements > paid.clicks && input.organicProvider.engagements >= 20) {
    items.push({
      id: "organic-to-paid",
      priority: "medium",
      category: "organic",
      title: "Organico com sinal de campanha",
      detail: `Leitura organica trouxe ${formatNumber(input.organicProvider.engagements)} engajamentos no periodo.`,
      action: "Transformar o post organico mais forte em criativo pago e testar publico semelhante.",
      impact: "Aproveita prova de interesse",
      metricLabel: "engajamentos",
      metricValue: formatNumber(input.organicProvider.engagements),
    });
  }

  if (paid.conversions > 0 && input.internalLeads === 0) {
    items.push({
      id: "lead-gap",
      priority: "medium",
      category: "tracking",
      title: "Lead na plataforma sem lead interno",
      detail: `${formatNumber(paid.conversions)} conversao(oes) na plataforma e nenhum lead atribuido no banco.`,
      action: "Conferir UTMs, origem do formulario e captura do lead para nao perder atribuição no CRM.",
      impact: "Fecha o ciclo anuncio > lead > venda",
      metricLabel: "gap",
      metricValue: formatNumber(paid.conversions),
    });
  }

  if (topCampaign && input.campaigns.length > 1 && ratioPercent(topCampaign.spend, paid.spend) > 70) {
    items.push({
      id: "budget-concentration",
      priority: "low",
      category: "budget",
      title: "Verba concentrada em uma campanha",
      detail: `${topCampaign.name} concentra ${formatPercent(ratioPercent(topCampaign.spend, paid.spend))} do investimento.`,
      action: "Reservar 10% a 15% do orcamento para testar nova audiencia ou criativo sem mexer no vencedor.",
      impact: "Reduz dependencia de uma unica campanha",
      metricLabel: "concentracao",
      metricValue: formatPercent(ratioPercent(topCampaign.spend, paid.spend)),
    });
  }

  if (items.length === 0) {
    items.push({
      id: "maintain-and-test",
      priority: "low",
      category: "budget",
      title: "Operacao estavel",
      detail: `CTR em ${formatPercent(paid.ctr)} e taxa de conversao em ${formatPercent(conversionRate)} sem alerta critico.`,
      action: "Manter leitura diaria, documentar campanha vencedora e testar uma nova variacao por semana.",
      impact: "Preserva aprendizado",
      metricLabel: "score",
      metricValue: "estavel",
    });
  }

  return items
    .sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority])
    .slice(0, 6);
}

function buildSummary(input: {
  internalLeads: number;
  paidProvider: TrafficProviderSummary;
  platformName: PlatformName;
  recommendations: TrafficManagerRecommendation[];
  trackingConfigured: boolean;
}) {
  const paid = input.paidProvider;

  if (paid.status !== "online") {
    return `${input.platformName} ainda precisa de leitura confiavel antes de recomendacao de escala.`;
  }

  if (!input.trackingConfigured) {
    return `${input.platformName} tem dados, mas o rastreamento esta parcial; priorize atribuicao antes de subir verba.`;
  }

  if (paid.spend > 0 && paid.conversions === 0) {
    return `Ha gasto sem conversao reportada. A prioridade e proteger verba e revisar evento de conversao.`;
  }

  const first = input.recommendations[0];
  return first
    ? `${first.title}: ${first.impact.toLowerCase()}.`
    : `Leitura estavel com ${formatNumber(input.internalLeads)} lead(s) interno(s) no periodo.`;
}

function buildDiagnostics(input: {
  internalLeads: number;
  paidProvider: TrafficProviderSummary;
  trackingConfigured: boolean;
}) {
  const paid = input.paidProvider;

  return [
    {
      label: "Score",
      value: String(scoreTraffic(input)),
      detail: "0 a 100",
    },
    {
      label: "CPA",
      value: paid.conversions ? formatMoney(ratio(paid.spend, paid.conversions)) : "--",
      detail: "gasto / leads",
    },
    {
      label: "Conversao",
      value: paid.clicks ? formatPercent(ratioPercent(paid.conversions, paid.clicks)) : "--",
      detail: "leads / cliques",
    },
    {
      label: "Leads DB",
      value: formatNumber(input.internalLeads),
      detail: input.trackingConfigured ? "captura interna" : "tracking parcial",
    },
  ];
}

function buildBudgetFocus(campaigns: TrafficCampaign[]) {
  const winners = campaigns
    .filter((campaign) => campaign.conversions > 0)
    .sort((left, right) => ratio(left.spend, left.conversions) - ratio(right.spend, right.conversions))
    .slice(0, 2);
  const tests = campaigns
    .filter((campaign) => campaign.spend > 0 && campaign.conversions === 0)
    .sort((left, right) => right.spend - left.spend)
    .slice(0, 2);
  const focus = [
    ...winners.map((campaign) => ({
      label: `Escalar: ${truncate(campaign.name, 34)}`,
      value: formatMoney(ratio(campaign.spend, campaign.conversions)),
    })),
    ...tests.map((campaign) => ({
      label: `Revisar: ${truncate(campaign.name, 34)}`,
      value: formatMoney(campaign.spend),
    })),
  ];

  return focus.length > 0
    ? focus
    : [{ label: "Aguardando campanhas", value: "--" }];
}

function scoreTraffic(input: {
  internalLeads: number;
  paidProvider: TrafficProviderSummary;
  trackingConfigured: boolean;
}) {
  const paid = input.paidProvider;
  let score = 100;

  if (paid.status === "offline") score -= 42;
  if (paid.status === "warning") score -= 24;
  if (!input.trackingConfigured) score -= 22;
  if (paid.spend > 0 && paid.conversions === 0) score -= 24;
  if (paid.ctr > 0 && paid.ctr < 0.8) score -= 16;
  if (paid.clicks > 0 && ratioPercent(paid.conversions, paid.clicks) < 1) score -= 10;
  if (paid.conversions > 0 && input.internalLeads === 0) score -= 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function resolveStatus(
  score: number,
  paidProvider: TrafficProviderSummary,
  recommendations: TrafficManagerRecommendation[],
): TrafficManagerStatus {
  if (paidProvider.status === "offline" || recommendations.some((item) => item.priority === "critical")) {
    return "critical";
  }

  if (score < 70 || recommendations.some((item) => item.priority === "high")) {
    return "attention";
  }

  if (score >= 88) {
    return "growth";
  }

  return "stable";
}

function statusLabel(status: TrafficManagerStatus) {
  if (status === "critical") return "critico";
  if (status === "attention") return "atencao";
  if (status === "growth") return "pronto para escala";
  return "estavel";
}

function findStrongCampaign(campaigns: TrafficCampaign[]) {
  const withConversions = campaigns.filter((campaign) => campaign.conversions > 0);

  if (withConversions.length === 0) {
    return null;
  }

  return withConversions.sort((left, right) => (
    ratio(left.spend, left.conversions) - ratio(right.spend, right.conversions)
  ))[0] ?? null;
}

function getPaidProvider(overview: AdminTrafficOverview, platformName: PlatformName) {
  return overview.paidProviders.find((provider) => provider.platform === platformName) ?? emptyProvider(platformName, "paid");
}

function getOrganicProvider(overview: AdminTrafficOverview, platformName: PlatformName) {
  return overview.organicProviders.find((provider) => provider.platform === platformName) ?? emptyProvider(platformName, "organic");
}

function emptyProvider(platform: PlatformName, kind: "paid" | "organic"): TrafficProviderSummary {
  return {
    id: `${platform.toLowerCase()}-${kind}`,
    name: `${platform} ${kind === "paid" ? "Ads" : "organico"}`,
    platform,
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
    detail: "Fonte aguardando configuracao.",
  };
}

function hasTrackingConfigured(overview: AdminTrafficOverview, platform: TrafficManagerPlatform) {
  if (platform === "meta") {
    return Boolean(overview.tracking.metaAdAccountId && (overview.tracking.metaPixelId || overview.tracking.facebookPageId || overview.tracking.instagramBusinessId));
  }

  return Boolean(overview.tracking.googleAdsCustomerId && (overview.tracking.googleAdsConversionId || overview.tracking.googleAnalyticsMeasurementId || overview.tracking.googleSearchConsoleSiteUrl));
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function ratioPercent(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator * 100 : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    maximumFractionDigits: value >= 100 ? 0 : 2,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}
