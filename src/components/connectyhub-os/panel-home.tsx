import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  ChevronRight,
  CircleDollarSign,
  Coins,
  MessageCircle,
  PlugZap,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Users,
} from "lucide-react";
import type { ClientDashboardOverview } from "@/lib/client-os/dashboard-overview";
import type { AdminDashboardOverview } from "@/lib/admin/dashboard-overview";
import { panelAreaForHref, panelAreaStyle } from "@/lib/ui/panel-theme";

type HomeMetric = { label: string; value: string; detail: string; href: string; icon: LucideIcon };
type HomeTask = { title: string; detail: string; href: string; icon: LucideIcon; tone?: "attention" | "default" };
type HomeRow = { id: string; name: string; detail: string; meta?: string; href: string };

function HomeStart({ eyebrow, title, summary, primary, secondary, metrics, tasks, rowsTitle, rowsHref, rows, emptyRows }: {
  eyebrow: string;
  title: string;
  summary: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  metrics: HomeMetric[];
  tasks: HomeTask[];
  rowsTitle: string;
  rowsHref: string;
  rows: HomeRow[];
  emptyRows: string;
}) {
  return <section className="ch-home">
    <header className="ch-home-heading">
      <div className="min-w-0">
        <p className="ch-eyebrow">{eyebrow}</p>
        <h1 className="ch-page-title">{title}</h1>
        <p className="ch-page-description">{summary}</p>
      </div>
      <div className="ch-home-actions">
        {secondary ? <Link href={secondary.href} className="ch-btn ch-btn-secondary">{secondary.label}</Link> : null}
        <Link href={primary.href} className="ch-btn ch-btn-primary"><MessageCircle size={16} aria-hidden="true" />{primary.label}</Link>
      </div>
    </header>

    <div className="ch-home-kpis" role="list">
      {metrics.map(metric => {
        const Icon = metric.icon;
        return <Link key={metric.label} role="listitem" href={metric.href} className="ch-home-kpi" style={panelAreaStyle(panelAreaForHref(metric.href))}>
          <span className="ch-home-kpi-label"><Icon size={15} aria-hidden="true" />{metric.label}</span>
          <strong>{metric.value}</strong>
          <span className="ch-meta">{metric.detail}</span>
        </Link>;
      })}
    </div>

    <div className="ch-home-columns">
      <section className="ch-home-card" aria-labelledby="ch-home-rows">
        <header><h2 id="ch-home-rows">{rowsTitle}</h2><Link href={rowsHref}>Ver todas <ArrowUpRight size={14} aria-hidden="true" /></Link></header>
        {rows.length ? rows.map(item => <Link className="ch-home-row" key={item.id} href={item.href}>
          <span className="ch-home-avatar" aria-hidden="true">{item.name.trim().slice(0, 1).toUpperCase()}</span>
          <div><strong>{item.name}</strong><p>{item.detail}</p></div>
          {item.meta ? <span className="ch-home-row-meta">{item.meta}</span> : null}
        </Link>) : <p className="ch-home-empty">{emptyRows}</p>}
      </section>
      <section className="ch-home-card" aria-labelledby="ch-home-tasks">
        <header><h2 id="ch-home-tasks">Para fazer agora</h2></header>
        {tasks.map(task => {
          const Icon = task.icon;
          return <Link className="ch-home-row" data-tone={task.tone ?? "default"} key={task.title} href={task.href}>
            <span className="ch-home-task-icon" aria-hidden="true"><Icon size={16} /></span>
            <div><strong>{task.title}</strong><p>{task.detail}</p></div>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>;
        })}
      </section>
    </div>
  </section>;
}

