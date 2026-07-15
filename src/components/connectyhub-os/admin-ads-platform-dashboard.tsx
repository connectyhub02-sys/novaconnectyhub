import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bell,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Eye,
  LineChart,
  Megaphone,
  MousePointerClick,
  Plus,
  Save,
  Search,
  Target,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StatusTone, Tone } from "@/lib/connectyhub-os-data";
import type {
  AdminTrafficOverview,
  TrafficCampaign,
  TrafficProviderStatus,
  TrafficProviderSummary,
  TrafficSeriesPoint,
} from "@/lib/traffic/admin-traffic";
import { cn } from "@/lib/utils";
import { AdsDashboardSyncButton } from "./ads-dashboard-sync-button";
import { AreaChartPanel, BarChartPanel } from "./charts";
import { ConnectyShell } from "./connecty-shell";
import { MetaReviewTestButton } from "./meta-review-test-button";
import { DataTable, NeonBadge, PageHeader, Panel, StatusBadge, toneClass } from "./panel-primitives";

export type AdsDashboardPlatform = "meta" | "google";

type ConnectionGuidance = {
  detail: string;
  items: string[];
  title: string;
  tone: Tone;
};

const platformConfig = {
  meta: {
    activeHref: "/admin/trafego/meta-ads",
    eyebrow: "Trafego IA / Meta",
    title: "Meta Ads",
    description: "Mostradores de campanhas, pixel, leads e leitura organica do ecossistema Meta.",
    platformName: "Meta" as const,
    tone: "violet" as const,
    color: "#e879f9",
    trackingEyebrow: "Meta Ads",
    trackingTitle: "Rastreamento Meta",
    trackingDescription: "Pixel e conta de anuncios usados para acompanhar campanhas de Facebook e Instagram.",
    leadsLabel: "Leads (Meta)",
    cpaLabel: "CPA (Meta)",
    sourceTerms: ["meta", "facebook", "instagram"],
  },
  google: {
    activeHref: "/admin/trafego/google-ads",
    eyebrow: "Trafego IA / Google",
    title: "Google Ads 360",
    description: "Mostradores de campanhas, tags, conversoes e leitura organica do Google.",
    platformName: "Google" as const,
    tone: "cyan" as const,
    color: "#60a5fa",
    trackingEyebrow: "Google Ads",
    trackingTitle: "Rastreamento Google",
    trackingDescription: "Tags publicadas para campanhas, conversoes e leitura de trafego Google.",
    leadsLabel: "Leads (Google)",
    cpaLabel: "CPA (Google)",
    sourceTerms: ["google", "oauth", "search console"],
  },
} as const;

