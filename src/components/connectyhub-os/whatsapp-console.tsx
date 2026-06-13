"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AudioLines,
  Bot,
  Building2,
  CheckCircle2,
  CircleHelp,
  Copy,
  Clock3,
  Eye,
  FileText,
  Forward,
  Globe2,
  GraduationCap,
  ImageIcon,
  Link2,
  Loader2,
  MessageCircle,
  MessageSquare,
  Mic,
  Pause,
  PenLine,
  PenOff,
  PlugZap,
  Power,
  Plus,
  QrCode,
  RefreshCcw,
  ShieldCheck,
  Shuffle,
  Smartphone,
  Smile,
  SplitSquareVertical,
  Sticker,
  Sun,
  Timer,
  Trash2,
  type LucideIcon,
  UserRound,
  Video,
  Volume2,
  Wand2,
  Wifi,
  X,
} from "lucide-react";
import { NeonBadge, Panel, SectionHeader } from "./panel-primitives";
import {
  defaultWhatsappBehaviorConfig,
  normalizeWhatsappBehaviorConfig,
  type WhatsappBehaviorConfig,
  type WhatsappGroupReplyMode,
  type WhatsappRapportMode,
  type WhatsappResponseMode,
} from "@/lib/whatsapp/agent-behavior";
import {
  defaultLeadQualificationConfig,
  isLeadQualificationConfigEqual,
  normalizeLeadQualificationConfig,
  type LeadQualificationConfig,
  type LeadQualificationQuestion,
} from "@/lib/leads/qualification";
import { cn } from "@/lib/utils";

type WhatsappStatus = "draft" | "qr_pending" | "connected" | "disconnected" | "blocked" | "error" | "archived";

type ClientCompany = {
  id: string;
  name: string;
  slug: string | null;
  planCode: string;
  status: string;
  role: string;
  createdAt: string | null;
};

