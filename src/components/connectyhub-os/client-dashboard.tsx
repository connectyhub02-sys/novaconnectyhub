import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  CreditCard,
  HardDrive,
  MapPin,
  MessageCircle,
  ShoppingBag,
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
  KpiStat,
  NeonBadge,
  PageHeader,
  Panel,
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
  const agentsOnlineLabel = `${formatInteger(metrics.agents.online)} online`;
  const generatedAt = formatDateTime(overview.generatedAt);
  const insight = buildInsight(overview);
  const recommendation = buildRecommendation(overview);
  const conversionRate = percentage(metrics.sales.paidOrders30d, metrics.sales.orders30d);
  const whatsappHealth = percentage(metrics.whatsapp.connected, metrics.whatsapp.total);
  const automationSuccess = metrics.automation.successRate;
  const leadStatusRows: Array<{ label: string; tone: Tone; value: number }> = [
    { label: "Novos", value: metrics.leads.new, tone: "cyan" },
    { label: "Ativos", value: metrics.leads.active, tone: "green" },
    { label: "Qualificados", value: metrics.leads.qualified, tone: "violet" },
    { label: "Ganhos", value: metrics.leads.won, tone: "green" },
    { label: "Perdidos", value: metrics.leads.lost, tone: "rose" },
  ];
  const actionItems = buildActionItems(overview);

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
        actions={<CommandButton tone="violet">+ Criar agente</CommandButton>}
      />

      {overview.warnings.length ? (
        <div
          className="mb-4 rounded-xl px-4 py-3 text-[12px] leading-5 text-amber-200"
          style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.28)" }}
        >
          Alguns indicadores nao puderam ser atualizados agora. Os dados exibidos continuam limitados a esta empresa.
        </div>
      ) : null}

      {overview.storage ? <StorageUsageBanner storage={overview.storage} /> : null}

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ReportCard
          icon={UserCheck}
          label="Leads totais"
          value={formatInteger(metrics.leads.total)}
          detail={`${formatInteger(metrics.leads.last7d)} nos ultimos 7 dias`}
          tone="cyan"
        />
        <ReportCard
          icon={MessageCircle}
          label="Conversas abertas"
          value={formatInteger(metrics.conversations.open)}
          detail={`${formatInteger(metrics.conversations.today)} movimentadas hoje`}
          tone="teal"
        />
        <ReportCard
          icon={Smartphone}
          label="WhatsApps conectados"
          value={`${formatInteger(metrics.whatsapp.connected)}/${formatInteger(metrics.whatsapp.total)}`}
          detail={`${whatsappHealth}% de saude operacional`}
          tone={whatsappHealth >= 80 ? "teal" : "amber"}
        />
        <ReportCard
          icon={CreditCard}
          label="Receita 30 dias"
          value={formatMoney(metrics.sales.revenue30dBrl)}
          detail={`${formatInteger(metrics.sales.paidOrders30d)} pedidos pagos`}
          tone="green"
        />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <AreaChartPanel
          title="Evolucao de Leads"
          eyebrow="ultimos 7 dias / empresa atual"
          value={`${formatInteger(metrics.leads.last7d)} novos leads`}
          trend={metrics.leads.last7d > 0 ? `+${formatInteger(metrics.leads.last7d)} em 7d` : undefined}
          data={overview.leadSeries}
          color="var(--ch-chart-2)"
          compact
        />

        <Panel id="crm" title="Funil de leads" eyebrow="status / CRM" compact>
          <div className="grid gap-3">
            {leadStatusRows.map((stage) => {
              const tone = toneClass(stage.tone);
              return (
                <div key={stage.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[12px] text-slate-500">{stage.label}</span>
                    <span className={`font-mono text-[12px] font-semibold ${tone.text}`}>
                      {formatInteger(stage.value)}
                    </span>
                  </div>
                  <ProgressBar value={percentage(stage.value, Math.max(metrics.leads.total, 1))} tone={stage.tone} />
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Panel id="operacao-whatsapp" title="Operacao WhatsApp" eyebrow="agentes / mensagens / conexao" tone="green" compact>
          <div className="grid gap-2 sm:grid-cols-2">
            <KpiStat label="Agentes" value={formatInteger(metrics.agents.total)} tone="violet" />
            <KpiStat label="Online" value={formatInteger(metrics.agents.online)} tone="green" />
            <KpiStat label="Mensagens hoje" value={formatInteger(metrics.messages.today)} tone="cyan" />
            <KpiStat label="Saidas hoje" value={formatInteger(metrics.messages.outboundToday)} tone="amber" />
          </div>
          <div
            className="mt-3 rounded-xl px-3 py-2.5"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">recomendacao</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{recommendation}</p>
          </div>
        </Panel>

        <Panel id="vendas-checkout" title="Vendas e checkout" eyebrow="catalogo / pedidos / pagamentos" tone="green" compact>
          <div className="grid gap-2 sm:grid-cols-2">
            <KpiStat label="Pedidos 30d" value={formatInteger(metrics.sales.orders30d)} tone="cyan" />
            <KpiStat label="Pagos 30d" value={formatInteger(metrics.sales.paidOrders30d)} tone="green" />
            <KpiStat label="Conversao" value={`${conversionRate}%`} tone={conversionRate > 0 ? "green" : "zinc"} />
            <KpiStat
              label="Rejeitados"
              value={formatInteger(metrics.sales.rejectedPayments30d)}
              tone={metrics.sales.rejectedPayments30d ? "rose" : "zinc"}
            />
          </div>
        </Panel>

        <Panel id="creditos-automacoes" title="Creditos e automacoes" eyebrow="consumo / execucoes" tone="amber" compact>
          <div className="grid gap-2 sm:grid-cols-2">
            <KpiStat label="Disponiveis" value={formatInteger(metrics.credits.available)} tone="amber" />
            <KpiStat label="Usados 30d" value={formatInteger(metrics.credits.used30d)} tone="rose" />
            <KpiStat label="Execucoes 30d" value={formatInteger(metrics.automation.runs30d)} tone="violet" />
            <KpiStat label="Sucesso" value={`${automationSuccess}%`} tone={automationSuccess >= 80 ? "green" : "amber"} />
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel
          id="agentes"
          title="Agent Task Force"
          eyebrow="funcionarios IA / operacao agora"
          action={<NeonBadge tone="green">{agentsOnlineLabel}</NeonBadge>}
          tone="violet"
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
          tone="green"
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

      <div className="mb-4">
        <Panel id="conversas" title="Conversas ativas" eyebrow="canais / IA insight" tone="green">
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.58fr)_minmax(0,0.42fr)]">
        <Panel title="Resumo por empresa" eyebrow="workspaces vinculados" tone="cyan">
          <div className="grid gap-2">
            {overview.companies.length ? (
              overview.companies.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                  style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{company.name}</p>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                      {company.planCode} / {company.status}
                    </p>
                  </div>
                  {overview.company?.id === company.id ? (
                    <NeonBadge tone="green">atual</NeonBadge>
                  ) : (
                    <NeonBadge tone="zinc">{company.role}</NeonBadge>
                  )}
                </div>
              ))
            ) : (
              <EmptyState title="Nenhuma empresa cadastrada" detail="Crie uma empresa para iniciar os indicadores do painel." />
            )}
          </div>
        </Panel>

        <Panel title="Proximas acoes" eyebrow="para vender melhor no WhatsApp" tone="violet">
          <div className="grid gap-2">
            {actionItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.label}
                  className="flex gap-3 rounded-xl border px-3 py-3"
                  style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ch-accent)" }} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{item.label}</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.detail}</p>
                  </div>
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

function ReportCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone: "cyan" | "green" | "amber" | "rose" | "teal";
  value: string;
}) {
  const color = tone === "green"
    ? "var(--ch-success)"
    : tone === "amber"
      ? "var(--ch-warning)"
      : tone === "rose"
        ? "var(--ch-danger)"
        : tone === "teal"
          ? "var(--ch-whatsapp-deep)"
          : "var(--ch-brand-primary)";

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--ch-panel)", border: `1px solid color-mix(in srgb, ${color} 34%, transparent)` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 truncate font-mono text-[26px] font-bold leading-none" style={{ color }}>
        {value}
      </p>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">{detail}</p>
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
      className="mb-4 rounded-2xl p-4"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
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
            <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
              armazenamento / {storage.planName}
            </p>
            <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
              {storage.usedLabel} usados de {storage.limitLabel}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              {storage.availableLabel} livres para imagens, videos, arquivos de IA e midias de produtos.
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">uso atual</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: "var(--ch-accent)" }}>
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

function buildActionItems(overview: ClientDashboardOverview) {
  const metrics = overview.metrics;

  if (!overview.company) {
    return [
      { icon: CheckCircle2, label: "Criar empresa", detail: "O Dashboard ganha dados reais depois que o usuario cria a primeira empresa." },
    ];
  }

  return [
    metrics.agents.total === 0
      ? { icon: Bot, label: "Criar agente", detail: "Sem agente ativo, o WhatsApp ainda nao consegue atender leads automaticamente." }
      : { icon: Bot, label: "Revisar agente", detail: `${formatInteger(metrics.agents.online)} agente(s) online e ${formatInteger(metrics.agents.warning)} com atencao.` },
    metrics.whatsapp.connected === 0
      ? { icon: Smartphone, label: "Conectar WhatsApp", detail: "Conecte o numero do agente para capturar conversas, leads e mensagens." }
      : { icon: Smartphone, label: "WhatsApp conectado", detail: `${formatInteger(metrics.whatsapp.connected)} instancia(s) conectada(s) no workspace.` },
    metrics.sales.orders30d === 0
      ? { icon: ShoppingBag, label: "Ativar catalogo", detail: "Cadastre ou importe produtos para o agente vender sem site." }
      : { icon: CreditCard, label: "Otimizar checkout", detail: `${formatInteger(metrics.sales.paidOrders30d)} pedido(s) pagos nos ultimos 30 dias.` },
    metrics.automation.runs30d === 0
      ? { icon: Zap, label: "Configurar automacoes", detail: "Use automacoes para pos-venda, pagamento e recuperacao de conversa parada." }
      : { icon: BarChart3, label: "Acompanhar automacoes", detail: `${formatInteger(metrics.automation.completed30d)} execucoes concluidas em 30 dias.` },
  ];
}

function channelTone(channel: string): Tone {
  const normalized = channel.toLowerCase();

  if (normalized.includes("whatsapp")) return "green";
  if (normalized.includes("instagram") || normalized.includes("meta")) return "violet";
  if (normalized.includes("google")) return "amber";

  return "cyan";
}

function storageTone(status: NonNullable<ClientDashboardOverview["storage"]>["status"]): Tone {
  if (status === "danger") return "rose";
  if (status === "warning") return "amber";
  return "cyan";
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
