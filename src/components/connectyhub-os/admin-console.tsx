import Link from "next/link";
import type { AnalyticsReport } from "@/lib/analytics/platform-analytics";
import { PlatformAnalyticsPanel } from "./platform-analytics-panel";
import { DashboardDetails } from "./dashboard-details";
import { AdminHomeStart } from "./panel-home";
import { Check, DatabaseZap, KeyRound, LockKeyhole, ServerCog, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminDashboardOverview } from "@/lib/admin/dashboard-overview";
import type { StatusTone, Tone } from "@/lib/connectyhub-os-data";
import type { AdminMarketingBucket, AdminMarketingOverview } from "@/lib/tracking/admin-marketing";
import { cn } from "@/lib/utils";
import { AreaChartPanel, BarChartPanel } from "./charts";
import { ConnectyShell } from "./connecty-shell";
import { NeonBadge, Panel, TelemetryFeed, toneClass } from "./panel-primitives";

const infraIcons: Record<AdminDashboardOverview["infraStats"][number]["id"], LucideIcon> = {
  audit: LockKeyhole,
  database: DatabaseZap,
  keys: KeyRound,
  storage: ServerCog,
};

type StatTone = "good" | "warn" | "bad" | undefined;

export function AdminConsole({
  userLabel = "CEO_HUMAN_ADM",
  overview,
  marketing,
  analytics,
}: {
  userLabel?: string;
  overview: AdminDashboardOverview;
  marketing?: AdminMarketingOverview;
  analytics?: AnalyticsReport;
}) {
  const ceoTone = overview.ceoInsight.kpis.some((kpi) => kpi.tone === "amber" || kpi.tone === "rose") ? "amber" : "green";
  const healthScore = calculateHealthScore(overview.platformHealth);
  const platformStats: Array<{ label: string; value: string; detail: string; trend?: string; tone?: StatTone }> = [
    { label: "Clientes", value: overview.hero.totalClients, detail: `${overview.hero.activeClients} ativos`, trend: overview.hero.newClients7d },
    ...overview.metrics.slice(0, 3).map((metric) => ({
      label: metric.label,
      value: metric.value,
      detail: metric.detail,
      trend: metric.trend,
      tone: toneToStat(metric.tone),
    })),
  ];

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel}>
      <div className="ch-dashboard">
        <AdminHomeStart overview={overview} />

        {overview.warnings.length ? (
          <p className="ch-notice" data-tone="warn" role="status" title={overview.warnings.join("\n")}>
            {overview.warnings.length === 1 ? "1 indicador não pôde ser atualizado agora." : `${overview.warnings.length} indicadores não puderam ser atualizados agora.`} Os detalhes estão em “Detalhes operacionais”.
          </p>
        ) : null}

        <DashboardDetails>
          <section className="ch-report-card mb-4" aria-labelledby="ch-platform-title">
            <header>
              <h3 id="ch-platform-title">Indicadores da plataforma</h3>
              <span className="ch-meta">{overview.approvals.length ? `${overview.approvals.length} aprovação pendente` : "Sem aprovações pendentes"}</span>
            </header>
            <dl className="ch-stat-grid ch-stat-grid--4">
              {platformStats.map((stat) => (
                <div key={stat.label}>
                  <dt>{stat.label}</dt>
                  <dd data-tone={stat.tone}>{stat.value}</dd>
                  <p className="ch-stat-detail">{stat.detail}{stat.trend ? <span className="ch-stat-trend">{stat.trend}</span> : null}</p>
                </div>
              ))}
            </dl>
          </section>

          <div className="ch-report-row">
            <AreaChartPanel
              title="Receita recorrente"
              eyebrow="Faturamento mensal"
              value={overview.revenue.value}
              trend={overview.revenue.trend}
              data={overview.revenue.series}
              color="var(--ch-accent)"
              compact
            />
            <HealthCard score={healthScore} health={overview.platformHealth} />
          </div>

          <div className="ch-report-row ch-report-row--three">
            <BarChartPanel title="Novos clientes" eyebrow="Últimos 7 dias" data={overview.activationSeries} color="var(--ch-accent)" compact />
            <BarChartPanel title="Leads captados" eyebrow="Últimos 7 dias" data={overview.leadSeries} color="var(--ch-chart-2)" compact />
            <section id="clientes" className="ch-report-card" aria-labelledby="ch-wallet-title">
              <header><h3 id="ch-wallet-title">Carteira de clientes</h3><Link href="/admin/clientes" className="ch-link">Abrir clientes</Link></header>
              <dl className="ch-stat-grid">
                {overview.clientStatus.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd data-tone={toneToStat(item.tone)}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <div className="ch-report-row ch-report-row--even">
            {analytics ? <PlatformAnalyticsPanel report={analytics} compact /> : null}
            {marketing ? <MarketingCard marketing={marketing} /> : <CeoActivityCard items={overview.ceoActivity} />}
          </div>

          <div className="ch-report-row">
            <section id="agentes" className="ch-report-card" aria-labelledby="ch-internal-agents-title">
              <header><h3 id="ch-internal-agents-title">Agentes internos</h3><Link href="/admin/agentes" className="ch-link">Abrir agentes</Link></header>
              <AgentList agents={overview.internalAgents.slice(0, 4)} />
            </section>
            <section id="ceo" className="ch-report-card" aria-labelledby="ch-ceo-title">
              <header><h3 id="ch-ceo-title">Resumo executivo</h3><NeonBadge tone={ceoTone}>{overview.ceoInsight.autonomyLabel}</NeonBadge></header>
              <CeoBrief approvals={overview.approvals} insight={overview.ceoInsight} />
            </section>
          </div>

          <Panel
            id="auditoria"
            title="Detalhes operacionais"
            eyebrow="Auditoria, manutenção e infraestrutura"
            action={<NeonBadge tone={overview.warnings.length ? "amber" : "green"}>{overview.warnings.length ? `${overview.warnings.length} aviso${overview.warnings.length === 1 ? "" : "s"}` : "Sem avisos"}</NeonBadge>}
            compact
            collapsible
          >
            {overview.warnings.length ? (
              <ul className="ch-warning-list">{overview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            ) : null}
            <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_220px]">
              <MaintenanceGrid items={overview.maintenanceItems} />
              {overview.auditEvents.length ? (
                <TelemetryFeed items={overview.auditEvents.slice(0, 10)} />
              ) : (
                <p className="ch-meta py-6">Nenhum evento recente de auditoria.</p>
              )}
              <InfraList stats={overview.infraStats} />
            </div>
          </Panel>
        </DashboardDetails>
        <p className="ch-meta mt-3">Atualizado em {formatShortDate(overview.generatedAt)}.</p>
      </div>
    </ConnectyShell>
  );
}

