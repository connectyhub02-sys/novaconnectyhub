"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  Archive,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Filter,
  Globe2,
  Laptop,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Target,
  X,
  XCircle,
} from "lucide-react";
import { KpiStat, NeonBadge, PageHeader, Panel, ProgressBar } from "@/components/connectyhub-os/panel-primitives";
import { cn } from "@/lib/utils";
import type { ClientSocialApproval } from "@/lib/client-os/social-approvals";
import type {
  ClientLeadActivity,
  ClientLeadConversationFile,
  ClientLeadCrmWorkspace,
  ClientLeadMessage,
  ClientLeadRecord,
  ClientLeadStatus,
} from "@/lib/client-os/leads-crm";

type ConsoleMode = "leads" | "crm" | "conversas";

type LeadCrmConsoleProps = {
  mode: ConsoleMode;
  socialApprovals?: ClientSocialApproval[];
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

export function LeadCrmConsole({ mode, socialApprovals: initialSocialApprovals = [], workspace }: LeadCrmConsoleProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ClientLeadStatus>("all");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(workspace.leads[0]?.id ?? null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(workspace.leads[0]?.id ?? null);
  const [conversationPane, setConversationPane] = useState<"inbox" | "chat">("inbox");
  const [detailsLeadId, setDetailsLeadId] = useState<string | null>(null);
  const [socialApprovals, setSocialApprovals] = useState<ClientSocialApproval[]>(initialSocialApprovals);

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
  const warnings = workspace.warnings ?? [];

  if (!workspace.companies.length) {
    const hasLoadWarning = warnings.length > 0;

    return (
      <section>
        <PageHeader
          eyebrow={header.eyebrow}
          title={header.title}
          description={hasLoadWarning ? "Nao conseguimos carregar os dados do CRM agora." : "Cadastre uma empresa para liberar leads, conversas e CRM."}
        />
        {hasLoadWarning ? (
          <LeadWorkspaceWarning warnings={warnings} />
        ) : (
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
        )}
      </section>
    );
  }

  return (
    <section>
      <PageHeader eyebrow={header.eyebrow} title={header.title} description={header.description} />
      {warnings.length ? <LeadWorkspaceWarning warnings={warnings} /> : null}

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
          conversationPane={conversationPane}
          filteredLeads={filteredLeads}
          search={search}
          selectedLead={selectedLead}
          selectedLeadId={selectedLead?.id ?? null}
          setConversationPane={setConversationPane}
          setDetailsLeadId={setDetailsLeadId}
          setSearch={setSearch}
          setSocialApprovals={setSocialApprovals}
          setSelectedLeadId={setSelectedLeadId}
          setStatus={setStatus}
          socialApprovals={socialApprovals}
          status={status}
          totalLeads={workspace.leads.length}
        />
      ) : null}

      {detailsLead ? <LeadDetailsModal lead={detailsLead} onClose={() => setDetailsLeadId(null)} /> : null}
    </section>
  );
}

