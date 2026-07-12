import {
  AlertTriangle,
  CircleDollarSign,
  Globe2,
  Megaphone,
  MousePointerClick,
  Search,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  AdminTrafficOverview,
  TrafficCampaign,
  TrafficProviderStatus,
  TrafficProviderSummary,
} from "@/lib/traffic/admin-traffic";
import { AreaChartPanel, BarChartPanel } from "./charts";
import { ConnectyShell } from "./connecty-shell";
import { DataTable, NeonBadge, PageHeader, Panel, StatusBadge, toneClass } from "./panel-primitives";
import { cn } from "@/lib/utils";

export function AdminTrafficConsole({
  overview,
  userLabel = "CEO_HUMAN_ADM",
}: {
  overview: AdminTrafficOverview;
  userLabel?: string;
}) {
  const paidCtr = ratioPercent(overview.summary.paidClicks, overview.summary.paidImpressions);
  const paidCpa = ratio(overview.summary.paidSpend, overview.summary.paidConversions);
  const organicCtr = ratioPercent(overview.summary.organicClicks, overview.summary.organicImpressions);

  return (
    <ConnectyShell activeHref="/admin/trafego" mode="admin" isPlatformAdmin userLabel={userLabel}>
      <PageHeader
        eyebrow="Admin OS / Trafego"
        title="Mostradores de aquisicao"
        description="Leitura operacional de trafego pago e organico das contas conectadas na Sala de Manutencao."
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone="cyan">{overview.range.label}</NeonBadge>
            <NeonBadge tone={overview.warnings.length ? "amber" : "green"}>
              {overview.warnings.length ? `${overview.warnings.length} aviso(s)` : "fontes ok"}
            </NeonBadge>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
        <TrafficStat icon={CircleDollarSign} label="Investimento pago" value={formatMoney(overview.summary.paidSpend)} detail={`CPA ${paidCpa ? formatMoney(paidCpa) : "--"}`} tone="green" />
        <TrafficStat icon={MousePointerClick} label="Cliques pagos" value={formatNumber(overview.summary.paidClicks)} detail={`CTR ${formatPercent(paidCtr)}`} tone="cyan" />
        <TrafficStat icon={Target} label="Conversoes pagas" value={formatNumber(overview.summary.paidConversions)} detail={`${formatNumber(overview.summary.paidImpressions)} impressoes`} tone="amber" />
        <TrafficStat icon={Search} label="Cliques organicos" value={formatNumber(overview.summary.organicClicks)} detail={`CTR ${formatPercent(organicCtr)}`} tone="violet" />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4 lg:grid-cols-2">
          <AreaChartPanel
            title="Cliques pagos"
            eyebrow="Meta Ads + Google Ads"
            value={formatNumber(overview.summary.paidClicks)}
            data={ensureSeries(overview.paidClickSeries)}
            color="#22d3ee"
            filters={["30D"]}
          />
          <BarChartPanel
            title="Cliques organicos"
            eyebrow="Meta organico + Search Console"
            data={ensureSeries(overview.organicClickSeries)}
            color="#34d399"
            filters={["30D"]}
          />
        </div>

        <Panel title="Status das fontes" eyebrow="credenciais / leitura / alerta" tone="amber">
          <div className="grid gap-2">
            {overview.sourceStatus.map((source) => (
              <div
                key={source.id}
                className="rounded-xl p-3"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-white">{source.label}</p>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">{source.detail}</p>
                  </div>
                  <StatusBadge status={statusToTone(source.status)} label={statusLabel(source.status)} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Panel
          title="Trafego pago"
          eyebrow="Meta Ads / Google Ads"
          action={<NeonBadge tone="green">{formatMoney(overview.summary.paidSpend)}</NeonBadge>}
          tone="cyan"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {overview.paidProviders.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        </Panel>

        <Panel
          title="Trafego organico"
          eyebrow="Meta organico / Google Search"
          action={<NeonBadge tone="green">{formatNumber(overview.summary.organicImpressions)} impressoes</NeonBadge>}
          tone="green"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {overview.organicProviders.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        title="Campanhas pagas"
        eyebrow="campanha / gasto / clique / conversao"
        action={<NeonBadge tone="cyan">{overview.campaigns.length} campanha(s)</NeonBadge>}
        tone="violet"
      >
        {overview.campaigns.length ? (
          <DataTable
            columns={["Campanha", "Fonte", "Gasto", "Cliques", "CTR", "Conversoes", "CPC"]}
            rows={overview.campaigns.map((campaign) => campaignRow(campaign))}
          />
        ) : (
          <EmptyState
            icon={Megaphone}
            title="Sem campanhas pagas no periodo"
            text="Quando Meta Ads ou Google Ads retornarem dados, as campanhas aparecem aqui com gasto, cliques, CTR, conversoes e CPC."
          />
        )}
      </Panel>

      {overview.warnings.length ? (
        <Panel className="mt-4" title="Avisos de leitura" eyebrow="permissoes / escopos / contas" tone="amber">
          <div className="grid gap-2">
            {overview.warnings.map((warning) => (
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

function ProviderCard({ provider }: { provider: TrafficProviderSummary }) {
  const tone = provider.platform === "Meta" ? "violet" : "cyan";
  const t = toneClass(tone);
  const primaryValue = provider.kind === "paid" ? formatMoney(provider.spend) : formatNumber(provider.clicks || provider.engagements);
  const primaryLabel = provider.kind === "paid" ? "gasto" : provider.clicks ? "cliques" : "engajamentos";

  return (
    <article
      className="grid min-h-[220px] gap-3 rounded-xl p-4"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-xl", t.bg)}>
              {provider.kind === "paid" ? <Megaphone className={cn("h-4 w-4", t.text)} /> : <Globe2 className={cn("h-4 w-4", t.text)} />}
            </span>
            <NeonBadge tone={tone}>{provider.platform}</NeonBadge>
          </div>
          <h2 className="mt-3 text-[14px] font-semibold leading-5 text-white">{provider.name}</h2>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">{provider.detail}</p>
        </div>
        <StatusBadge status={statusToTone(provider.status)} label={statusLabel(provider.status)} />
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <MiniMetric label={primaryLabel} value={primaryValue} tone={tone} />
        <MiniMetric label="impressoes" value={formatNumber(provider.impressions)} tone="zinc" />
        <MiniMetric label="CTR" value={formatPercent(provider.ctr)} tone="green" />
        <MiniMetric
          label={provider.kind === "paid" ? "CPC" : "posicao"}
          value={provider.kind === "paid" ? formatMoney(provider.cpc) : provider.averagePosition ? provider.averagePosition.toFixed(1) : "--"}
          tone="amber"
        />
      </div>
    </article>
  );
}

function TrafficStat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "cyan" | "amber" | "violet";
}) {
  const t = toneClass(tone);

  return (
    <div
      className="min-w-0 rounded-2xl p-3 sm:p-5"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500 sm:text-[10px]">{label}</p>
        <div className={cn("hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex", t.bg)}>
          <Icon className={cn("h-4 w-4", t.text)} />
        </div>
      </div>
      <p className={cn("mt-3 truncate font-mono text-[19px] font-bold leading-none sm:text-[26px]", t.text)}>{value}</p>
      <p className="mt-2 truncate text-[10px] text-slate-500 sm:text-[12px]">{detail}</p>
    </div>
  );
}

function MiniMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "green" | "cyan" | "amber" | "violet" | "zinc";
  value: string;
}) {
  const t = toneClass(tone);

  return (
    <div className="min-w-0 rounded-xl px-2 py-2" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <p className="truncate font-mono text-[8px] uppercase tracking-[0.11em] text-slate-500">{label}</p>
      <p className={cn("mt-1 truncate font-mono text-[13px] font-bold", t.text)}>{value}</p>
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

function campaignRow(campaign: TrafficCampaign) {
  return [
    <div key="campaign" className="min-w-0">
      <div className="truncate text-[13px] font-medium text-white">{campaign.name}</div>
      <div className="font-mono text-[10px] text-slate-600">{campaign.id}</div>
    </div>,
    <span key="source" className="font-mono text-[11px] text-slate-400">{campaign.platform}</span>,
    <span key="spend" className="font-mono text-[12px] text-emerald-400">{formatMoney(campaign.spend)}</span>,
    <span key="clicks" className="font-mono text-[12px] text-cyan-400">{formatNumber(campaign.clicks)}</span>,
    <span key="ctr" className="font-mono text-[12px] text-slate-300">{formatPercent(campaign.ctr)}</span>,
    <span key="conv" className="font-mono text-[12px] text-amber-300">{formatNumber(campaign.conversions)}</span>,
    <span key="cpc" className="font-mono text-[12px] text-slate-300">{formatMoney(campaign.cpc)}</span>,
  ];
}

function ensureSeries(series: { label: string; value: number }[]) {
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

function statusToTone(status: TrafficProviderStatus) {
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

function ratioPercent(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
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
