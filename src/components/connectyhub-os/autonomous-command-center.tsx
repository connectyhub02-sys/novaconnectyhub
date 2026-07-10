import {
  Activity,
  Bot,
  BrainCircuit,
  DatabaseZap,
  FileText,
  Layers3,
  MessageCircle,
  Network,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  AdminAgent,
  AdminWhatsappInstance,
  AutonomousAdminOverview,
  ContentPipelineItem,
  IntelligenceEvent,
  IntelligenceMemory,
} from "@/lib/autonomous-os/admin";
import type { StatusTone } from "@/lib/connectyhub-os-data";
import { cn } from "@/lib/utils";
import { ConnectyShell } from "./connecty-shell";
import {
  DataTable,
  KpiStat,
  NeonBadge,
  PageHeader,
  Panel,
  ProgressBar,
  StatusBadge,
} from "./panel-primitives";
import { AgentAvatarUpload } from "./agent-avatar-upload";
import { AgentPromptEditor } from "./agent-prompt-editor";
import { SyncWhatsAppInstancesButton } from "./sync-whatsapp-instances-button";

type AutonomousView = "agents" | "intelligence" | "instances" | "content";
type AgentSectorGroup = { sectorCode: string; sectorName: string; agents: AdminAgent[] };

const viewMeta: Record<
  AutonomousView,
  {
    href: string;
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  agents: {
    href: "/admin/agentes",
    eyebrow: "Admin OS / Empresa autonoma",
    title: "Agentes internos da ConnectyHub",
    description: "Operarios IA da plataforma. Eles analisam, auditam e coordenam o sistema, mas nao atendem leads diretamente.",
  },
  intelligence: {
    href: "/admin/inteligencia",
    eyebrow: "Admin OS / Central de inteligencia",
    title: "Memoria viva do ecossistema",
    description: "Dados coletados por agentes internos e externos para orientar atendimento, marketing, conteudo e financeiro.",
  },
  instances: {
    href: "/admin/clientes/whatsapp",
    eyebrow: "Admin OS / Controle dos clientes",
    title: "Instancias WhatsApp conectadas",
    description: "Todos os numeros conectados pelos usuarios aparecem aqui para monitoramento, auditoria e suporte.",
  },
  content: {
    href: "/admin/conteudo",
    eyebrow: "Admin OS / Blog e noticias",
    title: "Pipeline de conteudo e noticias",
    description: "Pautas, pesquisas, noticias e posts criados a partir da central de inteligencia da ConnectyHub.",
  },
};

export function AutonomousCommandCenter({
  overview,
  userLabel = "CEO_HUMAN_ADM",
  view,
}: {
  overview: AutonomousAdminOverview;
  userLabel?: string;
  view: AutonomousView;
}) {
  const meta = viewMeta[view];

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel} activeHref={meta.href}>
      <PageHeader
        eyebrow={meta.eyebrow}
        title={meta.title}
        description={meta.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone={overview.schemaReady ? "green" : "amber"}>
              {overview.schemaReady ? "Schema autonomo pronto" : "Aguardando SQL 0006"}
            </NeonBadge>
            <NeonBadge tone="cyan">Gemini core</NeonBadge>
          </div>
        }
      />

      {overview.warnings.length > 0 && (
        <Panel className="mb-5" title="Aviso da fundacao autonoma" eyebrow="supabase / schema">
          <div
            className="rounded-xl p-4 text-[13px] leading-6 text-slate-600"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)" }}
          >
            <p className="font-semibold text-amber-700">
              Rode a migration 0006 no Supabase para ativar agentes, central de inteligencia, instancias e plano de recursos.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {overview.warnings.slice(0, 4).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      <AutonomousKpis overview={overview} />

      {view === "agents" && <AgentsView overview={overview} />}
      {view === "intelligence" && <IntelligenceView overview={overview} />}
      {view === "instances" && <InstancesView overview={overview} />}
      {view === "content" && <ContentView overview={overview} />}
    </ConnectyShell>
  );
}

