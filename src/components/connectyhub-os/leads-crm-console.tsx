"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  Archive,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Filter,
  Globe2,
  Laptop,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Target,
  X,
} from "lucide-react";
import { KpiStat, NeonBadge, PageHeader, Panel, ProgressBar } from "@/components/connectyhub-os/panel-primitives";
import { cn } from "@/lib/utils";
import type {
  ClientLeadActivity,
  ClientLeadCrmWorkspace,
  ClientLeadMessage,
  ClientLeadRecord,
  ClientLeadStatus,
} from "@/lib/client-os/leads-crm";

type ConsoleMode = "leads" | "crm" | "conversas";

type LeadCrmConsoleProps = {
  mode: ConsoleMode;
  workspace: ClientLeadCrmWorkspace;
};

const statusOptions: Array<{ value: "all" | ClientLeadStatus; label: string }> = [
  { value: "all", label: "Todos os status" },
  { value: "new", label: "Novos" },
  { value: "active", label: "Em atendimento" },
  { value: "qualified", label: "Qualificados" },
  { value: "won", label: "Convertidos" },
  { value: "lost", label: "Perdidos" },
  { value: "archived", label: "Arquivados" },
];

const statusMeta: Record<ClientLeadStatus, { label: string; tone: "cyan" | "green" | "amber" | "rose" | "violet" | "zinc"; dot: string }> = {
  new: { label: "Novo", tone: "violet", dot: "bg-violet-400" },
  active: { label: "Em atendimento", tone: "cyan", dot: "bg-cyan-400" },
  qualified: { label: "Qualificado", tone: "green", dot: "bg-emerald-400" },
  won: { label: "Convertido", tone: "green", dot: "bg-emerald-400" },
  lost: { label: "Perdido", tone: "rose", dot: "bg-rose-400" },
  archived: { label: "Arquivado", tone: "zinc", dot: "bg-slate-400" },
};

export function LeadCrmConsole({ mode, workspace }: LeadCrmConsoleProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ClientLeadStatus>("all");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(workspace.leads[0]?.id ?? null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(workspace.leads[0]?.id ?? null);
  const [detailsLeadId, setDetailsLeadId] = useState<string | null>(null);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();

    return workspace.leads.filter((lead) => {
      const matchesStatus = status === "all" || lead.status === status;
      const haystack = [
        lead.name,
        lead.phone,
        lead.email,
        lead.companyName,
        lead.agentName,
        lead.source,
        lead.technical.location,
        lead.qualification.mainPain,
        lead.qualification.nextBestAction,
        lead.qualification.fields.map((field) => field.value).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!query || haystack.includes(query));
    });
  }, [search, status, workspace.leads]);

  const selectedLead = workspace.leads.find((lead) => lead.id === selectedLeadId) ?? filteredLeads[0] ?? workspace.leads[0] ?? null;
  const detailsLead = workspace.leads.find((lead) => lead.id === detailsLeadId) ?? null;
  const header = getHeaderCopy(mode);

  if (!workspace.companies.length) {
    return (
      <section>
        <PageHeader eyebrow={header.eyebrow} title={header.title} description="Cadastre uma empresa para liberar leads, conversas e CRM." />
        <Panel eyebrow="Workspace" title="Nenhuma empresa cadastrada">
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-white">Crie sua primeira empresa</p>
              <p className="mt-1 max-w-[440px] text-[12px] leading-5 text-slate-400">
                Depois disso, o WhatsApp, os agentes e os leads ficam vinculados a empresa correta.
              </p>
            </div>
            <Link
              className="inline-flex h-10 items-center rounded-xl bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
              href="/dashboard/empresa"
            >
              Nova empresa
            </Link>
          </div>
        </Panel>
      </section>
    );
  }

  return (
    <section>
      <PageHeader eyebrow={header.eyebrow} title={header.title} description={header.description} />

      {mode !== "conversas" ? <LeadStats workspace={workspace} /> : null}

      {mode === "leads" ? (
        <LeadsView
          filteredLeads={filteredLeads}
          search={search}
          setDetailsLeadId={setDetailsLeadId}
          setSearch={setSearch}
          setStatus={setStatus}
          status={status}
        />
      ) : null}

      {mode === "crm" ? (
        <CrmView
          expandedLeadId={expandedLeadId}
          filteredLeads={filteredLeads}
          search={search}
          setDetailsLeadId={setDetailsLeadId}
          setExpandedLeadId={setExpandedLeadId}
          setSearch={setSearch}
          setStatus={setStatus}
          status={status}
        />
      ) : null}

      {mode === "conversas" ? (
        <ConversationsView
          filteredLeads={filteredLeads}
          search={search}
          selectedLead={selectedLead}
          selectedLeadId={selectedLead?.id ?? null}
          setDetailsLeadId={setDetailsLeadId}
          setSearch={setSearch}
          setSelectedLeadId={setSelectedLeadId}
          setStatus={setStatus}
          status={status}
          totalLeads={workspace.leads.length}
        />
      ) : null}

      {detailsLead ? <LeadDetailsModal lead={detailsLead} onClose={() => setDetailsLeadId(null)} /> : null}
    </section>
  );
}

