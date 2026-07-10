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
  TrendingUp,
  UserCheck,
  Zap,
} from "lucide-react";
import {
  automations,
  campaigns,
  clientMetrics,
  conversations,
  leads,
  trackerLinks,
} from "@/lib/connectyhub-os-data";
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

// ─── Static data ──────────────────────────────────────────────────────────────

const metricIcons = [UserCheck, TrendingUp, CreditCard, Coins];

const funnelStages = [
  { label: "Captado",        count: 1284, value: 100, tone: "cyan"   as const },
  { label: "Atendido IA",    count: 1120, value: 87,  tone: "green"  as const },
  { label: "Qualificado",    count: 642,  value: 50,  tone: "violet" as const },
  { label: "Oferta enviada", count: 318,  value: 25,  tone: "amber"  as const },
  { label: "Venda",          count: 126,  value: 10,  tone: "green"  as const },
];

const agentSquad = [
  { name: "Hermes",  role: "Atendimento WhatsApp",       status: "online"  as const, accuracy: 94, current: "Respondendo lead que perguntou se precisa de site" },
  { name: "Athena",  role: "CRM · Lead score · Funil",   status: "online"  as const, accuracy: 91, current: "Separando leads quentes de tráfego pago" },
  { name: "Apollo",  role: "Google Ads · Meta Ads",       status: "warning" as const, accuracy: 83, current: "Aguardando aprovação para aumentar budget" },
  { name: "Oráculo", role: "Orgânico · Posts · Direct",  status: "online"  as const, accuracy: 88, current: "Criando roteiro para Reels de afiliado" },
];