function AutonomousKpis({ overview }: { overview: AutonomousAdminOverview }) {
  return (
    <div className="mb-5 grid grid-cols-4 gap-1.5 sm:gap-2 xl:gap-4">
      <SignalCard
        icon={Bot}
        label="Operarios IA"
        value={String(overview.summary.systemAgents)}
        detail={`${overview.summary.whatsappAgents} atendentes fora da operacao interna`}
        tone="cyan"
      />
      <SignalCard
        icon={BrainCircuit}
        label="Central de inteligencia"
        value={String(overview.summary.intelligenceMemories)}
        detail={`${overview.summary.intelligenceEvents} eventos recentes`}
        tone="violet"
      />
      <SignalCard
        icon={MessageCircle}
        label="WhatsApp clientes"
        value={String(overview.summary.whatsappInstances)}
        detail={`${overview.summary.connectedWhatsapps} conectadas`}
        tone="green"
      />
      <SignalCard
        icon={Layers3}
        label="Planos controlados"
        value={String(overview.summary.activePlans)}
        detail={`${overview.summary.contentItems} itens de conteudo`}
        tone="amber"
      />
    </div>
  );
}

function AgentsView({ overview }: { overview: AutonomousAdminOverview }) {
  const systemAgents = overview.agents.filter((agent) => agent.agentType === "system_operator");
  const groups = groupAgentsBySector(systemAgents);

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel title="Mapa da empresa IA" eyebrow="setores / agentes / prompts">
        {groups.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map((group) => (
              <SectorAgentCluster key={group.sectorCode} group={group} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Bot}
            title="Nenhum agente registrado"
            text="Agentes internos aparecem aqui. WhatsApp dos clientes fica em Clientes / WhatsApp."
          />
        )}
      </Panel>

      <div className="space-y-5 2xl:sticky 2xl:top-20 2xl:self-start">
        <Panel title="Governanca de autonomia" eyebrow="humano / ia / aprovacao">
          <div className="space-y-3">
            <GovernanceRule
              icon={ShieldCheck}
              title="Aprovacao humana no inicio"
              text="Agentes entram como needs_review ou paused ate testarmos cada fluxo com seguranca."
            />
            <GovernanceRule
              icon={Workflow}
              title="Inngest como agenda"
              text="Cada funcao recorrente pode ganhar evento e cron para relatorios, follow-up e operacao WhatsApp."
            />
            <GovernanceRule
              icon={DatabaseZap}
              title="Tudo alimenta a memoria"
              text="Coletor externo, atendente, analista e conteudo gravam sinais para a central de inteligencia."
            />
          </div>
        </Panel>

        <Panel title="Ultimas execucoes" eyebrow="agent runs">
          {overview.runs.length > 0 ? (
            <div className="space-y-3">
              {overview.runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              title="Sem execucoes ainda"
              text="Quando os eventos Inngest ou webhooks chamarem agentes, o historico aparece aqui."
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function SectorAgentCluster({ group }: { group: AgentSectorGroup }) {
  const isWide = group.agents.length > 1;

  return (
    <section
      className={cn("rounded-2xl p-4", isWide && "xl:col-span-2")}
      style={{
        background: "linear-gradient(180deg, rgba(var(--ch-text-rgb),0.035), rgba(var(--ch-text-rgb),0.015))",
        border: "1px solid var(--ch-border)",
      }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
            {group.sectorName}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
            {group.agents.length} {group.agents.length === 1 ? "agente responsavel" : "agentes responsaveis"}
          </p>
        </div>
        <NeonBadge tone="cyan">{group.sectorCode}</NeonBadge>
      </div>

      <div className={cn("grid gap-3", isWide && "lg:grid-cols-2")}>
        {group.agents.map((agent) => (
          <AgentOperatingCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}

function IntelligenceView({ overview }: { overview: AutonomousAdminOverview }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_430px]">
      <Panel title="Memorias estruturadas" eyebrow="central de inteligencia">
        {overview.intelligenceMemory.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {overview.intelligenceMemory.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BrainCircuit}
            title="Central ainda sem memorias"
            text="Os agentes coletores vao gravar aprendizados internos e externos aqui."
          />
        )}
      </Panel>

      <Panel title="Eventos recentes" eyebrow="coleta / origem / confianca">
        {overview.intelligenceEvents.length > 0 ? (
          <div className="space-y-3">
            {overview.intelligenceEvents.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Network}
            title="Nenhum evento recente"
            text="Conversas, noticias, pesquisas e dados internos vao gerar eventos nesta fila."
          />
        )}
      </Panel>
    </div>
  );
}

function InstancesView({ overview }: { overview: AutonomousAdminOverview }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <Panel title="Instancias dos clientes" eyebrow="whatsapp / uazapi / webhook">
        {overview.whatsappInstances.length > 0 ? (
          <DataTable
            columns={["Empresa", "Numero", "Status", "Provedor", "Ultima mensagem", "Webhook"]}
            rows={overview.whatsappInstances.map((instance) => [
              <InstanceName key="name" instance={instance} />,
              <span key="phone" className="font-mono text-[11px] text-slate-600">
                {instance.phoneNumber ?? "Sem numero"}
              </span>,
              <StatusBadge key="status" status={instanceStatusTone(instance.status)} label={instance.status} />,
              <span key="provider" className="font-mono text-[10px] uppercase text-slate-500">
                {instance.provider}
              </span>,
              <span key="last" className="text-[12px] text-slate-500">
                {formatDate(instance.lastMessageAt)}
              </span>,
              <span key="webhook" className="font-mono text-[10px] text-slate-500">
                {instance.webhookUrl ? "Configurado" : "Pendente"}
              </span>,
            ])}
          />
        ) : (
          <EmptyState
            icon={MessageCircle}
            title="Nenhum WhatsApp conectado"
            text="Quando um cliente conectar o WhatsApp no Client OS, a instancia aparece aqui no Admin OS."
          />
        )}
      </Panel>

      <Panel title="Controle administrativo" eyebrow="visao do admin">
        <div className="space-y-3">
          <SyncWhatsAppInstancesButton />
          <GovernanceRule
            icon={MessageCircle}
            title="Cliente conecta, admin monitora"
            text="O cliente nao digita token de instancia. Ele escaneia QR Code e o sistema registra tudo aqui."
          />
          <GovernanceRule
            icon={Network}
            title="Webhook por instancia"
            text="Cada numero deve ter token, webhook e status acompanhados pelo painel admin."
          />
          <GovernanceRule
            icon={ShieldCheck}
            title="Auditoria por empresa"
            text="Todas as instancias ficam isoladas por organizacao, mas visiveis para o Platform Admin."
          />
        </div>
      </Panel>
    </div>
  );
}

function ContentView({ overview }: { overview: AutonomousAdminOverview }) {
  const growthSectors = [
    "conteudo",
    "noticias",
    "inteligencia_externa",
    "radar_mercado",
    "inteligencia_competitiva",
    "seo_organico",
    "aeo_respostas",
    "geo_ago",
  ];
  const contentAgents = overview.agents.filter((agent) =>
    growthSectors.includes(agent.sectorCode)
      || agent.metadata.growth_engine === true
      || agent.metadata.seo_aeo_geo === true,
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_410px]">
      <Panel title="Pautas e noticias" eyebrow="blog / social / pesquisa">
        {overview.contentPipeline.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {overview.contentPipeline.map((item) => (
              <ContentCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Pipeline sem itens"
            text="O agente de noticias e o agente de blog vao criar pautas a partir da memoria do ecossistema."
          />
        )}
      </Panel>

      <Panel title="Agentes de crescimento" eyebrow="seo / aeo / geo">
        {contentAgents.length > 0 ? (
          <div className="space-y-3">
            {contentAgents.map((agent) => (
              <AgentMini key={agent.id} agent={agent} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="Sem agentes de crescimento"
            text="Depois da migration, os agentes de pesquisa, noticias, blog, radar, SEO, AEO e GEO aparecem aqui."
          />
        )}
      </Panel>
    </div>
  );
}

function SignalCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "cyan" | "amber" | "violet";
}) {
  const color = tone === "green" ? "#10b981" : tone === "cyan" ? "#06b6d4" : tone === "amber" ? "#f59e0b" : "#8b5cf6";

  return (
    <div
      className="min-w-0 rounded-xl p-2 sm:rounded-2xl sm:p-5"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex min-w-0 items-start justify-between gap-1.5 sm:gap-3">
        <p className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-widest">{label}</p>
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex" style={{ background: `${color}18`, color }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-1 truncate font-mono text-[15px] font-bold leading-none sm:mt-4 sm:text-[28px]" style={{ color: "var(--ch-text)" }}>
        {value}
      </p>
      <p className="mt-1 hidden truncate text-[12px] text-slate-500 sm:mt-3 sm:block">{detail}</p>
    </div>
  );
}

function AgentOperatingCard({ agent }: { agent: AdminAgent }) {
  return (
    <div
      className="flex h-full flex-col rounded-xl p-3.5"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="mb-3 grid grid-cols-[auto_1fr_auto] items-start gap-3">
        <AgentAvatar agent={agent} size="sm" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={agentStatusTone(agent.status)} label={agent.status} />
            <span className="rounded-lg px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-slate-500" style={{ border: "1px solid var(--ch-border)" }}>
              {agent.llmProvider}
            </span>
          </div>
          <p className="mt-2 truncate text-[15px] font-semibold" style={{ color: "var(--ch-text)" }}>
              {agent.personaName}
          </p>
          <p className="truncate text-[12px] text-slate-500">{agent.name}</p>
          <p className="truncate font-mono text-[9px] uppercase tracking-widest text-slate-500">
            {agent.roleTitle}
          </p>
          <AgentAvatarUpload agentId={agent.id} agentName={agent.personaName} />
        </div>
        <div
          className="rounded-xl px-2.5 py-2 text-right"
          style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
        >
          <p className="font-mono text-[8px] uppercase tracking-widest text-slate-500">auto</p>
          <p className="font-mono text-[14px] font-bold" style={{ color: agent.autonomyLevel >= 70 ? "#34d399" : "#fbbf24" }}>
            {agent.autonomyLevel}%
          </p>
        </div>
      </div>

      <p className="text-[12px] leading-5 text-slate-500">
        {agent.profileBio ?? agent.description ?? "Sem descricao operacional."}
      </p>
      <AgentPromptEditor
        agentId={agent.id}
        agentName={agent.personaName}
        currentPrompt={agent.prompt ?? ""}
        promptPreview={agent.promptPreview}
      />

      <div className="mt-3">
        <div className="mb-1.5 flex justify-between font-mono text-[9px] uppercase tracking-widest text-slate-500">
          <span>Autonomia</span>
          <span>{agent.requiresHumanApproval ? "com aprovacao" : "autonomo"}</span>
        </div>
        <ProgressBar value={agent.autonomyLevel} tone={agent.autonomyLevel >= 70 ? "green" : "cyan"} />
      </div>

      <TagRow tags={[...agent.tools.slice(0, 3), ...agent.triggers.slice(0, 2)]} />
    </div>
  );
}

function AgentMini({ agent }: { agent: AdminAgent }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <AgentAvatar agent={agent} size="sm" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{agent.personaName}</p>
            <p className="text-[11px] text-slate-500">{agent.name}</p>
            <p className="mt-1 text-[12px] text-slate-500">{agent.profileBio ?? agent.description}</p>
            {(agent.scheduleRrule || agent.inngestEventName) && (
              <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-slate-500">
                {formatSchedule(agent.scheduleRrule)} / {agent.inngestEventName ?? "sem evento"}
              </p>
            )}
          </div>
        </div>
        <StatusBadge status={agentStatusTone(agent.status)} label={agent.status} />
      </div>
      <TagRow tags={agent.triggers.slice(0, 3)} />
    </div>
  );
}

function AgentAvatar({ agent, size }: { agent: AdminAgent; size: "sm" | "lg" }) {
  const dimension = size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const initials = getInitials(agent.personaName);
  const backgroundImage = agent.avatarUrl ? `url("${sanitizeCssUrl(agent.avatarUrl)}")` : undefined;

  return (
    <div
      role="img"
      aria-label={agent.avatarAlt ?? `Foto de ${agent.personaName}`}
      className={`${dimension} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border font-mono text-[11px] font-bold uppercase text-cyan-700`}
      style={{
        background: backgroundImage ? "#e0f2fe" : "linear-gradient(135deg, rgba(6,182,212,0.18), rgba(1,0,76,0.12))",
        backgroundImage,
        backgroundPosition: "center",
        backgroundSize: "cover",
        borderColor: "rgba(6,182,212,0.25)",
        boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
      }}
    >
      {!agent.avatarUrl && initials}
    </div>
  );
}

function GovernanceRule({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">{text}</p>
        </div>
      </div>
    </div>
  );
}

function RunRow({ run }: { run: { runStatus: string; triggerSource: string | null; outputSummary: string | null; errorMessage: string | null; costCredits: number; startedAt: string } }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={runStatusTone(run.runStatus)} label={run.runStatus} />
        <span className="font-mono text-[10px] text-slate-500">{formatDate(run.startedAt)}</span>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-slate-500">
        {run.outputSummary ?? run.errorMessage ?? run.triggerSource ?? "Execucao registrada sem resumo."}
      </p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        {run.costCredits} creditos
      </p>
    </div>
  );
}

function MemoryCard({ memory }: { memory: IntelligenceMemory }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <NeonBadge tone="violet">{memory.memoryType}</NeonBadge>
          <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>{memory.title}</p>
        </div>
        <KpiStat label="peso" value={`${Math.round(memory.importance * 100)}%`} tone="violet" />
      </div>
      <p className="mt-3 text-[12px] leading-5 text-slate-500">{memory.content}</p>
      <TagRow tags={memory.tags} />
    </div>
  );
}

function EventRow({ event }: { event: IntelligenceEvent }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
            {event.sourceType} / {event.eventType}
          </p>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{event.title}</p>
        </div>
        <span className="font-mono text-[10px] text-slate-500">{formatDate(event.occurredAt)}</span>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-slate-500">{event.summary ?? "Evento sem resumo."}</p>
      <TagRow tags={event.tags} />
    </div>
  );
}

function ContentCard({ item }: { item: ContentPipelineItem }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <StatusBadge status={contentStatusTone(item.status)} label={item.status} />
          <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>{item.title}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
          <FileText className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-slate-500">{item.summary ?? "Sem resumo."}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <KpiStat label="tipo" value={item.contentType} tone="cyan" />
        <KpiStat label="agenda" value={formatDate(item.scheduledFor)} tone="amber" />
      </div>
      <TagRow tags={item.tags} />
    </div>
  );
}

function InstanceName({ instance }: { instance: AdminWhatsappInstance }) {
  return (
    <div>
      <p className="text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
        {instance.organizationName}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
        {instance.organizationPlan ?? instance.planCode ?? "sem plano"}
      </p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div
      className="flex min-h-[180px] flex-col items-center justify-center rounded-xl p-6 text-center"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  const visibleTags = tags.filter(Boolean).slice(0, 5);

  if (visibleTags.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {visibleTags.map((tag) => (
        <span
          key={tag}
          className="rounded-md px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-slate-500"
          style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function sanitizeCssUrl(value: string) {
  return value.replace(/["\\\n\r]/g, "");
}

function groupAgentsBySector(agents: AdminAgent[]): AgentSectorGroup[] {
  const groups = new Map<string, AgentSectorGroup>();

  for (const agent of agents) {
    const existing = groups.get(agent.sectorCode);

    if (existing) {
      existing.agents.push(agent);
    } else {
      groups.set(agent.sectorCode, {
        sectorCode: agent.sectorCode,
        sectorName: agent.sectorName,
        agents: [agent],
      });
    }
  }

  return Array.from(groups.values());
}

function agentStatusTone(status: string): StatusTone {
  if (status === "online") return "online";
  if (status === "needs_review") return "warning";
  if (status === "archived") return "critical";
  return "idle";
}

function runStatusTone(status: string): StatusTone {
  if (status === "completed") return "online";
  if (status === "failed" || status === "cancelled") return "critical";
  if (status === "running" || status === "needs_approval") return "warning";
  return "idle";
}

function instanceStatusTone(status: string): StatusTone {
  if (status === "connected") return "online";
  if (status === "qr_pending") return "warning";
  if (status === "blocked" || status === "error") return "critical";
  return "idle";
}

function contentStatusTone(status: string): StatusTone {
  if (status === "published" || status === "approved") return "online";
  if (status === "review" || status === "scheduled") return "warning";
  if (status === "archived") return "critical";
  return "idle";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Pendente";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Pendente";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatSchedule(value: string | null | undefined) {
  if (!value) {
    return "sem cron";
  }

  return value
    .replace("FREQ=", "")
    .replace("BYDAY=", "dias=")
    .replace("BYHOUR=", "hora=")
    .replace("BYMINUTE=", "min=")
    .toLowerCase();
}
