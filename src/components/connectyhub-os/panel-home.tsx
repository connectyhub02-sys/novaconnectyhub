import Link from "next/link";
import { ArrowUpRight, ChevronRight, MessageCircle, Users, Zap } from "lucide-react";
import type { ClientDashboardOverview } from "@/lib/client-os/dashboard-overview";
import type { AdminDashboardOverview } from "@/lib/admin/dashboard-overview";
import { panelAreaForHref, panelAreaStyle } from "@/lib/ui/panel-theme";

function HomeStart({ name, subtitle, metrics, priorities, conversations, attendanceHref }: {
  name: string; subtitle: string;
  metrics: { label: string; value: string | number; href: string }[];
  priorities: { title: string; detail: string; href: string }[];
  conversations: { id: string; name: string; detail: string; href: string }[];
  attendanceHref: string;
}) {
  return <section className="ch-home">
    <header className="ch-home-heading"><div><p>{name}</p><h1>Seu dia, em foco</h1><span>{subtitle}</span></div><Link href={attendanceHref} className="ch-home-primary"><MessageCircle size={18} />Atender</Link></header>
    <div className="ch-home-metrics">{metrics.map((metric, i) => {
      const Icon = [MessageCircle, Users, Zap][i];
      return <Link key={metric.label} href={metric.href} style={panelAreaStyle(panelAreaForHref(metric.href))}><span className="ch-area-icon"><Icon size={17}/></span><strong>{metric.value}</strong><span>{metric.label}</span><ArrowUpRight className="ch-metric-arrow" size={15}/></Link>;
    })}</div>
    <div className="ch-home-columns"><section className="ch-home-card"><header><h2>Próximos passos</h2><span>Operação</span></header>
      {priorities.map(item => <Link className="ch-home-row" key={item.title} href={item.href}><div><strong>{item.title}</strong><p>{item.detail}</p></div><ChevronRight size={18}/></Link>)}
    </section><section className="ch-home-card"><header><h2>Continue por aqui</h2><Link href={attendanceHref}>Atendimento <ArrowUpRight size={14}/></Link></header>
      {conversations.length ? conversations.map(item => <Link className="ch-home-row" key={item.id} href={item.href}><span className="ch-home-avatar">{item.name.slice(0,1)}</span><div><strong>{item.name}</strong><p>{item.detail}</p></div><ChevronRight size={18}/></Link>) : <p className="ch-home-empty">As conversas recentes aparecerão aqui.</p>}
    </section></div>
  </section>;
}

export function ClientHomeStart({ overview, name }: { overview: ClientDashboardOverview; name: string }) {
  const m = overview.metrics;
  const priorities = [
    ...(m.whatsapp.disconnected ? [{ title: `${m.whatsapp.disconnected} conexão(ões) desconectada(s)`, detail: "Confira seus agentes e restabeleça a conexão.", href: "/dashboard/whatsapp" }] : []),
    { title: "Acompanhar conversas", detail: `${m.conversations.open} abertas. Veja mensagens e assuma quando precisar.`, href: "/dashboard/atendimento" },
    { title: "Organizar suas vendas", detail: "Produtos, pedidos e oportunidades da empresa.", href: "/dashboard/links" },
  ];
  return <ClientHomeStartContent overview={overview} name={name} priorities={priorities}/>;
}

function ClientHomeStartContent({ overview, name, priorities }: { overview: ClientDashboardOverview; name: string; priorities: {title: string; detail: string; href: string}[] }) {
  const m = overview.metrics;
  return <HomeStart name={name} subtitle="Atendimento e operação da sua empresa." attendanceHref="/dashboard/atendimento"
    metrics={[{ label: "Conversas abertas", value: m.conversations.open, href: "/dashboard/atendimento" }, { label: "Leads hoje", value: m.leads.today, href: "/dashboard/atendimento" }, { label: "Agentes online", value: m.agents.online, href: "/dashboard/whatsapp" }]}
    priorities={priorities}
    conversations={overview.recentConversations.slice(0, 3).map(item => ({ id: item.id, name: item.leadName, detail: item.summary || item.channel, href: `/dashboard/atendimento?conversation=${encodeURIComponent(item.id)}` }))}/>;
}

export function AdminHomeStart({ overview }: { overview: AdminDashboardOverview }) {
  const attention = overview.platformHealth.filter(item => item.status === "warning" || item.status === "critical");
  return <HomeStart name="Administração · ConnectyHub" subtitle="Clientes, atendimento interno e saúde da plataforma." attendanceHref="/admin/whatsapp/atendimento"
    metrics={[{ label: "Clientes ativos", value: overview.hero.activeClients, href: "/admin/clientes" }, { label: "Aprovações", value: overview.approvals.length, href: "/admin/aprovacoes" }, { label: "Serviços em atenção", value: attention.length, href: "/admin/infrastructure" }]}
    priorities={[
      { title: overview.approvals.length ? "Aprovações para revisar" : "Aprovações em dia", detail: overview.approvals.length ? `${overview.approvals.length} item(ns) na visão atual.` : "Nenhum item pendente na visão atual.", href: "/admin/aprovacoes" },
      { title: attention.length ? "Verificar serviços" : "Acompanhar a plataforma", detail: attention.length ? attention.map(item => item.name).join(", ") : "Consulte os indicadores e o estado dos serviços.", href: "/admin/infrastructure" },
      { title: "Atendimento interno", detail: "Conversas dos agentes internos e contexto do cliente.", href: "/admin/whatsapp/atendimento" },
    ]}
    conversations={overview.clients.slice(0, 3).map(item => ({ id: item.id, name: item.company, detail: `${item.plan} · ${item.status}`, href: "/admin/clientes" }))}/>;
}
