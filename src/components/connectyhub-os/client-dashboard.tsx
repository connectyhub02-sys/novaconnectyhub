import type { LucideIcon } from "lucide-react";
import {
  Check,
  Coins,
  CreditCard,
  Eye,
  Link2,
  MapPin,
  Megaphone,
  MessageCircle,
  Send,
  Smartphone,
  UserCheck,
  Zap,
} from "lucide-react";
import type { ClientDashboardOverview } from "@/lib/client-os/dashboard-overview";
import { ConnectyShell } from "./connecty-shell";
import { AreaChartPanel } from "./charts";
import {
  AgentCard,
  CommandButton,
  HeroMetricCard,
  KpiStat,
  MetricCard,
  MiniSparkline,
  NeonBadge,
  PageHeader,
  Panel,
  ProgressBar,
  StatusBadge,
  toneClass,
} from "./panel-primitives";

type StatusTone = "online" | "warning" | "critical" | "idle";
type Tone = "green" | "cyan" | "amber" | "rose" | "violet" | "zinc";

const metricIcons: LucideIcon[] = [UserCheck, MessageCircle, CreditCard, Coins];

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
  const leadCard = overview.summaryCards.find((card) => card.id === "leads") ?? overview.summaryCards[0];
  const creditsCard = overview.summaryCards.find((card) => card.id === "credits") ?? overview.summaryCards[3];
  const agentsOnlineLabel = `${formatInteger(metrics.agents.online)} online`;
  const generatedAt = formatDateTime(overview.generatedAt);
  const insight = buildInsight(overview);
  const recommendation = buildRecommendation(overview);
  const channelRows = buildChannelRows(overview);
  const automationRows = buildAutomationRows(overview);

  return (
    <ConnectyShell
      mode="client"
      isPlatformAdmin={isPlatformAdmin}
      userAvatarUrl={userAvatarUrl}
      userLabel={userLabel}
      workspaceName={workspaceName}
    >
      <PageHeader
        eyebrow={`Workspace / ${workspaceName}`}
        title="Dashboard"
        description={`Dados isolados desta empresa. Atualizado em ${generatedAt}.`}
        actions={<CommandButton tone="cyan">+ Criar agente</CommandButton>}
      />

      {overview.warnings.length ? (
        <div
          className="mb-4 rounded-xl px-4 py-3 text-[12px] leading-5 text-amber-200"
          style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.28)" }}
        >
          Alguns indicadores nao puderam ser atualizados agora. Os dados exibidos continuam limitados a esta empresa.
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <HeroMetricCard
          icon={UserCheck}
          label="Total de Leads"
          value={leadCard?.value ?? "0"}
          sub1Label="Ativos hoje"
          sub1Value={formatInteger(metrics.leads.today)}
          sub2Label="Ultimos 7 dias"
          sub2Value={formatInteger(metrics.leads.last7d)}
          series={leadCard?.series ?? overview.leadSeries.map((point) => point.value)}
          accent="cyan"
        />

        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
        >
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">agentes IA / status</p>
          <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
            Operacao atual
          </p>
          <div className="mt-4 space-y-2.5">
            {overview.activeAgents.length ? (
              overview.activeAgents.slice(0, 4).map((agent) => {
                const isWarn = agent.status === "warning" || agent.status === "critical";
                return (
                  <div key={agent.id} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: isWarn ? "#f59e0b" : "var(--ch-accent)",
                          boxShadow: isWarn ? "0 0 5px #f59e0b" : "0 0 5px var(--ch-accent)",
                        }}
                      />
                      <span className="truncate text-[12px] font-medium" style={{ color: "var(--ch-text)" }}>
                        {agent.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-500">{agent.accuracy}%</span>
                      <div className="w-16">
                        <ProgressBar value={agent.accuracy} tone={isWarn ? "amber" : "cyan"} />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState title="Nenhum agente ativo" detail="Crie ou ative um agente para acompanhar a operacao aqui." />
            )}
          </div>
          <div
            className="mt-4 rounded-xl px-3 py-2.5"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">gerente IA recomenda</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{recommendation}</p>
          </div>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
        >
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">conversas / hoje</p>
          <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
            Atendimento IA
          </p>
          <div className="mt-4 divide-y" style={{ borderColor: "var(--ch-border)" }}>
            {overview.recentConversations.length ? (
              overview.recentConversations.slice(0, 4).map((conversation) => (
                <div key={conversation.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium" style={{ color: "var(--ch-text)" }}>
                      {conversation.leadName}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--ch-accent)" }}>
                      {conversation.score}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-wide text-slate-500">
                      {conversation.channel}
                    </span>
                    <span className="max-w-[140px] truncate text-[10px] text-slate-500">{conversation.summary}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Sem conversas recentes" detail="As novas conversas desta empresa aparecerao aqui." />
            )}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <AreaChartPanel
          title="Evolucao de Leads"
          eyebrow="ultimos 7 dias / empresa atual"
          value={`${formatInteger(metrics.leads.total)} leads`}
          trend={metrics.leads.last7d > 0 ? `+${formatInteger(metrics.leads.last7d)} em 7d` : undefined}
          data={overview.leadSeries}
          color="#06b6d4"
        />
      </div>

      <div className="mb-4 grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-4">
        {overview.summaryCards.map((metric, index) => (
          <MetricCard key={metric.id} icon={metricIcons[index] ?? Zap} {...metric} />
        ))}
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel
          id="agentes"
          title="Agent Task Force"
          eyebrow="funcionarios IA / operacao agora"
          action={<NeonBadge tone="green">{agentsOnlineLabel}</NeonBadge>}
        >
          {overview.activeAgents.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {overview.activeAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  name={agent.name}
                  role={agent.role}
                  status={agent.status}
                  accuracy={agent.accuracy}
                  current={agent.current}
                  accent="cyan"
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Nenhum agente encontrado" detail="Os agentes vinculados a esta empresa aparecem aqui." />
          )}
        </Panel>

        <Panel
          id="leads"
          title="Lead Pulse"
          eyebrow="captura / origem / score"
          action={<NeonBadge tone="cyan">{formatInteger(metrics.leads.total)}</NeonBadge>}
        >
          <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
            {overview.recentLeads.length ? (
              overview.recentLeads.map((lead) => (
                <div key={lead.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <NeonBadge tone={channelTone(lead.channel)}>{lead.channel}</NeonBadge>
                        <span className="text-[12.5px] font-medium" style={{ color: "var(--ch-text)" }}>
                          {lead.name}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">{lead.summary}</p>
                      <div className="mt-1 flex gap-3 font-mono text-[9px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {lead.source}
                        </span>
                        <span className="flex items-center gap-1">
                          <Smartphone className="h-2.5 w-2.5" />
                          {lead.status}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-mono text-[16px] font-bold" style={{ color: "var(--ch-accent)" }}>
                        {lead.score}
                      </span>
                      <div className="font-mono text-[9px] text-slate-400">score</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Sem leads recentes" detail="Novos leads desta empresa serao listados aqui." />
            )}
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[220px_1fr]">
        <Panel id="crm" title="Funil de vendas" eyebrow="do clique a venda">
          <div className="space-y-3">
            {overview.funnel.map((stage) => {
              const tone = toneClass(stage.tone);
              return (
                <div key={stage.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">{stage.label}</span>
                    <span className={`font-mono text-[12px] font-semibold ${tone.text}`}>
                      {formatInteger(stage.count)}
                    </span>
                  </div>
                  <ProgressBar value={stage.value} tone={stage.tone} />
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel id="conversas" title="Conversas ativas" eyebrow="canais / IA insight">
          <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
            <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
              {overview.recentConversations.length ? (
                overview.recentConversations.map((conversation) => (
                  <div key={conversation.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[12px] font-medium" style={{ color: "var(--ch-text)" }}>
                        {conversation.leadName}
                      </span>
                      <span className="font-mono text-[10px]" style={{ color: "var(--ch-accent)" }}>
                        {conversation.score}
                      </span>
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-wide text-slate-400">
                      {conversation.channel}
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">{conversation.summary}</p>
                  </div>
                ))
              ) : (
                <EmptyState title="Sem conversas abertas" detail="As conversas abertas desta empresa ficarao aqui." />
              )}
            </div>

            <div
              className="rounded-xl p-4"
              style={{ background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.2)" }}
            >
              <div
                className="mb-3 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest"
                style={{ color: "var(--ch-accent)" }}
              >
                <MessageCircle className="h-3 w-3" />
                IA Insight
              </div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                {insight.title}
              </p>
              <p className="mt-2 text-[12px] leading-5 text-slate-500">{insight.body}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {insight.stats.map(([label, value]) => (
                  <KpiStat key={label} label={label} value={value} tone="cyan" />
                ))}
              </div>
              <div
                className="mt-3 rounded-xl p-3"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-emerald-500">
                  rascunho gerado
                </p>
                <p className="text-[11px] leading-4 text-slate-500">{insight.draft}</p>
              </div>
              <div className="mt-3 flex gap-2">
                {[
                  { label: "Enviar pelo agente", accent: true },
                  { label: "Editar rascunho", accent: false },
                ].map((button) => (
                  <button
                    key={button.label}
                    type="button"
                    className="flex-1 rounded-xl py-2 font-mono text-[10px] uppercase tracking-wide transition"
                    style={
                      button.accent
                        ? { background: "var(--ch-accent)", color: "#fff" }
                        : {
                            background: "var(--ch-surface-2)",
                            border: "1px solid var(--ch-border)",
                            color: "var(--ch-muted)",
                          }
                    }
                  >
                    {button.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr_280px]">
        <Panel id="links" title="Canais e creditos" eyebrow="whatsapp / carteira / consumo">
          <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
            {channelRows.map((row) => (
              <div key={row.label} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <row.icon className="h-3 w-3 text-slate-400" />
                    {row.label}
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: "var(--ch-accent)" }}>
                    {row.value}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">{row.detail}</div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <MiniSparkline color="#06b6d4" data={creditsCard?.series ?? [0, 0, 0, 0]} />
            <div className="mt-3 space-y-2">
              {[
                [Eye, "Mensagens hoje", formatInteger(metrics.messages.today)],
                [Link2, "Entradas", formatInteger(metrics.messages.inboundToday)],
                [Send, "Saidas", formatInteger(metrics.messages.outboundToday)],
              ].map(([Icon, label, value]) => {
                const IconComponent = Icon as LucideIcon;
                return (
                  <div key={label as string} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <IconComponent className="h-3 w-3 text-slate-400" />
                      {label as string}
                    </span>
                    <span className="font-mono text-[11px] font-medium" style={{ color: "var(--ch-text)" }}>
                      {value as string}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel id="campanhas" title="Campanhas ativas" eyebrow="pago / organico / ROAS">
          {overview.campaigns.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {overview.campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-xl p-3"
                  style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <StatusBadge status={toStatusTone(campaign.status)} label={campaign.status} />
                    <Megaphone className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="text-[12.5px] font-semibold" style={{ color: "var(--ch-text)" }}>
                    {campaign.name}
                  </div>
                  <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-400">
                    {campaign.platform}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Gasto", formatMoney(campaign.spendBrl), ""],
                      ["Leads", formatInteger(campaign.leads), "accent"],
                      ["Cliques", formatInteger(campaign.clicks), ""],
                      ["ROAS", formatRoas(campaign.roas), "green"],
                    ].map(([label, value, color]) => (
                      <div key={label}>
                        <div className="font-mono text-[9px] text-slate-400">{label}</div>
                        <div
                          className="font-mono text-[11px] font-semibold"
                          style={{
                            color:
                              color === "accent" ? "var(--ch-accent)" : color === "green" ? "#10b981" : "var(--ch-text)",
                          }}
                        >
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sem campanhas sincronizadas"
              detail="As campanhas conectadas da empresa aparecerao aqui depois da integracao."
            />
          )}
        </Panel>

        <Panel id="automacoes" title="Automacoes" eyebrow="gatilhos / execucoes">
          <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
            {automationRows.map((automation) => (
              <div key={automation.trigger} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={automation.status} />
                      <span className="truncate text-[12px] font-medium" style={{ color: "var(--ch-text)" }}>
                        {automation.trigger}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">{automation.action}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[9px] text-slate-400">exec.</div>
                    <div className="font-mono text-[14px] font-bold text-emerald-500">{automation.runs}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              [Zap, "Execucoes 30d", formatInteger(metrics.automation.runs30d)],
              [Check, "Taxa sucesso", `${formatInteger(metrics.automation.successRate)}%`],
            ].map(([Icon, label, value]) => {
              const IconComponent = Icon as LucideIcon;
              return (
                <div
                  key={label as string}
                  className="rounded-xl p-3"
                  style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
                >
                  <IconComponent className="h-3.5 w-3.5 text-slate-400" />
                  <div className="mt-2 font-mono text-[14px] font-bold text-emerald-500">{value as string}</div>
                  <div className="font-mono text-[9px] text-slate-400">{label as string}</div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </ConnectyShell>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      className="rounded-xl px-3 py-3"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <p className="text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
        {title}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p>
    </div>
  );
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

function buildInsight(overview: ClientDashboardOverview) {
  const conversation = overview.recentConversations[0] ?? null;
  const lead = overview.recentLeads[0] ?? null;
  const score = conversation?.score ?? lead?.score ?? 0;
  const temperature = score >= 80 ? "Quente" : score >= 50 ? "Morno" : score > 0 ? "Novo" : "Sem sinal";
  const intent = score >= 80 ? "Alta" : score >= 50 ? "Media" : score > 0 ? "Inicial" : "-";
  const nextStep = conversation ? "Responder" : lead ? "Qualificar" : "Captar";

  if (conversation) {
    return {
      title: `Proxima resposta para ${conversation.leadName}`,
      body: conversation.summary,
      stats: [
        ["Sinal", temperature],
        ["Intencao", intent],
        ["Prox. etapa", nextStep],
      ],
      draft: `Responder pelo canal ${conversation.channel} mantendo o contexto da ultima mensagem e oferecendo o proximo passo mais simples.`,
    };
  }

  if (lead) {
    return {
      title: `Lead recente: ${lead.name}`,
      body: lead.summary,
      stats: [
        ["Sinal", temperature],
        ["Origem", lead.source],
        ["Prox. etapa", nextStep],
      ],
      draft: `Abrir abordagem curta pelo canal ${lead.channel}, confirmar interesse e direcionar para a oferta adequada.`,
    };
  }

  return {
    title: "Sem conversa recente",
    body: "Quando novos leads chegarem, a IA vai priorizar o atendimento e sugerir o proximo passo.",
    stats: [
      ["Sinal", "-"],
      ["Intencao", "-"],
      ["Prox. etapa", "Captar"],
    ],
    draft: "Ainda nao ha contexto recente suficiente para gerar uma resposta personalizada.",
  };
}

function buildChannelRows(overview: ClientDashboardOverview) {
  return [
    {
      icon: Smartphone,
      label: "WhatsApp conectados",
      value: `${formatInteger(overview.metrics.whatsapp.connected)}/${formatInteger(overview.metrics.whatsapp.total)}`,
      detail: `${formatInteger(overview.metrics.whatsapp.disconnected)} instancia(s) desconectada(s).`,
    },
    {
      icon: MessageCircle,
      label: "Conversas abertas",
      value: formatInteger(overview.metrics.conversations.open),
      detail: `${formatInteger(overview.metrics.conversations.today)} conversa(s) movimentadas hoje.`,
    },
    {
      icon: Coins,
      label: "Creditos disponiveis",
      value: formatInteger(overview.metrics.credits.available),
      detail: `${formatInteger(overview.metrics.credits.used30d)} credito(s) consumidos em 30 dias.`,
    },
  ];
}

function buildAutomationRows(overview: ClientDashboardOverview) {
  const successStatus: StatusTone =
    overview.metrics.automation.runs30d === 0
      ? "idle"
      : overview.metrics.automation.failed30d > 0
        ? "warning"
        : "online";
  const trafficStatus: StatusTone = overview.metrics.traffic.openActions > 0 ? "warning" : "idle";

  return [
    {
      trigger: "Execucoes dos agentes",
      action: `${formatInteger(overview.metrics.automation.completed30d)} concluidas e ${formatInteger(overview.metrics.automation.failed30d)} com falha em 30 dias.`,
      runs: formatInteger(overview.metrics.automation.runs30d),
      status: successStatus,
    },
    {
      trigger: "Acoes do gestor IA",
      action: `${formatInteger(overview.metrics.traffic.openActions)} acao(oes) abertas de trafego e crescimento.`,
      runs: formatInteger(overview.metrics.traffic.openActions),
      status: trafficStatus,
    },
  ];
}

function channelTone(channel: string): Tone {
  const normalized = channel.toLowerCase();

  if (normalized.includes("whatsapp")) return "green";
  if (normalized.includes("instagram") || normalized.includes("meta")) return "violet";
  if (normalized.includes("google")) return "amber";

  return "cyan";
}

function toStatusTone(value: string): StatusTone {
  const normalized = value.toLowerCase();

  if (["online", "connected", "active", "approved", "paid", "selected"].some((status) => normalized.includes(status))) {
    return "online";
  }

  if (["attention", "atencao", "pending", "queued", "suggested", "progress"].some((status) => normalized.includes(status))) {
    return "warning";
  }

  if (["critical", "critico", "failed", "rejected", "blocked", "error"].some((status) => normalized.includes(status))) {
    return "critical";
  }

  return "idle";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRoas(value: number | null) {
  return value === null ? "n/d" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}x`;
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
