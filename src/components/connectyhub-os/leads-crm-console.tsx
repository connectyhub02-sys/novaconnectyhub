"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Archive,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Bot,
  Copy,
  CreditCard,
  ExternalLink,
  Filter,
  FileText,
  Globe2,
  Laptop,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Minus,
  PauseCircle,
  Phone,
  PlayCircle,
  Plus,
  Package,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Target,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { KpiStat, NeonBadge, PageHeader, Panel, ProgressBar } from "@/components/connectyhub-os/panel-primitives";
import { cn } from "@/lib/utils";
import { getTrackingSnapshot } from "@/lib/tracking/client";
import type {
  ClientSocialApproval,
  ClientSocialDispatch,
  ClientSocialDispatchMonitor,
  ClientSocialDispatchStatus,
} from "@/lib/client-os/social-approvals";
import type {
  ClientLeadAttendanceQueue,
  ClientLeadActivity,
  ClientLeadConversationFile,
  ClientLeadCrmWorkspace,
  ClientLeadHumanIntervention,
  ClientLeadMessage,
  ClientLeadRecord,
  ClientLeadStatus,
} from "@/lib/client-os/leads-crm";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";

type ConsoleMode = "leads" | "crm" | "conversas" | "atendimento";

type AttendanceInboxTab = "all" | "unread" | "active" | "paused" | "qualified" | "won" | "archived";

type AttendanceThread = {
  key: string;
  lead: ClientLeadRecord;
  conversation: ClientLeadConversationFile | null;
  conversationId: string | null;
  queueKey: string;
  latestMessage: ClientLeadMessage | null;
  lastMessageAt: string | null;
};

type AttendanceQueueFilter = {
  key: string;
  label: string;
  detail: string | null;
  count: number;
  status: string | null;
  avatarUrl: string | null;
};

type LeadCrmConsoleProps = {
  mode: ConsoleMode;
  salesCatalogItems?: ClientSalesCatalogItem[];
  socialApprovals?: ClientSocialApproval[];
  socialDispatchMonitor?: ClientSocialDispatchMonitor;
  workspace: ClientLeadCrmWorkspace;
};

type BrowserPushPermissionState = NotificationPermission | "unsupported" | "unknown";

type AttendancePushPromptState = {
  busy: boolean;
  dismissed: boolean;
  message: string | null;
  permission: BrowserPushPermissionState;
  visible: boolean;
};

type AttendanceCartItem = {
  id: string;
  name: string;
  note?: string;
  quantity: number;
  source: "catalog" | "manual";
  unitPriceCents: number;
};

type AttendanceQuickProduct = {
  category: string;
  companyId: string;
  description: string;
  id: string;
  name: string;
  priceCents: number;
};

const salesCatalogBrowserEventsChannel = "connectyhub:sales-catalog-events";

type SalesCatalogBrowserEvent = {
  companyId?: unknown;
  itemId?: unknown;
  itemIds?: unknown;
  type?: unknown;
};

function removeUnavailableCatalogCartItems(
  carts: Record<string, AttendanceCartItem[]>,
  availableCatalogItemIds: Set<string>,
) {
  let changed = false;
  const next: Record<string, AttendanceCartItem[]> = {};

  for (const [key, items] of Object.entries(carts)) {
    const filteredItems = items.filter((item) => item.source !== "catalog" || availableCatalogItemIds.has(item.id));
    if (filteredItems.length !== items.length) {
      changed = true;
    }
    next[key] = filteredItems;
  }

  return changed ? next : carts;
}

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

const emptySocialDispatchMonitor: ClientSocialDispatchMonitor = {
  items: [],
  summary: {
    blocked: 0,
    failed: 0,
    pending: 0,
    rejected: 0,
    retryable: 0,
    sending: 0,
    sent: 0,
    total: 0,
  },
};

const whatsappConversationBackgroundUrl = "https://pub-eaf679ed02634f958b68991d910a997b.r2.dev/8c98994518b575bfd8c949e91d20548b.jpg";
let attendanceVapidPublicKey: string | null = null;
let attendanceVapidPublicKeyPromise: Promise<string> | null = null;