type WhatsappState = {
  companies: ClientCompany[];
  selectedCompanyId: string | null;
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
  } | null;
  agent: {
    id: string;
    name: string;
    avatarUrl: string | null;
    avatarAlt: string | null;
    prompt: string;
    promptPreview: string;
    qualification?: LeadQualificationConfig;
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
  capability: {
    canConnect: boolean;
    schemaReady: boolean;
    message: string | null;
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

type AudioVoiceOption = {
  voiceId: string;
  name: string;
  source: "platform" | "customer" | "elevenlabs" | "library";
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

type WhatsappChannelOutboundItem = {
  id: string;
  operation: string;
  status: string;
  title: string;
  summary: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
  providerStatus: string | null;
  error: string | null;
};

type WhatsappChannelOperationsState = {
  instance: {
    id: string;
    status: string;
    displayName: string | null;
    phoneNumber: string | null;
  };
  behavior: {
    groups: boolean;
    groupReplyMode: WhatsappGroupReplyMode;
    statusBroadcasts: boolean;
    newsletterBroadcasts: boolean;
    campaignBroadcasts: boolean;
    interactiveMessages: boolean;
    maxStatusRecipients: number;
    campaignBatchSize: number;
    campaignDelayMinSeconds: number;
    campaignDelayMaxSeconds: number;
  };
  history: WhatsappChannelOutboundItem[];
};

type ChannelActionResponse = {
  operations?: WhatsappChannelOperationsState | null;
  result?: unknown;
  notice?: Notice;
  error?: string;
};

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

type WhatsappConsoleTab = "connection" | "prompt" | "qualification" | "behavior" | "multichannel" | "files";

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
    promptAssistant: string;
    voices: string;
  };
  connectionEnabled: boolean;
  connectionDisabledReason?: string;
  voiceCloneEnabled: boolean;
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

const clientWhatsappConsoleVariant = {
  entityIdKey: "companyId",
  entitySingular: "empresa",
  entityPlural: "empresas",
  entityPromptToken: "{{empresa}}",
  entityPromptLabel: "Empresa",
  entityPromptDescription: "Usa o nome da empresa cadastrada no painel.",
  sectionEyebrow: "WhatsApp / Agente comercial",
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
    promptAssistant: "/api/dashboard/whatsapp/prompt-assistant",
    voices: "/api/dashboard/voices",
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
    promptAssistant: "/api/admin/whatsapp/internal/prompt-assistant",
    voices: "/api/admin/whatsapp/internal/voices",
  },
  connectionEnabled: true,
  connectionDisabledReason: "Crie o agente do setor antes de conectar o WhatsApp interno.",
  voiceCloneEnabled: true,
} satisfies WhatsappConsoleVariant;

export function WhatsAppConsole({ variant = clientWhatsappConsoleVariant }: { variant?: WhatsappConsoleVariant }) {
  const [state, setState] = useState<WhatsappState | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [behaviorDraft, setBehaviorDraft] = useState<WhatsappBehaviorConfig>(defaultWhatsappBehaviorConfig);
  const [qualificationDraft, setQualificationDraft] = useState<LeadQualificationConfig>(defaultLeadQualificationConfig);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [promptProductUrl, setPromptProductUrl] = useState("");
  const [promptNotes, setPromptNotes] = useState("");
  const [linkButtonLabel, setLinkButtonLabel] = useState("");
  const [linkButtonUrl, setLinkButtonUrl] = useState("");
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [knowledgeUploading, setKnowledgeUploading] = useState(false);
  const [creatingLinkButton, setCreatingLinkButton] = useState(false);
  const [deletingLinkButtonId, setDeletingLinkButtonId] = useState<string | null>(null);
  const [channelOps, setChannelOps] = useState<WhatsappChannelOperationsState | null>(null);
  const [channelAction, setChannelAction] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const [statusMaxRecipients, setStatusMaxRecipients] = useState(defaultWhatsappBehaviorConfig.whatsappMaxStatusRecipients);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignNumbers, setCampaignNumbers] = useState("");
  const [campaignText, setCampaignText] = useState("");
  const [newsletterJid, setNewsletterJid] = useState("");
  const [newsletterText, setNewsletterText] = useState("");
  const [channelScheduledFor, setChannelScheduledFor] = useState("");
  const [activeTab, setActiveTab] = useState<WhatsappConsoleTab>("connection");
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const promptSelectionRef = useRef({ start: 0, end: 0 });
  const pendingPromptCaretRef = useRef<number | null>(null);
  const isAwaitingQrScan = Boolean(qrCode) || state?.instance?.status === "qr_pending";
  const isConnected = state?.instance?.status === "connected";
  const promptTags = useMemo(
    () => [
      {
        token: "{{lead_name}}",
        label: "Nome do lead",
        description: "Usa o nome salvo do lead quando estiver disponivel.",
      },
      {
        token: variant.entityPromptToken,
        label: variant.entityPromptLabel,
        description: variant.entityPromptDescription,
      },
      {
        token: "{{agente}}",
        label: "Agente",
        description: "Usa o nome do agente configurado nesta tela.",
      },
    ],
    [variant.entityPromptDescription, variant.entityPromptLabel, variant.entityPromptToken],
  );

  const applyWhatsappState = useCallback((nextState: WhatsappState, options?: { preserveDrafts?: boolean }) => {
    const nextCompanyId = nextState.selectedCompanyId ?? nextState.companies[0]?.id ?? "";

    setState(nextState);
    setSelectedCompanyId(nextCompanyId);
    if (!nextState.agent || !nextState.instance) {
      setChannelOps(null);
    }

    if (!options?.preserveDrafts) {
      const nextPrompt = nextState.agent?.prompt ?? "";

      setPromptDraft(nextPrompt);
      promptSelectionRef.current = { start: nextPrompt.length, end: nextPrompt.length };
      const nextBehavior = normalizeWhatsappBehaviorConfig(nextState.behavior);
      setBehaviorDraft(nextBehavior);
      setStatusMaxRecipients(nextBehavior.whatsappMaxStatusRecipients);
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
    if (!selectedCompanyId || !isAwaitingQrScan || running === "disconnect") {
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
          body: JSON.stringify({ action: "refresh_status", [variant.entityIdKey]: selectedCompanyId }),
        });
        const data = (await response.json().catch(() => null)) as ActionResponse | null;

        if (!cancelled && response.ok && data?.state) {
          applyWhatsappState(data.state, { preserveDrafts: true });

          if (data.state.instance?.status === "connected") {
            setQrCode(null);
            setNotice({ tone: "success", message: "WhatsApp conectado. Foto e status sincronizados." });
            return;
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
  }, [applyWhatsappState, isAwaitingQrScan, running, selectedCompanyId, variant]);

  useEffect(() => {
    if (!selectedCompanyId || !isConnected || running === "disconnect") {
      return;
    }

    let cancelled = false;

    async function pollConnectedStatus() {
      try {
        const response = await fetch(variant.endpoints.action, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh_status", [variant.entityIdKey]: selectedCompanyId }),
        });
        const data = (await response.json().catch(() => null)) as ActionResponse | null;

        if (!cancelled && response.ok && data?.state) {
          applyWhatsappState(data.state, { preserveDrafts: true });

          if (data.state.instance?.status !== "connected") {
            setQrCode(null);
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
  }, [applyWhatsappState, isConnected, running, selectedCompanyId, variant]);

  const loadChannelOperations = useCallback(async (options?: { silent?: boolean }) => {
    if (!selectedCompanyId) {
      setChannelOps(null);
      return;
    }

    if (!options?.silent) {
      setChannelAction("load_channels");
    }

    try {
      const query = `?${variant.entityIdKey}=${encodeURIComponent(selectedCompanyId)}`;
      const response = await fetch(`${variant.endpoints.channels}${query}`, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as ChannelActionResponse | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel carregar canais do WhatsApp.");
      }

      setChannelOps(data.operations ?? null);

      if (!options?.silent && data.notice) {
        setNotice(data.notice);
      }
    } catch (error) {
      if (!options?.silent) {
        setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao carregar canais do WhatsApp." });
      }
    } finally {
      if (!options?.silent) {
        setChannelAction(null);
      }
    }
  }, [selectedCompanyId, variant]);

  const channelAgentId = state?.agent?.id ?? "";
  const channelInstanceId = state?.instance?.id ?? "";
  const hasChannelContext = Boolean(selectedCompanyId && channelAgentId && channelInstanceId);

  useEffect(() => {
    if (!hasChannelContext) {
      return;
    }

    const timeoutId = setTimeout(() => {
      loadChannelOperations({ silent: true });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [hasChannelContext, loadChannelOperations]);

  const promptChanged = state?.agent ? promptDraft.trim() !== state.agent.prompt.trim() : false;
  const promptTooLong = promptDraft.length > agentPromptMaxLength;
  const behaviorChanged = state ? !isBehaviorEqual(behaviorDraft, state.behavior) : false;
  const qualificationChanged = state?.agent
    ? !isLeadQualificationConfigEqual(qualificationDraft, normalizeLeadQualificationConfig(state.agent.qualification))
    : false;
  const settingsChanged = promptChanged || behaviorChanged || qualificationChanged;
  const companies = state?.companies ?? [];
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? companies[0] ?? null;
  const needsCompany = !loading && companies.length === 0;
  const needsAgent = !loading && companies.length > 0 && !state?.agent;
  const headerTitle = loading || needsCompany ? "WhatsApp" : needsAgent ? "Criar agente WhatsApp" : "Conexao, prompt e comportamento";
  const headerDescription = loading || needsCompany
    ? variant.headerDescriptions.missingEntity
    : needsAgent
      ? variant.headerDescriptions.needsAgent
      : variant.headerDescriptions.ready;
  const promptHelper = `${promptDraft.length.toLocaleString("pt-BR")} / ${agentPromptMaxLength.toLocaleString("pt-BR")} caracteres`;

  useEffect(() => {
    const position = pendingPromptCaretRef.current;

    if (position === null) {
      return;
    }

    pendingPromptCaretRef.current = null;

    const textarea = promptTextareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(position, position);
    promptSelectionRef.current = { start: position, end: position };
  }, [promptDraft]);

  const rememberPromptSelection = useCallback((start: number, end: number) => {
    promptSelectionRef.current = { start, end };
  }, []);

  function updateBehavior<K extends keyof WhatsappBehaviorConfig>(key: K, value: WhatsappBehaviorConfig[K]) {
    setBehaviorDraft((current) => normalizeWhatsappBehaviorConfig({ ...current, [key]: value }));
  }

  function updatePromptDraft(value: string) {
    setPromptDraft(value.slice(0, agentPromptMaxLength));
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

  function insertPromptTag(token: string) {
    setPromptDraft((current) => {
      const textarea = promptTextareaRef.current;
      const fallbackSelection = promptSelectionRef.current;
      const rawStart = textarea?.selectionStart ?? fallbackSelection.start;
      const rawEnd = textarea?.selectionEnd ?? fallbackSelection.end;
      const start = Math.max(0, Math.min(rawStart, current.length));
      const end = Math.max(start, Math.min(rawEnd, current.length));
      const before = current.slice(0, start);
      const after = current.slice(end);
      const leadingSpace = before.length > 0 && !/\s$/.test(before) ? " " : "";
      const trailingSpace = after.length > 0 && !/^\s/.test(after) ? " " : "";
      const insertion = `${leadingSpace}${token}${trailingSpace}`;
      const next = `${before}${insertion}${after}`.slice(0, agentPromptMaxLength);
      const nextCaret = Math.min(before.length + leadingSpace.length + token.length, next.length);

      pendingPromptCaretRef.current = nextCaret;

      return next;
    });
  }

  function selectAudioVoice(voice: AudioVoiceOption) {
    setBehaviorDraft((current) =>
      normalizeWhatsappBehaviorConfig({
        ...current,
        responseMode: "audio",
        audioVoiceId: voice.isDefault ? "" : voice.voiceId,
        audioVoiceName: voice.name,
        audioVoiceSource: voice.source,
        audioVoicePublicOwnerId: voice.publicOwnerId ?? "",
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

    try {
      const response = await fetch(variant.endpoints.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, [variant.entityIdKey]: selectedCompanyId, ...payload }),
      });
      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel executar a acao.");
      }

      applyWhatsappState(data.state, { preserveDrafts: true });
      setQrCode(data.state.instance?.status === "connected" ? null : data.qrCode ?? null);
      setNotice(data.notice ?? { tone: "success", message: "Acao concluida." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro inesperado no WhatsApp." });
    } finally {
      setRunning(null);
    }
  }

  async function runChannelAction(action: string, payload: Record<string, unknown> = {}) {
    if (!selectedCompanyId) {
      setNotice({ tone: "warning", message: `Escolha um ${variant.entitySingular} antes de usar os canais.` });
      return;
    }

    setChannelAction(action);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.channels, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, [variant.entityIdKey]: selectedCompanyId, ...payload }),
      });
      const data = (await response.json().catch(() => null)) as ChannelActionResponse | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel executar o recurso do WhatsApp.");
      }

      setChannelOps(data.operations ?? null);
      setNotice(data.notice ?? { tone: "success", message: "Operacao do WhatsApp concluida." });

      if (action === "send_status") {
        setStatusText("");
      } else if (action === "send_campaign") {
        setCampaignText("");
        setCampaignNumbers("");
      } else if (action === "post_newsletter") {
        setNewsletterText("");
      }
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro inesperado no recurso do WhatsApp." });
    } finally {
      setChannelAction(null);
    }
  }

  async function saveAgentSettings() {
    setRunning("save_settings");
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.action, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [variant.entityIdKey]: selectedCompanyId,
          agentPrompt: promptDraft,
          behavior: behaviorDraft,
          qualificationConfig: qualificationDraft,
        }),
      });
      const data = (await response.json().catch(() => null)) as (WhatsappState & { error?: string }) | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a configuracao.");
      }

      applyWhatsappState(data);
      setNotice({ tone: "success", message: "Configuracao do agente salva." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao salvar configuracao." });
    } finally {
      setRunning(null);
    }
  }

  async function generatePromptWithAI() {
    if (!selectedCompanyId) {
      setNotice({ tone: "warning", message: `Escolha um ${variant.entitySingular} antes de gerar o prompt.` });
      return;
    }

    setGeneratingPrompt(true);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.promptAssistant, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [variant.entityIdKey]: selectedCompanyId,
          productUrl: promptProductUrl,
          notes: promptNotes,
        }),
      });
      const data = (await response.json().catch(() => null)) as { prompt?: string; error?: string } | null;

      if (!response.ok || !data?.prompt) {
        throw new Error(data?.error ?? "Nao foi possivel gerar o prompt com IA.");
      }

      updatePromptDraft(data.prompt);
      setNotice({ tone: "success", message: "Prompt gerado com IA. Revise e salve as alteracoes." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao gerar prompt." });
    } finally {
      setGeneratingPrompt(false);
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

      const nextState = await fetchWhatsappState(variant, selectedCompanyId);
      applyWhatsappState(nextState, { preserveDrafts: true });
      setNotice({ tone: "success", message: "Arquivo adicionado a inteligencia do agente." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao anexar arquivo." });
    } finally {
      setKnowledgeUploading(false);
    }
  }

  async function createTrackedLinkButton() {
    if (!selectedCompanyId) {
      setNotice({ tone: "warning", message: `Escolha um ${variant.entitySingular} antes de criar o link.` });
      return;
    }

    setCreatingLinkButton(true);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.links, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [variant.entityIdKey]: selectedCompanyId,
          label: linkButtonLabel,
          url: linkButtonUrl,
        }),
      });
      const data = (await response.json().catch(() => null)) as { linkButton?: TrackedLinkButton; error?: string } | null;

      if (!response.ok || !data?.linkButton) {
        throw new Error(data?.error ?? "Nao foi possivel criar o link rastreado.");
      }

      const nextState = await fetchWhatsappState(variant, selectedCompanyId);
      applyWhatsappState(nextState, { preserveDrafts: true });
      setLinkButtonLabel("");
      setLinkButtonUrl("");
      setNotice({ tone: "success", message: `Link criado. Use a tag ${data.linkButton.tag} no prompt quando quiser enviar esse botao.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao criar link rastreado." });
    } finally {
      setCreatingLinkButton(false);
    }
  }

  async function copyTrackedLinkButtonTag(link: TrackedLinkButton) {
    try {
      await navigator.clipboard.writeText(link.tag);
      setNotice({ tone: "success", message: `Tag copiada: ${link.tag}` });
    } catch {
      setNotice({ tone: "error", message: "Nao foi possivel copiar a tag. Selecione a tag e copie manualmente." });
    }
  }

  async function deleteTrackedLinkButton(link: TrackedLinkButton) {
    if (!selectedCompanyId) {
      setNotice({ tone: "warning", message: `Escolha um ${variant.entitySingular} antes de excluir o link.` });
      return;
    }

    const confirmed = window.confirm(
      `Excluir o link "${link.label}"?\n\nSe a tag ${link.tag} estiver no prompt, remova ela antes de salvar o agente.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingLinkButtonId(link.id);
    setNotice(null);

    try {
      const response = await fetch(variant.endpoints.links, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [variant.entityIdKey]: selectedCompanyId,
          linkButtonId: link.id,
        }),
      });
      const data = (await response.json().catch(() => null)) as { deletedLinkButtonId?: string; error?: string } | null;

      if (!response.ok || data?.deletedLinkButtonId !== link.id) {
        throw new Error(data?.error ?? "Nao foi possivel excluir o link rastreado.");
      }

      const nextState = await fetchWhatsappState(variant, selectedCompanyId);
      applyWhatsappState(nextState, { preserveDrafts: true });
      setNotice({ tone: "success", message: `Link "${link.label}" excluido.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao excluir link rastreado." });
    } finally {
      setDeletingLinkButtonId(null);
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
      const response = await fetch(variant.endpoints.createAgent, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_agent",
          [variant.entityIdKey]: selectedCompanyId,
          name: agentName.trim() || "Agente WhatsApp",
          roleTitle: variant.agentRoleTitle,
        }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel criar o agente.");
      }

      const nextState = await fetchWhatsappState(variant, selectedCompanyId);
      applyWhatsappState(nextState);
      setAgentName("");
      setShowAgentForm(false);
      setNotice({ tone: "success", message: "Agente criado. Agora configure o prompt, comportamento e conexao." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao criar agente." });
    } finally {
      setCreatingAgent(false);
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

      {loading ? (
        <LoadingState />
      ) : companies.length === 0 ? (
        <CompanyRequiredState variant={variant} />
      ) : !state?.agent ? (
        <AgentCreationGate
          agentName={agentName}
          companies={companies}
          creating={creatingAgent}
          selectedCompany={selectedCompany}
          selectedCompanyId={selectedCompanyId}
          showForm={showAgentForm}
          onAgentNameChange={setAgentName}
          onCancel={() => setShowAgentForm(false)}
          onCreate={createWhatsappAgent}
          onSelectCompany={setSelectedCompanyId}
          onStart={() => setShowAgentForm(true)}
          variant={variant}
        />
      ) : (
      <>
        <WhatsappConsoleCommandBar
          agent={state.agent}
          behavior={behaviorDraft}
          company={selectedCompany}
          entityLabel={variant.entityPromptLabel}
          instance={state.instance}
          promptChanged={promptChanged}
          qualificationChanged={qualificationChanged}
          settingsChanged={settingsChanged}
          behaviorChanged={behaviorChanged}
          promptTooLong={promptTooLong}
          saving={running === "save_settings"}
          disabled={!state.capability.schemaReady || !settingsChanged || promptTooLong}
          onSave={saveAgentSettings}
        />

        <WhatsappConsoleTabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "connection" ? (
        <Panel
          title="Conexao e identidade"
          eyebrow="numero / agente / status"
          action={<NeonBadge tone={state.instance?.status === "connected" ? "green" : "amber"}>{state.instance?.status === "connected" ? "online" : "pendente"}</NeonBadge>}
        >
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid content-start gap-4">
              <AgentIdentityCard agent={state.agent} company={selectedCompany} entityLabel={variant.entityPromptLabel} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="Conversa" value={formatResponseMode(behaviorDraft.responseMode)} />
                <InfoTile label="Rapport" value={formatRapportMode(behaviorDraft.adaptiveRapportMode)} />
                <InfoTile label="Grupos" value={behaviorDraft.allowGroupChats ? formatGroupReplyMode(behaviorDraft.groupReplyMode) : "Pausado"} />
                <InfoTile label="Alteracoes" value={settingsChanged ? "Pendentes" : "Salvo"} />
              </div>
            </div>
            <CompactConnectionCard
              instance={state.instance}
              qrCode={qrCode}
              running={running}
              onConnect={() => runAction("connect")}
              onDisconnect={() => runAction("disconnect")}
              onRefresh={() => runAction("refresh_status")}
              enabled={variant.connectionEnabled && state.capability.canConnect}
              disabledReason={state.capability.message ?? variant.connectionDisabledReason}
            />
          </div>
        </Panel>
        ) : null}

        {activeTab === "files" ? (
        <Panel
          title="Arquivos"
          eyebrow="base de conhecimento"
          action={<NeonBadge tone={state.knowledge.files.length > 0 ? "green" : "amber"}>{state.knowledge.files.length.toLocaleString("pt-BR")} arquivos</NeonBadge>}
        >
          <div className="max-w-xl">
            <KnowledgeFilesPanel
              files={state.knowledge.files}
              knowledgeUploading={knowledgeUploading}
              onUploadFile={uploadKnowledgeFile}
              entitySingular={variant.entitySingular}
            />
          </div>
        </Panel>
        ) : null}

        {activeTab === "prompt" ? (
        <Panel
          title="Prompt do agente"
          eyebrow="atendimento / vendas"
          action={<NeonBadge tone={promptChanged ? "amber" : "green"}>{promptChanged ? "alterado" : "salvo"}</NeonBadge>}
        >
          {state?.agent ? (
            <div className="grid gap-4">
              <div className="grid gap-4">
                <AgentIdentityCard agent={state.agent} company={selectedCompany} entityLabel={variant.entityPromptLabel} />

                <PromptBox
                  label="Prompt do agente"
                  description="Define o tom, limites, perguntas e forma de atendimento do agente neste WhatsApp. Nao e template fixo de mensagem."
                  value={promptDraft}
                  maxLength={agentPromptMaxLength}
                  onChange={updatePromptDraft}
                  onSelectionChange={rememberPromptSelection}
                  textareaRef={promptTextareaRef}
                  helper={promptHelper}
                />

                <PromptToolsPanel
                  generatingPrompt={generatingPrompt}
                  linkButtons={state.linkButtons}
                  linkButtonLabel={linkButtonLabel}
                  linkButtonUrl={linkButtonUrl}
                  creatingLinkButton={creatingLinkButton}
                  deletingLinkButtonId={deletingLinkButtonId}
                  notes={promptNotes}
                  productUrl={promptProductUrl}
                  onCopyLinkButtonTag={copyTrackedLinkButtonTag}
                  onCreateLinkButton={createTrackedLinkButton}
                  onDeleteLinkButton={deleteTrackedLinkButton}
                  onGenerate={generatePromptWithAI}
                  onInsertTag={insertPromptTag}
                  onLinkButtonLabelChange={setLinkButtonLabel}
                  onLinkButtonUrlChange={setLinkButtonUrl}
                  onNotesChange={setPromptNotes}
                  onProductUrlChange={setPromptProductUrl}
                  promptTags={promptTags}
                  entitySingular={variant.entitySingular}
                />

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
                    disabled={!state?.capability.schemaReady || !state.agent || !settingsChanged || promptTooLong}
                    loading={running === "save_settings"}
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

      {state?.agent && activeTab === "qualification" ? (
      <div className="mt-5">
        <Panel
          title="Qualificacao do lead"
          eyebrow="crm / perguntas / score"
          action={<NeonBadge tone={qualificationChanged ? "amber" : "green"}>{qualificationChanged ? "alterado" : "salvo"}</NeonBadge>}
        >
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
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
                disabled={!state?.capability.schemaReady || !settingsChanged}
                loading={running === "save_settings"}
                onClick={saveAgentSettings}
              />
            </div>
          </div>
        </Panel>
      </div>
      ) : null}

      {state?.agent && activeTab === "behavior" ? (
      <div className="mt-5">
        <Panel
          title="Comportamento do agente"
          eyebrow="controles do atendimento"
          action={<NeonBadge tone={behaviorChanged ? "amber" : "green"}>{behaviorChanged ? "alterado" : "salvo"}</NeonBadge>}
        >
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-3">
              <BehaviorSection title="Base do agente" description="Controles principais que ligam ou pausam o atendimento automatico deste agente." defaultOpen>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <ToggleTile icon={Power} label="Agente ativo" description="Quando ligado, o agente pode responder leads automaticamente neste WhatsApp." checked={behaviorDraft.agentEnabled} onChange={() => updateBehavior("agentEnabled", !behaviorDraft.agentEnabled)} />
                  <ToggleTile icon={Wifi} label="Sempre online" description="Mantem o atendimento disponivel sem depender de horario comercial." checked={behaviorDraft.alwaysOnline} onChange={() => updateBehavior("alwaysOnline", !behaviorDraft.alwaysOnline)} />
                  <ToggleTile icon={Eye} label="Marcar como lido" description="Marca mensagens como lidas depois que o sistema processa a conversa." checked={behaviorDraft.markAsRead} onChange={() => updateBehavior("markAsRead", !behaviorDraft.markAsRead)} />
                  <ToggleTile icon={SplitSquareVertical} label="Dividir respostas" description="Quebra respostas longas em mensagens menores para parecer mais natural." checked={behaviorDraft.splitMessages} onChange={() => updateBehavior("splitMessages", !behaviorDraft.splitMessages)} />
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
                      <h3 className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-100">Modo de conversa</h3>
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
                      <h3 className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-100">Rapport adaptativo</h3>
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

              <BehaviorSection title="Simulacao humana" description="Comportamentos que fazem o agente parecer uma pessoa real no WhatsApp.">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <ToggleTile icon={PenLine} label="Linguagem humanizada" description="Instrui a IA a usar abreviacoes, emoji e tom informal de brasileiro no WhatsApp." checked={behaviorDraft.humanizedLanguage} onChange={() => updateBehavior("humanizedLanguage", !behaviorDraft.humanizedLanguage)} />
                  <ToggleTile icon={Smile} label="Reacoes emoji" description="Reage a mensagens do lead com emoji contextual antes de responder." checked={behaviorDraft.emojiReactions} onChange={() => updateBehavior("emojiReactions", !behaviorDraft.emojiReactions)} />
                  <ToggleTile icon={Shuffle} label="Variacao de timing" description="Adiciona aleatoriedade de ±30% em todos os tempos de resposta." checked={behaviorDraft.timingJitter} onChange={() => updateBehavior("timingJitter", !behaviorDraft.timingJitter)} />
                  <ToggleTile icon={Pause} label="Pausa ao digitar" description="Simula o padrao humano de digitar, parar e voltar a digitar." checked={behaviorDraft.composingPause} onChange={() => updateBehavior("composingPause", !behaviorDraft.composingPause)} />
                  <ToggleTile icon={Eye} label="Delay ao visualizar" description="Atrasa a marcacao de lido para simular que o agente nao esta sempre olhando o celular." checked={behaviorDraft.readReceiptDelay} onChange={() => updateBehavior("readReceiptDelay", !behaviorDraft.readReceiptDelay)} />
                  <ToggleTile icon={AudioLines} label="Audio espontaneo" description="Envia audio ocasionalmente mesmo quando o lead manda texto, como humano faria." checked={behaviorDraft.spontaneousAudio} onChange={() => updateBehavior("spontaneousAudio", !behaviorDraft.spontaneousAudio)} />
                  <ToggleTile icon={PenOff} label="Typos intencionais" description="A IA simula erros de digitacao e autocorrecoes naturais como um humano real." checked={behaviorDraft.intentionalTypos} onChange={() => updateBehavior("intentionalTypos", !behaviorDraft.intentionalTypos)} />
                  <ToggleTile icon={Sun} label="Ritmo circadiano" description="Responde mais rapido de dia e mais devagar a noite, como padrao humano." checked={behaviorDraft.circadianTiming} onChange={() => updateBehavior("circadianTiming", !behaviorDraft.circadianTiming)} />
                  <ToggleTile icon={Mic} label="Preenchimento vocal" description="Adiciona hesitacoes naturais nos audios: 'hmm', 'entao', pausas de pensamento." checked={behaviorDraft.naturalAudioFillers} onChange={() => updateBehavior("naturalAudioFillers", !behaviorDraft.naturalAudioFillers)} />
                  <ToggleTile icon={Sticker} label="Figurinhas" description="Envia stickers contextuais ocasionalmente para simular comportamento natural do WhatsApp." checked={behaviorDraft.sendStickers} onChange={() => updateBehavior("sendStickers", !behaviorDraft.sendStickers)} />
                  <ToggleTile icon={Forward} label="Midia proativa" description="Permite que o agente envie imagens, catalogos ou midias relevantes de forma espontanea." checked={behaviorDraft.proactiveMedia} onChange={() => updateBehavior("proactiveMedia", !behaviorDraft.proactiveMedia)} />
                  <ToggleTile icon={GraduationCap} label="Aprendizado continuo" description="O agente aprende com cada atendimento e cita experiencias reais anonimizadas de outros clientes." checked={behaviorDraft.agentLearning} onChange={() => updateBehavior("agentLearning", !behaviorDraft.agentLearning)} />
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <NumberField label="Chance reacao %" description="Probabilidade de reagir a cada mensagem com emoji." value={behaviorDraft.reactionProbability} min={0} max={100} onChange={(value) => updateBehavior("reactionProbability", value)} />
                  <NumberField label="Leitura min (s)" description="Segundos minimos antes de marcar como lido." value={behaviorDraft.readReceiptMinSeconds} min={1} max={30} onChange={(value) => updateBehavior("readReceiptMinSeconds", value)} />
                  <NumberField label="Leitura max (s)" description="Segundos maximos antes de marcar como lido." value={behaviorDraft.readReceiptMaxSeconds} min={2} max={60} onChange={(value) => updateBehavior("readReceiptMaxSeconds", value)} />
                  <NumberField label="Chance audio %" description="Probabilidade de responder com audio espontaneo em vez de texto." value={behaviorDraft.spontaneousAudioProbability} min={0} max={100} onChange={(value) => updateBehavior("spontaneousAudioProbability", value)} />
                  <NumberField label="Chance figurinha %" description="Probabilidade de enviar sticker apos responder." value={behaviorDraft.stickerProbability} min={0} max={100} onChange={(value) => updateBehavior("stickerProbability", value)} />
                </div>
              </BehaviorSection>

              <BehaviorSection title="Seguranca e testes" description="Protecoes para evitar atendimento indevido, loops e conflitos com humanos.">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <ToggleTile icon={ShieldCheck} label="Intervencao humana" description="Pausa a IA quando um humano assume a conversa ou quando o lead pede atendimento humano." checked={behaviorDraft.humanIntervention} onChange={() => updateBehavior("humanIntervention", !behaviorDraft.humanIntervention)} />
                  <ToggleTile icon={Bot} label="Protecao bots/loops" description="Evita conversas infinitas quando outro bot ou automacao responder o agente." checked={behaviorDraft.botLoopProtection} onChange={() => updateBehavior("botLoopProtection", !behaviorDraft.botLoopProtection)} />
                  <ToggleTile icon={UserRound} label="Teste entre instancias" description="Permite testar mensagens entre numeros internos sem bloquear a automacao." checked={behaviorDraft.allowInternalInstanceMessages} onChange={() => updateBehavior("allowInternalInstanceMessages", !behaviorDraft.allowInternalInstanceMessages)} />
                  <ToggleTile icon={MessageCircle} label="Atender grupos" description="Permite que o agente responda mensagens em grupos do WhatsApp. Desligado, grupos sao ignorados." checked={behaviorDraft.allowGroupChats} onChange={() => updateBehavior("allowGroupChats", !behaviorDraft.allowGroupChats)} />
                  <ToggleTile icon={Clock3} label="Janela da IA ativa" description="Faz o agente responder apenas dentro do horario configurado na Janela da IA." checked={behaviorDraft.aiScheduleEnabled} onChange={() => updateBehavior("aiScheduleEnabled", !behaviorDraft.aiScheduleEnabled)} />
                </div>
              </BehaviorSection>

              <BehaviorSection title="Grupos, status e canais" description="Libera recursos avancados do WhatsApp com controles separados para grupos, Status, newsletters e campanhas.">
                <div className="grid gap-3">
                  <ModeSelector<WhatsappGroupReplyMode>
                    value={behaviorDraft.groupReplyMode}
                    options={[
                      { value: "all", label: "Todos", description: "Responde toda mensagem", help: "Quando Atender grupos estiver ligado, qualquer mensagem do grupo pode acionar o agente." },
                      { value: "mentions", label: "Mencoes", description: "So quando citado", help: "O agente responde grupos apenas quando detectar mencao, nome do agente ou referencia direta." },
                      { value: "admins", label: "Admins", description: "Somente admins", help: "Responde so quando o webhook trouxer sinal de administrador no grupo." },
                    ]}
                    onChange={(value) => updateBehavior("groupReplyMode", value)}
                  />
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <ToggleTile icon={MessageCircle} label="Mencionar todos" description="Permite usar mencao geral em mensagens operacionais de grupo quando a Uazapi aceitar." checked={behaviorDraft.groupMentionAll} onChange={() => updateBehavior("groupMentionAll", !behaviorDraft.groupMentionAll)} />
                    <ToggleTile icon={MessageSquare} label="Interativos" description="Libera uso de botoes/listas quando um fluxo operacional pedir esse formato." checked={behaviorDraft.interactiveMessages} onChange={() => updateBehavior("interactiveMessages", !behaviorDraft.interactiveMessages)} />
                    <ToggleTile icon={Globe2} label="Status WhatsApp" description="Permite publicar stories/status pelo painel usando processamento Inngest." checked={behaviorDraft.statusBroadcasts} onChange={() => updateBehavior("statusBroadcasts", !behaviorDraft.statusBroadcasts)} />
                    <ToggleTile icon={FileText} label="Canais" description="Permite postar em canais/newsletters do WhatsApp pelo painel." checked={behaviorDraft.newsletterBroadcasts} onChange={() => updateBehavior("newsletterBroadcasts", !behaviorDraft.newsletterBroadcasts)} />
                    <ToggleTile icon={Forward} label="Campanhas" description="Permite criar disparos em lote via Uazapi Sender, sempre processados pelo Inngest." checked={behaviorDraft.campaignBroadcasts} onChange={() => updateBehavior("campaignBroadcasts", !behaviorDraft.campaignBroadcasts)} />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <NumberField label="Max status" description="Limite maximo de contatos usados em cada publicacao de Status." value={behaviorDraft.whatsappMaxStatusRecipients} min={1} max={500} onChange={(value) => updateBehavior("whatsappMaxStatusRecipients", value)} />
                    <NumberField label="Lote campanha" description="Quantidade maxima de numeros aceitos por campanha simples." value={behaviorDraft.whatsappCampaignBatchSize} min={1} max={500} onChange={(value) => updateBehavior("whatsappCampaignBatchSize", value)} />
                    <NumberField label="Delay min" description="Intervalo minimo entre mensagens da campanha." value={behaviorDraft.whatsappCampaignDelayMinSeconds} min={5} max={600} onChange={(value) => updateBehavior("whatsappCampaignDelayMinSeconds", value)} />
                    <NumberField label="Delay max" description="Intervalo maximo entre mensagens da campanha." value={behaviorDraft.whatsappCampaignDelayMaxSeconds} min={5} max={900} onChange={(value) => updateBehavior("whatsappCampaignDelayMaxSeconds", value)} />
                  </div>
                </div>
              </BehaviorSection>

              <BehaviorSection title="Cenarios especiais do lead" description="Eventos que a IA deve reconhecer para alimentar CRM, memoria e proximos passos.">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <ToggleTile icon={UserRound} label="Pedido de humano" description="Identifica quando o lead pede vendedor, atendente ou suporte humano." checked={behaviorDraft.detectHumanRequest} onChange={() => updateBehavior("detectHumanRequest", !behaviorDraft.detectHumanRequest)} />
                  <ToggleTile icon={Clock3} label="Cancelar/remarcar" description="Reconhece pedidos de cancelamento, reagendamento ou mudanca de horario." checked={behaviorDraft.detectRescheduleCancel} onChange={() => updateBehavior("detectRescheduleCancel", !behaviorDraft.detectRescheduleCancel)} />
                  <ToggleTile icon={MessageSquare} label="Captacao" description="Detecta quando o lead quer cadastrar, vender ou oferecer um imovel/produto." checked={behaviorDraft.detectPropertyCapture} onChange={() => updateBehavior("detectPropertyCapture", !behaviorDraft.detectPropertyCapture)} />
                  <ToggleTile icon={Globe2} label="Localizacao" description="Registra localizacao enviada pelo lead para enriquecer atendimento e CRM." checked={behaviorDraft.detectLocation} onChange={() => updateBehavior("detectLocation", !behaviorDraft.detectLocation)} />
                  <ToggleTile icon={ShieldCheck} label="Opt-out" description="Detecta quando o lead pede para parar contato ou sair da lista." checked={behaviorDraft.detectOptOut} onChange={() => updateBehavior("detectOptOut", !behaviorDraft.detectOptOut)} />
                  <ToggleTile icon={Link2} label="Links do lead" description="Analisa links enviados pelo lead e guarda contexto util para atendimento." checked={behaviorDraft.analyzeLinks} onChange={() => updateBehavior("analyzeLinks", !behaviorDraft.analyzeLinks)} />
                  <ToggleTile icon={MessageCircle} label="Resposta citada" description="Usa a mensagem citada no WhatsApp para entender melhor a resposta do lead." checked={behaviorDraft.quotedReplyContext} onChange={() => updateBehavior("quotedReplyContext", !behaviorDraft.quotedReplyContext)} />
                  <ToggleTile icon={FileText} label="Salvar midia" description={`Salva arquivos relevantes recebidos para historico, CRM e memoria do ${variant.entitySingular}.`} checked={behaviorDraft.leadFileStorage} onChange={() => updateBehavior("leadFileStorage", !behaviorDraft.leadFileStorage)} />
                </div>
              </BehaviorSection>

              <BehaviorSection title="Audio e midia com IA" description="Define quais tipos de midia a IA pode interpretar antes de responder o lead.">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="grid gap-2 md:grid-cols-2">
                    <ToggleTile icon={Mic} label="Transcrever audio" description="Converte audios recebidos em texto para a IA entender antes de responder." checked={behaviorDraft.audioTranscription} onChange={() => updateBehavior("audioTranscription", !behaviorDraft.audioTranscription)} />
                    <ToggleTile icon={ImageIcon} label="Analisar imagens" description="Permite que a IA leia imagens enviadas pelo lead e use esse contexto." checked={behaviorDraft.mediaImage} onChange={() => updateBehavior("mediaImage", !behaviorDraft.mediaImage)} />
                    <ToggleTile icon={FileText} label="Analisar documentos" description="Permite interpretar documentos recebidos quando forem relevantes para o atendimento." checked={behaviorDraft.mediaDocument} onChange={() => updateBehavior("mediaDocument", !behaviorDraft.mediaDocument)} />
                    <ToggleTile icon={Video} label="Analisar videos" description="Permite analisar videos enviados, respeitando os limites de lote configurados." checked={behaviorDraft.mediaVideo} onChange={() => updateBehavior("mediaVideo", !behaviorDraft.mediaVideo)} />
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <NumberField label="Imagens" description="Maximo de imagens analisadas quando o lead envia varias midias juntas." value={behaviorDraft.mediaBatchImageLimit} min={1} max={20} onChange={(value) => updateBehavior("mediaBatchImageLimit", value)} />
                    <NumberField label="Videos" description="Maximo de videos analisados em um mesmo lote de mensagens." value={behaviorDraft.mediaBatchVideoLimit} min={1} max={5} onChange={(value) => updateBehavior("mediaBatchVideoLimit", value)} />
                    <NumberField label="Documentos" description="Maximo de documentos analisados em um mesmo lote de mensagens." value={behaviorDraft.mediaBatchDocumentLimit} min={1} max={8} onChange={(value) => updateBehavior("mediaBatchDocumentLimit", value)} />
                  </div>
                </div>
              </BehaviorSection>

              <BehaviorSection title="Temporizadores" description="Define pausas antes de responder, para evitar respostas instantaneas demais ou fora de contexto.">
                <div className="grid gap-3">
                  <ToggleTile icon={Timer} label="Temporizacao inteligente" description="Ajusta o tempo de resposta conforme o tipo e a quantidade de mensagens recebidas." checked={behaviorDraft.smartTiming} onChange={() => updateBehavior("smartTiming", !behaviorDraft.smartTiming)} />
                  <div className="grid gap-2 md:grid-cols-3 2xl:grid-cols-4">
                    <NumberField label="So texto" description="Segundos de espera quando chega apenas uma mensagem de texto." value={behaviorDraft.timingTextSeconds} min={2} max={60} onChange={(value) => updateBehavior("timingTextSeconds", value)} />
                    <NumberField label="Textos seguidos" description="Espera quando o lead manda varias mensagens de texto em sequencia." value={behaviorDraft.timingTextBurstSeconds} min={3} max={90} onChange={(value) => updateBehavior("timingTextBurstSeconds", value)} />
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
                    <NumberField label="Fallback" description="Tempo minimo para agrupar mensagens antes de gerar resposta." value={behaviorDraft.debounceSeconds} min={5} max={120} onChange={(value) => updateBehavior("debounceSeconds", value)} />
                    <NumberField label="Reativar agente" description="Minutos ate a IA voltar depois de uma intervencao humana." value={behaviorDraft.humanInterventionMinutes} min={5} max={1440} onChange={(value) => updateBehavior("humanInterventionMinutes", value)} />
                  </div>
                </div>
              </BehaviorSection>

              <BehaviorSection title="Janela da IA" description="Horario em que o agente pode responder quando a opcao Janela da IA ativa estiver ligada.">
                <div className="grid gap-2 md:grid-cols-3">
                  <TextField label="Inicio" description="Horario em que a IA comeca a responder." value={behaviorDraft.aiScheduleStart} onChange={(value) => updateBehavior("aiScheduleStart", value)} />
                  <TextField label="Fim" description="Horario em que a IA para de responder." value={behaviorDraft.aiScheduleEnd} onChange={(value) => updateBehavior("aiScheduleEnd", value)} />
                  <TextField label="Fuso horario" description="Fuso usado para calcular a janela de atendimento." value={behaviorDraft.aiScheduleTimezone} onChange={(value) => updateBehavior("aiScheduleTimezone", value)} />
                </div>
              </BehaviorSection>
            </div>

            <BehaviorSummary behavior={behaviorDraft} promptChanged={promptChanged} behaviorChanged={behaviorChanged} />

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
                disabled={!state?.capability.schemaReady || !settingsChanged}
                loading={running === "save_settings"}
                onClick={saveAgentSettings}
              />
            </div>
          </div>
        </Panel>
      </div>
      ) : null}

      {state?.agent && activeTab === "multichannel" ? (
      <div className="mt-5">
        <Panel
          title="Operacao multicanal"
          eyebrow="grupos / status / canais / campanhas"
          action={<NeonBadge tone={channelOps ? "green" : "amber"}>{channelOps ? "sincronizado" : "pendente"}</NeonBadge>}
        >
          <WhatsappChannelOperationsPanel
            behavior={behaviorDraft}
            channelAction={channelAction}
            channelOps={channelOps}
            campaignNumbers={campaignNumbers}
            campaignText={campaignText}
            campaignTitle={campaignTitle}
            channelScheduledFor={channelScheduledFor}
            newsletterJid={newsletterJid}
            newsletterText={newsletterText}
            statusMaxRecipients={statusMaxRecipients}
            statusText={statusText}
            onCampaignNumbersChange={setCampaignNumbers}
            onCampaignTextChange={setCampaignText}
            onCampaignTitleChange={setCampaignTitle}
            onChannelScheduledForChange={setChannelScheduledFor}
            onNewsletterJidChange={setNewsletterJid}
            onNewsletterTextChange={setNewsletterText}
            onRefresh={() => loadChannelOperations()}
            onRunAction={runChannelAction}
            onStatusMaxRecipientsChange={setStatusMaxRecipients}
            onStatusTextChange={setStatusText}
          />
        </Panel>
      </div>
      ) : null}
      </>
      )}
    </>
  );
}

async function fetchWhatsappState(variant: WhatsappConsoleVariant, entityId?: string) {
  const query = entityId ? `?${variant.entityIdKey}=${encodeURIComponent(entityId)}` : "";
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

function isBehaviorEqual(left: WhatsappBehaviorConfig, right: WhatsappBehaviorConfig) {
  return JSON.stringify(normalizeWhatsappBehaviorConfig(left)) === JSON.stringify(normalizeWhatsappBehaviorConfig(right));
}

function NoticeBar({ notice }: { notice: Notice }) {
  const colors = {
    success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    error: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  } satisfies Record<Notice["tone"], string>;

  return (
    <div className={cn("mb-5 rounded-xl border px-4 py-3 text-[13px] leading-5", colors[notice.tone])}>
      {notice.message}
    </div>
  );
}

function LoadingState() {
  return (
    <Panel title="WhatsApp" eyebrow="carregando">
      <div className="grid min-h-[240px] place-items-center text-cyan-300">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    </Panel>
  );
}

function CompanyRequiredState({ variant }: { variant: WhatsappConsoleVariant }) {
  return (
    <Panel title={`Nenhum ${variant.entitySingular} cadastrado`} eyebrow="primeiro passo">
      <div className="grid min-h-[280px] place-items-center text-center">
        <div className="max-w-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
            <Building2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>{variant.missingEntityTitle}</h2>
          <p className="mt-2 text-[13px] leading-6 text-slate-500">
            {variant.missingEntityDescription}
          </p>
          <Link
            className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
            href={variant.missingEntityHref}
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
}> = [
  { id: "connection", label: "Conexao", description: "Numero e status", icon: Smartphone },
  { id: "prompt", label: "Prompt", description: "Texto do agente", icon: PenLine },
  { id: "qualification", label: "Qualificacao", description: "CRM e score", icon: CheckCircle2 },
  { id: "behavior", label: "Comportamento", description: "Modos e timers", icon: Shuffle },
  { id: "multichannel", label: "Multicanal", description: "Grupos e campanhas", icon: Forward },
  { id: "files", label: "Arquivos", description: "Conhecimento", icon: FileText },
];

function WhatsappConsoleCommandBar({
  agent,
  behavior,
  company,
  entityLabel,
  instance,
  promptChanged,
  qualificationChanged,
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
  promptChanged: boolean;
  qualificationChanged: boolean;
  settingsChanged: boolean;
  behaviorChanged: boolean;
  promptTooLong: boolean;
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
}) {
  const statusMeta = getStatusMeta(instance?.status ?? "draft");
  const changedAreas = [
    promptChanged ? "Prompt" : null,
    qualificationChanged ? "CRM" : null,
    behaviorChanged ? "Comportamento" : null,
  ].filter(Boolean);
  const changeLabel = promptTooLong
    ? "Prompt longo"
    : changedAreas.length > 0
      ? changedAreas.join(", ")
      : "Salvo";

  return (
    <div
      className="sticky top-3 z-20 mb-4 rounded-xl border px-3 py-3 shadow-2xl shadow-slate-950/20 backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--ch-surface) 92%, transparent)", borderColor: "var(--ch-border)" }}
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryPill label="Agente" value={agent.name} />
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
}: {
  activeTab: WhatsappConsoleTab;
  onChange: (tab: WhatsappConsoleTab) => void;
}) {
  return (
    <div
      className="mb-4 overflow-x-auto rounded-xl border p-1"
      role="tablist"
      aria-label="Secoes do painel WhatsApp"
      style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
    >
      <div className="grid min-w-[760px] grid-cols-6 gap-1">
        {whatsappConsoleTabs.map((tab) => {
          const active = tab.id === activeTab;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              className={cn(
                "grid min-h-[58px] grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-lg px-3 text-left transition",
                active
                  ? "bg-cyan-300 text-slate-950 shadow-[0_0_22px_rgba(103,232,249,0.22)] ring-1 ring-cyan-100/70"
                  : "text-slate-200 hover:bg-white/10 hover:text-white",
              )}
              onClick={() => onChange(tab.id)}
            >
              <Icon className={cn("h-4 w-4", active ? "text-slate-950" : "text-slate-200")} />
              <span className="min-w-0">
                <span className={cn("block truncate text-[12px] font-semibold leading-4", active ? "text-slate-950" : "text-slate-100")}>{tab.label}</span>
                <span className={cn("mt-0.5 block truncate font-mono text-[8px] uppercase tracking-widest", active ? "text-slate-800" : "text-slate-300")}>{tab.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
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
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2" style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}>
      <p className="truncate font-mono text-[8px] uppercase tracking-widest text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-[12px] font-semibold leading-4",
          tone === "green" ? "text-emerald-300" : tone === "amber" ? "text-amber-200" : "text-slate-100",
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function AgentCreationGate({
  agentName,
  companies,
  creating,
  selectedCompany,
  selectedCompanyId,
  showForm,
  onAgentNameChange,
  onCancel,
  onCreate,
  onSelectCompany,
  onStart,
  variant,
}: {
  agentName: string;
  companies: ClientCompany[];
  creating: boolean;
  selectedCompany: ClientCompany | null;
  selectedCompanyId: string;
  showForm: boolean;
  onAgentNameChange: (value: string) => void;
  onCancel: () => void;
  onCreate: () => void;
  onSelectCompany: (value: string) => void;
  onStart: () => void;
  variant: WhatsappConsoleVariant;
}) {
  return (
    <Panel
      title="Criar agente WhatsApp"
      eyebrow={variant.agentGateEyebrow}
      action={<NeonBadge tone="cyan">novo fluxo</NeonBadge>}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.7fr)]">
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
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
              <ActionButton icon={Plus} label="Criar agente" onClick={onStart} />
            </div>
          ) : null}
        </div>

        {showForm ? (
          <div
            className="rounded-xl p-5"
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
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest text-slate-500">Nome do agente</span>
                <input
                  className="h-11 w-full rounded-lg border px-3 text-[13px] outline-none"
                  placeholder="Ex: Agente comercial"
                  value={agentName}
                  onChange={(event) => onAgentNameChange(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <SecondaryAction icon={RefreshCcw} label="Cancelar" disabled={creating} onClick={onCancel} />
              <ActionButton icon={Wand2} label="Salvar agente" disabled={creating || !selectedCompanyId} loading={creating} onClick={onCreate} />
            </div>
          </div>
        ) : (
          <div
            className="grid min-h-[220px] place-items-center rounded-xl p-5 text-center"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
          >
            <div className="max-w-xs">
              <Building2 className="mx-auto h-7 w-7 text-cyan-300" />
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
  company,
  entityLabel = "Empresa",
}: {
  agent: NonNullable<WhatsappState["agent"]>;
  company: ClientCompany | null;
  entityLabel?: string;
}) {
  const companyStatus = company ? `${company.planCode} / ${company.status}` : "Plano nao informado";

  return (
    <div
      className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2 xl:grid-cols-4"
      style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
    >
      <InfoTile label="Agente" value={agent.name} />
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
  const dimension = size === "xl" ? "h-20 w-20" : size === "lg" ? "h-14 w-14" : "h-10 w-10";

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-2xl border bg-cyan-400/10 text-cyan-200", dimension)}
      style={{ borderColor: "var(--ch-border)" }}
      title={imageUrl ? "Foto do WhatsApp conectado" : "Foto aparece quando o WhatsApp estiver conectado"}
    >
      {imageUrl ? (
        <Image
          alt={alt}
          className="object-cover"
          fill
          sizes={size === "xl" ? "80px" : size === "lg" ? "56px" : "40px"}
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
    <span
      aria-label={text}
      className="group/help relative inline-flex shrink-0 items-center align-middle"
      title={text}
    >
      <CircleHelp className="h-3.5 w-3.5 text-current opacity-70 transition group-hover/help:opacity-100" />
      <span
        className="pointer-events-none absolute right-0 top-5 z-50 hidden w-64 max-w-[calc(100vw-3rem)] rounded-lg border px-3 py-2 text-left font-sans text-[11px] normal-case leading-5 tracking-normal text-slate-200 shadow-2xl group-hover/help:block"
        style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}
      >
        {text}
      </span>
    </span>
  );
}

function PromptBox({
  label,
  description,
  value,
  helper,
  maxLength,
  onChange,
  onSelectionChange,
  textareaRef,
}: {
  label: string;
  description?: string;
  value: string;
  helper: string;
  maxLength: number;
  onChange: (value: string) => void;
  onSelectionChange: (start: number, end: number) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  function recordSelection(textarea: HTMLTextAreaElement) {
    onSelectionChange(textarea.selectionStart, textarea.selectionEnd);
  }

  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
      <textarea
        ref={textareaRef}
        value={value}
        maxLength={maxLength}
        onChange={(event) => {
          onChange(event.target.value);
          recordSelection(event.currentTarget);
        }}
        onKeyUp={(event) => recordSelection(event.currentTarget)}
        onMouseUp={(event) => recordSelection(event.currentTarget)}
        onSelect={(event) => recordSelection(event.currentTarget)}
        className="min-h-[320px] w-full resize-y rounded-xl border px-4 py-3 font-mono text-[12px] leading-5 outline-none"
        placeholder="Defina o comportamento do agente."
      />
      <span className="mt-2 block font-mono text-[10px] uppercase tracking-widest text-slate-500">{helper}</span>
    </label>
  );
}

function PromptToolsPanel({
  generatingPrompt,
  linkButtons,
  linkButtonLabel,
  linkButtonUrl,
  creatingLinkButton,
  deletingLinkButtonId,
  notes,
  productUrl,
  onCopyLinkButtonTag,
  onCreateLinkButton,
  onDeleteLinkButton,
  onGenerate,
  onInsertTag,
  onLinkButtonLabelChange,
  onLinkButtonUrlChange,
  onNotesChange,
  onProductUrlChange,
  promptTags,
  entitySingular,
}: {
  generatingPrompt: boolean;
  linkButtons: TrackedLinkButton[];
  linkButtonLabel: string;
  linkButtonUrl: string;
  creatingLinkButton: boolean;
  deletingLinkButtonId: string | null;
  notes: string;
  productUrl: string;
  onCopyLinkButtonTag: (link: TrackedLinkButton) => void;
  onCreateLinkButton: () => void;
  onDeleteLinkButton: (link: TrackedLinkButton) => void;
  onGenerate: () => void;
  onInsertTag: (token: string) => void;
  onLinkButtonLabelChange: (value: string) => void;
  onLinkButtonUrlChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onProductUrlChange: (value: string) => void;
  promptTags: Array<{ token: string; label: string; description: string }>;
  entitySingular: string;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.62fr)]">
      <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            Tags do prompt
            <InfoHint text={`Clique para inserir variaveis e links rastreados do ${entitySingular} no ponto atual do cursor no prompt.`} />
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {promptTags.map((tag) => (
            <button
              key={tag.token}
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/10"
              style={{ borderColor: "var(--ch-border)" }}
              title={tag.description}
              onClick={() => onInsertTag(tag.token)}
            >
              <span className="font-mono text-[10px] text-cyan-300">{tag.token}</span>
              <span className="text-slate-400">{tag.label}</span>
            </button>
          ))}
          {linkButtons.map((link) => (
            <div
              key={link.id}
              className="inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1.5"
              style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface)" }}
            >
              <button
                type="button"
                className="inline-flex min-h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-left text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/10"
                title={`${link.label} / ${link.clicks.toLocaleString("pt-BR")} cliques / ${link.url}`}
                onClick={() => onInsertTag(link.tag)}
              >
                <span className="max-w-[180px] truncate font-mono text-[10px] text-cyan-300">{link.tag}</span>
                <span className="max-w-[92px] truncate text-slate-400">{link.label}</span>
              </button>
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-md text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-45"
                title="Copiar tag"
                aria-label={`Copiar tag ${link.tag}`}
                onClick={() => onCopyLinkButtonTag(link)}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-md text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-45"
                title="Excluir link"
                aria-label={`Excluir link ${link.label}`}
                disabled={deletingLinkButtonId === link.id}
                onClick={() => onDeleteLinkButton(link)}
              >
                {deletingLinkButtonId === link.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
              Link do produto
              <InfoHint text="A IA le a pagina publica informada e usa os detalhes para montar um prompt inicial." />
            </span>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
              <input
                value={productUrl}
                onChange={(event) => onProductUrlChange(event.target.value)}
                className="h-11 w-full rounded-lg border bg-transparent pl-10 pr-3 text-[12px] outline-none"
                placeholder="https://site.com/produto"
                style={{ borderColor: "var(--ch-border)" }}
              />
            </div>
          </label>
          <ActionButton
            icon={Wand2}
            label="Criar prompt com IA"
            description="Gera um prompt inicial usando o link e as notas informadas."
            disabled={!productUrl.trim() && !notes.trim()}
            loading={generatingPrompt}
            onClick={onGenerate}
          />
        </div>
        <textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value.slice(0, 1200))}
          className="mt-3 min-h-20 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
          placeholder="Notas do produto, regras de atendimento, publico ou detalhes importantes."
          style={{ borderColor: "var(--ch-border)" }}
        />
      </div>

      <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            Criar botao de link
            <InfoHint text="Salva um link rastreado e cria uma tag para inserir no prompt junto com as tags padrao." />
          </p>
        </div>

        <div className="mt-3 grid gap-3">
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
              Nome do botao
              <InfoHint text="Nome curto que o usuario entende, como Roupas infantil, Catalogo ou Oferta do dia." />
            </span>
            <input
              value={linkButtonLabel}
              onChange={(event) => onLinkButtonLabelChange(event.target.value.slice(0, 48))}
              className="h-11 w-full rounded-lg border bg-transparent px-3 text-[12px] outline-none"
              placeholder="Roupas infantil"
              style={{ borderColor: "var(--ch-border)" }}
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
              URL de destino
              <InfoHint text="O lead recebe um link rastreado. O destino real recebe UTM para separar cliques do agente WhatsApp." />
            </span>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
              <input
                value={linkButtonUrl}
                onChange={(event) => onLinkButtonUrlChange(event.target.value.slice(0, 500))}
                className="h-11 w-full rounded-lg border bg-transparent pl-10 pr-3 text-[12px] outline-none"
                placeholder="https://site.com/produto"
                style={{ borderColor: "var(--ch-border)" }}
              />
            </div>
          </label>
          <ActionButton
            icon={Plus}
            label="Criar link"
            description="Salva o link rastreado e cria uma tag para inserir no prompt."
            disabled={!linkButtonLabel.trim() || !linkButtonUrl.trim()}
            loading={creatingLinkButton}
            onClick={onCreateLinkButton}
          />
        </div>
      </div>
    </div>
  );
}

function KnowledgeFilesPanel({
  files,
  knowledgeUploading,
  onUploadFile,
  entitySingular,
}: {
  files: KnowledgeFile[];
  knowledgeUploading: boolean;
  onUploadFile: (file: File | null) => void;
  entitySingular: string;
}) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
          Arquivos do {entitySingular}
          <InfoHint text="Arquivos adicionam contexto ao agente sem deixar o prompt grande demais." />
        </p>
        <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/15">
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
    <div className="grid min-h-[430px] place-items-center rounded-xl border p-6 text-center" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
          <Bot className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-[16px] font-semibold" style={{ color: "var(--ch-text)" }}>Nenhum agente cadastrado</h2>
        <p className="mt-2 text-[13px] leading-6 text-slate-500">
          Crie um agente e escolha o atendimento que ele vai assumir.
        </p>
        <Link
          className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200"
          href="/dashboard/agentes"
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
      style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ch-text)" }}>
          {title}
          {description ? <InfoHint text={description} /> : null}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 group-open:hidden">abrir</span>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-cyan-300 group-open:inline">fechar</span>
      </summary>
      <div className="border-t px-4 py-4" style={{ borderColor: "var(--ch-border)" }}>
        {children}
      </div>
    </details>
  );
}

function ToggleTile({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left transition hover:border-cyan-300/35"
      style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", checked ? "text-cyan-300" : "text-slate-500")} />
        <span className="min-w-0 text-[12px] font-semibold leading-4" style={{ color: "var(--ch-text)" }}>{label}</span>
        {description ? <InfoHint text={description} /> : null}
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-emerald-400" : "bg-slate-700")}>
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
    <div className="grid gap-2 md:grid-cols-3">
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-16 rounded-lg border px-3 py-2 text-left transition",
              active ? "border-cyan-300/50 bg-cyan-400/10" : "border-slate-700/70 bg-slate-950/20 hover:border-cyan-300/35",
            )}
          >
            <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
              {option.label}
              {option.help ? <InfoHint text={option.help} /> : null}
            </span>
            <span className="mt-1 block text-[11px] text-slate-500">{option.description}</span>
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
  const canClone = Boolean(companyId && cloneName.trim() && cloneFiles.length > 0 && cloneConsent && !cloneSaving);
  const visibleVoices = useMemo(() => {
    const search = normalizeVoiceSearch(voiceSearch);

    if (!search) {
      return voices;
    }

    return voices.filter((voice) => {
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
  }, [voiceSearch, voices]);

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
        <NeonBadge tone={behavior.responseMode === "audio" ? "green" : "amber"}>
          {behavior.responseMode === "audio" ? "audio ativo" : "texto ativo"}
        </NeonBadge>
      </div>

      {selectedVoice?.source === "customer" ? (
        <div className={cn(
          "mt-3 rounded-lg border px-3 py-2 text-[12px] leading-5",
          selectedVoice.status === "verification_required"
            ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
            : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
        )}>
          {selectedVoice.status === "verification_required"
            ? `Sua voz "${selectedVoice.name}" foi clonada mas esta pendente de verificacao. Enquanto isso, o agente usara a voz padrao.`
            : `Sua voz "${selectedVoice.name}" esta clonada e ativa. O agente vai usar esta voz nas respostas em audio.`}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[12px] leading-5 text-amber-100">
          {errorMessage}
        </div>
      ) : null}

      {cloneEnabled ? (
      <div className="mt-3 rounded-lg border" style={{ borderColor: "var(--ch-border)" }}>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
          onClick={() => setCloneOpen((current) => !current)}
        >
          <span className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-cyan-300" />
            <span>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>
                Clonar minha voz
                <InfoHint text="Cria uma voz propria usando audios enviados pelo usuario com consentimento." />
              </span>
              <span className="block text-[11px] text-slate-500">Clonagem de voz com consentimento do usuario.</span>
            </span>
          </span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-cyan-200">{cloneOpen ? "fechar" : "abrir"}</span>
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
                  className="block w-full rounded-lg border px-3 py-2 text-[12px] file:mr-3 file:rounded-md file:border-0 file:bg-cyan-300/15 file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-cyan-100"
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
                    <span className="min-w-0 truncate text-slate-300">{file.name}</span>
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
              <div className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-[12px] leading-5 text-rose-100">
                {cloneError}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canClone}
                onClick={submitVoiceClone}
              >
                {cloneSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar voz
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400"
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
                    active ? "bg-cyan-400/10" : "bg-slate-950/20 hover:bg-cyan-400/5",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Volume2 className={cn("h-3.5 w-3.5 shrink-0", active ? "text-cyan-300" : "text-slate-500")} />
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
                          ? "bg-amber-300/15 text-amber-200"
                          : "bg-emerald-300/15 text-emerald-200",
                      )}>
                        {voice.status === "verification_required" ? "pendente" : "pronta"}
                      </span>
                    ) : null}
                    <span className={cn("rounded-md px-2 py-1 font-mono text-[8px] uppercase tracking-widest", active ? "bg-cyan-300/15 text-cyan-200" : "bg-slate-800/80 text-slate-400")}>
                      {formatVoiceSource(voice)}
                    </span>
                    {(voice.source === "customer" || (voice.category === "cloned" && !voice.isDefault)) ? (
                      confirmDeleteId === voice.voiceId ? (
                        <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="rounded-md bg-rose-500/20 px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-rose-300 hover:bg-rose-500/30 disabled:opacity-50"
                            disabled={deletingVoiceId === voice.voiceId}
                            onClick={(event) => { event.stopPropagation(); deleteVoice(voice.voiceId); }}
                          >
                            {deletingVoiceId === voice.voiceId ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "sim"}
                          </button>
                          <button
                            type="button"
                            className="rounded-md bg-slate-800/80 px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-slate-400 hover:bg-slate-700/80"
                            onClick={(event) => { event.stopPropagation(); setConfirmDeleteId(null); }}
                          >
                            nao
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="rounded-md p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
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
            <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[12px] leading-5 text-amber-100">
              Nenhuma voz encontrada para esta busca.
            </div>
          ) : null}

          {selectedVoice?.previewUrl ? (
            <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)" }}>
              <audio className="h-9 w-full" controls preload="none" src={selectedVoice.previewUrl} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[12px] leading-5 text-amber-100">
          {errorMessage ?? "Nenhuma voz disponivel."}
        </div>
      )}
    </div>
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

  return (
    <div className="rounded-lg border px-2 py-2" style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold leading-4" style={{ color: "var(--ch-text)" }}>
        {label}
        {description ? <InfoHint text={description} /> : null}
      </span>
      <div className="mt-2 grid grid-cols-[28px_1fr_28px] items-center gap-1">
        <button type="button" className="h-7 rounded-md border text-slate-300" onClick={() => nextValue(-1)}>-</button>
        <input
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || min)}
          className="h-7 rounded-md border bg-transparent px-2 text-center font-mono text-[12px] outline-none"
          type="number"
          min={min}
          max={max}
        />
        <button type="button" className="h-7 rounded-md border text-slate-300" onClick={() => nextValue(1)}>+</button>
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
        defaultOpen
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
                  <span className="mb-1 block font-mono text-[8px] uppercase tracking-widest text-cyan-300">Pergunta {index + 1} · Rotulo</span>
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
                      className="grid place-items-center border-r text-slate-300 transition hover:bg-white/5"
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
                      className="grid place-items-center border-l text-slate-300 transition hover:bg-white/5"
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
                    question.required ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-slate-700/70 bg-slate-950/20 text-slate-400",
                  )}
                  onClick={() => onQuestionChange(question.id, { required: !question.required })}
                  title="Marca se esta pergunta e essencial para qualificar o lead."
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", question.required ? "text-cyan-300" : "text-slate-500")} />
                    <span className="truncate text-[11px] font-semibold">Obrigatoria</span>
                  </span>
                  <span className={cn("relative h-4 w-7 shrink-0 rounded-full transition", question.required ? "bg-emerald-400" : "bg-slate-700")}>
                    <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition", question.required ? "left-3.5" : "left-0.5")} />
                  </span>
                </button>
                <button
                  type="button"
                  className="grid h-9 w-full place-items-center rounded-md border border-rose-400/25 bg-rose-400/10 text-rose-200 transition hover:bg-rose-400/15 xl:w-9"
                  onClick={() => onRemoveQuestion(question.id)}
                  title="Excluir pergunta"
                  aria-label={`Excluir pergunta ${index + 1}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <details className="group mt-1.5">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[8px] uppercase tracking-widest text-slate-500 transition hover:text-cyan-300">
                  <span>Campo interno</span>
                  <span className="rounded-full border border-slate-700/70 px-1.5 py-0.5 text-[8px] normal-case tracking-normal text-slate-400">{question.crmField || "sem campo"}</span>
                  <span className="group-open:hidden">editar</span>
                  <span className="hidden text-cyan-300 group-open:inline">fechar</span>
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
            className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-400/15"
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
  const activeScenarios = [
    behavior.detectHumanRequest,
    behavior.detectRescheduleCancel,
    behavior.detectPropertyCapture,
    behavior.detectLocation,
    behavior.detectOptOut,
    behavior.analyzeLinks,
    behavior.quotedReplyContext,
    behavior.leadFileStorage,
  ].filter(Boolean).length;

  const activeMedia = [behavior.audioTranscription, behavior.mediaImage, behavior.mediaDocument, behavior.mediaVideo].filter(Boolean).length;

  const activeHuman = [
    behavior.humanizedLanguage,
    behavior.emojiReactions,
    behavior.timingJitter,
    behavior.composingPause,
    behavior.readReceiptDelay,
    behavior.spontaneousAudio,
    behavior.intentionalTypos,
    behavior.circadianTiming,
    behavior.naturalAudioFillers,
    behavior.sendStickers,
    behavior.proactiveMedia,
    behavior.agentLearning,
    behavior.identityGuard,
    behavior.leadMemory,
    behavior.emotionSensing,
    behavior.conversationChoreography,
    behavior.confidenceHumility,
  ].filter(Boolean).length;

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Resumo</p>
      <div className="mt-4 space-y-3">
        <PromptCheck label="Agente ativo" active={behavior.agentEnabled} />
        <PromptCheck label={`${activeScenarios}/8 cenarios ativos`} active={activeScenarios >= 4} />
        <PromptCheck label={`${activeMedia}/4 midias ativas`} active={activeMedia >= 2} />
        <PromptCheck label={`${activeHuman}/17 simulacao humana`} active={activeHuman >= 8} />
        <PromptCheck label="Intervencao humana" active={behavior.humanIntervention} />
        <PromptCheck label="Grupos WhatsApp" active={behavior.allowGroupChats} />
        <PromptCheck label="Temporizacao inteligente" active={behavior.smartTiming} />
      </div>
      <div className="mt-4 grid gap-2">
        <InfoTile label="Conversa" value={formatResponseMode(behavior.responseMode)} />
        <InfoTile label="Rapport" value={formatRapportMode(behavior.adaptiveRapportMode)} />
        <InfoTile label="Alteracoes" value={promptChanged || behaviorChanged ? "Pendentes" : "Salvo"} />
      </div>
    </div>
  );
}