function LeadWorkspaceWarning({ warnings }: { warnings: string[] }) {
  const visibleWarnings = Array.from(new Set(warnings)).slice(0, 3);

  return (
    <div className="mb-5">
      <Panel
        compact
        eyebrow="Sincronizacao"
        title="Dados temporariamente indisponiveis"
        tone="amber"
      >
        <div className="space-y-2 text-[12px] leading-5 text-amber-100/90">
          <p>O CRM continua acessivel, mas uma parte dos dados nao atualizou nesta tentativa.</p>
          <ul className="space-y-1">
            {visibleWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}

function LeadStats({ workspace }: { workspace: ClientLeadCrmWorkspace }) {
  return (
    <div className="mb-5 grid grid-cols-3 gap-1.5 sm:gap-2 xl:grid-cols-6">
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
      <div className="mt-4 grid gap-2 md:hidden">
        {filteredLeads.map((lead) => {
          const temperature = getTemperatureMeta(lead.qualification.temperature);

          return (
            <button
              key={lead.id}
              className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-cyan-400/30 hover:bg-cyan-400/5"
              onClick={() => setDetailsLeadId(lead.id)}
              type="button"
            >
              <div className="flex items-start gap-3">
                <LeadAvatar lead={lead} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-white">{lead.name}</p>
                      <p className="mt-1 truncate text-[12px] text-slate-400">{lead.phone ?? lead.email ?? "Sem contato"}</p>
                    </div>
                    <StatusPill status={lead.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-400">{lead.summary}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <InfoMini label="Score" value={`${lead.score}/100`} />
                <InfoMini label="Perfil" value={temperature.label} />
                <InfoMini label="Origem" value={lead.source} />
                <InfoMini label="Ultimo sinal" value={formatTime(lead.lastMessageAt ?? lead.updatedAt)} />
              </div>

              <span className={cn("inline-flex w-full items-center justify-center rounded-xl border px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-wide", temperature.className)}>
                Ver arquivo do lead
              </span>
            </button>
          );
        })}
        {!filteredLeads.length ? <EmptyState title="Nenhum lead encontrado" detail="Quando o WhatsApp receber mensagens, os leads aparecem aqui." /> : null}
      </div>

      <div className="mt-4 hidden overflow-x-auto md:block">
        <div className="min-w-[1320px]">
          <div className="grid grid-cols-[1.2fr_150px_170px_150px_130px_170px_140px_130px_110px] gap-3 border-b border-white/10 px-3 pb-3 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            <span>Nome</span>
            <span>Contato</span>
            <span>Perfil / persona</span>
            <span>Atendimento</span>
            <span>Estagio</span>
            <span>Origem / local</span>
            <span>Dispositivo</span>
            <span>IP / data</span>
            <span className="text-right">Acoes</span>
          </div>
          <div className="divide-y divide-white/10">
            {filteredLeads.map((lead) => {
              const temperature = getTemperatureMeta(lead.qualification.temperature);

              return (
                <button
                  key={lead.id}
                  className="grid w-full grid-cols-[1.2fr_150px_170px_150px_130px_170px_140px_130px_110px] items-center gap-3 px-3 py-4 text-left transition hover:bg-cyan-500/5"
                  onClick={() => setDetailsLeadId(lead.id)}
                  type="button"
                >
                  <LeadIdentity lead={lead} />
                  <div className="min-w-0 text-[12px] text-slate-300">
                    <p className="truncate">{lead.phone ?? "Sem telefone"}</p>
                    {lead.email ? <p className="mt-1 truncate text-slate-500">{lead.email}</p> : null}
                  </div>
                  <div className="min-w-0">
                    <span className={cn("inline-flex rounded-lg border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide", temperature.className)}>
                      {temperature.label}
                    </span>
                    <p className="mt-1 truncate text-[11px] text-slate-400">Score {lead.score}/100</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-white">{lead.agentName ?? "Sem agente"}</p>
                    <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">{lead.companyName}</p>
                  </div>
                  <StatusPill status={lead.status} />
                  <div className="min-w-0 text-[12px] text-slate-300">
                    <p className="truncate">{lead.source}</p>
                    <p className="mt-1 truncate text-slate-500">{lead.technical.location ?? "Local desconhecido"}</p>
                  </div>
                  <div className="min-w-0 text-[12px] text-slate-300">
                    <p className="truncate">{lead.technical.device ?? "Nao identificado"}</p>
                    <p className="mt-1 truncate text-slate-500">{[lead.technical.os, lead.technical.browser].filter(Boolean).join(" / ") || "-"}</p>
                  </div>
                  <div className="min-w-0 text-[12px] text-slate-300">
                    <p className="truncate font-mono text-[11px] text-slate-400">{lead.technical.ipAddress ?? "-"}</p>
                    <p className="mt-1 text-slate-500">{formatDate(lead.lastMessageAt ?? lead.updatedAt)}</p>
                  </div>
                  <span className="justify-self-end rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-wide text-cyan-300">
                    Ver arquivo
                  </span>
                </button>
              );
            })}
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
  conversationPane,
  filteredLeads,
  search,
  selectedLead,
  selectedLeadId,
  setConversationPane,
  setDetailsLeadId,
  setSearch,
  setSocialApprovals,
  setSelectedLeadId,
  setStatus,
  socialApprovals,
  status,
  totalLeads,
}: {
  conversationPane: "inbox" | "chat";
  filteredLeads: ClientLeadRecord[];
  search: string;
  selectedLead: ClientLeadRecord | null;
  selectedLeadId: string | null;
  setConversationPane: (pane: "inbox" | "chat") => void;
  setDetailsLeadId: (id: string) => void;
  setSearch: (value: string) => void;
  setSocialApprovals: (updater: (items: ClientSocialApproval[]) => ClientSocialApproval[]) => void;
  setSelectedLeadId: (id: string) => void;
  setStatus: (value: "all" | ClientLeadStatus) => void;
  socialApprovals: ClientSocialApproval[];
  status: "all" | ClientLeadStatus;
  totalLeads: number;
}) {
  return (
    <div className="space-y-5">
      <SocialApprovalQueue
        approvals={socialApprovals}
        onReviewed={(runId) => setSocialApprovals((items) => items.filter((item) => item.id !== runId))}
        onSelectLead={(leadId) => {
          setSelectedLeadId(leadId);
          setConversationPane("chat");
        }}
      />

      <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <Panel
          className={cn(conversationPane === "chat" && "hidden xl:block")}
          eyebrow="Inbox"
          title="Conversas"
          action={<NeonBadge tone="cyan">{totalLeads} leads</NeonBadge>}
        >
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
                onClick={() => {
                  setSelectedLeadId(lead.id);
                  setConversationPane("chat");
                }}
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
          className={cn(conversationPane === "inbox" && "hidden xl:block")}
          eyebrow="Atendimento / Conversa"
          title={selectedLead ? selectedLead.name : "Selecione uma conversa"}
          action={
            selectedLead ? (
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-300 transition hover:bg-white/10 xl:hidden"
                  onClick={() => setConversationPane("inbox")}
                  type="button"
                >
                  <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                  Voltar
                </button>
                <StatusPill status={selectedLead.status} />
              </div>
            ) : null
          }
        >
          {selectedLead ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-h-[calc(100svh-280px)] rounded-2xl border border-white/10 bg-slate-950/30 p-3 sm:p-4 lg:min-h-[620px]">
                <ConversationHeader lead={selectedLead} />
                <div className="mt-3 h-[min(520px,calc(100svh-390px))] min-h-[340px] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/40 p-3 sm:mt-4 sm:p-4">
                  <ChatMessages messages={selectedLead.conversation.messages} />
                </div>
                <div className="mt-3 grid gap-2 sm:hidden">
                  <OpenWhatsAppButton phone={selectedLead.phone} />
                  <button
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/15"
                    onClick={() => setDetailsLeadId(selectedLead.id)}
                    type="button"
                  >
                    Abrir arquivo do lead
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <LeadSideFile className="hidden lg:block" lead={selectedLead} onDetails={() => setDetailsLeadId(selectedLead.id)} />
            </div>
          ) : (
            <EmptyState title="Sem conversa selecionada" detail="Escolha um lead para ver o historico completo." />
          )}
        </Panel>
      </div>
    </div>
  );
}

function SocialApprovalQueue({
  approvals,
  onReviewed,
  onSelectLead,
}: {
  approvals: ClientSocialApproval[];
  onReviewed: (runId: string) => void;
  onSelectLead: (leadId: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(approvals.map((item) => [item.id, item.suggestedReply])),
  );
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  if (!approvals.length) {
    return null;
  }

  async function reviewApproval(item: ClientSocialApproval, action: "approve" | "reject") {
    setReviewingId(item.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/social-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          runId: item.id,
          responseText: drafts[item.id] ?? item.suggestedReply,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Nao foi possivel revisar esta resposta.");
      }

      onReviewed(item.id);
      setNotice({
        tone: "success",
        message: typeof payload?.message === "string" ? payload.message : "Aprovacao social revisada.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado.",
      });
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <Panel
      eyebrow="Meta / Social"
      title="Aprovacoes sociais"
      tone="amber"
      action={<NeonBadge tone="amber">{approvals.length} pendentes</NeonBadge>}
    >
      <div className="grid gap-3">
        {notice ? (
          <div className={cn(
            "rounded-xl border px-3 py-2 text-[12px]",
            notice.tone === "success"
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
              : "border-rose-400/25 bg-rose-400/10 text-rose-100",
          )}>
            {notice.message}
          </div>
        ) : null}

        {approvals.slice(0, 6).map((item) => {
          const isReviewing = reviewingId === item.id;
          const draft = drafts[item.id] ?? item.suggestedReply;

          return (
            <div
              key={item.id}
              className="grid gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.045] p-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]"
            >
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <NeonBadge tone={item.publicSurface ? "amber" : "cyan"}>{item.channelLabel}</NeonBadge>
                  <span className="rounded-lg border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-slate-400">
                    {item.companyName}
                  </span>
                  <span className="rounded-lg border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-slate-400">
                    {formatDateTime(item.preparedAt ?? item.createdAt)}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-white">{item.leadName}</p>
                    <p className="mt-1 truncate text-[11px] text-slate-400">{item.leadPhone ?? item.providerChatId ?? "Contato social"}</p>
                  </div>
                  <div className="min-w-0 text-left sm:text-right">
                    <p className="truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">Agente</p>
                    <p className="truncate text-[12px] font-semibold text-slate-200">{item.agentName}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Mensagem do lead</p>
                    {item.publicSurface ? <ShieldCheck className="h-3.5 w-3.5 text-amber-300" /> : <MessageCircle className="h-3.5 w-3.5 text-cyan-300" />}
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap text-[12px] leading-5 text-slate-200">{item.leadMessage}</p>
                </div>

                {item.approvalReasons.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {item.approvalReasons.slice(0, 4).map((reason) => (
                      <span key={reason} className="rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wide text-amber-100">
                        {formatApprovalReason(reason)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {item.leadId ? (
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/15"
                    onClick={() => onSelectLead(item.leadId!)}
                    type="button"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Ver conversa
                  </button>
                ) : null}
              </div>

              <div className="grid min-w-0 gap-2">
                <label className="grid gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Rascunho</span>
                  <textarea
                    className="min-h-[126px] resize-y rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-[13px] leading-5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45"
                    disabled={isReviewing}
                    maxLength={1500}
                    onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                    value={draft}
                  />
                </label>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/15 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isReviewing}
                    onClick={() => reviewApproval(item, "approve")}
                    type="button"
                  >
                    {isReviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Aprovar rascunho
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-300/25 bg-rose-300/10 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-rose-100 transition hover:bg-rose-300/15 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isReviewing}
                    onClick={() => reviewApproval(item, "reject")}
                    type="button"
                  >
                    {isReviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                    Rejeitar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function LeadDetailsModal({ lead, onClose }: { lead: ClientLeadRecord; onClose: () => void }) {
  const preferredConversationId = lead.conversation.id ?? lead.leadFile.conversations[0]?.id ?? null;
  const [conversationSelection, setConversationSelection] = useState<{ leadId: string; conversationId: string | null }>({
    leadId: lead.id,
    conversationId: preferredConversationId,
  });
  const selectedConversationId = conversationSelection.leadId === lead.id
    ? conversationSelection.conversationId
    : preferredConversationId;
  const selectedConversation = lead.leadFile.conversations.find((conversation) => conversation.id === selectedConversationId)
    ?? lead.leadFile.conversations[0]
    ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-4">
      <div className="flex h-[100svh] max-h-[100svh] w-full max-w-[1280px] flex-col overflow-hidden border border-white/15 bg-[#11151d] shadow-2xl sm:h-auto sm:max-h-[92svh] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LeadAvatar lead={lead} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[16px] font-bold text-white sm:text-[18px]">Arquivo inteligente do lead</h2>
                <StatusPill status={lead.status} />
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-slate-400">
                <span className="font-semibold text-white">{lead.name}</span>
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

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[370px_minmax(0,1fr)] lg:overflow-hidden">
          <aside className="min-h-0 border-b border-white/10 bg-slate-950/25 p-3 sm:p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="space-y-3">
              <InfoPanel title="Resumo inteligente" text={lead.summary} />
              <QualificationGrid lead={lead} />
              <LeadTechnicalFile lead={lead} />
              <TrackingArchive events={lead.leadFile.trackingEvents} />
              <LeadFileSnapshot lead={lead} />
              <ActivityTimeline activities={lead.activities} />
              <OpenWhatsAppButton phone={lead.phone} />
            </div>
          </aside>
          <main className="min-h-0 p-3 sm:p-4 lg:overflow-hidden">
            <div className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 lg:h-full lg:min-h-[640px]">
              <ConversationHeader lead={lead} conversation={selectedConversation} />
              <div
                className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 p-3 sm:p-5"
                style={{
                  backgroundColor: "#0b1117",
                  backgroundImage:
                    "radial-gradient(circle at 12px 12px, rgba(148,163,184,0.1) 1px, transparent 1.5px), radial-gradient(circle at 2px 2px, rgba(34,211,238,0.06) 1px, transparent 1.5px)",
                  backgroundPosition: "0 0, 14px 14px",
                  backgroundSize: "28px 28px",
                }}
              >
                <ChatMessages messages={selectedConversation?.messages ?? []} />
              </div>
              <ConversationSelector
                conversations={lead.leadFile.conversations}
                onSelect={(conversationId) => setConversationSelection({ leadId: lead.id, conversationId })}
                selectedId={selectedConversation?.id ?? null}
              />
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
          {lead.channel} / {lead.leadFile.messageCount} mensagens
        </p>
      </div>
    </div>
  );
}

function LeadAvatar({ lead, size = "md" }: { lead: ClientLeadRecord; size?: "md" | "lg" }) {
  const dimensions = size === "lg" ? "h-12 w-12" : "h-10 w-10";

  if (lead.avatarUrl) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden rounded-xl border border-cyan-400/35 bg-cyan-500/10", dimensions)}>
        <Image alt={`Foto do lead ${lead.name}`} className="object-cover" fill sizes={size === "lg" ? "48px" : "40px"} src={lead.avatarUrl} unoptimized />
      </span>
    );
  }

  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 font-mono font-bold text-cyan-300", dimensions)}>
      {lead.name.slice(0, 1).toUpperCase()}
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

function LeadFileSnapshot({ lead }: { lead: ClientLeadRecord }) {
  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-cyan-200">Dossie do lead</p>
          <p className="mt-1 text-[13px] font-semibold text-white">CRM, conversas e rastreamento</p>
        </div>
        <Archive className="h-5 w-5 text-cyan-200" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <InfoMini label="Conversas" value={String(lead.leadFile.conversationCount)} />
        <InfoMini label="Mensagens" value={String(lead.leadFile.messageCount)} />
        <InfoMini label="Rastreamentos" value={String(lead.leadFile.trackingEventCount)} />
        <InfoMini label="Eventos IA" value={String(lead.leadFile.intelligenceEventCount)} />
        <InfoMini label="Primeira aparicao" value={formatDateTime(lead.leadFile.firstSeenAt)} />
        <InfoMini label="Ultimo sinal" value={formatDateTime(lead.leadFile.lastSeenAt)} />
      </div>
    </div>
  );
}

function ConversationSelector({
  conversations,
  onSelect,
  selectedId,
}: {
  conversations: ClientLeadConversationFile[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  return (
    <div className="border-t border-white/10 bg-slate-900/80 p-3">
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/60 px-4 py-2">
        <MessageCircle className="h-4 w-4 shrink-0 text-cyan-300" />
        {conversations.length > 1 ? (
          <select
            className="min-w-0 flex-1 appearance-none bg-transparent text-[13px] text-slate-200 outline-none"
            onChange={(event) => onSelect(event.target.value)}
            value={selectedId ?? ""}
          >
            {conversations.map((conversation) => (
              <option key={conversation.id} className="bg-slate-950 text-white" value={conversation.id}>
                {formatConversationLabel(conversation)}
              </option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] text-slate-300">
            {selectedConversation ? formatConversationLabel(selectedConversation) : "Historico geral"}
          </span>
        )}
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-slate-500">
          {selectedConversation?.messageCount ?? 0} mensagens
        </span>
      </div>
    </div>
  );
}

function formatConversationLabel(conversation: ClientLeadConversationFile) {
  return [
    conversation.provider || conversation.channel || "Historico geral",
    conversation.status ? `status ${conversation.status}` : null,
    conversation.lastMessageAt ? formatDateTime(conversation.lastMessageAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function TrackingArchive({ events }: { events: ClientLeadActivity[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-amber-300">Atividade no site</p>
        <NeonBadge tone="amber">{events.length}</NeonBadge>
      </div>
      <div className="mt-3 space-y-2">
        {events.slice(0, 10).map((event) => (
          <div key={event.id} className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[12px] font-semibold text-white">{event.title}</p>
              <span className="shrink-0 font-mono text-[9px] text-slate-500">{formatDateTime(event.occurredAt)}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">{event.summary}</p>
          </div>
        ))}
        {!events.length ? <p className="text-[12px] text-slate-500">Sem eventos de cookies, push, GPS, cliques ou navegacao ainda.</p> : null}
      </div>
    </div>
  );
}

function OpenWhatsAppButton({ phone }: { phone: string | null }) {
  const normalizedPhone = phone?.replace(/\D/g, "") ?? "";

  return (
    <a
      className={cn(
        "inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-3 font-mono text-[10px] font-bold uppercase tracking-wide transition",
        normalizedPhone
          ? "bg-emerald-300 text-slate-950 hover:bg-emerald-200"
          : "pointer-events-none border border-white/10 bg-white/[0.03] text-slate-500",
      )}
      href={normalizedPhone ? `https://wa.me/${normalizedPhone}` : "#"}
      rel="noreferrer"
      target="_blank"
    >
      <MessageCircle className="h-3.5 w-3.5" />
      Abrir no WhatsApp
    </a>
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

function ConversationHeader({
  conversation,
  lead,
}: {
  conversation?: ClientLeadConversationFile | null;
  lead: ClientLeadRecord;
}) {
  const messageCount = conversation?.messageCount ?? lead.conversation.messageCount;

  return (
    <div className="flex flex-col gap-3 bg-slate-900/90 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex min-w-0 items-center gap-3">
        <LeadAvatar lead={lead} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-white">{lead.name}</p>
          <p className="truncate text-[11px] text-slate-400">{lead.phone ?? lead.companyName}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {conversation ? <NeonBadge tone="zinc">{conversation.status ?? "sem status"}</NeonBadge> : null}
        <NeonBadge tone="cyan">{messageCount} mensagens</NeonBadge>
      </div>
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
        const isLead = message.author === "lead" || message.direction === "inbound";
        const isAi = message.author === "ai";
        const isHuman = message.author === "human";
        const isSystem = message.author === "system" || message.author === "unknown" || message.direction === "system" || message.direction === "unknown";
        const label = message.authorLabel || (isLead ? "Lead" : isHuman ? "Humano" : isAi ? "Agente IA" : "Sistema");

        return (
          <div key={message.id} className={cn("flex", isLead ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[88%] rounded-xl border px-3 py-3 text-[13px] leading-5 shadow-lg shadow-black/15 sm:max-w-[72%] sm:px-4",
                isLead && "border-emerald-300/25 bg-emerald-300/15 text-emerald-50",
                isAi && !isLead && "border-cyan-300/20 bg-slate-900/95 text-slate-100",
                isHuman && !isLead && "border-sky-300/25 bg-sky-300/10 text-sky-50",
                !isLead && !isAi && !isHuman && !isSystem && "border-white/10 bg-slate-900/95 text-slate-100",
                isSystem && "border-amber-400/20 bg-amber-400/10 text-amber-100",
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-mono text-[9px] uppercase tracking-wide opacity-75">
                  {label}
                </span>
                <span className="font-mono text-[9px] opacity-60">
                  {message.type !== "text" ? `${message.type} · ` : null}
                  {formatTime(message.occurredAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.mediaUrl ? (
                <a
                  className="mt-3 inline-flex rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/15"
                  href={message.mediaUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Abrir midia salva
                </a>
              ) : null}
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

function LeadSideFile({ className, lead, onDetails }: { className?: string; lead: ClientLeadRecord; onDetails: () => void }) {
  return (
    <aside className={cn("space-y-3", className)}>
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
      eyebrow: "Atendimento / Multicanal",
      title: "Conversas",
      description: "Acompanhe o historico dos leads e revise respostas sociais pendentes.",
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

function formatApprovalReason(value: string) {
  switch (value) {
    case "public_social_surface":
      return "comentario publico";
    case "channel_requires_human_approval":
      return "aprovacao do canal";
    case "channel_auto_reply_disabled":
      return "auto resposta off";
    case "agent_requires_human_approval":
      return "aprovacao do agente";
    default:
      return value.replace(/_/g, " ");
  }
}
