import {
  Activity,
  Check,
  CircleDollarSign,
  Coins,
  DatabaseZap,
  Globe2,
  KeyRound,
  LockKeyhole,
  ServerCog,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminDashboardOverview } from "@/lib/admin/dashboard-overview";
import type { StatusTone, Tone } from "@/lib/connectyhub-os-data";
import type { AdminMarketingBucket, AdminMarketingOverview } from "@/lib/tracking/admin-marketing";
import { cn } from "@/lib/utils";
import { AreaChartPanel, BarChartPanel } from "./charts";
import { ConnectyShell } from "./connecty-shell";
import {
  CommandButton,
  KpiStat,
  NeonBadge,
  PageHeader,
  Panel,
  TelemetryFeed,
  toneClass,
} from "./panel-primitives";

const metricIcons = [CircleDollarSign, ShieldCheck, Coins];

const infraIcons: Record<AdminDashboardOverview["infraStats"][number]["id"], LucideIcon> = {
  audit: LockKeyhole,
  database: DatabaseZap,
  keys: KeyRound,
  storage: ServerCog,
};

export function AdminConsole({
  userLabel = "CEO_HUMAN_ADM",
  overview,
  marketing,
}: {
  userLabel?: string;
  overview: AdminDashboardOverview;
  marketing?: AdminMarketingOverview;
}) {
  const ceoTone = overview.ceoInsight.kpis.some((kpi) => kpi.tone === "amber" || kpi.tone === "rose")
    ? "amber"
    : "green";
  const healthScore = calculateHealthScore(overview.platformHealth);
  const topMetrics = [
    {
      icon: Users,
      label: "Clientes",
      value: overview.hero.totalClients,
      detail: `${overview.hero.activeClients} ativos`,
      trend: overview.hero.newClients7d,
      tone: "green" as Tone,
      series: overview.hero.series,
    },
    ...overview.metrics.slice(0, 3).map((metric, index) => ({
      ...metric,
      icon: metricIcons[index] ?? Activity,
    })),
  ];

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel}>
      <PageHeader
        eyebrow="ConnectyHub / Admin OS"
        title="Dashboard executivo"
        description="Visao curta da operacao, clientes, receita e canais criticos."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-xl px-3 text-[11px] font-medium text-slate-500 transition hover:text-blue-700"
              style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
            >
              Atualizado {formatShortDate(overview.generatedAt)}
            </button>
            <button
              type="button"
              title={overview.warnings.join("\n")}
              className="flex h-8 items-center gap-2 rounded-xl px-3 text-[11px] font-medium text-slate-500 transition hover:text-blue-700"
              style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
            >
              Base {overview.warnings.length ? `${overview.warnings.length} aviso` : "ok"}
            </button>
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-xl px-3 text-[11px] font-medium"
              style={{ background: "var(--ch-accent)", color: "#ffffff" }}
            >
              Exportar dados
            </button>
          </div>
        }
      />

      <div className="mb-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_270px]">
        <section
          className="rounded-2xl p-3"
          style={{ background: "var(--ch-panel)", border: "1px solid var(--ch-border-strong)" }}
        >
          <div className="mb-3 flex flex-col justify-between gap-2 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">operacao / hoje</p>
              <h2 className="mt-1 text-[20px] font-semibold leading-tight" style={{ color: "var(--ch-text)" }}>ConnectyHub OS</h2>
              <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-slate-500">
                Receita, clientes, creditos e riscos em uma leitura curta.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <NeonBadge tone={overview.warnings.length ? "amber" : "green"}>
                {overview.warnings.length ? "base revisada" : "dados reais"}
              </NeonBadge>
              <NeonBadge tone={overview.approvals.length ? "amber" : "green"}>
                {overview.approvals.length} aprovacao
              </NeonBadge>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {topMetrics.map((metric) => (
              <ExecutiveMetric key={metric.label} {...metric} />
            ))}
          </div>
        </section>

        <HealthDialCard
          score={healthScore}
          health={overview.platformHealth}
          warnings={overview.warnings}
        />
      </div>

      <div className="mb-3 grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_340px]">
        <AreaChartPanel
          title="Receita"
          eyebrow="faturamento mensal / MRR"
          value={overview.revenue.value}
          trend={overview.revenue.trend}
          data={overview.revenue.series}
          color="var(--ch-chart-5)"
          filters={["6M", "1A"]}
          compact
        />

        <Panel
          id="clientes"
          title="Clientes recentes"
          eyebrow="contas SaaS"
          action={<CommandButton tone="cyan">Abrir clientes</CommandButton>}
          compact
        >
          <ClientStatusGrid items={overview.clientStatus} />
          <ClientList clients={overview.clients.slice(0, 4)} />
        </Panel>
      </div>

      <div className="mb-3 grid gap-3 xl:grid-cols-3">
        <BarChartPanel
          title="Novos clientes"
          eyebrow="cadastros / 7 dias"
          data={overview.activationSeries}
          color="var(--ch-chart-1)"
          filters={["7D"]}
          compact
        />
        <BarChartPanel
          title="Leads captados"
          eyebrow="clientes / 7 dias"
          data={overview.leadSeries}
          color="var(--ch-chart-2)"
          filters={["7D"]}
          compact
        />
        {marketing ? (
          <AdminMarketingPanel marketing={marketing} />
        ) : (
          <CeoActivityPanel items={overview.ceoActivity} />
        )}
      </div>

      <div className="mb-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Panel id="agentes" title="Agentes internos" eyebrow="operacao IA" compact>
          <CompactAgentList agents={overview.internalAgents.slice(0, 4)} />
        </Panel>

        <Panel id="ceo" title="CEO IA" eyebrow="parecer executivo" compact>
          <CeoBrief
            approvals={overview.approvals}
            insight={overview.ceoInsight}
            tone={ceoTone}
          />
        </Panel>
      </div>

      <Panel
        id="auditoria"
        title="Detalhes operacionais"
        eyebrow="auditoria / manutencao"
        action={<NeonBadge tone={overview.warnings.length ? "amber" : "green"}>{overview.warnings.length} aviso</NeonBadge>}
        compact
        collapsible
      >
        <div className="grid gap-3 xl:grid-cols-[320px_1fr_200px]">
          <MaintenanceGrid items={overview.maintenanceItems} />
          {overview.auditEvents.length ? (
            <TelemetryFeed items={overview.auditEvents.slice(0, 10)} />
          ) : (
            <p className="py-6 text-[12px] text-slate-500">Nenhum evento recente de auditoria.</p>
          )}
          <InfraList stats={overview.infraStats} />
        </div>
      </Panel>
    </ConnectyShell>
  );
}