export function AdminAdsPlatformDashboard({
  activeHref,
  credentialHref = "/admin/maintenance#credenciais-do-sistema",
  credentialPrimaryLabel = "Abrir conexoes",
  credentialSecondaryLabel = "Salvar na manutencao",
  isPlatformAdmin = true,
  overview,
  platform,
  shellMode = "admin",
  userAvatarUrl,
  userLabel = "CEO_HUMAN_ADM",
  workspaceName,
}: {
  activeHref?: string;
  credentialHref?: string;
  credentialPrimaryLabel?: string;
  credentialSecondaryLabel?: string;
  isPlatformAdmin?: boolean;
  overview: AdminTrafficOverview;
  platform: AdsDashboardPlatform;
  shellMode?: "admin" | "client";
  userAvatarUrl?: string | null;
  userLabel?: string;
  workspaceName?: string;
}) {
  const config = platformConfig[platform];
  const paidProvider = getPaidProvider(overview, platform);
  const organicProvider = getOrganicProvider(overview, platform);
  const campaigns = overview.campaigns
    .filter((campaign) => campaign.platform === config.platformName)
    .sort((left, right) => right.spend - left.spend);
  const paidSeries = getPaidSeries(overview, platform);
  const trackingFields = getTrackingFields(overview, platform);
  const trackingConfigured = trackingFields.some((field) => Boolean(field.value));
  const internalLeads = platform === "meta" ? overview.leadAttribution.meta : overview.leadAttribution.google;
  const latestLeadAt = platform === "meta"
    ? overview.leadAttribution.latestReceivedAt.meta
    : overview.leadAttribution.latestReceivedAt.google;
  const ctr = paidProvider.ctr;
  const cpa = ratio(paidProvider.spend, paidProvider.conversions);
  const risk = resolveRisk(paidProvider, trackingConfigured);
  const platformWarnings = filterPlatformWarnings(overview.warnings, platform);
  const trackingStatus = resolveTrackingStatus(paidProvider, trackingConfigured);
  const connectionGuidance = buildConnectionGuidance({
    isClient: shellMode === "client",
    organicProvider,
    paidProvider,
    platform,
    trackingConfigured,
    warnings: platformWarnings,
  });

  return (
    <ConnectyShell
      activeHref={activeHref ?? config.activeHref}
      mode={shellMode}
      isPlatformAdmin={isPlatformAdmin}
      userAvatarUrl={userAvatarUrl}
      userLabel={userLabel}
      workspaceName={workspaceName}
    >
      <PageHeader
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
        actions={
          <div className="flex min-w-max items-center gap-2">
            <ToolbarButton icon={CalendarDays} label="Hoje" />
            <AdsDashboardSyncButton />
            {platform === "meta" ? <MetaReviewTestButton /> : null}
            <ToolbarButton icon={BrainCircuit} label="Analisar com IA" tone="violet" />
            <ToolbarButton icon={Activity} label="Gestor IA" tone="amber" />
            <ToolbarButton icon={Plus} label="Nova campanha" tone="amber" disabled />
          </div>
        }
      />

      <Panel
        title={config.trackingTitle}
        eyebrow={config.trackingEyebrow}
        action={<StatusBadge status={statusToTone(trackingStatus)} label={trackingStatusLabel(trackingStatus, trackingConfigured)} />}
        tone={config.tone}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", toneClass(config.tone).bg)}>
                <LineChart className={cn("h-5 w-5", toneClass(config.tone).text)} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-white">{config.trackingTitle}</p>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">{config.trackingDescription}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {trackingFields.map((field) => (
                <TrackingField key={field.label} label={field.label} value={field.value} />
              ))}
            </div>
          </div>

          <div className="grid content-between gap-3 rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Ultima atualizacao</p>
              <p className="mt-1 text-[13px] font-semibold text-white">{formatDateTime(overview.generatedAt)}</p>
              <p className="mt-2 text-[11px] leading-4 text-slate-500">{paidProvider.detail}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <LinkButton href={credentialHref} icon={ExternalLink} label={credentialPrimaryLabel} tone={config.tone} />
              <LinkButton href={credentialHref} icon={Save} label={credentialSecondaryLabel} tone="cyan" />
            </div>
          </div>
        </div>
      </Panel>

      {connectionGuidance ? (
        <ConnectionGuidanceCard
          guidance={connectionGuidance}
          href={credentialHref}
          primaryLabel={credentialPrimaryLabel}
          secondaryLabel={credentialSecondaryLabel}
          tone={config.tone}
        />
      ) : null}

      <div className="my-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <NoticeCard
          icon={Clock3}
          label="Proxima analise diaria"
          value="Hoje 23:00"
          detail={`Janela atual: ${overview.range.label}`}
          tone="amber"
        />
        <NoticeCard
          icon={Bell}
          label="Ultimo lead recebido"
          value={latestLeadAt ? formatDateTime(latestLeadAt) : "Nenhum lead recente"}
          detail={`${formatNumber(internalLeads)} lead(s) atribuido(s) no banco`}
          tone="green"
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-9">
        <TrafficStat icon={CircleDollarSign} label="Gasto total" value={formatMoney(paidProvider.spend)} detail={overview.range.label} tone="green" />
        <TrafficStat icon={Eye} label="Impressoes" value={formatNumber(paidProvider.impressions)} detail="anuncios pagos" tone="violet" />
        <TrafficStat icon={Users} label="Alcance" value={formatNumber(Math.max(paidProvider.impressions, organicProvider.impressions))} detail="pago + leitura organica" tone="cyan" />
        <TrafficStat icon={MousePointerClick} label="Cliques" value={formatNumber(paidProvider.clicks)} detail="trafego pago" tone="amber" />
        <TrafficStat icon={LineChart} label="CTR medio" value={formatPercent(ctr)} detail="cliques / impressoes" tone="amber" />
        <TrafficStat icon={Plus} label="Leads reais (DB)" value={formatNumber(internalLeads)} detail="capturados internamente" tone="green" />
        <TrafficStat icon={CheckCircle2} label={config.leadsLabel} value={formatNumber(paidProvider.conversions)} detail="reportado pela plataforma" tone="violet" />
        <TrafficStat icon={Target} label={config.cpaLabel} value={paidProvider.conversions ? formatMoney(cpa) : "--"} detail="gasto / leads" tone="rose" />
        <TrafficStat icon={Search} label="CPM medio" value={paidProvider.cpm ? formatMoney(paidProvider.cpm) : "--"} detail="custo por mil" tone="cyan" />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title="Relatorio executivo"
          eyebrow="Gestor de Trafego Pago IA"
          action={<NeonBadge tone={risk.tone}>{risk.label}</NeonBadge>}
          tone={risk.tone}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <ExecutiveCard
              label="Score"
              value={paidProvider.status === "online" ? String(scoreProvider(paidProvider, trackingConfigured)) : "--"}
              text={paidProvider.status === "online" ? "Conta respondendo e pronta para analise diaria." : "Aguardando leitura valida da plataforma."}
              tone={risk.tone}
            />
            <ExecutiveCard
              label="Campanhas"
              value={formatNumber(campaigns.length)}
              text={campaigns.length ? "Campanhas ordenadas por investimento no periodo." : "Sem campanhas retornadas nesta janela."}
              tone={config.tone}
            />
            <ExecutiveCard
              label="Risco"
              value={risk.label}
              text={risk.detail}
              tone={risk.tone}
            />
          </div>
        </Panel>

        <Panel title="Status das fontes" eyebrow="credenciais / leitura" tone={config.tone}>
          <div className="grid gap-2">
            <SourceStatusRow provider={paidProvider} />
            <SourceStatusRow provider={organicProvider} />
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.62fr)]">
        <AreaChartPanel
          title="Cliques por dia"
          eyebrow={config.title}
          value={formatNumber(paidProvider.clicks)}
          data={ensureSeries(paidSeries)}
          color={config.color}
          filters={["30D"]}
        />
        <BarChartPanel
          title="Distribuicao de gasto"
          eyebrow="por campanha"
          data={campaignSpendSeries(campaigns)}
          color={config.color}
          filters={["30D"]}
        />
      </div>

      <Panel
        title="Campanhas"
        eyebrow="campanha / gasto / clique / conversao"
        action={<NeonBadge tone={config.tone}>{campaigns.length} campanha(s)</NeonBadge>}
        tone={config.tone}
      >
        {campaigns.length ? (
          <DataTable
            columns={["Campanha", "Status", "Gasto", "Cliques", "CTR", "Leads", "CPC"]}
            rows={campaigns.map((campaign) => campaignRow(campaign))}
          />
        ) : (
          <EmptyState
            icon={Megaphone}
            title={`Sem campanhas ${config.platformName} no periodo`}
            text="Quando a API retornar dados, as campanhas aparecem aqui com gasto, cliques, CTR, leads e CPC."
          />
        )}
      </Panel>

      {platformWarnings.length ? (
        <Panel className="mt-4" title="Avisos de leitura" eyebrow="permissoes / escopos / contas" tone="amber">
          <div className="grid gap-2">
            {platformWarnings.map((warning) => (
              <div
                key={warning}
                className="flex items-start gap-3 rounded-xl px-3 py-3 text-[12px] leading-5 text-amber-100"
                style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.22)" }}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </ConnectyShell>
  );
}

function TrackingField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded-xl p-3" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <p className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 truncate font-mono text-[13px] font-semibold text-white">{value ?? "Nao configurado"}</p>
    </div>
  );
}

