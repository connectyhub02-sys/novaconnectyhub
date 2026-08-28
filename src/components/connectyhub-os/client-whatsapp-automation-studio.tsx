"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  CalendarClock,
  Check,
  Clock3,
  Eye,
  FileAudio,
  Loader2,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  RefreshCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Vote,
  X,
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

type WhatsappOutboundInsightSample = {
  id: string | null;
  chatId: string | null;
  sender: string | null;
  senderName: string | null;
  status: string | null;
  type: string | null;
  text: string | null;
  occurredAt: string | null;
  source: "message_find" | "target_chat" | "newsletter" | "click";
};

type WhatsappOutboundInsights = {
  syncedAt: string | null;
  sources: string[];
  delivery: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    played: number;
    failed: number;
    pending: number;
    unknown: number;
    error: string | null;
  };
  engagement: {
    views: number | null;
    reactions: Record<string, number>;
    replies: number;
    pollVotes: number;
    buttonClicks: number;
    linkClicks: number;
    knownLeads: number;
  };
  audience: {
    targetCount: number;
    targetTypes: Array<"group" | "newsletter">;
    mentionedAll: boolean;
    mentionedCount: number;
    maxRecipients: number | null;
    statusPrivacyType: string | null;
  };
  tracking: {
    trackIds: string[];
    messageIds: string[];
    trackingLinkIds: string[];
    newsletterServerIds: number[];
  };
  crm: {
    eventCount: number;
    lastEventAt: string | null;
    attributionReady: boolean;
    segments: string[];
  };
  limitations: string[];
  samples: WhatsappOutboundInsightSample[];
};

type WhatsappCampaignDeliveryTracking = {
  folderId: string;
  status: "pending" | "sent" | "failed" | "partial" | "unknown";
  total: number;
  sent: number;
  failed: number;
  scheduled: number;
  pending: number;
  lastSyncedAt: string;
  source: "uazapi_sender";
  error: string | null;
  samples: Array<{
    id: string | null;
    number: string | null;
    status: "scheduled" | "sent" | "failed" | "unknown";
    providerStatus: string | null;
    error: string | null;
    scheduledFor: string | null;
    sentAt: string | null;
  }>;
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
    campaignTracking: WhatsappCampaignDeliveryTracking | null;
    outboundInsights: WhatsappOutboundInsights | null;
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
      views: number;
      reactions: number;
      replies: number;
      linkClicks: number;
      knownLeads: number;
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

type WhatsappHistoryItem = WhatsappOperationsState["history"][number];

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

type GrowthFormatPreference = "mixed" | "text" | "audio" | "text_audio" | "carousel" | "poll" | "status";
type CampaignDestinationMode = "groups" | "channels" | "status";
type WhatsappAutomationCapability = "groups" | "status" | "campaigns" | "newsletters" | "interactive";

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
  channelEndpoint?: string;
  entityIdKey?: "companyId" | "sectorId";
};