export function LeadCrmConsole({
  mode,
  salesCatalogItems = [],
  socialApprovals: initialSocialApprovals = [],
  socialDispatchMonitor: initialSocialDispatchMonitor = emptySocialDispatchMonitor,
  workspace,
}: LeadCrmConsoleProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ClientLeadStatus>("all");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(workspace.leads[0]?.id ?? null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(workspace.leads[0]?.id ?? null);
  const [conversationPane, setConversationPane] = useState<"inbox" | "chat">("inbox");
  const [detailsLeadId, setDetailsLeadId] = useState<string | null>(null);
  const [socialApprovals, setSocialApprovals] = useState<ClientSocialApproval[]>(initialSocialApprovals);
  const [socialDispatchMonitor, setSocialDispatchMonitor] = useState<ClientSocialDispatchMonitor>(initialSocialDispatchMonitor);

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

      {mode !== "conversas" && mode !== "atendimento" ? <LeadStats workspace={workspace} /> : null}

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
          setSocialDispatchMonitor={setSocialDispatchMonitor}
          setSelectedLeadId={setSelectedLeadId}
          setStatus={setStatus}
          socialApprovals={socialApprovals}
          socialDispatchMonitor={socialDispatchMonitor}
          status={status}
          totalLeads={workspace.leads.length}
        />
      ) : null}

      {mode === "atendimento" ? (
        <AttendanceCenterView
          conversationPane={conversationPane}
          filteredLeads={filteredLeads}
          salesCatalogItems={salesCatalogItems}
          search={search}
          selectedLeadId={selectedLead?.id ?? null}
          setConversationPane={setConversationPane}
          setDetailsLeadId={setDetailsLeadId}
          setSearch={setSearch}
          setSelectedLeadId={setSelectedLeadId}
          workspace={workspace}
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
                <InfoMini label="Origem" value={formatPublicSource(lead.source)} />
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
                    <p className="truncate">{formatPublicSource(lead.source)}</p>
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
  setSocialDispatchMonitor,
  setSelectedLeadId,
  setStatus,
  socialApprovals,
  socialDispatchMonitor,
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
  setSocialApprovals: (value: ClientSocialApproval[] | ((items: ClientSocialApproval[]) => ClientSocialApproval[])) => void;
  setSocialDispatchMonitor: (value: ClientSocialDispatchMonitor) => void;
  setSelectedLeadId: (id: string) => void;
  setStatus: (value: "all" | ClientLeadStatus) => void;
  socialApprovals: ClientSocialApproval[];
  socialDispatchMonitor: ClientSocialDispatchMonitor;
  status: "all" | ClientLeadStatus;
  totalLeads: number;
}) {
  const [refreshingSocialOps, setRefreshingSocialOps] = useState(false);

  async function refreshSocialOperations() {
    setRefreshingSocialOps(true);

    try {
      const response = await fetch("/api/dashboard/social-approvals", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as {
        approvals?: ClientSocialApproval[];
        dispatchMonitor?: ClientSocialDispatchMonitor;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Nao foi possivel atualizar operacao Meta.");
      }

      if (Array.isArray(payload.approvals)) {
        setSocialApprovals(payload.approvals);
      }

      if (payload.dispatchMonitor?.summary && Array.isArray(payload.dispatchMonitor.items)) {
        setSocialDispatchMonitor(payload.dispatchMonitor);
      }
    } finally {
      setRefreshingSocialOps(false);
    }
  }

  return (
    <div className="space-y-5">
      <SocialApprovalQueue
        approvals={socialApprovals}
        onReviewed={(runId, action) => {
          setSocialApprovals((items) => items.filter((item) => item.id !== runId));

          if (action === "approve") {
            void refreshSocialOperations().catch(() => undefined);
          }
        }}
        onSelectLead={(leadId) => {
          setSelectedLeadId(leadId);
          setConversationPane("chat");
        }}
      />

      <SocialDispatchMonitorPanel
        monitor={socialDispatchMonitor}
        onRefresh={refreshSocialOperations}
        onSelectLead={(leadId) => {
          setSelectedLeadId(leadId);
          setConversationPane("chat");
        }}
        refreshing={refreshingSocialOps}
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

function AttendanceCenterView({
  conversationPane,
  filteredLeads,
  salesCatalogItems,
  search,
  selectedLeadId,
  setConversationPane,
  setDetailsLeadId,
  setSearch,
  setSelectedLeadId,
  workspace,
}: {
  conversationPane: "inbox" | "chat";
  filteredLeads: ClientLeadRecord[];
  salesCatalogItems: ClientSalesCatalogItem[];
  search: string;
  selectedLeadId: string | null;
  setConversationPane: (pane: "inbox" | "chat") => void;
  setDetailsLeadId: (id: string) => void;
  setSearch: (value: string) => void;
  setSelectedLeadId: (id: string) => void;
  workspace: ClientLeadCrmWorkspace;
}) {
  const router = useRouter();
  const [inboxTab, setInboxTab] = useState<AttendanceInboxTab>("all");
  const [manualReply, setManualReply] = useState("");
  const [leadCarts, setLeadCarts] = useState<Record<string, AttendanceCartItem[]>>({});
  const [deletedCatalogItemIds, setDeletedCatalogItemIds] = useState<Set<string>>(() => new Set());
  const [cartCheckoutBusy, setCartCheckoutBusy] = useState(false);
  const [catalogDeleteBusyId, setCatalogDeleteBusyId] = useState<string | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [replyBusy, setReplyBusy] = useState(false);
  const [handoffNotice, setHandoffNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [handoffOverrides, setHandoffOverrides] = useState<Record<string, ClientLeadHumanIntervention>>({});
  const [manualMessages, setManualMessages] = useState<Record<string, ClientLeadMessage[]>>({});
  const [handoffTick, setHandoffTick] = useState(() => Date.now());
  const [selectedQueueKey, setSelectedQueueKey] = useState("all");
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [pushPrompt, setPushPrompt] = useState<AttendancePushPromptState>(() => ({
    busy: false,
    dismissed: false,
    message: null,
    permission: readAttendancePushPermissionState(),
    visible: false,
  }));
  const notifiedLeadMessages = useRef(new Set<string>());
  const notificationSeeded = useRef(false);

  const attendanceThreads = useMemo(() => buildAttendanceThreads(filteredLeads), [filteredLeads]);
  const queueFilters = useMemo(
    () => buildAttendanceQueueFilters(workspace.attendanceQueues, attendanceThreads),
    [attendanceThreads, workspace.attendanceQueues],
  );
  const selectedQueueExists = queueFilters.some((queue) => queue.key === selectedQueueKey);
  const effectiveQueueKey = selectedQueueExists ? selectedQueueKey : "all";
  const queueThreads = useMemo(
    () => attendanceThreads.filter((thread) => matchesAttendanceQueue(thread, effectiveQueueKey)),
    [attendanceThreads, effectiveQueueKey],
  );
  const tabItems = useMemo(() => buildAttendanceThreadTabs(queueThreads, handoffOverrides), [queueThreads, handoffOverrides]);
  const visibleThreads = useMemo(
    () => queueThreads.filter((thread) => matchesAttendanceThreadTab(thread, inboxTab, handoffOverrides)),
    [handoffOverrides, inboxTab, queueThreads],
  );
  const activeThread = visibleThreads.find((thread) => thread.key === selectedThreadKey)
    ?? visibleThreads.find((thread) => thread.lead.id === selectedLeadId)
    ?? visibleThreads[0]
    ?? queueThreads[0]
    ?? (effectiveQueueKey === "all" ? attendanceThreads[0] : null)
    ?? null;
  const activeLead = activeThread?.lead ?? null;
  const activeConversation = activeThread?.conversation ?? null;
  const activeHumanIntervention = activeThread ? getThreadHumanIntervention(activeThread, handoffOverrides) : emptyClientHumanIntervention();
  const activeConversationId = activeThread?.conversationId ?? null;
  const activeMessages = activeThread
    ? mergeConversationMessages(
        activeConversation?.messages ?? activeThread.lead.conversation.messages,
        activeConversationId ? manualMessages[activeConversationId] ?? [] : [],
      )
    : [];
  const handoffCountdown = formatHumanInterventionCountdown(activeHumanIntervention, handoffTick);
  const activeCartKey = activeConversationId ?? activeThread?.key ?? activeLead?.id ?? null;
  const activeCartItems = activeCartKey ? leadCarts[activeCartKey] ?? [] : [];
  const activeCartTotalCents = activeCartItems.reduce((total, item) => total + (item.unitPriceCents * item.quantity), 0);
  const visibleCatalogItems = useMemo(
    () => salesCatalogItems.filter((item) => !deletedCatalogItemIds.has(item.id)),
    [deletedCatalogItemIds, salesCatalogItems],
  );
  const availableCatalogItemIds = useMemo(
    () => new Set(visibleCatalogItems.filter((item) => item.status === "active").map((item) => item.id)),
    [visibleCatalogItems],
  );
  const activeCatalogProducts = useMemo(
    () => buildAttendanceCatalogProducts(visibleCatalogItems, activeLead?.companyId ?? null),
    [activeLead?.companyId, visibleCatalogItems],
  );

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setLeadCarts((current) => removeUnavailableCatalogCartItems(current, availableCatalogItemIds));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [availableCatalogItemIds]);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
      return;
    }

    const channel = new BroadcastChannel(salesCatalogBrowserEventsChannel);

    channel.onmessage = (event: MessageEvent<SalesCatalogBrowserEvent>) => {
      if (event.data?.type === "sales-catalog-updated") {
        router.refresh();
        return;
      }

      if (event.data?.type === "sales-catalog-item-deleted" && typeof event.data.itemId === "string") {
        setDeletedCatalogItemIds((current) => {
          const next = new Set(current);
          next.add(event.data.itemId as string);
          return next;
        });
        router.refresh();
      }
    };

    return () => channel.close();
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    let lastRefreshAt = 0;
    const refreshCatalogSnapshot = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 1500) {
        return;
      }

      lastRefreshAt = now;
      router.refresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshCatalogSnapshot();
      }
    };

    window.addEventListener("focus", refreshCatalogSnapshot);
    window.addEventListener("pageshow", refreshCatalogSnapshot);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshCatalogSnapshot);
      window.removeEventListener("pageshow", refreshCatalogSnapshot);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  function updateActiveCart(updater: (items: AttendanceCartItem[]) => AttendanceCartItem[]) {
    if (!activeCartKey) {
      return;
    }

    setLeadCarts((current) => ({
      ...current,
      [activeCartKey]: updater(current[activeCartKey] ?? []),
    }));
  }

  function addQuickCartItem(product: AttendanceQuickProduct) {
    updateActiveCart((items) => {
      const existing = items.find((item) => item.id === product.id);

      if (existing) {
        return items.map((item) => (
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        ));
      }

      return [
        ...items,
        {
          id: product.id,
          name: product.name,
          note: product.category,
          quantity: 1,
          source: "catalog",
          unitPriceCents: product.priceCents,
        },
      ];
    });
  }

  function addManualCartItem(input: { name: string; priceCents: number; quantity: number }) {
    updateActiveCart((items) => [
      ...items,
      {
        id: `manual-${Date.now()}-${items.length}`,
        name: input.name,
        quantity: input.quantity,
        source: "manual",
        unitPriceCents: input.priceCents,
      },
    ]);
  }

  function updateCartItemQuantity(itemId: string, quantity: number) {
    updateActiveCart((items) => {
      if (quantity <= 0) {
        return items.filter((item) => item.id !== itemId);
      }

      return items.map((item) => (
        item.id === itemId ? { ...item, quantity } : item
      ));
    });
  }

  function removeCartItem(itemId: string) {
    updateActiveCart((items) => items.filter((item) => item.id !== itemId));
  }

  function clearActiveCart() {
    updateActiveCart(() => []);
  }

  async function deleteQuickCatalogProduct(product: AttendanceQuickProduct) {
    if (catalogDeleteBusyId) {
      return;
    }

    setCatalogDeleteBusyId(product.id);
    setHandoffNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: product.companyId,
          itemId: product.id,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Nao foi possivel excluir o produto.");
      }

      setDeletedCatalogItemIds((current) => {
        const next = new Set(current);
        next.add(product.id);
        return next;
      });
      setLeadCarts((current) => {
        let changed = false;
        const next: Record<string, AttendanceCartItem[]> = {};

        for (const [key, items] of Object.entries(current)) {
          const filteredItems = items.filter((item) => !(item.source === "catalog" && item.id === product.id));
          if (filteredItems.length !== items.length) {
            changed = true;
          }
          next[key] = filteredItems;
        }

        return changed ? next : current;
      });
      setHandoffNotice({
        tone: "success",
        message: "Produto removido do catalogo e das sacolas abertas.",
      });
      router.refresh();
    } catch (error) {
      setHandoffNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao excluir produto.",
      });
    } finally {
      setCatalogDeleteBusyId(null);
    }
  }

  function useCartSummaryInReply() {
    if (!activeLead || !activeCartItems.length) {
      return;
    }

    setManualReply(buildLeadCartSummary(activeLead, activeCartItems));
    setHandoffNotice({
      tone: "success",
      message: "Resumo da sacola pronto no campo de resposta.",
    });
  }

  async function createCartCheckoutAndSend() {
    if (!activeLead || !activeConversationId || !activeCartItems.length) {
      setHandoffNotice({
        tone: "error",
        message: "Escolha uma conversa e adicione itens na sacola antes de gerar checkout.",
      });
      return;
    }

    setCartCheckoutBusy(true);
    setHandoffNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_cart_checkout",
          companyId: activeLead.companyId,
          conversationId: activeConversationId,
          customerEmail: activeLead.email,
          customerName: activeLead.name,
          customerPhone: activeLead.phone,
          leadId: activeLead.id,
          totalCents: activeCartTotalCents,
          items: activeCartItems.map((item) => ({
            catalogItemId: item.source === "catalog" ? item.id : null,
            name: item.name,
            note: item.note,
            quantity: item.quantity,
            source: item.source,
            totalCents: item.unitPriceCents * item.quantity,
            unitPriceCents: item.unitPriceCents,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        checkoutUrl?: string;
        trackingUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? "Nao foi possivel gerar o checkout da sacola.");
      }

      const checkoutUrl = payload.trackingUrl ?? payload.checkoutUrl;
      const message = buildLeadCheckoutMessage(activeLead, activeCartItems, checkoutUrl);
      const sent = await sendManualReply(message, "Checkout enviado pelo painel. IA pausada nesta conversa.");

      if (sent) {
        clearActiveCart();
      }
    } catch (error) {
      setHandoffNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao gerar checkout.",
      });
    } finally {
      setCartCheckoutBusy(false);
    }
  }

  function promptAttendancePushPermission() {
    const permission = readAttendancePushPermissionState();

    if (permission === "granted") {
      setPushPrompt((current) => ({
        ...current,
        busy: false,
        message: null,
        permission,
        visible: false,
      }));
      return;
    }

    if (permission === "unsupported") {
      setPushPrompt((current) => ({
        ...current,
        permission,
        visible: false,
      }));
      return;
    }

    setPushPrompt((current) => ({
      ...current,
      message: permission === "denied"
        ? "As notificacoes estao bloqueadas no navegador. Libere pelo cadeado ao lado do endereco."
        : current.message,
      permission,
      visible: true,
    }));
  }

  async function enableAttendancePushNotifications() {
    setPushPrompt((current) => ({
      ...current,
      busy: true,
      message: "Quando o navegador perguntar, clique em Permitir.",
      visible: true,
    }));

    const result = await requestAttendancePushSubscription();
    const permission = readAttendancePushPermissionState();

    setPushPrompt((current) => ({
      ...current,
      busy: false,
      dismissed: result === "granted" ? false : current.dismissed,
      message: getAttendancePushPromptMessage(result),
      permission,
      visible: result !== "granted",
    }));
  }

  function dismissAttendancePushPrompt() {
    setPushPrompt((current) => ({
      ...current,
      dismissed: true,
      visible: false,
    }));
  }

  useEffect(() => {
    const interval = window.setInterval(() => setHandoffTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    const interval = window.setInterval(() => {
      router.refresh();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [activeConversationId, router]);

  useEffect(() => {
    const inboundMessages = attendanceThreads.flatMap((thread) =>
      (thread.conversation?.messages ?? thread.lead.conversation.messages)
        .filter((message) => message.author === "lead" || message.direction === "inbound")
        .map((message) => ({ lead: thread.lead, message })),
    );

    if (!notificationSeeded.current) {
      for (const item of inboundMessages) {
        notifiedLeadMessages.current.add(item.message.id);
      }

      notificationSeeded.current = true;
      return;
    }

    for (const item of inboundMessages) {
      if (notifiedLeadMessages.current.has(item.message.id)) {
        continue;
      }

      notifiedLeadMessages.current.add(item.message.id);
      promptAttendancePushPermission();
      showLeadBrowserNotification(item.lead, item.message);
    }
  }, [attendanceThreads]);

  async function updateHumanHandoff(action: "pause" | "resume") {
    if (!activeConversationId) {
      setHandoffNotice({ tone: "error", message: "Esta conversa ainda nao tem ID vinculado para pausar a IA." });
      return;
    }

    setHandoffBusy(true);
    setHandoffNotice(null);

    try {
      const response = await fetch("/api/dashboard/conversations/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          conversationId: activeConversationId,
          minutes: 60,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        humanIntervention?: ClientLeadHumanIntervention;
      };

      if (!response.ok || !payload.humanIntervention) {
        throw new Error(payload.error ?? "Nao foi possivel atualizar a intervencao humana.");
      }

      setHandoffOverrides((current) => ({
        ...current,
        [activeConversationId]: payload.humanIntervention!,
      }));
      setHandoffNotice({
        tone: "success",
        message: action === "pause" ? "IA pausada para atendimento humano." : "IA retomada para esta conversa.",
      });
      router.refresh();
    } catch (error) {
      setHandoffNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao atualizar atendimento.",
      });
    } finally {
      setHandoffBusy(false);
    }
  }

  async function sendManualReply(textOverride?: string, successMessage = "Resposta enviada pelo painel. IA pausada nesta conversa.") {
    if (replyBusy) {
      return false;
    }

    const text = (textOverride ?? manualReply).trim();

    if (!activeConversationId) {
      setHandoffNotice({ tone: "error", message: "Escolha uma conversa valida antes de responder." });
      return false;
    }

    if (!text) {
      setHandoffNotice({ tone: "error", message: "Digite uma mensagem para enviar." });
      return false;
    }

    setReplyBusy(true);
    setHandoffNotice(null);

    try {
      const response = await fetch("/api/dashboard/conversations/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          text,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        humanIntervention?: ClientLeadHumanIntervention;
        message?: ClientLeadMessage;
      };

      if (!response.ok || !payload.message) {
        throw new Error(payload.error ?? "Nao foi possivel enviar a resposta pelo painel.");
      }

      setManualMessages((current) => ({
        ...current,
        [activeConversationId]: [
          ...(current[activeConversationId] ?? []),
          payload.message!,
        ],
      }));

      if (payload.humanIntervention) {
        setHandoffOverrides((current) => ({
          ...current,
          [activeConversationId]: payload.humanIntervention!,
        }));
      }

      setManualReply("");
      setHandoffNotice({ tone: "success", message: successMessage });
      router.refresh();
      return true;
    } catch (error) {
      setHandoffNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao responder pelo painel.",
      });
      return false;
    } finally {
      setReplyBusy(false);
    }
  }

  function handleManualReplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendManualReply();
  }

  function handleManualReplyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendManualReply();
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="overflow-hidden rounded-[22px] border shadow-[0_24px_70px_rgba(17,17,17,0.08)]"
        style={{ borderColor: "var(--ch-border-strong)", background: "rgba(255,255,255,0.94)" }}
      >
        <div className="grid h-[calc(100svh-300px)] min-h-[620px] max-h-[900px] xl:grid-cols-[360px_minmax(0,1fr)_340px]">
          <aside
            className={cn(
              "flex h-full min-h-0 flex-col border-b bg-white xl:border-b-0 xl:border-r",
              conversationPane === "chat" && "hidden xl:block",
            )}
            style={{ borderColor: "var(--ch-border)" }}
          >
            <div className="border-b px-4 py-4" style={{ borderColor: "var(--ch-border)" }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Central WhatsApp</p>
                  <h2 className="mt-1 text-[20px] font-bold text-slate-950">Atendimento</h2>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {queueThreads.length} conversas / {queueThreads.filter((thread) => thread.lead.status === "active").length} em atendimento
                  </p>
                </div>
                <Link
                  className="grid h-10 w-10 place-items-center rounded-xl border text-slate-700 transition hover:bg-slate-100"
                  href="/dashboard/whatsapp"
                  style={{ borderColor: "var(--ch-border)" }}
                  title="Configurar agentes"
                >
                  <Bot className="h-4 w-4" />
                </Link>
              </div>

              {queueFilters.length > 1 ? (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {queueFilters.map((queue) => (
                    <button
                      key={queue.key}
                      className={cn(
                        "inline-flex h-9 max-w-[210px] shrink-0 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold transition",
                        effectiveQueueKey === queue.key
                          ? "border-slate-950 bg-slate-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.16)]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950",
                      )}
                      onClick={() => {
                        setSelectedQueueKey(queue.key);
                        setSelectedThreadKey(null);
                      }}
                      title={queue.detail ?? queue.label}
                      type="button"
                    >
                      <span className="truncate">{queue.label}</span>
                      <span className={cn("font-mono text-[10px]", effectiveQueueKey === queue.key ? "text-white/75" : "text-slate-400")}>
                        {queue.count}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              <label className="relative mt-4 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  className="h-11 w-full rounded-full border bg-slate-100/80 pl-10 pr-3 text-[13px] text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-red-500/45 focus:bg-white"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Pesquisar ou comecar atendimento"
                  style={{ borderColor: "var(--ch-border)" }}
                  type="search"
                  value={search}
                />
              </label>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {tabItems.map((item) => (
                  <button
                    key={item.value}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition",
                      inboxTab === item.value
                        ? "border-red-500 bg-red-600 text-white shadow-[0_10px_22px_rgba(229,9,20,0.18)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-red-300 hover:text-red-600",
                    )}
                    onClick={() => setInboxTab(item.value)}
                    type="button"
                  >
                    {item.label}
                    <span className={cn("font-mono text-[10px]", inboxTab === item.value ? "text-white/80" : "text-slate-400")}>{item.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {visibleThreads.map((thread) => {
                const lead = thread.lead;
                const latestMessage = thread.latestMessage;
                const humanIntervention = getThreadHumanIntervention(thread, handoffOverrides);
                const queueLabel = formatThreadQueueLabel(thread);
                const selected = activeThread?.key === thread.key;

                return (
                  <button
                    key={thread.key}
                    className={cn(
                      "grid w-full grid-cols-[48px_minmax(0,1fr)] gap-3 border-b px-4 py-3 text-left transition",
                      selected ? "bg-red-50" : "bg-white hover:bg-slate-50",
                    )}
                    onClick={() => {
                      setSelectedThreadKey(thread.key);
                      setSelectedLeadId(lead.id);
                      setConversationPane("chat");
                    }}
                    style={{ borderColor: "var(--ch-border)" }}
                    type="button"
                  >
                    <LeadAvatar lead={lead} />
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[14px] font-semibold text-slate-950">{lead.name}</p>
                        <span className="shrink-0 text-[11px] text-slate-500">{formatTime(thread.lastMessageAt ?? lead.updatedAt)}</span>
                      </div>
                      <p className="mt-1 truncate text-[12px] text-slate-600">
                        {latestMessage ? `${formatMessageAuthorShort(latestMessage)}: ${latestMessage.text}` : thread.conversation?.preview ?? lead.conversation.preview ?? lead.summary}
                      </p>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                        <NeonBadge tone="zinc">{queueLabel}</NeonBadge>
                        <StatusPill status={lead.status} />
                        {humanIntervention.active ? <NeonBadge tone="amber">IA pausada</NeonBadge> : null}
                        {hasUnreadThreadSignal(thread) ? <NeonBadge tone="cyan">lead respondeu</NeonBadge> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
              {!visibleThreads.length ? (
                <div className="p-4">
                  <EmptyState title="Nada neste filtro" detail="Troque o filtro ou aguarde novas mensagens chegarem pelo WhatsApp." />
                </div>
              ) : null}
            </div>
          </aside>

          <main className={cn("min-h-0 bg-[#efeae2]", conversationPane === "inbox" && "hidden xl:block")}>
            {activeLead ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex min-h-[70px] flex-col gap-3 border-b bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: "var(--ch-border)" }}>
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-slate-700 xl:hidden"
                      onClick={() => setConversationPane("inbox")}
                      style={{ borderColor: "var(--ch-border)" }}
                      type="button"
                    >
                      <ChevronDown className="h-4 w-4 rotate-90" />
                    </button>
                    <LeadAvatar lead={activeLead} />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-slate-950">{activeLead.name}</p>
                      <p className="truncate text-[12px] text-slate-500">
                        {[activeLead.phone, activeThread ? formatThreadQueueLabel(activeThread) : null].filter(Boolean).join(" / ") || activeLead.companyName}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
                    <AttendanceHeaderNotices
                      countdown={handoffCountdown}
                      handoffNotice={handoffNotice}
                      humanIntervention={activeHumanIntervention}
                    />
                    <button
                      className="hidden h-9 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
                      onClick={() => setDetailsLeadId(activeLead.id)}
                      style={{ borderColor: "var(--ch-border)" }}
                      type="button"
                    >
                      <FileText className="h-4 w-4" />
                      Arquivo
                    </button>
                  </div>
                </div>

                <div
                  className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
                  style={{
                    backgroundColor: "#efeae2",
                    backgroundImage:
                      `linear-gradient(rgba(239,234,226,0.28), rgba(239,234,226,0.28)), url("${whatsappConversationBackgroundUrl}")`,
                    backgroundPosition: "center",
                    backgroundRepeat: "repeat",
                    backgroundSize: "420px auto",
                  }}
                >
                  <ChatMessages messages={activeMessages} />
                </div>

                <div className="border-t bg-white px-3 py-2" style={{ borderColor: "var(--ch-border)" }}>
                  {pushPrompt.visible ? (
                    <AttendancePushPermissionPrompt
                      busy={pushPrompt.busy}
                      message={pushPrompt.message}
                      onDismiss={dismissAttendancePushPrompt}
                      onEnable={() => void enableAttendancePushNotifications()}
                      permission={pushPrompt.permission}
                    />
                  ) : null}
                  <form className="flex flex-col gap-2 lg:flex-row lg:items-end" onSubmit={handleManualReplySubmit}>
                    <label className="relative block min-w-0 flex-1">
                      <textarea
                        className="max-h-24 min-h-10 w-full resize-none rounded-2xl border bg-slate-100/80 px-4 py-2 text-[13px] leading-6 text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-red-500/45 focus:bg-white lg:h-10"
                        disabled={replyBusy}
                        onKeyDown={handleManualReplyKeyDown}
                        onChange={(event) => setManualReply(event.target.value)}
                        placeholder="Digite uma resposta aqui no painel..."
                        style={{ borderColor: "var(--ch-border)" }}
                        value={manualReply}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2 lg:flex lg:w-auto lg:shrink-0">
                      <button
                        className={cn(
                          "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-bold transition lg:w-[112px]",
                          activeHumanIntervention.active
                            ? "border border-slate-200 bg-white text-slate-800 hover:bg-slate-100"
                            : "bg-red-600 text-white hover:bg-red-700",
                        )}
                        disabled={handoffBusy || replyBusy}
                        onClick={() => void updateHumanHandoff(activeHumanIntervention.active ? "resume" : "pause")}
                        type="button"
                      >
                        {handoffBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : activeHumanIntervention.active ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                        {activeHumanIntervention.active ? "Retomar IA" : "Assumir"}
                      </button>
                      <button
                        className={cn(
                          "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-bold transition lg:w-[122px]",
                          activeConversationId && manualReply.trim() && !replyBusy
                            ? "bg-slate-950 text-white hover:bg-slate-800"
                            : "bg-slate-200 text-slate-500",
                        )}
                        disabled={!activeConversationId || !manualReply.trim() || replyBusy}
                        type="submit"
                      >
                        {replyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {replyBusy ? "Enviando" : "Responder"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="grid h-full min-h-0 place-items-center p-6">
                <EmptyState title="Sem conversa selecionada" detail="Escolha um lead na inbox para acompanhar o atendimento ao vivo." />
              </div>
            )}
          </main>

          <aside className="hidden min-h-0 border-l bg-white xl:block" style={{ borderColor: "var(--ch-border)" }}>
            {activeLead ? (
              <AttendanceSalesBagPanel
                cartItems={activeCartItems}
                checkoutBusy={cartCheckoutBusy}
                lead={activeLead}
                onAddManualItem={addManualCartItem}
                onAddQuickItem={addQuickCartItem}
                onClearCart={clearActiveCart}
                onCreateCheckout={() => void createCartCheckoutAndSend()}
                onDeleteQuickItem={(product) => void deleteQuickCatalogProduct(product)}
                onRemoveItem={removeCartItem}
                onUpdateQuantity={updateCartItemQuantity}
                onUseSummary={useCartSummaryInReply}
                productDeleteBusyId={catalogDeleteBusyId}
                quickProducts={activeCatalogProducts}
                totalCents={activeCartTotalCents}
              />
            ) : (
              <div className="grid h-full min-h-0 place-items-center p-4">
                <EmptyState title="Sem lead" detail="Selecione uma conversa para ver detalhes." />
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function AttendanceHeaderNotices({
  countdown,
  handoffNotice,
  humanIntervention,
}: {
  countdown: string | null;
  handoffNotice: { tone: "success" | "error"; message: string } | null;
  humanIntervention: ClientLeadHumanIntervention;
}) {
  if (!handoffNotice && !humanIntervention.active) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {handoffNotice ? (
        <span
          className={cn(
            "inline-flex max-w-[260px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold",
            handoffNotice.tone === "success"
              ? "border-emerald-500/25 bg-emerald-50 text-emerald-700"
              : "border-red-500/25 bg-red-50 text-red-700",
          )}
          title={handoffNotice.message}
        >
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", handoffNotice.tone === "success" ? "bg-emerald-500" : "bg-red-500")} />
          <span className="truncate">{handoffNotice.message}</span>
        </span>
      ) : null}
      {humanIntervention.active ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800"
          title="IA pausada por atendimento humano. A IA pode assumir antes se o lead ficar sem resposta."
        >
          <PauseCircle className="h-3.5 w-3.5" />
          IA pausada
          <span className="font-mono text-[10px] text-emerald-700">
            {countdown ?? "sem prazo"}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function AttendancePushPermissionPrompt({
  busy,
  message,
  onDismiss,
  onEnable,
  permission,
}: {
  busy: boolean;
  message: string | null;
  onDismiss: () => void;
  onEnable: () => void;
  permission: BrowserPushPermissionState;
}) {
  const blocked = permission === "denied";

  return (
    <div className="mb-2 rounded-2xl border border-red-200 bg-red-50/80 px-3 py-3 text-[12px] text-slate-800 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-600 text-white">
            <Bell className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-950">
              {blocked ? "Notificacoes bloqueadas neste navegador" : "Ative alertas de respostas dos leads"}
            </p>
            <p className="mt-1 leading-5 text-slate-600">
              {blocked
                ? "Para receber avisos, clique no cadeado ao lado do endereco do site e libere Notificacoes."
                : "Quando um lead responder e voce estiver em outra aba, o ConnectyHub avisa pelo navegador."}
            </p>
            {message ? (
              <p className="mt-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] leading-4 text-red-700">
                {message}
              </p>
            ) : null}
          </div>
        </div>
        <button
          aria-label="Fechar aviso de notificacoes"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-red-100 bg-white text-slate-500 transition hover:border-red-200 hover:text-red-600"
          onClick={onDismiss}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className={cn(
            "inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-bold transition",
            blocked
              ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
              : "bg-red-600 text-white hover:bg-red-700",
          )}
          disabled={busy}
          onClick={onEnable}
          type="button"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
          {busy ? "Aguardando" : blocked ? "Tentar liberar" : "Ativar notificacoes"}
        </button>
        <span className="text-[11px] text-slate-500">
          O navegador sempre vai pedir uma confirmacao sua antes de ativar.
        </span>
      </div>
    </div>
  );
}

function AttendanceSalesBagPanel({
  cartItems,
  checkoutBusy,
  lead,
  onAddManualItem,
  onAddQuickItem,
  onClearCart,
  onCreateCheckout,
  onDeleteQuickItem,
  onRemoveItem,
  onUpdateQuantity,
  onUseSummary,
  productDeleteBusyId,
  quickProducts,
  totalCents,
}: {
  cartItems: AttendanceCartItem[];
  checkoutBusy: boolean;
  lead: ClientLeadRecord;
  onAddManualItem: (input: { name: string; priceCents: number; quantity: number }) => void;
  onAddQuickItem: (product: AttendanceQuickProduct) => void;
  onClearCart: () => void;
  onCreateCheckout: () => void;
  onDeleteQuickItem: (product: AttendanceQuickProduct) => void | Promise<void>;
  onRemoveItem: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onUseSummary: () => void;
  productDeleteBusyId: string | null;
  quickProducts: AttendanceQuickProduct[];
  totalCents: number;
}) {
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");
  const [productSearch, setProductSearch] = useState("");
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const manualPriceCents = parseCurrencyInputToCents(manualPrice);
  const manualQuantityNumber = Math.max(1, Math.min(99, Number.parseInt(manualQuantity, 10) || 1));
  const canAddManualItem = Boolean(manualName.trim()) && manualPriceCents > 0;
  const normalizedProductSearch = productSearch.trim().toLowerCase();
  const visibleQuickProducts = useMemo(() => {
    if (!normalizedProductSearch) {
      return quickProducts;
    }

    return quickProducts.filter((product) => (
      product.name.toLowerCase().includes(normalizedProductSearch)
      || product.description.toLowerCase().includes(normalizedProductSearch)
      || product.category.toLowerCase().includes(normalizedProductSearch)
    ));
  }, [normalizedProductSearch, quickProducts]);

  function handleAddManualItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canAddManualItem) {
      return;
    }

    onAddManualItem({
      name: manualName.trim(),
      priceCents: manualPriceCents,
      quantity: manualQuantityNumber,
    });
    setManualName("");
    setManualPrice("");
    setManualQuantity("1");
  }

  function handleDeleteQuickProduct(product: AttendanceQuickProduct) {
    if (productDeleteBusyId) {
      return;
    }

    if (confirmDeleteProductId !== product.id) {
      setConfirmDeleteProductId(product.id);
      return;
    }

    setConfirmDeleteProductId(null);
    void onDeleteQuickItem(product);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b px-4 py-4" style={{ borderColor: "var(--ch-border)" }}>
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Venda manual</p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-bold text-slate-950">Sacola do lead</h3>
            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">
              Monte o pedido de {lead.name} sem gastar credito de IA.
            </p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-red-600 text-white shadow-[0_14px_30px_rgba(229,9,20,0.18)]">
            <ShoppingBag className="h-4 w-4" />
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">Total</p>
            <p className="mt-1 truncate text-[16px] font-black text-slate-950">{formatCurrencyCents(totalCents)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">Itens</p>
            <p className="mt-1 truncate text-[16px] font-black text-slate-950">{cartItems.reduce((total, item) => total + item.quantity, 0)}</p>
          </div>
        </div>

      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Catalogo</p>
              <h4 className="mt-1 text-[14px] font-bold text-slate-950">Produtos cadastrados</h4>
            </div>
            <Link
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
              href="/dashboard/links"
            >
              <Package className="h-3.5 w-3.5" />
              Catalogo
            </Link>
          </div>

          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Pesquisar produto na sacola"
              className="h-10 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-[12px] text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-100"
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Pesquisar produto cadastrado..."
              type="search"
              value={productSearch}
            />
          </label>

          <div className="mt-3 space-y-2">
            {quickProducts.length && visibleQuickProducts.length ? visibleQuickProducts.map((product) => {
              const hasPrice = product.priceCents > 0;
              const confirmingDelete = confirmDeleteProductId === product.id;
              const deletingProduct = productDeleteBusyId === product.id;

              return (
                <div
                  key={product.id}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 text-left transition",
                    hasPrice
                      ? "border-slate-200 bg-white hover:border-red-200 hover:bg-red-50"
                      : "border-amber-200 bg-amber-50/60 opacity-80",
                  )}
                >
                  <button
                    className={cn("min-w-0 text-left", hasPrice ? "cursor-pointer" : "cursor-not-allowed")}
                    disabled={!hasPrice}
                    onClick={() => onAddQuickItem(product)}
                    type="button"
                  >
                    <span className="block truncate text-[13px] font-bold text-slate-950">{product.name}</span>
                    <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-slate-500">{product.description}</span>
                    <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-slate-500">
                      {product.category}
                    </span>
                  </button>
                  <div className="text-right">
                    <span className={cn("block font-mono text-[12px] font-bold", hasPrice ? "text-red-600" : "text-amber-700")}>
                      {hasPrice ? formatCurrencyCents(product.priceCents) : "Sem valor"}
                    </span>
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <button
                        aria-label={`Adicionar ${product.name} a sacola`}
                        className={cn(
                          "inline-grid h-8 w-8 place-items-center rounded-xl text-white transition",
                          hasPrice ? "bg-red-600 hover:bg-red-700" : "cursor-not-allowed bg-amber-400",
                        )}
                        disabled={!hasPrice}
                        onClick={() => onAddQuickItem(product)}
                        type="button"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label={confirmingDelete ? `Confirmar exclusao de ${product.name}` : `Excluir ${product.name}`}
                        className={cn(
                          "inline-grid h-8 w-8 place-items-center rounded-xl border text-slate-500 transition",
                          confirmingDelete
                            ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                            : "border-slate-200 bg-white hover:border-red-200 hover:bg-red-50 hover:text-red-600",
                        )}
                        disabled={deletingProduct}
                        onClick={() => handleDeleteQuickProduct(product)}
                        title={confirmingDelete ? "Clique novamente para excluir" : "Excluir produto"}
                        type="button"
                      >
                        {deletingProduct ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  {confirmingDelete ? (
                    <p className="col-span-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-600">
                      Clique na lixeira novamente para excluir este produto do catalogo.
                    </p>
                  ) : null}
                  {!hasPrice ? (
                    <p className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold leading-4 text-amber-700">
                      Produto sem preco cadastrado. Edite no Catalogo de Vendas para liberar a adicao na sacola do lead.
                    </p>
                  ) : null}
                </div>
              );
            }) : quickProducts.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                <Search className="mx-auto h-5 w-5 text-slate-400" />
                <p className="mt-2 text-[13px] font-bold text-slate-950">Nenhum produto encontrado</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Tente buscar pelo nome, categoria ou descricao do produto cadastrado.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                <Package className="mx-auto h-5 w-5 text-slate-400" />
                <p className="mt-2 text-[13px] font-bold text-slate-950">Nenhum produto cadastrado</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Cadastre produtos no Catalogo de Vendas para eles aparecerem aqui automaticamente.
                </p>
                <Link
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-xl bg-slate-950 px-3 text-[11px] font-bold text-white transition hover:bg-slate-800"
                  href="/dashboard/links"
                >
                  Cadastrar produtos
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Item personalizado</p>
          <form className="mt-3 space-y-2" onSubmit={handleAddManualItem}>
            <input
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-red-400"
              onChange={(event) => setManualName(event.target.value)}
              placeholder="Ex: meia calabresa + meia catupiry"
              value={manualName}
            />
            <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-red-400"
                inputMode="decimal"
                onChange={(event) => setManualPrice(event.target.value)}
                placeholder="Valor"
                value={manualPrice}
              />
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-[12px] text-slate-950 outline-none transition focus:border-red-400"
                inputMode="numeric"
                min={1}
                onChange={(event) => setManualQuantity(event.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="Qtd"
                type="text"
                value={manualQuantity}
              />
            </div>
            <button
              className={cn(
                "inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[12px] font-bold transition",
                canAddManualItem ? "bg-slate-950 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-500",
              )}
              disabled={!canAddManualItem}
              type="submit"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar a sacola
            </button>
          </form>
        </section>

        <section>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Pedido atual</p>
              <h4 className="mt-1 text-[14px] font-bold text-slate-950">Carrinho manual</h4>
            </div>
            {cartItems.length ? (
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[11px] font-semibold text-slate-500 transition hover:border-red-200 hover:text-red-600"
                onClick={onClearCart}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar
              </button>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            {cartItems.length ? cartItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-slate-950">{item.name}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{item.note ?? (item.source === "manual" ? "Item manual" : "Catalogo")}</p>
                  </div>
                  <button
                    aria-label={`Remover ${item.name}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    onClick={() => onRemoveItem(item.id)}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50">
                    <button
                      aria-label={`Diminuir quantidade de ${item.name}`}
                      className="grid h-8 w-8 place-items-center text-slate-600 transition hover:text-red-600"
                      onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                      type="button"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center font-mono text-[12px] font-bold text-slate-950">{item.quantity}</span>
                    <button
                      aria-label={`Aumentar quantidade de ${item.name}`}
                      className="grid h-8 w-8 place-items-center text-slate-600 transition hover:text-red-600"
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      type="button"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[10px] text-slate-500">{formatCurrencyCents(item.unitPriceCents)} un.</p>
                    <p className="font-mono text-[13px] font-black text-slate-950">{formatCurrencyCents(item.unitPriceCents * item.quantity)}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                <ShoppingBag className="mx-auto h-5 w-5 text-slate-400" />
                <p className="mt-2 text-[13px] font-bold text-slate-950">Sacola vazia</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Adicione produtos para montar uma proposta e enviar pelo chat.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="border-t bg-white p-4" style={{ borderColor: "var(--ch-border)" }}>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <span>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-red-500">Fechamento</p>
              <p className="mt-1 text-[20px] font-black text-slate-950">{formatCurrencyCents(totalCents)}</p>
            </span>
            <CreditCard className="h-5 w-5 text-red-600" />
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-600">
            Gere um checkout seguro da ConnectyHub com os itens da sacola e envie o link de pagamento pelo chat.
          </p>
        </div>

        <button
          className={cn(
            "mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[12px] font-bold transition",
            cartItems.length && !checkoutBusy ? "bg-red-600 text-white hover:bg-red-700" : "bg-slate-200 text-slate-500",
          )}
          disabled={!cartItems.length || checkoutBusy}
          onClick={onCreateCheckout}
          type="button"
        >
          {checkoutBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
          {checkoutBusy ? "Gerando checkout" : "Gerar e enviar checkout"}
        </button>

        <button
          className={cn(
            "mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border text-[12px] font-bold transition",
            cartItems.length && !checkoutBusy
              ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-100"
              : "border-slate-200 bg-slate-100 text-slate-400",
          )}
          disabled={!cartItems.length || checkoutBusy}
          onClick={onUseSummary}
          type="button"
        >
          <Copy className="h-3.5 w-3.5" />
          Usar resumo no chat
        </button>
      </div>
    </div>
  );
}

function buildAttendanceThreads(leads: ClientLeadRecord[]): AttendanceThread[] {
  const threads: AttendanceThread[] = [];

  for (const lead of leads) {
    if (!lead.leadFile.conversations.length) {
      const latestMessage = lead.conversation.messages.at(-1) ?? null;
      const fallbackConversationId = lead.conversation.id;

      threads.push({
        key: fallbackConversationId ? `conversation:${fallbackConversationId}` : `lead:${lead.id}`,
        lead,
        conversation: null,
        conversationId: fallbackConversationId,
        queueKey: queueKeyForConversation(lead.conversation),
        latestMessage,
        lastMessageAt: latestMessage?.occurredAt ?? lead.lastMessageAt ?? lead.updatedAt,
      });
      continue;
    }

    for (const conversation of lead.leadFile.conversations) {
      const latestMessage = conversation.messages.at(-1) ?? null;

      threads.push({
        key: `conversation:${conversation.id}`,
        lead,
        conversation,
        conversationId: conversation.id,
        queueKey: queueKeyForConversation(conversation),
        latestMessage,
        lastMessageAt: latestMessage?.occurredAt ?? conversation.lastMessageAt ?? conversation.updatedAt ?? lead.lastMessageAt ?? lead.updatedAt,
      });
    }
  }

  return threads.sort((a, b) => toTimestamp(b.lastMessageAt) - toTimestamp(a.lastMessageAt));
}

function buildAttendanceQueueFilters(
  queues: ClientLeadAttendanceQueue[],
  threads: AttendanceThread[],
): AttendanceQueueFilter[] {
  const filters = new Map<string, AttendanceQueueFilter>();

  filters.set("all", {
    key: "all",
    label: "Todos",
    detail: "Todas as filas de atendimento",
    count: threads.length,
    status: null,
    avatarUrl: null,
  });

  for (const queue of queues) {
    const key = normalizeAttendanceQueueKey(queue);

    filters.set(key, {
      key,
      label: queue.label,
      detail: queue.detail,
      count: threads.filter((thread) => matchesAttendanceQueue(thread, key)).length,
      status: queue.status,
      avatarUrl: queue.avatarUrl,
    });
  }

  for (const thread of threads) {
    if (filters.has(thread.queueKey)) {
      continue;
    }

    filters.set(thread.queueKey, {
      key: thread.queueKey,
      label: formatThreadQueueLabel(thread),
      detail: thread.conversation?.whatsappInstancePhone ?? thread.lead.companyName,
      count: threads.filter((candidate) => matchesAttendanceQueue(candidate, thread.queueKey)).length,
      status: thread.conversation?.whatsappInstanceStatus ?? thread.lead.conversation.whatsappInstanceStatus,
      avatarUrl: thread.conversation?.agentAvatarUrl ?? thread.lead.conversation.agentAvatarUrl,
    });
  }

  const [, ...specificFilters] = Array.from(filters.values());

  return [
    filters.get("all")!,
    ...specificFilters.sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
  ];
}

function normalizeAttendanceQueueKey(queue: ClientLeadAttendanceQueue) {
  if (queue.whatsappInstanceId) return `instance:${queue.whatsappInstanceId}`;
  if (queue.agentId) return `agent:${queue.agentId}`;
  return queue.key;
}

function matchesAttendanceQueue(thread: AttendanceThread, key: string) {
  if (key === "all") return true;
  return thread.queueKey === key;
}

function buildAttendanceThreadTabs(
  threads: AttendanceThread[],
  overrides: Record<string, ClientLeadHumanIntervention>,
): Array<{ value: AttendanceInboxTab; label: string; count: number }> {
  return [
    { value: "all", label: "Tudo", count: threads.length },
    { value: "unread", label: "Nao lidas", count: threads.filter(hasUnreadThreadSignal).length },
    { value: "active", label: "Em atendimento", count: threads.filter((thread) => thread.lead.status === "active").length },
    { value: "paused", label: "IA pausada", count: threads.filter((thread) => getThreadHumanIntervention(thread, overrides).active).length },
    { value: "qualified", label: "Qualificados", count: threads.filter((thread) => thread.lead.status === "qualified" || thread.lead.score >= 70).length },
    { value: "won", label: "Ganhos", count: threads.filter((thread) => thread.lead.status === "won").length },
    { value: "archived", label: "Arquivados", count: threads.filter((thread) => thread.lead.status === "archived").length },
  ];
}

function matchesAttendanceThreadTab(
  thread: AttendanceThread,
  tab: AttendanceInboxTab,
  overrides: Record<string, ClientLeadHumanIntervention>,
) {
  if (tab === "all") return true;
  if (tab === "unread") return hasUnreadThreadSignal(thread);
  if (tab === "active") return thread.lead.status === "active";
  if (tab === "paused") return getThreadHumanIntervention(thread, overrides).active;
  if (tab === "qualified") return thread.lead.status === "qualified" || thread.lead.score >= 70;
  if (tab === "won") return thread.lead.status === "won";
  if (tab === "archived") return thread.lead.status === "archived";
  return true;
}

function queueKeyForConversation(conversation: {
  agentId: string | null;
  whatsappInstanceId: string | null;
}) {
  if (conversation.whatsappInstanceId) return `instance:${conversation.whatsappInstanceId}`;
  if (conversation.agentId) return `agent:${conversation.agentId}`;
  return "unassigned";
}

function formatThreadQueueLabel(thread: AttendanceThread) {
  return thread.conversation?.agentName
    ?? thread.conversation?.whatsappInstanceName
    ?? thread.conversation?.whatsappInstancePhone
    ?? thread.lead.conversation.agentName
    ?? thread.lead.conversation.whatsappInstanceName
    ?? thread.lead.conversation.whatsappInstancePhone
    ?? "Sem agente";
}

function hasUnreadThreadSignal(thread: AttendanceThread) {
  const latest = thread.latestMessage;
  return thread.lead.status === "new" || latest?.author === "lead" || latest?.direction === "inbound";
}

function getThreadHumanIntervention(
  thread: AttendanceThread,
  overrides: Record<string, ClientLeadHumanIntervention>,
) {
  const serverHumanIntervention = thread.conversation?.humanIntervention ?? thread.lead.conversation.humanIntervention;
  const override = thread.conversationId ? overrides[thread.conversationId] : null;

  if (!override) {
    return serverHumanIntervention;
  }

  const serverUpdatedAt = toTimestamp(serverHumanIntervention.updatedAt);
  const overrideUpdatedAt = toTimestamp(override.updatedAt);

  return serverUpdatedAt > overrideUpdatedAt ? serverHumanIntervention : override;
}

function emptyClientHumanIntervention(): ClientLeadHumanIntervention {
  return {
    active: false,
    pausedUntil: null,
    reason: null,
    source: null,
    updatedAt: null,
  };
}

function formatMessageAuthorShort(message: ClientLeadMessage) {
  if (message.author === "lead") return "Lead";
  if (message.author === "ai") return "IA";
  if (message.author === "human") return "Voce";
  return "Sistema";
}

function mergeConversationMessages(serverMessages: ClientLeadMessage[], localMessages: ClientLeadMessage[]) {
  const seen = new Set<string>();
  const merged: ClientLeadMessage[] = [];

  for (const message of [...serverMessages, ...localMessages]) {
    const key = message.providerMessageId
      ? `provider:${message.providerMessageId}`
      : `local:${message.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(message);
  }

  return merged.sort((a, b) => toTimestamp(a.occurredAt) - toTimestamp(b.occurredAt));
}

function formatHumanInterventionCountdown(humanIntervention: ClientLeadHumanIntervention, nowMs: number) {
  if (!humanIntervention.active || !humanIntervention.pausedUntil) {
    return null;
  }

  const pausedUntilMs = toTimestamp(humanIntervention.pausedUntil);
  const remainingMs = pausedUntilMs - nowMs;

  if (remainingMs <= 0) {
    return "0s";
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function readAttendancePushPermissionState(): BrowserPushPermissionState {
  if (
    typeof window === "undefined"
    || typeof Notification === "undefined"
    || !("serviceWorker" in navigator)
    || !("PushManager" in window)
  ) {
    return "unsupported";
  }

  return Notification.permission;
}

async function requestAttendancePushSubscription(): Promise<"granted" | "denied" | "dismissed" | "unsupported" | "failed"> {
  if (
    typeof window === "undefined"
    || typeof Notification === "undefined"
    || !("serviceWorker" in navigator)
    || !("PushManager" in window)
  ) {
    return "unsupported";
  }

  const vapidPublicKey = await resolveAttendanceVapidPublicKey();

  if (!vapidPublicKey) {
    return "unsupported";
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      return permission === "denied" ? "denied" : "dismissed";
    }

    const registration = await navigator.serviceWorker.register("/connecty-push-sw.js", { scope: "/" });
    await registration.update().catch(() => undefined);
    const readyRegistration = await navigator.serviceWorker.ready;
    const existingSubscription = await readyRegistration.pushManager.getSubscription();
    const subscription = existingSubscription ?? await readyRegistration.pushManager.subscribe({
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      userVisibleOnly: true,
    });
    const snapshot = getTrackingSnapshot();
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitor_cookie_id: snapshot.visitorId,
        session_cookie_id: snapshot.sessionId,
        permission,
        subscription: subscription.toJSON(),
        metadata: {
          page_path: window.location.pathname,
          page_url: window.location.href,
          page_title: document.title,
          source: "attendance_center_prompt",
          first_touch: snapshot.firstTouch,
          last_touch: snapshot.lastTouch,
          attribution: snapshot.attribution,
          consent: snapshot.consent,
          tracking_cookies: snapshot.cookies,
        },
      }),
    });

    if (!response.ok) {
      return "failed";
    }

    return "granted";
  } catch {
    return "failed";
  }
}

function getAttendancePushPromptMessage(result: "granted" | "denied" | "dismissed" | "unsupported" | "failed") {
  if (result === "granted") {
    return "Pronto. Voce vai receber alertas quando leads responderem.";
  }

  if (result === "denied") {
    return "O navegador bloqueou notificacoes. Libere pelo cadeado ao lado do endereco do site.";
  }

  if (result === "dismissed") {
    return "Voce fechou o aviso do navegador. Clique em ativar quando quiser receber alertas.";
  }

  if (result === "unsupported") {
    return "Nao encontramos a configuracao de push ou este navegador nao suporta alertas nesta sessao.";
  }

  return "Nao conseguimos ativar agora. Tente novamente em alguns instantes.";
}

async function resolveAttendanceVapidPublicKey() {
  if (attendanceVapidPublicKey !== null) {
    return attendanceVapidPublicKey;
  }

  if (!attendanceVapidPublicKeyPromise) {
    attendanceVapidPublicKeyPromise = fetch("/api/push/config", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          return "";
        }

        const payload = await response.json().catch(() => null) as { public_key?: unknown } | null;
        return typeof payload?.public_key === "string" ? payload.public_key.trim() : "";
      })
      .catch(() => "");
  }

  attendanceVapidPublicKey = await attendanceVapidPublicKeyPromise;
  return attendanceVapidPublicKey;
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function showLeadBrowserNotification(lead: ClientLeadRecord, message: ClientLeadMessage) {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return;
  }

  if (Notification.permission !== "granted" || document.visibilityState === "visible") {
    return;
  }

  const notification = new Notification(`Nova resposta de ${lead.name}`, {
    body: message.text ? previewNotificationText(message.text, 120) : "O lead enviou uma nova mensagem.",
    icon: lead.avatarUrl ?? "/brand/connectyhub-app-icon-192.png",
    tag: `connectyhub-lead-${lead.id}`,
  });

  notification.onclick = () => {
    window.focus();
    window.location.href = "/dashboard/atendimento";
    notification.close();
  };
}

function previewNotificationText(value: string, maxLength: number) {
  const clean = redactInternalProviderNames(value).replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

function SocialApprovalQueue({
  approvals,
  onReviewed,
  onSelectLead,
}: {
  approvals: ClientSocialApproval[];
  onReviewed: (runId: string, action: "approve" | "reject") => void;
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

      onReviewed(item.id, action);
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

function SocialDispatchMonitorPanel({
  monitor,
  onRefresh,
  onSelectLead,
  refreshing,
}: {
  monitor: ClientSocialDispatchMonitor;
  onRefresh: () => Promise<void>;
  onSelectLead: (leadId: string) => void;
  refreshing: boolean;
}) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const visibleItems = monitor.items.slice(0, 8);

  async function retryDispatch(item: ClientSocialDispatch) {
    setRetryingId(item.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/social-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry_dispatch",
          runId: item.id,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Nao foi possivel reenfileirar este envio.");
      }

      setNotice({
        tone: "success",
        message: typeof payload.message === "string" ? payload.message : "Envio social reenfileirado.",
      });
      await onRefresh();
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao reenfileirar.",
      });
    } finally {
      setRetryingId(null);
    }
  }

  async function refresh() {
    setNotice(null);

    try {
      await onRefresh();
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel atualizar operacao Meta.",
      });
    }
  }

  return (
    <Panel
      eyebrow="Meta / Operacao"
      title="Envios sociais"
      tone={monitor.summary.failed ? "rose" : "cyan"}
      action={
        <div className="flex items-center gap-2">
          <NeonBadge tone={monitor.summary.failed ? "rose" : "cyan"}>
            {monitor.summary.failed ? `${monitor.summary.failed} falhas` : `${monitor.summary.sent} enviados`}
          </NeonBadge>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-xl border border-white/10 px-3 font-mono text-[9px] font-bold uppercase tracking-wide text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={refreshing}
            onClick={() => void refresh()}
            type="button"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Atualizar
          </button>
        </div>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <SocialDispatchMetric label="Na fila" value={monitor.summary.pending} tone="amber" />
          <SocialDispatchMetric label="Enviando" value={monitor.summary.sending} tone="cyan" />
          <SocialDispatchMetric label="Enviados" value={monitor.summary.sent} tone="green" />
          <SocialDispatchMetric label="Falhas" value={monitor.summary.failed} tone="rose" />
          <SocialDispatchMetric label="Bloqueados" value={monitor.summary.blocked} tone="amber" />
          <SocialDispatchMetric label="Retry" value={monitor.summary.retryable} tone="violet" />
        </div>

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

        {visibleItems.length ? (
          <div className="grid gap-2">
            {visibleItems.map((item) => {
              const isRetrying = retryingId === item.id;
              const lastAudit = item.audit[0] ?? null;

              return (
                <div key={item.id} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <MetaDispatchStatusPill label={item.dispatchStatusLabel} status={item.dispatchStatus} />
                      <NeonBadge tone={item.publicSurface ? "amber" : "cyan"}>{item.channelLabel}</NeonBadge>
                      <span className="rounded-lg border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-slate-500">
                        {item.companyName}
                      </span>
                      <span className="rounded-lg border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-slate-500">
                        {formatDateTime(item.sentAt ?? item.failedAt ?? item.startedAt ?? item.approvedAt ?? item.createdAt)}
                      </span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-white">{item.leadName}</p>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-400">{item.approvedReply}</p>
                      </div>
                      <div className="min-w-0 text-left sm:text-right">
                        <p className="truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">Agente</p>
                        <p className="truncate text-[12px] font-semibold text-slate-200">{item.agentName}</p>
                      </div>
                    </div>

                    {item.lastError ? (
                      <p className="line-clamp-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-[12px] leading-5 text-rose-100">
                        {item.lastError}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wide text-slate-500">
                        Tentativas {item.attempts}
                      </span>
                      <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wide text-slate-500">
                        Retry {item.retryCount}
                      </span>
                      {item.httpStatus ? (
                        <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wide text-slate-500">
                          HTTP {item.httpStatus}
                        </span>
                      ) : null}
                      {item.targetKind ? (
                        <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wide text-slate-500">
                          {formatDispatchTarget(item.targetKind)}
                        </span>
                      ) : null}
                      {lastAudit ? (
                        <span className="rounded-md border border-white/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wide text-slate-500">
                          {formatDispatchAuditType(lastAudit.type)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid content-start gap-2">
                    {item.leadId ? (
                      <button
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/15"
                        onClick={() => onSelectLead(item.leadId!)}
                        type="button"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Ver conversa
                      </button>
                    ) : null}
                    {item.retryable ? (
                      <button
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-violet-300/25 bg-violet-300/10 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-violet-100 transition hover:bg-violet-300/15 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isRetrying || refreshing}
                        onClick={() => void retryDispatch(item)}
                        type="button"
                      >
                        {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Reenfileirar
                      </button>
                    ) : (
                      <span className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        <Send className="h-3.5 w-3.5" />
                        Sem acao
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Sem envios Meta" detail="As respostas aprovadas para Instagram e Facebook aparecem aqui depois da primeira aprovacao." />
        )}
      </div>
    </Panel>
  );
}

function SocialDispatchMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "green" | "cyan" | "amber" | "rose" | "violet";
  value: number;
}) {
  const toneClassName = {
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-100",
    violet: "border-violet-400/20 bg-violet-400/10 text-violet-100",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-3 py-3", toneClassName)}>
      <p className="font-mono text-[9px] uppercase tracking-widest opacity-75">{label}</p>
      <p className="mt-1 font-mono text-[20px] font-bold leading-none">{value}</p>
    </div>
  );
}

function MetaDispatchStatusPill({
  label,
  status,
}: {
  label: string;
  status: ClientSocialDispatchStatus;
}) {
  return <NeonBadge tone={getDispatchStatusTone(status)}>{label}</NeonBadge>;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:p-4">
      <div className="connecty-lead-file-modal flex h-[100svh] max-h-[100svh] w-full max-w-[1280px] flex-col overflow-hidden border border-red-100 bg-white text-slate-950 shadow-2xl sm:h-auto sm:max-h-[92svh] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LeadAvatar lead={lead} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[16px] font-bold text-slate-950 sm:text-[18px]">Arquivo inteligente do lead</h2>
                <StatusPill status={lead.status} />
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-slate-500">
                <span className="font-semibold text-slate-950">{lead.name}</span>
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
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[370px_minmax(0,1fr)] lg:overflow-hidden">
          <aside className="min-h-0 border-b border-slate-200 bg-slate-50 p-3 sm:p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="space-y-3">
              <InfoPanel title="Resumo inteligente" text={lead.summary} />
              <QualificationGrid lead={lead} />
              <LeadTechnicalFile lead={lead} />
              <TrackingArchive events={lead.leadFile.trackingEvents} />
              <LeadFileSnapshot lead={lead} />
              <ActivityTimeline activities={lead.activities} />
            </div>
          </aside>
          <main className="min-h-0 bg-white p-3 sm:p-4 lg:overflow-hidden">
            <div className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:h-full lg:min-h-[640px]">
              <ConversationHeader lead={lead} conversation={selectedConversation} />
              <div
                className="min-h-0 flex-1 overflow-y-auto border-t border-slate-200 p-3 sm:p-5"
                style={{
                  backgroundColor: "#efeae2",
                  backgroundImage:
                    `linear-gradient(rgba(239,234,226,0.28), rgba(239,234,226,0.28)), url("${whatsappConversationBackgroundUrl}")`,
                  backgroundPosition: "center",
                  backgroundRepeat: "repeat",
                  backgroundSize: "420px auto",
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
      <p className="mt-3 text-[12px] leading-5 text-slate-200">{redactInternalProviderNames(text)}</p>
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
    formatPublicSource(conversation.provider || conversation.channel || "Historico geral"),
    conversation.status ? `status ${conversation.status}` : null,
    conversation.lastMessageAt ? formatDateTime(conversation.lastMessageAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatPublicSource(value: string | null | undefined) {
  const text = redactInternalProviderNames(value ?? "").trim();
  const normalized = text.toLowerCase().replace(/[\s_-]+/g, " ");

  if (!text) return "ConnectyHub";
  if (normalized.includes("whatsapp")) return "WhatsApp";
  if (normalized.includes("webhook")) return "WhatsApp";
  if (normalized.includes("api")) return "API WhatsApp";
  if (normalized.includes("meta") || normalized.includes("instagram") || normalized.includes("facebook")) return "Meta";
  if (normalized.includes("site") || normalized.includes("track") || normalized.includes("link")) return "Site / link";

  return text;
}

function redactInternalProviderNames(value: string) {
  return value
    .replace(/uazapi[_\-\s]*webhook/gi, "WhatsApp")
    .replace(/\buazapi\b/gi, "WhatsApp")
    .replace(/\bprovider\b/gi, "canal")
    .replace(/\bwebhook\b/gi, "WhatsApp");
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
              <p className="truncate text-[12px] font-semibold text-white">{redactInternalProviderNames(event.title)}</p>
              <span className="shrink-0 font-mono text-[9px] text-slate-500">{formatDateTime(event.occurredAt)}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">{redactInternalProviderNames(event.summary)}</p>
          </div>
        ))}
        {!events.length ? <p className="text-[12px] text-slate-500">Sem eventos de cookies, push, GPS, cliques ou navegacao ainda.</p> : null}
      </div>
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
      <p className="mt-1 truncate text-[12px] font-semibold text-white">{redactInternalProviderNames(value)}</p>
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
    { label: "Origem", value: formatPublicSource(lead.technical.origin), icon: Globe2 },
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
              <span className="max-w-[170px] truncate text-right text-[11px] font-semibold text-white">{redactInternalProviderNames(row.value)}</span>
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
                <p className="truncate text-[12px] font-semibold text-white">{redactInternalProviderNames(activity.title)}</p>
                <span className="shrink-0 font-mono text-[9px] text-slate-500">{formatDate(activity.occurredAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">{redactInternalProviderNames(activity.summary)}</p>
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
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (!messages.length) {
    return <EmptyState title="Sem mensagens salvas" detail="Quando o webhook receber ou enviar mensagens, o historico aparece aqui." />;
  }

  return (
    <div className="space-y-2">
      {messages.map((message) => {
        const isLead = message.author === "lead" || message.direction === "inbound";
        const isAi = message.author === "ai";
        const isHuman = message.author === "human";
        const isSystem = message.author === "system" || message.author === "unknown" || message.direction === "system" || message.direction === "unknown";
        const label = message.authorLabel || (isLead ? "Lead" : isHuman ? "Humano" : isAi ? "Agente IA" : "Sistema");
        const isOutbound = !isSystem && !isLead;
        const bubbleStyle = isSystem
          ? { backgroundColor: "#fff7d6", borderColor: "#f6dc8c", color: "#3b3320" }
          : isOutbound
            ? { backgroundColor: "#d9fdd3", borderColor: "#b7e9ad", color: "#111b21" }
            : { backgroundColor: "#ffffff", borderColor: "#e3ddd4", color: "#111b21" };

        return (
          <div key={message.id} className={cn("flex", isSystem ? "justify-center" : isOutbound ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[88%] rounded-2xl border px-3 py-2.5 text-[13px] leading-5 shadow-sm sm:max-w-[72%] sm:px-3.5",
                isSystem && "max-w-[82%] text-center",
              )}
              style={bubbleStyle}
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="font-mono text-[9px] uppercase tracking-wide opacity-60">
                  {label}
                </span>
                <span className="font-mono text-[9px] opacity-55">
                  {message.type !== "text" ? `${message.type} · ` : null}
                  {formatTime(message.occurredAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{redactInternalProviderNames(message.text)}</p>
              {message.mediaUrl ? (
                <a
                  className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white/70 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-white"
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
      <div ref={bottomRef} />
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
  if (mode === "atendimento") {
    return {
      eyebrow: "WhatsApp / Leads / CRM",
      title: "Central de Atendimento",
      description: "Acompanhe conversas ao vivo, assuma atendimentos e controle o CRM do lead em uma unica tela.",
    };
  }

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

function formatCurrencyCents(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(value / 100);
}

function parseCurrencyInputToCents(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : lastDot > lastComma ? "." : null;
  let normalized = cleaned;

  if (decimalSeparator) {
    const separatorIndex = decimalSeparator === "," ? lastComma : lastDot;
    const integerPart = cleaned.slice(0, separatorIndex).replace(/[^\d-]/g, "");
    const decimalPart = cleaned.slice(separatorIndex + 1).replace(/\D/g, "");
    normalized = decimalPart.length <= 2 && decimalPart.length > 0
      ? `${integerPart}.${decimalPart}`
      : cleaned.replace(/[^\d-]/g, "");
  } else {
    normalized = cleaned.replace(/[^\d-]/g, "");
  }

  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

function buildAttendanceCatalogProducts(items: ClientSalesCatalogItem[], companyId: string | null): AttendanceQuickProduct[] {
  if (!companyId) {
    return [];
  }

  return items
    .filter((item) => item.companyId === companyId && item.status === "active")
    .map((item) => ({
      category: item.category ?? "Catalogo",
      companyId: item.companyId,
      description: item.description.trim() || item.highlightLabel || item.tag || "Produto cadastrado no catalogo.",
      id: item.id,
      name: item.title,
      priceCents: getSalesCatalogItemPriceCents(item),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function getSalesCatalogItemPriceCents(item: ClientSalesCatalogItem) {
  const sku = item.skus.find((entry) => entry.status === "active") ?? item.skus[0] ?? null;
  const candidates = [
    item.offer.salePrice,
    item.price,
    sku?.salePrice,
    sku?.price,
  ];

  for (const candidate of candidates) {
    const cents = parseCurrencyInputToCents(candidate ?? "");

    if (cents > 0) {
      return cents;
    }
  }

  return 0;
}

function buildLeadCartSummary(lead: ClientLeadRecord, items: AttendanceCartItem[]) {
  const totalCents = items.reduce((total, item) => total + (item.unitPriceCents * item.quantity), 0);
  const lines = [
    `${lead.name}, deixei seu pedido montado aqui:`,
    "",
    ...items.map((item, index) => (
      `${index + 1}. ${item.quantity}x ${item.name} - ${formatCurrencyCents(item.unitPriceCents * item.quantity)}`
    )),
    "",
    `Total: ${formatCurrencyCents(totalCents)}`,
    "",
    "Posso seguir com esse pedido e gerar o pagamento para voce?",
  ];

  return lines.join("\n");
}

function buildLeadCheckoutMessage(lead: ClientLeadRecord, items: AttendanceCartItem[], checkoutUrl: string) {
  const totalCents = items.reduce((total, item) => total + (item.unitPriceCents * item.quantity), 0);
  const lines = [
    `${lead.name}, gerei o pagamento seguro do seu pedido:`,
    "",
    ...items.map((item, index) => (
      `${index + 1}. ${item.quantity}x ${item.name} - ${formatCurrencyCents(item.unitPriceCents * item.quantity)}`
    )),
    "",
    `Total: ${formatCurrencyCents(totalCents)}`,
    "",
    `Finalizar pagamento: ${checkoutUrl}`,
    "",
    "Assim que o pagamento for confirmado, seguimos com o pedido por aqui.",
  ];

  return lines.join("\n");
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

function getDispatchStatusTone(status: ClientSocialDispatchStatus): "green" | "cyan" | "amber" | "rose" | "zinc" {
  switch (status) {
    case "sent":
      return "green";
    case "sending":
      return "cyan";
    case "pending_adapter":
    case "blocked":
      return "amber";
    case "failed":
      return "rose";
    case "rejected":
    case "unknown":
      return "zinc";
  }
}

function formatDispatchTarget(value: string) {
  switch (value) {
    case "direct_message":
      return "direct";
    case "private_comment_reply":
      return "private reply";
    case "public_comment_reply":
      return "comentario";
    default:
      return value.replace(/_/g, " ");
  }
}

function formatDispatchAuditType(value: string) {
  switch (value) {
    case "dispatch_queued":
      return "fila criada";
    case "dispatch_started":
      return "envio iniciado";
    case "dispatch_sent":
      return "confirmado";
    case "dispatch_failed":
      return "falhou";
    case "dispatch_blocked":
      return "bloqueado";
    case "dispatch_enqueue_failed":
      return "fila falhou";
    case "manual_retry_requested":
      return "retry manual";
    default:
      return value.replace(/_/g, " ");
  }
}
