import Link from "next/link";
import { DashboardDetails } from "./dashboard-details";
import { ClientHomeStart } from "./panel-home";
import { HardDrive } from "lucide-react";
import type { ClientDashboardOverview } from "@/lib/client-os/dashboard-overview";
import { ConnectyShell } from "./connecty-shell";
import { AreaChartPanel } from "./charts";
import {
  AgentCard,
  KpiStat,
  NeonBadge,
  ProgressBar,
  toneClass,
} from "./panel-primitives";

type Tone = "green" | "cyan" | "amber" | "rose" | "violet" | "zinc";

export function ClientDashboard({
  overview,
  isPlatformAdmin = false,
  userAvatarUrl = null,
  workspaceName = "Minha empresa",
  userLabel = "workspace_cliente",
}: {
  overview: ClientDashboardOverview;
  isPlatformAdmin?: boolean;
  userAvatarUrl?: string | null;
  workspaceName?: string;
  userLabel?: string;
}) {
  const metrics = overview.metrics;
  const generatedAt = formatDateTime(overview.generatedAt);
  const recommendation = buildRecommendation(overview);
  const conversionRate = percentage(metrics.sales.paidOrders30d, metrics.sales.orders30d);
  const automationSuccess = metrics.automation.successRate;
  const funnelTotal = Math.max(metrics.leads.total, 1);
  const leadStatusRows: Array<{ label: string; tone: Tone; value: number }> = [
    { label: "Novos", value: metrics.leads.new, tone: "cyan" },
    { label: "Em atendimento", value: metrics.leads.active, tone: "cyan" },
    { label: "Qualificados", value: metrics.leads.qualified, tone: "violet" },
    { label: "Ganhos", value: metrics.leads.won, tone: "green" },
    { label: "Perdidos", value: metrics.leads.lost, tone: "rose" },
  ];
  const statGroups: Array<{ id: string; title: string; href: string; note?: string; stats: Array<{ label: string; value: string; tone?: "good" | "warn" | "bad" }> }> = [
    {
      id: "operacao-whatsapp",
      title: "Atendimento",
      href: "/dashboard/whatsapp",
      note: recommendation,
      stats: [
        { label: "Agentes", value: formatInteger(metrics.agents.total) },
        { label: "Online agora", value: formatInteger(metrics.agents.online), tone: metrics.agents.online ? "good" : undefined },
        { label: "Mensagens hoje", value: formatInteger(metrics.messages.today) },
        { label: "Enviadas hoje", value: formatInteger(metrics.messages.outboundToday) },
      ],
    },
    {
      id: "vendas-checkout",
      title: "Vendas em 30 dias",
      href: "/dashboard/links",
      stats: [
        { label: "Pedidos", value: formatInteger(metrics.sales.orders30d) },
        { label: "Pagos", value: formatInteger(metrics.sales.paidOrders30d), tone: metrics.sales.paidOrders30d ? "good" : undefined },
        { label: "Conversão", value: `${conversionRate}%` },
        { label: "Pagamentos recusados", value: formatInteger(metrics.sales.rejectedPayments30d), tone: metrics.sales.rejectedPayments30d ? "bad" : undefined },
      ],
    },
    {
      id: "creditos-automacoes",
      title: "Créditos e automações",
      href: "/dashboard/creditos",
      stats: [
        { label: "Créditos disponíveis", value: formatInteger(metrics.credits.available), tone: metrics.credits.available <= 0 ? "bad" : undefined },
        { label: "Usados em 30 dias", value: formatInteger(metrics.credits.used30d) },
        { label: "Automações rodadas", value: formatInteger(metrics.automation.runs30d) },
        { label: "Taxa de sucesso", value: `${automationSuccess}%`, tone: automationSuccess >= 80 ? "good" : "warn" },
      ],
    },
  ];

  return (
    <ConnectyShell
      mode="client"
      isPlatformAdmin={isPlatformAdmin}
      userAvatarUrl={userAvatarUrl}
      userLabel={userLabel}
      workspaceName={workspaceName}
    >
      <div className="ch-dashboard">
        <ClientHomeStart overview={overview} name={workspaceName} />

        {overview.warnings.length ? (
          <p className="ch-notice" data-tone="warn" role="status">
            Alguns indicadores não puderam ser atualizados agora. Os dados exibidos continuam limitados a esta empresa.
          </p>
        ) : null}

        <DashboardDetails>
          {overview.storage ? <StorageUsageBanner storage={overview.storage} /> : null}

          <div className="ch-report-row">
            <AreaChartPanel
              title="Novos leads"
              eyebrow="Últimos 7 dias"
              value={`${formatInteger(metrics.leads.last7d)} novos leads`}
              trend={metrics.leads.last7d > 0 ? `+${formatInteger(metrics.leads.last7d)} em 7 dias` : undefined}
              data={overview.leadSeries}
              color="var(--ch-accent)"
              compact
            />

            <section id="crm" className="ch-report-card" aria-labelledby="ch-funnel-title">
              <header><h3 id="ch-funnel-title">Funil de leads</h3><span className="ch-meta">{formatInteger(metrics.leads.total)} no total</span></header>
              <div className="ch-funnel">
                {leadStatusRows.map((stage) => (
                  <div key={stage.label} className="ch-funnel-row">
                    <div className="flex items-baseline justify-between gap-2">
                      <span>{stage.label}</span>
                      <b>{formatInteger(stage.value)}</b>
                    </div>
                    <ProgressBar value={percentage(stage.value, funnelTotal)} tone={stage.tone} />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="ch-stat-groups">
            {statGroups.map((group) => (
              <section key={group.id} id={group.id} className="ch-report-card" aria-labelledby={`${group.id}-title`}>
                <header><h3 id={`${group.id}-title`}>{group.title}</h3><Link href={group.href} className="ch-link">Abrir</Link></header>
                <dl className="ch-stat-grid">
                  {group.stats.map((stat) => (
                    <div key={stat.label}>
                      <dt>{stat.label}</dt>
                      <dd data-tone={stat.tone}>{stat.value}</dd>
                    </div>
                  ))}
                </dl>
                {group.note ? <p className="ch-report-note">{group.note}</p> : null}
              </section>
            ))}
          </div>

          <div className="ch-report-row ch-report-row--even">
            <section id="agentes" className="ch-report-card" aria-labelledby="ch-agents-title">
              <header><h3 id="ch-agents-title">Agentes</h3><span className="ch-meta">{formatInteger(metrics.agents.online)} online</span></header>
              {overview.activeAgents.length ? (
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {overview.activeAgents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      name={agent.name}
                      avatarUrl={agent.avatarUrl ?? null}
                      role={agent.role}
                      status={agent.status}
                      accuracy={agent.accuracy}
                      current={agent.current}
                      accent="cyan"
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="Nenhum agente nesta empresa" detail="Os agentes que você criar aparecem aqui com o status de cada um." />
              )}
            </section>

            <section id="leads" className="ch-report-card" aria-labelledby="ch-leads-title">
              <header><h3 id="ch-leads-title">Leads recentes</h3><Link href="/dashboard/atendimento" className="ch-link">Ver todos</Link></header>
              {overview.recentLeads.length ? (
                <ul className="ch-lead-list">
                  {overview.recentLeads.map((lead) => (
                    <li key={lead.id}>
                      <div className="min-w-0">
                        <p className="truncate font-medium" style={{ color: "var(--ch-text)" }}>{lead.name}</p>
                        <p className="ch-meta truncate">{[lead.channel, lead.source].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span className="ch-lead-score" title="Pontuação do lead">{lead.score}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nenhum lead recente" detail="Os novos contatos desta empresa aparecem aqui." />
              )}
            </section>
          </div>

          {overview.companies.length > 1 ? (
            <section className="ch-report-card" aria-labelledby="ch-companies-title">
              <header><h3 id="ch-companies-title">Suas empresas</h3></header>
              <ul className="ch-lead-list">
                {overview.companies.map((company) => (
                  <li key={company.id}>
                    <div className="min-w-0">
                      <p className="truncate font-medium" style={{ color: "var(--ch-text)" }}>{company.name}</p>
                      <p className="ch-meta truncate">{company.planLabel ?? company.planCode}</p>
                    </div>
                    {overview.company?.id === company.id ? <NeonBadge tone="green">Atual</NeonBadge> : <NeonBadge tone="zinc">{company.role}</NeonBadge>}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </DashboardDetails>
        <p className="ch-meta mt-3">Atualizado em {generatedAt}.</p>
      </div>
    </ConnectyShell>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-6 text-center">
      <p className="text-[14px] font-medium" style={{ color: "var(--ch-text)" }}>
        {title}
      </p>
      <p className="ch-meta mt-1">{detail}</p>
    </div>
  );
}

function StorageUsageBanner({ storage }: { storage: NonNullable<ClientDashboardOverview["storage"]> }) {
  const tone = storageTone(storage.status);
  const fileLimitLabel = storage.fileLimit > 0 ? formatInteger(storage.fileLimit) : "sem limite";
  const fileUsageLabel = `${formatInteger(storage.fileCount)}/${fileLimitLabel}`;
  const usagePercent = getStorageUsagePercent(storage);

  return (
    <div
      className="ch-report-card mb-4 p-4"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(6,182,212,0.10)", border: "1px solid rgba(6,182,212,0.25)" }}
          >
            <HardDrive className="h-4 w-4" style={{ color: "var(--ch-accent)" }} />
          </div>
          <div className="min-w-0">
            <p className="ch-meta">
              Armazenamento · {storage.planName}
            </p>
            <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
              {storage.usedLabel} usados de {storage.limitLabel}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              {storage.availableLabel} livres para imagens, vídeos, arquivos de IA e mídias de produtos.
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="ch-meta">Uso atual</span>
            <span className="font-mono text-[11px] font-semibold" style={{ color: "var(--ch-accent)" }}>
              {usagePercent.label}
            </span>
          </div>
          <StorageProgressBar value={usagePercent.visualValue} tone={tone} />
        </div>

        <div className="grid min-w-0 grid-cols-3 gap-2 xl:w-[420px]">
          <KpiStat label="Usado" value={storage.usedLabel} tone={tone} />
          <KpiStat label="Livre" value={storage.availableLabel} tone="cyan" />
          <KpiStat label="Arquivos" value={fileUsageLabel} tone={storage.status === "danger" ? "rose" : "zinc"} />
        </div>
      </div>
    </div>
  );
}

function StorageProgressBar({ value, tone }: { value: number; tone: Tone }) {
  const toneStyle = toneClass(tone);

  return (
    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--ch-border)" }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(0, Math.min(value, 100))}%`, backgroundColor: toneStyle.fill }}
      />
    </div>
  );
}

function getStorageUsagePercent(storage: NonNullable<ClientDashboardOverview["storage"]>) {
  const rawPercent = storage.limitBytes > 0 ? (storage.usedBytes / storage.limitBytes) * 100 : 0;
  const hasUsage = storage.usedBytes > 0 && storage.limitBytes > 0;
  const roundedPercent = Math.max(0, Math.min(storage.usedPercent, 100));

  return {
    label: hasUsage && rawPercent < 1 ? "<1%" : `${roundedPercent}%`,
    visualValue: hasUsage ? Math.max(2, Math.min(rawPercent, 100)) : 0,
  };
}

function buildRecommendation(overview: ClientDashboardOverview) {
  const warningAgent = overview.activeAgents.find((agent) => agent.status === "warning" || agent.status === "critical");

  if (warningAgent) {
    return `${warningAgent.name}: ${warningAgent.current}`;
  }

  if (overview.metrics.conversations.open > 0) {
    return `${formatInteger(overview.metrics.conversations.open)} conversa(s) aberta(s) aguardam acompanhamento.`;
  }

  if (overview.metrics.whatsapp.connected === 0) {
    return "Conecte um WhatsApp para iniciar o acompanhamento em tempo real.";
  }

  if (overview.metrics.credits.available <= 0) {
    return "Recarregue creditos para manter agentes, mensagens e automacoes ativos.";
  }

  return "Operacao sem alertas criticos neste momento.";
}

function storageTone(status: NonNullable<ClientDashboardOverview["storage"]>["status"]): Tone {
  if (status === "danger") return "rose";
  if (status === "warning") return "amber";
  return "cyan";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "agora";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}