function ExecutiveMetric({
  detail,
  icon: Icon,
  label,
  series,
  tone,
  trend,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  series: number[];
  tone: Tone;
  trend: string;
  value: string;
}) {
  const colors = toneClass(tone);

  return (
    <div
      className="min-w-0 rounded-xl p-2.5"
      style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className={cn("mt-1.5 truncate font-mono text-[20px] font-bold leading-none", colors.text)}>{value}</p>
        </div>
        <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", colors.bg)}>
          <Icon className={cn("h-3.5 w-3.5", colors.text)} />
        </div>
      </div>
      <MetricMicroBars data={series} tone={tone} />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-slate-500">{detail}</span>
        <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[8px]", colors.bg, colors.text)}>{trend}</span>
      </div>
    </div>
  );
}

function MetricMicroBars({ data, tone }: { data: number[]; tone: Tone }) {
  const colors = toneClass(tone);
  const max = Math.max(...data, 1);

  return (
    <div className="mt-2 flex h-5 items-end gap-0.5">
      {data.slice(-10).map((value, index) => (
        <span
          key={`${value}-${index}`}
          className={cn("w-full rounded-t-sm", colors.dot)}
          style={{ height: `${Math.max(12, (value / max) * 100)}%`, opacity: 0.28 + (index / Math.max(data.length - 1, 1)) * 0.55 }}
        />
      ))}
    </div>
  );
}

function HealthDialCard({
  health,
  score,
  warnings,
}: {
  health: AdminDashboardOverview["platformHealth"];
  score: number;
  warnings: string[];
}) {
  const tone = score >= 80 ? "green" : score >= 62 ? "amber" : "rose";
  const colors = toneClass(tone);

  return (
    <section
      className="rounded-2xl p-3"
      style={{ background: "var(--ch-panel)", border: "1px solid var(--ch-border-strong)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">saude</p>
          <p className="mt-0.5 text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>Plataforma</p>
        </div>
        <NeonBadge tone={tone}>{score}%</NeonBadge>
      </div>

      <div className="my-3 grid place-items-center">
        <div
          className="grid h-28 w-28 place-items-center rounded-full"
          style={{
            background: `conic-gradient(${colors.fill} ${score * 3.6}deg, rgba(148,163,184,0.16) 0deg)`,
          }}
        >
          <div
            className="grid h-[84px] w-[84px] place-items-center rounded-full text-center"
            style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
          >
            <div>
              <p className="font-mono text-[22px] font-bold leading-none" style={{ color: colors.fill }}>{score}%</p>
              <p className="mt-0.5 text-[9px] text-slate-500">operacional</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {health.slice(0, 4).map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] text-slate-400">{item.name}</span>
            <TinyStatusPill status={item.status} />
          </div>
        ))}
      </div>

      {warnings.length ? (
        <div
          className="mt-2 rounded-lg px-2 py-1.5 text-[10px] text-amber-300"
          title={warnings.join("\n")}
          style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.16)" }}
        >
          {warnings.length} aviso interno agrupado.
        </div>
      ) : null}
    </section>
  );
}

