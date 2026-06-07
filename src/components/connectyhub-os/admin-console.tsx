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
import {
  adminMetrics,
  approvals,
  auditEvents,
  clients,
  internalAgents,
  maintenanceItems,
  platformHealth,
} from "@/lib/connectyhub-os-data";
import { AreaChartPanel, BarChartPanel } from "./charts";
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
import { ConnectyShell } from "./connecty-shell";
import { cn } from "@/lib/utils";
import type { AdminMarketingOverview, AdminMarketingBucket } from "@/lib/tracking/admin-marketing";

const metricIcons = [CircleDollarSign, Coins, Users, ShieldCheck];

const revenueData = [
  { label: "Mar", value: 28000 },
  { label: "Abr", value: 31000 },
  { label: "Mai", value: 29500 },
  { label: "Jun", value: 38000 },
  { label: "Jul", value: 42000 },
  { label: "Ago", value: 39000 },
  { label: "Set", value: 47200 },
];

const clientsBarData = [
  { label: "Seg", value: 8 },
  { label: "Ter", value: 12 },
  { label: "Qua", value: 7 },
  { label: "Qui", value: 15 },
  { label: "Sex", value: 11 },
  { label: "Sáb", value: 4 },
  { label: "Dom", value: 6 },
];

export function AdminConsole({
  userLabel = "CEO_HUMAN_ADM",
  marketing,
}: {
  userLabel?: string;
  marketing?: AdminMarketingOverview;
}) {
  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel}>

      <PageHeader
        eyebrow="ConnectyHub · Admin OS"
        title="CRM Dashboard"
        description="Acompanhe clientes, agentes, margem e operação autônoma da plataforma."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-xl px-4 text-[12px] font-medium text-slate-400 transition hover:text-white"
              style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
            >
              Esta semana ↓
            </button>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-xl px-4 text-[12px] font-medium text-white"
              style={{ background: "var(--ch-accent)", color: "#000" }}
            >
              ↓ Exportar dados
            </button>
          </div>
        }
      />

      {/* Status bar */}
      <StatusBar items={platformHealth.map((h) => ({ label: h.name, status: h.status }))} />

      {marketing && <AdminMarketingPanel marketing={marketing} />}

      {/* Top row: Hero metric + bar chart + leads bar */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <HeroMetricCard
          icon={Users}
          label="Total de Clientes"
          value="142"
          sub1Label="Ativos"
          sub1Value="128"
          sub2Label="Esta semana"
          sub2Value="+11"
          series={adminMetrics[2]?.series ?? [60, 75, 80, 95, 100, 110, 128]}
          accent="emerald"
        />
        <BarChartPanel
          title="Tempo médio de ativação"
          eyebrow="onboarding · dias"
          data={clientsBarData}
          color="#34d399"
          filters={["1S", "1M", "3M"]}
        />
        <BarChartPanel
          title="Leads por vendas"
          eyebrow="leads · conversão"
          data={[
            { label: "Seg", value: 32 },
            { label: "Ter", value: 48 },
            { label: "Qua", value: 27 },
            { label: "Qui", value: 55 },
            { label: "Sex", value: 41 },
            { label: "Sáb", value: 18 },
            { label: "Dom", value: 22 },
          ]}
          color="#22d3ee"
          filters={["Esta semana ↓"]}
        />
      </div>

      {/* Revenue area chart */}
      <div className="mb-4">
        <AreaChartPanel
          title="Receita"
          eyebrow="faturamento mensal · MRR"
          value="R$ 47.200"
          trend="+22%"
          data={revenueData}
          color="#34d399"
          filters={["1D", "1S", "1M", "6M", "1A", "TODOS"]}
        />
      </div>

      {/* Metrics row */}
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {adminMetrics.map((metric, i) => (
          <MetricCard key={metric.label} icon={metricIcons[i]} {...metric} />
        ))}
      </div>

      {/* Leads management + Retention + Team Activity */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        {/* Leads management */}
        <Panel title="Gestão de Clientes" eyebrow="status · planos · saúde">
          <div className="mb-4 flex gap-2">
            {["Status", "Planos", "Saúde"].map((tab, i) => (
              <button
                key={tab}
                type="button"
                className="rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition"
                style={i === 0 ? {
                  background: "var(--ch-accent)",
                  color:      "#000",
                } : {
                  background: "var(--ch-surface-2)",
                  border:     "1px solid var(--ch-border)",
                  color:      "var(--ch-muted)",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Ativos",    "128", "green"],
              ["Em setup",  "14",  "amber"],
              ["Inativos",  "0",   "zinc"],
              ["Convertidos","47", "cyan"],
            ].map(([label, value, tone]) => (
              <div
                key={label}
                className="rounded-xl p-3"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                <div className="font-mono text-[9px] text-slate-500">{label}</div>
                <div className={cn(
                  "mt-1 font-mono text-[20px] font-bold",
                  tone === "green" ? "text-emerald-400" :
                  tone === "amber" ? "text-amber-400" :
                  tone === "cyan"  ? "text-cyan-400" : "text-slate-400"
                )}>{value}</div>
                <div className="font-mono text-[9px] text-slate-600">leads</div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Retention */}
        <AreaChartPanel
          title="Taxa de Retenção"
          eyebrow="churn · renovação"
          value="94.2%"
          trend="+3.1%"
          data={[
            { label: "Jan", value: 88 },
            { label: "Fev", value: 89 },
            { label: "Mar", value: 91 },
            { label: "Abr", value: 90 },
            { label: "Mai", value: 92 },
            { label: "Jun", value: 93 },
            { label: "Jul", value: 94.2 },
          ]}
          color="#22d3ee"
          filters={["PME", "Startups", "Enterprise"]}
        />

        {/* CEO activity */}
        <Panel title="Atividade CEO IA" eyebrow="decisões · relatórios">
          <div className="divide-y divide-white/5">
            {[
              { label: "Plano Growth otimizado",       time: "14:00", icon: "◈" },
              { label: "Relatório de margem enviado",   time: "11:30", icon: "◆" },
              { label: "3 upgrades aprovados",          time: "09:45", icon: "▲" },
              { label: "Alerta de token disparado",     time: "08:20", icon: "⚡" },
            ].map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2.5">
                  <div
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px]"
                    style={{ background: "rgba(52,211,153,0.12)", color: "#34d399" }}
                  >
                    {item.icon}
                  </div>
                  <span className="text-[12px] text-slate-300">{item.label}</span>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-slate-600">{item.time}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Clients table */}
      <div className="mb-4">
        <Panel
          id="clientes"
          title="Clientes · Planos · Margem"
          eyebrow="contas SaaS · faturamento"
          action={<CommandButton tone="cyan">Novo cliente</CommandButton>}
        >
          <DataTable
            columns={["Cliente", "Plano", "MRR", "Tokens", "Agentes", "Status"]}
            rows={clients.map((c) => [
              <div key="n">
                <div className="text-[13px] font-medium text-white">{c.company}</div>
                <div className="font-mono text-[10px] text-slate-600">{c.id} · {c.owner}</div>
              </div>,
              <span key="p" className="font-mono text-[11px] text-slate-400">{c.plan}</span>,
              <span key="m" className="font-mono text-[12px] text-emerald-400">{c.mrr}</span>,
              <span key="t" className="font-mono text-[11px] text-slate-500">{c.tokens}</span>,
              <span key="a" className="font-mono text-[12px] text-slate-300">{c.agents}</span>,
              <StatusBadge key="s" status={c.status} />,
            ])}
          />
        </Panel>
      </div>

      {/* Agents + CEO report */}
      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel id="agentes" title="Agentes internos" eyebrow="empresa operada por IA">
          <div className="grid gap-3 sm:grid-cols-2">
            {internalAgents.map((agent) => (
              <AgentCard
                key={agent.name}
                name={agent.name}
                role={`${agent.sector} · ${agent.role}`}
                status={agent.status}
                accuracy={agent.accuracy}
                current={agent.task}
                accent="green"
              />
            ))}
          </div>
        </Panel>

        <Panel title="CEO IA · Parecer" eyebrow="recomendações executivas">
          <NeonBadge tone="green">Autonomia: 42%</NeonBadge>
          <p className="mt-3 text-[13px] font-semibold leading-snug text-white">
            A plataforma está pronta para escalar, mas precisa de aprovação humana em gastos.
          </p>
          <div className="mt-4 space-y-2.5">
            {[
              "Subir budget em campanhas com lead score &gt; 78.",
              "Alertar clientes que atingirem 85% dos tokens.",
              "Oferecer upgrade para contas com ROAS &gt; 4x.",
            ].map((item) => (
              <div key={item} className="flex gap-2.5">
                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                  <Check className="h-2.5 w-2.5 text-emerald-400" />
                </div>
                <span className="text-[12px] leading-4 text-slate-400" dangerouslySetInnerHTML={{ __html: item }} />
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <KpiStat label="Economia IA" value="R$7.8k" tone="green" />
            <KpiStat label="Riscos"      value="23"     tone="amber" />
            <KpiStat label="Upgrades"    value="11"     tone="cyan"  />
          </div>
          <Panel
            id="aprovacoes"
            title="Aprovações pendentes"
            eyebrow=""
            action={<NeonBadge tone="amber">17</NeonBadge>}
            className="mt-4"
          >
            <div className="divide-y divide-white/5">
              {approvals.slice(0, 3).map((a) => {
                const t = toneClass(a.risk);
                return (
                  <div key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-[9px] text-slate-600">{a.id}</span>
                      <span className={cn("font-mono text-[9px]", t.text)}>{a.submitted}</span>
                    </div>
                    <div className="text-[12px] font-medium text-white">{a.client}</div>
                    <p className="mt-0.5 text-[11px] text-slate-500">{a.request}</p>
                  </div>
                );
              })}
            </div>
          </Panel>
        </Panel>
      </div>

      {/* Maintenance + Audit */}
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Panel id="manutencao" title="Sala de manutenção" eyebrow="APIs · webhooks · conexões">
          <div className="grid gap-2 sm:grid-cols-2">
            {maintenanceItems.map((item) => (
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

        <Panel id="auditoria" title="Auditoria viva" eyebrow="logs · custos · eventos">
          <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
            <TelemetryFeed items={auditEvents} />
            <div className="space-y-2">
              {[
                [DatabaseZap, "Supabase",   "2.8 GB"],
                [ServerCog,   "R2 Storage", "18.4 GB"],
                [KeyRound,    "API Keys",   "36"],
                [LockKeyhole, "Audit",      "100%"],
              ].map(([Icon, label, value]) => {
                const I = Icon as typeof Activity;
                return (
                  <div
                    key={label as string}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
                  >
                    <div className="flex items-center gap-2">
                      <I className="h-3.5 w-3.5 text-slate-600" />
                      <span className="text-[11px] text-slate-400">{label as string}</span>
                    </div>
                    <span className="font-mono text-[12px] text-white">{value as string}</span>
                  </div>
                );
              })}
              <div className="mt-2 rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
                <LoadingLine label="Calculando margem de tokens" />
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
        <div className="flex items-center gap-2">
          <NeonBadge tone={marketing.warnings.length ? "amber" : "green"}>
            {marketing.warnings.length ? "Aguardando dados" : "Ao vivo"}
          </NeonBadge>
        </div>
      }
      className="mb-4"
    >
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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

        <div className="space-y-3">
          <KpiStat label="Eventos clientes" value={formatNumber(marketing.clientLeadEvents)} tone="cyan" />
          <KpiStat label="Push conhecido" value={formatNumber(marketing.pushKnown)} tone="amber" />
          <KpiStat label="GPS negado" value={formatNumber(marketing.gpsDenied)} tone="rose" />
          {marketing.warnings.map((warning) => (
            <div
              key={warning}
              className="rounded-xl p-3 text-[11px] leading-4 text-amber-300"
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
  tone: "green" | "cyan" | "amber" | "rose" | "zinc";
}) {
  const colors = toneClass(tone);
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", colors.bg)}>
          <Icon className={cn("h-3.5 w-3.5", colors.text)} />
        </div>
      </div>
      <p className={cn("font-mono text-[22px] font-bold leading-none", colors.text)}>{formatNumber(value)}</p>
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
