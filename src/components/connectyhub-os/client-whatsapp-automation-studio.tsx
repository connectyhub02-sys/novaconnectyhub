"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
  Clock3,
  FileAudio,
  Link as LinkIcon,
  Loader2,
  Megaphone,
  MessageCircle,
  RefreshCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Vote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NeonBadge, Panel } from "./panel-primitives";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

export type ClientAutomationAgent = {
  id: string;
  companyId: string;
  name: string;
  personaName: string;
  roleTitle: string;
  status: string;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

type WhatsappTarget = {
  id: string;
  type: "group" | "newsletter";
  jid: string;
  name: string;
  description: string | null;
  participantCount: number | null;
  isAdmin: boolean | null;
  isAnnouncement: boolean | null;
  enabled: boolean;
  campaignEnabled: boolean;
  replyMode: string;
  mentionMode: string;
  requireApproval: boolean;
  maxRepliesPerHour: number;
  muteUntil: string | null;
};

type WhatsappOperationsState = {
  instance: {
    id: string;
    status: string;
    displayName: string | null;
    phoneNumber: string | null;
  };
  behavior: {
    groups: boolean;
    groupReplyMode: string;
    statusBroadcasts: boolean;
    newsletterBroadcasts: boolean;
    campaignBroadcasts: boolean;
    interactiveMessages: boolean;
    maxStatusRecipients: number;
    campaignBatchSize: number;
    campaignDelayMinSeconds: number;
    campaignDelayMaxSeconds: number;
  };
  targets: WhatsappTarget[];
  history: Array<{
    id: string;
    operation: string;
    status: string;
    title: string;
    summary: string | null;
    scheduledFor: string | null;
    publishedAt: string | null;
    providerStatus: string | null;
    error: string | null;
  }>;
  analytics: {
    summary: {
      scheduled: number;
      published: number;
      failed: number;
      recurring: number;
      withMedia: number;
      withAudio: number;
      totalRecipients: number;
      trackedMessages: number;
      sentMessages: number;
      failedMessages: number;
      pendingMessages: number;
      carouselPosts: number;
      pollPosts: number;
      statusPosts: number;
    };
    topProducts: Array<{
      id: string;
      title: string;
      count: number;
    }>;
    segments: Array<{
      id: string;
      label: string;
      count: number;
      description: string;
    }>;
    optimization: {
      nextSuggestedFor: string;
      recommendedHour: number;
      confidence: "low" | "medium" | "high";
      reasons: string[];
    };
  };
};

type GrowthPlanItem = {
  id: string;
  day: number;
  slot: number;
  type: "text" | "audio" | "text_audio" | "carousel" | "status" | "poll";
  title: string;
  text: string;
  scheduledFor: string;
  targetIds: string[];
  productIds: string[];
  pollChoices: string[];
  buttonLabel: string | null;
};

type GrowthPlan = {
  title: string;
  objective: string;
  strategySummary: string;
  durationDays: number;
  postsPerDay: number;
  timezone: string;
  approvalChecklist: string[];
  targetCount: number;
  targetNames: string[];
  productNames: string[];
  items: GrowthPlanItem[];
  modelId: string;
};

type ChannelActionResponse = {
  operations?: WhatsappOperationsState | null;
  result?: {
    draft?: {
      title?: string;
      text?: string;
      backgroundColor?: number;
      approvalChecklist?: string[];
      mediaUrl?: string | null;
      mediaKind?: "image" | "video" | null;
    };
    growthPlan?: GrowthPlan;
    probe?: {
      available: boolean;
      confidence: "low" | "medium";
      message: string;
      testedEndpoints: string[];
      errors: string[];
    };
  };
  notice?: Notice;
  error?: string;
};

type Props = {
  companyId: string;
  companyName: string;
  agents: ClientAutomationAgent[];
  products: ClientSalesCatalogItem[];
  selectedAutomationAgentId: string | null;
  selectedAutomationWhatsappLabel: string | null;
};

export function ClientWhatsappAutomationStudio({
  agents,
  companyId,
  companyName,
  products,
  selectedAutomationAgentId,
  selectedAutomationWhatsappLabel,
}: Props) {
  const companyAgents = useMemo(() => agents.filter((agent) => agent.companyId === companyId), [agents, companyId]);
  const selectedAutomationAgent = companyAgents.find((agent) => agent.id === selectedAutomationAgentId) ?? null;
  const selectedAgentId = selectedAutomationAgent?.id ?? "";
  const [operations, setOperations] = useState<WhatsappOperationsState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [selectedCampaignProductIds, setSelectedCampaignProductIds] = useState<string[]>([]);
  const [campaignBrief, setCampaignBrief] = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignText, setCampaignText] = useState("");
  const [campaignChecklist, setCampaignChecklist] = useState<string[]>([]);
  const [campaignScheduledFor, setCampaignScheduledFor] = useState(() => buildLocalDateTime(45));
  const [campaignFormat, setCampaignFormat] = useState<"single" | "carousel">("single");
  const [campaignDeliveryMode, setCampaignDeliveryMode] = useState<"text" | "audio" | "text_audio">("text");
  const [campaignMediaKind, setCampaignMediaKind] = useState<"image" | "video" | "document">("image");
  const [campaignMediaUrl, setCampaignMediaUrl] = useState("");
  const [campaignMediaCaption, setCampaignMediaCaption] = useState("");
  const [campaignMentionAll, setCampaignMentionAll] = useState(false);
  const [campaignRecurrence, setCampaignRecurrence] = useState<"none" | "daily" | "weekly">("daily");
  const [campaignOccurrences, setCampaignOccurrences] = useState(7);
  const [campaignButtonEnabled, setCampaignButtonEnabled] = useState(true);
  const [campaignButtonLabel, setCampaignButtonLabel] = useState("Comprar agora");
  const [campaignButtonUrl, setCampaignButtonUrl] = useState("");
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);

  const [growthObjective, setGrowthObjective] = useState("Vender os produtos selecionados com presenca diaria no WhatsApp");
  const [growthDurationDays, setGrowthDurationDays] = useState(7);
  const [growthPostsPerDay, setGrowthPostsPerDay] = useState(3);
  const [growthStartFrom, setGrowthStartFrom] = useState(() => buildLocalDateTime(90));
  const [growthPlan, setGrowthPlan] = useState<GrowthPlan | null>(null);

  const [selectedStatusProductIds, setSelectedStatusProductIds] = useState<string[]>([]);
  const [statusBrief, setStatusBrief] = useState("");
  const [statusText, setStatusText] = useState("");
  const [statusBackgroundColor, setStatusBackgroundColor] = useState(4);
  const [statusType, setStatusType] = useState<"text" | "image" | "video" | "audio">("text");
  const [statusMediaUrl, setStatusMediaUrl] = useState("");
  const [statusMediaCaption, setStatusMediaCaption] = useState("");
  const [statusMaxRecipients, setStatusMaxRecipients] = useState(180);

  const [pollQuestion, setPollQuestion] = useState("Qual produto voces querem ver em oferta primeiro?");
  const [pollChoices, setPollChoices] = useState("Produto 1\nProduto 2\nQuero indicacao");
  const [pollScheduledFor, setPollScheduledFor] = useState(() => buildLocalDateTime(60));
  const [pollSelectableCount, setPollSelectableCount] = useState(1);

  const [groupWindowTargetId, setGroupWindowTargetId] = useState("");
  const [openScheduledFor, setOpenScheduledFor] = useState(() => buildLocalDateTime(30));
  const [closeScheduledFor, setCloseScheduledFor] = useState(() => buildLocalDateTime(120));
  const [preCloseMinutes, setPreCloseMinutes] = useState(5);
  const [openingText, setOpeningText] = useState("Oi pessoal, abri o grupo por um tempo para duvidas e troca de ideias. Podem mandar as perguntas por aqui que eu vou respondendo.");
  const [preCloseText, setPreCloseText] = useState("Vou deixar o grupo aberto mais alguns minutos. Quem tiver duvida, manda agora que eu tento responder todo mundo.");
  const [closingText, setClosingText] = useState("Fechando o grupo agora, pessoal. Quem quiser continuar, pode chamar no privado.");
  const [leadStatusProbe, setLeadStatusProbe] = useState<string | null>(null);

  const behavior = operations?.behavior;
  const connected = operations?.instance.status === "connected";
  const targets = operations?.targets ?? [];
  const groups = targets.filter((target) => target.type === "group");
  const newsletters = targets.filter((target) => target.type === "newsletter");
  const effectiveGroupWindowTargetId = groupWindowTargetId || groups[0]?.id || "";
  const selectedTargets = targets.filter((target) => selectedTargetIds.includes(target.id));
  const selectedTargetIdsValid = selectedTargets.map((target) => target.id);
  const selectedPollTargetIds = selectedTargets.filter((target) => target.type === "group").map((target) => target.id);
  const selectedCampaignProducts = products.filter((product) => selectedCampaignProductIds.includes(product.id));
  const automaticCampaignProductIds = selectedCampaignProductIds.length > 0
    ? selectedCampaignProductIds
    : products.slice(0, 6).map((product) => product.id);
  const automaticCampaignProducts = products.filter((product) => automaticCampaignProductIds.includes(product.id));
  const selectedStatusProducts = products.filter((product) => selectedStatusProductIds.includes(product.id));
  const selectedCampaignMediaCount = automaticCampaignProducts.reduce((total, product) => total + product.media.length, 0);
  const campaignProductUrl = firstProductUrl(selectedCampaignProducts);
  const statusProductMediaReady = statusType !== "text"
    && selectedStatusProducts.some((product) => product.media.some((media) => media.kind === statusType));
  const statusHasMediaSource = statusMediaUrl.trim().length > 0 || statusProductMediaReady;
  const operationsLocked = !selectedAgentId || !connected;
  const campaignReady = !operationsLocked
    && selectedTargetIdsValid.length > 0
    && (campaignFormat === "carousel" ? selectedCampaignProducts.length > 0 : campaignText.trim().length > 0)
    && Boolean(behavior?.campaignBroadcasts || behavior?.newsletterBroadcasts);
  const growthPlanReady = !operationsLocked
    && Boolean(behavior?.campaignBroadcasts || behavior?.newsletterBroadcasts || behavior?.statusBroadcasts)
    && (selectedTargets.length > 0 || Boolean(behavior?.statusBroadcasts))
    && (automaticCampaignProducts.length > 0 || campaignBrief.trim().length > 0 || growthObjective.trim().length > 0);
  const scheduleGrowthPlanReady = !operationsLocked && Boolean(growthPlan?.items.length);
  const statusReady = !operationsLocked
    && Boolean(behavior?.statusBroadcasts)
    && (statusText.trim().length > 0 || statusHasMediaSource);
  const groupWindowReady = !operationsLocked
    && Boolean(behavior?.groups)
    && Boolean(effectiveGroupWindowTargetId)
    && Boolean(openScheduledFor)
    && Boolean(closeScheduledFor);
  const groupWindowBlockReason = getGroupWindowBlockReason({
    selectedAgentId,
    connected,
    groupsEnabled: Boolean(behavior?.groups),
    targetId: effectiveGroupWindowTargetId,
    openScheduledFor,
    closeScheduledFor,
  });
  const pollReady = !operationsLocked
    && Boolean(behavior?.campaignBroadcasts)
    && Boolean(behavior?.interactiveMessages)
    && selectedPollTargetIds.length > 0
    && pollQuestion.trim().length > 0
    && parseLines(pollChoices).length >= 2;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!companyId || !selectedAgentId) {
        setOperations(null);
        setSelectedTargetIds([]);
        return;
      }
      setRunningAction("load_channels");
      setNotice(null);

      try {
        const params = new URLSearchParams({ companyId, agentId: selectedAgentId });
        const response = await fetch(`/api/dashboard/whatsapp/channels?${params.toString()}`, { cache: "no-store" });
        const data = await response.json().catch(() => null) as ChannelActionResponse | null;

        if (cancelled) return;
        if (!response.ok || !data?.operations) {
          throw new Error(data?.error ?? "Nao foi possivel carregar automacoes WhatsApp.");
        }

        setOperations(data.operations);
        setStatusMaxRecipients(data.operations.behavior.maxStatusRecipients || 180);
      } catch (error) {
        if (!cancelled) {
          setOperations(null);
          setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao carregar WhatsApp." });
        }
      } finally {
        if (!cancelled) setRunningAction(null);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [companyId, selectedAgentId]);

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    if (!companyId || !selectedAgentId) return null;
    setRunningAction(action);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/whatsapp/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          agentId: selectedAgentId,
          action,
          ...payload,
        }),
      });
      const data = await response.json().catch(() => null) as ChannelActionResponse | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel executar a automacao WhatsApp.");
      }

      if (data?.operations) setOperations(data.operations);
      setNotice(data?.notice ?? { tone: "success", message: "Operacao concluida." });
      return data;
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro na automacao WhatsApp." });
      return null;
    } finally {
      setRunningAction(null);
    }
  }

  async function refreshChannels() {
    if (!companyId || !selectedAgentId) return;
    setRunningAction("load_channels");
    setNotice(null);

    try {
      const params = new URLSearchParams({ companyId, agentId: selectedAgentId });
      const response = await fetch(`/api/dashboard/whatsapp/channels?${params.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as ChannelActionResponse | null;

      if (!response.ok || !data?.operations) {
        throw new Error(data?.error ?? "Nao foi possivel atualizar o painel.");
      }

      setOperations(data.operations);
      setNotice({ tone: "success", message: "Painel WhatsApp atualizado." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao atualizar painel." });
    } finally {
      setRunningAction(null);
    }
  }

  function toggleTarget(targetId: string) {
    setSelectedTargetIds((current) => current.includes(targetId)
      ? current.filter((id) => id !== targetId)
      : [...current, targetId]);
  }

  function toggleProduct(targetId: string, mode: "campaign" | "status") {
    const setter = mode === "campaign" ? setSelectedCampaignProductIds : setSelectedStatusProductIds;
    setter((current) => current.includes(targetId)
      ? current.filter((id) => id !== targetId)
      : [...current, targetId].slice(-6));
  }

  async function generateCampaignDraft() {
    const data = await runAction("generate_target_campaign_draft", {
      targetIds: selectedTargetIdsValid,
      catalogItemIds: selectedCampaignProductIds,
      brief: campaignBrief,
      currentTitle: campaignTitle,
      currentText: campaignText,
      mentionAll: campaignMentionAll,
      recurrenceFrequency: campaignRecurrence === "none" ? null : campaignRecurrence,
      recurrenceOccurrences: campaignRecurrence === "none" ? null : campaignOccurrences,
    });
    const draft = data?.result?.draft;

    if (draft?.title) setCampaignTitle(draft.title);
    if (draft?.text) setCampaignText(draft.text);
    if (draft?.approvalChecklist) setCampaignChecklist(draft.approvalChecklist);
  }

  async function scheduleCampaign() {
    await runAction(campaignFormat === "carousel" ? "send_target_carousel" : "send_target_campaign", {
      title: campaignTitle,
      text: campaignText,
      targetIds: selectedTargetIdsValid,
      scheduledFor: localDatetimeToIso(campaignScheduledFor),
      mentionAll: campaignMentionAll,
      recurrenceFrequency: campaignRecurrence === "none" ? null : campaignRecurrence,
      recurrenceOccurrences: campaignRecurrence === "none" ? null : campaignOccurrences,
      deliveryMode: campaignDeliveryMode,
      mediaUrl: campaignMediaUrl,
      mediaKind: campaignMediaKind,
      mediaCaption: campaignMediaCaption,
      catalogItemIds: selectedCampaignProductIds,
      interactiveMode: campaignButtonEnabled ? "button" : "none",
      buttonLabel: campaignButtonLabel,
      buttonUrl: campaignButtonUrl || campaignProductUrl,
    });
  }

  async function generateGrowthPlan() {
    const data = await runAction("generate_growth_plan", {
      targetIds: selectedTargetIdsValid,
      catalogItemIds: automaticCampaignProductIds,
      objective: growthObjective,
      brief: campaignBrief,
      durationDays: growthDurationDays,
      postsPerDay: growthPostsPerDay,
      startFrom: localDatetimeToIso(growthStartFrom),
      mentionAll: campaignMentionAll,
    });
    const plan = data?.result?.growthPlan;

    if (plan) {
      setGrowthPlan(plan);
      if (!campaignTitle) setCampaignTitle(plan.title);
      if (!campaignText && plan.items[0]?.text) setCampaignText(plan.items[0].text);
    }
  }

  async function scheduleGrowthPlan() {
    if (!growthPlan) return;

    await runAction("schedule_growth_plan", {
      targetIds: selectedTargetIdsValid,
      catalogItemIds: automaticCampaignProductIds,
      mentionAll: campaignMentionAll,
      buttonLabel: campaignButtonLabel,
      planItems: growthPlan.items,
    });
  }

  async function generateStatusDraft() {
    const data = await runAction("generate_status_draft", {
      brief: statusBrief,
      currentText: statusText,
      catalogItemIds: selectedStatusProductIds,
    });
    const draft = data?.result?.draft;

    if (draft?.text) setStatusText(draft.text);
    if (typeof draft?.backgroundColor === "number") setStatusBackgroundColor(draft.backgroundColor);
    if (draft?.mediaUrl) setStatusMediaUrl(draft.mediaUrl);
    if (draft?.mediaKind) setStatusType(draft.mediaKind);
  }

  async function publishStatus() {
    await runAction("send_status", {
      text: statusText,
      statusType,
      mediaUrl: statusMediaUrl,
      mediaCaption: statusMediaCaption,
      backgroundColor: statusBackgroundColor,
      maxRecipients: statusMaxRecipients,
      catalogItemIds: selectedStatusProductIds,
    });
  }

  async function schedulePoll() {
    await runAction("send_target_poll", {
      pollTitle: `Enquete - ${companyName}`,
      pollQuestion,
      pollChoices: parseLines(pollChoices),
      pollSelectableCount,
      targetIds: selectedPollTargetIds,
      scheduledFor: localDatetimeToIso(pollScheduledFor),
      mentionAll: campaignMentionAll,
    });
  }

  async function scheduleGroupWindow() {
    await runAction("schedule_group_window", {
      groupTargetId: effectiveGroupWindowTargetId,
      openScheduledFor: localDatetimeToIso(openScheduledFor),
      closeScheduledFor: localDatetimeToIso(closeScheduledFor),
      openingText,
      preCloseText,
      closingText,
      preCloseMinutes,
      mentionAll: campaignMentionAll,
    });
  }

  async function toggleTargetSetting(target: WhatsappTarget, key: "enabled" | "campaignEnabled") {
    await runAction("update_target_settings", {
      targetId: target.id,
      [key]: !target[key],
    });
  }

  async function probeLeadStatusWatch() {
    const data = await runAction("probe_lead_status_watch");
    const probe = data?.result?.probe;
    if (probe) {
      setLeadStatusProbe(`${probe.message} Endpoints: ${probe.testedEndpoints.join(", ")}.`);
    }
  }

  return (
    <Panel
      title="WhatsApp: grupos, canais e status"
      eyebrow="automacoes / trafego relacional"
      tone="green"
      action={<NeonBadge tone={connected ? "green" : "amber"}>{connected ? "WhatsApp online" : "pendente"}</NeonBadge>}
    >
      <div className="grid gap-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-xl border border-slate-200 bg-white/60 p-3">
            <FieldLabel>Agente em uso</FieldLabel>
            <p className="truncate text-sm font-semibold" style={{ color: "var(--ch-text)" }}>
              {selectedAutomationAgent ? `${selectedAutomationAgent.name} / ${selectedAutomationAgent.roleTitle}` : "Escolha o WhatsApp padrao acima"}
            </p>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {selectedAutomationWhatsappLabel ?? "O bloco de grupos herda o agente e o numero definidos em Base das automacoes."}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Metric icon={Users} label="Destinos" value={`${groups.length}/${newsletters.length}`} detail="grupos / canais" />
            <Metric icon={CalendarClock} label="Agenda" value={String(operations?.analytics.summary.scheduled ?? 0)} detail="envios futuros" />
            <Metric icon={FileAudio} label="Midia" value={String((operations?.analytics.summary.withMedia ?? 0) + (operations?.analytics.summary.withAudio ?? 0))} detail="historico com midia" />
          </div>
        </div>

        {notice ? (
          <div className={cn(
            "rounded-xl border px-3 py-2 text-sm",
            notice.tone === "success"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
              : "border-rose-500/25 bg-rose-500/10 text-rose-700",
          )}>
            {notice.message}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ActionButton icon={RefreshCcw} label="Atualizar" loading={runningAction === "load_channels"} onClick={refreshChannels} />
          <ActionButton icon={Users} label="Buscar grupos" disabled={!selectedAgentId} loading={runningAction === "refresh_groups"} onClick={() => runAction("refresh_groups")} />
          <ActionButton icon={Megaphone} label="Buscar canais" disabled={!selectedAgentId} loading={runningAction === "refresh_newsletters"} onClick={() => runAction("refresh_newsletters")} />
          <ActionButton icon={ShieldCheck} label="Analisar grupos" disabled={operationsLocked || groups.length === 0} loading={runningAction === "sync_group_intelligence"} onClick={() => runAction("sync_group_intelligence")} />
        </div>

        <FeatureGates behavior={behavior} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="grid gap-4">
            <Section title="Destinos" badge={`${selectedTargets.length} selecionado(s)`}>
              <div className="grid gap-2">
                {targets.length ? targets.map((target) => (
                  <div
                    key={target.id}
                    className={cn(
                      "grid gap-3 rounded-xl border p-3",
                      selectedTargetIds.includes(target.id) ? "border-emerald-500/35 bg-emerald-500/10" : "border-slate-200 bg-white/60",
                    )}
                  >
                    <button type="button" onClick={() => toggleTarget(target.id)} className="flex min-w-0 items-start gap-3 text-left">
                      <span className={cn(
                        "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                        selectedTargetIds.includes(target.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent",
                      )}>
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold" style={{ color: "var(--ch-text)" }}>{target.name}</span>
                          <NeonBadge tone={target.type === "group" ? "green" : "cyan"}>{target.type === "group" ? "grupo" : "canal"}</NeonBadge>
                          {target.isAdmin ? <NeonBadge tone="amber">admin</NeonBadge> : null}
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-slate-500">{target.jid}</span>
                      </span>
                    </button>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <MiniToggle checked={target.enabled} label="Atendimento no grupo" onClick={() => toggleTargetSetting(target, "enabled")} loading={runningAction === "update_target_settings"} />
                      <MiniToggle checked={target.campaignEnabled} label="Campanhas liberadas" onClick={() => toggleTargetSetting(target, "campaignEnabled")} loading={runningAction === "update_target_settings"} />
                    </div>
                  </div>
                )) : (
                  <EmptyState icon={Users} text="Sincronize grupos e canais para montar campanhas." />
                )}
              </div>
            </Section>

            <Section title="Janela de grupo" badge="abrir / avisar / fechar">
              <div className="grid gap-3">
                <label>
                  <FieldLabel>Grupo</FieldLabel>
                  <select value={effectiveGroupWindowTargetId} onChange={(event) => setGroupWindowTargetId(event.target.value)} className="h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none" style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}>
                    <option value="">Escolher grupo</option>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <DateInput label="Abrir" value={openScheduledFor} onChange={setOpenScheduledFor} />
                  <DateInput label="Fechar" value={closeScheduledFor} onChange={setCloseScheduledFor} />
                  <NumberInput label="Avisar antes" value={preCloseMinutes} min={1} max={120} onChange={setPreCloseMinutes} suffix="min" />
                </div>
                <Textarea label="Mensagem de abertura" value={openingText} onChange={setOpeningText} rows={3} />
                <Textarea label="Aviso antes de fechar" value={preCloseText} onChange={setPreCloseText} rows={3} />
                <Textarea label="Mensagem de fechamento" value={closingText} onChange={setClosingText} rows={3} />
                <div className="grid gap-2">
                  <ActionButton icon={Clock3} label="Agendar janela" disabled={!groupWindowReady} loading={runningAction === "schedule_group_window"} onClick={scheduleGroupWindow} />
                  {groupWindowBlockReason ? (
                    <p className="text-[11px] leading-5 text-amber-700">{groupWindowBlockReason}</p>
                  ) : null}
                </div>
              </div>
            </Section>
          </div>

          <div className="grid gap-4">
            <Section title="Campanha automatica" badge="IA faz a copy">
              <div className="grid gap-3">
                <ProductPicker products={products} selectedIds={selectedCampaignProductIds} onToggle={(id) => toggleProduct(id, "campaign")} />
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[12px] leading-5 text-emerald-700">
                  {selectedCampaignProductIds.length > 0
                    ? `${selectedCampaignProductIds.length} produto(s) selecionado(s). A IA usa automaticamente as midias cadastradas no produto.`
                    : `Nenhum produto selecionado. A IA pode testar ate ${automaticCampaignProducts.length} produto(s) ativo(s) do catalogo.`}
                  {selectedCampaignMediaCount > 0 ? ` Midias encontradas: ${selectedCampaignMediaCount}.` : " Cadastre midias nos produtos para usar carrossel e anexos."}
                </div>
                <Input label="Nome interno (opcional)" value={campaignTitle} onChange={setCampaignTitle} placeholder="Ex.: Campanha da semana" />
                <SelectField label="Objetivo da IA" value={growthObjective} onChange={setGrowthObjective} options={[
                  ["Vender os produtos selecionados com presenca diaria no WhatsApp", "Vender produtos"],
                  ["Descobrir quais produtos geram mais interesse no grupo", "Testar interesse"],
                  ["Criar conversa no grupo com enquetes e ofertas leves", "Engajar grupo"],
                  ["Publicar uma vitrine com carrossel e botao de compra", "Vitrine/carrossel"],
                ]} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <DateInput label="Inicio" value={growthStartFrom} onChange={setGrowthStartFrom} />
                  <NumberInput label="Dias" value={growthDurationDays} min={1} max={14} onChange={setGrowthDurationDays} />
                  <NumberInput label="Posts/dia" value={growthPostsPerDay} min={1} max={5} onChange={setGrowthPostsPerDay} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ActionButton icon={Sparkles} label="Planejar rotina" disabled={!growthPlanReady} loading={runningAction === "generate_growth_plan"} onClick={generateGrowthPlan} />
                  <ActionButton icon={CalendarClock} label="Agendar rotina" disabled={!scheduleGrowthPlanReady} loading={runningAction === "schedule_growth_plan"} onClick={scheduleGrowthPlan} />
                </div>
                {growthPlan ? (
                  <div className="grid gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-cyan-800">{growthPlan.title}</p>
                      <p className="mt-1 text-[12px] leading-5 text-cyan-700">{growthPlan.strategySummary}</p>
                    </div>
                    {growthPlan.approvalChecklist.length ? (
                      <div className="grid gap-1 text-[11px] leading-5 text-cyan-800">
                        {growthPlan.approvalChecklist.map((item) => <p key={item}>- {item}</p>)}
                      </div>
                    ) : null}
                    <div className="max-h-80 overflow-y-auto rounded-lg border border-cyan-500/20 bg-white/70 p-2">
                      {growthPlan.items.map((item) => (
                        <div key={item.id} className="mb-2 grid gap-2 rounded-lg border border-slate-200 bg-white p-2 last:mb-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{item.title}</span>
                            <span className="font-mono text-[10px] text-slate-500">D{item.day} / {formatGrowthPlanType(item.type)} / {formatDateTime(item.scheduledFor)}</span>
                          </div>
                          <p className="line-clamp-3 text-[12px] leading-5 text-slate-600">{item.text}</p>
                          {item.pollChoices.length && item.type === "poll" ? (
                            <p className="truncate text-[10px] text-cyan-700">{item.pollChoices.join(" / ")}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Section>

            <Section title="Ajustes avancados" badge={advancedToolsOpen ? "aberto" : "opcional"}>
              <div className="grid gap-3">
                <ActionButton icon={Settings2} label={advancedToolsOpen ? "Ocultar ajustes" : "Mostrar ajustes"} onClick={() => setAdvancedToolsOpen((current) => !current)} />
                {advancedToolsOpen ? (
                  <div className="grid gap-4">
                    <SubSection title="Post unico manual">
                      <div className="grid gap-3">
                        <Textarea label="Direcao extra para IA" value={campaignBrief} onChange={setCampaignBrief} rows={2} placeholder="Opcional: tom, oferta, cuidado ou tema." />
                        <Textarea label="Mensagem manual" value={campaignText} onChange={setCampaignText} rows={5} placeholder="Opcional. Se ficar vazio, use Planejar rotina." />
                        {campaignChecklist.length ? (
                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[12px] text-emerald-700">
                            {campaignChecklist.map((item) => <p key={item}>- {item}</p>)}
                          </div>
                        ) : null}
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <SelectField label="Formato" value={campaignFormat} onChange={(value) => setCampaignFormat(value as typeof campaignFormat)} options={[
                            ["single", "Post unico"],
                            ["carousel", "Carrossel"],
                          ]} />
                          <SelectField label="Entrega" value={campaignDeliveryMode} onChange={(value) => setCampaignDeliveryMode(value as typeof campaignDeliveryMode)} options={[
                            ["text", "Texto"],
                            ["audio", "Audio"],
                            ["text_audio", "Texto + audio"],
                          ]} />
                          <DateInput label="Quando" value={campaignScheduledFor} onChange={setCampaignScheduledFor} />
                          <NumberInput label="Repeticoes" value={campaignOccurrences} min={2} max={365} onChange={setCampaignOccurrences} />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <SelectField label="Recorrencia" value={campaignRecurrence} onChange={(value) => setCampaignRecurrence(value as typeof campaignRecurrence)} options={[
                            ["none", "Unico"],
                            ["daily", "Diario"],
                            ["weekly", "Semanal"],
                          ]} />
                          <SelectField label="Midia externa" value={campaignMediaKind} onChange={(value) => setCampaignMediaKind(value as typeof campaignMediaKind)} options={[
                            ["image", "Imagem"],
                            ["video", "Video"],
                            ["document", "Documento"],
                          ]} />
                        </div>
                        <Input label="URL de midia externa (opcional)" value={campaignMediaUrl} onChange={setCampaignMediaUrl} placeholder="https://..." />
                        <Input label="Legenda da midia externa" value={campaignMediaCaption} onChange={setCampaignMediaCaption} />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <MiniToggle checked={campaignButtonEnabled} label="Enviar botao de compra" onClick={() => setCampaignButtonEnabled((current) => !current)} />
                          <MiniToggle checked={campaignMentionAll} label="Mencionar todos nos grupos" onClick={() => setCampaignMentionAll((current) => !current)} />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input label="Texto do botao" value={campaignButtonLabel} onChange={setCampaignButtonLabel} />
                          <Input label="URL do botao externo" value={campaignButtonUrl} onChange={setCampaignButtonUrl} icon={LinkIcon} />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <ActionButton icon={Sparkles} label="Criar post IA" disabled={operationsLocked || selectedTargets.length === 0 || (!campaignBrief.trim() && automaticCampaignProducts.length === 0 && !campaignText.trim())} loading={runningAction === "generate_target_campaign_draft"} onClick={generateCampaignDraft} />
                          <ActionButton icon={Send} label={campaignFormat === "carousel" ? "Agendar carrossel" : "Agendar post"} disabled={!campaignReady} loading={runningAction === "send_target_campaign" || runningAction === "send_target_carousel"} onClick={scheduleCampaign} />
                        </div>
                      </div>
                    </SubSection>

                    <SubSection title="Status do agente">
                      <div className="grid gap-3">
                        <ProductPicker products={products} selectedIds={selectedStatusProductIds} onToggle={(id) => toggleProduct(id, "status")} />
                        <Textarea label="Ideia opcional" value={statusBrief} onChange={setStatusBrief} rows={2} placeholder="Opcional: oferta do dia, pergunta ou chamada." />
                        <Textarea label="Texto do status" value={statusText} onChange={setStatusText} rows={4} />
                        <div className="grid gap-2 sm:grid-cols-3">
                          <SelectField label="Tipo" value={statusType} onChange={(value) => setStatusType(value as typeof statusType)} options={[
                            ["text", "Texto"],
                            ["image", "Imagem"],
                            ["video", "Video"],
                            ["audio", "Audio"],
                          ]} />
                          <NumberInput label="Fundo" value={statusBackgroundColor} min={1} max={19} onChange={setStatusBackgroundColor} />
                          <NumberInput label="Alcance max." value={statusMaxRecipients} min={1} max={5000} onChange={setStatusMaxRecipients} />
                        </div>
                        <Input label="Midia externa do status (opcional)" value={statusMediaUrl} onChange={setStatusMediaUrl} placeholder="https://..." />
                        <Input label="Legenda da midia externa" value={statusMediaCaption} onChange={setStatusMediaCaption} />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <ActionButton icon={Sparkles} label="Criar status IA" disabled={operationsLocked || (!statusBrief.trim() && selectedStatusProductIds.length === 0 && !statusText.trim())} loading={runningAction === "generate_status_draft"} onClick={generateStatusDraft} />
                          <ActionButton icon={Megaphone} label="Publicar status" disabled={!statusReady} loading={runningAction === "send_status"} onClick={publishStatus} />
                        </div>
                      </div>
                    </SubSection>

                    <SubSection title="Enquete manual">
                      <div className="grid gap-3">
                        <Textarea label="Pergunta" value={pollQuestion} onChange={setPollQuestion} rows={2} />
                        <Textarea label="Opcoes" value={pollChoices} onChange={setPollChoices} rows={4} />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <DateInput label="Quando" value={pollScheduledFor} onChange={setPollScheduledFor} />
                          <NumberInput label="Selecionaveis" value={pollSelectableCount} min={1} max={12} onChange={setPollSelectableCount} />
                        </div>
                        <ActionButton icon={Vote} label="Agendar enquete" disabled={!pollReady} loading={runningAction === "send_target_poll"} onClick={schedulePoll} />
                      </div>
                    </SubSection>

                    <SubSection title="Status dos leads">
                      <div className="grid gap-3">
                        <p className="text-[12px] leading-5 text-slate-500">
                          Piloto experimental via status@broadcast. Use apenas em numero real de teste antes de liberar para clientes.
                        </p>
                        {leadStatusProbe ? <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-[12px] leading-5 text-amber-700">{leadStatusProbe}</p> : null}
                        <ActionButton icon={MessageCircle} label="Testar disponibilidade" disabled={operationsLocked} loading={runningAction === "probe_lead_status_watch"} onClick={probeLeadStatusWatch} />
                      </div>
                    </SubSection>
                  </div>
                ) : null}
              </div>
            </Section>
          </div>
        </div>

        <Section title="Inteligencia" badge={operations?.analytics.optimization.confidence ?? "low"}>
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={Megaphone} label="Carrossel" value={String(operations?.analytics.summary.carouselPosts ?? 0)} detail="vitrines enviadas" />
              <Metric icon={Vote} label="Enquetes" value={String(operations?.analytics.summary.pollPosts ?? 0)} detail="posts de voto" />
              <Metric icon={MessageCircle} label="Status" value={String(operations?.analytics.summary.statusPosts ?? 0)} detail="stories publicados" />
              <Metric icon={Send} label="Rastreamento" value={String(operations?.analytics.summary.trackedMessages ?? 0)} detail="mensagens monitoradas" />
            </div>
            {operations?.analytics.optimization.reasons.length ? (
              <div className="rounded-xl border border-slate-200 bg-white/60 p-3 text-[12px] leading-5 text-slate-600">
                {operations.analytics.optimization.reasons.map((reason) => <p key={reason}>- {reason}</p>)}
              </div>
            ) : null}
            <div className="grid gap-3 lg:grid-cols-2">
              <MiniList
                emptyText="Produtos ainda sem historico de campanha."
                items={(operations?.analytics.topProducts ?? []).map((item) => ({
                  id: item.id,
                  title: item.title,
                  detail: `${item.count} uso(s) recente(s)`,
                }))}
                title="Produtos mais usados"
              />
              <MiniList
                emptyText="Segmentos aparecem conforme campanhas e respostas forem registradas."
                items={(operations?.analytics.segments ?? []).map((item) => ({
                  id: item.id,
                  title: item.label,
                  detail: `${item.count} sinal(is) - ${item.description}`,
                }))}
                title="Segmentos sugeridos"
              />
            </div>
          </div>
        </Section>

        <Section title="Historico recente" badge={`${operations?.history.length ?? 0} registros`}>
          <div className="grid gap-2">
            {operations?.history.length ? operations.history.map((item) => (
              <div key={item.id} className="grid gap-1 rounded-xl border border-slate-200 bg-white/60 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--ch-text)" }}>{item.title}</p>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{item.summary ?? item.operation}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <NeonBadge tone={item.status === "published" ? "green" : item.status === "review" ? "rose" : "amber"}>{item.status}</NeonBadge>
                  <span className="font-mono text-[10px] text-slate-500">{formatDateTime(item.scheduledFor ?? item.publishedAt)}</span>
                </div>
              </div>
            )) : (
              <EmptyState icon={CalendarClock} text="Nenhum envio de grupos, canais ou status registrado ainda." />
            )}
          </div>
        </Section>
      </div>
    </Panel>
  );
}

function FeatureGates({ behavior }: { behavior?: WhatsappOperationsState["behavior"] }) {
  const gates = [
    ["Responder grupos", behavior?.groups],
    ["Status", behavior?.statusBroadcasts],
    ["Campanhas", behavior?.campaignBroadcasts],
    ["Canais", behavior?.newsletterBroadcasts],
    ["Botoes/enquetes", behavior?.interactiveMessages],
  ] as const;

  return (
    <div className="grid gap-2 sm:grid-cols-5">
      {gates.map(([label, active]) => (
        <div key={label} className={cn(
          "rounded-xl border px-3 py-2",
          active ? "border-emerald-500/25 bg-emerald-500/10" : "border-slate-200 bg-slate-50",
        )}>
          <p className="truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
          <p className={cn("mt-1 text-sm font-semibold", active ? "text-emerald-700" : "text-slate-500")}>{active ? "Ativo" : "Pausado"}</p>
        </div>
      ))}
    </div>
  );
}

function Section({ badge, children, title }: { badge: string; children: ReactNode; title: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--ch-text)" }}>{title}</h3>
        <NeonBadge tone="zinc">{badge}</NeonBadge>
      </div>
      {children}
    </div>
  );
}

function SubSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="grid gap-3 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
      <h4 className="text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</h4>
      {children}
    </div>
  );
}

function ProductPicker({
  onToggle,
  products,
  selectedIds,
}: {
  onToggle: (id: string) => void;
  products: ClientSalesCatalogItem[];
  selectedIds: string[];
}) {
  return (
    <div className="grid gap-2">
      <FieldLabel>Produtos do catalogo</FieldLabel>
      <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white/60 p-2">
        {products.length ? products.slice(0, 40).map((product) => {
          const selected = selectedIds.includes(product.id);
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onToggle(product.id)}
              className={cn(
                "mb-2 flex w-full items-start gap-2 rounded-lg border p-2 text-left last:mb-0",
                selected ? "border-emerald-500/35 bg-emerald-500/10" : "border-transparent hover:border-slate-200 hover:bg-white",
              )}
            >
              <span className={cn(
                "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
                selected ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent",
              )}>
                <Check className="h-3 w-3" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{product.title}</span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-500">{product.price ? `${product.price} ${product.currency}` : "sem preco"} / {product.media.length} midia(s)</span>
              </span>
            </button>
          );
        }) : (
          <p className="px-2 py-3 text-[12px] text-slate-500">Cadastre produtos ativos para a IA criar campanhas automaticamente.</p>
        )}
      </div>
    </div>
  );
}

function MiniList({
  emptyText,
  items,
  title,
}: {
  emptyText: string;
  items: Array<{ id: string; title: string; detail: string }>;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/60 p-3">
      <p className="mb-2 font-mono text-[9px] uppercase tracking-wide text-slate-500">{title}</p>
      {items.length ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2">
              <p className="truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{item.title}</p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{item.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] leading-5 text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

function Metric({ detail, icon: Icon, label, value }: { detail: string; icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-emerald-600" />
      </div>
      <p className="mt-2 text-lg font-black text-emerald-700">{value}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

function ActionButton({
  disabled,
  icon: Icon,
  label,
  loading,
  onClick,
}: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  loading?: boolean;
  onClick: () => void | Promise<void | ChannelActionResponse | null>;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

function MiniToggle({
  checked,
  label,
  loading,
  onClick,
}: {
  checked: boolean;
  label: string;
  loading?: boolean;
  onClick: () => void | Promise<void | ChannelActionResponse | null>;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-center text-[11px] font-semibold transition disabled:opacity-50",
        checked ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500",
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className={cn("h-2 w-2 rounded-full", checked ? "bg-emerald-500" : "bg-slate-300")} />}
      {label}
    </button>
  );
}

function Input({
  icon: Icon,
  label,
  onChange,
  placeholder,
  value,
}: {
  icon?: LucideIcon;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <span className="relative block">
        {Icon ? <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /> : null}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={cn("h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none", Icon ? "pl-9" : "")}
          style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
        />
      </span>
    </label>
  );
}

function Textarea({
  label,
  onChange,
  placeholder,
  rows,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows: number;
  value: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm leading-5 outline-none"
        style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
      />
    </label>
  );
}

function DateInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none"
        style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
      />
    </label>
  );
}

function NumberInput({
  label,
  max,
  min,
  onChange,
  suffix,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix?: string;
  value: number;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <span className="relative block">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
          className={cn("h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none", suffix ? "pr-12" : "")}
          style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}
        />
        {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">{suffix}</span> : null}
      </span>
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none" style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}>
        {options.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}
      </select>
    </label>
  );
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/40 p-4 text-center text-[12px] text-slate-500">
      <Icon className="mx-auto mb-2 h-5 w-5 text-slate-400" />
      {text}
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-1 block font-mono text-[9px] uppercase tracking-wide text-slate-500">{children}</span>;
}

function buildLocalDateTime(offsetMinutes: number) {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function localDatetimeToIso(value: string) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getGroupWindowBlockReason({
  closeScheduledFor,
  connected,
  groupsEnabled,
  openScheduledFor,
  selectedAgentId,
  targetId,
}: {
  closeScheduledFor: string;
  connected: boolean;
  groupsEnabled: boolean;
  openScheduledFor: string;
  selectedAgentId: string;
  targetId: string;
}) {
  if (!selectedAgentId) return "Escolha o agente e WhatsApp das automacoes na base acima.";
  if (!connected) return "Conecte o WhatsApp deste agente antes de abrir ou fechar grupos.";
  if (!groupsEnabled) return "Ative Responder grupos em Comportamento para liberar janelas de conversa.";
  if (!targetId) return "Busque os grupos deste WhatsApp e escolha um grupo para a janela.";
  if (!openScheduledFor || !closeScheduledFor) return "Informe horario de abertura e fechamento.";

  const openDate = localDatetimeToIso(openScheduledFor);
  const closeDate = localDatetimeToIso(closeScheduledFor);
  if (!openDate || !closeDate) return "Revise os horarios da janela do grupo.";
  if (new Date(closeDate).getTime() <= new Date(openDate).getTime()) {
    return "O fechamento precisa ficar depois da abertura.";
  }

  return null;
}

function parseLines(value: string) {
  return value.split(/\n|;/).map((item) => item.trim()).filter(Boolean);
}

function firstProductUrl(products: ClientSalesCatalogItem[]) {
  for (const product of products) {
    if (product.externalLinkButtonTrackingUrl) return product.externalLinkButtonTrackingUrl;
    if (product.productUrl) return product.productUrl;
  }
  return "";
}

function formatGrowthPlanType(type: GrowthPlanItem["type"]) {
  if (type === "text_audio") return "texto + audio";
  if (type === "audio") return "audio";
  if (type === "carousel") return "carrossel";
  if (type === "status") return "status";
  if (type === "poll") return "enquete";
  return "texto";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