function ClientStatusGrid({ items }: { items: AdminDashboardOverview["clientStatus"] }) {
  return (
    <div className="mb-2 grid grid-cols-4 gap-1.5">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-lg px-2 py-1.5"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <p className="truncate font-mono text-[7px] uppercase tracking-[0.1em] text-slate-500">{item.label}</p>
          <p className={cn("mt-0.5 truncate font-mono text-[14px] font-bold leading-none", toneTextClass(item.tone))}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function ClientList({ clients }: { clients: AdminDashboardOverview["clients"] }) {
  if (!clients.length) {
    return <p className="py-8 text-[12px] text-slate-500">Nenhum cliente encontrado.</p>;
  }

  return (
    <div className="divide-y divide-blue-100">
      {clients.map((client) => (
        <div key={`${client.id}-${client.company}`} className="grid grid-cols-[1fr_auto] gap-2 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{client.company}</p>
            <p className="truncate font-mono text-[9px] text-slate-600">{client.owner}</p>
            <p className="truncate text-[9px] text-slate-600">{client.plan} / {client.tokens}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <TinyStatusPill status={client.status} />
            <span className="font-mono text-[10px]" style={{ color: "var(--ch-success)" }}>{client.mrr}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompactAgentList({ agents }: { agents: AdminDashboardOverview["internalAgents"] }) {
  if (!agents.length) {
    return <p className="py-8 text-[12px] text-slate-500">Nenhum agente interno registrado.</p>;
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {agents.map((agent) => (
        <div
          key={agent.name}
          className="rounded-xl p-2.5"
          style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{agent.name}</p>
              <p className="truncate font-mono text-[8px] uppercase tracking-wide text-slate-500">{agent.sector} / {agent.role}</p>
            </div>
            <TinyStatusPill status={agent.status} />
          </div>
          <p className="line-clamp-1 text-[10px] leading-4 text-slate-500">{agent.task}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--ch-border)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(agent.accuracy, 100))}%`, background: "var(--ch-ai-cyan)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CeoBrief({
  approvals,
  insight,
  tone,
}: {
  approvals: AdminDashboardOverview["approvals"];
  insight: AdminDashboardOverview["ceoInsight"];
  tone: Tone;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <NeonBadge tone={tone}>{insight.autonomyLabel}</NeonBadge>
        <NeonBadge tone={approvals.length ? "amber" : "green"}>{approvals.length} pendente</NeonBadge>
      </div>
      <p className="mt-2 text-[12px] font-semibold leading-snug" style={{ color: "var(--ch-text)" }}>{insight.headline}</p>
      <div className="mt-2 space-y-1.5">
        {insight.recommendations.slice(0, 2).map((item) => (
          <div key={item} className="flex gap-2">
            <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-2.5 w-2.5 text-emerald-400" />
            </div>
            <span className="line-clamp-1 text-[10px] leading-4 text-slate-400">{item}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {insight.kpis.map((kpi) => (
          <KpiStat key={kpi.label} label={kpi.label} value={kpi.value} tone={kpi.tone} />
        ))}
      </div>
      <div id="aprovacoes" className="mt-2 divide-y divide-blue-100">
        {approvals.slice(0, 2).map((approval) => {
          const colors = toneClass(approval.risk);

          return (
            <div key={approval.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-medium" style={{ color: "var(--ch-text)" }}>{approval.client}</p>
                <span className={cn("font-mono text-[9px]", colors.text)}>{approval.submitted}</span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">{approval.request}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CeoActivityPanel({ items }: { items: AdminDashboardOverview["ceoActivity"] }) {
  return (
    <Panel title="Atividade CEO IA" eyebrow="decisoes / relatorios" compact>
      <div className="divide-y divide-blue-100">
        {items.length ? items.slice(0, 4).map((item) => (
          <div key={`${item.time}-${item.label}`} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
            <span className="min-w-0 truncate text-[11px] text-slate-500">{item.label}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate-600">{item.time}</span>
          </div>
        )) : (
          <p className="py-4 text-[12px] text-slate-500">Nenhuma decisao operacional registrada.</p>
        )}
      </div>
    </Panel>
  );
}

function MaintenanceGrid({ items }: { items: AdminDashboardOverview["maintenanceItems"] }) {
  return (
    <div id="manutencao" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
      {items.slice(0, 4).map((item) => (
        <div
          key={item.area}
          className="rounded-xl p-2.5"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <TinyStatusPill status={item.status} />
            <Wrench className="h-3.5 w-3.5 text-slate-700" />
          </div>
          <p className="text-[11px] font-medium" style={{ color: "var(--ch-text)" }}>{item.area}</p>
          <p className="mt-0.5 font-mono text-[9px]" style={{ color: "var(--ch-info)" }}>{item.target}</p>
        </div>
      ))}
    </div>
  );
}

function InfraList({ stats }: { stats: AdminDashboardOverview["infraStats"] }) {
  return (
    <div className="space-y-2">
      {stats.map((stat) => {
        const Icon = infraIcons[stat.id];

        return (
          <div
            key={stat.id}
            className="flex items-center justify-between rounded-xl px-2.5 py-2"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-slate-600" />
              <span className="truncate text-[11px] text-slate-400">{stat.label}</span>
            </div>
            <span className="shrink-0 font-mono text-[12px]" style={{ color: "var(--ch-text)" }}>{stat.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function TinyStatusPill({ status }: { status: StatusTone }) {
  const label = status === "online"
    ? "ok"
    : status === "warning"
      ? "atenção"
      : status === "critical"
        ? "crítico"
        : "standby";
  const tone = status === "online"
    ? "green"
    : status === "warning"
      ? "amber"
      : status === "critical"
        ? "rose"
        : "zinc";
  const colors = toneClass(tone);

  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[8px] uppercase", colors.bg, colors.text)}>
      {label}
    </span>
  );
}

function calculateHealthScore(health: AdminDashboardOverview["platformHealth"]) {
  if (!health.length) {
    return 0;
  }

  const total = health.reduce((sum, item) => sum + statusScore(item.status), 0);
  return Math.round(total / health.length);
}

function statusScore(status: StatusTone) {
  if (status === "online") return 100;
  if (status === "idle") return 76;
  if (status === "warning") return 56;
  return 24;
}

function AdminMarketingPanel({ marketing }: { marketing: AdminMarketingOverview }) {
  return (
    <Panel
      title="Rastreamento"
      eyebrow="marketing"
      action={
        <NeonBadge tone={marketing.warnings.length ? "amber" : "green"}>
          {marketing.warnings.length ? "revisar" : "ao vivo"}
        </NeonBadge>
      }
      compact
    >
      <div className="grid grid-cols-3 gap-1.5">
        <MarketingStat icon={Globe2} label="Visitantes" value={marketing.platformVisitors} tone="cyan" />
        <MarketingStat icon={Users} label="Usuarios" value={marketing.dashboardUsers} tone="green" />
        <MarketingStat icon={Activity} label="Eventos" value={marketing.totalEvents} tone="zinc" />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <MarketingBucketList title="Top paginas" items={marketing.topPages.slice(0, 3)} />
        <div
          className="rounded-xl p-2.5"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <p className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">Sinais</p>
          <div className="divide-y divide-blue-100">
            {marketing.recentEvents.length ? marketing.recentEvents.slice(0, 3).map((event) => {
              const tone = toneClass(event.tone);

              return (
                <div key={event.id} className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                  <p className="min-w-0 flex-1 truncate text-[10px] text-slate-500">{event.title}</p>
                  <span className="shrink-0 font-mono text-[8px] text-slate-600">
                    {formatShortDate(event.occurredAt)}
                  </span>
                </div>
              );
            }) : (
              <p className="py-4 text-[12px] text-slate-500">Sem eventos recentes.</p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function MarketingStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: Tone;
}) {
  const colors = toneClass(tone);

  return (
    <div
      className="min-w-0 rounded-lg px-2 py-1.5"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="mb-1 flex min-w-0 items-center justify-between gap-1.5">
        <p className="min-w-0 truncate font-mono text-[7px] uppercase tracking-[0.1em] text-slate-500 sm:text-[8px]">{label}</p>
        <div className={cn("hidden h-6 w-6 shrink-0 items-center justify-center rounded-md sm:flex", colors.bg)}>
          <Icon className={cn("h-3 w-3", colors.text)} />
        </div>
      </div>
      <p className={cn("truncate font-mono text-[15px] font-bold leading-none sm:text-[18px]", colors.text)}>{formatNumber(value)}</p>
    </div>
  );
}

function MarketingBucketList({ title, items }: { title: string; items: AdminMarketingBucket[] }) {
  return (
    <div
      className="rounded-xl p-2.5"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <p className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <div className="space-y-1.5">
        {items.length ? items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] text-slate-400">{item.label}</span>
            <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--ch-text)" }}>{formatNumber(item.value)}</span>
          </div>
        )) : (
          <span className="text-[11px] text-slate-600">Sem dados.</span>
        )}
      </div>
    </div>
  );
}

function toneTextClass(tone: Tone) {
  if (tone === "green") return "text-emerald-700";
  if (tone === "amber") return "text-amber-700";
  if (tone === "cyan") return "text-blue-700";
  if (tone === "rose") return "text-rose-700";
  if (tone === "violet") return "text-indigo-700";
  return "text-slate-600";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatShortDate(value: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