export function ClientWhatsappAutomationStudio({
  agents,
  channelEndpoint = "/api/dashboard/whatsapp/channels",
  companyId,
  companyName,
  entityIdKey = "companyId",
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
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [campaignDestinationMode, setCampaignDestinationMode] = useState<CampaignDestinationMode>("groups");
  const [campaignTargetFocusId, setCampaignTargetFocusId] = useState("");
  const [selectedCampaignProductIds, setSelectedCampaignProductIds] = useState<string[]>([]);
  const [campaignBrief, setCampaignBrief] = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignText, setCampaignText] = useState("");
  const [campaignChecklist, setCampaignChecklist] = useState<string[]>([]);
  const [campaignScheduledFor, setCampaignScheduledFor] = useState(() => buildLocalDateTime(45));
  const [campaignFormat, setCampaignFormat] = useState<"single" | "carousel">("single");
  const [campaignDeliveryMode, setCampaignDeliveryMode] = useState<"text" | "audio" | "text_audio">("text");
  const [campaignMentionAll, setCampaignMentionAll] = useState(false);
  const [campaignRecurrence, setCampaignRecurrence] = useState<"none" | "daily" | "weekly">("daily");
  const [campaignOccurrences, setCampaignOccurrences] = useState(7);
  const [campaignButtonEnabled, setCampaignButtonEnabled] = useState(true);
  const [campaignButtonLabel, setCampaignButtonLabel] = useState("Comprar agora");
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);

  const [growthObjective, setGrowthObjective] = useState("Vender os produtos selecionados com presenca diaria no WhatsApp");
  const [growthFormatPreference, setGrowthFormatPreference] = useState<GrowthFormatPreference>("text");
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
  const selectedHistoryItem = operations?.history.find((item) => item.id === selectedHistoryId) ?? null;
  const groups = targets.filter((target) => target.type === "group");
  const newsletters = targets.filter((target) => target.type === "newsletter");
  const effectiveGroupWindowTargetId = groupWindowTargetId || groups[0]?.id || "";
  const selectedTargets = targets.filter((target) => selectedTargetIds.includes(target.id));
  const selectedGroupTargets = selectedTargets.filter((target) => target.type === "group");
  const selectedNewsletterTargets = selectedTargets.filter((target) => target.type === "newsletter");
  const campaignDestinationTargets = campaignDestinationMode === "channels" ? newsletters : campaignDestinationMode === "groups" ? groups : [];
  const selectedCampaignTargets = campaignDestinationMode === "channels"
    ? selectedNewsletterTargets
    : campaignDestinationMode === "groups"
      ? selectedGroupTargets
      : [];
  const selectedCampaignTargetIds = selectedCampaignTargets.map((target) => target.id);
  const focusedCampaignTarget = campaignDestinationTargets.find((target) => target.id === campaignTargetFocusId)
    ?? selectedCampaignTargets[0]
    ?? null;
  const effectiveCampaignTargetFocusId = focusedCampaignTarget?.id ?? "";
  const selectedPollTargetIds = selectedGroupTargets.map((target) => target.id);
  const selectedCampaignProducts = products.filter((product) => selectedCampaignProductIds.includes(product.id));
  const automaticCampaignProductIds = selectedCampaignProductIds.length > 0
    ? selectedCampaignProductIds
    : products.slice(0, 6).map((product) => product.id);
  const automaticCampaignProducts = products.filter((product) => automaticCampaignProductIds.includes(product.id));
  const effectiveGrowthFormatPreference = campaignDestinationMode === "status" ? "status" : growthFormatPreference === "status" ? "mixed" : growthFormatPreference;
  const preferredGrowthFormats = resolveGrowthPreferredFormats(effectiveGrowthFormatPreference);
  const selectedStatusProducts = products.filter((product) => selectedStatusProductIds.includes(product.id));
  const selectedCampaignMediaCount = automaticCampaignProducts.reduce((total, product) => total + product.media.length, 0);
  const campaignProductUrl = firstProductUrl(selectedCampaignProducts);
  const targetCampaignCapabilityReady = campaignDestinationMode === "channels"
    ? Boolean(behavior?.newsletterBroadcasts)
    : Boolean(behavior?.campaignBroadcasts);
  const automaticCampaignDestinationReady = campaignDestinationMode === "status"
    ? Boolean(behavior?.statusBroadcasts)
    : selectedCampaignTargetIds.length > 0 && targetCampaignCapabilityReady;
  const statusProductMediaReady = statusType !== "text"
    && selectedStatusProducts.some((product) => product.media.some((media) => media.kind === statusType));
  const statusHasMediaSource = statusMediaUrl.trim().length > 0 || statusProductMediaReady;
  const operationsLocked = !selectedAgentId || !connected;
  const campaignReady = !operationsLocked
    && campaignDestinationMode !== "status"
    && selectedCampaignTargetIds.length > 0
    && (campaignFormat === "carousel" ? selectedCampaignProducts.length > 0 : campaignText.trim().length > 0)
    && targetCampaignCapabilityReady;
  const growthPlanReady = !operationsLocked
    && automaticCampaignDestinationReady
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
  const canEnableGroupReplies = !operationsLocked && behavior !== undefined && !behavior.groups;
  const pollReady = !operationsLocked
    && campaignDestinationMode === "groups"
    && Boolean(behavior?.campaignBroadcasts)
    && Boolean(behavior?.interactiveMessages)
    && selectedPollTargetIds.length > 0
    && pollQuestion.trim().length > 0
    && parseLines(pollChoices).length >= 2;

  useEffect(() => {
    if (selectedHistoryId && !operations?.history.some((item) => item.id === selectedHistoryId)) {
      setSelectedHistoryId(null);
    }
  }, [operations?.history, selectedHistoryId]);

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
        const params = new URLSearchParams({ [entityIdKey]: companyId, agentId: selectedAgentId });
        const response = await fetch(`${channelEndpoint}?${params.toString()}`, { cache: "no-store" });
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
  }, [channelEndpoint, companyId, entityIdKey, selectedAgentId]);

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    if (!companyId || !selectedAgentId) return null;
    setRunningAction(action);
    setNotice(null);

    try {
      const response = await fetch(channelEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [entityIdKey]: companyId,
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
      const params = new URLSearchParams({ [entityIdKey]: companyId, agentId: selectedAgentId });
      const response = await fetch(`${channelEndpoint}?${params.toString()}`, { cache: "no-store" });
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

  function toggleProduct(targetId: string, mode: "campaign" | "status") {
    const setter = mode === "campaign" ? setSelectedCampaignProductIds : setSelectedStatusProductIds;
    if (mode === "campaign") setGrowthPlan(null);
    setter((current) => current.includes(targetId)
      ? current.filter((id) => id !== targetId)
      : [...current, targetId].slice(-6));
  }

  function selectCampaignDestinationMode(mode: CampaignDestinationMode) {
    setCampaignDestinationMode(mode);
    setCampaignTargetFocusId("");
    setGrowthPlan(null);
    if (mode === "status") {
      setGrowthFormatPreference("status");
      setCampaignMentionAll(false);
      return;
    }
    setGrowthFormatPreference((current) => current === "status" ? "text" : current);
    if (mode === "channels") setCampaignMentionAll(false);
  }

  function selectCampaignTarget(targetId: string) {
    setCampaignTargetFocusId(targetId);
    setGrowthPlan(null);
    setSelectedTargetIds((current) => {
      const currentModeTargetIds = new Set(campaignDestinationTargets.map((target) => target.id));
      if (!targetId) return current.filter((id) => !currentModeTargetIds.has(id));
      return current.includes(targetId) ? current : [...current, targetId];
    });
  }

  function toggleCampaignTargetSelection(targetId: string) {
    setGrowthPlan(null);
    setSelectedTargetIds((current) => current.includes(targetId)
      ? current.filter((id) => id !== targetId)
      : [...current, targetId]);
  }

  function updateGrowthObjective(value: string) {
    setGrowthObjective(value);
    setGrowthPlan(null);
  }

  function updateGrowthFormatPreference(value: string) {
    setGrowthFormatPreference(value as GrowthFormatPreference);
    setGrowthPlan(null);
  }

  async function generateCampaignDraft() {
    const data = await runAction("generate_target_campaign_draft", {
      targetIds: selectedCampaignTargetIds,
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
      targetIds: selectedCampaignTargetIds,
      scheduledFor: localDatetimeToIso(campaignScheduledFor),
      mentionAll: campaignMentionAll,
      recurrenceFrequency: campaignRecurrence === "none" ? null : campaignRecurrence,
      recurrenceOccurrences: campaignRecurrence === "none" ? null : campaignOccurrences,
      deliveryMode: campaignDeliveryMode,
      catalogItemIds: selectedCampaignProductIds,
      interactiveMode: campaignButtonEnabled ? "button" : "none",
      buttonLabel: campaignButtonLabel,
      buttonUrl: campaignProductUrl,
    });
  }

  async function generateGrowthPlan() {
    const data = await runAction("generate_growth_plan", {
      targetIds: selectedCampaignTargetIds,
      catalogItemIds: automaticCampaignProductIds,
      objective: growthObjective,
      brief: campaignBrief,
      durationDays: growthDurationDays,
      postsPerDay: growthPostsPerDay,
      startFrom: localDatetimeToIso(growthStartFrom),
      mentionAll: campaignMentionAll,
      preferredFormats: preferredGrowthFormats,
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
      targetIds: selectedCampaignTargetIds,
      catalogItemIds: automaticCampaignProductIds,
      mentionAll: campaignMentionAll,
      buttonEnabled: campaignButtonEnabled,
      buttonLabel: campaignButtonEnabled ? campaignButtonLabel : null,
      planItems: campaignButtonEnabled
        ? growthPlan.items
        : growthPlan.items.map((item) => ({ ...item, buttonLabel: null })),
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
      mediaCaption: "",
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

  async function enableGroupReplies() {
    await runAction("enable_group_replies");
  }

  async function setAutomationCapability(capability: WhatsappAutomationCapability, enabled: boolean) {
    await runAction("set_automation_capability", { capability, enabled });
  }

  async function toggleTargetSetting(target: WhatsappTarget, key: "enabled" | "campaignEnabled") {
    await runAction("update_target_settings", {
      targetId: target.id,
      [key]: !target[key],
    });
  }

  async function updateTargetPolicy(target: WhatsappTarget, payload: Record<string, unknown>) {
    await runAction("update_target_settings", {
      targetId: target.id,
      ...payload,
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

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <ActionButton icon={RefreshCcw} label="Atualizar" loading={runningAction === "load_channels"} onClick={refreshChannels} />
          <ActionButton icon={Users} label="Buscar grupos" disabled={!selectedAgentId} loading={runningAction === "refresh_groups"} onClick={() => runAction("refresh_groups")} />
          <ActionButton icon={Megaphone} label="Buscar canais" disabled={!selectedAgentId} loading={runningAction === "refresh_newsletters"} onClick={() => runAction("refresh_newsletters")} />
          <ActionButton icon={ShieldCheck} label="Analisar grupos" disabled={operationsLocked || groups.length === 0} loading={runningAction === "sync_group_intelligence"} onClick={() => runAction("sync_group_intelligence")} />
          <ActionButton icon={BarChart3} label="Atualizar metricas" disabled={operationsLocked || !operations?.history.length} loading={runningAction === "sync_outbound_insights"} onClick={() => runAction("sync_outbound_insights")} />
        </div>

        <FeatureGates
          behavior={behavior}
          disabled={operationsLocked}
          loading={runningAction === "set_automation_capability"}
          onToggle={setAutomationCapability}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="grid gap-4">
            <Section title="Destino da campanha" badge={campaignDestinationMode === "status" ? "status do agente" : `${selectedCampaignTargets.length} selecionado(s)`}>
              <div className="grid gap-2">
                {campaignDestinationMode === "status" ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[12px] leading-5 text-emerald-700">
                    Status nao usa grupo ou canal selecionado. A rotina publica no status do WhatsApp do agente em uso e gera respostas no privado.
                  </div>
                ) : null}
                {campaignDestinationMode !== "status" && campaignDestinationTargets.length ? (
                  <div className="grid gap-3">
                    <label>
                      <FieldLabel>{campaignDestinationMode === "channels" ? "Canal" : "Grupo"}</FieldLabel>
                      <select value={effectiveCampaignTargetFocusId} onChange={(event) => selectCampaignTarget(event.target.value)} className="h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none" style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}>
                        <option value="">Nenhum</option>
                        {campaignDestinationTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                      </select>
                    </label>
                    {focusedCampaignTarget ? (
                      <div
                        className={cn(
                          "grid gap-3 rounded-xl border p-3",
                          selectedTargetIds.includes(focusedCampaignTarget.id) ? "border-emerald-500/35 bg-emerald-500/10" : "border-slate-200 bg-white/60",
                        )}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className={cn(
                            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                            selectedTargetIds.includes(focusedCampaignTarget.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent",
                          )}>
                            <Check className="h-3 w-3" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold" style={{ color: "var(--ch-text)" }}>{focusedCampaignTarget.name}</span>
                              <NeonBadge tone={focusedCampaignTarget.type === "group" ? "green" : "cyan"}>{focusedCampaignTarget.type === "group" ? "grupo" : "canal"}</NeonBadge>
                              {focusedCampaignTarget.isAdmin ? <NeonBadge tone="amber">admin</NeonBadge> : null}
                            </span>
                            <span className="mt-1 block truncate text-[11px] text-slate-500">{focusedCampaignTarget.jid}</span>
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <MiniToggle checked={selectedTargetIds.includes(focusedCampaignTarget.id)} label="Selecionado para campanha" onClick={() => toggleCampaignTargetSelection(focusedCampaignTarget.id)} />
                          <MiniToggle checked={focusedCampaignTarget.enabled} label={focusedCampaignTarget.type === "group" ? "Atendimento no grupo" : "Canal ativo"} onClick={() => toggleTargetSetting(focusedCampaignTarget, "enabled")} loading={runningAction === "update_target_settings"} />
                          <MiniToggle checked={focusedCampaignTarget.campaignEnabled} label={focusedCampaignTarget.type === "group" ? "Campanhas liberadas" : "Publicar no canal"} onClick={() => toggleTargetSetting(focusedCampaignTarget, "campaignEnabled")} loading={runningAction === "update_target_settings"} />
                        </div>
                        {focusedCampaignTarget.type === "group" ? (
                          <div className="grid gap-2 sm:grid-cols-3">
                            <SelectField label="Responder" value={focusedCampaignTarget.replyMode} disabled={runningAction === "update_target_settings"} onChange={(value) => updateTargetPolicy(focusedCampaignTarget, { replyMode: value })} options={[
                              ["all", "Todas"],
                              ["mentions", "So mencoes"],
                              ["observer", "Observador"],
                              ["admins", "Admins"],
                              ["off", "Desligado"],
                            ]} />
                            <SelectField label="@ nas respostas" value={focusedCampaignTarget.mentionMode} disabled={runningAction === "update_target_settings"} onChange={(value) => updateTargetPolicy(focusedCampaignTarget, { mentionMode: value })} options={[
                              ["none", "Sem @"],
                              ["author", "@ autor"],
                              ["all", "@ todos"],
                            ]} />
                            <SelectField label="Limite por hora" value={String(focusedCampaignTarget.maxRepliesPerHour)} disabled={runningAction === "update_target_settings"} onChange={(value) => updateTargetPolicy(focusedCampaignTarget, { maxRepliesPerHour: Number(value) })} options={[
                              ["0", "0 resp/h"],
                              ["3", "3 resp/h"],
                              ["6", "6 resp/h"],
                              ["12", "12 resp/h"],
                              ["24", "24 resp/h"],
                            ]} />
                          </div>
                        ) : (
                          <p className="text-[11px] leading-5 text-slate-500">
                            Canais recebem posts de broadcast. Mencoes e enquetes ficam disponiveis somente para grupos.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {campaignDestinationMode !== "status" && !campaignDestinationTargets.length ? (
                  <EmptyState
                    icon={campaignDestinationMode === "channels" ? Megaphone : Users}
                    text={campaignDestinationMode === "channels" ? "Clique em Buscar canais para carregar canais/newsletters deste WhatsApp." : "Clique em Buscar grupos para carregar grupos deste WhatsApp."}
                  />
                ) : null}
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
                  {canEnableGroupReplies ? (
                    <ActionButton icon={MessageCircle} label="Ativar responder grupos" loading={runningAction === "enable_group_replies"} onClick={enableGroupReplies} />
                  ) : null}
                </div>
              </div>
            </Section>
          </div>

          <div className="grid gap-4">
            <Section title="Campanha automatica" badge="IA faz a copy">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.48fr)]">
                <div className="grid gap-3">
                  <CampaignDestinationSelector
                    groupCount={groups.length}
                    newsletterCount={newsletters.length}
                    onChange={selectCampaignDestinationMode}
                    selectedGroupCount={selectedGroupTargets.length}
                    selectedNewsletterCount={selectedNewsletterTargets.length}
                    statusEnabled={Boolean(behavior?.statusBroadcasts)}
                    value={campaignDestinationMode}
                  />
                  <ProductPicker products={products} selectedIds={selectedCampaignProductIds} onToggle={(id) => toggleProduct(id, "campaign")} />
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[12px] leading-5 text-emerald-700">
                    {selectedCampaignProductIds.length > 0
                      ? `${selectedCampaignProductIds.length} produto(s) selecionado(s). A IA usa automaticamente as midias cadastradas no produto. Em post simples, cada post usa um produto principal; em carrossel, varios produtos viram cards.`
                      : `Nenhum produto selecionado. A IA pode testar ate ${automaticCampaignProducts.length} produto(s) ativo(s) do catalogo.`}
                    {selectedCampaignMediaCount > 0 ? ` Midias encontradas: ${selectedCampaignMediaCount}.` : " Cadastre midias nos produtos para usar carrossel e anexos."}
                  </div>
                  <Input label="Nome interno (opcional)" value={campaignTitle} onChange={setCampaignTitle} placeholder="Ex.: Campanha da semana" />
                  <SelectField label="Objetivo da IA" value={growthObjective} onChange={updateGrowthObjective} options={[
                    ["Vender os produtos selecionados com presenca diaria no WhatsApp", "Vender produtos"],
                    ["Informar sobre o produto, explicar beneficios e vender com botao no final", "Informativo + venda"],
                    ["Descobrir quais produtos geram mais interesse no grupo", "Testar interesse"],
                    ["Criar conversa no grupo com enquetes e ofertas leves", "Engajar grupo"],
                    ["Criar enquetes automaticas para entender desejo de compra", "Enquete automatica"],
                    ["Publicar uma vitrine com carrossel e botao de compra", "Vitrine/carrossel"],
                  ]} />
                  <div className={cn("grid gap-2", campaignDestinationMode === "status" ? "sm:grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-4")}>
                    <SelectField
                      disabled={campaignDestinationMode === "status"}
                      label="Formato principal"
                      value={effectiveGrowthFormatPreference}
                      onChange={updateGrowthFormatPreference}
                      options={getGrowthFormatOptions(campaignDestinationMode)}
                    />
                    {campaignDestinationMode !== "status" ? (
                      <>
                        {campaignDestinationMode === "groups" ? (
                          <SelectField label="Mencoes dos posts" value={campaignMentionAll ? "all" : "none"} onChange={(value) => setCampaignMentionAll(value === "all")} options={[
                            ["none", "Sem @"],
                            ["all", "@ todos"],
                          ]} />
                        ) : null}
                        <Input label="Texto do botao de compra" value={campaignButtonLabel} onChange={setCampaignButtonLabel} />
                        <div className="self-end">
                          <MiniToggle checked={campaignButtonEnabled} label="Botao de compra" onClick={() => setCampaignButtonEnabled((current) => !current)} />
                        </div>
                      </>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <DateInput label="Inicio" value={growthStartFrom} onChange={(value) => { setGrowthStartFrom(value); setGrowthPlan(null); }} />
                    <NumberInput label="Dias" value={growthDurationDays} min={1} max={14} onChange={(value) => { setGrowthDurationDays(value); setGrowthPlan(null); }} />
                    <NumberInput label="Posts/dia" value={growthPostsPerDay} min={1} max={5} onChange={(value) => { setGrowthPostsPerDay(value); setGrowthPlan(null); }} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ActionButton icon={Sparkles} label="Planejar rotina" disabled={!growthPlanReady} loading={runningAction === "generate_growth_plan"} onClick={generateGrowthPlan} />
                    <ActionButton icon={CalendarClock} label="Agendar rotina" disabled={!scheduleGrowthPlanReady} loading={runningAction === "schedule_growth_plan"} onClick={scheduleGrowthPlan} />
                  </div>
                </div>
                <WhatsappCampaignPreview
                  behavior={behavior}
                  buttonEnabled={campaignButtonEnabled}
                  buttonLabel={campaignButtonLabel}
                  destinationMode={campaignDestinationMode}
                  format={effectiveGrowthFormatPreference}
                  mentionAll={campaignMentionAll}
                  objective={growthObjective}
                  plan={growthPlan}
                  products={automaticCampaignProducts}
                  selectedTargets={selectedCampaignTargets}
                />
                {growthPlan ? (
                  <div className="grid gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 xl:col-span-2">
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

            <Section title="Envio manual" badge={advancedToolsOpen ? "aberto" : "opcional"}>
              <div className="grid gap-3">
                <ActionButton icon={Settings2} label={advancedToolsOpen ? "Ocultar envio manual" : "Mostrar envio manual"} onClick={() => setAdvancedToolsOpen((current) => !current)} />
                {advancedToolsOpen ? (
                  <div className="grid gap-4">
                    <SubSection title="Post manual para grupos/canais">
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
                          <Input label="Texto do botao de compra" value={campaignButtonLabel} onChange={setCampaignButtonLabel} />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <MiniToggle checked={campaignButtonEnabled} label="Enviar botao de compra" onClick={() => setCampaignButtonEnabled((current) => !current)} />
                          <MiniToggle checked={campaignMentionAll} label="Mencionar todos nos grupos" onClick={() => setCampaignMentionAll((current) => !current)} />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <ActionButton icon={Sparkles} label="Criar post IA" disabled={operationsLocked || campaignDestinationMode === "status" || selectedCampaignTargets.length === 0 || (!campaignBrief.trim() && automaticCampaignProducts.length === 0 && !campaignText.trim())} loading={runningAction === "generate_target_campaign_draft"} onClick={generateCampaignDraft} />
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
              <Metric icon={Eye} label="Views" value={formatCompactNumber(operations?.analytics.summary.views ?? 0)} detail="canais/status disponiveis" />
              <Metric icon={MessageCircle} label="Respostas" value={formatCompactNumber(operations?.analytics.summary.replies ?? 0)} detail="grupos e status" />
              <Metric icon={MousePointerClick} label="Cliques" value={formatCompactNumber(operations?.analytics.summary.linkClicks ?? 0)} detail="links rastreados" />
              <Metric icon={Users} label="Leads CRM" value={formatCompactNumber(operations?.analytics.summary.knownLeads ?? 0)} detail="contatos identificados" />
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
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedHistoryId(item.id)}
                className="grid gap-2 rounded-xl border border-slate-200 bg-white/60 p-3 text-left transition hover:border-emerald-500/30 hover:bg-emerald-500/5 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--ch-text)" }}>{item.title}</p>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{item.summary ?? formatHistoryOperation(item.operation)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {buildHistoryMetricPills(item).map((metric) => (
                      <HistoryMetricPill key={metric.label} label={metric.label} value={metric.value} />
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <NeonBadge tone={item.status === "published" ? "green" : item.status === "review" ? "rose" : "amber"}>{item.status}</NeonBadge>
                  <span className="font-mono text-[10px] text-slate-500">{formatDateTime(item.scheduledFor ?? item.publishedAt)}</span>
                </div>
              </button>
            )) : (
              <EmptyState icon={CalendarClock} text="Nenhum envio de grupos, canais ou status registrado ainda." />
            )}
          </div>
        </Section>
        <HistoryInsightDrawer
          item={selectedHistoryItem}
          loading={runningAction === "sync_outbound_insights"}
          onClose={() => setSelectedHistoryId(null)}
          onSync={() => runAction("sync_outbound_insights")}
        />
      </div>
    </Panel>
  );
}

function FeatureGates({
  behavior,
  disabled,
  loading,
  onToggle,
}: {
  behavior?: WhatsappOperationsState["behavior"];
  disabled?: boolean;
  loading?: boolean;
  onToggle: (capability: WhatsappAutomationCapability, enabled: boolean) => void | Promise<void | ChannelActionResponse | null>;
}) {
  const gates = [
    { label: "Atendimento em grupos", detail: "respostas e janelas", active: behavior?.groups, capability: "groups" },
    { label: "Campanhas em grupos", detail: "posts para grupos", active: behavior?.campaignBroadcasts, capability: "campaigns" },
    { label: "Campanhas em canais", detail: "posts em canais", active: behavior?.newsletterBroadcasts, capability: "newsletters" },
    { label: "Status do agente", detail: "stories do WhatsApp", active: behavior?.statusBroadcasts, capability: "status" },
    { label: "Interacoes", detail: "botoes e enquetes", active: behavior?.interactiveMessages, capability: "interactive" },
  ] as const;

  return (
    <div className="grid gap-2 sm:grid-cols-5">
      {gates.map((gate) => (
        <div key={gate.label} className={cn(
          "grid gap-2 rounded-xl border px-3 py-2",
          gate.active ? "border-emerald-500/25 bg-emerald-500/10" : "border-slate-200 bg-slate-50",
        )}>
          <div className="min-w-0">
            <p className="truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">{gate.label}</p>
            <p className="mt-1 truncate text-[10px] text-slate-500">{gate.detail}</p>
            <p className={cn("mt-1 text-sm font-semibold", gate.active ? "text-emerald-700" : "text-slate-500")}>{gate.active ? "Ativo" : "Pausado"}</p>
          </div>
          <button
            type="button"
            disabled={disabled || loading}
            onClick={() => onToggle(gate.capability, !gate.active)}
            className={cn(
              "inline-flex min-h-8 items-center justify-center rounded-lg border bg-white/70 px-2 font-mono text-[9px] font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50",
              gate.active
                ? "border-slate-300 text-slate-500 hover:bg-slate-100"
                : "border-emerald-500/25 text-emerald-700 hover:bg-emerald-500/10",
            )}
          >
            {loading ? "Salvando..." : gate.active ? "Desativar" : "Ativar"}
          </button>
        </div>
      ))}
    </div>
  );
}

function HistoryInsightDrawer({
  item,
  loading,
  onClose,
  onSync,
}: {
  item: WhatsappHistoryItem | null;
  loading: boolean;
  onClose: () => void;
  onSync: () => void | Promise<void | ChannelActionResponse | null>;
}) {
  if (!item) return null;

  const insights = item.outboundInsights;
  const reactions = insights ? sumReactionCounts(insights.engagement.reactions) : 0;
  const deliveryTotal = insights?.delivery.total || item.campaignTracking?.total || 0;
  const deliveryDone = insights
    ? insights.delivery.sent + insights.delivery.delivered + insights.delivery.read + insights.delivery.played
    : item.campaignTracking?.sent ?? 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/35 p-3 sm:p-5">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">Raio-x da campanha</p>
            <h3 className="mt-1 truncate text-base font-semibold" style={{ color: "var(--ch-text)" }}>{item.title}</h3>
            <p className="mt-1 text-[12px] leading-5 text-slate-500">
              {formatHistoryOperation(item.operation)} / {formatDateTime(item.publishedAt ?? item.scheduledFor)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            aria-label="Fechar metricas"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <InsightStat icon={Send} label="Entrega" value={`${formatCompactNumber(deliveryDone)}/${formatCompactNumber(deliveryTotal)}`} detail="mensagens acompanhadas" />
          <InsightStat icon={Eye} label="Views" value={formatCompactNumber(insights?.engagement.views ?? 0)} detail={insights?.engagement.views === null ? "nao exposto para este tipo" : "canais/status quando disponivel"} />
          <InsightStat icon={MessageCircle} label="Respostas" value={formatCompactNumber(insights?.engagement.replies ?? 0)} detail="grupo, canal ou status" />
          <InsightStat icon={MousePointerClick} label="Cliques" value={formatCompactNumber(insights?.engagement.linkClicks ?? 0)} detail="links rastreados" />
          <InsightStat icon={Vote} label="Votos" value={formatCompactNumber(insights?.engagement.pollVotes ?? 0)} detail="enquetes em grupos" />
          <InsightStat icon={Sparkles} label="Reacoes" value={formatCompactNumber(reactions)} detail="reactions agregadas" />
          <InsightStat icon={Users} label="Leads CRM" value={formatCompactNumber(insights?.engagement.knownLeads ?? 0)} detail="contatos identificados" />
          <InsightStat icon={BarChart3} label="Eventos" value={formatCompactNumber(insights?.crm.eventCount ?? 0)} detail="registrados no CRM" />
        </div>

        {insights ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel>Amostras e sinais</FieldLabel>
                <NeonBadge tone={insights.crm.attributionReady ? "green" : "zinc"}>
                  {insights.crm.attributionReady ? "crm pronto" : "aguardando interacao"}
                </NeonBadge>
              </div>
              <div className="mt-2 grid gap-2">
                {insights.samples.length ? insights.samples.map((sample, index) => (
                  <div key={`${sample.source}-${sample.id ?? sample.occurredAt ?? index}`} className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">
                      {formatInsightSource(sample.source)} / {formatDateTime(sample.occurredAt)} / {sample.status ?? sample.type ?? "sinal"}
                    </p>
                    <p className="mt-1 truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
                      {sample.senderName ?? sample.sender ?? sample.chatId ?? "Contato WhatsApp"}
                    </p>
                    {sample.text ? <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{sample.text}</p> : null}
                  </div>
                )) : (
                  <p className="text-[12px] leading-5 text-slate-500">Nenhuma resposta, clique, voto ou update retornou nesta sincronizacao.</p>
                )}
              </div>
            </div>

            <div className="grid content-start gap-3">
              <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                <FieldLabel>Fontes consultadas</FieldLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {insights.sources.length ? insights.sources.map((source) => (
                    <NeonBadge key={source} tone="cyan">{source}</NeonBadge>
                  )) : <span className="text-[12px] text-slate-500">Ainda sem sync de metricas.</span>}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                <FieldLabel>Segmentos CRM</FieldLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {insights.crm.segments.length ? insights.crm.segments.map((segment) => (
                    <NeonBadge key={segment} tone="green">{segment}</NeonBadge>
                  )) : <span className="text-[12px] text-slate-500">Sem segmento novo.</span>}
                </div>
              </div>

              {insights.limitations.length ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                  <FieldLabel>Limites do WhatsApp</FieldLabel>
                  <div className="mt-2 grid gap-1">
                    {insights.limitations.map((limitation) => (
                      <p key={limitation} className="text-[11px] leading-4 text-amber-700">- {limitation}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState icon={BarChart3} text="Este envio ainda nao tem metricas sincronizadas. Clique em Atualizar metricas para consultar a Uazapi e registrar sinais no CRM." />
          </div>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <p className="text-[11px] leading-5 text-slate-500">
            Status nao expoe lista nominal de visualizadores no contrato atual; quando houver resposta, clique ou voto, o CRM recebe o sinal com atribuicao.
          </p>
          <ActionButton icon={BarChart3} label="Atualizar metricas" loading={loading} onClick={onSync} />
        </div>
      </div>
    </div>
  );
}

function InsightStat({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-emerald-600" />
      </div>
      <p className="mt-2 text-lg font-black text-emerald-700">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p>
    </div>
  );
}

function HistoryMetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-slate-500">
      {label}: {value}
    </span>
  );
}

function CampaignDestinationSelector({
  groupCount,
  newsletterCount,
  onChange,
  selectedGroupCount,
  selectedNewsletterCount,
  statusEnabled,
  value,
}: {
  groupCount: number;
  newsletterCount: number;
  onChange: (mode: CampaignDestinationMode) => void;
  selectedGroupCount: number;
  selectedNewsletterCount: number;
  statusEnabled: boolean;
  value: CampaignDestinationMode;
}) {
  const options = [
    {
      mode: "groups" as const,
      icon: Users,
      label: "Grupos",
      detail: `${selectedGroupCount}/${groupCount} selecionado(s)`,
    },
    {
      mode: "channels" as const,
      icon: Megaphone,
      label: "Canais",
      detail: `${selectedNewsletterCount}/${newsletterCount} selecionado(s)`,
    },
    {
      mode: "status" as const,
      icon: MessageCircle,
      label: "Status",
      detail: statusEnabled ? "status do agente" : "ative Status",
    },
  ];

  return (
    <div className="grid gap-2">
      <FieldLabel>Tipo de campanha</FieldLabel>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const Icon = option.icon;
          const active = value === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => onChange(option.mode)}
              className={cn(
                "grid min-h-20 gap-1 rounded-xl border px-3 py-2 text-left transition",
                active ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700" : "border-slate-200 bg-white/60 text-slate-600 hover:border-emerald-500/25",
              )}
            >
              <span className="flex items-center gap-2 text-[12px] font-semibold">
                <Icon className="h-4 w-4" />
                {option.label}
              </span>
              <span className="text-[10px] leading-4 text-slate-500">{option.detail}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-5 text-slate-500">{describeCampaignDestinationMode(value)}</p>
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

function WhatsappCampaignPreview({
  behavior,
  buttonEnabled,
  buttonLabel,
  destinationMode,
  format,
  mentionAll,
  objective,
  plan,
  products,
  selectedTargets,
}: {
  behavior?: WhatsappOperationsState["behavior"];
  buttonEnabled: boolean;
  buttonLabel: string;
  destinationMode: CampaignDestinationMode;
  format: GrowthFormatPreference;
  mentionAll: boolean;
  objective: string;
  plan: GrowthPlan | null;
  products: ClientSalesCatalogItem[];
  selectedTargets: WhatsappTarget[];
}) {
  const product = products[0] ?? null;
  const previewItem = plan?.items[0] ?? null;
  const effectiveFormat = resolveCampaignPreviewFormat(previewItem?.type, format, objective);
  const mediaUrl = firstProductMediaUrl(product ? [product] : products);
  const text = previewItem?.text ?? buildCampaignPreviewText(product, objective, effectiveFormat);
  const pollChoices = previewItem?.pollChoices.length ? previewItem.pollChoices : buildCampaignPreviewPollChoices(products);
  const style = mediaUrl ? { backgroundImage: `url("${mediaUrl.replace(/"/g, "%22")}")` } : undefined;
  const destination = describeCampaignPreviewDestination(destinationMode, effectiveFormat, selectedTargets);
  const automationPlan = describeCampaignAutomationPlan(objective, effectiveFormat, products, destinationMode);
  const blockedRequirements = listCampaignPreviewBlockedRequirements(effectiveFormat, behavior, destinationMode);
  const deliverySteps = listCampaignDeliverySteps(effectiveFormat, products, buttonEnabled);
  const buttonDestination = describeCampaignButtonDestination(effectiveFormat, products, buttonEnabled, buttonLabel);
  const productUsage = describeCampaignProductUsage(effectiveFormat, products);
  const showsInteractiveButton = buttonEnabled && effectiveFormat !== "audio" && effectiveFormat !== "poll" && effectiveFormat !== "status";
  const previewTitle = destinationMode === "channels" ? "Canal selecionado" : destinationMode === "status" ? "Status do agente" : "Grupo selecionado";

  return (
    <div className="mx-auto grid w-full max-w-[300px] gap-2">
      <div className="rounded-[28px] border border-slate-300 bg-slate-950 p-2 shadow-sm">
        <div className="overflow-hidden rounded-[22px] bg-[#e8f5e9]">
          <div className="flex items-center gap-2 bg-emerald-700 px-3 py-2 text-white">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-[10px] font-black">CH</div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold">{previewTitle}</p>
              <p className="text-[9px] text-emerald-100">{formatGrowthPlanType(effectiveFormat)}</p>
            </div>
          </div>
          <div className="grid min-h-[320px] content-end gap-2 px-3 py-4">
            <div className="ml-auto max-w-[92%] rounded-lg bg-white p-2 shadow-sm">
              {mentionAll ? <p className="mb-1 text-[11px] font-semibold text-emerald-700">@todos</p> : null}
              {effectiveFormat === "audio" || effectiveFormat === "text_audio" ? (
                <div className="mb-2 flex items-center gap-2 rounded-md bg-slate-50 px-2 py-2">
                  <FileAudio className="h-4 w-4 text-emerald-700" />
                  <div className="h-1 flex-1 rounded-full bg-slate-200">
                    <div className="h-1 w-2/3 rounded-full bg-emerald-500" />
                  </div>
                  <span className="font-mono text-[9px] text-slate-500">0:22</span>
                </div>
              ) : null}
              {mediaUrl && effectiveFormat !== "audio" && effectiveFormat !== "poll" ? (
                <div className="mb-2 aspect-square rounded-md bg-slate-200 bg-cover bg-center" style={style} />
              ) : null}
              {effectiveFormat === "carousel" ? (
                <div className="mb-2 flex gap-1 overflow-hidden">
                  {products.slice(0, 3).map((item) => (
                    <div key={item.id} className="h-12 min-w-12 rounded-md bg-emerald-100 px-1 py-2 text-center text-[8px] font-semibold text-emerald-800">
                      {item.title.slice(0, 16)}
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="whitespace-pre-line text-[11px] leading-4 text-slate-700">{text}</p>
              {effectiveFormat === "poll" ? (
                <div className="mt-2 grid gap-1">
                  {pollChoices.slice(0, 4).map((choice) => (
                    <div key={choice} className="rounded-full border border-emerald-500/25 px-2 py-1 text-[10px] text-emerald-700">{choice}</div>
                  ))}
                </div>
              ) : null}
              {showsInteractiveButton ? (
                <div className="mt-2 rounded-md border border-emerald-500/25 px-2 py-1 text-center text-[10px] font-semibold text-emerald-700">
                  {buttonLabel || "Comprar agora"}
                </div>
              ) : null}
              <p className="mt-1 text-right font-mono text-[9px] text-slate-400">10:30</p>
            </div>
          </div>
        </div>
      </div>
      <p className="text-center font-mono text-[9px] uppercase tracking-wide text-slate-500">
        Previa WhatsApp
      </p>
      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white/70 p-3">
        <FieldLabel>Resumo da rotina</FieldLabel>
        <p className="text-[12px] leading-5 text-slate-600">{automationPlan}</p>
        <div className="grid gap-2 text-[11px] leading-4 text-slate-500">
          <p><span className="font-semibold text-slate-700">Destino:</span> {destination}</p>
          <p><span className="font-semibold text-slate-700">Formato:</span> {formatGrowthPlanType(effectiveFormat)}</p>
          <p><span className="font-semibold text-slate-700">Envio real:</span> {deliverySteps.join(" + ")}</p>
          {buttonDestination ? (
            <p><span className="font-semibold text-slate-700">Botao:</span> {buttonDestination}</p>
          ) : null}
          {productUsage ? (
            <p><span className="font-semibold text-slate-700">Produtos:</span> {productUsage}</p>
          ) : null}
          {blockedRequirements.length ? (
            <p><span className="font-semibold text-amber-700">Ativar:</span> {blockedRequirements.join(", ")}</p>
          ) : null}
        </div>
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
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--ch-border)", color: "var(--ch-text)" }}>
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
  if (!groupsEnabled) return "Falta ativar Responder grupos no comportamento global deste agente. A regra do card vale so para este grupo.";
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

function firstProductMediaUrl(products: ClientSalesCatalogItem[]) {
  for (const product of products) {
    const media = product.media.find((item) => item.kind === "image" || item.kind === "video");
    if (media?.storageUrl) return media.storageUrl;
  }
  return "";
}

function resolveGrowthPreferredFormats(format: GrowthFormatPreference) {
  if (format === "mixed") return [];
  return [format];
}

function getGrowthFormatOptions(mode: CampaignDestinationMode): Array<[string, string]> {
  if (mode === "status") {
    return [["status", "Status"]];
  }

  const options: Array<[string, string]> = [
    ["text", "Texto"],
    ["audio", "Audio"],
    ["text_audio", "Texto + audio"],
    ["carousel", "Carrossel"],
    ["mixed", "Misto revisavel"],
  ];

  if (mode === "groups") {
    options.push(["poll", "Enquete"]);
  }

  return options;
}

function describeCampaignDestinationMode(mode: CampaignDestinationMode) {
  if (mode === "channels") {
    return "A IA cria posts para canais/newsletters do WhatsApp. Selecione os canais na lista de destinos.";
  }

  if (mode === "status") {
    return "A IA publica no status do agente. Nao precisa selecionar grupo ou canal.";
  }

  return "A IA cria posts para grupos. Selecione os grupos e ajuste mencoes, enquetes e respostas.";
}

function resolveCampaignPreviewFormat(
  plannedType: GrowthPlanItem["type"] | undefined,
  preference: GrowthFormatPreference,
  objective: string,
): GrowthPlanItem["type"] {
  if (plannedType) return plannedType;
  if (preference !== "mixed") return preference;

  const normalized = normalizePreviewText(objective);
  if (normalized.includes("enquete") || normalized.includes("interesse") || normalized.includes("engajar")) return "poll";
  if (normalized.includes("carrossel") || normalized.includes("vitrine")) return "carousel";
  if (normalized.includes("status")) return "status";
  if (normalized.includes("audio")) return "audio";
  return "text";
}

function buildCampaignPreviewText(
  product: ClientSalesCatalogItem | null,
  objective: string,
  format: GrowthPlanItem["type"],
) {
  const normalized = normalizePreviewText(objective);

  if (format === "poll") {
    if (normalized.includes("interesse")) {
      return product
        ? `O que mais te faria considerar ${product.title} hoje?`
        : "Qual tipo de oferta voces teriam mais interesse hoje?";
    }

    return product
      ? `Qual desses pontos mais pesa pra voce quando escolhe ${product.title}?`
      : "Qual tema voces querem ver primeiro por aqui?";
  }

  if (format === "status") {
    return product
      ? `${product.title} passando por aqui hoje. Quem quiser entender se faz sentido, me chama.`
      : "Atualizacao rapida por aqui. Quem quiser saber mais, me chama.";
  }

  const name = product?.title ?? "produto selecionado";
  const price = product?.price ? ` por ${product.price} ${product.currency}` : "";
  const educational = normalized.includes("informar");

  if (educational) {
    return `${name} tem alguns detalhes que fazem diferenca no uso. Separei um resumo rapido pra ficar mais facil comparar${price}.`;
  }

  return `Separei ${name}${price} para quem esta procurando uma opcao direta hoje. Se fizer sentido, o botao ja deixa o caminho mais facil.`;
}

function buildCampaignPreviewPollChoices(products: ClientSalesCatalogItem[]) {
  const productChoices = products.slice(0, 3).map((product) => product.title.slice(0, 40));
  return productChoices.length >= 2 ? productChoices : ["Quero saber preco", "Quero indicacao", "Ver opcoes"];
}

function describeCampaignPreviewDestination(
  mode: CampaignDestinationMode,
  format: GrowthPlanItem["type"],
  selectedTargets: WhatsappTarget[],
) {
  if (format === "status" || mode === "status") return "status do agente";
  if (selectedTargets.length === 0) return mode === "channels" ? "selecione canais" : "selecione grupos";

  const groupCount = selectedTargets.filter((target) => target.type === "group").length;
  const channelCount = selectedTargets.filter((target) => target.type === "newsletter").length;
  return [
    groupCount ? `${groupCount} grupo(s)` : "",
    channelCount ? `${channelCount} canal(is)` : "",
  ].filter(Boolean).join(" e ");
}

function describeCampaignAutomationPlan(
  objective: string,
  format: GrowthPlanItem["type"],
  products: ClientSalesCatalogItem[],
  mode: CampaignDestinationMode,
) {
  const productText = products.length
    ? `usando ${products.length} produto(s) selecionado(s)`
    : "usando produtos ativos do catalogo";
  const normalized = normalizePreviewText(objective);

  if (format === "poll") {
    return normalized.includes("interesse")
      ? `A IA cria perguntas de interesse ${productText}, compara respostas e envia nos horarios da rotina.`
      : `A IA cria enquetes de conversa ${productText}, com opcoes curtas para o grupo votar.`;
  }

  if (format === "carousel") {
    return mode === "channels"
      ? `A IA monta uma vitrine para canal ${productText}, usa as midias do catalogo e conduz para compra.`
      : `A IA monta uma vitrine ${productText}, usa as midias do catalogo e conduz para o botao de compra.`;
  }

  if (format === "status") {
    return `A IA transforma ${productText} em posts de status para gerar respostas no privado.`;
  }

  if (format === "audio" || format === "text_audio") {
    return mode === "channels"
      ? `A IA escreve posts para canal ${productText} e gera audio quando esse formato estiver selecionado.`
      : `A IA escreve a copy ${productText} e gera audio com a voz configurada do agente.`;
  }

  if (normalized.includes("informar")) {
    return `A IA explica beneficios e contexto ${productText}, depois fecha com uma chamada de compra.`;
  }

  if (mode === "channels") {
    return `A IA cria posts de broadcast para canais ${productText}, com chamada para conversa ou compra.`;
  }

  return `A IA cria posts comerciais para grupos ${productText}, alternando ganchos conforme o objetivo escolhido.`;
}

function listCampaignDeliverySteps(
  format: GrowthPlanItem["type"],
  products: ClientSalesCatalogItem[],
  buttonEnabled: boolean,
) {
  const mediaCount = products.reduce((total, product) => total + product.media.length, 0);
  const hasMedia = mediaCount > 0;
  const textLabel = buttonEnabled && format !== "audio" ? "texto com botao" : "texto";

  if (format === "poll") return ["1 enquete"];
  if (format === "status") return [hasMedia ? "1 status com midia" : "1 status de texto"];
  if (format === "carousel") return ["1 carrossel", `${Math.max(1, Math.min(products.length || 1, 10))} card(s)`];
  if (format === "audio") return hasMedia ? ["1 audio", "midias em anexo"] : ["1 audio"];
  if (format === "text_audio") return hasMedia ? [textLabel, "1 audio", "midias extras se sobrarem"] : [textLabel, "1 audio"];
  return hasMedia ? [textLabel, buttonEnabled ? "imagem no botao quando possivel" : "midias em anexo"] : [textLabel];
}

function describeCampaignButtonDestination(
  format: GrowthPlanItem["type"],
  products: ClientSalesCatalogItem[],
  buttonEnabled: boolean,
  buttonLabel: string,
) {
  if (!buttonEnabled || format === "poll" || format === "status") return null;

  const label = buttonLabel.trim() || "Comprar agora";

  if (format === "audio") {
    return "audio puro nao leva botao; use Texto + audio para CTA clicavel.";
  }

  if (format === "carousel") {
    return `${label} abre o link de cada produto; se nao houver link externo, abre a pagina publica da ConnectyHub.`;
  }

  if (products.length > 0) {
    return `${label} abre o link do produto principal; se nao houver link externo, abre a pagina publica da ConnectyHub.`;
  }

  return `${label} vira resposta rapida quando nao houver produto ou link disponivel.`;
}

function describeCampaignProductUsage(format: GrowthPlanItem["type"], products: ClientSalesCatalogItem[]) {
  if (products.length === 0) return "a IA pode escolher produtos ativos do catalogo.";
  if (format === "carousel") return `${Math.min(products.length, 10)} produto(s) viram card(s) no carrossel.`;
  if (format === "poll") return "a IA usa os produtos como opcoes ou tema da enquete.";
  if (products.length === 1) return "o produto selecionado guia copy, midia e botao.";
  return "a IA distribui os produtos entre os posts; cada post usa um produto principal.";
}

function listCampaignPreviewBlockedRequirements(
  format: GrowthPlanItem["type"],
  behavior?: WhatsappOperationsState["behavior"],
  mode?: CampaignDestinationMode,
) {
  if (!behavior) return [];
  const requirements: string[] = [];

  if (format === "status" || mode === "status") {
    if (!behavior.statusBroadcasts) requirements.push("Status do agente");
  } else if (mode === "channels") {
    if (!behavior.newsletterBroadcasts) requirements.push("Campanhas em canais");
  } else if (!behavior.campaignBroadcasts) {
    requirements.push("Campanhas em grupos");
  }

  if ((format === "poll" || format === "carousel") && !behavior.interactiveMessages) {
    requirements.push("Interacoes");
  }

  return requirements;
}

function buildHistoryMetricPills(item: WhatsappHistoryItem) {
  const insights = item.outboundInsights;
  const pills: Array<{ label: string; value: string }> = [];

  if (insights) {
    if (insights.engagement.views !== null) pills.push({ label: "views", value: formatCompactNumber(insights.engagement.views) });
    if (insights.engagement.replies > 0) pills.push({ label: "respostas", value: formatCompactNumber(insights.engagement.replies) });
    if (insights.engagement.linkClicks > 0) pills.push({ label: "cliques", value: formatCompactNumber(insights.engagement.linkClicks) });
    const reactions = sumReactionCounts(insights.engagement.reactions);
    if (reactions > 0) pills.push({ label: "reacoes", value: formatCompactNumber(reactions) });
    if (insights.engagement.knownLeads > 0) pills.push({ label: "crm", value: formatCompactNumber(insights.engagement.knownLeads) });
  }

  if (item.campaignTracking) {
    pills.push({ label: "envios", value: `${formatCompactNumber(item.campaignTracking.sent)}/${formatCompactNumber(item.campaignTracking.total)}` });
    if (item.campaignTracking.failed > 0) pills.push({ label: "falhas", value: formatCompactNumber(item.campaignTracking.failed) });
  }

  return pills.length ? pills.slice(0, 5) : [{ label: "metricas", value: "abrir" }];
}

function sumReactionCounts(reactions: Record<string, number> | null | undefined) {
  return Object.values(reactions ?? {}).reduce((total, count) => total + Math.max(0, Number(count) || 0), 0);
}

function formatCompactNumber(value: number | null | undefined) {
  return Math.max(0, Number(value) || 0).toLocaleString("pt-BR");
}

function formatHistoryOperation(operation: string) {
  if (operation === "status") return "Status WhatsApp";
  if (operation === "target_poll") return "Enquete em grupo";
  if (operation === "target_carousel") return "Carrossel";
  if (operation === "newsletter_text") return "Canal WhatsApp";
  if (operation === "group_announce_mode") return "Janela de grupo";
  if (operation === "campaign_simple") return "Campanha em massa";
  return "Campanha WhatsApp";
}

function formatInsightSource(source: WhatsappOutboundInsightSample["source"]) {
  if (source === "target_chat") return "mensagem do grupo";
  if (source === "newsletter") return "canal";
  if (source === "click") return "clique";
  return "message/find";
}

function normalizePreviewText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