function LeadStats({ workspace }: { workspace: ClientLeadCrmWorkspace }) {
  return (
    <div className="mb-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiStat label="Total" value={String(workspace.stats.total)} tone="cyan" />
      <KpiStat label="Novos" value={String(workspace.stats.new)} tone="violet" />
      <KpiStat label="Ativos" value={String(workspace.stats.active)} tone="cyan" />
      <KpiStat label="Qualificados" value={String(workspace.stats.qualified)} tone="green" />
      <KpiStat label="Convertidos" value={String(workspace.stats.converted)} tone="green" />
      <KpiStat label="Arquivados" value={String(workspace.stats.archived)} tone="zinc" />
    </div>
  );
}

function LeadsView({
  filteredLeads,
  search,
  setDetailsLeadId,
  setSearch,
  setStatus,
  status,
}: {
  filteredLeads: ClientLeadRecord[];
  search: string;
  setDetailsLeadId: (id: string) => void;
  setSearch: (value: string) => void;
  setStatus: (value: "all" | ClientLeadStatus) => void;
  status: "all" | ClientLeadStatus;
}) {
  return (
    <Panel
      eyebrow="Comercial / Leads"
      title="Todos os leads"
      action={<NeonBadge tone="cyan">{filteredLeads.length} registros</NeonBadge>}
    >
      <LeadFilters search={search} setSearch={setSearch} setStatus={setStatus} status={status} />
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[1.2fr_150px_1fr_130px_130px_130px_110px] gap-3 border-b border-white/10 px-3 pb-3 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            <span>Lead</span>
            <span>Telefone</span>
            <span>Empresa / agente</span>
            <span>Status</span>
            <span>Origem</span>
            <span>Ultimo contato</span>
            <span className="text-right">Acoes</span>
          </div>
          <div className="divide-y divide-white/10">
            {filteredLeads.map((lead) => (
              <button
                key={lead.id}
                className="grid w-full grid-cols-[1.2fr_150px_1fr_130px_130px_130px_110px] items-center gap-3 px-3 py-4 text-left transition hover:bg-cyan-500/5"
                onClick={() => setDetailsLeadId(lead.id)}
                type="button"
              >
                <LeadIdentity lead={lead} />
                <LeadField icon={Phone} value={lead.phone ?? "Sem telefone"} />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-white">{lead.companyName}</p>
                  <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">{lead.agentName ?? "Sem agente"}</p>
                </div>
                <StatusPill status={lead.status} />
                <span className="truncate text-[12px] text-slate-300">{lead.source}</span>
                <span className="text-[12px] text-slate-400">{formatDate(lead.lastMessageAt ?? lead.updatedAt)}</span>
                <span className="justify-self-end rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-wide text-cyan-300">
                  Detalhes
                </span>
              </button>
            ))}
          </div>
          {!filteredLeads.length ? <EmptyState title="Nenhum lead encontrado" detail="Quando o WhatsApp receber mensagens, os leads aparecem aqui." /> : null}
        </div>
      </div>
    </Panel>
  );
}