function ToolbarButton({
  disabled = false,
  icon: Icon,
  label,
  tone = "cyan",
}: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  tone?: Tone;
}) {
  const t = toneClass(tone);

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
        t.border,
        t.bg,
        t.text,
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function LinkButton({ href, icon: Icon, label, tone }: { href: string; icon: LucideIcon; label: string; tone: Tone }) {
  const t = toneClass(tone);

  return (
    <Link
      href={href}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 font-mono text-[10px] uppercase tracking-wide", t.border, t.bg, t.text)}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

function ConnectionGuidanceCard({
  guidance,
  href,
  primaryLabel,
  secondaryLabel,
  tone,
}: {
  guidance: ConnectionGuidance;
  href: string;
  primaryLabel: string;
  secondaryLabel: string;
  tone: Tone;
}) {
  const t = toneClass(guidance.tone);

  return (
    <div className="my-4 rounded-2xl p-4" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", t.bg)}>
            <AlertTriangle className={cn("h-5 w-5", t.text)} />
          </span>
          <div className="min-w-0">
            <p className={cn("font-mono text-[10px] uppercase tracking-[0.16em]", t.text)}>status da conexao</p>
            <h2 className="mt-1 text-[15px] font-semibold text-white">{guidance.title}</h2>
            <p className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-500">{guidance.detail}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <LinkButton href={href} icon={ExternalLink} label={primaryLabel} tone={tone} />
          <LinkButton href={href} icon={Save} label={secondaryLabel} tone="cyan" />
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {guidance.items.map((item) => (
          <div key={item} className="rounded-xl px-3 py-2 text-[11px] leading-4 text-slate-300" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function NoticeCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: Tone;
  value: string;
}) {
  const t = toneClass(tone);

  return (
    <div className="min-w-0 rounded-2xl p-4" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-center gap-3">
        <Icon className={cn("h-4 w-4 shrink-0", t.text)} />
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      </div>
      <p className="mt-2 truncate text-[15px] font-semibold text-white">{value}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function TrafficStat({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: Tone;
  value: string;
}) {
  const t = toneClass(tone);

  return (
    <div className="min-w-0 rounded-2xl p-3" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", t.text)} />
        <span className={cn("h-2 w-2 shrink-0 rounded-full", t.dot)} />
      </div>
      <p className="mt-4 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={cn("mt-2 truncate font-mono text-[19px] font-bold leading-none", t.text)}>{value}</p>
      <p className="mt-2 truncate text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

function ExecutiveCard({ label, text, tone, value }: { label: string; text: string; tone: Tone; value: string }) {
  const t = toneClass(tone);

  return (
    <div className="min-w-0 rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={cn("mt-2 truncate font-mono text-[20px] font-bold", t.text)}>{value}</p>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">{text}</p>
    </div>
  );
}

function SourceStatusRow({ provider }: { provider: TrafficProviderSummary }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-white">{provider.name}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">{provider.detail}</p>
        </div>
        <StatusBadge status={statusToTone(provider.status)} label={statusLabel(provider.status)} />
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  text,
  title,
}: {
  icon: LucideIcon;
  text: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-8 text-center" style={{ borderColor: "var(--ch-border)" }}>
      <Icon className="mx-auto h-6 w-6 text-slate-500" />
      <p className="mt-3 text-[13px] font-semibold text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-[12px] leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function getPaidProvider(overview: AdminTrafficOverview, platform: AdsDashboardPlatform) {
  const platformName = platformConfig[platform].platformName;
  return overview.paidProviders.find((provider) => provider.platform === platformName) ?? emptyProvider(platform, "paid");
}

function getOrganicProvider(overview: AdminTrafficOverview, platform: AdsDashboardPlatform) {
  const platformName = platformConfig[platform].platformName;
  return overview.organicProviders.find((provider) => provider.platform === platformName) ?? emptyProvider(platform, "organic");
}

function emptyProvider(platform: AdsDashboardPlatform, kind: "paid" | "organic"): TrafficProviderSummary {
  const config = platformConfig[platform];
  return {
    id: `${platform}-${kind}`,
    name: `${config.platformName} ${kind === "paid" ? "Ads" : "organico"}`,
    platform: config.platformName,
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

function getPaidSeries(overview: AdminTrafficOverview, platform: AdsDashboardPlatform) {
  return platform === "meta" ? overview.platformSeries.metaPaidClicks : overview.platformSeries.googlePaidClicks;
}

function getTrackingFields(overview: AdminTrafficOverview, platform: AdsDashboardPlatform) {
  if (platform === "meta") {
    return [
      { label: "Meta Pixel ID", value: overview.tracking.metaPixelId },
      { label: "Ad Account ID", value: overview.tracking.metaAdAccountId },
      { label: "Instagram Business ID", value: overview.tracking.instagramBusinessId },
      { label: "Facebook Page ID", value: overview.tracking.facebookPageId },
    ];
  }

  return [
    { label: "Google Ads Conversion ID", value: overview.tracking.googleAdsConversionId },
    { label: "GA4 Measurement ID", value: overview.tracking.googleAnalyticsMeasurementId },
    { label: "Google Ads Customer ID", value: overview.tracking.googleAdsCustomerId },
    { label: "Search Console Site", value: overview.tracking.googleSearchConsoleSiteUrl },
  ];
}

function resolveTrackingStatus(provider: TrafficProviderSummary, trackingConfigured: boolean): TrafficProviderStatus {
  if (provider.status === "offline") return "offline";
  if (provider.status === "online" && trackingConfigured) return "online";
  return "warning";
}

function trackingStatusLabel(status: TrafficProviderStatus, trackingConfigured: boolean) {
  if (status === "offline") return "erro";
  if (status === "online") return "configurado";
  return trackingConfigured ? "parcial" : "pendente";
}

function buildConnectionGuidance({
  isClient,
  organicProvider,
  paidProvider,
  platform,
  trackingConfigured,
  warnings,
}: {
  isClient: boolean;
  organicProvider: TrafficProviderSummary;
  paidProvider: TrafficProviderSummary;
  platform: AdsDashboardPlatform;
  trackingConfigured: boolean;
  warnings: string[];
}): ConnectionGuidance | null {
  if (paidProvider.status === "online" && trackingConfigured && warnings.length === 0) {
    return null;
  }

  const config = platformConfig[platform];
  const tone: Tone = paidProvider.status === "offline" ? "rose" : "amber";
  const platformLabel = config.platformName;
  const requiredAccount = platform === "meta" ? "conta de anuncios Meta" : "conta Google Ads";
  const paidBlocked = paidProvider.status !== "online" || !trackingConfigured;
  const optionalOrganic = platform === "meta"
    ? "Instagram Business ou pagina Facebook para trafego organico"
    : "Search Console ou GA4 para leitura organica";
  const detail = warnings[0] ?? paidProvider.detail;

  return {
    title: isClient
      ? paidBlocked
        ? `${platformLabel} ainda nao esta pronto para os mostradores`
        : `${platformLabel} com leitura parcial nos mostradores`
      : paidBlocked
        ? `Credenciais ${platformLabel} precisam de revisao`
        : `${platformLabel} com aviso de leitura parcial`,
    detail: isClient
      ? paidBlocked
        ? `Abra Integracoes, conecte ${platformLabel} pelo fluxo guiado e selecione a ${requiredAccount}. ${detail}`
        : `A leitura paga esta ativa, mas existe um aviso complementar. ${detail}`
      : paidBlocked
        ? `Revise o app tecnico e as credenciais de teste na manutencao. ${detail}`
        : `A leitura paga esta ativa, mas existe um aviso complementar. ${detail}`,
    items: [
      paidProvider.status === "online"
        ? `Leitura paga ${platformLabel} respondendo`
        : paidProvider.detail,
      trackingConfigured
        ? `${requiredAccount} selecionada`
        : `Selecione uma ${requiredAccount}`,
      organicProvider.status === "online"
        ? "Leitura organica respondendo"
        : `Opcional: ${optionalOrganic}`,
    ],
    tone,
  };
}

function resolveRisk(provider: TrafficProviderSummary, trackingConfigured: boolean): { label: string; tone: Tone; detail: string } {
  if (provider.status === "offline") {
    return {
      label: "alto",
      tone: "rose",
      detail: "A plataforma nao respondeu; confira credenciais, permissoes e conta vinculada.",
    };
  }

  if (!trackingConfigured || provider.status === "warning") {
    return {
      label: "medio",
      tone: "amber",
      detail: "Conexao parcial ou rastreamento incompleto; a analise fica limitada.",
    };
  }

  if (provider.spend > 0 && provider.conversions === 0) {
    return {
      label: "medio",
      tone: "amber",
      detail: "Ha gasto no periodo sem leads reportados pela plataforma.",
    };
  }

  return {
    label: "baixo",
    tone: "green",
    detail: "Fonte conectada e sem bloqueios criticos no periodo.",
  };
}

function scoreProvider(provider: TrafficProviderSummary, trackingConfigured: boolean) {
  let score = trackingConfigured ? 74 : 52;

  if (provider.status === "online") score += 8;
  if (provider.clicks > 0) score += 6;
  if (provider.conversions > 0) score += 8;
  if (provider.ctr >= 2) score += 4;

  return Math.max(0, Math.min(score, 100));
}

function filterPlatformWarnings(warnings: string[], platform: AdsDashboardPlatform) {
  const terms = platformConfig[platform].sourceTerms;
  return warnings.filter((warning) => {
    const normalized = warning.toLowerCase();
    return terms.some((term) => normalized.includes(term));
  });
}

function campaignSpendSeries(campaigns: TrafficCampaign[]): TrafficSeriesPoint[] {
  const points = campaigns.slice(0, 8).map((campaign) => ({
    label: truncateLabel(campaign.name),
    value: Math.round(campaign.spend * 100) / 100,
  }));

  if (points.length > 0) {
    return points;
  }

  return [
    { label: "Sem dados", value: 0 },
  ];
}

function campaignRow(campaign: TrafficCampaign) {
  return [
    <div key="campaign" className="min-w-0">
      <div className="truncate text-[13px] font-medium text-white">{campaign.name}</div>
      <div className="font-mono text-[10px] text-slate-600">{campaign.id}</div>
    </div>,
    <span key="status" className="font-mono text-[11px] text-slate-400">{campaign.status}</span>,
    <span key="spend" className="font-mono text-[12px] text-emerald-400">{formatMoney(campaign.spend)}</span>,
    <span key="clicks" className="font-mono text-[12px] text-cyan-400">{formatNumber(campaign.clicks)}</span>,
    <span key="ctr" className="font-mono text-[12px] text-slate-300">{formatPercent(campaign.ctr)}</span>,
    <span key="conv" className="font-mono text-[12px] text-amber-300">{formatNumber(campaign.conversions)}</span>,
    <span key="cpc" className="font-mono text-[12px] text-slate-300">{formatMoney(campaign.cpc)}</span>,
  ];
}

function ensureSeries(series: TrafficSeriesPoint[]) {
  if (series.length > 0) {
    return series;
  }

  return [
    { label: "D-6", value: 0 },
    { label: "D-5", value: 0 },
    { label: "D-4", value: 0 },
    { label: "D-3", value: 0 },
    { label: "D-2", value: 0 },
    { label: "D-1", value: 0 },
    { label: "Hoje", value: 0 },
  ];
}

function statusToTone(status: TrafficProviderStatus): StatusTone {
  if (status === "online") return "online";
  if (status === "offline") return "critical";
  return "warning";
}

function statusLabel(status: TrafficProviderStatus) {
  if (status === "online") return "online";
  if (status === "offline") return "offline";
  return "pendente";
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
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

function formatDateTime(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function truncateLabel(value: string) {
  return value.length > 18 ? `${value.slice(0, 15)}...` : value;
}
