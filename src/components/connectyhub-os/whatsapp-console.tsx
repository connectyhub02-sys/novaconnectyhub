"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AudioLines,
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  CircleHelp,
  Coffee,
  Copy,
  Clock3,
  Eye,
  FileText,
  Forward,
  Globe2,
  ImageIcon,
  KeyRound,
  Link2,
  Loader2,
  MessageCircle,
  MessageSquare,
  Mic,
  PenLine,
  PlugZap,
  Power,
  Plus,
  QrCode,
  RefreshCcw,
  Repeat,
  Send,
  ShieldCheck,
  Shuffle,
  Smartphone,
  Smile,
  Sticker,
  Timer,
  Trash2,
  type LucideIcon,
  UserRound,
  Video,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { NeonBadge, Panel, SectionHeader } from "./panel-primitives";
import { InfinityLoader } from "./infinity-loader";
import { useConnectyShellNotifications, type ConnectyShellNotification } from "./connecty-shell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  defaultWhatsappBehaviorConfig,
  defaultWhatsappCloneMemory,
  defaultWhatsappCloneProfile,
  normalizeWhatsappCloneMemory,
  normalizeWhatsappCloneProfile,
  normalizeWhatsappBehaviorConfig,
  type WhatsappBehaviorConfig,
  type WhatsappCloneMemory,
  type WhatsappCloneProfile,
  type WhatsappPresenceMode,
  type WhatsappQuoteReplyMode,
  type WhatsappRapportMode,
  type WhatsappResponseMode,
} from "@/lib/whatsapp/agent-behavior";
import {
  normalizeOrganizationLocations,
  type OrganizationLocation,
} from "@/lib/company-locations/shared";
import {
  agentPromptTemplates,
  buildAgentPromptFromTemplate,
  defaultAgentPromptTemplateId,
  isAgentPromptBuilderConfigEqual,
  normalizeAgentPromptBuilderConfig,
  type AgentPromptBuilderConfig,
  type AgentPromptTemplateId,
} from "@/lib/whatsapp/agent-prompt-templates";
import {
  defaultLeadQualificationConfig,
  isLeadQualificationConfigEqual,
  normalizeLeadQualificationConfig,
  type LeadQualificationConfig,
  type LeadQualificationQuestion,
} from "@/lib/leads/qualification";
import type { CloneHumanizationMetric } from "@/lib/whatsapp/clone-humanization";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import {
  agentChannelDefinitions,
  defaultAgentChannelConfig,
  normalizeAgentChannelConfig,
  type AgentChannelConfig,
  type AgentChannelConfigItem,
  type AgentChannelId,
} from "@/lib/agents/multichannel";
import type { PlanFeatureEntitlement } from "@/lib/billing/plan-entitlements";
import {
  metaFeatureComingSoonMessage,
  metaFeatureComingSoonTitle,
  metaFeatureLaunchPaused,
} from "@/lib/meta/launch-status";
import { cn } from "@/lib/utils";

type WhatsappStatus = "draft" | "qr_pending" | "connected" | "disconnected" | "blocked" | "error" | "archived";
type ConnectionMode = "qr" | "phone";
type ConnectionFinalStatus = "pending" | "success" | "passkey_blocked" | "qr_timeout" | "disconnected" | "provider_error" | "reset" | "unknown";
type AgentAutomationRoleKey = "signup_whatsapp_verification" | "trial_welcome" | "trial_conversion";
type AgentAutomationRoles = Record<AgentAutomationRoleKey, boolean>;
type ConnectionEventType =
  | "connect_requested"
  | "connect_response"
  | "qr_received"
  | "qr_updated"
  | "pair_code_received"
  | "pair_code_updated"
  | "status_poll"
  | "status_connected"
  | "status_disconnected"
  | "passkey_blocked"
  | "timeout"
  | "provider_error"
  | "reset_requested";

type ConnectionDiagnosticEvent = {
  type: ConnectionEventType;
  at: string;
  providerStatus: number | null;
  status: string | null;
  connected: boolean | null;
  loggedIn: boolean | null;
  hasQrCode: boolean;
  qrCodeLength: number | null;
  hasPairCode: boolean;
  pairCodeLength: number | null;
  lastDisconnectReason: string | null;
  message: string | null;
};

type ConnectionAttemptDiagnostic = {
  id: string;
  mode: ConnectionMode;
  phonePreview: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  finalStatus: ConnectionFinalStatus;
  finalReason: string | null;
  lastDisconnectReason: string | null;
  qrReceivedCount: number;
  pairCodeReceivedCount: number;
  statusPollCount: number;
  scanDetected: boolean | null;
  events: ConnectionDiagnosticEvent[];
};

type ConnectionDiagnostics = {
  activeAttemptId: string | null;
  latestAttempt: ConnectionAttemptDiagnostic | null;
  attempts: ConnectionAttemptDiagnostic[];
};

type MigrationCredentialKind = "serverUrl" | "instanceToken";

const PASSKEY_CONNECTION_HELP_TEXT =
  "Esta conta pediu uma verificacao extra por chave de acesso. Esse tipo de verificacao ainda nao pode ser concluido diretamente pelo QR Code do painel.";
const PASSKEY_CONNECTION_ASSISTED_TEXT =
  "Se o reset nao resolver, sera necessario usar uma conexao assistida por migracao de sessao.";
const PASSKEY_CONNECTION_REASON_TEXT =
  "Conta pediu verificacao por chave de acesso durante a leitura do QR.";
const PASSKEY_MIGRATION_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/cdjfbjfolpeenlmanmkoglhhcjfgcbpp";
type RuntimeAlert = {
  id: string;
  kind: "internal_instance_block";
  tone: "warning";
  title: string;
  message: string;
  runId: string;
  conversationId: string | null;
  whatsappInstanceId: string | null;
  providerChatId: string | null;
  phoneNumber: string | null;
  occurredAt: string | null;
  inputPreview: string | null;
  outputSummary: string | null;
};

type ClientCompany = {
  id: string;
  name: string;
  slug: string | null;
  planCode: string;
  status: string;
  role: string;
  createdAt: string | null;
};

type CompanyLocationDraft = {
  id: string | null;
  label: string;
  address: string;
  cep: string;
  city: string;
  region: string;
  mapsUrl: string;
  latitude: string;
  longitude: string;
  isPrimary: boolean;
  notes: string;
};

type ClientWhatsappAgent = {
  id: string;
  companyId: string;
  companyName: string;
  sectorCode: string;
  sectorName: string;
  agentCode: string;
  name: string;
  personaName: string;
  roleTitle: string;
  description: string | null;
  prompt: string;
  promptTemplateConfig?: AgentPromptBuilderConfig;
  status: string;
  autonomyLevel: number;
  updatedAt: string | null;
  createdAt: string | null;
};

type WhatsappState = {
  companies: ClientCompany[];
  agents?: ClientWhatsappAgent[];
  selectedCompanyId: string | null;
  selectedAgentId: string | null;
  instance: {
    id: string;
    provider: "uazapi";
    status: WhatsappStatus;
    phoneNumber: string | null;
    displayName: string | null;
    profileImageUrl: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
    lastSyncedAt: string | null;
    lastHeartbeatAt: string | null;
    lastMessageAt: string | null;
    tokenReady: boolean;
    connectionDiagnostics: ConnectionDiagnostics;
  } | null;
  agent: {
    id: string;
    companyId?: string;
    sectorCode?: string | null;
    sectorName?: string | null;
    name: string;
    avatarUrl: string | null;
    avatarAlt: string | null;
    roleTitle?: string | null;
    description?: string | null;
    status?: string | null;
    prompt: string;
    promptPreview: string;
    promptTemplateConfig?: AgentPromptBuilderConfig;
    cloneProfile?: WhatsappCloneProfile;
    cloneMemory?: WhatsappCloneMemory;
    cloneProfileImport?: CloneProfileImportStatus;
    qualification?: LeadQualificationConfig;
    channelConfig?: AgentChannelConfig;
    automationRoles?: AgentAutomationRoles;
    updatedAt: string | null;
  } | null;
  globalAgent: {
    id: string;
    name: string;
    prompt: string;
    promptPreview: string;
    updatedAt: string | null;
  };
  behavior: WhatsappBehaviorConfig;
  audio: {
    configured: boolean;
    defaultVoiceId: string | null;
    defaultModelId: string | null;
    outputFormat: string | null;
    voices: AudioVoiceOption[];
    errorMessage: string | null;
  };
  knowledge: {
    files: KnowledgeFile[];
  };
  linkButtons: TrackedLinkButton[];
  companyLocations?: OrganizationLocation[];
  salesCatalog: ClientSalesCatalogItem[];
  cloneTest?: CloneRealTestSummary;
  runtimeAlerts: RuntimeAlert[];
  capability: {
    canConnect: boolean;
    schemaReady: boolean;
    message: string | null;
    metaSocialChannels: PlanFeatureEntitlement;
  };
};

type KnowledgeFile = {
  id: string;
  title: string;
  fileName: string;
  contentType: string | null;
  size: number | null;
  storageUrl: string | null;
  createdAt: string | null;
};

type TrackedLinkButton = {
  id: string;
  label: string;
  url: string;
  tag: string;
  trackingUrl: string;
  clicks: number;
  createdAt: string | null;
};

type CloneRealTestEvent = {
  id: string;
  title: string;
  summary: string;
  score: number | null;
  humanizationScore: number | null;
  humanizationMetrics: CloneHumanizationMetric[];
  reviewFlags: string[];
  outboundMessages: number;
  outboundModes: string[];
  linkCount: number;
  usedSharedCompanyContext: boolean;
  cloneProfileEnabled: boolean;
  createdAt: string | null;
};

type CloneRealTestSummary = {
  total: number;
  averageScore: number | null;
  lastScore: number | null;
  reviewCount: number;
  lastEventAt: string | null;
  events: CloneRealTestEvent[];
};

type AudioVoiceOption = {
  voiceId: string;
  name: string;
  source: "platform" | "customer" | "elevenlabs" | "library" | "gemini";
  previewUrl: string | null;
  category: string | null;
  status: string | null;
  publicOwnerId: string | null;
  language: string | null;
  accent: string | null;
  gender: string | null;
  useCase: string | null;
  defaultForAgents: boolean;
  isDefault: boolean;
};

type CloneProfileImportStatus = {
  status: "idle" | "queued" | "running" | "succeeded" | "failed";
  source: "uazapi_history";
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  requestedBy: string | null;
  sampledChats: number;
  sampledMessages: number;
  outboundSamples: number;
  error: string | null;
};

type ActionResponse = {
  state: WhatsappState;
  notice?: {
    tone: "success" | "warning" | "error";
    message: string;
  };
  qrCode?: string | null;
  pairCode?: string | null;
  error?: string;
};

type MigrationCredentialResponse = {
  value?: string;
  notice?: Notice;
  error?: string;
};

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

type ControlTone = "cyan" | "emerald" | "sky" | "violet" | "amber" | "rose" | "fuchsia" | "slate";

type ControlToneStyle = {
  color: string;
  rgb: string;
};

const controlToneStyles: Record<ControlTone, ControlToneStyle> = {
  cyan: { color: "#1877f2", rgb: "24,119,242" },
  emerald: { color: "#128c7e", rgb: "18,140,126" },
  sky: { color: "#0284c7", rgb: "2,132,199" },
  violet: { color: "#4f46e5", rgb: "79,70,229" },
  amber: { color: "#b45309", rgb: "180,83,9" },
  rose: { color: "#dc2626", rgb: "220,38,38" },
  fuchsia: { color: "#4f46e5", rgb: "79,70,229" },
  slate: { color: "#64748b", rgb: "100,116,139" },
};

export type WhatsappConsoleTab = "connection" | "prompt" | "qualification" | "behavior" | "channels" | "files";

type WhatsappConsoleVariant = {
  entityIdKey: "companyId" | "sectorId";
  entitySingular: string;
  entityPlural: string;
  entityPromptToken: string;
  entityPromptLabel: string;
  entityPromptDescription: string;
  sectionEyebrow: string;
  missingEntityTitle: string;
  missingEntityDescription: string;
  missingEntityHref: string;
  missingEntityAction: string;
  agentGateEyebrow: string;
  agentGateTitle: string;
  agentGateDescription: string;
  agentGateSelectedLabel: string;
  agentGateSelectLabel: string;
  agentGateSideDescription: string;
  agentRoleTitle: string;
  noAgentPrompt: string;
  headerDescriptions: {
    missingEntity: string;
    needsAgent: string;
    ready: string;
  };
  endpoints: {
    state: string;
    action: string;
    createAgent: string;
    knowledge: string;
    links: string;
    channels: string;
    voices: string;
    promptAssistant?: string;
  };
  connectionEnabled: boolean;
  connectionDisabledReason?: string;
  voiceCloneEnabled: boolean;
  hiddenTabs?: WhatsappConsoleTab[];
};

type VoiceCloneResponse = {
  audio?: WhatsappState["audio"];
  voice?: {
    voiceId: string;
    name: string;
    status: string;
    requiresVerification: boolean;
  };
  notice?: Notice;
  error?: string;
};

const agentPromptMaxLength = 8000;
const agentNameMaxLength = 80;

function normalizeEditableAgentName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

const clientWhatsappConsoleVariant = {
  entityIdKey: "companyId",
  entitySingular: "empresa",
  entityPlural: "empresas",
  entityPromptToken: "{{empresa}}",
  entityPromptLabel: "Empresa",
  entityPromptDescription: "Usa o nome da empresa cadastrada no painel.",
  sectionEyebrow: "Agentes / WhatsApp comercial",
  missingEntityTitle: "Cadastre uma empresa primeiro",
  missingEntityDescription: "O agente precisa estar vinculado a uma empresa para atender os leads certos.",
  missingEntityHref: "/dashboard/empresa",
  missingEntityAction: "Cadastrar empresa",
  agentGateEyebrow: "empresa / agente",
  agentGateTitle: "Nenhum agente criado",
  agentGateDescription: "Escolha qual empresa este agente vai atender antes de liberar conexao, prompt e comportamento.",
  agentGateSelectedLabel: "Empresa selecionada",
  agentGateSelectLabel: "Empresa",
  agentGateSideDescription: "Depois que o agente for criado, esta tela abre os controles de WhatsApp.",
  agentRoleTitle: "Agente de WhatsApp",
  noAgentPrompt: "Crie o agente para liberar prompt, conexao e comportamento.",
  headerDescriptions: {
    missingEntity: "Cadastre uma empresa antes de configurar WhatsApp e agentes.",
    needsAgent: "Escolha uma empresa cadastrada e crie o agente que vai atender os leads.",
    ready: "Conecte o numero da empresa, ajuste o prompt e escolha como o agente deve atender no WhatsApp.",
  },
  endpoints: {
    state: "/api/dashboard/whatsapp",
    action: "/api/dashboard/whatsapp",
    createAgent: "/api/dashboard/agents",
    knowledge: "/api/dashboard/knowledge",
    links: "/api/dashboard/whatsapp/links",
    channels: "/api/dashboard/whatsapp/channels",
    voices: "/api/dashboard/voices",
    promptAssistant: "/api/dashboard/whatsapp/prompt-assistant",
  },
  connectionEnabled: true,
  voiceCloneEnabled: true,
} satisfies WhatsappConsoleVariant;

export const adminWhatsappConsoleVariant = {
  entityIdKey: "sectorId",
  entitySingular: "setor",
  entityPlural: "setores",
  entityPromptToken: "{{setor}}",
  entityPromptLabel: "Setor",
  entityPromptDescription: "Usa o nome do setor interno cadastrado no Admin OS.",
  sectionEyebrow: "Admin OS / WhatsApp interno",
  missingEntityTitle: "Cadastre um setor primeiro",
  missingEntityDescription: "O agente interno da ConnectyHub precisa estar vinculado a um setor, do mesmo jeito que o agente do cliente fica vinculado a uma empresa.",
  missingEntityHref: "/admin/setores",
  missingEntityAction: "Cadastrar setor",
  agentGateEyebrow: "setor / agente",
  agentGateTitle: "Nenhum agente interno criado",
  agentGateDescription: "Escolha qual setor da ConnectyHub este agente vai atender antes de liberar prompt, arquivos, links, voz e comportamento.",
  agentGateSelectedLabel: "Setor selecionado",
  agentGateSelectLabel: "Setor",
  agentGateSideDescription: "Depois que o agente for criado, esta tela abre os mesmos controles do WhatsApp do painel do usuario.",
  agentRoleTitle: "Agente WhatsApp da ConnectyHub",
  noAgentPrompt: "Crie o agente do setor para liberar prompt, arquivos, links, voz e comportamento.",
  headerDescriptions: {
    missingEntity: "Cadastre um setor antes de configurar os agentes WhatsApp internos.",
    needsAgent: "Escolha um setor cadastrado e crie o agente que vai atender os leads da ConnectyHub.",
    ready: "Ajuste prompt, arquivos, links, voz e comportamento do agente WhatsApp interno por setor.",
  },
  endpoints: {
    state: "/api/admin/whatsapp/internal",
    action: "/api/admin/whatsapp/internal",
    createAgent: "/api/admin/whatsapp/internal",
    knowledge: "/api/admin/whatsapp/internal/knowledge",
    links: "/api/admin/whatsapp/internal/links",
    channels: "/api/admin/whatsapp/internal/channels",
    voices: "/api/admin/whatsapp/internal/voices",
    promptAssistant: "/api/admin/whatsapp/internal/prompt-assistant",
  },
  connectionEnabled: true,
  connectionDisabledReason: "Crie o agente do setor antes de conectar o WhatsApp interno.",
  voiceCloneEnabled: true,
} satisfies WhatsappConsoleVariant;