export function ClientHomeStart({ overview, name }: { overview: ClientDashboardOverview; name: string }) {
  const m = overview.metrics;
  const tasks: HomeTask[] = [];
  if (m.whatsapp.disconnected) tasks.push({ title: `Reconectar ${plural(m.whatsapp.disconnected, "WhatsApp", "WhatsApps")}`, detail: "Sem conexão, o agente não recebe novas mensagens.", href: "/dashboard/whatsapp", icon: AlertTriangle, tone: "attention" });
  if (m.credits.available <= 0) tasks.push({ title: "Recarregar créditos", detail: "Agentes e automações param quando o saldo acaba.", href: "/dashboard/creditos", icon: Coins, tone: "attention" });
  if (m.conversations.open) tasks.push({ title: `Acompanhar ${plural(m.conversations.open, "conversa aberta", "conversas abertas")}`, detail: "Veja o que o agente respondeu e assuma quando precisar.", href: "/dashboard/atendimento", icon: MessageCircle });
  if (!m.agents.total) tasks.push({ title: "Criar seu primeiro agente", detail: "Ele atende no WhatsApp e registra cada lead.", href: "/dashboard/whatsapp", icon: Bot });
  if (!m.whatsapp.total) tasks.push({ title: "Conectar um WhatsApp", detail: "Use o número que vai atender seus clientes.", href: "/dashboard/whatsapp", icon: Smartphone });
  if (!m.sales.orders30d) tasks.push({ title: "Cadastrar produtos no catálogo", detail: "O agente passa a vender e enviar o link de pagamento.", href: "/dashboard/links", icon: ShoppingBag });
  if (tasks.length < 3) tasks.push({ title: "Revisar conexões", detail: "Redes sociais, pagamentos e outras contas da empresa.", href: "/dashboard/integracoes", icon: PlugZap });

  const summaryParts = [
    plural(m.conversations.open, "conversa aberta", "conversas abertas"),
    plural(m.leads.today, "lead hoje", "leads hoje"),
  ];

  return <HomeStart
    eyebrow="Início"
    title={name}
    summary={`${summaryParts.join(" · ")}.`}
    primary={{ label: "Abrir conversas", href: "/dashboard/atendimento" }}
    secondary={{ label: "Ver relatórios", href: "#crm" }}
    metrics={[
      { label: "Conversas abertas", value: integer(m.conversations.open), detail: `${integer(m.conversations.today)} movimentadas hoje`, href: "/dashboard/atendimento", icon: MessageCircle },
      { label: "Leads hoje", value: integer(m.leads.today), detail: `${integer(m.leads.last7d)} nos últimos 7 dias`, href: "/dashboard/atendimento", icon: Users },
      { label: "Vendas em 30 dias", value: money(m.sales.revenue30dBrl), detail: plural(m.sales.paidOrders30d, "pedido pago", "pedidos pagos"), href: "/dashboard/links", icon: CircleDollarSign },
      { label: "Agentes ativos", value: `${integer(m.agents.online)} de ${integer(m.agents.total)}`, detail: m.agents.warning ? plural(m.agents.warning, "precisa de atenção", "precisam de atenção") : "Sem alertas", href: "/dashboard/whatsapp", icon: Bot },
    ]}
    tasks={tasks.slice(0, 4)}
    rowsTitle="Conversas recentes"
    rowsHref="/dashboard/atendimento"
    rows={overview.recentConversations.slice(0, 4).map(item => ({
      id: item.id,
      name: item.leadName,
      detail: item.summary || item.channel,
      meta: time(item.lastMessageAt),
      href: `/dashboard/atendimento?conversation=${encodeURIComponent(item.id)}`,
    }))}
    emptyRows="Quando um cliente mandar mensagem, a conversa aparece aqui."
  />;
}

export function AdminHomeStart({ overview }: { overview: AdminDashboardOverview }) {
  const attention = overview.platformHealth.filter(item => item.status === "warning" || item.status === "critical");
  const tasks: HomeTask[] = [
    overview.approvals.length
      ? { title: `Revisar ${plural(overview.approvals.length, "aprovação", "aprovações")}`, detail: "Itens aguardando sua decisão.", href: "/admin/aprovacoes", icon: ShieldCheck, tone: "attention" }
      : { title: "Aprovações em dia", detail: "Nenhum item pendente agora.", href: "/admin/aprovacoes", icon: ShieldCheck },
    attention.length
      ? { title: `Verificar ${plural(attention.length, "serviço", "serviços")}`, detail: attention.map(item => item.name).join(", "), href: "/admin/infrastructure", icon: AlertTriangle, tone: "attention" }
      : { title: "Serviços operando", detail: "Nenhum alerta de infraestrutura.", href: "/admin/infrastructure", icon: PlugZap },
    { title: "Atendimento interno", detail: "Conversas dos agentes da plataforma.", href: "/admin/whatsapp/atendimento", icon: MessageCircle },
  ];
  return <HomeStart
    eyebrow="Administração"
    title="Visão da plataforma"
    summary={`${overview.hero.activeClients} clientes ativos · ${overview.hero.newClients7d} novos em 7 dias.`}
    primary={{ label: "Atendimento interno", href: "/admin/whatsapp/atendimento" }}
    secondary={{ label: "Clientes", href: "/admin/clientes" }}
    metrics={[
      { label: "Clientes ativos", value: overview.hero.activeClients, detail: `${overview.hero.newClients7d} novos em 7 dias`, href: "/admin/clientes", icon: Users },
      { label: "Receita recorrente", value: overview.revenue.value, detail: overview.revenue.trend ? `${overview.revenue.trend} no período` : "Sem comparação", href: "/admin/financeiro", icon: CircleDollarSign },
      { label: "Aprovações", value: integer(overview.approvals.length), detail: overview.approvals.length ? "Aguardando decisão" : "Em dia", href: "/admin/aprovacoes", icon: ShieldCheck },
      { label: "Serviços em atenção", value: integer(attention.length), detail: attention.length ? "Verifique a infraestrutura" : "Tudo operando", href: "/admin/infrastructure", icon: AlertTriangle },
    ]}
    tasks={tasks}
    rowsTitle="Clientes"
    rowsHref="/admin/clientes"
    rows={overview.clients.slice(0, 4).map(item => ({ id: item.id, name: item.company, detail: `${item.plan} · ${item.owner}`, meta: item.status, href: "/admin/clientes" }))}
    emptyRows="Os clientes aparecem aqui assim que se cadastrarem."
  />;
}

function integer(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency", maximumFractionDigits: 0 }).format(value);
}

function plural(count: number, one: string, many: string) {
  return `${integer(count)} ${count === 1 ? one : many}`;
}

function time(value: string | null | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
}