function CrmView({
  expandedLeadId,
  filteredLeads,
  search,
  setDetailsLeadId,
  setExpandedLeadId,
  setSearch,
  setStatus,
  status,
}: {
  expandedLeadId: string | null;
  filteredLeads: ClientLeadRecord[];
  search: string;
  setDetailsLeadId: (id: string) => void;
  setExpandedLeadId: (id: string | null) => void;
  setSearch: (value: string) => void;
  setStatus: (value: "all" | ClientLeadStatus) => void;
  status: "all" | ClientLeadStatus;
}) {
  return (
    <Panel eyebrow="CRM / Funil" title="CRM de leads">
      <LeadFilters search={search} setSearch={setSearch} setStatus={setStatus} status={status} />
      <div className="mt-4 space-y-3">
        {filteredLeads.map((lead) => {
          const expanded = expandedLeadId === lead.id;

          return (
            <div key={lead.id} className="rounded-2xl border border-white/10 bg-white/[0.02]">
              <button
                className="grid w-full gap-3 p-4 text-left md:grid-cols-[minmax(0,1.4fr)_130px_130px_130px_34px]"
                onClick={() => setExpandedLeadId(expanded ? null : lead.id)}
                type="button"
              >
                <LeadIdentity lead={lead} />
                <ScoreRing score={lead.score} />
                <StatusPill status={lead.status} />
                <span className="self-center text-[12px] text-slate-400">{formatDateTime(lead.lastMessageAt ?? lead.updatedAt)}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>
              {expanded ? (
                <div className="grid gap-4 border-t border-white/10 p-4 lg:grid-cols-[1fr_1.1fr]">
                  <div className="space-y-3">
                    <InfoPanel title="Resumo inteligente" text={lead.summary} />
                    <QualificationGrid lead={lead} />
                    <button
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-400/15"
                      onClick={() => setDetailsLeadId(lead.id)}
                      type="button"
                    >
                      Ver arquivo completo
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                    <MiniChat lead={lead} messages={lead.conversation.messages.slice(-4)} />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {!filteredLeads.length ? <EmptyState title="CRM sem leads" detail="Os leads entram no funil quando chegam pelo WhatsApp ou pelos links rastreados." /> : null}
      </div>
    </Panel>
  );
}

function ConversationsView({
  filteredLeads,
  search,
  selectedLead,
  selectedLeadId,
  setDetailsLeadId,
  setSearch,
  setSelectedLeadId,
  setStatus,
  status,
  totalLeads,
}: {
  filteredLeads: ClientLeadRecord[];
  search: string;
  selectedLead: ClientLeadRecord | null;
  selectedLeadId: string | null;
  setDetailsLeadId: (id: string) => void;
  setSearch: (value: string) => void;
  setSelectedLeadId: (id: string) => void;
  setStatus: (value: "all" | ClientLeadStatus) => void;
  status: "all" | ClientLeadStatus;
  totalLeads: number;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
      <Panel eyebrow="Inbox" title="Conversas" action={<NeonBadge tone="cyan">{totalLeads} leads</NeonBadge>}>
        <LeadFilters compact search={search} setSearch={setSearch} setStatus={setStatus} status={status} />
        <div className="mt-4 max-h-[720px] space-y-2 overflow-y-auto pr-1">
          {filteredLeads.map((lead) => (
            <button
              key={lead.id}
              className={cn(
                "w-full rounded-2xl border p-3 text-left transition",
                selectedLeadId === lead.id
                  ? "border-cyan-400/45 bg-cyan-400/10"
                  : "border-white/10 bg-white/[0.02] hover:border-cyan-400/25 hover:bg-cyan-400/5",
              )}
              onClick={() => setSelectedLeadId(lead.id)}
              type="button"
            >
              <div className="flex items-start gap-3">
                <LeadAvatar lead={lead} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-white">{lead.name}</p>
                    <span className="shrink-0 font-mono text-[9px] text-slate-500">{formatTime(lead.lastMessageAt ?? lead.updatedAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-[12px] text-slate-400">{lead.conversation.preview ?? lead.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusPill status={lead.status} />
                    <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-slate-500">
                      {lead.companyName}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
          {!filteredLeads.length ? <EmptyState title="Nenhuma conversa" detail="As conversas aparecem quando o webhook receber mensagens." /> : null}
        </div>
      </Panel>

      <Panel
        eyebrow="WhatsApp / Atendimento"
        title={selectedLead ? selectedLead.name : "Selecione uma conversa"}
        action={selectedLead ? <StatusPill status={selectedLead.status} /> : null}
      >
        {selectedLead ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-[620px] rounded-2xl border border-white/10 bg-slate-950/30 p-4">
              <ConversationHeader lead={selectedLead} />
              <div className="mt-4 h-[520px] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <ChatMessages messages={selectedLead.conversation.messages} />
              </div>
            </div>
            <LeadSideFile lead={selectedLead} onDetails={() => setDetailsLeadId(selectedLead.id)} />
          </div>
        ) : (
          <EmptyState title="Sem conversa selecionada" detail="Escolha um lead para ver o historico completo." />
        )}
      </Panel>
    </div>
  );
}

function LeadDetailsModal({ lead, onClose }: { lead: ClientLeadRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92svh] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#11151d] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LeadAvatar lead={lead} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[18px] font-bold text-white">{lead.name}</h2>
                <StatusPill status={lead.status} />
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {lead.phone ?? "Sem telefone"}
                </span>
                {lead.email ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {lead.email}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            aria-label="Fechar detalhes do lead"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-slate-300 transition hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-white/10 p-4">
            <div className="space-y-4">
              <InfoPanel title="Resumo inteligente" text={lead.summary} />
              <QualificationGrid lead={lead} />
              <LeadTechnicalFile lead={lead} />
              <ActivityTimeline activities={lead.activities} />
            </div>
          </aside>
          <main className="min-h-0 overflow-hidden p-4">
            <div className="flex h-full min-h-[640px] flex-col rounded-2xl border border-white/10 bg-slate-950/35">
              <ConversationHeader lead={lead} />
              <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 p-4">
                <ChatMessages messages={lead.conversation.messages} />
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function LeadFilters({
  compact = false,
  search,
  setSearch,
  setStatus,
  status,
}: {
  compact?: boolean;
  search: string;
  setSearch: (value: string) => void;
  setStatus: (value: "all" | ClientLeadStatus) => void;
  status: "all" | ClientLeadStatus;
}) {
  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-1" : "md:grid-cols-[minmax(0,1fr)_220px]")}>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.03] pl-10 pr-3 text-[13px] text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/45"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, telefone, empresa ou regiao..."
          type="search"
          value={search}
        />
      </label>
      <label className="relative block">
        <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <select
          className="h-11 w-full appearance-none rounded-xl border border-white/15 bg-white/[0.03] pl-10 pr-8 text-[13px] text-white outline-none transition focus:border-cyan-400/45"
          onChange={(event) => setStatus(event.target.value as "all" | ClientLeadStatus)}
          value={status}
        >
          {statusOptions.map((option) => (
            <option key={option.value} className="bg-slate-950 text-white" value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </label>
    </div>
  );
}

function LeadIdentity({ lead }: { lead: ClientLeadRecord }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <LeadAvatar lead={lead} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-white">{lead.name}</p>
        <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">
          {lead.channel} / {lead.conversation.messageCount} mensagens
        </p>
      </div>
    </div>
  );
}

function LeadAvatar({ lead, size = "md" }: { lead: ClientLeadRecord; size?: "md" | "lg" }) {
  const dimensions = size === "lg" ? "h-12 w-12" : "h-10 w-10";

  if (lead.agentAvatarUrl) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden rounded-xl border border-cyan-400/35 bg-cyan-500/10", dimensions)}>
        <Image alt={`Foto de ${lead.agentName ?? lead.name}`} className="object-cover" fill sizes={size === "lg" ? "48px" : "40px"} src={lead.agentAvatarUrl} unoptimized />
      </span>
    );
  }

  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 font-mono font-bold text-cyan-300", dimensions)}>
      {lead.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function LeadField({ icon: Icon, value }: { icon: typeof Phone; value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[12px] text-slate-300">
      <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
      <span className="truncate">{value}</span>
    </span>
  );
}

function StatusPill({ status }: { status: ClientLeadStatus }) {
  const meta = statusMeta[status];

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide",
        meta.tone === "green" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
        meta.tone === "cyan" && "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
        meta.tone === "amber" && "border-amber-400/25 bg-amber-400/10 text-amber-300",
        meta.tone === "rose" && "border-rose-400/25 bg-rose-400/10 text-rose-300",
        meta.tone === "violet" && "border-violet-400/25 bg-violet-400/10 text-violet-300",
        meta.tone === "zinc" && "border-slate-400/20 bg-slate-400/10 text-slate-300",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2 self-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/50 font-mono text-[11px] font-bold text-cyan-300">
        {score}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Score</p>
        <ProgressBar value={score} tone={score >= 70 ? "green" : score >= 35 ? "cyan" : "amber"} />
      </div>
    </div>
  );
}

function InfoPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="font-mono text-[9px] uppercase tracking-widest text-cyan-300">{title}</p>
      <p className="mt-3 text-[12px] leading-5 text-slate-200">{text}</p>
    </div>
  );
}

function QualificationGrid({ lead }: { lead: ClientLeadRecord }) {
  const items = [
    { label: "Interesse", value: lead.qualification.purpose ?? "Nao informado", icon: Target },
    { label: "Dor", value: lead.qualification.mainPain ?? "Nao informado", icon: MessageCircle },
    { label: "Investimento", value: lead.qualification.budget ?? "Nao informado", icon: Activity },
    { label: "Prazo", value: lead.qualification.timeframe ?? "Nao informado", icon: CalendarClock },
    { label: "Decisor", value: lead.qualification.decisionAuthority ?? "Nao informado", icon: Building2 },
    { label: "Objecoes", value: lead.qualification.objections ?? "Nao informado", icon: MessageCircle },
  ];
  const temperature = getTemperatureMeta(lead.qualification.temperature);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-cyan-300">Panorama de qualificacao</p>
        <span className={cn("rounded-lg border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide", temperature.className)}>
          {temperature.label}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wide text-slate-500">
            <Activity className="h-3.5 w-3.5 text-cyan-300" />
            Score
          </div>
          <p className="mt-2 text-[12px] font-semibold text-white">{lead.score}/100</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3 md:col-span-2">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wide text-slate-500">
            <Target className="h-3.5 w-3.5 text-cyan-300" />
            Proxima acao
          </div>
          <p className="mt-2 text-[12px] font-semibold leading-5 text-white">{lead.qualification.nextBestAction ?? "Continuar qualificando o lead."}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.label} className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wide text-slate-500">
                <Icon className="h-3.5 w-3.5 text-cyan-300" />
                {item.label}
              </div>
              <p className="mt-2 text-[12px] font-semibold text-white">{item.value}</p>
            </div>
          );
        })}
      </div>

      {lead.qualification.nextBestQuestion ? (
        <div className="mt-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wide text-cyan-200">
            <MessageCircle className="h-3.5 w-3.5" />
            Proxima pergunta sugerida
          </div>
          <p className="mt-2 text-[12px] font-semibold leading-5 text-cyan-50">{lead.qualification.nextBestQuestion}</p>
        </div>
      ) : null}

      {lead.qualification.nextStepAcceptance ? (
        <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wide text-slate-500">
            <ExternalLink className="h-3.5 w-3.5 text-cyan-300" />
            Aceite do proximo passo
          </div>
          <p className="mt-2 text-[12px] font-semibold leading-5 text-white">{lead.qualification.nextStepAcceptance}</p>
        </div>
      ) : null}

      {lead.qualification.fields.length ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Campos personalizados capturados</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {lead.qualification.fields.map((field) => (
              <div key={field.key} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{field.label}</p>
                <p className="mt-1 text-[12px] font-semibold leading-5 text-white">{field.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <InfoMini label="Respondidas" value={String(lead.qualification.answeredQuestionIds.length)} />
        <InfoMini label="Pendentes" value={String(lead.qualification.missingQuestionIds.length)} />
        <InfoMini label="Atualizacao" value={formatDateTime(lead.qualification.updatedAt)} />
      </div>
    </div>
  );
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[12px] font-semibold text-white">{value}</p>
    </div>
  );
}

function getTemperatureMeta(value: ClientLeadRecord["qualification"]["temperature"]) {
  if (value === "vip") {
    return { label: "VIP", className: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" };
  }

  if (value === "hot") {
    return { label: "Quente", className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" };
  }

  if (value === "warm") {
    return { label: "Morno", className: "border-amber-400/25 bg-amber-400/10 text-amber-300" };
  }

  if (value === "cold") {
    return { label: "Frio", className: "border-slate-400/20 bg-slate-400/10 text-slate-300" };
  }

  return { label: "Sem temperatura", className: "border-slate-400/20 bg-slate-400/10 text-slate-400" };
}

function LeadTechnicalFile({ lead }: { lead: ClientLeadRecord }) {
  const rows = [
    { label: "Origem", value: lead.technical.origin, icon: Globe2 },
    { label: "Dispositivo", value: lead.technical.device ?? "Nao identificado", icon: Laptop },
    { label: "Sistema / nav.", value: [lead.technical.os, lead.technical.browser].filter(Boolean).join(" / ") || "Nao identificado", icon: Laptop },
    { label: "Localizacao", value: lead.technical.location ?? "Nao identificada", icon: MapPin },
    { label: "IP", value: lead.technical.ipAddress ?? "Nao identificado", icon: Activity },
    { label: "Ultimo clique", value: formatDateTime(lead.technical.lastClick), icon: Clock },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="font-mono text-[9px] uppercase tracking-widest text-cyan-300">Ficha tecnica</p>
      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;

          return (
            <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2">
              <span className="flex items-center gap-2 text-[11px] text-slate-400">
                <Icon className="h-3.5 w-3.5 text-cyan-300" />
                {row.label}
              </span>
              <span className="max-w-[170px] truncate text-right text-[11px] font-semibold text-white">{row.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityTimeline({ activities }: { activities: ClientLeadActivity[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="font-mono text-[9px] uppercase tracking-widest text-cyan-300">Atividade no ecossistema</p>
      <div className="mt-3 space-y-2">
        {activities.slice(0, 10).map((activity) => (
          <div key={activity.id} className="grid grid-cols-[10px_1fr] gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-3">
            <span className={cn("mt-1.5 h-2 w-2 rounded-full", activity.tone === "green" && "bg-emerald-400", activity.tone === "cyan" && "bg-cyan-400", activity.tone === "amber" && "bg-amber-400", activity.tone === "rose" && "bg-rose-400", activity.tone === "zinc" && "bg-slate-500")} />
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[12px] font-semibold text-white">{activity.title}</p>
                <span className="shrink-0 font-mono text-[9px] text-slate-500">{formatDate(activity.occurredAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">{activity.summary}</p>
            </div>
          </div>
        ))}
        {!activities.length ? <p className="text-[12px] text-slate-500">Sem eventos registrados ainda.</p> : null}
      </div>
    </div>
  );
}

function ConversationHeader({ lead }: { lead: ClientLeadRecord }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <LeadAvatar lead={lead} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-white">{lead.name}</p>
          <p className="truncate text-[11px] text-slate-400">{lead.phone ?? lead.companyName}</p>
        </div>
      </div>
      <NeonBadge tone="cyan">{lead.conversation.messageCount} mensagens</NeonBadge>
    </div>
  );
}

function ChatMessages({ messages }: { messages: ClientLeadMessage[] }) {
  if (!messages.length) {
    return <EmptyState title="Sem mensagens salvas" detail="Quando o webhook receber ou enviar mensagens, o historico aparece aqui." />;
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isLead = message.direction === "inbound";
        const isSystem = message.direction === "system" || message.direction === "unknown";

        return (
          <div key={message.id} className={cn("flex", isLead ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[78%] rounded-2xl border px-4 py-3 text-[13px] leading-5",
                isLead && "border-emerald-400/20 bg-emerald-400/12 text-emerald-50",
                !isLead && !isSystem && "border-white/10 bg-white/[0.05] text-slate-100",
                isSystem && "border-amber-400/20 bg-amber-400/10 text-amber-100",
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-mono text-[9px] uppercase tracking-wide opacity-75">
                  {isLead ? "Lead" : isSystem ? "Sistema" : "Agente IA"}
                </span>
                <span className="font-mono text-[9px] opacity-60">{formatTime(message.occurredAt)}</span>
              </div>
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniChat({ lead, messages }: { lead: ClientLeadRecord; messages: ClientLeadMessage[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Ultimas mensagens</p>
        <span className="text-[11px] text-slate-500">{lead.conversation.status ?? "sem status"}</span>
      </div>
      <ChatMessages messages={messages} />
    </div>
  );
}

function LeadSideFile({ lead, onDetails }: { lead: ClientLeadRecord; onDetails: () => void }) {
  return (
    <aside className="space-y-3">
      <InfoPanel title="Resumo" text={lead.summary} />
      <LeadQualificationSnapshot lead={lead} />
      <LeadTechnicalFile lead={lead} />
      <button
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
        onClick={onDetails}
        type="button"
      >
        Abrir arquivo do lead
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </aside>
  );
}

function LeadQualificationSnapshot({ lead }: { lead: ClientLeadRecord }) {
  const temperature = getTemperatureMeta(lead.qualification.temperature);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-cyan-300">Qualificacao</p>
        <span className={cn("rounded-lg border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide", temperature.className)}>
          {temperature.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <InfoMini label="Score" value={`${lead.score}/100`} />
        <InfoMini label="Status" value={statusMeta[lead.status].label} />
      </div>
      <p className="mt-3 text-[12px] font-semibold leading-5 text-white">
        {lead.qualification.nextBestAction ?? "Continuar qualificando o lead."}
      </p>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
      <Archive className="h-8 w-8 text-slate-600" />
      <p className="mt-3 text-[14px] font-semibold text-white">{title}</p>
      <p className="mt-1 max-w-[420px] text-[12px] leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function getHeaderCopy(mode: ConsoleMode) {
  if (mode === "conversas") {
    return {
      eyebrow: "WhatsApp / Atendimento",
      title: "Conversas",
      description: "Acompanhe o historico de atendimento dos leads em tempo real.",
    };
  }

  if (mode === "crm") {
    return {
      eyebrow: "Comercial / CRM",
      title: "CRM de leads",
      description: "Veja qualificacao, status, atividades e historico de cada lead.",
    };
  }

  return {
    eyebrow: "Comercial / Leads",
    title: "Leads",
    description: "Consulte todos os leads capturados pelo WhatsApp e pelos links rastreados.",
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