const leadsChartData = [
  { label: "Jan", value: 320 },
  { label: "Fev", value: 480 },
  { label: "Mar", value: 390 },
  { label: "Abr", value: 620 },
  { label: "Mai", value: 750 },
  { label: "Jun", value: 890 },
  { label: "Jul", value: 1284 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function ClientDashboard({
  isPlatformAdmin = false,
  userAvatarUrl = null,
  workspaceName = "Minha empresa",
  userLabel = "workspace_cliente",
}: {
  isPlatformAdmin?: boolean;
  userAvatarUrl?: string | null;
  workspaceName?: string;
  userLabel?: string;
}) {
  return (
    <ConnectyShell
      mode="client"
      isPlatformAdmin={isPlatformAdmin}
      userAvatarUrl={userAvatarUrl}
      userLabel={userLabel}
      workspaceName={workspaceName}
    >
      {/* ── Header ── */}
      <PageHeader
        eyebrow={`Workspace · ${workspaceName}`}
        title="Dashboard"
        description="Leads, conversas, agentes e campanhas em tempo real."
        actions={<CommandButton tone="cyan">+ Criar agente</CommandButton>}
      />

      {/* ── Top row: Hero + 2 bar charts ── */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <HeroMetricCard
          icon={UserCheck}
          label="Total de Leads"
          value="1.284"
          sub1Label="Ativos hoje"
          sub1Value="47"
          sub2Label="Esta semana"
          sub2Value="+186"
          series={[320, 480, 390, 620, 750, 890, 1284]}
          accent="cyan"
        />
        {/* Agents status mini-panel */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
        >
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">agentes IA · status</p>
          <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>Task Force</p>
          <div className="mt-4 space-y-2.5">
            {agentSquad.map((a) => {
              const isWarn = a.status === "warning";
              return (
                <div key={a.name} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: isWarn ? "#f59e0b" : "var(--ch-accent)",
                        boxShadow:  isWarn ? "0 0 5px #f59e0b" : "0 0 5px var(--ch-accent)",
                      }}
                    />
                    <span className="truncate text-[12px] font-medium" style={{ color: "var(--ch-text)" }}>{a.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] text-slate-500">{a.accuracy}%</span>
                    <div className="w-16">
                      <ProgressBar value={a.accuracy} tone={isWarn ? "amber" : "cyan"} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="mt-4 rounded-xl px-3 py-2.5"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">gerente IA recomenda</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Apollo precisa de aprovação para aumentar budget no Meta Ads.
            </p>
          </div>
        </div>

        {/* Conversations summary */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
        >
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">conversas · hoje</p>
          <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>Atendimento IA</p>
          <div className="mt-4 divide-y" style={{ borderColor: "var(--ch-border)" }}>
            {conversations.slice(0, 4).map((c) => (
              <div key={c.lead} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium" style={{ color: "var(--ch-text)" }}>{c.lead}</span>
                  <span className="font-mono text-[10px]" style={{ color: "var(--ch-accent)" }}>{c.score}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{c.channel}</span>
                  <span className="text-[10px] text-slate-500 truncate max-w-[140px]">{c.summary}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Leads area chart ── */}
      <div className="mb-4">
        <AreaChartPanel
          title="Evolução de Leads"
          eyebrow="captação mensal · todos os canais"
          value="1.284 leads"
          trend="+22%"
          data={leadsChartData}
          color="#06b6d4"
          filters={["1S", "1M", "3M", "6M", "1A"]}
        />
      </div>

      {/* ── Metric cards ── */}
      <div className="mb-4 grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-4">
        {clientMetrics.map((metric, i) => (
          <MetricCard key={metric.label} icon={metricIcons[i]} {...metric} />
        ))}
      </div>

      {/* ── Agents grid + Lead pulse ── */}
      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel
          id="agentes"
          title="Agent Task Force"
          eyebrow="funcionários IA · operação agora"
          action={<NeonBadge tone="green">4 ativos</NeonBadge>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {agentSquad.map((agent) => (
              <AgentCard
                key={agent.name}
                name={agent.name}
                role={agent.role}
                status={agent.status}
                accuracy={agent.accuracy}
                current={agent.current}
                accent="cyan"
              />
            ))}
          </div>
        </Panel>

        {/* Lead Pulse */}
        <Panel
          id="leads"
          title="Lead Pulse"
          eyebrow="captura · origem · score"
          action={<NeonBadge tone="cyan">1.284</NeonBadge>}
        >
          <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
            {leads.map((lead) => (
              <div key={lead.name} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <NeonBadge tone={lead.channel === "WhatsApp" ? "green" : lead.channel === "Instagram" ? "violet" : "cyan"}>
                        {lead.channel}
                      </NeonBadge>
                      <span className="text-[12.5px] font-medium" style={{ color: "var(--ch-text)" }}>{lead.name}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">{lead.lastEvent}</p>
                    <div className="mt-1 flex gap-3 font-mono text-[9px] text-slate-400">
                      <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{lead.location}</span>
                      <span className="flex items-center gap-1"><Smartphone className="h-2.5 w-2.5" />{lead.device}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-mono text-[16px] font-bold" style={{ color: "var(--ch-accent)" }}>{lead.score}</span>
                    <div className="font-mono text-[9px] text-slate-400">score</div>
                    <div className="mt-0.5 font-mono text-[9px] text-emerald-500">{lead.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Funnel + Conversations + IA Insight ── */}
      <div className="mb-4 grid gap-4 xl:grid-cols-[220px_1fr]">
        {/* Funnel */}
        <Panel id="crm" title="Funil de vendas" eyebrow="do clique à venda">
          <div className="space-y-3">
            {funnelStages.map((stage) => {
              const t = toneClass(stage.tone);
              return (
                <div key={stage.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[12px] text-slate-500">{stage.label}</span>
                    <span className={`font-mono text-[12px] font-semibold ${t.text}`}>{stage.count}</span>
                  </div>
                  <ProgressBar value={stage.value} tone={stage.tone} />
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Conversations + IA */}
        <Panel id="conversas" title="Conversas ativas" eyebrow="WhatsApp · Instagram · IA insight">
          <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
            {/* List */}
            <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
              {conversations.map((c) => (
                <div key={c.lead} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[12px] font-medium" style={{ color: "var(--ch-text)" }}>{c.lead}</span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--ch-accent)" }}>{c.score}</span>
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-wide text-slate-400">{c.channel}</div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">{c.summary}</p>
                </div>
              ))}
            </div>

            {/* IA insight */}
            <div
              className="rounded-xl p-4"
              style={{ background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.2)" }}
            >
              <div className="mb-3 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--ch-accent)" }}>
                <MessageCircle className="h-3 w-3" />
                IA Insight
              </div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>Próxima melhor resposta</p>
              <p className="mt-2 text-[12px] leading-5 text-slate-500">
                João está pronto para oferta com garantia, bônus e link. Reforçar que não precisa de site nem API do Google.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[["Sentimento","Quente"],["Intenção","Alta"],["Próx. etapa","Checkout"]].map(([l, v]) => (
                  <KpiStat key={l} label={l} value={v} tone="cyan" />
                ))}
              </div>
              <div
                className="mt-3 rounded-xl p-3"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-emerald-500">rascunho gerado</p>
                <p className="text-[11px] leading-4 text-slate-500">
                  João, perfeito. Você começa sem site. Ativo seu agente, conecto o WhatsApp e ele conduz os leads. Mando o link com bônus de hoje?
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                {[
                  { label: "Enviar pelo agente", accent: true },
                  { label: "Editar rascunho", accent: false },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    className="flex-1 rounded-xl py-2 font-mono text-[10px] uppercase tracking-wide transition"
                    style={btn.accent
                      ? { background: "var(--ch-accent)", color: "#fff" }
                      : { background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-muted)" }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Links rastreáveis + Campaigns + Automations ── */}
      <div className="grid gap-4 xl:grid-cols-[280px_1fr_280px]">
        {/* Tracker links */}
        <Panel id="links" title="Links rastreáveis" eyebrow="cliques · UTM · conversão">
          <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
            {trackerLinks.map((link) => (
              <div key={link.alias} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px]" style={{ color: "var(--ch-accent)" }}>{link.alias}</span>
                  <span className="font-mono text-[10px] text-emerald-500">{link.conversion}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 truncate">{link.destination}</div>
                <div className="mt-1 flex gap-3 font-mono text-[9px] text-slate-400">
                  <span>{link.clicks} cliques</span>
                  <span>{link.unique} únicos</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <MiniSparkline color="#06b6d4" data={[20, 32, 28, 48, 56, 72, 88]} />
            <div className="mt-3 space-y-2">
              {[
                [Eye,  "Visualizou oferta", "4.812"],
                [Link2,"Clicou CTA",        "2.104"],
                [Send, "Foi ao WhatsApp",   "936"],
              ].map(([Icon, label, value]) => {
                const I = Icon as typeof Eye;
                return (
                  <div key={label as string} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <I className="h-3 w-3 text-slate-400" />
                      {label as string}
                    </span>
                    <span className="font-mono text-[11px] font-medium" style={{ color: "var(--ch-text)" }}>{value as string}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* Campaigns */}
        <Panel id="campanhas" title="Campanhas ativas" eyebrow="pago · orgânico · ROAS">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => (
              <div
                key={c.name}
                className="rounded-xl p-3"
                style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <StatusBadge status={c.status} />
                  <Megaphone className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <div className="text-[12.5px] font-semibold" style={{ color: "var(--ch-text)" }}>{c.name}</div>
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-400">{c.platform}</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ["Budget", c.budget, ""],
                    ["Leads",  c.leads,  "accent"],
                    ["Gasto",  c.spent,  ""],
                    ["ROAS",   c.roas,   "green"],
                  ].map(([lbl, val, col]) => (
                    <div key={lbl as string}>
                      <div className="font-mono text-[9px] text-slate-400">{lbl as string}</div>
                      <div
                        className="font-mono text-[11px] font-semibold"
                        style={{
                          color: col === "accent" ? "var(--ch-accent)"
                               : col === "green"  ? "#10b981"
                               : "var(--ch-text)",
                        }}
                      >
                        {val as string}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Automations */}
        <Panel id="automacoes" title="Automações" eyebrow="gatilhos · execuções">
          <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
            {automations.map((a) => (
              <div key={a.trigger} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={a.status} />
                      <span className="truncate text-[12px] font-medium" style={{ color: "var(--ch-text)" }}>{a.trigger}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">{a.action}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[9px] text-slate-400">exec.</div>
                    <div className="font-mono text-[14px] font-bold text-emerald-500">{a.runs}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick stats */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              [Zap,        "Gatilhos ativos", "14"],
              [Check,      "Taxa de sucesso",  "97%"],
            ].map(([Icon, label, value]) => {
              const I = Icon as typeof Zap;
              return (
                <div
                  key={label as string}
                  className="rounded-xl p-3"
                  style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
                >
                  <I className="h-3.5 w-3.5 text-slate-400" />
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
