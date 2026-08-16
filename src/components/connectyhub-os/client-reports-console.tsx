import {
  BarChart3,
  Bot,
  CheckCircle2,
  CreditCard,
  MessageCircle,
  ShoppingBag,
  Smartphone,
  UserCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ClientDashboardOverview } from "@/lib/client-os/dashboard-overview";
import { AreaChartPanel } from "./charts";
import {
  KpiStat,
  NeonBadge,
  PageHeader,
  Panel,
  ProgressBar,
} from "./panel-primitives";

type Tone = "green" | "cyan" | "amber" | "rose" | "violet" | "zinc";

export function ClientReportsConsole({ overview }: { overview: ClientDashboardOverview }) {
  const metrics = overview.metrics;
  const generatedAt = formatDateTime(overview.generatedAt);
  const conversionRate = percentage(metrics.sales.paidOrders30d, metrics.sales.orders30d);
  const whatsappHealth = percentage(metrics.whatsapp.connected, metrics.whatsapp.total);
  const automationSuccess = metrics.automation.successRate;
  const leadStatusRows = [
    ["Novos", metrics.leads.new, "cyan" as Tone],
    ["Ativos", metrics.leads.active, "green" as Tone],
    ["Qualificados", metrics.leads.qualified, "violet" as Tone],
    ["Ganhos", metrics.leads.won, "green" as Tone],
    ["Perdidos", metrics.leads.lost, "rose" as Tone],
  ];

  return (
    <>
      <PageHeader
        eyebrow={`Workspace / ${overview.company?.name ?? "sem empresa"}`}
        title="Relatórios"
        description={`Indicadores reais do painel do usuário. Atualizado em ${generatedAt}.`}
        actions={<NeonBadge tone={overview.warnings.length ? "amber" : "green"}>{overview.warnings.length ? "parcial" : "online"}</NeonBadge>}
      />

      {overview.warnings.length ? (
        <div
          className="mb-4 rounded-xl px-4 py-3 text-[12px] leading-5 text-amber-200"
          style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.28)" }}
        >
          Alguns indicadores nao puderam ser atualizados agora. Os dados exibidos continuam limitados ao workspace atual.
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ReportCard icon={UserCheck} label="Leads totais" value={formatInteger(metrics.leads.total)} detail={`${formatInteger(metrics.leads.last7d)} nos ultimos 7 dias`} tone="cyan" />
        <ReportCard icon={MessageCircle} label="Conversas abertas" value={formatInteger(metrics.conversations.open)} detail={`${formatInteger(metrics.conversations.today)} movimentadas hoje`} tone="teal" />
        <ReportCard icon={Smartphone} label="WhatsApps conectados" value={`${formatInteger(metrics.whatsapp.connected)}/${formatInteger(metrics.whatsapp.total)}`} detail={`${whatsappHealth}% de saude operacional`} tone={whatsappHealth >= 80 ? "green" : "amber"} />
        <ReportCard icon={CreditCard} label="Receita 30 dias" value={formatMoney(metrics.sales.revenue30dBrl)} detail={`${formatInteger(metrics.sales.paidOrders30d)} pedidos pagos`} tone="green" />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AreaChartPanel
          title="Evolução de leads"
          eyebrow="ultimos 7 dias"
          value={`${formatInteger(metrics.leads.last7d)} novos leads`}
          trend={metrics.leads.last7d > 0 ? `+${formatInteger(metrics.leads.last7d)} em 7d` : "sem entrada"}
          data={overview.leadSeries}
          color="#22d3ee"
        />

        <Panel title="Funil de leads" eyebrow="status / CRM" tone="cyan">
          <div className="grid gap-3">
            {leadStatusRows.map(([label, value, tone]) => (
              <div key={label} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-slate-200">{label}</span>
                  <span className="font-mono text-[11px] text-slate-400">{formatInteger(value as number)}</span>
                </div>
                <ProgressBar value={percentage(value as number, Math.max(metrics.leads.total, 1))} tone={tone as Tone} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Operação WhatsApp" eyebrow="agentes / mensagens / conexão" tone="violet">
          <div className="grid gap-2 sm:grid-cols-2">
            <KpiStat label="Agentes" value={formatInteger(metrics.agents.total)} tone="violet" />
            <KpiStat label="Online" value={formatInteger(metrics.agents.online)} tone="green" />
            <KpiStat label="Mensagens hoje" value={formatInteger(metrics.messages.today)} tone="cyan" />
            <KpiStat label="Saidas hoje" value={formatInteger(metrics.messages.outboundToday)} tone="amber" />
          </div>
        </Panel>

        <Panel title="Vendas e checkout" eyebrow="catalogo / pedidos / pagamentos" tone="green">
          <div className="grid gap-2 sm:grid-cols-2">
            <KpiStat label="Pedidos 30d" value={formatInteger(metrics.sales.orders30d)} tone="cyan" />
            <KpiStat label="Pagos 30d" value={formatInteger(metrics.sales.paidOrders30d)} tone="green" />
            <KpiStat label="Conversão" value={`${conversionRate}%`} tone={conversionRate > 0 ? "green" : "zinc"} />
            <KpiStat label="Rejeitados" value={formatInteger(metrics.sales.rejectedPayments30d)} tone={metrics.sales.rejectedPayments30d ? "rose" : "zinc"} />
          </div>
        </Panel>

        <Panel title="Créditos e automações" eyebrow="consumo / execuções" tone="amber">
          <div className="grid gap-2 sm:grid-cols-2">
            <KpiStat label="Disponíveis" value={formatInteger(metrics.credits.available)} tone="amber" />
            <KpiStat label="Usados 30d" value={formatInteger(metrics.credits.used30d)} tone="rose" />
            <KpiStat label="Execuções 30d" value={formatInteger(metrics.automation.runs30d)} tone="violet" />
            <KpiStat label="Sucesso" value={`${automationSuccess}%`} tone={automationSuccess >= 80 ? "green" : "amber"} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.58fr)_minmax(0,0.42fr)]">
        <Panel title="Resumo por empresa" eyebrow="workspaces vinculados" tone="cyan">
          <div className="grid gap-2">
            {overview.companies.length ? (
              overview.companies.map((company) => (
                <div key={company.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-slate-100">{company.name}</p>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{company.planCode} / {company.status}</p>
                  </div>
                  {overview.company?.id === company.id ? <NeonBadge tone="green">atual</NeonBadge> : <NeonBadge tone="zinc">{company.role}</NeonBadge>}
                </div>
              ))
            ) : (
              <EmptyReportState title="Nenhuma empresa cadastrada" detail="Crie uma empresa para iniciar os indicadores do painel." />
            )}
          </div>
        </Panel>

        <Panel title="Próximas ações" eyebrow="para vender melhor no WhatsApp" tone="violet">
          <div className="grid gap-2">
            {buildActionItems(overview).map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.label} className="flex gap-3 rounded-xl border px-3 py-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ch-accent)" }} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-100">{item.label}</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </>
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
  const color = tone === "green" ? "#34d399" : tone === "amber" ? "#fbbf24" : tone === "rose" ? "#fb7185" : tone === "teal" ? "#2dd4bf" : "#22d3ee";

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--ch-panel)", border: `1px solid ${color}55` }}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${color}18`, color }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 truncate font-mono text-[26px] font-bold leading-none" style={{ color }}>{value}</p>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function EmptyReportState({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="rounded-xl border border-dashed px-3 py-4 text-center" style={{ borderColor: "var(--ch-border)" }}>
      <p className="text-[12px] font-semibold text-slate-200">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function buildActionItems(overview: ClientDashboardOverview) {
  const metrics = overview.metrics;

  if (!overview.company) {
    return [
      { icon: CheckCircle2, label: "Criar empresa", detail: "O relatório ganha dados reais depois que o usuário cria a primeira empresa." },
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
      ? { icon: ShoppingBag, label: "Ativar catálogo", detail: "Cadastre ou importe produtos para o agente vender sem site." }
      : { icon: CreditCard, label: "Otimizar checkout", detail: `${formatInteger(metrics.sales.paidOrders30d)} pedido(s) pagos nos ultimos 30 dias.` },
    metrics.automation.runs30d === 0
      ? { icon: Zap, label: "Configurar automações", detail: "Use automacoes para pós-venda, pagamento e recuperacao de conversa parada." }
      : { icon: BarChart3, label: "Acompanhar automações", detail: `${formatInteger(metrics.automation.completed30d)} execucoes concluidas em 30 dias.` },
  ];
}

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
