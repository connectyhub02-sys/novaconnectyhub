import {
  Activity,
  Bell,
  Check,
  CircleDollarSign,
  Coins,
  DatabaseZap,
  Globe2,
  KeyRound,
  LockKeyhole,
  MapPin,
  MousePointerClick,
  ServerCog,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminDashboardOverview } from "@/lib/admin/dashboard-overview";
import type { Tone } from "@/lib/connectyhub-os-data";
import type { AdminMarketingBucket, AdminMarketingOverview } from "@/lib/tracking/admin-marketing";
import { cn } from "@/lib/utils";
import { AreaChartPanel, BarChartPanel } from "./charts";
import { ConnectyShell } from "./connecty-shell";
import {
  AgentCard,
  CommandButton,
  DataTable,
  HeroMetricCard,
  KpiStat,
  LoadingLine,
  MetricCard,
  NeonBadge,
  PageHeader,
  Panel,
  StatusBadge,
  StatusBar,
  TelemetryFeed,
  toneClass,
} from "./panel-primitives";

const metricIcons = [CircleDollarSign, Coins, Users, ShieldCheck];

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

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel}>
      <PageHeader
        eyebrow="ConnectyHub / Admin OS"
        title="CRM Dashboard"
        description="Acompanhe clientes, agentes, margem e operacao autonoma da plataforma."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-xl px-4 text-[12px] font-medium text-slate-400 transition hover:text-white"
              style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
            >
              Atualizado {formatShortDate(overview.generatedAt)}
            </button>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-xl px-4 text-[12px] font-medium text-white"
              style={{ background: "var(--ch-accent)", color: "#000" }}
            >
              Exportar dados
            </button>
          </div>
        }
      />

      <StatusBar items={overview.platformHealth.map((item) => ({ label: item.name, status: item.status }))} />

      {overview.warnings.length ? (
        <Panel
          title="Alertas de dados"
          eyebrow="consultas admin"
          action={<NeonBadge tone="amber">{overview.warnings.length}</NeonBadge>}
          className="mb-4"
        >
          <div className="grid gap-2 md:grid-cols-2">
            {overview.warnings.slice(0, 4).map((warning) => (
              <div
                key={warning}
                className="rounded-xl p-3 text-[11px] leading-4 text-amber-300"
                style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.22)" }}
              >
                {warning}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {marketing && <AdminMarketingPanel marketing={marketing} />}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <HeroMetricCard
          icon={Users}
          label="Total de Clientes"
          value={overview.hero.totalClients}
          sub1Label="Ativos"
          sub1Value={overview.hero.activeClients}
          sub2Label="Esta semana"
          sub2Value={overview.hero.newClients7d}
          series={overview.hero.series}
          accent="emerald"
        />
        <BarChartPanel
          title="Novos clientes"
          eyebrow="cadastros / 7 dias"
          data={overview.activationSeries}
          color="#34d399"
          filters={["1S", "1M", "3M"]}
        />
        <BarChartPanel
          title="Leads captados"
          eyebrow="clientes / 7 dias"
          data={overview.leadSeries}
          color="#22d3ee"
          filters={["Esta semana"]}
        />
      </div>

      <div className="mb-4">
        <AreaChartPanel
          title="Receita"
          eyebrow="faturamento mensal / MRR"
          value={overview.revenue.value}
          trend={overview.revenue.trend}
          data={overview.revenue.series}
          color="#34d399"
          filters={["1D", "1S", "1M", "6M", "1A", "TODOS"]}
        />
      </div>

      <div className="mb-4 grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-4">
        {overview.metrics.map((metric, index) => (
          <MetricCard key={metric.label} icon={metricIcons[index] ?? Activity} {...metric} />
        ))}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Gestao de Clientes" eyebrow="status / planos / saude">
          <div className="mb-4 flex gap-2">
            {["Status", "Planos", "Saude"].map((tab, index) => (
              <button
                key={tab}
                type="button"
                className="rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition"
                style={index === 0 ? {
                  background: "var(--ch-accent)",
                  color: "#000",
                } : {
                  background: "var(--ch-surface-2)",
                  border: "1px solid var(--ch-border)",
                  color: "var(--ch-muted)",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {overview.clientStatus.map((item) => (
              <div
                key={item.label}
                className="min-w-0 rounded-xl px-2 py-2 sm:p-3"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                <div className="truncate font-mono text-[8px] uppercase tracking-[0.11em] text-slate-500 sm:text-[9px]">{item.label}</div>
                <div className={cn("mt-1 truncate font-mono text-[15px] font-bold leading-none sm:text-[20px]", toneTextClass(item.tone))}>
                  {item.value}
                </div>
                <div className="font-mono text-[9px] text-slate-600">{item.detail}</div>
              </div>
            ))}
          </div>
        </Panel>

        <AreaChartPanel
          title="Taxa de Retencao"
          eyebrow="churn / renovacao"
          value={overview.retention.value}
          trend={overview.retention.trend}
          data={overview.retention.series}
          color="#22d3ee"
          filters={["PME", "Startups", "Enterprise"]}
        />

        <Panel title="Atividade CEO IA" eyebrow="decisoes / relatorios">
          <div className="divide-y divide-white/5">
            {overview.ceoActivity.length ? overview.ceoActivity.map((item) => (
              <div key={`${item.time}-${item.label}`} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-[10px]"
                    style={{ background: "rgba(52,211,153,0.12)", color: "#34d399" }}
                  >
                    {item.icon}
                  </div>
                  <span className="min-w-0 text-[12px] text-slate-300">{item.label}</span>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-slate-600">{item.time}</span>
              </div>
            )) : (
              <p className="py-4 text-[12px] text-slate-500">Nenhuma decisao operacional registrada ainda.</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="mb-4">
        <Panel
          id="clientes"
          title="Clientes / Planos / Margem"
          eyebrow="contas SaaS / faturamento"
          action={<CommandButton tone="cyan">Novo cliente</CommandButton>}
        >
          {overview.clients.length ? (
            <DataTable
              columns={["Cliente", "Plano", "MRR", "Creditos", "Agentes", "Status"]}
              rows={overview.clients.map((client) => [
                <div key="client">
                  <div className="text-[13px] font-medium text-white">{client.company}</div>
                  <div className="font-mono text-[10px] text-slate-600">{client.id} / {client.owner}</div>
                  <div className="font-mono text-[9px] text-slate-700">{client.health}</div>
                </div>,
                <span key="plan" className="font-mono text-[11px] text-slate-400">{client.plan}</span>,
                <span key="mrr" className="font-mono text-[12px] text-emerald-400">{client.mrr}</span>,
                <span key="credits" className="font-mono text-[11px] text-slate-500">{client.tokens}</span>,
                <span key="agents" className="font-mono text-[12px] text-slate-300">{client.agents}</span>,
                <StatusBadge key="status" status={client.status} />,
              ])}
            />
          ) : (
            <p className="py-6 text-[12px] text-slate-500">Nenhum cliente encontrado no banco.</p>
          )}
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel id="agentes" title="Agentes internos" eyebrow="empresa operada por IA">
          {overview.internalAgents.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {overview.internalAgents.map((agent) => (
                <AgentCard
                  key={agent.name}
                  name={agent.name}
                  role={`${agent.sector} / ${agent.role}`}
                  status={agent.status}
                  accuracy={agent.accuracy}
                  current={agent.task}
                  accent="green"
                />
              ))}
            </div>
          ) : (
            <p className="py-6 text-[12px] text-slate-500">Nenhum agente interno ou de cliente registrado ainda.</p>
          )}
        </Panel>

        <Panel id="ceo" title="CEO IA / Parecer" eyebrow="recomendacoes executivas">
          <NeonBadge tone={ceoTone}>{overview.ceoInsight.autonomyLabel}</NeonBadge>
          <p className="mt-3 text-[13px] font-semibold leading-snug text-white">{overview.ceoInsight.headline}</p>
          <div className="mt-4 space-y-2.5">
            {overview.ceoInsight.recommendations.map((item) => (
              <div key={item} className="flex gap-2.5">
                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                  <Check className="h-2.5 w-2.5 text-emerald-400" />
                </div>
                <span className="text-[12px] leading-4 text-slate-400">{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {overview.ceoInsight.kpis.map((kpi) => (
              <KpiStat key={kpi.label} label={kpi.label} value={kpi.value} tone={kpi.tone} />
            ))}
          </div>

          <div
            id="aprovacoes"
            className="mt-4 rounded-2xl"
            style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-600">controle humano</p>
                <p className="text-[13px] font-semibold text-white">Aprovacoes pendentes</p>
              </div>
              <NeonBadge tone={overview.approvals.length ? "amber" : "green"}>{overview.approvals.length}</NeonBadge>
            </div>
            <div className="divide-y divide-white/5 p-3">
              {overview.approvals.length ? overview.approvals.slice(0, 3).map((approval) => {
                const colors = toneClass(approval.risk);

                return (
                  <div key={approval.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-[9px] text-slate-600">{approval.id}</span>
                      <span className={cn("font-mono text-[9px]", colors.text)}>{approval.submitted}</span>
                    </div>
                    <div className="text-[12px] font-medium text-white">{approval.client}</div>
                    <p className="mt-0.5 text-[11px] text-slate-500">{approval.request}</p>
                  </div>
                );
              }) : (
                <p className="py-4 text-[12px] text-slate-500">Nenhuma aprovacao pendente.</p>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Panel id="manutencao" title="Sala de manutencao" eyebrow="APIs / webhooks / conexoes">
          <div className="grid gap-2 sm:grid-cols-2">
            {overview.maintenanceItems.map((item) => (
              <div
                key={item.area}
                className="rounded-xl p-3"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <StatusBadge status={item.status} />
                  <Wrench className="h-3.5 w-3.5 text-slate-700" />
                </div>
                <div className="text-[12px] font-medium text-white">{item.area}</div>
                <div className="mt-0.5 font-mono text-[9px] text-cyan-500">{item.target}</div>
                <p className="mt-2 text-[11px] leading-4 text-slate-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel id="auditoria" title="Auditoria viva" eyebrow="logs / custos / eventos">
          <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
            {overview.auditEvents.length ? (
              <TelemetryFeed items={overview.auditEvents} />
            ) : (
              <p className="py-6 text-[12px] text-slate-500">Nenhum evento recente de auditoria.</p>
            )}
            <div className="space-y-2">
              {overview.infraStats.map((stat) => {
                const Icon = infraIcons[stat.id];

                return (
                  <div
                    key={stat.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-slate-600" />
                      <span className="text-[11px] text-slate-400">{stat.label}</span>
                    </div>
                    <span className="font-mono text-[12px] text-white">{stat.value}</span>
                  </div>
                );
              })}
              <div className="mt-2 rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
                <LoadingLine label="Calculando margem operacional" />
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </ConnectyShell>
  );
}

function AdminMarketingPanel({ marketing }: { marketing: AdminMarketingOverview }) {
  return (
    <Panel
      title="Marketing e rastreamento"
      eyebrow="plataforma / clientes / leads"
      action={
        <NeonBadge tone={marketing.warnings.length ? "amber" : "green"}>
          {marketing.warnings.length ? "Aguardando dados" : "Ao vivo"}
        </NeonBadge>
      }
      className="mb-4"
    >
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:grid-cols-3">
          <MarketingStat icon={Globe2} label="Visitantes ConnectyHub" value={marketing.platformVisitors} tone="cyan" />
          <MarketingStat icon={Users} label="Usuarios no painel" value={marketing.dashboardUsers} tone="green" />
          <MarketingStat icon={Activity} label="Eventos coletados" value={marketing.totalEvents} tone="zinc" />
          <MarketingStat icon={MousePointerClick} label="Cliques rastreados" value={marketing.trackedLinkClicks} tone="cyan" />
          <MarketingStat icon={MapPin} label="GPS autorizado" value={marketing.gpsGranted} tone="green" />
          <MarketingStat icon={Bell} label="Push autorizado" value={marketing.pushGranted} tone="amber" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MarketingBucketList title="Top paginas" items={marketing.topPages} />
          <MarketingBucketList title="Dispositivos" items={marketing.topDevices} />
          <MarketingBucketList title="Navegadores" items={marketing.topBrowsers} />
          <MarketingBucketList title="Paises" items={marketing.topCountries} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
        <div
          className="rounded-xl p-3"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Eventos recentes</p>
            <span className="font-mono text-[9px] uppercase tracking-wide text-slate-600">
              {formatNumber(marketing.clientLeadEvents)} eventos dos clientes
            </span>
          </div>
          <div className="divide-y divide-white/5">
            {marketing.recentEvents.length ? marketing.recentEvents.map((event) => {
              const tone = toneClass(event.tone);

              return (
                <div key={event.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                      <p className="truncate text-[12px] font-medium text-white">{event.title}</p>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-500">{event.detail}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[9px] text-slate-600">
                    {formatShortDate(event.occurredAt)}
                  </span>
                </div>
              );
            }) : (
              <p className="py-4 text-[12px] text-slate-500">Nenhum evento de marketing registrado ainda.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 lg:block lg:space-y-3">
          <KpiStat label="Eventos clientes" value={formatNumber(marketing.clientLeadEvents)} tone="cyan" />
          <KpiStat label="Push conhecido" value={formatNumber(marketing.pushKnown)} tone="amber" />
          <KpiStat label="GPS negado" value={formatNumber(marketing.gpsDenied)} tone="rose" />
          {marketing.warnings.map((warning) => (
            <div
              key={warning}
              className="col-span-3 rounded-xl p-3 text-[11px] leading-4 text-amber-300 lg:col-auto"
              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.22)" }}
            >
              {warning}
            </div>
          ))}
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
      className="min-w-0 rounded-xl px-2 py-2 sm:p-3"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="mb-1 flex min-w-0 items-center justify-between gap-1.5 sm:mb-2 sm:gap-3">
        <p className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.11em] text-slate-500 sm:text-[9px] sm:tracking-wide">{label}</p>
        <div className={cn("hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:flex", colors.bg)}>
          <Icon className={cn("h-3.5 w-3.5", colors.text)} />
        </div>
      </div>
      <p className={cn("truncate font-mono text-[15px] font-bold leading-none sm:text-[22px]", colors.text)}>{formatNumber(value)}</p>
    </div>
  );
}

function MarketingBucketList({ title, items }: { title: string; items: AdminMarketingBucket[] }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="space-y-2">
        {items.length ? items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3">
            <span className="truncate text-[11px] text-slate-400">{item.label}</span>
            <span className="shrink-0 font-mono text-[11px] text-white">{formatNumber(item.value)}</span>
          </div>
        )) : (
          <span className="text-[11px] text-slate-600">Sem dados.</span>
        )}
      </div>
    </div>
  );
}

function toneTextClass(tone: Tone) {
  if (tone === "green") return "text-emerald-400";
  if (tone === "amber") return "text-amber-400";
  if (tone === "cyan") return "text-cyan-400";
  if (tone === "rose") return "text-rose-400";
  if (tone === "violet") return "text-violet-400";
  return "text-slate-400";
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