export function WhatsAppConsole({
  initialTab = "connection",
  variant = clientWhatsappConsoleVariant,
}: {
  initialTab?: WhatsappConsoleTab;
  variant?: WhatsappConsoleVariant;
}) {
  const shellNotifications = useConnectyShellNotifications();
  const [state, setState] = useState<WhatsappState | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [metaComingSoonChannel, setMetaComingSoonChannel] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState<ConnectionMode>("qr");
  const [connectPhone, setConnectPhone] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  const [selectedAgentNameDraft, setSelectedAgentNameDraft] = useState("");
  const [promptTemplateDraft, setPromptTemplateDraft] = useState<AgentPromptBuilderConfig>(() => normalizeAgentPromptBuilderConfig(null));
  const [promptAssistantRunning, setPromptAssistantRunning] = useState(false);
  const [behaviorDraft, setBehaviorDraft] = useState<WhatsappBehaviorConfig>(defaultWhatsappBehaviorConfig);
  const [companyLocationDrafts, setCompanyLocationDrafts] = useState<CompanyLocationDraft[]>(() => [createEmptyCompanyLocationDraft()]);
  const [cloneProfileDraft, setCloneProfileDraft] = useState<WhatsappCloneProfile>(defaultWhatsappCloneProfile);
  const [qualificationDraft, setQualificationDraft] = useState<LeadQualificationConfig>(defaultLeadQualificationConfig);
  const [channelConfigDraft, setChannelConfigDraft] = useState<AgentChannelConfig>(defaultAgentChannelConfig);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentSectorName, setAgentSectorName] = useState(agentPromptTemplates[0].sectorName);
  const [agentTemplateId, setAgentTemplateId] = useState<AgentPromptTemplateId>(defaultAgentPromptTemplateId);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [showInternalAgentForm, setShowInternalAgentForm] = useState(false);
  const [internalSectorName, setInternalSectorName] = useState("");
  const [internalSectorDescription, setInternalSectorDescription] = useState("");
  const [internalAgentName, setInternalAgentName] = useState("");
  const [creatingInternalAgent, setCreatingInternalAgent] = useState(false);
  const [showInternalAgentEdit, setShowInternalAgentEdit] = useState(false);
  const [editingInternalAgent, setEditingInternalAgent] = useState(false);
  const [archivingInternalAgent, setArchivingInternalAgent] = useState(false);
  const [internalEditName, setInternalEditName] = useState("");
  const [internalEditPersonaName, setInternalEditPersonaName] = useState("");
  const [internalEditRoleTitle, setInternalEditRoleTitle] = useState("");
  const [internalEditDescription, setInternalEditDescription] = useState("");
  const [internalEditAutomationRoles, setInternalEditAutomationRoles] = useState<AgentAutomationRoles>(createEmptyAgentAutomationRoles());
  const [knowledgeUploading, setKnowledgeUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<WhatsappConsoleTab>(initialTab);
  const visibleWhatsappTabs = useMemo(
    () => whatsappConsoleTabs.filter((tab) => !variant.hiddenTabs?.includes(tab.id)),
    [variant.hiddenTabs],
  );
  const activeWhatsappTab = visibleWhatsappTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : visibleWhatsappTabs[0]?.id ?? "connection";
  const [migrationCopying, setMigrationCopying] = useState<MigrationCredentialKind | null>(null);
  const cloneProfileImportBaselineRef = useRef<string | null>(null);
  const appliedCloneProfileImportRef = useRef<string | null>(null);
  const isAwaitingConnection = Boolean(qrCode || pairCode) || state?.instance?.status === "qr_pending";
  const isConnected = state?.instance?.status === "connected";
  const canManageInternalAgents = variant.entityIdKey === "sectorId";
  const selectedWhatsappEntityId = canManageInternalAgents ? selectedCompanyId : selectedAgentId;
  const whatsappActionPayload = useMemo(
    () => canManageInternalAgents
      ? { [variant.entityIdKey]: selectedCompanyId }
      : { companyId: selectedCompanyId, agentId: selectedAgentId },
    [canManageInternalAgents, selectedAgentId, selectedCompanyId, variant.entityIdKey],
  );
  const runtimeAlertNotifications = useMemo(
    () => buildRuntimeAlertNotifications(state?.runtimeAlerts ?? []),
    [state?.runtimeAlerts],
  );

  useEffect(() => {
    shellNotifications?.setNotificationGroup("whatsapp-runtime-alerts", runtimeAlertNotifications);

    return () => {
      shellNotifications?.clearNotificationGroup("whatsapp-runtime-alerts");
    };
  }, [runtimeAlertNotifications, shellNotifications]);

  const applyWhatsappState = useCallback((nextState: WhatsappState, options?: { preserveDrafts?: boolean }) => {
    const nextAgents = nextState.agents ?? [];
    const nextAgentId = nextState.selectedAgentId ?? nextState.agent?.id ?? nextAgents[0]?.id ?? "";
    const nextAgent = nextAgents.find((agent) => agent.id === nextAgentId);
    const nextCompanyId = nextState.selectedCompanyId ?? nextAgent?.companyId ?? nextState.agent?.companyId ?? nextState.companies[0]?.id ?? "";

    setState(nextState);
    setSelectedCompanyId(nextCompanyId);
    setSelectedAgentId(nextAgentId);

    if (!options?.preserveDrafts) {
      const nextPrompt = nextState.agent?.prompt ?? "";
      const nextPromptTemplateConfig = normalizeAgentPromptBuilderConfig(nextState.agent?.promptTemplateConfig);

      setPromptDraft(nextPrompt);
      setSelectedAgentNameDraft(nextState.agent?.name ?? "");
      setPromptTemplateDraft(nextPromptTemplateConfig);
      setAgentTemplateId(nextPromptTemplateConfig.templateId);
      const nextBehavior = normalizeWhatsappBehaviorConfig(nextState.behavior);
      setBehaviorDraft(nextBehavior);
      setCompanyLocationDrafts(toCompanyLocationDrafts(nextState.companyLocations ?? []));
      setCloneProfileDraft(normalizeWhatsappCloneProfile(nextState.agent?.cloneProfile));
      setChannelConfigDraft(normalizeAgentChannelConfig(nextState.agent?.channelConfig));
      setQualificationDraft(normalizeLeadQualificationConfig(nextState.agent?.qualification));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const nextState = await fetchWhatsappState(variant);

      if (!cancelled) {
        applyWhatsappState(nextState);
        if (nextState.capability.message) {
          setNotice({ tone: "warning", message: nextState.capability.message });
        }
        setLoading(false);
      }
    }

    load().catch((error: unknown) => {
      if (!cancelled) {
        setNotice({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel carregar o WhatsApp." });
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [applyWhatsappState, variant]);

  useEffect(() => {
    const importStatus = state?.agent?.cloneProfileImport;
    const completedAt = importStatus?.completedAt;

    if (importStatus?.status !== "succeeded" || !completedAt || appliedCloneProfileImportRef.current === completedAt) {
      return;
    }

    const currentDraftSnapshot = JSON.stringify(normalizeWhatsappCloneProfile(cloneProfileDraft));
    const baselineSnapshot = cloneProfileImportBaselineRef.current;

    if (!baselineSnapshot || baselineSnapshot === currentDraftSnapshot) {
      setCloneProfileDraft(normalizeWhatsappCloneProfile(state?.agent?.cloneProfile));
      cloneProfileImportBaselineRef.current = null;
    }

    appliedCloneProfileImportRef.current = completedAt;
  }, [cloneProfileDraft, state?.agent?.cloneProfile, state?.agent?.cloneProfileImport]);

  useEffect(() => {
    if (!selectedWhatsappEntityId || !isAwaitingConnection || running === "disconnect") {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function pollStatus() {
      attempts += 1;

      try {
        const response = await fetch(variant.endpoints.action, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh_status", ...whatsappActionPayload }),
        });
        const data = (await response.json().catch(() => null)) as ActionResponse | null;

        if (!cancelled && response.ok && data?.state) {
          applyWhatsappState(data.state, { preserveDrafts: true });

          if (data.state.instance?.status === "connected") {
            setQrCode(null);
            setPairCode(null);
            setNotice({ tone: "success", message: "WhatsApp conectado. Foto e status sincronizados." });
            return;
          }

          const latestAttempt = data.state.instance?.connectionDiagnostics?.latestAttempt ?? null;
          const attemptFinished = Boolean(latestAttempt && latestAttempt.finalStatus !== "pending");
          const hasActiveArtifact = Boolean(data.qrCode || data.pairCode);

          if (attemptFinished || (data.state.instance?.status !== "qr_pending" && !hasActiveArtifact)) {
            setQrCode(null);
            setPairCode(null);
            if (data.notice) {
              setNotice(data.notice);
            }
          } else {
            const responsePairCode = data.pairCode ?? null;
            const responseQrCode = data.qrCode ?? null;
            const pollingPhoneMode = latestAttempt?.mode === "phone" || Boolean(responsePairCode);

            setQrCode((current) => pollingPhoneMode ? null : responseQrCode ?? current);
            setPairCode((current) => responsePairCode ?? current);
          }
        }
      } catch {
        // Mantem o polling silencioso; o botao Status continua disponivel para acao manual.
      }

      if (!cancelled && attempts < 60) {
        timeoutId = setTimeout(pollStatus, attempts < 10 ? 3000 : 6000);
      }
    }

    timeoutId = setTimeout(pollStatus, 2500);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [applyWhatsappState, isAwaitingConnection, running, selectedWhatsappEntityId, variant.endpoints.action, whatsappActionPayload]);

  useEffect(() => {
    if (!selectedWhatsappEntityId || !isConnected || running === "disconnect") {
      return;
    }

    let cancelled = false;

    async function pollConnectedStatus() {
      try {
        const response = await fetch(variant.endpoints.action, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh_status", ...whatsappActionPayload }),
        });
        const data = (await response.json().catch(() => null)) as ActionResponse | null;

        if (!cancelled && response.ok && data?.state) {
          applyWhatsappState(data.state, { preserveDrafts: true });

          if (data.state.instance?.status !== "connected") {
            setQrCode(null);
            setPairCode(null);
            setNotice(data.notice ?? { tone: "warning", message: "WhatsApp desconectado. Gere um novo QR Code para reconectar." });
          }
        }
      } catch {
        // A checagem automatica nao deve atrapalhar o uso da tela; o botao Status segue manual.
      }
    }

    const timeoutId = setTimeout(pollConnectedStatus, 4000);
    const intervalId = setInterval(pollConnectedStatus, 15000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [applyWhatsappState, isConnected, running, selectedWhatsappEntityId, variant.endpoints.action, whatsappActionPayload]);

  const selectedAgentNameNormalized = normalizeEditableAgentName(selectedAgentNameDraft);
  const canEditSelectedAgentName = !canManageInternalAgents && Boolean(state?.agent);
  const agentNameChanged = canEditSelectedAgentName && state?.agent
    ? selectedAgentNameNormalized !== normalizeEditableAgentName(state.agent.name)
    : false;
  const agentNameInvalid = canEditSelectedAgentName
    ? selectedAgentNameNormalized.length < 2 || selectedAgentNameNormalized.length > agentNameMaxLength
    : false;
  const promptChanged = state?.agent ? promptDraft.trim() !== state.agent.prompt.trim() : false;
  const promptTooLong = promptDraft.length > agentPromptMaxLength;
  const promptTemplateChanged = state?.agent
    ? !isAgentPromptBuilderConfigEqual(promptTemplateDraft, normalizeAgentPromptBuilderConfig(state.agent.promptTemplateConfig))
    : false;
  const behaviorChanged = state ? !isBehaviorEqual(behaviorDraft, state.behavior) : false;
  const companyLocationsChanged = state ? !isCompanyLocationDraftsEqual(companyLocationDrafts, state.companyLocations ?? []) : false;
  const cloneProfileChanged = state?.agent
    ? !isCloneProfileEqual(cloneProfileDraft, normalizeWhatsappCloneProfile(state.agent.cloneProfile))
    : false;
  const qualificationChanged = state?.agent
    ? !isLeadQualificationConfigEqual(qualificationDraft, normalizeLeadQualificationConfig(state.agent.qualification))
    : false;
  const channelConfigChanged = state?.agent
    ? !isAgentChannelConfigEqual(channelConfigDraft, normalizeAgentChannelConfig(state.agent.channelConfig))
    : false;
  const settingsChanged = agentNameChanged || promptChanged || promptTemplateChanged || behaviorChanged || companyLocationsChanged || cloneProfileChanged || qualificationChanged || channelConfigChanged;
  const companies = state?.companies ?? [];
  const agents = state?.agents ?? [];
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? companies[0] ?? null;
  const needsCompany = !loading && companies.length === 0;
  const needsAgent = !loading && companies.length > 0 && !state?.agent;
  const headerTitle = loading || (needsCompany && !canManageInternalAgents) ? "Agentes" : needsAgent || (needsCompany && canManageInternalAgents) ? "Criar agente WhatsApp" : "Conexao, prompt e comportamento";
  const headerDescription = loading || needsCompany
    ? variant.headerDescriptions.missingEntity
    : needsAgent
      ? variant.headerDescriptions.needsAgent
      : variant.headerDescriptions.ready;
  const promptHelper = `${promptDraft.length.toLocaleString("pt-BR")} / ${agentPromptMaxLength.toLocaleString("pt-BR")} caracteres`;

  function updateBehavior<K extends keyof WhatsappBehaviorConfig>(key: K, value: WhatsappBehaviorConfig[K]) {
    setBehaviorDraft((current) => normalizeWhatsappBehaviorConfig({ ...current, [key]: value }));
  }

  function updateCompanyLocationDraft(index: number, patch: Partial<CompanyLocationDraft>) {
    setCompanyLocationDrafts((current) => current.map((location, locationIndex) => (
      locationIndex === index ? { ...location, ...patch } : location
    )));
  }

  function addCompanyLocationDraft() {
    setCompanyLocationDrafts((current) => [
      ...current,
      {
        ...createEmptyCompanyLocationDraft(),
        label: `Unidade ${current.length + 1}`,
        isPrimary: current.length === 0,
      },
    ]);
  }

  function removeCompanyLocationDraft(index: number) {
    setCompanyLocationDrafts((current) => {
      const next = current.filter((_, locationIndex) => locationIndex !== index);
      const fallback = next.length > 0 ? next : [createEmptyCompanyLocationDraft()];

      return fallback.some((location) => location.isPrimary)
        ? fallback
        : fallback.map((location, locationIndex) => ({ ...location, isPrimary: locationIndex === 0 }));
    });
  }

  function markCompanyLocationPrimary(index: number) {
    setCompanyLocationDrafts((current) => current.map((location, locationIndex) => ({
      ...location,
      isPrimary: locationIndex === index,
    })));
  }

  function updateAgentChannelConfig(channelId: AgentChannelId, patch: Partial<AgentChannelConfigItem>) {
    setChannelConfigDraft((current) => {
      const normalized = normalizeAgentChannelConfig(current);
      const currentChannel = normalized.channels[channelId];

      return normalizeAgentChannelConfig({
        ...normalized,
        channels: {
          ...normalized.channels,
          [channelId]: {
            ...currentChannel,
            ...patch,
            enabled: channelId === "whatsapp" ? true : patch.enabled ?? currentChannel.enabled,
          },
        },
      });
    });
  }

  function openMetaChannelsComingSoon(channelLabel: string) {
    setMetaComingSoonChannel(channelLabel);
    setNotice({ tone: "warning", message: metaFeatureComingSoonMessage });
  }

  function handleWhatsappTabChange(tab: WhatsappConsoleTab) {
    if (metaFeatureLaunchPaused && tab === "channels") {
      openMetaChannelsComingSoon("Redes sociais");
      return;
    }

    setActiveTab(tab);
  }

  function updatePresenceMode(value: WhatsappPresenceMode) {
    setBehaviorDraft((current) => normalizeWhatsappBehaviorConfig({ ...current, presenceMode: value, alwaysOnline: value === "always" }));
  }

  function updateQuoteReplyMode(value: WhatsappQuoteReplyMode) {
    setBehaviorDraft((current) => normalizeWhatsappBehaviorConfig({ ...current, quoteReplyMode: value, quotedReplyContext: value !== "off" }));
  }

  function updatePromptDraft(value: string) {
    setPromptDraft(value.slice(0, agentPromptMaxLength));
  }

  function updateNewAgentTemplate(templateId: string) {
    const template = agentPromptTemplates.find((item) => item.id === templateId) ?? agentPromptTemplates[0];

    setAgentTemplateId(template.id);
    setAgentSectorName(template.sectorName);
  }

  function updatePromptTemplateDraft(patch: Partial<AgentPromptBuilderConfig>) {
    setPromptTemplateDraft((current) => {
      const nextTemplateId = patch.templateId ?? current.templateId;
      const templateChanged = patch.templateId && patch.templateId !== current.templateId;
      const template = agentPromptTemplates.find((item) => item.id === nextTemplateId);

      return normalizeAgentPromptBuilderConfig({
        ...current,
        ...(templateChanged && template
          ? {
              tone: template.defaultTone,
              objective: template.defaultObjective,
              audience: template.defaultAudience,
              salesRules: template.salesPlaybook.join("\n"),
              neverRules: template.careRules.join("\n"),
            }
          : {}),
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  function generatePromptFromTemplate() {
    if (!state?.agent) {
      setNotice({ tone: "warning", message: "Crie ou escolha um agente antes de gerar o prompt." });
      return;
    }

    const nextPrompt = buildAgentPromptFromTemplate({
      config: promptTemplateDraft,
      companyName: selectedCompany?.name ?? state.agent.companyId ?? "Empresa",
      agentName: state.agent.name,
      productCount: state.salesCatalog.length,
      knowledgeFileCount: state.knowledge.files.length,
    }).slice(0, agentPromptMaxLength);

    setPromptDraft(nextPrompt);
    setNotice({ tone: "success", message: "Prompt gerado pelo modelo. Revise e clique em Salvar alteracoes." });
  }

  async function improveCompanyComplementWithAi() {
    const endpoint = variant.endpoints.promptAssistant;
    const notes = promptTemplateDraft.companyComplement.trim();

    if (!endpoint) {
      setNotice({ tone: "warning", message: "Assistente de prompt indisponivel nesta tela." });
      return;
    }

    if (!selectedCompanyId) {
      setNotice({ tone: "warning", message: `Escolha uma ${variant.entitySingular} antes de melhorar com IA.` });
      return;
    }

    if (notes.length < 12) {
      setNotice({ tone: "warning", message: "Escreva um complemento sobre a empresa antes de pedir melhoria com IA." });
      return;
    }

    setPromptAssistantRunning(true);
    setNotice(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "company_context",
          [variant.entityIdKey]: selectedCompanyId,
          companyId: selectedCompanyId,
          notes,
          templateId: promptTemplateDraft.templateId,
        }),
      });
      const data = (await response.json().catch(() => null)) as { text?: string; prompt?: string; error?: string } | null;
      const improved = data?.text ?? data?.prompt ?? "";

      if (!response.ok || !improved) {
        throw new Error(data?.error ?? "Nao foi possivel melhorar o complemento.");
      }

      updatePromptTemplateDraft({ companyComplement: improved });
      setNotice({ tone: "success", message: "Complemento melhorado com IA e cobrado nos creditos da empresa. Gere o prompt para aplicar." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao melhorar complemento com IA." });
    } finally {
      setPromptAssistantRunning(false);
    }
  }

  function updateCloneProfileDraft(value: Partial<WhatsappCloneProfile>) {
    setCloneProfileDraft((current) => normalizeWhatsappCloneProfile({ ...current, ...value }));
  }

  async function generateCloneProfileFromHistory() {
    if (!state?.instance?.tokenReady) {
      setNotice({ tone: "warning", message: "Conecte ou reconecte o WhatsApp deste agente antes de gerar o DNA pelo historico." });
      return;
    }

    cloneProfileImportBaselineRef.current = JSON.stringify(normalizeWhatsappCloneProfile(cloneProfileDraft));
    await runAction("generate_clone_profile_from_history");
  }

  function updateQualificationDraft(value: Partial<LeadQualificationConfig>) {
    setQualificationDraft((current) => normalizeLeadQualificationConfig({ ...current, ...value }));
  }

  function updateQualificationQuestion(id: string, value: Partial<LeadQualificationQuestion>) {
    setQualificationDraft((current) =>
      normalizeLeadQualificationConfig({
        ...current,
        questions: current.questions.map((question) => question.id === id ? { ...question, ...value } : question),
      }),
    );
  }

  function addQualificationQuestion() {
    const nextIndex = qualificationDraft.questions.length + 1;

    setQualificationDraft((current) =>
      normalizeLeadQualificationConfig({
        ...current,
        questions: [
          ...current.questions,
          {
            id: `custom_${Date.now().toString(36)}`,
            label: `Pergunta ${nextIndex}`,
            question: "Qual informacao precisamos confirmar para saber se este lead esta pronto para comprar?",
            crmField: `campo_${nextIndex}`,
            weight: 10,
            required: false,
          },
        ],
      }),
    );
  }

  function removeQualificationQuestion(id: string) {
    setQualificationDraft((current) =>
      normalizeLeadQualificationConfig({
        ...current,
        questions: current.questions.filter((question) => question.id !== id),
      }),
    );
  }

  function selectAudioVoice(voice: AudioVoiceOption) {
    setBehaviorDraft((current) =>
      normalizeWhatsappBehaviorConfig({
        ...current,
        responseMode: "audio",
        splitMessages: true,
        audioVoiceId: voice.isDefault ? "" : voice.voiceId,
        audioVoiceName: voice.name,
        audioVoiceSource: voice.source,
        audioVoicePublicOwnerId: voice.publicOwnerId ?? "",
        audioModelId: "",
      }),
    );
  }

  function applyClonedVoice(audio: WhatsappState["audio"], voiceId: string, nextNotice?: Notice) {
    setState((current) => (current ? { ...current, audio } : current));

    const clonedVoice = audio.voices.find((voice) => voice.voiceId === voiceId);

    if (clonedVoice) {
      selectAudioVoice(clonedVoice);
    }

    setNotice(nextNotice ?? { tone: "success", message: "Voz clonada e selecionada para o agente." });
  }

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    setRunning(action);
    setNotice(null);

    if (action === "connect" || action === "reset_connection") {
      setQrCode(null);
      setPairCode(null);
    }

    try {
      const response = await fetch(variant.endpoints.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...whatsappActionPayload, ...payload }),
      });
      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel executar a acao.");
      }

      applyWhatsappState(data.state, { preserveDrafts: true });
      const nextPairCode = data.state.instance?.status === "connected" ? null : data.pairCode ?? null;
      setQrCode(data.state.instance?.status === "connected" || nextPairCode ? null : data.qrCode ?? null);
      setPairCode(nextPairCode);
      setNotice(data.notice ?? { tone: "success", message: "Acao concluida." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro inesperado no WhatsApp." });
    } finally {
      setRunning(null);
    }
  }

  async function copyMigrationCredential(kind: MigrationCredentialKind) {
    if (!selectedCompanyId) {
      setNotice({ tone: "warning", message: `Escolha um ${variant.entitySingular} antes de copiar os dados de migracao.` });
      return;
    }

    setMigrationCopying(kind);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copy_migration_credential",
          credential: kind,
          ...whatsappActionPayload,
        }),
      });
      const data = (await response.json().catch(() => null)) as MigrationCredentialResponse | null;

      if (!response.ok || !data?.value) {
        throw new Error(data?.error ?? "Nao foi possivel liberar a credencial de migracao.");
      }

      await navigator.clipboard.writeText(data.value);
      setNotice(data.notice ?? {
        tone: "success",
        message: kind === "serverUrl" ? "Server URL copiada." : "Instance Token copiado com seguranca.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel copiar a credencial de migracao.",
      });
    } finally {
      setMigrationCopying(null);
    }
  }

  async function saveAgentSettings() {
    if (agentNameInvalid) {
      setNotice({ tone: "warning", message: `Informe um nome de agente com 2 a ${agentNameMaxLength} caracteres.` });
      return false;
    }

    setRunning("save_settings");
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.action, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...whatsappActionPayload,
          ...(agentNameChanged ? { agentName: selectedAgentNameNormalized } : {}),
          agentPrompt: promptDraft,
          promptTemplateConfig: promptTemplateDraft,
          behavior: behaviorDraft,
          companyLocations: normalizeCompanyLocationDraftsForSave(companyLocationDrafts),
          cloneProfile: cloneProfileDraft,
          qualificationConfig: qualificationDraft,
          channelConfig: channelConfigDraft,
        }),
      });
      const data = (await response.json().catch(() => null)) as (WhatsappState & { error?: string }) | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a configuracao.");
      }

      applyWhatsappState(data);
      setNotice({ tone: "success", message: "Configuracao do agente salva." });
      return true;
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao salvar configuracao." });
      return false;
    } finally {
      setRunning(null);
    }
  }

  async function uploadKnowledgeFile(file: File | null) {
    if (!file || !selectedCompanyId) {
      return;
    }

    const formData = new FormData();
    formData.set(variant.entityIdKey, selectedCompanyId);
    formData.set("file", file);
    setKnowledgeUploading(true);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.knowledge, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel anexar o arquivo.");
      }

      const nextState = await fetchWhatsappState(variant, selectedWhatsappEntityId);
      applyWhatsappState(nextState, { preserveDrafts: true });
      setNotice({ tone: "success", message: "Arquivo adicionado a inteligencia do agente." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao anexar arquivo." });
    } finally {
      setKnowledgeUploading(false);
    }
  }

  async function createWhatsappAgent() {
    if (!selectedCompanyId) {
      setNotice({ tone: "warning", message: `Escolha um ${variant.entitySingular} antes de criar o agente.` });
      return;
    }

    setCreatingAgent(true);
    setNotice(null);

    try {
      const template = agentPromptTemplates.find((item) => item.id === agentTemplateId) ?? agentPromptTemplates[0];
      const promptTemplateConfig = normalizeAgentPromptBuilderConfig({
        templateId: template.id,
        tone: template.defaultTone,
        objective: template.defaultObjective,
        audience: template.defaultAudience,
        salesRules: template.salesPlaybook.join("\n"),
        neverRules: template.careRules.join("\n"),
        updatedAt: new Date().toISOString(),
      });

      const response = await fetch(variant.endpoints.createAgent, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_agent",
          [variant.entityIdKey]: selectedCompanyId,
          name: agentName.trim() || "Agente WhatsApp",
          sectorName: agentSectorName.trim() || "Atendimento WhatsApp",
          roleTitle: template.roleTitle || variant.agentRoleTitle,
          promptTemplateConfig,
        }),
      });
      const data = (await response.json().catch(() => null)) as { agent?: ClientWhatsappAgent; error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel criar o agente.");
      }

      const nextState = await fetchWhatsappState(variant, data?.agent?.id ?? selectedWhatsappEntityId);
      applyWhatsappState(nextState);
      setAgentName("");
      setAgentSectorName(agentPromptTemplates[0].sectorName);
      setAgentTemplateId(defaultAgentPromptTemplateId);
      setShowAgentForm(false);
      setNotice({ tone: "success", message: "Agente criado. Agora configure o prompt, comportamento e conexao." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao criar agente." });
    } finally {
      setCreatingAgent(false);
    }
  }

  async function cloneWhatsappAgent(sourceAgentId: string, input: { companyId: string; name: string; sectorName: string }) {
    if (!sourceAgentId || !input.companyId) {
      setNotice({ tone: "warning", message: "Escolha o agente e a empresa de destino para clonar." });
      return;
    }

    setCreatingAgent(true);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.createAgent, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clone",
          sourceAgentId,
          companyId: input.companyId,
          name: input.name.trim(),
          sectorName: input.sectorName.trim(),
          roleTitle: variant.agentRoleTitle,
        }),
      });
      const data = (await response.json().catch(() => null)) as { agent?: ClientWhatsappAgent; error?: string } | null;

      if (!response.ok || !data?.agent) {
        throw new Error(data?.error ?? "Nao foi possivel clonar o agente.");
      }

      const nextState = await fetchWhatsappState(variant, data.agent.id);
      applyWhatsappState(nextState);
      setQrCode(null);
      setPairCode(null);
      setNotice({ tone: "success", message: "Agente clonado sem copiar a instancia. Gere o QR Code quando quiser conectar o novo WhatsApp." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao clonar agente." });
    } finally {
      setCreatingAgent(false);
    }
  }

  async function deleteWhatsappAgent(agent: ClientWhatsappAgent) {
    const hasUnsavedChanges = agent.id === selectedAgentId && settingsChanged;
    const confirmed = window.confirm(
      `Excluir o agente "${agent.name}"?\n\nEsta acao remove o agente do painel e exclui qualquer instancia WhatsApp vinculada a ele na Uazapi. Leads, conversas e historico do CRM continuam preservados.${hasUnsavedChanges ? "\n\nAlteracoes nao salvas deste agente serao descartadas." : ""}`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingAgentId(agent.id);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.createAgent, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      });
      const data = (await response.json().catch(() => null)) as { deletedAgentId?: string; error?: string } | null;

      if (!response.ok || data?.deletedAgentId !== agent.id) {
        throw new Error(data?.error ?? "Nao foi possivel excluir o agente.");
      }

      const remainingAgents = agents.filter((item) => item.id !== agent.id);
      const nextAgentId = selectedAgentId === agent.id ? remainingAgents[0]?.id ?? "" : selectedAgentId;
      const nextState = await fetchWhatsappState(variant, nextAgentId || undefined);

      applyWhatsappState(nextState);
      setQrCode(null);
      setPairCode(null);
      setNotice({ tone: "success", message: `Agente "${agent.name}" excluido.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao excluir agente." });
    } finally {
      setDeletingAgentId(null);
    }
  }

  async function switchWhatsappAgent(nextAgentId: string) {
    if (!nextAgentId || nextAgentId === selectedAgentId) {
      return;
    }

    if (settingsChanged) {
      const confirmed = window.confirm("Existem alteracoes nao salvas neste agente. Abrir outro agente mesmo assim?");

      if (!confirmed) {
        return;
      }
    }

    setRunning("switch_agent");
    setNotice(null);

    try {
      const nextState = await fetchWhatsappState(variant, nextAgentId);
      applyWhatsappState(nextState);
      setQrCode(null);
      setPairCode(null);
      setShowInternalAgentEdit(false);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Nao foi possivel abrir este agente." });
    } finally {
      setRunning(null);
    }
  }

  async function switchWhatsappEntity(nextEntityId: string) {
    if (!nextEntityId || nextEntityId === selectedCompanyId) {
      return;
    }

    if (settingsChanged) {
      const confirmed = window.confirm("Existem alteracoes nao salvas neste agente. Trocar mesmo assim?");

      if (!confirmed) {
        return;
      }
    }

    setRunning("switch_entity");
    setNotice(null);

    try {
      const nextState = await fetchWhatsappState(variant, nextEntityId);
      applyWhatsappState(nextState);
      setQrCode(null);
      setPairCode(null);
      setShowInternalAgentEdit(false);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : `Nao foi possivel abrir este ${variant.entitySingular}.` });
    } finally {
      setRunning(null);
    }
  }

  async function createInternalWhatsappAgent() {
    const sectorName = internalSectorName.trim();
    const name = internalAgentName.trim() || sectorName;

    if (!sectorName) {
      setNotice({ tone: "warning", message: "Informe o setor interno do novo agente." });
      return;
    }

    setCreatingInternalAgent(true);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.createAgent, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_sector_agent",
          sectorName,
          description: internalSectorDescription,
          name,
          roleTitle: variant.agentRoleTitle,
        }),
      });
      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.state) {
        throw new Error(data?.error ?? "Nao foi possivel criar o agente interno.");
      }

      applyWhatsappState(data.state);
      setInternalSectorName("");
      setInternalSectorDescription("");
      setInternalAgentName("");
      setShowInternalAgentForm(false);
      setQrCode(null);
      setPairCode(null);
      setNotice(data.notice ?? { tone: "success", message: "Agente interno criado. Agora configure prompt, conexao e comportamento." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao criar agente interno." });
    } finally {
      setCreatingInternalAgent(false);
    }
  }

  function openInternalAgentEdit() {
    if (!state?.agent) {
      setNotice({ tone: "warning", message: "Escolha um agente interno antes de editar." });
      return;
    }

    setInternalEditName(state.agent.name);
    setInternalEditPersonaName(state.agent.name);
    setInternalEditRoleTitle(state.agent.roleTitle ?? variant.agentRoleTitle);
    setInternalEditDescription(state.agent.description ?? "");
    setInternalEditAutomationRoles(normalizeAgentAutomationRoles(state.agent.automationRoles));
    setShowInternalAgentEdit(true);
  }

  function updateInternalAgentAutomationRole(role: AgentAutomationRoleKey, enabled: boolean) {
    setInternalEditAutomationRoles((current) => ({
      ...current,
      [role]: enabled,
    }));
  }

  async function saveInternalAgentProfile() {
    if (!selectedCompanyId) {
      setNotice({ tone: "warning", message: "Escolha um agente interno antes de salvar." });
      return;
    }

    setEditingInternalAgent(true);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.createAgent, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_agent_profile",
          [variant.entityIdKey]: selectedCompanyId,
          name: internalEditName,
          personaName: internalEditPersonaName || internalEditName,
          roleTitle: internalEditRoleTitle,
          description: internalEditDescription,
          automationRoles: internalEditAutomationRoles,
        }),
      });
      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.state) {
        throw new Error(data?.error ?? "Nao foi possivel atualizar o agente interno.");
      }

      applyWhatsappState(data.state);
      setShowInternalAgentEdit(false);
      setNotice(data.notice ?? { tone: "success", message: "Agente interno atualizado." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao atualizar agente interno." });
    } finally {
      setEditingInternalAgent(false);
    }
  }

  async function archiveInternalWhatsappAgent() {
    if (!selectedCompanyId || !state?.agent) {
      setNotice({ tone: "warning", message: "Escolha um agente interno antes de arquivar." });
      return;
    }

    if (state.instance?.status === "connected") {
      setNotice({ tone: "warning", message: "Desconecte o WhatsApp interno antes de arquivar este agente." });
      return;
    }

    const confirmed = window.confirm(
      `Arquivar o agente "${state.agent.name}"?\n\nEle saira da lista de agentes internos, mas o historico e os registros continuam preservados.`,
    );

    if (!confirmed) {
      return;
    }

    setArchivingInternalAgent(true);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.createAgent, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "archive_agent",
          [variant.entityIdKey]: selectedCompanyId,
        }),
      });
      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.state) {
        throw new Error(data?.error ?? "Nao foi possivel arquivar o agente interno.");
      }

      applyWhatsappState(data.state);
      setShowInternalAgentEdit(false);
      setQrCode(null);
      setPairCode(null);
      setNotice(data.notice ?? { tone: "success", message: "Agente interno arquivado." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao arquivar agente interno." });
    } finally {
      setArchivingInternalAgent(false);
    }
  }

  return (
    <>
      <SectionHeader
        eyebrow={variant.sectionEyebrow}
        title={headerTitle}
        description={headerDescription}
      />

      {notice && <NoticeBar notice={notice} />}
      {metaComingSoonChannel ? (
        <MetaChannelsComingSoonModal
          channelLabel={metaComingSoonChannel}
          onClose={() => setMetaComingSoonChannel(null)}
        />
      ) : null}

      {loading ? (
        <LoadingState />
      ) : companies.length === 0 && !canManageInternalAgents ? (
        <CompanyRequiredState variant={variant} />
      ) : companies.length === 0 && canManageInternalAgents ? (
        <InternalAgentsManager
          agent={state?.agent ?? null}
          agentName={internalAgentName}
          archiving={archivingInternalAgent}
          companies={companies}
          creating={creatingInternalAgent}
          editing={editingInternalAgent}
          editAutomationRoles={internalEditAutomationRoles}
          editDescription={internalEditDescription}
          editName={internalEditName}
          editPersonaName={internalEditPersonaName}
          editRoleTitle={internalEditRoleTitle}
          instance={state?.instance ?? null}
          sectorDescription={internalSectorDescription}
          sectorName={internalSectorName}
          selectedCompany={selectedCompany}
          selectedCompanyId={selectedCompanyId}
          showEdit={showInternalAgentEdit}
          showForm
          onAgentNameChange={setInternalAgentName}
          onArchive={archiveInternalWhatsappAgent}
          onCancel={() => setShowInternalAgentForm(false)}
          onCreate={createInternalWhatsappAgent}
          onEditAutomationRoleChange={updateInternalAgentAutomationRole}
          onEditCancel={() => setShowInternalAgentEdit(false)}
          onEditDescriptionChange={setInternalEditDescription}
          onEditNameChange={setInternalEditName}
          onEditPersonaNameChange={setInternalEditPersonaName}
          onEditRoleTitleChange={setInternalEditRoleTitle}
          onEditSave={saveInternalAgentProfile}
          onEditStart={openInternalAgentEdit}
          onSectorDescriptionChange={setInternalSectorDescription}
          onSectorNameChange={setInternalSectorName}
          onSelectCompany={switchWhatsappEntity}
          onStart={() => setShowInternalAgentForm(true)}
          variant={variant}
        />
      ) : !state?.agent && !canManageInternalAgents ? (
        <ClientAgentsManager
          agentName={agentName}
          agentTemplateId={agentTemplateId}
          agents={agents}
          companies={companies}
          creating={creatingAgent}
          deletingAgentId={deletingAgentId}
          sectorName={agentSectorName}
          selectedAgentId={selectedAgentId}
          selectedCompanyId={selectedCompanyId}
          showForm={showAgentForm}
          onAgentNameChange={setAgentName}
          onAgentTemplateChange={updateNewAgentTemplate}
          onCancel={() => setShowAgentForm(false)}
          onClone={cloneWhatsappAgent}
          onCreate={createWhatsappAgent}
          onDelete={deleteWhatsappAgent}
          onSectorNameChange={setAgentSectorName}
          onSelectAgent={switchWhatsappAgent}
          onSelectCompany={setSelectedCompanyId}
          onStart={() => setShowAgentForm(true)}
          variant={variant}
        />
      ) : !state?.agent ? (
        <AgentCreationGate
          agentName={agentName}
          agentTemplateId={agentTemplateId}
          companies={companies}
          creating={creatingAgent}
          selectedCompany={selectedCompany}
          selectedCompanyId={selectedCompanyId}
          showForm={showAgentForm}
          onAgentNameChange={setAgentName}
          onAgentTemplateChange={updateNewAgentTemplate}
          onCancel={() => setShowAgentForm(false)}
          onCreate={createWhatsappAgent}
          onSectorNameChange={setAgentSectorName}
          onSelectCompany={setSelectedCompanyId}
          onStart={() => setShowAgentForm(true)}
          sectorName={agentSectorName}
          variant={variant}
        />
      ) : (
      <>
        {!canManageInternalAgents ? (
          <ClientAgentsManager
            agentName={agentName}
            agentTemplateId={agentTemplateId}
            agents={agents}
            companies={companies}
            creating={creatingAgent}
            deletingAgentId={deletingAgentId}
            sectorName={agentSectorName}
            selectedAgentId={selectedAgentId}
            selectedCompanyId={selectedCompanyId}
            showForm={showAgentForm}
            onAgentNameChange={setAgentName}
            onAgentTemplateChange={updateNewAgentTemplate}
            onCancel={() => setShowAgentForm(false)}
            onClone={cloneWhatsappAgent}
            onCreate={createWhatsappAgent}
            onDelete={deleteWhatsappAgent}
            onSectorNameChange={setAgentSectorName}
            onSelectAgent={switchWhatsappAgent}
            onSelectCompany={setSelectedCompanyId}
            onStart={() => setShowAgentForm(true)}
            variant={variant}
          />
        ) : null}

        {canManageInternalAgents ? (
          <InternalAgentsManager
            agent={state.agent}
            agentName={internalAgentName}
            archiving={archivingInternalAgent}
            companies={companies}
            creating={creatingInternalAgent}
            editing={editingInternalAgent}
            editAutomationRoles={internalEditAutomationRoles}
            editDescription={internalEditDescription}
            editName={internalEditName}
            editPersonaName={internalEditPersonaName}
            editRoleTitle={internalEditRoleTitle}
            instance={state.instance}
            sectorDescription={internalSectorDescription}
            sectorName={internalSectorName}
            selectedCompany={selectedCompany}
            selectedCompanyId={selectedCompanyId}
            showEdit={showInternalAgentEdit}
            showForm={showInternalAgentForm}
            onAgentNameChange={setInternalAgentName}
            onArchive={archiveInternalWhatsappAgent}
            onCancel={() => setShowInternalAgentForm(false)}
            onCreate={createInternalWhatsappAgent}
            onEditAutomationRoleChange={updateInternalAgentAutomationRole}
            onEditCancel={() => setShowInternalAgentEdit(false)}
            onEditDescriptionChange={setInternalEditDescription}
            onEditNameChange={setInternalEditName}
            onEditPersonaNameChange={setInternalEditPersonaName}
            onEditRoleTitleChange={setInternalEditRoleTitle}
            onEditSave={saveInternalAgentProfile}
            onEditStart={openInternalAgentEdit}
            onSectorDescriptionChange={setInternalSectorDescription}
            onSectorNameChange={setInternalSectorName}
            onSelectCompany={switchWhatsappEntity}
            onStart={() => setShowInternalAgentForm(true)}
            variant={variant}
          />
        ) : null}

        <WhatsappConsoleCommandBar
          agent={state.agent}
          behavior={behaviorDraft}
          company={selectedCompany}
          entityLabel={variant.entityPromptLabel}
          instance={state.instance}
          agentNameDraft={selectedAgentNameDraft}
          agentNameChanged={agentNameChanged}
          promptChanged={promptChanged}
          promptTemplateChanged={promptTemplateChanged}
          cloneProfileChanged={cloneProfileChanged}
          qualificationChanged={qualificationChanged}
          channelConfigChanged={channelConfigChanged}
          settingsChanged={settingsChanged}
          behaviorChanged={behaviorChanged}
          promptTooLong={promptTooLong}
          saving={running === "save_settings"}
          disabled={!state.capability.schemaReady || !settingsChanged || promptTooLong || agentNameInvalid}
          onSave={saveAgentSettings}
        />

        <WhatsappConsoleTabs activeTab={activeWhatsappTab} onChange={handleWhatsappTabChange} tabs={visibleWhatsappTabs} />

        {activeWhatsappTab === "connection" ? (
          <Panel
            title="Conexao e identidade"
            eyebrow="numero / agente / status"
            action={<NeonBadge tone={state.instance?.status === "connected" ? "green" : "amber"}>{state.instance?.status === "connected" ? "online" : "pendente"}</NeonBadge>}
          >
            <div className="grid gap-3 sm:gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid content-start gap-4">
                <AgentIdentityCard
                  agent={state.agent}
                  agentNameChanged={agentNameChanged}
                  agentNameDraft={selectedAgentNameDraft}
                  agentNameInvalid={agentNameInvalid}
                  company={selectedCompany}
                  entityLabel={variant.entityPromptLabel}
                  onAgentNameChange={!canManageInternalAgents ? setSelectedAgentNameDraft : undefined}
                />
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoTile label="Conversa" value={formatResponseMode(behaviorDraft.responseMode)} />
                  <InfoTile label="Rapport" value={formatRapportMode(behaviorDraft.adaptiveRapportMode)} />
                  <InfoTile label="Alteracoes" value={settingsChanged ? "Pendentes" : "Salvo"} />
                </div>
              </div>
              <CompactConnectionCard
                instance={state.instance}
                qrCode={qrCode}
                pairCode={pairCode}
                connectMode={connectMode}
                connectPhone={connectPhone}
                running={running}
                migrationCopying={migrationCopying}
                onConnect={() => runAction("connect", connectMode === "phone" ? { connectPhone: normalizeConnectPhoneInput(connectPhone) } : {})}
                onCopyMigrationCredential={copyMigrationCredential}
                onConnectModeChange={(mode) => {
                  setConnectMode(mode);
                  setQrCode(null);
                  setPairCode(null);
                }}
                onConnectPhoneChange={setConnectPhone}
                onDisconnect={() => {
                  const confirmed = window.confirm("Remover esta conexao WhatsApp?\n\nA instancia sera excluida do painel e da Uazapi para evitar cobranca duplicada. Para conectar novamente, gere um novo QR Code ou codigo.");
                  if (confirmed) void runAction("disconnect");
                }}
                onRefresh={() => runAction("refresh_status")}
                onReset={() => runAction("reset_connection", connectMode === "phone" ? { connectPhone: normalizeConnectPhoneInput(connectPhone) } : {})}
                enabled={variant.connectionEnabled && state.capability.canConnect}
                disabledReason={state.capability.message ?? variant.connectionDisabledReason}
              />
            </div>
          </Panel>
        ) : null}

        {activeWhatsappTab === "files" ? (
        <Panel
          title="Conhecimento"
          eyebrow="base do agente"
          action={<NeonBadge tone={state.knowledge.files.length > 0 ? "green" : "amber"}>{state.knowledge.files.length.toLocaleString("pt-BR")} arquivos</NeonBadge>}
        >
          <div className="max-w-xl">
            <KnowledgeFilesPanel
              files={state.knowledge.files}
              knowledgeUploading={knowledgeUploading}
              onUploadFile={uploadKnowledgeFile}
            />
          </div>
        </Panel>
        ) : null}

        {activeWhatsappTab === "prompt" ? (
        <Panel
          title="Prompt do agente"
          eyebrow="atendimento / vendas"
          action={<NeonBadge tone={promptChanged || cloneProfileChanged ? "amber" : "green"}>{promptChanged || cloneProfileChanged ? "alterado" : "salvo"}</NeonBadge>}
        >
          {state?.agent ? (
            <div className="grid gap-4">
              <div className="grid gap-4">
                <AgentIdentityCard
                  agent={state.agent}
                  agentNameChanged={agentNameChanged}
                  agentNameDraft={selectedAgentNameDraft}
                  agentNameInvalid={agentNameInvalid}
                  company={selectedCompany}
                  entityLabel={variant.entityPromptLabel}
                  onAgentNameChange={!canManageInternalAgents ? setSelectedAgentNameDraft : undefined}
                />

                <GuidedPromptBuilder
                  config={promptTemplateDraft}
                  improving={promptAssistantRunning}
                  knowledgeFileCount={state.knowledge.files.length}
                  productCount={state.salesCatalog.length}
                  onChange={updatePromptTemplateDraft}
                  onGeneratePrompt={generatePromptFromTemplate}
                  onImproveComplement={improveCompanyComplementWithAi}
                />

                <BehaviorSection
                  title="Prompt tecnico avancado"
                  description="Opcional. O agente usa o modelo do nicho e o complemento da empresa; abra apenas se precisar ajustar o texto final manualmente."
                >
                  <PromptBox
                    label="Prompt final usado pelo agente"
                    description="Texto tecnico final que sera enviado ao agente. Produtos e links cadastrados entram automaticamente no contexto do atendimento."
                    value={promptDraft}
                    maxLength={agentPromptMaxLength}
                    onChange={updatePromptDraft}
                    helper={promptHelper}
                  />
                </BehaviorSection>

                <CloneProfileEditor
                  profile={cloneProfileDraft}
                  importStatus={state.agent.cloneProfileImport}
                  importing={running === "generate_clone_profile_from_history"}
                  canImport={Boolean(state.instance?.tokenReady)}
                  changed={cloneProfileChanged}
                  onGenerateFromHistory={generateCloneProfileFromHistory}
                  onChange={updateCloneProfileDraft}
                />

                <CloneMemoryPanel memory={state.agent.cloneMemory} enabled={behaviorDraft.cloneMemory} />

                <CloneRealTestPanel summary={state.cloneTest} enabled={behaviorDraft.cloneRealTestMode} />

                <div className="flex flex-wrap gap-2">
                  <SecondaryAction
                    icon={RefreshCcw}
                    label="Restaurar salvo"
                    description="Desfaz alteracoes ainda nao salvas e volta para a configuracao atual do banco."
                    disabled={!state || !settingsChanged}
                    onClick={() => state && applyWhatsappState(state)}
                  />
                  <ActionButton
                    icon={Wand2}
                    label="Salvar alteracoes"
                    description={`Salva prompt e comportamento deste agente para o ${variant.entitySingular} selecionado.`}
                    disabled={!state?.capability.schemaReady || !state.agent || !settingsChanged || promptTooLong || agentNameInvalid}
                    loading={running === "save_settings"}
                    tone="ai"
                    onClick={saveAgentSettings}
                  />
                </div>
              </div>
            </div>
          ) : (
            <NoAgentState />
          )}
        </Panel>
        ) : null}

      {state?.agent && activeWhatsappTab === "qualification" ? (
      <div className="mt-5">
        <Panel
          title="Qualificacao do lead"
          eyebrow="crm / perguntas / score"
          action={<NeonBadge tone={qualificationChanged ? "amber" : "green"}>{qualificationChanged ? "alterado" : "salvo"}</NeonBadge>}
        >
          <div className="grid gap-3 sm:gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <LeadQualificationEditor
              config={qualificationDraft}
              entityLabel={variant.entityPromptLabel}
              onAddQuestion={addQualificationQuestion}
              onChange={updateQualificationDraft}
              onQuestionChange={updateQualificationQuestion}
              onRemoveQuestion={removeQualificationQuestion}
            />
            <LeadQualificationSummary config={qualificationDraft} changed={qualificationChanged} />
            <div className="flex flex-wrap gap-2 2xl:col-start-2">
              <SecondaryAction
                icon={RefreshCcw}
                label="Restaurar salvo"
                description="Desfaz alteracoes ainda nao salvas nas perguntas e pesos de qualificacao."
                disabled={!state || !settingsChanged}
                onClick={() => state && applyWhatsappState(state)}
              />
              <ActionButton
                icon={Wand2}
                label="Salvar qualificacao"
                description="Grava as perguntas, pesos e limites que o agente usa para qualificar o lead no CRM."
                disabled={!state?.capability.schemaReady || !settingsChanged || agentNameInvalid}
                loading={running === "save_settings"}
                tone="ai"
                onClick={saveAgentSettings}
              />
            </div>
          </div>
        </Panel>
      </div>
      ) : null}

      {state?.agent && activeWhatsappTab === "behavior" ? (
      <div className="mt-5">
        <Panel
          title="Comportamento do agente"
          eyebrow="controles do atendimento"
          action={<NeonBadge tone={behaviorChanged || companyLocationsChanged ? "amber" : "green"}>{behaviorChanged || companyLocationsChanged ? "alterado" : "salvo"}</NeonBadge>}
        >
          <div className="grid gap-3 sm:gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-3">
              <BehaviorSection title="Base do agente" description="Controles principais que ligam ou pausam o atendimento automatico deste agente.">
                <div className="grid gap-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <ToggleTile icon={Power} label="Agente ativo" description="Quando ligado, o agente pode responder leads automaticamente neste WhatsApp." checked={behaviorDraft.agentEnabled} onChange={() => updateBehavior("agentEnabled", !behaviorDraft.agentEnabled)} />
                    <ToggleTile icon={Eye} label="Marcar como lido" description="Marca mensagens como lidas depois que o sistema processa a conversa." checked={behaviorDraft.markAsRead} onChange={() => updateBehavior("markAsRead", !behaviorDraft.markAsRead)} />
                  </div>
                  <div className="grid gap-2">
                    <div>
                      <h3 className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--ch-text)" }}>Presenca WhatsApp</h3>
                      <p className="mt-1 text-[11px] leading-4 text-slate-400">Define como o agente aparece online antes, durante e depois do atendimento.</p>
                    </div>
                    <ModeSelector<WhatsappPresenceMode>
                      value={behaviorDraft.presenceMode}
                      options={[
                        { value: "focused", label: "So atendimento", description: "Online ao responder", help: "Aparece online apenas quando esta lendo, digitando, gravando ou enviando resposta." },
                        { value: "natural", label: "Natural", description: "Aparece as vezes", help: "Meio-termo: aparece online em alguns momentos ao redor da conversa, sem ficar online o tempo todo." },
                        { value: "always", label: "Sempre online", description: "Disponivel sempre", help: "Mantem presenca e disponibilidade como sempre online. Use quando quiser atendimento 24h sem janela." },
                      ]}
                      onChange={updatePresenceMode}
                    />
                  </div>
                </div>
              </BehaviorSection>

              <BehaviorSection title="Voz do agente" description="Escolhe a voz usada quando o agente responder em audio.">
                <VoiceSelector
                  behavior={behaviorDraft}
                  companyId={selectedCompanyId}
                  defaultVoiceId={state.audio.defaultVoiceId}
                  errorMessage={state.audio.errorMessage}
                  entityIdKey={variant.entityIdKey}
                  endpoint={variant.endpoints.voices}
                  cloneEnabled={variant.voiceCloneEnabled}
                  voices={state.audio.voices}
                  onCloned={applyClonedVoice}
                  onSelect={selectAudioVoice}
                />
              </BehaviorSection>

              <BehaviorSection title="Conversa e rapport" description="Agrupa o modo de resposta e a adaptacao de linguagem. Ao abrir, os dois controles aparecem juntos.">
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="grid gap-2">
                    <div>
                      <h3 className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--ch-text)" }}>Modo de conversa</h3>
                      <p className="mt-1 text-[11px] leading-4 text-slate-400">Define se o agente responde por texto, audio ou segue o formato usado pelo lead.</p>
                    </div>
                    <ModeSelector<WhatsappResponseMode>
                      value={behaviorDraft.responseMode}
                      options={[
                        { value: "text", label: "Sempre texto", description: "Responde por texto", help: "Mesmo se o lead mandar audio, o agente responde em texto." },
                        { value: "audio", label: "Sempre audio", description: "Prefere audio", help: "O agente gera audio com a voz selecionada sempre que possivel." },
                        { value: "mirror", label: "Espelho", description: "Segue o lead", help: "Se o lead mandar audio, responde em audio; se mandar texto, responde em texto." },
                      ]}
                      onChange={(value) => updateBehavior("responseMode", value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <div>
                      <h3 className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--ch-text)" }}>Rapport adaptativo</h3>
                      <p className="mt-1 text-[11px] leading-4 text-slate-400">Controla quanto o agente adapta linguagem, formalidade e tom ao perfil do lead.</p>
                    </div>
                    <ModeSelector<WhatsappRapportMode>
                      value={behaviorDraft.adaptiveRapportMode}
                      options={[
                        { value: "off", label: "Desligado", description: "Usa o prompt", help: "Mantem exatamente o tom definido no prompt do agente." },
                        { value: "soft", label: "Suave", description: "Adapta leve", help: "Ajusta pequenas escolhas de linguagem sem mudar o estilo principal." },
                        { value: "strong", label: "Forte", description: "Adapta mais", help: "Adapta com mais forca a linguagem do lead quando fizer sentido." },
                      ]}
                      onChange={(value) => updateBehavior("adaptiveRapportMode", value)}
                    />
                  </div>
                </div>
              </BehaviorSection>

              <BehaviorSection title="Localizacao da empresa" description="Enderecos que o agente pode enviar quando o lead pedir onde fica, Maps ou localizacao. O botao abre o Google Maps quando houver link, coordenadas ou endereco completo.">
                <CompanyLocationsEditor
                  locations={companyLocationDrafts}
                  onAdd={addCompanyLocationDraft}
                  onChange={updateCompanyLocationDraft}
                  onPrimary={markCompanyLocationPrimary}
                  onRemove={removeCompanyLocationDraft}
                />
              </BehaviorSection>

              <BehaviorSection title="Simulacao humana" description="Comportamentos que fazem o agente parecer uma pessoa real no WhatsApp.">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <ToggleTile icon={Smile} label="Reacoes emoji" description="Reage a mensagens do lead com emoji contextual antes de responder." checked={behaviorDraft.emojiReactions} onChange={() => updateBehavior("emojiReactions", !behaviorDraft.emojiReactions)} />
                  <ToggleTile icon={Sticker} label="Figurinhas" description="Envia stickers contextuais ocasionalmente para simular comportamento natural do WhatsApp." checked={behaviorDraft.sendStickers} onChange={() => updateBehavior("sendStickers", !behaviorDraft.sendStickers)} />
                  <ToggleTile icon={Forward} label="Midia proativa" description="Permite que o agente envie imagens, catalogos ou midias relevantes de forma espontanea." checked={behaviorDraft.proactiveMedia} onChange={() => updateBehavior("proactiveMedia", !behaviorDraft.proactiveMedia)} />
                  <ToggleTile icon={Coffee} label="Small talk" description="Injeta contexto cultural e temporal brasileiro para papo leve quando o lead abrir espaco." checked={behaviorDraft.smallTalk} onChange={() => updateBehavior("smallTalk", !behaviorDraft.smallTalk)} />
                </div>
              </BehaviorSection>

              <BehaviorSection title="Seguranca e testes" description="Protecoes para evitar atendimento indevido, loops e conflitos com humanos.">
                <div className="grid gap-3">
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <ToggleTile icon={ShieldCheck} label="Intervencao humana" description="Pausa a IA quando um humano assume a conversa ou quando o lead pede atendimento humano." checked={behaviorDraft.humanIntervention} onChange={() => updateBehavior("humanIntervention", !behaviorDraft.humanIntervention)} />
                    <ToggleTile icon={Bell} label="Avisar humano" description="Envia uma mensagem no WhatsApp para os numeros responsaveis quando o lead pede atendimento humano." checked={behaviorDraft.humanHandoffNotifications} onChange={() => updateBehavior("humanHandoffNotifications", !behaviorDraft.humanHandoffNotifications)} />
                    <NumberField label="Cooldown aviso" description="Minutos minimos entre avisos do mesmo lead para evitar spam no numero responsavel." value={behaviorDraft.humanHandoffNotificationCooldownMinutes} min={1} max={1440} onChange={(value) => updateBehavior("humanHandoffNotificationCooldownMinutes", value)} />
                    <SecondaryAction
                      icon={Send}
                      label="Enviar teste"
                      description="Enfileira um aviso de teste para os numeros responsaveis usando o mesmo fluxo Inngest do handoff real."
                      disabled={!state?.instance?.tokenReady || !behaviorDraft.humanHandoffNotifications || !behaviorDraft.humanHandoffNotificationNumbers.trim()}
                      loading={running === "send_handoff_test"}
                      onClick={() => runAction("send_handoff_test", { behavior: behaviorDraft })}
                    />
                  </div>
                  <TextAreaField
                    label="Numeros responsaveis"
                    description="Um numero por linha ou separados por virgula. Quando o lead pedir humano, esses numeros recebem um aviso pelo WhatsApp conectado. Esses numeros sao contatos internos: por seguranca, o agente nao responde esses numeros como lead."
                    value={behaviorDraft.humanHandoffNotificationNumbers}
                    minHeight="96px"
                    placeholder={"5599999999999\n5588888888888"}
                    onChange={(value) => updateBehavior("humanHandoffNotificationNumbers", value)}
                  />
                  <div className="rounded-lg border border-amber-300/35 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-950">
                    <span className="font-semibold">Seguranca:</span> numeros cadastrados aqui recebem avisos internos e ficam protegidos. O agente nao responde esses numeros como lead.
                  </div>
                </div>
              </BehaviorSection>

              <BehaviorSection title="Citacoes do WhatsApp" description="Controla quando a resposta deve sair citando uma mensagem especifica do lead.">
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <div>
                      <h3 className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--ch-text)" }}>Citar mensagens</h3>
                      <p className="mt-1 text-[11px] leading-4 text-slate-400">Controla quando a resposta deve sair citando uma mensagem especifica do lead.</p>
                    </div>
                    <ModeSelector<WhatsappQuoteReplyMode>
                      value={behaviorDraft.quoteReplyMode}
                      options={[
                        { value: "off", label: "Desligado", description: "Nao cita", help: "O agente responde sem usar citacao/reply do WhatsApp." },
                        { value: "smart", label: "Inteligente", description: "So quando ajuda", help: "Cita apenas quando o lead enviou varias mensagens independentes, audios ou perguntas separadas." },
                        { value: "always", label: "Sempre", description: "Cita tudo", help: "Comportamento antigo: toda resposta usa reply na ultima mensagem do lead." },
                      ]}
                      onChange={updateQuoteReplyMode}
                    />
                  </div>
                </div>
              </BehaviorSection>

              <BehaviorSection title="Follow-up proativo" description="O agente reenvia mensagem contextual quando o lead para de responder, como um vendedor real faria.">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <ToggleTile icon={Forward} label="Follow-up automatico" description="Envia mensagem de retomada quando o lead silencia apos engajamento." checked={behaviorDraft.proactiveFollowUp} onChange={() => updateBehavior("proactiveFollowUp", !behaviorDraft.proactiveFollowUp)} />
                  <NumberField label="Delay (min)" description="Minutos de silencio do lead antes de enviar o follow-up." value={behaviorDraft.followUpDelayMinutes} min={30} max={1440} onChange={(value) => updateBehavior("followUpDelayMinutes", value)} />
                  <NumberField label="Max por conversa" description="Limite de follow-ups automaticos por conversa." value={behaviorDraft.followUpMaxPerConversation} min={1} max={5} onChange={(value) => updateBehavior("followUpMaxPerConversation", value)} />
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <TextField label="Janela inicio" description="Horario minimo para enviar follow-up (ex: 09:00)." value={behaviorDraft.followUpTimeWindowStart} onChange={(value) => updateBehavior("followUpTimeWindowStart", value)} />
                  <TextField label="Janela fim" description="Horario maximo para enviar follow-up (ex: 20:00)." value={behaviorDraft.followUpTimeWindowEnd} onChange={(value) => updateBehavior("followUpTimeWindowEnd", value)} />
                </div>
              </BehaviorSection>

              <BehaviorSection title="Audio e midia com IA" description="Define quais tipos de midia a IA pode interpretar antes de responder o lead.">
                <div className="grid gap-2 md:grid-cols-3">
                  <NumberField label="Imagens" description="Maximo de imagens analisadas quando o lead envia varias midias juntas." value={behaviorDraft.mediaBatchImageLimit} min={1} max={20} onChange={(value) => updateBehavior("mediaBatchImageLimit", value)} />
                  <NumberField label="Videos" description="Maximo de videos analisados em um mesmo lote de mensagens." value={behaviorDraft.mediaBatchVideoLimit} min={1} max={5} onChange={(value) => updateBehavior("mediaBatchVideoLimit", value)} />
                  <NumberField label="Documentos" description="Maximo de documentos analisados em um mesmo lote de mensagens." value={behaviorDraft.mediaBatchDocumentLimit} min={1} max={8} onChange={(value) => updateBehavior("mediaBatchDocumentLimit", value)} />
                </div>
              </BehaviorSection>

              <BehaviorSection title="Temporizadores" description="Define pausas antes de responder, para evitar respostas instantaneas demais ou fora de contexto.">
                <div className="grid gap-3">
                  <ToggleTile icon={Timer} label="Temporizacao inteligente" description="Ajusta o tempo de resposta conforme o tipo e a quantidade de mensagens recebidas." checked={behaviorDraft.smartTiming} onChange={() => updateBehavior("smartTiming", !behaviorDraft.smartTiming)} />
                  <div className="grid gap-2 md:grid-cols-3 2xl:grid-cols-4">
                    <NumberField label="So texto" description="Segundos de espera quando chega apenas uma mensagem de texto." value={behaviorDraft.timingTextSeconds} min={2} max={60} onChange={(value) => updateBehavior("timingTextSeconds", value)} />
                    <NumberField label="Textos seguidos" description="Janela para agrupar varias mensagens seguidas antes do agente responder." value={behaviorDraft.timingTextBurstSeconds} min={3} max={90} onChange={(value) => updateBehavior("timingTextBurstSeconds", value)} />
                    <NumberField label="Foto legenda" description="Espera antes de responder foto com legenda." value={behaviorDraft.timingMediaCaptionSeconds} min={5} max={120} onChange={(value) => updateBehavior("timingMediaCaptionSeconds", value)} />
                    <NumberField label="Foto + texto" description="Espera quando o lead manda foto e depois texto." value={behaviorDraft.timingMediaThenTextSeconds} min={5} max={120} onChange={(value) => updateBehavior("timingMediaThenTextSeconds", value)} />
                    <NumberField label="Foto so" description="Espera para analisar e responder imagem sem texto." value={behaviorDraft.timingMediaOnlySeconds} min={5} max={120} onChange={(value) => updateBehavior("timingMediaOnlySeconds", value)} />
                    <NumberField label="Audio" description="Espera antes de responder quando chega audio isolado." value={behaviorDraft.timingAudioSeconds} min={5} max={120} onChange={(value) => updateBehavior("timingAudioSeconds", value)} />
                    <NumberField label="Audio + texto" description="Espera quando o lead envia audio e complementa com texto." value={behaviorDraft.timingAudioThenTextSeconds} min={5} max={120} onChange={(value) => updateBehavior("timingAudioThenTextSeconds", value)} />
                    <NumberField label="Video legenda" description="Espera antes de responder video com legenda." value={behaviorDraft.timingVideoCaptionSeconds} min={8} max={180} onChange={(value) => updateBehavior("timingVideoCaptionSeconds", value)} />
                    <NumberField label="So video" description="Espera para processar video sem texto." value={behaviorDraft.timingVideoOnlySeconds} min={8} max={180} onChange={(value) => updateBehavior("timingVideoOnlySeconds", value)} />
                    <NumberField label="Doc. + texto" description="Espera quando chegam documento e texto juntos." value={behaviorDraft.timingDocumentCaptionSeconds} min={8} max={180} onChange={(value) => updateBehavior("timingDocumentCaptionSeconds", value)} />
                    <NumberField label="So documento" description="Espera para processar documento sem mensagem complementar." value={behaviorDraft.timingDocumentOnlySeconds} min={8} max={180} onChange={(value) => updateBehavior("timingDocumentOnlySeconds", value)} />
                    <NumberField label="Antes botao" description="Espera antes de responder botoes ou chamadas de acao." value={behaviorDraft.timingButtonDelaySeconds} min={0} max={20} onChange={(value) => updateBehavior("timingButtonDelaySeconds", value)} />
                    <NumberField label="Midias em lote" description="Espera quando o lead envia varias midias seguidas antes de responder o conjunto." value={behaviorDraft.timingMediaBurstSeconds} min={5} max={180} onChange={(value) => updateBehavior("timingMediaBurstSeconds", value)} />
                    <NumberField label="Evento sem texto" description="Espera para contatos, enquetes, reacoes, mensagem apagada/editada ou evento sem texto claro." value={behaviorDraft.timingContextEventSeconds} min={2} max={60} onChange={(value) => updateBehavior("timingContextEventSeconds", value)} />
                    <NumberField label="Audio dificil" description="Espera extra para audio sem transcricao confiavel, ruidoso, longo ou incompreensivel." value={behaviorDraft.timingAudioQualitySeconds} min={5} max={180} onChange={(value) => updateBehavior("timingAudioQualitySeconds", value)} />
                    <NumberField label="Reativar agente" description="Minutos ate a IA voltar depois de uma intervencao humana." value={behaviorDraft.humanInterventionMinutes} min={5} max={1440} onChange={(value) => updateBehavior("humanInterventionMinutes", value)} />
                  </div>
                </div>
              </BehaviorSection>

              <BehaviorSection title="Janela da IA" description="Horario em que o agente pode responder quando a opcao Janela da IA ativa estiver ligada.">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <ToggleTile icon={Clock3} label="Janela da IA ativa" description="Faz o agente responder apenas dentro do horario configurado nesta janela." checked={behaviorDraft.aiScheduleEnabled} onChange={() => updateBehavior("aiScheduleEnabled", !behaviorDraft.aiScheduleEnabled)} />
                  <TextField label="Inicio" description="Horario em que a IA comeca a responder." value={behaviorDraft.aiScheduleStart} onChange={(value) => updateBehavior("aiScheduleStart", value)} />
                  <TextField label="Fim" description="Horario em que a IA para de responder." value={behaviorDraft.aiScheduleEnd} onChange={(value) => updateBehavior("aiScheduleEnd", value)} />
                  <TextField label="Fuso horario" description="Fuso usado para calcular a janela de atendimento." value={behaviorDraft.aiScheduleTimezone} onChange={(value) => updateBehavior("aiScheduleTimezone", value)} />
                </div>
              </BehaviorSection>
            </div>

              <BehaviorSummary behavior={behaviorDraft} promptChanged={promptChanged} behaviorChanged={behaviorChanged || companyLocationsChanged} />

            <div className="flex flex-wrap gap-2 2xl:col-start-2">
              <SecondaryAction
                icon={RefreshCcw}
                label="Restaurar salvo"
                description="Desfaz alteracoes ainda nao salvas nos controles de comportamento."
                disabled={!state || !settingsChanged}
                onClick={() => state && applyWhatsappState(state)}
              />
              <ActionButton
                icon={Wand2}
                label="Salvar comportamento"
                description="Grava os controles de atendimento, audio, midia, temporizadores e janela da IA."
                disabled={!state?.capability.schemaReady || !settingsChanged || agentNameInvalid}
                loading={running === "save_settings"}
                onClick={saveAgentSettings}
              />
            </div>
          </div>
        </Panel>
      </div>
      ) : null}

      {state?.agent && activeWhatsappTab === "channels" ? (
      <div className="mt-5">
        <Panel
          title="Canais do agente"
          eyebrow="whatsapp / instagram / facebook"
          action={<NeonBadge tone={channelConfigChanged ? "amber" : "green"}>{channelConfigChanged ? "alterado" : "salvo"}</NeonBadge>}
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.36fr)]">
            <AgentChannelSettingsPanel
              config={channelConfigDraft}
              changed={channelConfigChanged}
              entitlement={state.capability.metaSocialChannels}
              onChange={(channelId, patch) => updateAgentChannelConfig(channelId, patch)}
              onMetaComingSoonClick={openMetaChannelsComingSoon}
            />
            <div className="grid content-start gap-2">
              <InfoTile label="Canal principal" value="WhatsApp" />
              <InfoTile label="Meta Social" value={metaFeatureLaunchPaused ? "Em breve" : state.capability.metaSocialChannels.allowed ? state.capability.metaSocialChannels.title : "Bloqueado"} />
              <InfoTile label="Meta ativos" value={state.capability.metaSocialChannels.allowed ? `${countEnabledMetaChannels(channelConfigDraft)} / 4` : "0 / 4"} />
              <InfoTile label="Comentarios" value={metaFeatureLaunchPaused ? "Em breve" : state.capability.metaSocialChannels.allowed && countEnabledPublicChannels(channelConfigDraft) ? "Preparado" : "Pausado"} />
              <InfoTile label="Directs" value={metaFeatureLaunchPaused ? "Em breve" : state.capability.metaSocialChannels.allowed && countEnabledPrivateMetaChannels(channelConfigDraft) ? "Preparado" : "Pausado"} />
              <div className="flex flex-wrap gap-2 pt-1">
                <SecondaryAction
                  icon={RefreshCcw}
                  label="Restaurar salvo"
                  description="Desfaz alteracoes ainda nao salvas nos canais do agente."
                  disabled={!state || !channelConfigChanged}
                  onClick={() => setChannelConfigDraft(normalizeAgentChannelConfig(state?.agent?.channelConfig))}
                />
                <ActionButton
                  icon={Wand2}
                  label="Salvar canais"
                  description="Grava quais redes o mesmo agente pode atender."
                  disabled={!state?.capability.schemaReady || !channelConfigChanged || agentNameInvalid}
                  loading={running === "save_settings"}
                  onClick={saveAgentSettings}
                />
              </div>
            </div>
          </div>
        </Panel>
      </div>
      ) : null}

      </>
      )}
    </>
  );
}

async function fetchWhatsappState(variant: WhatsappConsoleVariant, entityId?: string) {
  const queryKey = variant.entityIdKey === "companyId" ? "agentId" : variant.entityIdKey;
  const query = entityId ? `?${queryKey}=${encodeURIComponent(entityId)}` : "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${variant.endpoints.state}${query}`, { cache: "no-store", signal: controller.signal });
    const data = (await response.json().catch(() => null)) as (WhatsappState & { error?: string }) | null;

    if (!response.ok || !data) {
      throw new Error(data?.error ?? "Nao foi possivel carregar o WhatsApp.");
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("O WhatsApp demorou para carregar. Atualize a pagina ou tente novamente em alguns segundos.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createEmptyAgentAutomationRoles(): AgentAutomationRoles {
  return {
    signup_whatsapp_verification: false,
    trial_welcome: false,
    trial_conversion: false,
  };
}

function normalizeAgentAutomationRoles(value: AgentAutomationRoles | null | undefined): AgentAutomationRoles {
  const empty = createEmptyAgentAutomationRoles();

  return {
    signup_whatsapp_verification: value?.signup_whatsapp_verification ?? empty.signup_whatsapp_verification,
    trial_welcome: value?.trial_welcome ?? empty.trial_welcome,
    trial_conversion: value?.trial_conversion ?? empty.trial_conversion,
  };
}

function isBehaviorEqual(left: WhatsappBehaviorConfig, right: WhatsappBehaviorConfig) {
  return JSON.stringify(normalizeWhatsappBehaviorConfig(left)) === JSON.stringify(normalizeWhatsappBehaviorConfig(right));
}

function createEmptyCompanyLocationDraft(): CompanyLocationDraft {
  return {
    id: null,
    label: "Unidade principal",
    address: "",
    cep: "",
    city: "",
    region: "",
    mapsUrl: "",
    latitude: "",
    longitude: "",
    isPrimary: true,
    notes: "",
  };
}

function toCompanyLocationDrafts(locations: OrganizationLocation[]): CompanyLocationDraft[] {
  if (locations.length === 0) {
    return [createEmptyCompanyLocationDraft()];
  }

  return locations.map((location, index) => ({
    id: location.id,
    label: location.label || (index === 0 ? "Unidade principal" : `Unidade ${index + 1}`),
    address: location.address ?? "",
    cep: location.cep ?? "",
    city: location.city ?? "",
    region: location.region ?? "",
    mapsUrl: location.mapsUrl ?? "",
    latitude: location.latitude === null ? "" : String(location.latitude),
    longitude: location.longitude === null ? "" : String(location.longitude),
    isPrimary: location.isPrimary || index === 0,
    notes: location.notes ?? "",
  }));
}

function normalizeCompanyLocationDraftsForSave(drafts: CompanyLocationDraft[]) {
  return normalizeOrganizationLocations(drafts.map((draft) => ({
    id: draft.id,
    label: draft.label,
    address: draft.address,
    cep: draft.cep,
    city: draft.city,
    region: draft.region,
    mapsUrl: draft.mapsUrl,
    latitude: draft.latitude,
    longitude: draft.longitude,
    isPrimary: draft.isPrimary,
    notes: draft.notes,
  })));
}

function isCompanyLocationDraftsEqual(drafts: CompanyLocationDraft[], locations: OrganizationLocation[]) {
  return JSON.stringify(normalizeCompanyLocationDraftsForSave(drafts)) === JSON.stringify(normalizeOrganizationLocations(locations));
}

function isAgentChannelConfigEqual(left: AgentChannelConfig, right: AgentChannelConfig) {
  return JSON.stringify(normalizeAgentChannelConfig(left)) === JSON.stringify(normalizeAgentChannelConfig(right));
}

function isCloneProfileEqual(left: WhatsappCloneProfile, right: WhatsappCloneProfile) {
  return JSON.stringify(normalizeWhatsappCloneProfile(left)) === JSON.stringify(normalizeWhatsappCloneProfile(right));
}

function countEnabledMetaChannels(config: AgentChannelConfig) {
  if (metaFeatureLaunchPaused) {
    return 0;
  }

  const normalized = normalizeAgentChannelConfig(config);
  return agentChannelDefinitions.filter((definition) =>
    definition.provider === "meta" && normalized.channels[definition.id].enabled
  ).length;
}

function countEnabledPublicChannels(config: AgentChannelConfig) {
  if (metaFeatureLaunchPaused) {
    return 0;
  }

  const normalized = normalizeAgentChannelConfig(config);
  return agentChannelDefinitions.filter((definition) =>
    definition.provider === "meta" && definition.mode === "public" && normalized.channels[definition.id].enabled
  ).length;
}

function countEnabledPrivateMetaChannels(config: AgentChannelConfig) {
  if (metaFeatureLaunchPaused) {
    return 0;
  }

  const normalized = normalizeAgentChannelConfig(config);
  return agentChannelDefinitions.filter((definition) =>
    definition.provider === "meta" && definition.mode === "private" && normalized.channels[definition.id].enabled
  ).length;
}

function AgentChannelSettingsPanel({
  config,
  changed,
  entitlement,
  onChange,
  onMetaComingSoonClick,
}: {
  config: AgentChannelConfig;
  changed: boolean;
  entitlement: PlanFeatureEntitlement;
  onChange: (channelId: AgentChannelId, patch: Partial<AgentChannelConfigItem>) => void;
  onMetaComingSoonClick: (channelLabel: string) => void;
}) {
  const normalized = normalizeAgentChannelConfig(config);

  return (
    <div className="grid gap-4">
      <BehaviorSection
        title="Agente unico"
        description="O prompt principal continua sendo um so. Cada rede adiciona apenas o contexto operacional do canal antes da IA responder."
      >
        <div className="grid gap-2 md:grid-cols-2">
          {agentChannelDefinitions.map((definition) => {
            const channel = normalized.channels[definition.id];
            const comingSoon = metaFeatureLaunchPaused && definition.provider === "meta";
            const lockedByPlan = definition.provider === "meta" && !entitlement.allowed && !comingSoon;
            const blocked = comingSoon || lockedByPlan;
            const enabled = channel.enabled && !blocked;
            const handleMetaControlClick = () => onMetaComingSoonClick(definition.label);

            return (
              <div
                key={definition.id}
                className={cn("rounded-lg border p-3", comingSoon && "ring-1 ring-cyan-300/10")}
                style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel-2)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold leading-5" style={{ color: "var(--ch-text)" }}>{definition.label}</p>
                      <NeonBadge tone={comingSoon ? "cyan" : lockedByPlan ? "zinc" : enabled ? "green" : "amber"}>{comingSoon ? "em breve" : lockedByPlan ? "plano pro/scale" : enabled ? "ativo" : "pausado"}</NeonBadge>
                      {definition.primary ? <NeonBadge tone="cyan">principal</NeonBadge> : null}
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">{definition.description}</p>
                    {comingSoon ? (
                      <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] leading-4 text-blue-700">
                        {metaFeatureComingSoonMessage}
                      </p>
                    ) : lockedByPlan ? (
                      <p className="mt-2 rounded-md border border-amber-300/35 bg-amber-50 px-2 py-1 text-[11px] leading-4 text-amber-800">
                        {entitlement.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  {definition.primary ? (
                    <>
                      <InfoTile label="Estado" value="Sempre ativo" />
                      <InfoTile label="Historico" value="Gravado no CRM" />
                    </>
                  ) : (
                    <ToggleTile
                      icon={Power}
                      label={`Ativar ${definition.shortLabel}`}
                      description={comingSoon ? metaFeatureComingSoonMessage : "Habilita este canal para o mesmo agente atender quando a integracao Meta permitir."}
                      checked={enabled}
                      disabled={lockedByPlan}
                      onChange={() => comingSoon ? handleMetaControlClick() : onChange(definition.id, { enabled: !enabled })}
                    />
                  )}

                  {definition.mode === "public" ? (
                    <div className="grid gap-2 md:grid-cols-3">
                      <ToggleTile
                        icon={MessageCircle}
                        label="Comentario publico"
                        description="Permite registrar e preparar resposta publica em comentarios."
                        checked={channel.allowPublicReplies && !blocked}
                        disabled={lockedByPlan}
                        onChange={() => comingSoon ? handleMetaControlClick() : onChange(definition.id, { allowPublicReplies: !channel.allowPublicReplies })}
                      />
                      <ToggleTile
                        icon={Send}
                        label="Direct privado"
                        description="Permite continuar a conversa no privado quando a Meta liberar private reply/direct."
                        checked={channel.allowPrivateReplies && !blocked}
                        disabled={lockedByPlan}
                        onChange={() => comingSoon ? handleMetaControlClick() : onChange(definition.id, { allowPrivateReplies: !channel.allowPrivateReplies })}
                      />
                      <ToggleTile
                        icon={ShieldCheck}
                        label="Aprovacao humana"
                        description="Segura respostas sensiveis de comentario antes de publicar."
                        checked={channel.requiresHumanApproval && !blocked}
                        disabled={lockedByPlan}
                        onChange={() => comingSoon ? handleMetaControlClick() : onChange(definition.id, { requiresHumanApproval: !channel.requiresHumanApproval })}
                      />
                    </div>
                  ) : definition.primary ? null : (
                    <div className="grid gap-2 md:grid-cols-2">
                      <ToggleTile
                        icon={Bot}
                        label="Resposta automatica"
                        description="Permite que o agente responda no canal privado sem criar outro prompt."
                        checked={channel.autoReply && !blocked}
                        disabled={lockedByPlan}
                        onChange={() => comingSoon ? handleMetaControlClick() : onChange(definition.id, { autoReply: !channel.autoReply })}
                      />
                      <ToggleTile
                        icon={ShieldCheck}
                        label="Aprovacao humana"
                        description="Segura conversas privadas quando houver risco ou regra comercial sensivel."
                        checked={channel.requiresHumanApproval && !blocked}
                        disabled={lockedByPlan}
                        onChange={() => comingSoon ? handleMetaControlClick() : onChange(definition.id, { requiresHumanApproval: !channel.requiresHumanApproval })}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </BehaviorSection>

      <BehaviorSection
        title="Politica de atendimento"
        description="O historico continua centralizado em leads, conversas e mensagens. Meta entra como novo canal, nao como novo agente."
      >
        <div className="grid gap-2 md:grid-cols-4">
          <InfoTile label="Prompt" value="Unico por agente" />
          <InfoTile label="Memoria" value="Unificada por lead" />
          <InfoTile label="Plano" value={metaFeatureLaunchPaused ? "WhatsApp ativo" : entitlement.allowed ? entitlement.title : "Pro ou Scale"} />
          <InfoTile label="Status" value={metaFeatureLaunchPaused ? "Meta em breve" : changed ? "Alteracoes pendentes" : "Configuracao salva"} />
        </div>
      </BehaviorSection>
    </div>
  );
}

function countCloneProfileFields(profile: WhatsappCloneProfile) {
  return [
    profile.displayName,
    profile.roleIdentity,
    profile.tone,
    profile.vocabulary,
    profile.responseRhythm,
    profile.salesStyle,
    profile.objectionStyle,
    profile.closingStyle,
    profile.emojiStyle,
    profile.audioStyle,
    profile.forbiddenPatterns,
    profile.notes,
  ].filter((value) => value.trim().length > 0).length;
}

function formatCloneProfileImportStatus(status?: CloneProfileImportStatus | null) {
  if (!status || status.status === "idle") {
    return "Ainda nao gerado pelo historico.";
  }

  if (status.status === "queued") {
    return "Na fila do Inngest.";
  }

  if (status.status === "running") {
    return "Analisando historico agora.";
  }

  if (status.status === "succeeded") {
    return `Concluido em ${formatDate(status.completedAt)}.`;
  }

  return "Falhou. Ajuste a conexao ou tente novamente.";
}

function NoticeBar({ notice }: { notice: Notice }) {
  const colors = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-300/40 bg-amber-50 text-amber-800",
    error: "border-rose-200 bg-rose-50 text-rose-700",
  } satisfies Record<Notice["tone"], string>;

  return (
    <div className={cn("mb-5 rounded-xl border px-4 py-3 text-[13px] leading-5", colors[notice.tone])}>
      {notice.message}
    </div>
  );
}

function MetaChannelsComingSoonModal({
  channelLabel,
  onClose,
}: {
  channelLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      aria-labelledby="meta-coming-soon-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      role="dialog"
      tabIndex={0}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border p-5 text-left shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ background: "var(--ch-surface)", borderColor: "rgba(var(--ch-brand-primary-rgb),0.22)" }}
      >
        <button
          aria-label="Fechar aviso"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>

        <div
          className="grid h-12 w-12 place-items-center rounded-2xl"
          style={{ background: "rgba(var(--ch-brand-primary-rgb),0.10)", color: "var(--ch-brand-primary)" }}
        >
          <MessageCircle className="h-6 w-6" />
        </div>

        <p className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700">
          Em breve
        </p>
        <h3 id="meta-coming-soon-title" className="mt-2 pr-8 text-lg font-semibold" style={{ color: "var(--ch-text)" }}>
          {metaFeatureComingSoonTitle}
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {metaFeatureComingSoonMessage}
        </p>
        <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
          Canal selecionado: {channelLabel}. O atendimento principal continua liberado pelo WhatsApp.
        </p>

        <button
          className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-white px-4 font-mono text-[11px] font-semibold uppercase text-slate-950 transition hover:bg-slate-100"
          onClick={onClose}
          type="button"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}

function buildRuntimeAlertNotifications(alerts: RuntimeAlert[]): ConnectyShellNotification[] {
  return alerts.slice(0, 10).map((alert) => ({
    id: alert.id,
    title: "Protecao entre instancias",
    description: alert.inputPreview
      ? `Mensagem recebida: ${alert.inputPreview}`
      : alert.outputSummary || alert.message,
    meta: `${formatPhone(alert.phoneNumber ?? alert.providerChatId)} / ${formatDate(alert.occurredAt)} / IA nao acionada`,
    occurredAt: alert.occurredAt,
    tone: "amber",
  }));
}

function LoadingState() {
  return (
    <Panel title="WhatsApp" eyebrow="carregando">
      <div className="grid min-h-[280px] place-items-center px-4 py-8">
        <InfinityLoader
          label="Carregando agente WhatsApp..."
          description="Preparando conexao, prompt e comportamento."
          size="md"
        />
      </div>
    </Panel>
  );
}

function CompanyRequiredState({ variant }: { variant: WhatsappConsoleVariant }) {
  return (
    <Panel title={`Nenhum ${variant.entitySingular} cadastrado`} eyebrow="primeiro passo">
      <div className="grid min-h-[280px] place-items-center text-center">
        <div className="max-w-sm">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "rgba(var(--ch-whatsapp-rgb),0.10)", color: "var(--ch-whatsapp-deep)" }}
          >
            <Building2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>{variant.missingEntityTitle}</h2>
          <p className="mt-2 text-[13px] leading-6 text-slate-500">
            {variant.missingEntityDescription}
          </p>
          <Link
            className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-white transition hover:brightness-110"
            href={variant.missingEntityHref}
            style={{ background: "linear-gradient(135deg, var(--ch-whatsapp-deep), var(--ch-whatsapp))" }}
          >
            <Plus className="h-4 w-4" />
            {variant.missingEntityAction}
          </Link>
        </div>
      </div>
    </Panel>
  );
}

const whatsappConsoleTabs: Array<{
  id: WhatsappConsoleTab;
  label: string;
  description: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}> = [
  { id: "connection", label: "Conexao", description: "Numero e status", icon: Smartphone },
  { id: "prompt", label: "Prompt", description: "Texto do agente", icon: PenLine },
  { id: "files", label: "Conhecimento", description: "Arquivos e contexto", icon: FileText },
  { id: "qualification", label: "Qualificacao", description: "CRM e score", icon: CheckCircle2 },
  { id: "behavior", label: "Comportamento", description: "Modos e timers", icon: Shuffle },
  { id: "channels", label: "Redes sociais", description: "Instagram / Facebook", icon: Globe2, comingSoon: true },
];

function WhatsappConsoleCommandBar({
  agent,
  behavior,
  company,
  entityLabel,
  instance,
  agentNameDraft,
  agentNameChanged,
  promptChanged,
  promptTemplateChanged,
  cloneProfileChanged,
  qualificationChanged,
  channelConfigChanged,
  settingsChanged,
  behaviorChanged,
  promptTooLong,
  saving,
  disabled,
  onSave,
}: {
  agent: NonNullable<WhatsappState["agent"]>;
  behavior: WhatsappBehaviorConfig;
  company: ClientCompany | null;
  entityLabel: string;
  instance: WhatsappState["instance"];
  agentNameDraft: string;
  agentNameChanged: boolean;
  promptChanged: boolean;
  promptTemplateChanged: boolean;
  cloneProfileChanged: boolean;
  qualificationChanged: boolean;
  channelConfigChanged: boolean;
  settingsChanged: boolean;
  behaviorChanged: boolean;
  promptTooLong: boolean;
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
}) {
  const statusMeta = getStatusMeta(instance?.status ?? "draft");
  const displayAgentName = normalizeEditableAgentName(agentNameDraft) || agent.name;
  const changedAreas = [
    agentNameChanged ? "Nome" : null,
    promptChanged ? "Prompt" : null,
    promptTemplateChanged ? "Modelo" : null,
    cloneProfileChanged ? "DNA manual" : null,
    qualificationChanged ? "CRM" : null,
    channelConfigChanged ? "Canais" : null,
    behaviorChanged ? "Comportamento" : null,
  ].filter(Boolean);
  const changeLabel = promptTooLong
    ? "Prompt longo"
    : changedAreas.length > 0
      ? changedAreas.join(", ")
      : "Salvo";

  return (
    <div
      className="sticky top-[68px] z-20 mb-3 rounded-xl border px-2.5 py-2.5 backdrop-blur sm:top-3 sm:mb-4 sm:px-3 sm:py-3"
      style={{
        background: "linear-gradient(135deg, rgba(var(--ch-accent-rgb),0.12), rgba(var(--ch-accent-2-rgb),0.055) 42%, rgba(255,255,255,0.94) 100%), rgba(255,255,255,0.86)",
        borderColor: "rgba(var(--ch-accent-rgb),0.22)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.82), 0 14px 34px rgba(var(--ch-accent-rgb),0.10)",
      }}
    >
      <div className="grid gap-2 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
          <SummaryPill label="Agente" value={displayAgentName} />
          <SummaryPill label={entityLabel} value={company?.name ?? `${entityLabel} nao informado`} />
          <SummaryPill label="WhatsApp" value={statusMeta.label} tone={instance?.status === "connected" ? "green" : "amber"} />
          <SummaryPill label="Conversa" value={formatResponseMode(behavior.responseMode)} />
          <SummaryPill label="Alteracoes" value={changeLabel} tone={settingsChanged ? "amber" : "green"} />
        </div>
        <ActionButton
          icon={Wand2}
          label="Salvar tudo"
          description="Salva as alteracoes feitas nas abas do WhatsApp."
          disabled={disabled}
          loading={saving}
          onClick={onSave}
        />
      </div>
    </div>
  );
}

function WhatsappConsoleTabs({
  activeTab,
  onChange,
  tabs,
}: {
  activeTab: WhatsappConsoleTab;
  onChange: (tab: WhatsappConsoleTab) => void;
  tabs: typeof whatsappConsoleTabs;
}) {
  return (
    <div
      className="mb-3 overflow-hidden rounded-xl border p-1 sm:mb-4 sm:overflow-visible"
      role="tablist"
      aria-label="Secoes do painel WhatsApp"
      style={{ background: "var(--ch-panel)", borderColor: "var(--ch-border-strong)" }}
    >
      <div className="flex min-w-max gap-1 overflow-x-auto pb-1 sm:grid sm:min-w-0 sm:grid-cols-3 sm:overflow-visible sm:pb-0 md:grid-cols-4 xl:grid-cols-7">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          const comingSoon = tab.comingSoon && metaFeatureLaunchPaused;
          const Icon = tab.icon;
          const activeStyle = getWhatsappTabActiveStyle(tab.id);

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              data-connecty-contrast={active ? "dark" : undefined}
              className={cn(
                "grid min-h-[52px] min-w-[132px] grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5 rounded-lg px-2 text-left transition sm:min-h-[58px] sm:min-w-0 sm:gap-2 sm:px-3",
                active
                  ? "connecty-dark-action text-white ring-1 ring-white/25"
                  : comingSoon
                    ? "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                    : "text-slate-600 hover:bg-blue-50 hover:text-blue-700",
              )}
              style={active ? activeStyle : comingSoon ? { border: "1px solid rgba(var(--ch-brand-primary-rgb),0.24)" } : undefined}
              onClick={() => onChange(tab.id)}
            >
              <Icon className={cn("h-4 w-4", active ? "text-white" : comingSoon ? "text-blue-600" : "text-slate-500")} />
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={cn("block truncate text-[12px] font-semibold leading-4", active ? "text-white" : "text-slate-800")}>{tab.label}</span>
                  {comingSoon ? (
                    <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase leading-none text-amber-700">
                      Em breve
                    </span>
                  ) : null}
                </span>
                <span className={cn("mt-0.5 hidden truncate font-mono text-[8px] uppercase tracking-widest sm:block", active ? "text-white/75" : "text-slate-500")}>{tab.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getWhatsappTabActiveStyle(tab: WhatsappConsoleTab) {
  if (tab === "connection") {
    return {
      background: "linear-gradient(135deg, var(--ch-whatsapp-deep), var(--ch-whatsapp))",
      boxShadow: "0 14px 28px rgba(var(--ch-whatsapp-deep-rgb),0.18)",
    };
  }

  if (tab === "prompt" || tab === "behavior" || tab === "files") {
    return {
      background: "linear-gradient(135deg, var(--ch-ai), var(--ch-ai-cyan))",
      boxShadow: "0 14px 28px rgba(var(--ch-ai-rgb),0.18)",
    };
  }

  return {
    background: "linear-gradient(135deg, var(--ch-brand-action), var(--ch-brand-primary))",
    boxShadow: "0 14px 28px rgba(var(--ch-brand-primary-rgb),0.18)",
  };
}

function SummaryPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "amber";
}) {
  const toneStyle = tone === "green"
    ? {
        background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(var(--ch-whatsapp-rgb),0.045))",
        borderColor: "rgba(var(--ch-whatsapp-rgb),0.18)",
        color: "var(--ch-whatsapp-deep)",
      }
    : tone === "amber"
      ? {
          background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(var(--ch-warning-rgb),0.055))",
          borderColor: "rgba(var(--ch-warning-rgb),0.22)",
          color: "var(--ch-warning)",
        }
      : {
          background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(var(--ch-accent-rgb),0.024)), rgba(255,255,255,0.88)",
          borderColor: "rgba(var(--ch-accent-rgb),0.13)",
          color: "var(--ch-text)",
        };

  return (
    <div
      className="min-w-[150px] rounded-lg border px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] sm:min-w-0"
      style={{
        background: toneStyle.background,
        borderColor: toneStyle.borderColor,
      }}
    >
      <p className="truncate font-mono text-[8px] uppercase tracking-widest text-slate-500">{label}</p>
      <p
        className="mt-1 truncate text-[12px] font-semibold leading-4"
        style={{ color: toneStyle.color }}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function ClientAgentsManager({
  agentName,
  agentTemplateId,
  agents,
  companies,
  creating,
  deletingAgentId,
  sectorName,
  selectedAgentId,
  selectedCompanyId,
  showForm,
  onAgentNameChange,
  onAgentTemplateChange,
  onCancel,
  onClone,
  onCreate,
  onDelete,
  onSectorNameChange,
  onSelectAgent,
  onSelectCompany,
  onStart,
  variant,
}: {
  agentName: string;
  agentTemplateId: AgentPromptTemplateId;
  agents: ClientWhatsappAgent[];
  companies: ClientCompany[];
  creating: boolean;
  deletingAgentId: string | null;
  sectorName: string;
  selectedAgentId: string;
  selectedCompanyId: string;
  showForm: boolean;
  onAgentNameChange: (value: string) => void;
  onAgentTemplateChange: (value: string) => void;
  onCancel: () => void;
  onClone: (sourceAgentId: string, input: { companyId: string; name: string; sectorName: string }) => Promise<void>;
  onCreate: () => void;
  onDelete: (agent: ClientWhatsappAgent) => Promise<void>;
  onSectorNameChange: (value: string) => void;
  onSelectAgent: (value: string) => void;
  onSelectCompany: (value: string) => void;
  onStart: () => void;
  variant: WhatsappConsoleVariant;
}) {
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [cloneCompanyId, setCloneCompanyId] = useState(selectedCompanyId);
  const [cloneName, setCloneName] = useState("");
  const [cloneSectorName, setCloneSectorName] = useState("");
  const cloneSource = agents.find((agent) => agent.id === cloneSourceId) ?? null;

  function openClone(agent: ClientWhatsappAgent) {
    setCloneSourceId(agent.id);
    setCloneCompanyId(agent.companyId);
    setCloneName(`Copia de ${agent.name}`);
    setCloneSectorName(agent.sectorName);
  }

  async function submitClone() {
    if (!cloneSource) return;

    await onClone(cloneSource.id, {
      companyId: cloneCompanyId || cloneSource.companyId,
      name: cloneName || `Copia de ${cloneSource.name}`,
      sectorName: cloneSectorName || cloneSource.sectorName,
    });
    setCloneSourceId(null);
  }

  return (
    <Panel
      title="Agentes WhatsApp"
      eyebrow="escolher / criar / clonar"
      action={<NeonBadge tone="cyan">{agents.length.toLocaleString("pt-BR")} agentes</NeonBadge>}
      className="mb-3 sm:mb-4"
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {agents.length > 0 ? agents.map((agent) => {
            const active = agent.id === selectedAgentId;
            const deleting = deletingAgentId === agent.id;

            return (
              <div
                key={agent.id}
                className="rounded-xl border p-3 transition"
                style={{
                  background: active ? "rgba(var(--ch-accent-rgb),0.12)" : "var(--ch-panel-2)",
                  borderColor: active ? "rgba(var(--ch-accent-rgb),0.58)" : "var(--ch-border)",
                  boxShadow: active ? "0 0 24px rgba(var(--ch-accent-rgb),0.12)" : "none",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
                      {agent.name}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-slate-400">
                      {agent.companyName} / {agent.sectorName}
                    </p>
                  </div>
                  <NeonBadge tone={active ? "green" : "amber"}>{active ? "aberto" : agent.status}</NeonBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <SecondaryAction
                    icon={Eye}
                    label={active ? "Aberto" : "Abrir"}
                    disabled={active || creating || deleting}
                    onClick={() => onSelectAgent(agent.id)}
                  />
                  <SecondaryAction
                    icon={Copy}
                    label="Clonar"
                    disabled={creating || deleting}
                    onClick={() => openClone(agent)}
                  />
                  <SecondaryAction
                    icon={Trash2}
                    label={deleting ? "Excluindo" : "Excluir"}
                    loading={deleting}
                    disabled={creating}
                    tone="danger"
                    onClick={() => onDelete(agent)}
                  />
                </div>
              </div>
            );
          }) : (
            <div className="rounded-xl border p-4 text-[13px] text-slate-400" style={{ background: "var(--ch-panel-2)", borderColor: "var(--ch-border)" }}>
              Nenhum agente criado ainda. Crie o primeiro agente para liberar conexao, prompt e comportamento.
            </div>
          )}
        </div>

        <ActionButton
          icon={Plus}
          label={showForm ? "Formulario aberto" : "Novo agente"}
          disabled={showForm || creating}
          tone="ai"
          onClick={onStart}
        />
      </div>

      {showForm ? (
        <div className="mt-4 rounded-xl p-4" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">{variant.agentGateSelectLabel}</span>
              <select
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                value={selectedCompanyId}
                onChange={(event) => onSelectCompany(event.target.value)}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Modelo de atendimento</span>
              <select
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                value={agentTemplateId}
                onChange={(event) => onAgentTemplateChange(event.target.value)}
              >
                {agentPromptTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do agente</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                placeholder="Ex: Gustavo Vendas"
                value={agentName}
                onChange={(event) => onAgentNameChange(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Setor</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                placeholder="Ex: Vendas, Suporte, Financeiro"
                value={sectorName}
                onChange={(event) => onSectorNameChange(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <SecondaryAction icon={X} label="Fechar" disabled={creating} onClick={onCancel} />
            <ActionButton icon={Wand2} label="Criar agente" disabled={creating || !selectedCompanyId} loading={creating} tone="ai" onClick={onCreate} />
          </div>
        </div>
      ) : null}

      {cloneSource ? (
        <div className="mt-4 rounded-xl p-4" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Clonar configuracao</p>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{cloneSource.name}</p>
              <p className="mt-1 text-[11px] text-slate-400">O clone copia prompt e controles, mas nasce sem instancia WhatsApp.</p>
            </div>
            <SecondaryAction icon={X} label="Fechar" disabled={creating} onClick={() => setCloneSourceId(null)} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Empresa destino</span>
              <select
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                value={cloneCompanyId}
                onChange={(event) => setCloneCompanyId(event.target.value)}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do clone</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                value={cloneName}
                onChange={(event) => setCloneName(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Setor destino</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                value={cloneSectorName}
                onChange={(event) => setCloneSectorName(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-4">
            <ActionButton
              icon={Copy}
              label="Clonar agente"
              disabled={creating || !cloneName.trim() || !cloneCompanyId}
              loading={creating}
              tone="ai"
              onClick={submitClone}
            />
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function InternalAgentsManager({
  agent,
  agentName,
  archiving,
  companies,
  creating,
  editing,
  editAutomationRoles,
  editDescription,
  editName,
  editPersonaName,
  editRoleTitle,
  instance,
  sectorDescription,
  sectorName,
  selectedCompany,
  selectedCompanyId,
  showEdit,
  showForm,
  onAgentNameChange,
  onArchive,
  onCancel,
  onCreate,
  onEditAutomationRoleChange,
  onEditCancel,
  onEditDescriptionChange,
  onEditNameChange,
  onEditPersonaNameChange,
  onEditRoleTitleChange,
  onEditSave,
  onEditStart,
  onSectorDescriptionChange,
  onSectorNameChange,
  onSelectCompany,
  onStart,
  variant,
}: {
  agent: WhatsappState["agent"];
  agentName: string;
  archiving: boolean;
  companies: ClientCompany[];
  creating: boolean;
  editing: boolean;
  editAutomationRoles: AgentAutomationRoles;
  editDescription: string;
  editName: string;
  editPersonaName: string;
  editRoleTitle: string;
  instance: WhatsappState["instance"];
  sectorDescription: string;
  sectorName: string;
  selectedCompany: ClientCompany | null;
  selectedCompanyId: string;
  showEdit: boolean;
  showForm: boolean;
  onAgentNameChange: (value: string) => void;
  onArchive: () => void;
  onCancel: () => void;
  onCreate: () => void;
  onEditAutomationRoleChange: (role: AgentAutomationRoleKey, enabled: boolean) => void;
  onEditCancel: () => void;
  onEditDescriptionChange: (value: string) => void;
  onEditNameChange: (value: string) => void;
  onEditPersonaNameChange: (value: string) => void;
  onEditRoleTitleChange: (value: string) => void;
  onEditSave: () => void;
  onEditStart: () => void;
  onSectorDescriptionChange: (value: string) => void;
  onSectorNameChange: (value: string) => void;
  onSelectCompany: (value: string) => void;
  onStart: () => void;
  variant: WhatsappConsoleVariant;
}) {
  const connectionLabel = instance?.status === "connected"
    ? "Conectado"
    : instance?.status === "qr_pending"
      ? "QR pendente"
      : instance?.status
        ? instance.status
        : "Sem conexao";
  const currentAutomationRoles = normalizeAgentAutomationRoles(agent?.automationRoles);
  const activeAutomationLabels = [
    currentAutomationRoles.signup_whatsapp_verification ? "Validacao cadastro" : null,
    currentAutomationRoles.trial_welcome ? "Boas-vindas trial" : null,
    currentAutomationRoles.trial_conversion ? "Conversao trial" : null,
  ].filter((label): label is string => Boolean(label));

  return (
    <Panel
      title="Agentes internos"
      eyebrow="criar / alternar"
      action={<NeonBadge tone="cyan">{companies.length.toLocaleString("pt-BR")} agentes</NeonBadge>}
      className="mb-3 sm:mb-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,auto)]">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Agente / setor ativo</span>
            <select
              className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
              disabled={companies.length === 0}
              value={selectedCompanyId}
              onChange={(event) => onSelectCompany(event.target.value)}
            >
              {companies.length === 0 ? (
                <option value="">Nenhum agente interno</option>
              ) : null}
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <InfoTile label={variant.agentGateSelectedLabel} value={selectedCompany?.name ?? "Nenhum"} />
            <InfoTile label="WhatsApp" value={connectionLabel} />
          </div>
        </div>

        <ActionButton
          icon={Plus}
          label={showForm ? "Formulario aberto" : "Novo agente"}
          disabled={showForm}
          onClick={onStart}
        />
      </div>

      {agent ? (
        <div
          className="mt-4 grid gap-3 rounded-xl p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
                {agent.name}
              </h3>
              <NeonBadge tone={instance?.status === "connected" ? "green" : "amber"}>{connectionLabel}</NeonBadge>
              {agent.status ? <NeonBadge tone="cyan">{agent.status}</NeonBadge> : null}
              {activeAutomationLabels.map((label) => (
                <NeonBadge key={label} tone="violet">{label}</NeonBadge>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-5 text-slate-500">
              {agent.roleTitle ?? variant.agentRoleTitle}
              {agent.description ? ` / ${agent.description}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <SecondaryAction icon={PenLine} label="Editar agente" disabled={editing || archiving} onClick={onEditStart} />
            <SecondaryAction
              icon={Trash2}
              label="Arquivar"
              tone="danger"
              disabled={editing || archiving || instance?.status === "connected"}
              loading={archiving}
              description={instance?.status === "connected" ? "Desconecte antes de arquivar." : undefined}
              onClick={onArchive}
            />
          </div>
        </div>
      ) : null}

      {showEdit && agent ? (
        <div
          className="mt-4 rounded-xl p-4"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome interno</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                placeholder="Ex: Agente validacao"
                value={editName}
                onChange={(event) => onEditNameChange(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome/persona</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                placeholder="Ex: Ana ConnectyHub"
                value={editPersonaName}
                onChange={(event) => onEditPersonaNameChange(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Funcao</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                placeholder="Ex: Agente de onboarding"
                value={editRoleTitle}
                onChange={(event) => onEditRoleTitleChange(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Descricao</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                placeholder="Ex: Envia codigos e lembretes"
                value={editDescription}
                onChange={(event) => onEditDescriptionChange(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <AutomationRoleToggle
              checked={editAutomationRoles.signup_whatsapp_verification}
              label="Validacao no cadastro"
              description="Pode enviar codigo para confirmar o WhatsApp do novo usuario."
              onChange={(enabled) => onEditAutomationRoleChange("signup_whatsapp_verification", enabled)}
            />
            <AutomationRoleToggle
              checked={editAutomationRoles.trial_welcome}
              label="Boas-vindas do trial"
              description="Pode acionar novos usuarios durante os 7 dias gratis."
              onChange={(enabled) => onEditAutomationRoleChange("trial_welcome", enabled)}
            />
            <AutomationRoleToggle
              checked={editAutomationRoles.trial_conversion}
              label="Conversao do trial"
              description="Pode chamar o lead perto do fim do teste ou sem creditos."
              onChange={(enabled) => onEditAutomationRoleChange("trial_conversion", enabled)}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <SecondaryAction icon={X} label="Cancelar" disabled={editing} onClick={onEditCancel} />
            <ActionButton icon={ShieldCheck} label="Salvar edicao" disabled={editing || !editName.trim()} loading={editing} onClick={onEditSave} />
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div
          className="mt-4 rounded-xl p-4"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Setor interno</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                placeholder="Ex: Suporte comercial"
                value={sectorName}
                onChange={(event) => onSectorNameChange(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do agente</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                placeholder="Ex: Lucas Atendimento"
                value={agentName}
                onChange={(event) => onAgentNameChange(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Descricao</span>
              <input
                className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                placeholder="Ex: Atende novos leads"
                value={sectorDescription}
                onChange={(event) => onSectorDescriptionChange(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {companies.length > 0 ? (
              <SecondaryAction icon={X} label="Fechar" disabled={creating} onClick={onCancel} />
            ) : null}
            <ActionButton icon={Wand2} label="Criar agente" disabled={creating || !sectorName.trim()} loading={creating} onClick={onCreate} />
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function AutomationRoleToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex min-h-[84px] cursor-pointer items-start gap-3 rounded-lg border p-3 transition hover:border-cyan-300/35"
      style={{ background: "var(--ch-panel-2)", borderColor: "var(--ch-border)" }}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 rounded border-blue-200 bg-white accent-emerald-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{label}</span>
        <span className="mt-1 block text-[11px] leading-5 text-slate-500">{description}</span>
      </span>
    </label>
  );
}

function AgentCreationGate({
  agentName,
  agentTemplateId,
  companies,
  creating,
  sectorName,
  selectedCompany,
  selectedCompanyId,
  showForm,
  onAgentNameChange,
  onAgentTemplateChange,
  onCancel,
  onCreate,
  onSectorNameChange,
  onSelectCompany,
  onStart,
  variant,
}: {
  agentName: string;
  agentTemplateId: AgentPromptTemplateId;
  companies: ClientCompany[];
  creating: boolean;
  sectorName: string;
  selectedCompany: ClientCompany | null;
  selectedCompanyId: string;
  showForm: boolean;
  onAgentNameChange: (value: string) => void;
  onAgentTemplateChange: (value: string) => void;
  onCancel: () => void;
  onCreate: () => void;
  onSectorNameChange: (value: string) => void;
  onSelectCompany: (value: string) => void;
  onStart: () => void;
  variant: WhatsappConsoleVariant;
}) {
  return (
    <Panel
      title="Criar agente WhatsApp"
      eyebrow={variant.agentGateEyebrow}
      action={<NeonBadge tone="violet">novo clone</NeonBadge>}
    >
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.7fr)]">
        <div
          className="rounded-xl p-4 sm:p-5"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
              style={{ background: "rgba(var(--ch-ai-rgb),0.10)", color: "var(--ch-ai)" }}
            >
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>{variant.agentGateTitle}</h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">
                {variant.agentGateDescription}
              </p>
            </div>
          </div>

          {selectedCompany ? (
            <div className="mt-5 max-w-md">
              <InfoTile label={variant.agentGateSelectedLabel} value={selectedCompany.name} />
            </div>
          ) : null}

          {!showForm ? (
            <div className="mt-5">
              <ActionButton icon={Plus} label="Criar agente" tone="ai" onClick={onStart} />
            </div>
          ) : null}
        </div>

        {showForm ? (
          <div
            className="rounded-xl p-4 sm:p-5"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">{variant.agentGateSelectLabel}</span>
                <select
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                  value={selectedCompanyId}
                  onChange={(event) => onSelectCompany(event.target.value)}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Modelo de atendimento</span>
                <select
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                  value={agentTemplateId}
                  onChange={(event) => onAgentTemplateChange(event.target.value)}
                >
                  {agentPromptTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do agente</span>
                <input
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                  placeholder="Ex: Agente comercial"
                  value={agentName}
                  onChange={(event) => onAgentNameChange(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Setor</span>
                <input
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                  placeholder="Ex: Vendas, Suporte, Financeiro"
                  value={sectorName}
                  onChange={(event) => onSectorNameChange(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <SecondaryAction icon={RefreshCcw} label="Cancelar" disabled={creating} onClick={onCancel} />
              <ActionButton icon={Wand2} label="Salvar agente" disabled={creating || !selectedCompanyId} loading={creating} tone="ai" onClick={onCreate} />
            </div>
          </div>
        ) : (
          <div
            className="grid min-h-[180px] place-items-center rounded-xl p-4 text-center sm:min-h-[220px] sm:p-5"
            style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}
          >
            <div className="max-w-xs">
              <Building2 className="mx-auto h-7 w-7" style={{ color: "var(--ch-whatsapp-deep)" }} />
              <p className="mt-3 text-[13px] leading-6 text-slate-500">
                {variant.agentGateSideDescription}
              </p>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function AgentIdentityCard({
  agent,
  agentNameChanged = false,
  agentNameDraft,
  agentNameInvalid = false,
  company,
  entityLabel = "Empresa",
  onAgentNameChange,
}: {
  agent: NonNullable<WhatsappState["agent"]>;
  agentNameChanged?: boolean;
  agentNameDraft?: string;
  agentNameInvalid?: boolean;
  company: ClientCompany | null;
  entityLabel?: string;
  onAgentNameChange?: (value: string) => void;
}) {
  const companyStatus = company ? `${company.planCode} / ${company.status}` : "Plano nao informado";
  const canEditName = Boolean(onAgentNameChange);

  return (
    <div
      className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2 xl:grid-cols-4"
      style={{ background: "var(--ch-panel-2)", borderColor: "var(--ch-border-strong)" }}
    >
      {canEditName ? (
        <label
          className={cn(
            "min-w-0 rounded-lg px-3 py-2 transition",
            agentNameInvalid
              ? "ring-1 ring-rose-400/70"
              : agentNameChanged
                ? "ring-1 ring-amber-300/60"
                : "focus-within:ring-1 focus-within:ring-cyan-300/50",
          )}
          style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}
        >
          <span className="font-mono text-[9px] uppercase tracking-wide text-slate-500">Agente</span>
          <input
            aria-invalid={agentNameInvalid}
            className="mt-1 block h-5 w-full min-w-0 bg-transparent p-0 text-[12px] font-semibold leading-4 outline-none placeholder:text-slate-500"
            maxLength={agentNameMaxLength}
            placeholder="Nome do agente"
            style={{ color: "var(--ch-text)" }}
            title="Nome do agente"
            value={agentNameDraft ?? agent.name}
            onChange={(event) => onAgentNameChange?.(event.target.value)}
          />
          {agentNameInvalid || agentNameChanged ? (
            <span className={cn("mt-1 block text-[10px] leading-4", agentNameInvalid ? "text-rose-600" : "text-amber-600")}>
              {agentNameInvalid ? "Informe pelo menos 2 caracteres." : "Nome alterado, salve para aplicar."}
            </span>
          ) : null}
        </label>
      ) : (
        <InfoTile label="Agente" value={agent.name} />
      )}
      <InfoTile label={entityLabel} value={company?.name ?? `${entityLabel} nao informado`} />
      <InfoTile label="Plano" value={companyStatus} />
      <InfoTile label="Ultima edicao" value={formatDate(agent.updatedAt)} />
    </div>
  );
}

function WhatsappAvatar({
  alt,
  fallback,
  imageUrl,
  size = "md",
}: {
  alt: string;
  fallback: string;
  imageUrl: string | null;
  size?: "md" | "lg" | "xl";
}) {
  const dimension = size === "xl" ? "h-28 w-28" : size === "lg" ? "h-14 w-14" : "h-10 w-10";

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-2xl border", dimension)}
      style={{ background: "rgba(var(--ch-whatsapp-rgb),0.10)", borderColor: "rgba(var(--ch-whatsapp-rgb),0.24)", color: "var(--ch-whatsapp-deep)" }}
      title={imageUrl ? "Foto do WhatsApp conectado" : "Foto aparece quando o WhatsApp estiver conectado"}
    >
      {imageUrl ? (
        <Image
          alt={alt}
          className="object-cover"
          fill
          sizes={size === "xl" ? "112px" : size === "lg" ? "56px" : "40px"}
          src={imageUrl}
          unoptimized
        />
      ) : (
        <span className="font-mono text-[12px] font-bold uppercase tracking-widest">{getInitials(fallback)}</span>
      )}
    </div>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={text}
          className="inline-flex shrink-0 cursor-help items-center align-middle outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/45"
          role="button"
          tabIndex={0}
        >
          <CircleHelp className="h-3.5 w-3.5 text-current opacity-70 transition hover:opacity-100" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        align="center"
        className="z-[1000] max-w-[280px] border border-slate-200 bg-white px-3 py-2 text-left font-sans text-[11px] normal-case leading-5 tracking-normal text-slate-950 shadow-[0_16px_40px_rgba(15,23,42,0.16)] ring-1 ring-slate-950/5 [&>svg]:bg-white [&>svg]:fill-white"
        collisionPadding={16}
        data-connecty-infohint="true"
        side="top"
        sideOffset={8}
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function GuidedPromptBuilder({
  config,
  improving,
  knowledgeFileCount,
  productCount,
  onChange,
  onGeneratePrompt,
  onImproveComplement,
}: {
  config: AgentPromptBuilderConfig;
  improving: boolean;
  knowledgeFileCount: number;
  productCount: number;
  onChange: (patch: Partial<AgentPromptBuilderConfig>) => void;
  onGeneratePrompt: () => void;
  onImproveComplement: () => void;
}) {
  const template = agentPromptTemplates.find((item) => item.id === config.templateId) ?? agentPromptTemplates[0];

  return (
    <BehaviorSection
      title="Construtor guiado do prompt"
      description="Escolha o nicho e preencha campos simples. O sistema gera o prompt comercial completo mantendo as regras de botoes, checkout e catalogo."
    >
      <div className="grid gap-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
              Nicho / profissao do agente
              <InfoHint text="Esse modelo cria a base do prompt. O usuario ainda pode ajustar campos e o comportamento do agente nas outras abas." />
            </span>
            <select
              className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
              value={config.templateId}
              onChange={(event) => onChange({ templateId: event.target.value as AgentPromptTemplateId })}
            >
              {agentPromptTemplates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border px-3 py-2" style={{ background: "var(--ch-panel-2)", borderColor: "var(--ch-border)" }}>
            <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{template.niche}</p>
            <p className="mt-1 text-[12px] leading-5 text-slate-300">{template.summary}</p>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <InfoTile label="Produtos no contexto" value={productCount.toLocaleString("pt-BR")} />
          <InfoTile label="Conhecimento" value={`${knowledgeFileCount.toLocaleString("pt-BR")} arquivos`} />
          <InfoTile label="Checkout" value="Botao obrigatorio" />
        </div>

        <TextAreaField
          label="Informacoes extras da empresa"
          description="Campo principal para personalizar o agente. Produtos, precos e links ja entram automaticamente pelo Catalogo/Produtos."
          minHeight="140px"
          placeholder="Cole aqui detalhes da empresa. Se quiser, use Melhorar com IA; essa acao consome os creditos da empresa."
          value={config.companyComplement}
          onChange={(companyComplement) => onChange({ companyComplement })}
        />

        <BehaviorSection
          title="Ajustes avancados do modelo"
          description="Opcional. O modelo do nicho ja preenche estes campos; ajuste somente quando precisar de uma regra especifica."
        >
          <div className="grid gap-3 xl:grid-cols-2">
            <TextAreaField
              label="Tom de voz"
              description="Como o agente deve soar no WhatsApp."
              minHeight="84px"
              value={config.tone}
              onChange={(tone) => onChange({ tone })}
            />
            <TextAreaField
              label="Objetivo do atendimento"
              description="Resultado principal esperado em cada conversa."
              minHeight="84px"
              value={config.objective}
              onChange={(objective) => onChange({ objective })}
            />
            <TextAreaField
              label="Publico e qualificacao"
              description="Quem compra e quais dados o agente precisa levantar."
              minHeight="84px"
              value={config.audience}
              onChange={(audience) => onChange({ audience })}
            />
            <TextAreaField
              label="Regras de venda"
              description="Como recomendar, comparar, oferecer combos e fechar."
              minHeight="84px"
              value={config.salesRules}
              onChange={(salesRules) => onChange({ salesRules })}
            />
            <TextAreaField
              label="Entrega, pagamento e pos-venda"
              description="Frete, retirada, agenda, reserva, garantias e proximos passos."
              minHeight="84px"
              placeholder="Ex: confirmar endereco antes do checkout; retirada na loja; prazo informado somente quando cadastrado."
              value={config.fulfillmentRules}
              onChange={(fulfillmentRules) => onChange({ fulfillmentRules })}
            />
            <TextAreaField
              label="Quando chamar humano"
              description="Situacoes que exigem atendimento manual."
              minHeight="84px"
              value={config.humanHandoffRules}
              onChange={(humanHandoffRules) => onChange({ humanHandoffRules })}
            />
            <div className="xl:col-span-2">
              <TextAreaField
                label="O que nunca fazer"
                description="Limites especificos deste cliente alem dos limites automaticos da ConnectyHub."
                minHeight="84px"
                value={config.neverRules}
                onChange={(neverRules) => onChange({ neverRules })}
              />
            </div>
          </div>
        </BehaviorSection>

        <div className="flex flex-wrap gap-2">
          <SecondaryAction
            icon={Wand2}
            label={improving ? "Melhorando" : "Melhorar complemento IA"}
            description="Usa IA para organizar o complemento da empresa. Essa acao consome creditos da conta."
            disabled={improving || config.companyComplement.trim().length < 12}
            loading={improving}
            onClick={onImproveComplement}
          />
          <ActionButton
            icon={PenLine}
            label="Gerar prompt pelo modelo"
            description="Atualiza o prompt tecnico avancado usando nicho, complemento e regras. Esta acao local nao usa IA."
            onClick={onGeneratePrompt}
          />
        </div>
      </div>
    </BehaviorSection>
  );
}

function PromptBox({
  label,
  description,
  value,
  helper,
  maxLength,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  helper: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
      <textarea
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[240px] w-full resize-y rounded-xl border px-3 py-3 font-mono text-[12px] leading-5 outline-none sm:min-h-[320px] sm:px-4"
        placeholder="Defina o comportamento do agente."
      />
      <span className="mt-2 block font-mono text-[10px] uppercase tracking-widest text-slate-500">{helper}</span>
    </label>
  );
}

function CloneProfileEditor({
  profile,
  importStatus,
  importing,
  canImport,
  changed,
  onGenerateFromHistory,
  onChange,
}: {
  profile: WhatsappCloneProfile;
  importStatus?: CloneProfileImportStatus;
  importing: boolean;
  canImport: boolean;
  changed: boolean;
  onGenerateFromHistory: () => void;
  onChange: (value: Partial<WhatsappCloneProfile>) => void;
}) {
  const activeFields = countCloneProfileFields(profile);
  const status = importStatus ?? null;
  const importBusy = importing || status?.status === "queued" || status?.status === "running";

  return (
    <BehaviorSection
      title="DNA manual do agente"
      description="Perfil opcional para ensinar estilo, tom, ritmo e jeito de vender manualmente ou a partir do historico do WhatsApp."
    >
      <div className="grid gap-3">
        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)_minmax(240px,0.58fr)]">
          <ToggleTile
            icon={UserRound}
            label="Usar DNA manual"
            description="Quando ligado, estas regras entram no contexto de toda resposta deste agente."
            checked={profile.enabled}
            onChange={() => onChange({ enabled: !profile.enabled, source: "manual" })}
          />
          <div className="rounded-lg border px-3 py-2" style={{ background: "var(--ch-panel-2)", borderColor: "var(--ch-border)" }}>
            <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Resumo</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <PromptCheck label={profile.enabled ? "DNA ativo" : "DNA pausado"} active={profile.enabled} />
              <PromptCheck label={`${activeFields}/12 campos`} active={activeFields >= 4} />
              <PromptCheck label={profile.source === "history" ? "Historico" : "Manual"} active />
              <PromptCheck label={changed ? "Alterado" : "Salvo"} active={!changed} />
            </div>
          </div>
          <div className="rounded-lg border px-3 py-2" style={{ background: "var(--ch-panel-2)", borderColor: "var(--ch-border)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Historico</p>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">
                  {formatCloneProfileImportStatus(status)}
                </p>
              </div>
              <SecondaryAction
                icon={Wand2}
                label={importBusy ? "Gerando" : "Gerar pelo historico"}
                description="Analisa uma amostra recente de mensagens humanas enviadas pelo WhatsApp conectado e preenche este DNA."
                disabled={!canImport || importBusy}
                loading={importBusy}
                onClick={onGenerateFromHistory}
              />
            </div>
            {status?.status === "succeeded" ? (
              <p className="mt-2 text-[10px] leading-4 text-emerald-700">
                {status.outboundSamples} saidas usadas em {status.sampledChats} chats.
              </p>
            ) : null}
            {status?.status === "failed" && status.error ? (
              <p className="mt-2 text-[10px] leading-4 text-rose-700">{status.error}</p>
            ) : null}
            {!canImport ? (
              <p className="mt-2 text-[10px] leading-4 text-amber-700">Conecte o WhatsApp para liberar a leitura do historico.</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <TextField
            label="Nome de assinatura"
            description="Nome que representa a pessoa ou estilo que este agente deve assumir."
            value={profile.displayName}
            onChange={(displayName) => onChange({ displayName, source: "manual" })}
          />
          <TextAreaField
            label="Identidade"
            description="Quem essa pessoa e no atendimento, cargo, postura e papel comercial."
            minHeight="96px"
            placeholder="Ex.: consultor direto, experiente, passa seguranca e entende do produto na pratica."
            value={profile.roleIdentity}
            onChange={(roleIdentity) => onChange({ roleIdentity, source: "manual" })}
          />
          <TextAreaField
            label="Tom e energia"
            description="Como fala quando o lead esta frio, quente, inseguro ou decidido."
            placeholder="Ex.: casual, confiante, sem parecer vendedor empurrando."
            value={profile.tone}
            onChange={(tone) => onChange({ tone, source: "manual" })}
          />
          <TextAreaField
            label="Vocabulario"
            description="Palavras, gírias e expressões que combinam com a pessoa, sem abreviações de chat."
            placeholder="Ex.: show, boa, fechado, me diz uma coisa, top demais, combinado."
            value={profile.vocabulary}
            onChange={(vocabulary) => onChange({ vocabulary, source: "manual" })}
          />
          <TextAreaField
            label="Ritmo de resposta"
            description="Tamanho dos blocos, quando perguntar, quando responder curto e quando detalhar."
            placeholder="Ex.: responde em blocos curtos, faz uma pergunta por vez, nao manda textao."
            value={profile.responseRhythm}
            onChange={(responseRhythm) => onChange({ responseRhythm, source: "manual" })}
          />
          <TextAreaField
            label="Estilo de venda"
            description="Como recomenda, compara opcoes, conduz para link, agenda ou humano."
            placeholder="Ex.: recomenda 1 ou 2 opcoes, explica o motivo e manda o botao certo."
            value={profile.salesStyle}
            onChange={(salesStyle) => onChange({ salesStyle, source: "manual" })}
          />
          <TextAreaField
            label="Objecoes"
            description="Como responde preco, medo, duvida, atraso, comparacao e lead indeciso."
            placeholder="Ex.: acolhe a duvida, explica simples, nao briga e chama para o proximo passo."
            value={profile.objectionStyle}
            onChange={(objectionStyle) => onChange({ objectionStyle, source: "manual" })}
          />
          <TextAreaField
            label="Fechamento"
            description="Como chama para acao sem parecer robo ou vendedor insistente."
            placeholder="Ex.: pergunta se quer que envie o link, confirma cidade, ou chama o humano quando precisa."
            value={profile.closingStyle}
            onChange={(closingStyle) => onChange({ closingStyle, source: "manual" })}
          />
          <TextAreaField
            label="Emoji"
            description="Quando usa emoji, quando evita e quais combinam com a pessoa."
            placeholder="Ex.: emoji com moderacao; usa fogo ou joinha quando o lead esta animado."
            value={profile.emojiStyle}
            onChange={(emojiStyle) => onChange({ emojiStyle, source: "manual" })}
          />
          <TextAreaField
            label="Audio"
            description="Quando prefere audio e como deve soar quando responde por voz."
            placeholder="Ex.: audio so para explicar algo mais longo, tom tranquilo e direto."
            value={profile.audioStyle}
            onChange={(audioStyle) => onChange({ audioStyle, source: "manual" })}
          />
          <TextAreaField
            label="Nao fazer"
            description="Padroes que quebram o clone ou nao combinam com a pessoa."
            placeholder="Ex.: nao chamar cliente pelo nome da empresa, nao prometer link sem enviar, nao ser formal."
            value={profile.forbiddenPatterns}
            onChange={(forbiddenPatterns) => onChange({ forbiddenPatterns, source: "manual" })}
          />
        </div>

        <TextAreaField
          label="Notas livres"
          description="Regras extras que nao cabem nos campos acima."
          minHeight="96px"
          placeholder="Detalhes de personalidade, contexto comercial e cuidados do atendimento."
          value={profile.notes}
          onChange={(notes) => onChange({ notes, source: "manual" })}
        />
      </div>
    </BehaviorSection>
  );
}

function CloneRealTestPanel({
  summary,
  enabled,
}: {
  summary?: CloneRealTestSummary;
  enabled: boolean;
}) {
  const data = summary ?? emptyCloneRealTestSummary();
  const hasEvents = data.events.length > 0;

  return (
    <BehaviorSection
      title="Metrica de humanizacao"
      description="Mostra se o clone respondeu completo, natural, variado, contextual, com links corretos, sem prometer sem entregar e mantendo o estilo."
    >
      <div className="grid gap-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <InfoTile label="Modo" value={enabled ? "Ativo" : "Pausado"} />
          <InfoTile label="Testes lidos" value={String(data.total)} />
          <InfoTile label="Humanizacao" value={formatCloneScore(data.averageScore)} />
          <InfoTile label="Alertas" value={String(data.reviewCount)} />
        </div>

        {hasEvents ? (
          <div className="grid gap-2">
            {data.events.slice(0, 5).map((event) => (
              <div key={event.id} className="rounded-lg border px-3 py-2" style={{ background: "var(--ch-panel-2)", borderColor: "var(--ch-border)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{event.title}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">{event.summary || "Resposta sem resumo salvo."}</p>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-md px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest",
                    event.reviewFlags.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700",
                  )}>
                    {formatCloneScore(event.humanizationScore ?? event.score)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                  <span>{formatDate(event.createdAt)}</span>
                  <span>{event.outboundMessages} msg</span>
                  <span>{event.outboundModes.join(", ") || "texto"}</span>
                  <span>{event.linkCount} links</span>
                  {event.usedSharedCompanyContext ? <span>memoria empresa</span> : null}
                  {event.cloneProfileEnabled ? <span>DNA ativo</span> : null}
                </div>
                {event.humanizationMetrics.length ? (
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                    {event.humanizationMetrics.map((metric) => (
                      <div
                        key={`${event.id}-${metric.key}`}
                        className="rounded-md border px-2 py-1.5"
                        style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface)" }}
                        title={metric.reason}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[10px] font-semibold text-slate-600">{metric.label}</span>
                          <span className={cn("font-mono text-[9px] font-bold", getHumanizationMetricTextColor(metric.status))}>
                            {formatCloneScore(metric.score)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blue-100">
                          <span
                            className={cn("block h-full rounded-full", getHumanizationMetricBarColor(metric.status))}
                            style={{ width: `${Math.max(4, Math.min(100, Math.round(metric.score * 100)))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {event.reviewFlags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {event.reviewFlags.map((flag) => (
                      <span key={flag} className="rounded-md border border-amber-300/35 bg-amber-50 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-amber-800">
                        {formatCloneReviewFlag(flag)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border px-3 py-6 text-center text-[12px] leading-5 text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
            Nenhuma metrica registrada ainda. As metricas aparecem aqui automaticamente quando houver registros reais suficientes.
          </div>
        )}
      </div>
    </BehaviorSection>
  );
}

function CloneMemoryPanel({
  memory,
  enabled,
}: {
  memory?: WhatsappCloneMemory;
  enabled: boolean;
}) {
  const data = normalizeWhatsappCloneMemory(memory ?? defaultWhatsappCloneMemory);
  const groups = [
    { label: "Estilo", values: data.stylePatterns },
    { label: "Frases", values: data.phrasePatterns },
    { label: "Venda", values: data.salesPatterns },
    { label: "Correcoes", values: data.correctionNotes },
    { label: "Evitar", values: data.avoidPatterns },
  ].filter((group) => group.values.length > 0);
  const hasMemory = Boolean(data.summary || groups.length);

  return (
    <BehaviorSection
      title="Memoria do clone"
      description="Aprendizados vivos de estilo deste agente. Nao guarda lead, produto, preco, link ou dado de outra empresa."
    >
      <div className="grid gap-3">
        <div className="grid gap-2 md:grid-cols-3">
          <InfoTile label="Modo" value={enabled ? "Ativa" : "Pausada"} />
          <InfoTile label="Aprendizados" value={String(groups.reduce((total, group) => total + group.values.length, 0))} />
          <InfoTile label="Atualizada" value={data.updatedAt ? formatDate(data.updatedAt) : "Ainda nao"} />
        </div>

        {hasMemory ? (
          <div className="grid gap-2">
            {data.summary ? (
              <div className="rounded-lg border px-3 py-2 text-[12px] leading-5 text-slate-600" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel-2)" }}>
                {data.summary}
              </div>
            ) : null}
            {groups.map((group) => (
              <div key={group.label} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel-2)" }}>
                <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{group.label}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.values.map((value) => (
                    <span key={`${group.label}-${value}`} className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] leading-4 text-indigo-700">
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border px-3 py-6 text-center text-[12px] leading-5 text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
            A memoria do clone ainda esta vazia. Ela vai aprender estilo e correcoes nas proximas conversas reais quando o controle estiver ativo.
          </div>
        )}
      </div>
    </BehaviorSection>
  );
}

function KnowledgeFilesPanel({
  files,
  knowledgeUploading,
  onUploadFile,
}: {
  files: KnowledgeFile[];
  knowledgeUploading: boolean;
  onUploadFile: (file: File | null) => void;
}) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
          Materiais de conhecimento
          <InfoHint text="Arquivos adicionam contexto ao agente sem deixar o prompt grande demais." />
        </p>
        <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-indigo-700 transition hover:bg-indigo-100">
          {knowledgeUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Anexar
          <input
            accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,application/pdf,text/plain,text/markdown,text/csv,application/json"
            className="hidden"
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              onUploadFile(file);
            }}
          />
        </label>
      </div>
      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
        {files.length > 0 ? (
          files.map((file) => (
            <div key={file.id} className="rounded-lg border px-3 py-2" style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}>
              <p className="truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
                {file.title}
              </p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-wide text-slate-500">
                {formatBytes(file.size)} / {formatDate(file.createdAt)}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-lg border px-3 py-6 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
            Nenhum arquivo anexado.
          </div>
        )}
      </div>
    </div>
  );
}

function NoAgentState() {
  return (
    <div className="grid min-h-[260px] place-items-center rounded-xl border p-4 text-center sm:min-h-[430px] sm:p-6" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="max-w-sm">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: "rgba(var(--ch-ai-rgb),0.10)", color: "var(--ch-ai)" }}
        >
          <Bot className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>Nenhum agente cadastrado</h2>
        <p className="mt-2 text-[13px] leading-6 text-slate-500">
          Crie um agente e escolha o atendimento que ele vai assumir.
        </p>
        <Link
          className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-white transition hover:brightness-110 sm:w-auto"
          href="/dashboard/whatsapp"
          style={{ background: "linear-gradient(135deg, var(--ch-ai), var(--ch-ai-cyan))" }}
        >
          <Wand2 className="h-4 w-4" />
          Criar agente
        </Link>
      </div>
    </div>
  );
}

function BehaviorSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="group rounded-xl border"
      open={defaultOpen}
      style={{ background: "var(--ch-panel)", borderColor: "var(--ch-border-strong)" }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ch-text)" }}>
          {title}
          {description ? <InfoHint text={description} /> : null}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 group-open:hidden">abrir</span>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-blue-700 group-open:inline">fechar</span>
      </summary>
      <div className="border-t px-3 py-3 sm:px-4 sm:py-4" style={{ borderColor: "var(--ch-border)" }}>
        {children}
      </div>
    </details>
  );
}

function normalizeControlText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolveControlTone(label: string, description?: string): ControlTone {
  const text = normalizeControlText(`${label} ${description ?? ""}`);

  if (/(humano|intervencao|opt-out|prompt injection|bots|loops|protecao|seguranca)/.test(text)) {
    return "rose";
  }

  if (/(campanha|lote|delay|temporizacao|tempo|timing|cooldown|janela|reativar|circadiano|pausa|leitura|visualizar|min|max)/.test(text)) {
    return "amber";
  }

  if (/(audio|voz|transcrever|microfone|figurinha|sticker|emoji|reacao|vocal|espontaneo)/.test(text)) {
    return "fuchsia";
  }

  if (/(status|canal|newsletter|stories)/.test(text)) {
    return "violet";
  }

  if (/(grupo|mencionar todos|interativos|todos)/.test(text)) {
    return "emerald";
  }

  if (/(imagem|foto|video|documento|midia|arquivo|salvar)/.test(text)) {
    return "sky";
  }

  if (/(link|localizacao|captacao|crm|qualificacao|pergunta|lead|vip)/.test(text)) {
    return "emerald";
  }

  if (/(mensagem|texto|resposta|citado|conversa|dividir|lido)/.test(text)) {
    return "cyan";
  }

  if (/(agente|ia|aprendizado)/.test(text)) {
    return "violet";
  }

  return "slate";
}

function resolveNumberFieldMeta(label: string, description?: string): { icon: LucideIcon; tone: ControlTone } {
  const text = normalizeControlText(`${label} ${description ?? ""}`);

  if (/(audio|voz|transcricao|transcrever)/.test(text)) return { icon: AudioLines, tone: "fuchsia" };
  if (/(foto|imagem)/.test(text)) return { icon: ImageIcon, tone: "sky" };
  if (/(video)/.test(text)) return { icon: Video, tone: "sky" };
  if (/(doc|documento)/.test(text)) return { icon: FileText, tone: "sky" };
  if (/(status|destinatario)/.test(text)) return { icon: Globe2, tone: "violet" };
  if (/(campanha|lote)/.test(text)) return { icon: Forward, tone: "amber" };
  if (/(chance|reacao|emoji)/.test(text)) return { icon: Smile, tone: "fuchsia" };
  if (/(figurinha|sticker)/.test(text)) return { icon: Sticker, tone: "fuchsia" };
  if (/(qualificado|vip|score)/.test(text)) return { icon: ShieldCheck, tone: "emerald" };
  if (/(pergunta)/.test(text)) return { icon: MessageSquare, tone: "emerald" };
  if (/(humano|cooldown|reativar)/.test(text)) return { icon: Bell, tone: "rose" };
  if (/(texto)/.test(text)) return { icon: MessageSquare, tone: "cyan" };
  if (/(botao)/.test(text)) return { icon: Send, tone: "cyan" };
  if (/(leitura|visualizar)/.test(text)) return { icon: Eye, tone: "amber" };
  if (/(delay|tempo|timing|min|max|segundo|espera)/.test(text)) return { icon: Timer, tone: "amber" };

  return { icon: Timer, tone: resolveControlTone(label, description) };
}

function ToggleTile({
  icon: Icon,
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  const tone = controlToneStyles[resolveControlTone(label, description)];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className="flex min-h-12 items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent sm:min-h-11 sm:gap-3 sm:px-3"
      style={{
        background: checked ? `linear-gradient(135deg, rgba(${tone.rgb},0.17), rgba(${tone.rgb},0.07))` : "var(--ch-panel-2)",
        borderColor: checked ? `rgba(${tone.rgb},0.48)` : `rgba(${tone.rgb},0.22)`,
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition"
          style={{
            background: `rgba(${tone.rgb},${checked ? 0.16 : 0.08})`,
            borderColor: `rgba(${tone.rgb},${checked ? 0.34 : 0.18})`,
            boxShadow: checked ? `0 0 18px rgba(${tone.rgb},0.20)` : "none",
            color: tone.color,
            opacity: checked ? 1 : 0.72,
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 text-[12px] font-semibold leading-4" style={{ color: "var(--ch-text)" }}>{label}</span>
        {description ? <InfoHint text={description} /> : null}
      </span>
      <span
        className="relative h-5 w-9 shrink-0 rounded-full transition"
        style={{
          background: checked ? tone.color : "var(--ch-border)",
          boxShadow: checked ? `0 0 16px rgba(${tone.rgb},0.26)` : "none",
        }}
      >
        <span className={cn("absolute top-1 h-3 w-3 rounded-full bg-white transition", checked ? "left-5" : "left-1")} />
      </span>
    </button>
  );
}

function ModeSelector<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; description: string; help?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            data-connecty-contrast={active ? "dark" : undefined}
            className={cn(
              "min-h-14 rounded-lg border px-3 py-2 text-left transition sm:min-h-16",
              active
                ? "connecty-dark-action border-white/25 text-white shadow-[0_12px_28px_rgba(var(--ch-ai-rgb),0.18)] ring-1 ring-white/20"
                : "border-blue-100 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
            )}
            style={active ? { background: "linear-gradient(135deg, var(--ch-ai), var(--ch-ai-cyan))" } : undefined}
          >
            <span className={cn("flex items-center gap-1.5 text-[12px] font-semibold", active ? "text-white" : "text-slate-800")}>
              {option.label}
              {option.help ? <InfoHint text={option.help} /> : null}
            </span>
            <span className={cn("mt-1 block text-[11px]", active ? "text-white/80" : "text-slate-500")}>{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function VoiceSelector({
  behavior,
  companyId,
  defaultVoiceId,
  endpoint,
  errorMessage,
  entityIdKey,
  cloneEnabled,
  voices,
  onCloned,
  onSelect,
}: {
  behavior: WhatsappBehaviorConfig;
  companyId: string;
  defaultVoiceId: string | null;
  endpoint: string;
  errorMessage: string | null;
  entityIdKey: "companyId" | "sectorId";
  cloneEnabled: boolean;
  voices: AudioVoiceOption[];
  onCloned: (audio: WhatsappState["audio"], voiceId: string, notice?: Notice) => void;
  onSelect: (voice: AudioVoiceOption) => void;
}) {
  const [voiceSearch, setVoiceSearch] = useState("");
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneFiles, setCloneFiles] = useState<File[]>([]);
  const [cloneConsent, setCloneConsent] = useState(false);
  const [removeNoise, setRemoveNoise] = useState(true);
  const [cloneSaving, setCloneSaving] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [deletingVoiceId, setDeletingVoiceId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const selectedVoiceId = behavior.audioVoiceId || defaultVoiceId || "";
  const selectedVoice = voices.find((voice) => voice.voiceId === selectedVoiceId) ?? voices[0] ?? null;
  const selectedPreviewUrl = selectedVoice
    ? resolveVoicePreviewUrl(selectedVoice, { companyId, endpoint, entityIdKey })
    : null;
  const canClone = Boolean(companyId && cloneName.trim() && cloneFiles.length > 0 && cloneConsent && !cloneSaving);
  const economyVoice = voices.find((voice) => voice.source === "gemini") ?? null;
  const defaultVoice = defaultVoiceId ? voices.find((voice) => voice.voiceId === defaultVoiceId) ?? null : null;
  const premiumVoice = defaultVoice && defaultVoice.source !== "gemini"
    ? defaultVoice
    : voices.find((voice) => voice.source !== "gemini") ?? null;
  const activeVoiceTier = selectedVoice?.source === "gemini" ? "low_cost" : "premium";
  const visibleVoices = useMemo(() => {
    const search = normalizeVoiceSearch(voiceSearch);
    const tierVoices = voices.filter((voice) =>
      activeVoiceTier === "low_cost" ? voice.source === "gemini" : voice.source !== "gemini",
    );
    const sourceVoices = tierVoices.length > 0 ? tierVoices : voices;

    if (!search) {
      return sourceVoices;
    }

    return sourceVoices.filter((voice) => {
      const haystack = normalizeVoiceSearch([
        voice.name,
        voice.category,
        voice.status,
        voice.source,
        voice.language,
        voice.accent,
        voice.gender,
        voice.useCase,
        voice.isDefault ? "padrao" : "",
      ].filter(Boolean).join(" "));

      return haystack.includes(search);
    });
  }, [activeVoiceTier, voiceSearch, voices]);

  async function submitVoiceClone() {
    if (!canClone) {
      return;
    }

    setCloneSaving(true);
    setCloneError(null);

    try {
      const payload = new FormData();
      payload.set(entityIdKey, companyId);
      payload.set("name", cloneName);
      payload.set("consentAccepted", String(cloneConsent));
      payload.set("removeBackgroundNoise", String(removeNoise));

      for (const file of cloneFiles) {
        payload.append("files", file);
      }

      const response = await fetch(endpoint, {
        method: "POST",
        body: payload,
      });
      const data = (await response.json().catch(() => null)) as VoiceCloneResponse | null;

      if (!response.ok || !data?.audio || !data.voice?.voiceId) {
        throw new Error(data?.error ?? "Nao foi possivel clonar a voz.");
      }

      onCloned(data.audio, data.voice.voiceId, data.notice);
      setCloneOpen(false);
      setCloneName("");
      setCloneFiles([]);
      setCloneConsent(false);
      setRemoveNoise(true);
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : "Erro inesperado ao clonar voz.");
    } finally {
      setCloneSaving(false);
    }
  }

  async function deleteVoice(voiceId: string) {
    setDeletingVoiceId(voiceId);

    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [entityIdKey]: companyId, voiceId }),
      });
      const data = (await response.json().catch(() => null)) as { audio?: WhatsappState["audio"]; notice?: Notice; error?: string } | null;

      if (!response.ok || !data?.audio) {
        throw new Error(data?.error ?? "Nao foi possivel excluir a voz.");
      }

      const resetVoiceId = voiceId === selectedVoiceId ? (defaultVoiceId ?? "") : selectedVoiceId;
      onCloned(data.audio, resetVoiceId, data.notice);
    } catch (error) {
      setCloneError(error instanceof Error ? error.message : "Erro ao excluir voz.");
    } finally {
      setDeletingVoiceId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            Voz do agente
            <InfoHint text="A voz selecionada sera usada nas respostas em audio do agente." />
          </p>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
            {selectedVoice?.name ?? "Nenhuma voz disponivel"}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            {voices.length.toLocaleString("pt-BR")} vozes liberadas
          </p>
        </div>
        <NeonBadge tone={behavior.responseMode === "audio" ? "green" : behavior.responseMode === "mirror" ? "cyan" : "amber"}>
          {formatResponseMode(behavior.responseMode)}
        </NeonBadge>
      </div>

      {selectedVoice?.source === "customer" ? (
        <div className={cn(
          "mt-3 rounded-lg border px-3 py-2 text-[12px] leading-5",
          selectedVoice.status === "verification_required"
            ? "border-amber-300/35 bg-amber-50 text-amber-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-700",
        )}>
          {selectedVoice.status === "verification_required"
            ? `Sua voz "${selectedVoice.name}" foi clonada mas esta pendente de verificacao. Enquanto isso, o agente usara a voz padrao.`
            : `Sua voz "${selectedVoice.name}" esta clonada e ativa. O agente vai usar esta voz nas respostas em audio.`}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-3 rounded-lg border border-amber-300/35 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <VoiceProviderButton
          active={activeVoiceTier === "low_cost"}
          disabled={!economyVoice}
          detail={economyVoice ? "Menor consumo de creditos por audio" : "Configure a voz de baixo custo no cofre"}
          label="Audio baixo custo"
          onClick={() => economyVoice && onSelect(economyVoice)}
        />
        <VoiceProviderButton
          active={activeVoiceTier === "premium"}
          disabled={!premiumVoice}
          detail={premiumVoice ? "Mais qualidade ou voz clonada" : "Configure a voz premium no cofre"}
          label="Audio premium"
          onClick={() => premiumVoice && onSelect(premiumVoice)}
        />
      </div>

      {cloneEnabled && activeVoiceTier === "premium" ? (
      <div className="mt-3 rounded-lg border" style={{ borderColor: "var(--ch-border)" }}>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
          onClick={() => setCloneOpen((current) => !current)}
        >
          <span className="flex items-center gap-2">
            <Mic className="h-4 w-4" style={{ color: "var(--ch-ai)" }} />
            <span>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
                Clonar minha voz premium
                <InfoHint text="Cria uma voz propria usando audios enviados pelo usuario com consentimento. Voz clonada entra no grupo Audio premium." />
              </span>
              <span className="block text-[11px] text-slate-500">Clone de voz entra como Audio premium.</span>
            </span>
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-indigo-700">{cloneOpen ? "fechar" : "abrir"}</span>
        </button>

        {cloneOpen ? (
          <div className="border-t p-3" style={{ borderColor: "var(--ch-border)" }}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome da voz</span>
                <input
                  value={cloneName}
                  onChange={(event) => setCloneName(event.target.value)}
                  placeholder="Minha voz comercial"
                  className="h-10 w-full rounded-lg border px-3 text-[12px] outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Audios de amostra</span>
                <input
                  accept="audio/*,.aac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.webm"
                  className="block w-full rounded-lg border px-3 py-2 text-[12px] file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-indigo-700"
                  multiple
                  onChange={(event) => setCloneFiles(Array.from(event.target.files ?? []))}
                  type="file"
                />
              </label>
            </div>

            {cloneFiles.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {cloneFiles.map((file) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]"
                    style={{ borderColor: "var(--ch-border)" }}
                  >
                    <span className="min-w-0 truncate text-slate-600">{file.name}</span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-slate-500">{formatBytes(file.size)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--ch-border)" }}>
                <input
                  checked={removeNoise}
                  onChange={(event) => setRemoveNoise(event.target.checked)}
                  type="checkbox"
                />
                <span className="flex items-center gap-1.5">
                  Remover ruido das amostras
                  <InfoHint text="Limpa ruidos de fundo antes de enviar as amostras para clonagem." />
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2 text-[12px] leading-5" style={{ borderColor: "var(--ch-border)" }}>
                <input
                  checked={cloneConsent}
                  className="mt-1"
                  onChange={(event) => setCloneConsent(event.target.checked)}
                  type="checkbox"
                />
                <span className="flex items-start gap-1.5">
                  Confirmo que tenho direito e consentimento para clonar esta voz.
                  <InfoHint text="A clonagem so deve ser feita com autorizacao da pessoa dona da voz." />
                </span>
              </label>
            </div>

            {cloneError ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700">
                {cloneError}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 font-mono text-[10px] font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={!canClone}
                onClick={submitVoiceClone}
                style={{ background: "linear-gradient(135deg, var(--ch-ai), var(--ch-ai-cyan))" }}
              >
                {cloneSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar voz
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-4 font-mono text-[10px] font-bold uppercase tracking-widest text-blue-700 transition hover:bg-blue-50 sm:w-auto"
                onClick={() => {
                  setCloneOpen(false);
                  setCloneError(null);
                }}
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>
      ) : null}

      {voices.length > 0 ? (
        <>
          <label className="mt-3 block">
            <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Buscar voz</span>
            <input
              value={voiceSearch}
              onChange={(event) => setVoiceSearch(event.target.value)}
              placeholder="Nome, categoria ou tipo de voz"
              className="h-10 w-full rounded-lg border px-3 text-[12px] outline-none"
            />
          </label>

          <div className="mt-3 max-h-[380px] overflow-y-auto rounded-lg border" style={{ borderColor: "var(--ch-border)" }}>
            <div className="divide-y" style={{ borderColor: "var(--ch-border)" }}>
            {visibleVoices.map((voice) => {
              const active = voice.voiceId === selectedVoiceId;

              return (
                <button
                  key={voice.voiceId}
                  type="button"
                  onClick={() => onSelect(voice)}
                  className={cn(
                    "grid min-h-12 w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-left transition",
                    active ? "bg-blue-50" : "bg-white hover:bg-blue-50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Volume2 className={cn("h-3.5 w-3.5 shrink-0", active ? "text-indigo-700" : "text-slate-500")} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{voice.name}</span>
                      <span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-widest text-slate-500">
                        {formatVoiceDetails(voice)}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {voice.source === "customer" ? (
                      <span className={cn(
                        "rounded-md px-2 py-1 font-mono text-[8px] uppercase tracking-widest",
                        voice.status === "verification_required"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700",
                      )}>
                        {voice.status === "verification_required" ? "pendente" : "pronta"}
                      </span>
                    ) : null}
                    <span className={cn("rounded-md border px-2 py-1 font-mono text-[8px] uppercase tracking-widest", active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600")}>
                      {formatVoiceSource(voice)}
                    </span>
                    {(voice.source === "customer" || (voice.category === "cloned" && !voice.isDefault)) ? (
                      confirmDeleteId === voice.voiceId ? (
                        <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="rounded-md bg-rose-50 px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            disabled={deletingVoiceId === voice.voiceId}
                            onClick={(event) => { event.stopPropagation(); deleteVoice(voice.voiceId); }}
                          >
                            {deletingVoiceId === voice.voiceId ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "sim"}
                          </button>
                          <button
                            type="button"
                            className="connecty-dark-chip rounded-md border px-2 py-1 font-mono text-[8px] uppercase tracking-widest hover:brightness-110"
                            onClick={(event) => { event.stopPropagation(); setConfirmDeleteId(null); }}
                          >
                            nao
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="rounded-md p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                          title="Excluir voz"
                          onClick={(event) => { event.stopPropagation(); setConfirmDeleteId(voice.voiceId); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )
                    ) : null}
                  </span>
                </button>
              );
            })}
            </div>
          </div>

          {visibleVoices.length === 0 ? (
            <div className="mt-3 rounded-lg border border-amber-300/35 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
              Nenhuma voz encontrada neste grupo.
            </div>
          ) : null}

          {selectedPreviewUrl ? (
            <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)" }}>
              <audio className="h-9 w-full" controls preload="none" src={selectedPreviewUrl} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-300/35 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
          {errorMessage ?? "Nenhuma voz disponivel."}
        </div>
      )}
    </div>
  );
}

function VoiceProviderButton({
  active,
  detail,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  detail: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "min-h-14 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        active ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-blue-50",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{label}</span>
        <span className={cn("rounded-md border px-2 py-1 font-mono text-[8px] uppercase tracking-widest", active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600")}>
          {active ? "ativo" : "selecionar"}
        </span>
      </span>
      <span className="mt-1 block text-[11px] leading-4 text-slate-500">{detail}</span>
    </button>
  );
}

function NumberField({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const nextValue = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  const meta = resolveNumberFieldMeta(label, description);
  const tone = controlToneStyles[meta.tone];
  const FieldIcon = meta.icon;

  return (
    <div
      className="rounded-lg border px-2 py-2"
      style={{ background: "var(--ch-panel-2)", borderColor: `rgba(${tone.rgb},0.24)` }}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold leading-4" style={{ color: "var(--ch-text)" }}>
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md border"
          style={{
            background: `rgba(${tone.rgb},0.10)`,
            borderColor: `rgba(${tone.rgb},0.24)`,
            color: tone.color,
          }}
        >
          <FieldIcon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 truncate">{label}</span>
        {description ? <InfoHint text={description} /> : null}
      </span>
      <div className="mt-2 grid grid-cols-[28px_1fr_28px] items-center gap-1">
        <button
          type="button"
          className="h-7 rounded-md border transition hover:brightness-125"
          style={{ background: `rgba(${tone.rgb},0.07)`, borderColor: `rgba(${tone.rgb},0.24)`, color: tone.color }}
          onClick={() => nextValue(-1)}
        >
          -
        </button>
        <input
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || min)}
          className="h-7 rounded-md border bg-transparent px-2 text-center font-mono text-[12px] outline-none"
          style={{ borderColor: `rgba(${tone.rgb},0.24)` }}
          type="number"
          min={min}
          max={max}
        />
        <button
          type="button"
          className="h-7 rounded-md border transition hover:brightness-125"
          style={{ background: `rgba(${tone.rgb},0.07)`, borderColor: `rgba(${tone.rgb},0.24)`, color: tone.color }}
          onClick={() => nextValue(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border px-3 font-mono text-[12px] outline-none"
      />
    </label>
  );
}

function TextAreaField({
  label,
  description,
  value,
  minHeight = "88px",
  placeholder,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  minHeight?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-lg border px-3 py-2 font-mono text-[12px] leading-5 outline-none"
        placeholder={placeholder}
        style={{ minHeight }}
      />
    </label>
  );
}

function CompanyLocationsEditor({
  locations,
  onAdd,
  onChange,
  onPrimary,
  onRemove,
}: {
  locations: CompanyLocationDraft[];
  onAdd: () => void;
  onChange: (index: number, patch: Partial<CompanyLocationDraft>) => void;
  onPrimary: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3">
        {locations.map((location, index) => (
          <div
            key={`${location.id ?? "new"}-${index}`}
            className="rounded-lg border p-3"
            style={{ background: "var(--ch-panel-2)", borderColor: "var(--ch-border)" }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {location.isPrimary ? "unidade principal" : `unidade ${index + 1}`}
              </span>
              <div className="flex flex-wrap gap-2">
                {!location.isPrimary ? (
                  <SecondaryAction
                    icon={ShieldCheck}
                    label="Principal"
                    description="Usar esta unidade quando o lead nao especificar qual local quer."
                    onClick={() => onPrimary(index)}
                  />
                ) : null}
                <SecondaryAction
                  icon={Trash2}
                  label="Remover"
                  disabled={locations.length === 1 && !location.address && !location.mapsUrl && !location.latitude && !location.longitude}
                  tone="danger"
                  onClick={() => onRemove(index)}
                />
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <TextField
                label="Nome da unidade"
                description="Ex.: Loja Centro, Matriz, Unidade Sao Paulo."
                value={location.label}
                onChange={(label) => onChange(index, { label })}
              />
              <TextAreaField
                label="Endereco completo"
                description="Endereco que o agente pode enviar por texto."
                minHeight="72px"
                value={location.address}
                onChange={(address) => onChange(index, { address })}
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <TextField label="CEP" value={location.cep} onChange={(cep) => onChange(index, { cep })} />
              <TextField label="Cidade" value={location.city} onChange={(city) => onChange(index, { city })} />
              <TextField label="Estado" value={location.region} onChange={(region) => onChange(index, { region })} />
            </div>

            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_160px_160px]">
              <TextField
                label="Link Google Maps"
                description="Usado para montar o botao Abrir no Google Maps."
                value={location.mapsUrl}
                onChange={(mapsUrl) => onChange(index, { mapsUrl })}
              />
              <TextField
                label="Latitude"
                description="Ajuda a montar o botao do Google Maps quando nao houver link."
                value={location.latitude}
                onChange={(latitude) => onChange(index, { latitude })}
              />
              <TextField
                label="Longitude"
                description="Ajuda a montar o botao do Google Maps quando nao houver link."
                value={location.longitude}
                onChange={(longitude) => onChange(index, { longitude })}
              />
            </div>

            <div className="mt-3">
              <TextAreaField
                label="Observacoes"
                description="Ex.: estacionamento, horario de retirada, referencia de chegada."
                minHeight="64px"
                value={location.notes}
                onChange={(notes) => onChange(index, { notes })}
              />
            </div>
          </div>
        ))}
      </div>

      <SecondaryAction
        icon={Plus}
        label="Adicionar unidade"
        description="Use quando a empresa tiver mais de um endereco."
        disabled={locations.length >= 8}
        onClick={onAdd}
      />
    </div>
  );
}

function LeadQualificationEditor({
  config,
  entityLabel,
  onAddQuestion,
  onChange,
  onQuestionChange,
  onRemoveQuestion,
}: {
  config: LeadQualificationConfig;
  entityLabel: string;
  onAddQuestion: () => void;
  onChange: (value: Partial<LeadQualificationConfig>) => void;
  onQuestionChange: (id: string, value: Partial<LeadQualificationQuestion>) => void;
  onRemoveQuestion: (id: string) => void;
}) {
  const normalized = normalizeLeadQualificationConfig(config);

  return (
    <div className="grid gap-3">
      <BehaviorSection
        title="Playbook comercial"
        description={`Define como o agente qualifica leads do produto ou servico deste ${entityLabel.toLowerCase()}.`}
      >
        <div className="grid gap-3">
          <ToggleTile
            icon={ShieldCheck}
            label="Qualificacao ativa"
            description="Quando ligado, o agente usa estas perguntas para qualificar o lead e alimentar o CRM."
            checked={normalized.enabled}
            onChange={() => onChange({ enabled: !normalized.enabled })}
          />
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Produto ou oferta</span>
              <input
                className="h-10 w-full rounded-lg border px-3 text-[12px] outline-none"
                value={normalized.productName}
                onChange={(event) => onChange({ productName: event.target.value })}
                placeholder="Ex: Mentoria, imovel, software, procedimento, curso"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <NumberField label="Qualificado" description="Score minimo para virar lead qualificado." value={normalized.qualifyThreshold} min={20} max={100} onChange={(value) => onChange({ qualifyThreshold: value })} />
              <NumberField label="VIP" description="Score minimo para prioridade maxima." value={normalized.vipThreshold} min={30} max={100} onChange={(value) => onChange({ vipThreshold: value })} />
              <NumberField label="Perguntas" description="Quantidade maxima de perguntas de qualificacao na conversa." value={normalized.maxQuestionsPerConversation} min={1} max={16} onChange={(value) => onChange({ maxQuestionsPerConversation: value })} />
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Objetivo comercial</span>
            <textarea
              className="min-h-20 w-full resize-y rounded-lg border px-3 py-2 text-[12px] leading-5 outline-none"
              value={normalized.commercialObjective}
              onChange={(event) => onChange({ commercialObjective: event.target.value })}
              placeholder="Explique o que faz um lead estar pronto para comprar."
            />
          </label>
          <ToggleTile
            icon={MessageSquare}
            label="Uma pergunta por vez"
            description="Mantem a conversa natural e evita parecer formulario."
            checked={normalized.askOneQuestionAtATime}
            onChange={() => onChange({ askOneQuestionAtATime: !normalized.askOneQuestionAtATime })}
          />
        </div>
      </BehaviorSection>

      <BehaviorSection
        title="Perguntas do CRM"
        description="Cada pergunta vira um campo no arquivo do lead e soma pontos quando for respondida."
      >
        <div className="grid gap-2">
          {normalized.questions.map((question, index) => (
            <div
              key={question.id}
              className="rounded-lg border px-3 py-2"
              style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}
            >
              <div className="grid gap-2 xl:grid-cols-[170px_minmax(320px,1fr)_106px_118px_34px] xl:items-end">
                <label className="block">
                  <span className="mb-1 block font-mono text-[8px] uppercase tracking-widest text-blue-700">Pergunta {index + 1} · Rotulo</span>
                  <input
                    className="h-9 w-full rounded-md border px-2.5 text-[12px] font-semibold outline-none"
                    value={question.label}
                    onChange={(event) => onQuestionChange(question.id, { label: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono text-[8px] uppercase tracking-widest text-slate-500">Pergunta ao lead</span>
                  <input
                    className="h-9 w-full rounded-md border px-2.5 text-[12px] outline-none"
                    value={question.question}
                    onChange={(event) => onQuestionChange(question.id, { question: event.target.value })}
                  />
                </label>
                <div className="block">
                  <span className="mb-1 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-widest text-slate-500">
                    Peso
                    <InfoHint text="Pontos somados quando o campo for respondido." />
                  </span>
                  <div className="grid h-9 grid-cols-[26px_1fr_26px] overflow-hidden rounded-md border" style={{ borderColor: "var(--ch-border)" }}>
                    <button
                      type="button"
                      className="grid place-items-center border-r text-slate-600 transition hover:bg-blue-50"
                      style={{ borderColor: "var(--ch-border)" }}
                      onClick={() => onQuestionChange(question.id, { weight: Math.max(0, question.weight - 1) })}
                      aria-label={`Diminuir peso da pergunta ${index + 1}`}
                    >
                      -
                    </button>
                    <input
                      value={question.weight}
                      onChange={(event) => onQuestionChange(question.id, { weight: Math.min(40, Math.max(0, Number(event.target.value) || 0)) })}
                      className="min-w-0 bg-transparent px-1 text-center font-mono text-[12px] outline-none"
                      type="number"
                      min={0}
                      max={40}
                    />
                    <button
                      type="button"
                      className="grid place-items-center border-l text-slate-600 transition hover:bg-blue-50"
                      style={{ borderColor: "var(--ch-border)" }}
                      onClick={() => onQuestionChange(question.id, { weight: Math.min(40, question.weight + 1) })}
                      aria-label={`Aumentar peso da pergunta ${index + 1}`}
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className={cn(
                    "flex h-9 items-center justify-between gap-2 rounded-md border px-2.5 text-left transition",
                    question.required ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500",
                  )}
                  onClick={() => onQuestionChange(question.id, { required: !question.required })}
                  title="Marca se esta pergunta e essencial para qualificar o lead."
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", question.required ? "text-emerald-700" : "text-slate-500")} />
                    <span className="truncate text-[11px] font-semibold">Obrigatoria</span>
                  </span>
                  <span className={cn("relative h-4 w-7 shrink-0 rounded-full transition", question.required ? "bg-emerald-500" : "bg-slate-300")}>
                    <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition", question.required ? "left-3.5" : "left-0.5")} />
                  </span>
                </button>
                <button
                  type="button"
                  className="grid h-9 w-full place-items-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 xl:w-9"
                  onClick={() => onRemoveQuestion(question.id)}
                  title="Excluir pergunta"
                  aria-label={`Excluir pergunta ${index + 1}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <details className="group mt-1.5">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[8px] uppercase tracking-widest text-slate-500 transition hover:text-blue-700">
                  <span>Campo interno</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[8px] normal-case tracking-normal text-slate-500">{question.crmField || "sem campo"}</span>
                  <span className="group-open:hidden">editar</span>
                  <span className="hidden text-blue-700 group-open:inline">fechar</span>
                </summary>
                <label className="mt-2 block max-w-sm">
                  <span className="mb-1 block font-mono text-[8px] uppercase tracking-widest text-slate-500">Campo CRM interno</span>
                  <input
                    className="h-8 w-full rounded-md border px-2.5 font-mono text-[11px] outline-none"
                    value={question.crmField}
                    onChange={(event) => onQuestionChange(question.id, { crmField: event.target.value })}
                  />
                </label>
              </details>
            </div>
          ))}

          <button
            type="button"
            className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-blue-700 transition hover:bg-blue-100"
            onClick={onAddQuestion}
          >
            <Plus className="h-4 w-4" />
            Nova pergunta
          </button>
        </div>
      </BehaviorSection>

      <div className="grid gap-3 xl:grid-cols-2">
        <LeadQualificationListEditor
          label="Sinais de baixa qualificacao"
          description="Use uma linha por sinal que reduz prioridade do lead."
          values={normalized.disqualifiers}
          onChange={(disqualifiers) => onChange({ disqualifiers })}
        />
        <LeadQualificationListEditor
          label="Regras de proximo passo"
          description="Use uma linha por situacao que pede proposta, demo ou humano."
          values={normalized.handoffRules}
          onChange={(handoffRules) => onChange({ handoffRules })}
        />
      </div>
    </div>
  );
}

function LeadQualificationListEditor({
  label,
  description,
  values,
  onChange,
}: {
  label: string;
  description: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <label className="block rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
        {label}
        <InfoHint text={description} />
      </span>
      <textarea
        className="min-h-28 w-full resize-y rounded-lg border px-3 py-2 text-[12px] leading-5 outline-none"
        value={values.join("\n")}
        onChange={(event) => onChange(event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))}
      />
    </label>
  );
}

function LeadQualificationSummary({ config, changed }: { config: LeadQualificationConfig; changed: boolean }) {
  const normalized = normalizeLeadQualificationConfig(config);
  const totalWeight = normalized.questions.reduce((total, question) => total + question.weight, 0);
  const required = normalized.questions.filter((question) => question.required).length;

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Resumo</p>
      <div className="mt-4 space-y-3">
        <PromptCheck label={normalized.enabled ? "Qualificacao ativa" : "Qualificacao pausada"} active={normalized.enabled} />
        <PromptCheck label={`${normalized.questions.length} perguntas configuradas`} active={normalized.questions.length >= 4} />
        <PromptCheck label={`${required} obrigatorias`} active={required >= 2} />
        <PromptCheck label={`${totalWeight} pontos totais`} active={totalWeight >= normalized.qualifyThreshold} />
      </div>
      <div className="mt-4 grid gap-2">
        <InfoTile label="Produto" value={normalized.productName || "Produto do cliente"} />
        <InfoTile label="Qualificado" value={`${normalized.qualifyThreshold}+ pontos`} />
        <InfoTile label="VIP" value={`${normalized.vipThreshold}+ pontos`} />
        <InfoTile label="Alteracoes" value={changed ? "Pendentes" : "Salvo"} />
      </div>
    </div>
  );
}

function BehaviorSummary({
  behavior,
  promptChanged,
  behaviorChanged,
}: {
  behavior: WhatsappBehaviorConfig;
  promptChanged: boolean;
  behaviorChanged: boolean;
}) {
  const activeHuman = [
    behavior.humanizedLanguage,
    behavior.emojiReactions,
    behavior.timingJitter,
    behavior.composingPause,
    behavior.readReceiptDelay,
    behavior.spontaneousAudio,
    behavior.circadianTiming,
    behavior.naturalAudioFillers,
    behavior.sendStickers,
    behavior.proactiveMedia,
    behavior.wpmTypingModel,
    behavior.smallTalk,
  ].filter(Boolean).length;

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Resumo</p>
      <div className="mt-4 space-y-3">
        <PromptCheck label="Agente ativo" active={behavior.agentEnabled} />
        <PromptCheck label={`${activeHuman}/12 simulacao humana`} active={activeHuman >= 6} />
        <PromptCheck label="Citacao inteligente" active={behavior.quoteReplyMode !== "off"} />
        <PromptCheck label="Intervencao humana" active={behavior.humanIntervention} />
        <PromptCheck label="Aviso humano WhatsApp" active={behavior.humanHandoffNotifications && Boolean(behavior.humanHandoffNotificationNumbers.trim())} />
        <PromptCheck label="Temporizacao inteligente" active={behavior.smartTiming} />
      </div>
      <div className="mt-4 grid gap-2">
        <InfoTile label="Conversa" value={formatResponseMode(behavior.responseMode)} />
        <InfoTile label="Presenca" value={formatPresenceMode(behavior.presenceMode)} />
        <InfoTile label="Rapport" value={formatRapportMode(behavior.adaptiveRapportMode)} />
        <InfoTile label="Alteracoes" value={promptChanged || behaviorChanged ? "Pendentes" : "Salvo"} />
      </div>
    </div>
  );
}

function PromptCheck({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className={cn("h-4 w-4", active ? "text-emerald-700" : "text-slate-500")} />
      <span className={cn("text-[12px]", active ? "text-slate-700" : "text-slate-500")}>{label}</span>
    </div>
  );
}

function formatResponseMode(value: WhatsappResponseMode) {
  if (value === "audio") return "Sempre audio";
  if (value === "mirror") return "Espelho";
  return "Sempre texto";
}

function formatPresenceMode(value: WhatsappPresenceMode) {
  if (value === "always") return "Sempre online";
  if (value === "focused") return "So atendimento";
  return "Natural";
}

function formatVoiceSource(voice: AudioVoiceOption) {
  if (voice.isDefault) return "padrao";
  if (voice.source === "customer") return "premium";
  if (voice.source === "gemini") return "baixo custo";
  if (voice.source === "library") return "premium";
  if (voice.category) return voice.category;
  return "premium";
}

function formatVoiceDetails(voice: AudioVoiceOption) {
  const category = voice.source === "customer" ? "voz propria" : voice.category;
  return [category, voice.language, voice.accent, voice.gender, voice.useCase].filter(Boolean).join(" / ") || "voz padrao";
}

function resolveVoicePreviewUrl(
  voice: AudioVoiceOption,
  input: {
    companyId: string;
    endpoint: string;
    entityIdKey: "companyId" | "sectorId";
  },
) {
  if (voice.previewUrl) {
    return voice.previewUrl;
  }

  if (voice.source !== "gemini" || !input.companyId) {
    return null;
  }

  const params = new URLSearchParams({
    [input.entityIdKey]: input.companyId,
    voiceId: voice.voiceId,
  });

  return `${input.endpoint}/preview?${params.toString()}`;
}

function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return "tamanho pendente";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeVoiceSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatRapportMode(value: WhatsappRapportMode) {
  if (value === "strong") return "Forte";
  if (value === "soft") return "Suave";
  return "Desligado";
}

function normalizeConnectPhoneInput(value: string) {
  return value.replace(/\D/g, "");
}

function formatPairCode(value: string) {
  const compact = value.replace(/\s+/g, "");
  const parts = compact.match(/.{1,4}/g);
  return parts ? parts.join(" ") : value;
}

function CompactConnectionCard({
  instance,
  qrCode,
  pairCode,
  connectMode,
  connectPhone,
  running,
  migrationCopying,
  enabled,
  disabledReason,
  onConnect,
  onCopyMigrationCredential,
  onConnectModeChange,
  onConnectPhoneChange,
  onDisconnect,
  onRefresh,
  onReset,
}: {
  instance: WhatsappState["instance"];
  qrCode: string | null;
  pairCode: string | null;
  connectMode: ConnectionMode;
  connectPhone: string;
  running: string | null;
  migrationCopying: MigrationCredentialKind | null;
  enabled: boolean;
  disabledReason?: string;
  onConnect: () => void;
  onCopyMigrationCredential: (kind: MigrationCredentialKind) => void;
  onConnectModeChange: (mode: ConnectionMode) => void;
  onConnectPhoneChange: (phone: string) => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [passkeyModalOpen, setPasskeyModalOpen] = useState(false);
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [pairCodeCopied, setPairCodeCopied] = useState(false);
  const notifiedPasskeyAttemptRef = useRef<string | null>(null);
  const status = instance?.status ?? "draft";
  const meta = getStatusMeta(status);
  const Icon = meta.icon;
  const profileImageUrl = instance?.profileImageUrl ?? null;
  const whatsappLabel = instance?.displayName ?? formatPhone(instance?.phoneNumber);
  const latestConnectionAttempt = instance?.connectionDiagnostics?.latestAttempt ?? null;
  const connectionAttemptFinished = Boolean(latestConnectionAttempt && latestConnectionAttempt.finalStatus !== "pending");
  const passkeyBlockedAttempt = latestConnectionAttempt?.finalStatus === "passkey_blocked" ? latestConnectionAttempt : null;
  const phoneModeSelected = connectMode === "phone";
  const visibleQrCode = phoneModeSelected || status === "connected" || connectionAttemptFinished ? null : qrCode;
  const visiblePairCode = !phoneModeSelected || status === "connected" || connectionAttemptFinished ? null : pairCode;
  const connectPhoneDigits = normalizeConnectPhoneInput(connectPhone);
  const connectionActionDisabled = !enabled || (phoneModeSelected && connectPhoneDigits.length < 10);
  const resetActionDisabled = !enabled || !instance || (phoneModeSelected && connectPhoneDigits.length < 10);
  const connectionActionIcon = phoneModeSelected ? Smartphone : QrCode;
  const connectionActionLabel = phoneModeSelected
    ? visiblePairCode ? "Gerar novo codigo" : "Gerar codigo"
    : instance ? "Gerar novo QR" : "Gerar QR";
  const connectionActionDescription = phoneModeSelected
    ? "Gera um codigo de pareamento para conectar pelo numero informado."
    : "Abre um QR Code para conectar ou reconectar o numero pelo WhatsApp.";
  const connectionHelperText = latestConnectionAttempt?.finalStatus === "passkey_blocked"
    ? PASSKEY_CONNECTION_HELP_TEXT
    : !enabled
      ? disabledReason
      : visiblePairCode
        ? "Digite este codigo no WhatsApp do celular principal do cliente. Nao ha campo no ConnectyHub para inserir o codigo."
        : visibleQrCode
          ? "Escaneie o QR Code pelo WhatsApp para concluir."
          : phoneModeSelected
            ? "Informe o telefone com DDI e gere o codigo. O codigo aparecera aqui para ser digitado no WhatsApp do cliente."
            : meta.description;
  const qrModeActiveStyle = {
    background: "rgba(var(--ch-whatsapp-rgb),0.12)",
    color: "var(--ch-whatsapp-deep)",
  };
  const phoneModeActiveStyle = {
    background: "rgba(var(--ch-brand-primary-rgb),0.10)",
    color: "var(--ch-brand-primary)",
  };

  useEffect(() => {
    if (!visibleQrCode || phoneModeSelected || connectionAttemptFinished) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setQrModalOpen(false);
      });

      return () => {
        cancelled = true;
      };
    }
  }, [connectionAttemptFinished, phoneModeSelected, visibleQrCode]);

  useEffect(() => {
    if (!passkeyBlockedAttempt) {
      return;
    }

    if (notifiedPasskeyAttemptRef.current === passkeyBlockedAttempt.id) {
      return;
    }

    notifiedPasskeyAttemptRef.current = passkeyBlockedAttempt.id;
    setPasskeyModalOpen(true);
  }, [passkeyBlockedAttempt]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPairCodeCopied(false);
    });

    return () => {
      cancelled = true;
    };
  }, [visiblePairCode]);

  async function copyVisiblePairCode() {
    if (!visiblePairCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(visiblePairCode);
      setPairCodeCopied(true);
    } catch {
      setPairCodeCopied(false);
    }
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "var(--ch-panel)", borderColor: "var(--ch-border-strong)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
            Conexao WhatsApp
            <InfoHint text={enabled ? "Gera o QR Code para conectar o numero e mostra o status atual da instancia." : disabledReason ?? "Conexao indisponivel neste ambiente."} />
          </p>
          <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
            {meta.title}
          </p>
        </div>
        <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", meta.bg, meta.text)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div
        className="mt-4 grid min-h-[170px] place-items-center rounded-xl p-3 text-center"
        style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}
      >
        {!enabled ? (
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-700">
              <PlugZap className="h-6 w-6" />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              Instancia dedicada pendente
            </p>
          </div>
        ) : visiblePairCode ? (
          <div className="grid place-items-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sky-500/10 text-sky-700">
              <KeyRound className="h-6 w-6" />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-sky-700">
              Codigo de pareamento
            </p>
            <div className="mt-2 inline-flex max-w-full items-center overflow-hidden rounded-lg border border-sky-200 bg-sky-50 text-sky-800">
              <p className="px-3 py-2 font-mono text-[18px] font-bold leading-none">
                {formatPairCode(visiblePairCode)}
              </p>
              <button
                aria-label="Copiar codigo de pareamento"
                className="grid min-h-10 w-10 shrink-0 place-items-center border-l border-sky-200 text-sky-700 transition hover:bg-sky-100"
                onClick={copyVisiblePairCode}
                title="Copiar codigo"
                type="button"
              >
                {pairCodeCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 max-w-[220px] text-[11px] leading-4 text-slate-500">
              O cliente digita este codigo no WhatsApp do celular principal.
            </p>
          </div>
        ) : visibleQrCode ? (
          <button className="group cursor-pointer border-0 bg-transparent p-0" onClick={() => setQrModalOpen(true)} title="Clique para abrir o QR Code" type="button">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-700">
              <QrCode className="h-6 w-6" />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-emerald-700">
              QR Code gerado — clique para exibir
            </p>
          </button>
        ) : profileImageUrl ? (
          <div className="grid place-items-center">
            <WhatsappAvatar alt={`Foto do WhatsApp ${whatsappLabel}`} fallback={whatsappLabel} imageUrl={profileImageUrl} size="xl" />
          </div>
        ) : (
          <div>
            <div
              className="mx-auto grid h-12 w-12 place-items-center rounded-2xl"
              style={{ background: "rgba(var(--ch-whatsapp-rgb),0.10)", color: "var(--ch-whatsapp-deep)" }}
            >
              <QrCode className="h-6 w-6" />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              {phoneModeSelected ? "Codigo aparece aqui" : "QR aparece aqui"}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2">
        <StatusInfoTile connected={status === "connected"} />
        <InfoTile label="Numero" value={formatPhone(instance?.phoneNumber)} />
        <InfoTile label="Leitura" value={formatDate(instance?.lastSyncedAt)} />
      </div>

      <p className="mt-3 text-[12px] leading-5 text-slate-500">
        {connectionHelperText}
      </p>

      {latestConnectionAttempt ? (
        <ConnectionDiagnosticsPanel attempt={latestConnectionAttempt} />
      ) : null}

      <div className="mt-4 grid gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-lg p-1" style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}>
          <button
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 font-mono text-[10px] font-semibold uppercase transition disabled:cursor-not-allowed disabled:opacity-50",
              connectMode === "qr" ? "shadow-sm" : "text-slate-500 hover:bg-blue-50 hover:text-slate-700",
            )}
            disabled={!enabled || running === "connect"}
            onClick={() => onConnectModeChange("qr")}
            style={connectMode === "qr" ? qrModeActiveStyle : undefined}
            type="button"
          >
            <QrCode className="h-3.5 w-3.5" />
            QR Code
          </button>
          <button
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 font-mono text-[10px] font-semibold uppercase transition disabled:cursor-not-allowed disabled:opacity-50",
              connectMode === "phone" ? "shadow-sm" : "text-slate-500 hover:bg-blue-50 hover:text-slate-700",
            )}
            disabled={!enabled || running === "connect"}
            onClick={() => onConnectModeChange("phone")}
            style={connectMode === "phone" ? phoneModeActiveStyle : undefined}
            type="button"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Codigo
          </button>
        </div>

        {phoneModeSelected ? (
          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase text-slate-500">
                Telefone com DDI
                <InfoHint text="Use somente numeros, incluindo pais e DDD. Exemplo: 5511999999999." />
              </span>
              <input
                className="min-h-10 rounded-lg border bg-white px-3 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400/70"
                inputMode="tel"
                onChange={(event) => onConnectPhoneChange(event.target.value)}
                placeholder="5511999999999"
                style={{ borderColor: "var(--ch-border)" }}
                type="tel"
                value={connectPhone}
              />
            </label>
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-[11px] leading-4 text-slate-600">
              Gere o codigo aqui. No celular do cliente: WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho &gt; Conectar com numero de telefone.
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2">
        <ActionButton
          icon={connectionActionIcon}
          label={connectionActionLabel}
          description={connectionActionDescription}
          disabled={connectionActionDisabled}
          loading={running === "connect"}
          tone="whatsapp"
          onClick={onConnect}
        />
        <div className="flex flex-wrap gap-2">
          <SecondaryAction
            icon={RefreshCcw}
            label="Status"
            description="Consulta a Uazapi e atualiza conexao, numero, leitura e foto do WhatsApp."
            disabled={!enabled || !instance}
            loading={running === "refresh_status"}
            onClick={onRefresh}
          />
          <SecondaryAction
            icon={Repeat}
            label="Reset"
            description="Limpa a sessao travada e gera um novo QR ou codigo sem apagar agente, prompt, arquivos ou comportamento."
            disabled={resetActionDisabled}
            loading={running === "reset_connection"}
            onClick={onReset}
          />
          <SecondaryAction
            icon={Power}
            label="Remover"
            description="Exclui a instancia do painel e da Uazapi para permitir uma nova conexao sem duplicar cobranca."
            disabled={!enabled || !instance}
            loading={running === "disconnect"}
            tone="danger"
            onClick={onDisconnect}
          />
        </div>
      </div>

      {qrModalOpen && visibleQrCode && !connectionAttemptFinished && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setQrModalOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setQrModalOpen(false)}
          role="button"
          tabIndex={0}
        >
          <div
            className="relative rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <button
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
              onClick={() => setQrModalOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mb-3 text-center text-sm font-semibold text-slate-700">
              Escaneie o QR Code pelo WhatsApp
            </p>
            <Image
              alt="QR Code ampliado"
              className="rounded-lg"
              height={400}
              src={visibleQrCode}
              unoptimized
              width={400}
            />
            <p className="mt-3 text-center text-xs text-slate-400">
              Abra o WhatsApp &gt; Dispositivos conectados &gt; Conectar dispositivo
            </p>
          </div>
        </div>
      )}

      {passkeyModalOpen && passkeyBlockedAttempt && (
        <div
          aria-labelledby="passkey-blocked-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={() => setPasskeyModalOpen(false)}
          onKeyDown={(event) => event.key === "Escape" && setPasskeyModalOpen(false)}
          role="dialog"
          tabIndex={0}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border p-5 text-left shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            style={{ background: "var(--ch-surface)", borderColor: "rgba(var(--ch-warning-rgb),0.26)" }}
          >
            <button
              aria-label="Fechar aviso"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              onClick={() => setPasskeyModalOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
              <KeyRound className="h-6 w-6" />
            </div>

            <h3 id="passkey-blocked-title" className="mt-4 pr-8 text-lg font-semibold" style={{ color: "var(--ch-text)" }}>
              Verificacao extra solicitada
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {PASSKEY_CONNECTION_HELP_TEXT}
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Você pode tentar resetar a conexão e gerar um novo QR Code. {PASSKEY_CONNECTION_ASSISTED_TEXT}
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {!resetActionDisabled ? (
                <button
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-amber-300/40 bg-amber-50 px-4 font-mono text-[11px] font-semibold uppercase text-amber-700 transition hover:bg-amber-100"
                  onClick={() => {
                    setPasskeyModalOpen(false);
                    onReset();
                  }}
                  type="button"
                >
                  <Repeat className="h-4 w-4" />
                  Tentar reset
                </button>
              ) : null}
              <button
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 font-mono text-[11px] font-semibold uppercase text-blue-700 transition hover:bg-blue-100"
                onClick={() => {
                  setPasskeyModalOpen(false);
                  setMigrationModalOpen(true);
                }}
                type="button"
              >
                <KeyRound className="h-4 w-4" />
                Migracao assistida
              </button>
              <button
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-white px-4 font-mono text-[11px] font-semibold uppercase text-slate-950 transition hover:bg-slate-100"
                onClick={() => setPasskeyModalOpen(false)}
                type="button"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {migrationModalOpen && passkeyBlockedAttempt && (
        <div
          aria-labelledby="passkey-migration-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={() => setMigrationModalOpen(false)}
          onKeyDown={(event) => event.key === "Escape" && setMigrationModalOpen(false)}
          role="dialog"
          tabIndex={0}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border p-5 text-left shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            style={{ background: "var(--ch-surface)", borderColor: "rgba(var(--ch-brand-primary-rgb),0.22)" }}
          >
            <button
              aria-label="Fechar migracao assistida"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              onClick={() => setMigrationModalOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className="grid h-12 w-12 place-items-center rounded-2xl"
              style={{ background: "rgba(var(--ch-ai-rgb),0.10)", color: "var(--ch-ai)" }}
            >
              <KeyRound className="h-6 w-6" />
            </div>

            <h3 id="passkey-migration-title" className="mt-4 pr-8 text-lg font-semibold" style={{ color: "var(--ch-text)" }}>
              Migracao assistida
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Conecte esta conta no WhatsApp Web oficial, conclua a verificacao por chave de acesso e use a extensao para migrar a sessao autenticada.
            </p>

            <div className="mt-4 grid gap-2 text-[12px] leading-5 text-slate-500">
              <p>1. Instale a extensao Session Migration Connector.</p>
              <p>2. Entre no WhatsApp Web oficial e conclua a verificacao pelo celular.</p>
              <p>3. Na extensao, use os botoes abaixo para copiar a Server URL e o Instance Token.</p>
              <p>4. Clique em Migrar sessao e volte aqui para atualizar o status.</p>
            </div>

            <a
              className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 font-mono text-[11px] font-semibold uppercase text-blue-700 transition hover:bg-blue-100"
              href={PASSKEY_MIGRATION_EXTENSION_URL}
              rel="noreferrer"
              target="_blank"
            >
              <Link2 className="h-4 w-4" />
              Abrir extensao
            </a>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <MigrationCopyButton
                description="URL do servidor da UaZapi"
                disabled={Boolean(migrationCopying)}
                label="Copiar Server URL"
                loading={migrationCopying === "serverUrl"}
                onClick={() => onCopyMigrationCredential("serverUrl")}
              />
              <MigrationCopyButton
                description="Token sensivel desta instancia"
                disabled={Boolean(migrationCopying)}
                label="Copiar Instance Token"
                loading={migrationCopying === "instanceToken"}
                onClick={() => onCopyMigrationCredential("instanceToken")}
              />
            </div>

            <div className="mt-4 rounded-lg border border-amber-300/35 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
              O token permite migrar esta sessao do WhatsApp. Use apenas na extensao indicada e nao compartilhe com terceiros.
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 font-mono text-[11px] font-semibold uppercase text-blue-700 transition hover:bg-blue-100"
                onClick={() => {
                  setMigrationModalOpen(false);
                  onRefresh();
                }}
                type="button"
              >
                <RefreshCcw className="h-4 w-4" />
                Atualizar status
              </button>
              <button
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-white px-4 font-mono text-[11px] font-semibold uppercase text-slate-950 transition hover:bg-slate-100"
                onClick={() => setMigrationModalOpen(false)}
                type="button"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MigrationCopyButton({
  description,
  disabled,
  label,
  loading,
  onClick,
}: {
  description: string;
  disabled: boolean;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="grid min-h-20 gap-1 rounded-xl border border-blue-100 bg-white px-3 py-3 text-left transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase text-slate-800">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : <Copy className="h-4 w-4 text-blue-600" />}
        {label}
      </span>
      <span className="text-[11px] leading-4 text-slate-500">{description}</span>
    </button>
  );
}

function ConnectionDiagnosticsPanel({ attempt }: { attempt: ConnectionAttemptDiagnostic }) {
  const tone = getConnectionDiagnosticTone(attempt.finalStatus);
  const latestEvents = attempt.events.slice(-4).reverse();
  const reason = attempt.lastDisconnectReason ?? attempt.finalReason;
  const readableReason = attempt.finalStatus === "passkey_blocked" && reason ? PASSKEY_CONNECTION_REASON_TEXT : reason;

  return (
    <div className="mt-3 rounded-lg border p-3" style={{ background: "var(--ch-panel-2)", borderColor: "var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">Diagnostico</p>
          <p className={cn("mt-1 text-[12px] font-semibold leading-4", tone.text)}>
            {formatConnectionFinalStatus(attempt.finalStatus, attempt.mode)}
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-1 font-mono text-[9px] font-semibold uppercase", tone.badge)}>
          {attempt.mode === "phone" ? "codigo" : "qr"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <ConnectionDiagnosticCounter label="QR" value={attempt.qrReceivedCount} />
        <ConnectionDiagnosticCounter label="Codigo" value={attempt.pairCodeReceivedCount} />
        <ConnectionDiagnosticCounter label="Polls" value={attempt.statusPollCount} />
      </div>

      {readableReason ? (
        <p className="mt-3 break-words rounded-md bg-white px-2 py-2 text-[11px] leading-4 text-slate-500">
          {readableReason}
        </p>
      ) : null}

      {attempt.finalStatus === "passkey_blocked" ? (
        <div className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-2">
          <p className="font-mono text-[9px] uppercase text-amber-700">Conexao assistida recomendada</p>
          <p className="mt-1 text-[11px] leading-4 text-amber-800">
            {PASSKEY_CONNECTION_ASSISTED_TEXT} A validacao deve ser concluida no WhatsApp Web oficial antes de migrar a sessao autenticada.
          </p>
        </div>
      ) : null}

      {attempt.scanDetected !== null ? (
        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          {attempt.mode === "phone"
            ? attempt.scanDetected ? "Pareamento por codigo detectado" : "Pareamento por codigo nao confirmado"
            : attempt.scanDetected ? "Leitura do QR detectada" : "Leitura do QR nao confirmada"}
        </p>
      ) : null}

      {latestEvents.length > 0 ? (
        <div className="mt-3 grid gap-1.5">
          {latestEvents.map((event) => (
            <div key={`${event.type}-${event.at}`} className="flex items-center justify-between gap-2 text-[10px] leading-4">
              <span className="truncate text-slate-400">{formatConnectionEventType(event.type)}</span>
              <span className="shrink-0 font-mono text-slate-600">{formatConnectionEventTime(event.at)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConnectionDiagnosticCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white px-2 py-1.5">
      <p className="font-mono text-[9px] uppercase text-slate-500">{label}</p>
      <p className="mt-0.5 text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}

function StatusInfoTile({ connected }: { connected: boolean }) {
  return (
    <div className="min-w-0 rounded-lg px-3 py-2" style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">Status</p>
      <p
        className={cn(
          "mt-1 inline-flex items-center gap-2 break-words text-[12px] font-semibold leading-4",
          connected ? "text-emerald-700" : "text-rose-700",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_12px_currentColor]",
            connected ? "bg-emerald-400" : "bg-rose-400",
          )}
        />
        {connected ? "conectado" : "nao conectado"}
      </p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg px-3 py-2" style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-[12px] font-semibold leading-4" style={{ color: "var(--ch-text)" }}>{value}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  description,
  loading,
  disabled,
  tone = "default",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  loading?: boolean;
  disabled?: boolean;
  tone?: "default" | "whatsapp" | "ai";
  onClick: () => void;
}) {
  const actionTheme = tone === "whatsapp"
    ? {
        background: "linear-gradient(135deg, var(--ch-whatsapp-deep), var(--ch-whatsapp))",
        boxShadow: "0 12px 30px rgba(var(--ch-whatsapp-deep-rgb),0.18)",
      }
    : tone === "ai"
      ? {
          background: "linear-gradient(135deg, var(--ch-ai), var(--ch-ai-cyan))",
          boxShadow: "0 12px 30px rgba(var(--ch-ai-rgb),0.18)",
        }
      : {
          background: "linear-gradient(135deg, var(--ch-brand-action), var(--ch-brand-primary))",
          boxShadow: "0 12px 30px rgba(var(--ch-brand-primary-rgb),0.16)",
        };

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      data-connecty-contrast="dark"
      className="connecty-dark-action inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      style={actionTheme}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      <span className="inline-flex items-center gap-1.5">
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
    </button>
  );
}

function SecondaryAction({
  icon: Icon,
  label,
  description,
  loading,
  disabled,
  tone = "default",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  loading?: boolean;
  disabled?: boolean;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto",
        tone === "danger" ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-blue-100 bg-white text-blue-700 hover:border-blue-200 hover:bg-blue-50",
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      <span className="inline-flex items-center gap-1.5">
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
    </button>
  );
}

function getStatusMeta(status: WhatsappStatus): {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  bg: string;
  text: string;
} {
  if (status === "connected") {
    return {
      icon: Smartphone,
      label: "conectado",
      title: "WhatsApp conectado",
      description: "O numero esta pronto para enviar testes e receber conversas.",
      bg: "bg-emerald-400/10",
      text: "text-emerald-700",
    };
  }

  if (status === "qr_pending") {
    return {
      icon: QrCode,
      label: "qr pendente",
      title: "Aguardando leitura",
      description: "Finalize a conexao lendo o QR Code pelo WhatsApp.",
      bg: "bg-amber-400/10",
      text: "text-amber-700",
    };
  }

  if (status === "blocked" || status === "error") {
    return {
      icon: Power,
      label: "erro",
      title: "Conexao com erro",
      description: "Tente reconectar o numero ou acione o suporte da plataforma.",
      bg: "bg-rose-400/10",
      text: "text-rose-700",
    };
  }

  return {
    icon: PlugZap,
    label: "nao conectado",
    title: "Nenhum WhatsApp ativo",
    description: "Inicie a conexao para parear o numero.",
    bg: "bg-cyan-400/10",
    text: "text-blue-700",
  };
}

function formatPhone(value: string | null | undefined) {
  if (!value) {
    return "Nao informado";
  }

  return value;
}

function getInitials(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "WA";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
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

function formatConnectionFinalStatus(status: ConnectionFinalStatus, mode?: ConnectionMode) {
  const labels: Record<ConnectionFinalStatus, string> = {
    pending: "Tentativa em andamento",
    success: "Conexao concluida",
    passkey_blocked: "Verificacao extra solicitada",
    qr_timeout: mode === "phone" ? "Codigo expirou antes de conectar" : "QR expirou antes de conectar",
    disconnected: "Desconectou durante a tentativa",
    provider_error: "Erro na conexao",
    reset: "Sessao resetada",
    unknown: "Resultado desconhecido",
  };

  return labels[status];
}

function formatConnectionEventType(type: ConnectionEventType) {
  const labels: Record<ConnectionEventType, string> = {
    connect_requested: "inicio solicitado",
    connect_response: "resposta recebida",
    qr_received: "qr recebido",
    qr_updated: "qr atualizado",
    pair_code_received: "codigo recebido",
    pair_code_updated: "codigo atualizado",
    status_poll: "status consultado",
    status_connected: "conexao confirmada",
    status_disconnected: "desconexao informada",
    passkey_blocked: "chave de acesso",
    timeout: "timeout do qr",
    provider_error: "erro na conexao",
    reset_requested: "reset solicitado",
  };

  return labels[type];
}

function formatConnectionEventTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function getConnectionDiagnosticTone(status: ConnectionFinalStatus) {
  if (status === "success") {
    return {
      text: "text-emerald-700",
      badge: "bg-emerald-50 text-emerald-700",
    };
  }

  if (status === "passkey_blocked" || status === "qr_timeout") {
    return {
      text: "text-amber-700",
      badge: "bg-amber-50 text-amber-700",
    };
  }

  if (status === "provider_error" || status === "disconnected") {
    return {
      text: "text-rose-700",
      badge: "bg-rose-50 text-rose-700",
    };
  }

  return {
    text: "text-blue-700",
    badge: "bg-blue-50 text-blue-700",
  };
}

function emptyCloneRealTestSummary(): CloneRealTestSummary {
  return {
    total: 0,
    averageScore: null,
    lastScore: null,
    reviewCount: 0,
    lastEventAt: null,
    events: [],
  };
}

function formatCloneScore(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return `${Math.round(value * 100)}%`;
}

function formatCloneReviewFlag(value: string) {
  if (value === "identity_disclosure_risk") {
    return "identidade";
  }

  if (value === "promised_link_without_link") {
    return "link prometido";
  }

  if (value === "link_request_without_link") {
    return "link ausente";
  }

  if (value === "generic_bot_phrase") {
    return "frase generica";
  }

  if (value === "incomplete_response") {
    return "incompleta";
  }

  if (value === "literal_newline_bug") {
    return "quebra texto";
  }

  if (value === "repeated_pattern") {
    return "repeticao";
  }

  if (value === "missed_human_handoff") {
    return "humano";
  }

  if (value === "weak_clone_style_source") {
    return "estilo fraco";
  }

  return value.replace(/_/g, " ");
}

function getHumanizationMetricTextColor(status: CloneHumanizationMetric["status"]) {
  if (status === "good") return "text-emerald-700";
  if (status === "warning") return "text-amber-700";
  return "text-rose-700";
}

function getHumanizationMetricBarColor(status: CloneHumanizationMetric["status"]) {
  if (status === "good") return "bg-emerald-400";
  if (status === "warning") return "bg-amber-400";
  return "bg-rose-400";
}