function WhatsappChannelOperationsPanel({
  behavior,
  channelAction,
  channelOps,
  campaignNumbers,
  campaignText,
  campaignTitle,
  channelScheduledFor,
  newsletterJid,
  newsletterText,
  statusMaxRecipients,
  statusText,
  onCampaignNumbersChange,
  onCampaignTextChange,
  onCampaignTitleChange,
  onChannelScheduledForChange,
  onNewsletterJidChange,
  onNewsletterTextChange,
  onRefresh,
  onRunAction,
  onStatusMaxRecipientsChange,
  onStatusTextChange,
}: {
  behavior: WhatsappBehaviorConfig;
  channelAction: string | null;
  channelOps: WhatsappChannelOperationsState | null;
  campaignNumbers: string;
  campaignText: string;
  campaignTitle: string;
  channelScheduledFor: string;
  newsletterJid: string;
  newsletterText: string;
  statusMaxRecipients: number;
  statusText: string;
  onCampaignNumbersChange: (value: string) => void;
  onCampaignTextChange: (value: string) => void;
  onCampaignTitleChange: (value: string) => void;
  onChannelScheduledForChange: (value: string) => void;
  onNewsletterJidChange: (value: string) => void;
  onNewsletterTextChange: (value: string) => void;
  onRefresh: () => void;
  onRunAction: (action: string, payload?: Record<string, unknown>) => void;
  onStatusMaxRecipientsChange: (value: number) => void;
  onStatusTextChange: (value: string) => void;
}) {
  const scheduledFor = localDatetimeToIso(channelScheduledFor);
  const statusEnabled = behavior.statusBroadcasts;
  const campaignEnabled = behavior.campaignBroadcasts;
  const newsletterEnabled = behavior.newsletterBroadcasts;
  const statusReady = statusEnabled && statusText.trim().length > 0;
  const campaignReady = campaignEnabled && campaignText.trim().length > 0 && campaignNumbers.trim().length > 0;
  const newsletterReady = newsletterEnabled && newsletterText.trim().length > 0 && newsletterJid.trim().length > 0;

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-4">
        <div className="grid gap-3 rounded-xl border p-3 md:grid-cols-2 xl:grid-cols-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
          <InfoTile label="Grupos" value={behavior.allowGroupChats ? formatGroupReplyMode(behavior.groupReplyMode) : "Pausado"} />
          <InfoTile label="Status" value={statusEnabled ? "Liberado" : "Bloqueado"} />
          <InfoTile label="Canais" value={newsletterEnabled ? "Liberado" : "Bloqueado"} />
          <InfoTile label="Campanhas" value={campaignEnabled ? `${behavior.whatsappCampaignBatchSize} por lote` : "Bloqueado"} />
        </div>

        <div className="flex flex-wrap gap-2">
          <SecondaryAction
            icon={RefreshCcw}
            label="Atualizar painel"
            description="Recarrega historico local e configuracao operacional."
            loading={channelAction === "load_channels"}
            onClick={onRefresh}
          />
          <SecondaryAction
            icon={MessageCircle}
            label="Buscar grupos"
            description="Consulta os grupos visiveis para esta instancia na Uazapi."
            loading={channelAction === "refresh_groups"}
            onClick={() => onRunAction("refresh_groups")}
          />
          <SecondaryAction
            icon={FileText}
            label="Buscar canais"
            description="Consulta canais/newsletters ligados ao numero."
            loading={channelAction === "refresh_newsletters"}
            onClick={() => onRunAction("refresh_newsletters")}
          />
          <SecondaryAction
            icon={ShieldCheck}
            label="Limites"
            description="Consulta limites de mensagens do WhatsApp pela Uazapi."
            loading={channelAction === "message_limits"}
            onClick={() => onRunAction("message_limits")}
          />
          <SecondaryAction
            icon={Forward}
            label="Pastas"
            description="Consulta pastas do sender/campanhas da Uazapi."
            loading={channelAction === "campaign_folders"}
            onClick={() => onRunAction("campaign_folders")}
          />
        </div>

        <label className="block rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
          <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            Agendar para
            <InfoHint text="Opcional. Em branco, o envio entra na fila agora. Com data e hora, o Inngest processa quando chegar o horario." />
          </span>
          <input
            className="h-10 w-full rounded-lg border px-3 font-mono text-[12px] outline-none"
            type="datetime-local"
            value={channelScheduledFor}
            onChange={(event) => onChannelScheduledForChange(event.target.value)}
          />
        </label>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
              Status WhatsApp
              <InfoHint text="Publica texto no Status/Stories da instancia quando o controle Status WhatsApp estiver ligado." />
            </p>
            <textarea
              className="mt-3 min-h-28 w-full resize-y rounded-lg border px-3 py-2 text-[12px] leading-5 outline-none"
              value={statusText}
              onChange={(event) => onStatusTextChange(event.target.value.slice(0, 700))}
              placeholder="Texto curto para o status."
            />
            <div className="mt-3">
              <NumberField
                label="Destinatarios"
                description="Maximo de contatos incluidos no status."
                value={statusMaxRecipients}
                min={1}
                max={behavior.whatsappMaxStatusRecipients}
                onChange={onStatusMaxRecipientsChange}
              />
            </div>
            <div className="mt-3">
              <ActionButton
                icon={Globe2}
                label="Publicar status"
                description="Agenda o status para ser processado pelo Inngest."
                disabled={!statusReady}
                loading={channelAction === "send_status"}
                onClick={() => onRunAction("send_status", {
                  text: statusText,
                  maxRecipients: statusMaxRecipients,
                  scheduledFor,
                })}
              />
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
              Campanha simples
              <InfoHint text="Cria um disparo simples via Uazapi Sender. Use uma linha, virgula ou ponto e virgula por numero." />
            </p>
            <input
              className="mt-3 h-10 w-full rounded-lg border px-3 text-[12px] outline-none"
              value={campaignTitle}
              onChange={(event) => onCampaignTitleChange(event.target.value.slice(0, 80))}
              placeholder="Nome da campanha"
            />
            <textarea
              className="mt-3 min-h-24 w-full resize-y rounded-lg border px-3 py-2 text-[12px] leading-5 outline-none"
              value={campaignNumbers}
              onChange={(event) => onCampaignNumbersChange(event.target.value.slice(0, 5000))}
              placeholder="5599999999999&#10;5588888888888"
            />
            <textarea
              className="mt-3 min-h-28 w-full resize-y rounded-lg border px-3 py-2 text-[12px] leading-5 outline-none"
              value={campaignText}
              onChange={(event) => onCampaignTextChange(event.target.value.slice(0, 1200))}
              placeholder="Mensagem da campanha."
            />
            <div className="mt-3">
              <ActionButton
                icon={Forward}
                label="Criar campanha"
                description="Agenda a campanha no Inngest e envia para o Sender quando processada."
                disabled={!campaignReady}
                loading={channelAction === "send_campaign"}
                onClick={() => onRunAction("send_campaign", {
                  title: campaignTitle,
                  numbers: campaignNumbers,
                  text: campaignText,
                  scheduledFor,
                })}
              />
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
              Canal / newsletter
              <InfoHint text="Posta texto em um canal/newsletter quando a instancia e a Uazapi permitirem esse recurso." />
            </p>
            <input
              className="mt-3 h-10 w-full rounded-lg border px-3 font-mono text-[12px] outline-none"
              value={newsletterJid}
              onChange={(event) => onNewsletterJidChange(event.target.value.slice(0, 120))}
              placeholder="123456789@newsletter"
            />
            <textarea
              className="mt-3 min-h-40 w-full resize-y rounded-lg border px-3 py-2 text-[12px] leading-5 outline-none"
              value={newsletterText}
              onChange={(event) => onNewsletterTextChange(event.target.value.slice(0, 1200))}
              placeholder="Texto para publicar no canal."
            />
            <div className="mt-3">
              <ActionButton
                icon={FileText}
                label="Postar canal"
                description="Agenda o post do canal para processamento via Inngest."
                disabled={!newsletterReady}
                loading={channelAction === "post_newsletter"}
                onClick={() => onRunAction("post_newsletter", {
                  jid: newsletterJid,
                  text: newsletterText,
                  scheduledFor,
                })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Historico multicanal</p>
        <div className="mt-4 grid gap-2">
          {channelOps?.history.length ? (
            channelOps.history.map((item) => (
              <div key={item.id} className="rounded-lg border px-3 py-2" style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-[12px] font-semibold" style={{ color: "var(--ch-text)" }}>{item.title}</p>
                  <span className="shrink-0 rounded-md bg-slate-800/80 px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-slate-300">{item.status}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{item.summary ?? formatChannelOperation(item.operation)}</p>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-slate-500">
                  {formatChannelOperation(item.operation)} / {formatDate(item.scheduledFor ?? item.createdAt)}
                </p>
                {item.error ? (
                  <p className="mt-2 rounded-md border border-rose-400/20 bg-rose-400/10 px-2 py-1 text-[11px] leading-4 text-rose-100">{item.error}</p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-lg border px-3 py-6 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
              Nenhum envio multicanal registrado ainda.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PromptCheck({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className={cn("h-4 w-4", active ? "text-emerald-300" : "text-slate-500")} />
      <span className={cn("text-[12px]", active ? "text-slate-200" : "text-slate-500")}>{label}</span>
    </div>
  );
}

function formatResponseMode(value: WhatsappResponseMode) {
  if (value === "audio") return "Sempre audio";
  if (value === "mirror") return "Espelho";
  return "Sempre texto";
}

function formatVoiceSource(voice: AudioVoiceOption) {
  if (voice.isDefault) return "padrao";
  if (voice.source === "customer") return "voz propria";
  if (voice.source === "library") return "biblioteca";
  if (voice.category) return voice.category;
  return "biblioteca";
}

function formatVoiceDetails(voice: AudioVoiceOption) {
  return [voice.category, voice.language, voice.accent, voice.gender, voice.useCase].filter(Boolean).join(" / ") || "voz padrao";
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

function formatGroupReplyMode(value: WhatsappGroupReplyMode) {
  if (value === "mentions") return "So mencoes";
  if (value === "admins") return "So admins";
  return "Todos";
}

function formatChannelOperation(value: string) {
  if (value === "status") return "Status";
  if (value === "campaign_simple") return "Campanha";
  if (value === "newsletter_text") return "Canal";
  return value || "WhatsApp";
}

function localDatetimeToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function CompactConnectionCard({
  instance,
  qrCode,
  running,
  enabled,
  disabledReason,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  instance: WhatsappState["instance"];
  qrCode: string | null;
  running: string | null;
  enabled: boolean;
  disabledReason?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
}) {
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const prevQrRef = useRef<string | null>(null);
  const status = instance?.status ?? "draft";
  const meta = getStatusMeta(status);
  const Icon = meta.icon;
  const profileImageUrl = instance?.profileImageUrl ?? null;
  const whatsappLabel = instance?.displayName ?? formatPhone(instance?.phoneNumber);
  const visibleQrCode = status === "connected" ? null : qrCode;

  useEffect(() => {
    if (visibleQrCode && visibleQrCode !== prevQrRef.current) {
      setQrModalOpen(true);
    }
    prevQrRef.current = visibleQrCode;
  }, [visibleQrCode]);

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
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
        style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
      >
        {!enabled ? (
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-200">
              <PlugZap className="h-6 w-6" />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              Instancia dedicada pendente
            </p>
          </div>
        ) : visibleQrCode ? (
          <button className="group cursor-pointer border-0 bg-transparent p-0" onClick={() => setQrModalOpen(true)} title="Clique para abrir o QR Code" type="button">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <QrCode className="h-6 w-6" />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-emerald-400">
              QR Code gerado — clique para exibir
            </p>
          </button>
        ) : profileImageUrl ? (
          <div className="grid place-items-center">
            <WhatsappAvatar alt={`Foto do WhatsApp ${whatsappLabel}`} fallback={whatsappLabel} imageUrl={profileImageUrl} size="xl" />
          </div>
        ) : (
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-300">
              <QrCode className="h-6 w-6" />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              QR aparece aqui
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
        {!enabled ? disabledReason : visibleQrCode ? "Escaneie o QR Code pelo WhatsApp para concluir." : meta.description}
      </p>

      <div className="mt-4 grid gap-2">
        <ActionButton
          icon={QrCode}
          label={instance ? "Gerar novo QR" : "Gerar QR"}
          description="Abre um QR Code para conectar ou reconectar o numero pelo WhatsApp."
          disabled={!enabled}
          loading={running === "connect"}
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
            icon={Power}
            label="Desconectar"
            description="Encerra a sessao atual do WhatsApp conectado."
            disabled={!enabled || !instance}
            loading={running === "disconnect"}
            tone="danger"
            onClick={onDisconnect}
          />
        </div>
      </div>

      {qrModalOpen && visibleQrCode && (
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
    </div>
  );
}

function StatusInfoTile({ connected }: { connected: boolean }) {
  return (
    <div className="min-w-0 rounded-lg px-3 py-2" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <p className="font-mono text-[9px] uppercase tracking-wide text-slate-500">Status</p>
      <p
        className={cn(
          "mt-1 inline-flex items-center gap-2 break-words text-[12px] font-semibold leading-4",
          connected ? "text-emerald-300" : "text-rose-300",
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
    <div className="min-w-0 rounded-lg px-3 py-2" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
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
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
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
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50",
        tone === "danger" ? "border-rose-400/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/15" : "border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15",
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
      text: "text-emerald-300",
    };
  }

  if (status === "qr_pending") {
    return {
      icon: QrCode,
      label: "qr pendente",
      title: "Aguardando leitura",
      description: "Finalize a conexao lendo o QR Code pelo WhatsApp.",
      bg: "bg-amber-400/10",
      text: "text-amber-300",
    };
  }

  if (status === "blocked" || status === "error") {
    return {
      icon: Power,
      label: "erro",
      title: "Conexao com erro",
      description: "Tente reconectar o numero ou acione o suporte da plataforma.",
      bg: "bg-rose-400/10",
      text: "text-rose-300",
    };
  }

  return {
    icon: PlugZap,
    label: "nao conectado",
    title: "Nenhum WhatsApp ativo",
    description: "Inicie a conexao para parear o numero.",
    bg: "bg-cyan-400/10",
    text: "text-cyan-300",
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