function HealthCard({ health, score }: { health: AdminDashboardOverview["platformHealth"]; score: number }) {
  const tone = score >= 80 ? "green" : score >= 62 ? "amber" : "rose";
  const colors = toneClass(tone);

  return (
    <section className="ch-report-card" aria-labelledby="ch-health-title">
      <header><h3 id="ch-health-title">Saúde da plataforma</h3><Link href="/admin/infrastructure" className="ch-link">Infraestrutura</Link></header>
      <div className="ch-health">
        <div className="ch-health-dial" style={{ background: `conic-gradient(${colors.fill} ${score * 3.6}deg, var(--ch-surface-3) 0deg)` }}>
          <div><strong>{score}%</strong><span>operacional</span></div>
        </div>
        <ul className="ch-health-list">
          {health.slice(0, 5).map((item) => (
            <li key={item.name}><span className="truncate">{item.name}</span><StatusPill status={item.status} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AgentList({ agents }: { agents: AdminDashboardOverview["internalAgents"] }) {
  if (!agents.length) return <p className="ch-meta px-4 py-8 text-center">Nenhum agente interno registrado.</p>;

  return (
    <ul className="ch-lead-list">
      {agents.map((agent) => (
        <li key={agent.name}>
          <div className="min-w-0">
            <p className="truncate font-medium" style={{ color: "var(--ch-text)" }}>{agent.name}</p>
            <p className="ch-meta truncate">{agent.sector} · {agent.task}</p>
          </div>
          <StatusPill status={agent.status} />
        </li>
      ))}
    </ul>
  );
}

function CeoBrief({ approvals, insight }: { approvals: AdminDashboardOverview["approvals"]; insight: AdminDashboardOverview["ceoInsight"] }) {
  return (
    <div className="grid gap-3 p-4">
      <p className="text-[14px] font-medium leading-snug" style={{ color: "var(--ch-text)" }}>{insight.headline}</p>
      {insight.recommendations.length ? (
        <ul className="grid gap-2">
          {insight.recommendations.slice(0, 3).map((item) => (
            <li key={item} className="flex gap-2 text-[13.5px] leading-5" style={{ color: "var(--ch-muted)" }}>
              <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ch-success)" }} aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {approvals.length ? (
        <div id="aprovacoes" className="grid gap-2 border-t pt-3" style={{ borderColor: "var(--ch-border-soft)" }}>
          {approvals.slice(0, 2).map((approval) => (
            <div key={approval.id} className="flex items-center justify-between gap-2 text-[13.5px]">
              <span className="truncate" style={{ color: "var(--ch-text)" }}>{approval.client} · {approval.request}</span>
              <span className={cn("ch-meta shrink-0", toneClass(approval.risk).text)}>{approval.submitted}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CeoActivityCard({ items }: { items: AdminDashboardOverview["ceoActivity"] }) {
  return (
    <section className="ch-report-card" aria-labelledby="ch-ceo-activity-title">
      <header><h3 id="ch-ceo-activity-title">Decisões recentes</h3></header>
      {items.length ? (
        <ul className="ch-lead-list">
          {items.slice(0, 4).map((item) => (
            <li key={`${item.time}-${item.label}`}><span className="min-w-0 truncate">{item.label}</span><span className="ch-meta shrink-0">{item.time}</span></li>
          ))}
        </ul>
      ) : <p className="ch-meta px-4 py-8 text-center">Nenhuma decisão operacional registrada.</p>}
    </section>
  );
}

function MarketingCard({ marketing }: { marketing: AdminMarketingOverview }) {
  return (
    <section className="ch-report-card" aria-labelledby="ch-tracking-title">
      <header>
        <h3 id="ch-tracking-title">Uso da plataforma</h3>
        <NeonBadge tone={marketing.warnings.length ? "amber" : "green"}>{marketing.warnings.length ? "Revisar" : "Ao vivo"}</NeonBadge>
      </header>
      <dl className="ch-stat-grid ch-stat-grid--3">
        <div><dt>Visitantes</dt><dd>{formatNumber(marketing.platformVisitors)}</dd></div>
        <div><dt>Usuários no painel</dt><dd>{formatNumber(marketing.dashboardUsers)}</dd></div>
        <div><dt>Eventos</dt><dd>{formatNumber(marketing.totalEvents)}</dd></div>
      </dl>
      <div className="grid sm:grid-cols-2" style={{ borderTop: "1px solid var(--ch-border-soft)" }}>
        <BucketList title="Páginas mais vistas" items={marketing.topPages.slice(0, 3)} />
        <div className="p-4 sm:border-l" style={{ borderColor: "var(--ch-border-soft)" }}>
          <p className="ch-meta mb-2 font-medium">Sinais recentes</p>
          {marketing.recentEvents.length ? (
            <ul className="grid gap-2">
              {marketing.recentEvents.slice(0, 3).map((event) => (
                <li key={event.id} className="flex items-center gap-2 text-[13px]">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", toneClass(event.tone).dot)} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ch-text)" }}>{event.title}</span>
                  <span className="ch-meta shrink-0">{formatShortDate(event.occurredAt)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="ch-meta">Sem eventos recentes.</p>}
        </div>
      </div>
    </section>
  );
}

function BucketList({ title, items }: { title: string; items: AdminMarketingBucket[] }) {
  return (
    <div className="p-4">
      <p className="ch-meta mb-2 font-medium">{title}</p>
      {items.length ? (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate" style={{ color: "var(--ch-text)" }}>{item.label}</span>
              <span className="ch-meta shrink-0 tabular-nums">{formatNumber(item.value)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="ch-meta">Sem dados.</p>}
    </div>
  );
}

function MaintenanceGrid({ items }: { items: AdminDashboardOverview["maintenanceItems"] }) {
  return (
    <div id="manutencao" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
      {items.slice(0, 4).map((item) => (
        <div key={item.area} className="rounded-lg p-3" style={{ background: "var(--ch-surface-3)" }}>
          <div className="mb-1.5 flex items-center justify-between">
            <StatusPill status={item.status} />
            <Wrench className="h-3.5 w-3.5" style={{ color: "var(--ch-muted)" }} aria-hidden="true" />
          </div>
          <p className="text-[13.5px] font-medium" style={{ color: "var(--ch-text)" }}>{item.area}</p>
          <p className="ch-meta">{item.target}</p>
        </div>
      ))}
    </div>
  );
}

function InfraList({ stats }: { stats: AdminDashboardOverview["infraStats"] }) {
  return (
    <ul className="grid gap-2">
      {stats.map((stat) => {
        const Icon = infraIcons[stat.id];
        return (
          <li key={stat.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: "var(--ch-surface-3)" }}>
            <span className="flex min-w-0 items-center gap-2 text-[13px]" style={{ color: "var(--ch-muted)" }}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{stat.label}</span>
            </span>
            <span className="shrink-0 text-[13.5px] font-medium tabular-nums" style={{ color: "var(--ch-text)" }}>{stat.value}</span>
          </li>
        );
      })}
    </ul>
  );
}

const statusLabels: Record<StatusTone, { label: string; tone: Tone }> = {
  online: { label: "Ok", tone: "green" },
  warning: { label: "Atenção", tone: "amber" },
  critical: { label: "Crítico", tone: "rose" },
  idle: { label: "Em espera", tone: "zinc" },
};

function StatusPill({ status }: { status: StatusTone }) {
  const item = statusLabels[status] ?? statusLabels.idle;
  return <NeonBadge tone={item.tone}>{item.label}</NeonBadge>;
}

function toneToStat(tone: Tone): StatTone {
  if (tone === "green") return "good";
  if (tone === "amber") return "warn";
  if (tone === "rose") return "bad";
  return undefined;
}

function calculateHealthScore(health: AdminDashboardOverview["platformHealth"]) {
  if (!health.length) return 0;
  const total = health.reduce((sum, item) => sum + statusScore(item.status), 0);
  return Math.round(total / health.length);
}

function statusScore(status: StatusTone) {
  if (status === "online") return 100;
  if (status === "idle") return 76;
  if (status === "warning") return 56;
  return 24;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatShortDate(value: string | null) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
