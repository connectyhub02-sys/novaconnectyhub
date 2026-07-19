"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  PackageCheck,
  PlugZap,
  Save,
  Send,
  ShieldCheck,
  ShoppingBag,
  Truck,
  WalletCards,
  X,
} from "lucide-react";
import type {
  ClientIntegrationActionLog,
  ClientIntegrationConnection,
  ClientIntegrationCredentialDefinition,
  ClientIntegrationCredentialSnapshot,
  ClientIntegrationHubState,
  ClientIntegrationProvider,
  ClientIntegrationWebhookEndpoint,
  IntegrationCategory,
  IntegrationConnectionStatus,
} from "@/lib/client-os/integrations";
import { cn } from "@/lib/utils";
import { MetaReviewTestButton, type ReviewTestResponse, type ReviewTestResult } from "./meta-review-test-button";
import { NeonBadge, PageHeader, StatusBadge } from "./panel-primitives";

type Notice = {
  tone: "success" | "error" | "warning";
  message: string;
};

type CreatedWebhookResponse = {
  endpoint?: ClientIntegrationWebhookEndpoint;
  secret?: string;
  error?: string;
};

type SavedCredentialsResponse = {
  credentials?: ClientIntegrationCredentialSnapshot[];
  connection?: ClientIntegrationConnection;
  error?: string;
};

type GuidedSelectionDraft = {
  customerId?: string;
  adAccountId?: string;
  pageId?: string;
  instagramBusinessId?: string;
};

type GuidedSelectionResponse = {
  connection?: ClientIntegrationConnection;
  error?: string;
};

type GuidedSelectionOption = {
  id: string;
  label: string;
};

type GuidedSelectionGroup = {
  field: keyof GuidedSelectionDraft;
  label: string;
  optional: boolean;
  options: GuidedSelectionOption[];
  value: string;
};

type MetaReviewSnapshot = {
  ranAt: string | null;
  ok: boolean;
  readiness: NonNullable<ReviewTestResponse["readiness"]> | null;
  results: ReviewTestResult[];
};

type MetaWebhookSimulationScenario =
  | "facebook_comment"
  | "facebook_messenger"
  | "instagram_comment"
  | "instagram_direct";

type MetaWebhookIngestSnapshot = {
  received: number;
  stored: number;
  normalized: number;
  ignored: number;
  failed: number;
  unmapped: number;
};

type MetaWebhookActivationSnapshot = {
  ok: boolean;
  pageId: string;
  requestedFields: string[];
  subscribedFields: string[];
  missingFields: string[];
  endpoint: string;
  httpStatus: number | null;
  detail: string;
  activatedAt: string;
  instagramAppDashboardRequired: boolean;
};

type MetaWebhookSimulationSnapshot = {
  scenario: MetaWebhookSimulationScenario;
  assetId: string;
  simulatedAt: string;
  detail: string;
  ingest: MetaWebhookIngestSnapshot;
};

type MetaWebhookActionResponse = {
  activation?: MetaWebhookActivationSnapshot;
  monitor?: MetaWebhookMonitorSnapshot;
  replay?: MetaWebhookReplaySnapshot;
  simulation?: MetaWebhookSimulationSnapshot;
  error?: string;
};

type MetaSocialLiveChannelId =
  | "facebook_messenger"
  | "instagram_direct"
  | "facebook_comments"
  | "instagram_comments";

type MetaSocialLiveChannelSnapshot = {
  channel: MetaSocialLiveChannelId;
  enabled: boolean;
  status: "disabled" | "ready" | "blocked";
  detail: string;
  requiredPermissions: string[];
  missingPermissions: string[];
  missingAssets: string[];
  warnings: string[];
  activatedAt: string | null;
  activatedBy: string | null;
};

type MetaSocialLiveActivationSnapshot = {
  status: "disabled" | "ready" | "blocked" | "partially_ready";
  appLiveModeConfirmed: boolean;
  updatedAt: string;
  updatedBy: string | null;
  enabledChannels: number;
  readyChannels: number;
  blockedChannels: number;
  channels: Record<MetaSocialLiveChannelId, MetaSocialLiveChannelSnapshot>;
};

type MetaSocialLiveActivationDraft = {
  appLiveModeConfirmed: boolean;
  channels: Record<MetaSocialLiveChannelId, boolean>;
};

type MetaSocialLiveActivationResponse = {
  activation?: MetaSocialLiveActivationSnapshot;
  connection?: ClientIntegrationConnection;
  error?: string;
};

type MetaSocialCanaryDraft = {
  channel: MetaSocialLiveChannelId;
  targetId: string;
  text: string;
  replyMode: "private" | "public";
  occurredAt: string;
};

type MetaSocialCanarySnapshot = {
  runId: string | null;
  status: "sent" | "blocked" | "failed" | "skipped";
  dispatchStatus: string;
  detail: string;
  channel: MetaSocialLiveChannelId;
  channelLabel: string;
  replyMode: "private" | "public";
  targetId: string;
  targetKind: string | null;
  endpoint: string | null;
  httpStatus: number | null;
  providerMessageId: string | null;
  agentName: string;
  ranAt: string;
  audit: Array<{
    at: string;
    type: string;
    status?: string;
    message?: string;
    targetKind?: string;
    providerMessageId?: string;
    httpStatus?: number;
  }>;
};

type MetaSocialCanaryResponse = {
  canary?: MetaSocialCanarySnapshot;
  connection?: ClientIntegrationConnection;
  error?: string;
};

type MetaWebhookMonitorStatus = "received" | "processed" | "ignored" | "failed";
type MetaWebhookMonitorHealth = "idle" | "healthy" | "warning" | "critical";
type MetaWebhookMonitorChannel =
  | "facebook_comments"
  | "facebook_messenger"
  | "instagram_comments"
  | "instagram_direct"
  | "unknown";

type MetaWebhookMonitorSummary = {
  total: number;
  received: number;
  processed: number;
  ignored: number;
  failed: number;
  replayable: number;
  processedRate: number;
  health: MetaWebhookMonitorHealth;
  lastReceivedAt: string | null;
  lastFailedAt: string | null;
};

type MetaWebhookMonitorEvent = {
  id: string;
  eventType: string;
  status: MetaWebhookMonitorStatus;
  channel: MetaWebhookMonitorChannel;
  sourceEventId: string | null;
  assetId: string | null;
  leadIdentity: string | null;
  direction: "inbound" | "outbound" | "system" | "unknown";
  textPreview: string | null;
  errorMessage: string | null;
  receivedAt: string | null;
  processedAt: string | null;
  replayable: boolean;
  origin: "meta" | "simulation";
};

type MetaWebhookMonitorChannelSummary = MetaWebhookMonitorSummary & {
  channel: MetaWebhookMonitorChannel;
};

type MetaWebhookMonitorAgentQueue = {
  total: number;
  queued: number;
  running: number;
  needsApproval: number;
  completed: number;
  failed: number;
  cancelled: number;
  latestAt: string | null;
  runs: Array<{
    id: string;
    status: string;
    channel: MetaWebhookMonitorChannel | null;
    triggerSource: string | null;
    summary: string | null;
    errorMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
};

type MetaWebhookMonitorDiagnostic = {
  id: string;
  label: string;
  status: "ok" | "warning" | "critical";
  detail: string;
};

type MetaWebhookMonitorSnapshot = {
  generatedAt: string;
  integration: {
    id: string | null;
    status: string;
    label: string;
    accountLabel: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
    pageId: string | null;
    instagramBusinessId: string | null;
    activationOk: boolean;
  };
  summary: MetaWebhookMonitorSummary;
  channels: MetaWebhookMonitorChannelSummary[];
  agentQueue: MetaWebhookMonitorAgentQueue;
  diagnostics: MetaWebhookMonitorDiagnostic[];
  events: MetaWebhookMonitorEvent[];
  recentActions: Array<{
    id: string;
    action: string;
    status: "success" | "warning" | "error";
    createdAt: string | null;
  }>;
};

type MetaWebhookReplaySnapshot = {
  ok: boolean;
  eventId: string;
  status: "normalized" | "ignored" | "skipped" | "failed";
  detail: string;
  replayedAt: string;
};

const categoryIcons: Record<IntegrationCategory, LucideIcon> = {
  ads: BarChart3,
  calendar: CalendarDays,
  commerce: ShoppingBag,
  payments: WalletCards,
  shipping: Truck,
  webhooks: PlugZap,
};

const categoryLabels: Record<IntegrationCategory, string> = {
  ads: "Trafego",
  calendar: "Agenda",
  commerce: "E-commerce",
  payments: "Pagamentos",
  shipping: "Envios",
  webhooks: "Webhooks",
};

const metaWebhookSimulationScenarios: { id: MetaWebhookSimulationScenario; label: string }[] = [
  { id: "facebook_comment", label: "Comentario FB" },
  { id: "facebook_messenger", label: "Messenger" },
  { id: "instagram_comment", label: "Comentario IG" },
  { id: "instagram_direct", label: "Direct IG" },
];

const metaSocialLiveChannels: { id: MetaSocialLiveChannelId; label: string; shortLabel: string }[] = [
  { id: "facebook_messenger", label: "Facebook Messenger", shortLabel: "Messenger" },
  { id: "instagram_direct", label: "Instagram Direct", shortLabel: "Direct IG" },
  { id: "facebook_comments", label: "Comentarios Facebook", shortLabel: "Comentarios FB" },
  { id: "instagram_comments", label: "Comentarios Instagram", shortLabel: "Comentarios IG" },
];

export function ClientIntegrationsConsole({ state }: { state: ClientIntegrationHubState }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(state.selectedCompanyId ?? state.companies[0]?.id ?? "");
  const [connections, setConnections] = useState(state.connections);
  const [credentialSnapshots, setCredentialSnapshots] = useState(state.credentialSnapshots);
  const [actionLogs, setActionLogs] = useState(state.actionLogs);
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, string>>({});
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [webhookEndpoints, setWebhookEndpoints] = useState(state.webhookEndpoints);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [connectingMercadoPago, setConnectingMercadoPago] = useState(false);
  const [disconnectingMercadoPago, setDisconnectingMercadoPago] = useState(false);
  const [connectingGuidedProvider, setConnectingGuidedProvider] = useState<string | null>(null);
  const [disconnectingGuidedProvider, setDisconnectingGuidedProvider] = useState<string | null>(null);
  const [savingSelectionProvider, setSavingSelectionProvider] = useState<string | null>(null);
  const [metaWebhookAction, setMetaWebhookAction] = useState<string | null>(null);
  const [savingMetaLiveActivation, setSavingMetaLiveActivation] = useState(false);
  const [runningMetaCanary, setRunningMetaCanary] = useState(false);
  const [metaWebhookMonitor, setMetaWebhookMonitor] = useState<MetaWebhookMonitorSnapshot | null>(null);
  const [loadingMetaWebhookMonitor, setLoadingMetaWebhookMonitor] = useState(false);
  const [guidedSelectionDrafts, setGuidedSelectionDrafts] = useState<Record<string, GuidedSelectionDraft>>({});
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const selectedCompany = state.companies.find((company) => company.id === selectedCompanyId) ?? null;
  const selectedConnections = useMemo(
    () => connections.filter((connection) => connection.companyId === selectedCompanyId),
    [connections, selectedCompanyId],
  );
  const selectedEndpoints = useMemo(
    () => webhookEndpoints.filter((endpoint) => endpoint.companyId === selectedCompanyId),
    [webhookEndpoints, selectedCompanyId],
  );
  const connectionByProvider = useMemo(
    () => new Map(selectedConnections.map((connection) => [connection.providerId, connection])),
    [selectedConnections],
  );
  const credentialDefinitionsByProvider = useMemo(() => {
    const map = new Map<string, ClientIntegrationCredentialDefinition[]>();

    for (const definition of state.credentialDefinitions) {
      map.set(definition.providerId, [...(map.get(definition.providerId) ?? []), definition]);
    }

    return map;
  }, [state.credentialDefinitions]);
  const credentialSnapshotByField = useMemo(() => {
    const map = new Map<string, ClientIntegrationCredentialSnapshot>();

    for (const credential of credentialSnapshots) {
      map.set(credentialKey(credential.companyId, credential.providerId, credential.envName), credential);
    }

    return map;
  }, [credentialSnapshots]);
  const mercadoPagoConnection = connectionByProvider.get("mercado-pago");
  const mercadoPagoConnected = mercadoPagoConnection?.status === "connected";
  const metaConnection = connectionByProvider.get("meta-ads");
  const googleConnection = connectionByProvider.get("google-growth");
  const webhookConnection = connectionByProvider.get("webhook-universal");
  const metaActionLogs = useMemo(
    () => actionLogs.filter((log) => log.companyId === selectedCompanyId && log.providerId === "meta-ads").slice(0, 5),
    [actionLogs, selectedCompanyId],
  );
  const visibleProviders = useMemo(
    () => state.providers.filter((provider) => !isTopGuidedProvider(provider.id)),
    [state.providers],
  );
  const metrics = useMemo(() => {
    const connected = selectedConnections.filter((connection) => connection.status === "connected").length;
    const active = state.providers.filter((provider) => provider.status === "active" || provider.status === "built_in").length;
    const next = state.providers.filter((provider) => provider.status === "next").length;

    return {
      providers: state.providers.length,
      connected,
      active,
      next,
      endpoints: selectedEndpoints.length,
    };
  }, [selectedConnections, selectedEndpoints.length, state.providers]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const integration = params.get("integration");

    if (!payment && !integration) return;

    const reason = params.get("reason");
    const timeoutId = window.setTimeout(() => {
      if (payment === "mercado_pago_connected") {
        setNotice({
          tone: "success",
          message: "Mercado Pago conectado. Agora esta empresa pode receber Pix e cartao no Catalogo de Vendas.",
        });
      }

      if (payment === "mercado_pago_error") {
        setNotice({ tone: "error", message: getMercadoPagoConnectionErrorMessage(reason) });
      }

      if (integration === "meta_connected" || integration === "google_connected") {
        setNotice({
          tone: "success",
          message: integration === "meta_connected"
            ? "Meta conectado. Agora esta empresa pode acompanhar trafego pago e sinais organicos conforme as permissoes aprovadas."
            : "Google conectado. Agora esta empresa pode acompanhar Google Ads e dados organicos conforme as permissoes aprovadas.",
        });
      }

      if (integration === "meta_error" || integration === "google_error") {
        setNotice({ tone: "error", message: getGuidedOAuthErrorMessage(integration, reason) });
      }
    }, 0);

    params.delete("payment");
    params.delete("integration");
    params.delete("reason");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!selectedCompanyId || metaConnection?.status !== "connected") {
      return;
    }

    const controller = new AbortController();

    async function loadSilentMonitor() {
      try {
        const params = new URLSearchParams({ companyId: selectedCompanyId });
        const response = await fetch(`/api/dashboard/integrations/meta/webhooks?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null) as MetaWebhookActionResponse | null;

        if (response.ok && data?.monitor) {
          setMetaWebhookMonitor(data.monitor);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMetaWebhookMonitor(null);
        }
      }
    }

    void loadSilentMonitor();

    return () => controller.abort();
  }, [selectedCompanyId, metaConnection?.status, metaConnection?.lastSyncAt]);

  async function createUniversalWebhook() {
    if (!selectedCompanyId || creatingWebhook) return;

    setCreatingWebhook(true);
    setNotice(null);
    setNewWebhookSecret(null);

    try {
      const response = await fetch("/api/dashboard/integrations/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          label: `Webhook ${selectedCompany?.name ?? "Universal"}`,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as CreatedWebhookResponse;

      if (!response.ok || !data.endpoint || !data.secret) {
        throw new Error(data.error ?? "Nao foi possivel criar o webhook.");
      }

      setWebhookEndpoints((current) => [data.endpoint!, ...current.filter((item) => item.id !== data.endpoint!.id)]);
      setConnections((current) => upsertWebhookConnection(current, data.endpoint!, selectedCompany?.name ?? "Empresa"));
      setNewWebhookSecret(data.secret);
      setNotice({
        tone: "success",
        message: "Webhook Universal criado. Copie o segredo agora; ele nao sera exibido novamente.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro ao criar o Webhook Universal.",
      });
    } finally {
      setCreatingWebhook(false);
    }
  }

  async function saveProviderCredentials(provider: ClientIntegrationProvider) {
    if (!selectedCompanyId || savingProviderId) return;

    const definitions = credentialDefinitionsByProvider.get(provider.id) ?? [];
    const credentials = definitions
      .map((definition) => ({
        envName: definition.envName,
        value: credentialDrafts[credentialKey(selectedCompanyId, provider.id, definition.envName)]?.trim() ?? "",
      }))
      .filter((credential) => credential.value.length > 0);

    if (!credentials.length) {
      setNotice({ tone: "warning", message: "Preencha pelo menos uma credencial antes de salvar." });
      return;
    }

    setSavingProviderId(provider.id);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/integrations/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          providerId: provider.id,
          credentials,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as SavedCredentialsResponse;

      if (!response.ok || !data.credentials?.length || !data.connection) {
        throw new Error(data.error ?? "Nao foi possivel salvar as credenciais.");
      }

      setCredentialSnapshots((current) => {
        const savedKeys = new Set(data.credentials!.map((credential) => credentialKey(credential.companyId, credential.providerId, credential.envName)));
        return [
          ...data.credentials!,
          ...current.filter((credential) => !savedKeys.has(credentialKey(credential.companyId, credential.providerId, credential.envName))),
        ];
      });
      setConnections((current) => [
        data.connection!,
        ...current.filter((connection) => !(connection.companyId === data.connection!.companyId && connection.providerId === data.connection!.providerId)),
      ]);
      setCredentialDrafts((current) => {
        const next = { ...current };
        credentials.forEach((credential) => {
          delete next[credentialKey(selectedCompanyId, provider.id, credential.envName)];
        });
        return next;
      });
      setNotice({
        tone: "success",
        message: `${provider.name} conectado para ${selectedCompany?.name ?? "esta empresa"}.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro ao salvar credenciais.",
      });
    } finally {
      setSavingProviderId(null);
    }
  }

  function handleMercadoPagoConnectClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!selectedCompanyId || connectingMercadoPago) {
      event.preventDefault();
      if (!selectedCompanyId) {
        setNotice({ tone: "warning", message: "Escolha uma empresa antes de conectar o Mercado Pago." });
      }
      return;
    }

    setConnectingMercadoPago(true);
    setNotice({ tone: "warning", message: "Abrindo Mercado Pago em uma nova aba para login e autorizacao..." });
    window.setTimeout(() => setConnectingMercadoPago(false), 1500);
  }

  function handleGuidedOAuthConnectClick(providerId: "meta-ads" | "google-growth", event: MouseEvent<HTMLAnchorElement>) {
    if (!selectedCompanyId || connectingGuidedProvider) {
      event.preventDefault();
      if (!selectedCompanyId) {
        setNotice({ tone: "warning", message: "Escolha uma empresa antes de conectar a integracao." });
      }
      return;
    }

    setConnectingGuidedProvider(providerId);
    setNotice({
      tone: "warning",
      message: providerId === "meta-ads"
        ? "Abrindo Meta para login e autorizacao oficial..."
        : "Abrindo Google para login e autorizacao oficial...",
    });
    window.setTimeout(() => setConnectingGuidedProvider(null), 1500);
  }

  async function disconnectGuidedOAuth(providerId: "meta-ads" | "google-growth") {
    if (!selectedCompanyId || disconnectingGuidedProvider) return;

    setDisconnectingGuidedProvider(providerId);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/integrations/oauth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          providerId,
        }),
      });
      const data = await response.json().catch(() => null) as { connection?: ClientIntegrationConnection; error?: string } | null;

      if (!response.ok || !data?.connection) {
        throw new Error(data?.error ?? "Nao foi possivel desconectar a integracao.");
      }

      setConnections((current) => [
        data.connection!,
        ...current.filter((connection) => !(connection.companyId === selectedCompanyId && connection.providerId === providerId)),
      ]);
      setCredentialSnapshots((current) => current.filter((credential) => !(credential.companyId === selectedCompanyId && credential.providerId === providerId)));
      if (providerId === "meta-ads") {
        setMetaWebhookMonitor(null);
      }
      setNotice({
        tone: "success",
        message: providerId === "meta-ads" ? "Meta desconectado desta empresa." : "Google desconectado desta empresa.",
      });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao desconectar a integracao." });
    } finally {
      setDisconnectingGuidedProvider(null);
    }
  }

  async function saveGuidedSelection(providerId: "meta-ads" | "google-growth", selection: GuidedSelectionDraft) {
    if (!selectedCompanyId || savingSelectionProvider) return;

    setSavingSelectionProvider(providerId);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/integrations/oauth/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          providerId,
          selection,
        }),
      });
      const data = await response.json().catch(() => null) as GuidedSelectionResponse | null;

      if (!response.ok || !data?.connection) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a selecao.");
      }

      setConnections((current) => [
        data.connection!,
        ...current.filter((connection) => !(connection.companyId === selectedCompanyId && connection.providerId === providerId)),
      ]);
      setGuidedSelectionDrafts((current) => {
        const next = { ...current };
        delete next[guidedSelectionKey(selectedCompanyId, providerId)];
        return next;
      });
      setNotice({
        tone: "success",
        message: providerId === "meta-ads" ? "Conta Meta selecionada para os dashboards." : "Conta Google selecionada para os dashboards.",
      });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao salvar selecao." });
    } finally {
      setSavingSelectionProvider(null);
    }
  }

  function handleMetaReviewTestResult(response: ReviewTestResponse) {
    if (!selectedCompanyId) return;

    const ranAt = response.ranAt ?? new Date().toISOString();
    const reviewTest = {
      ran_at: ranAt,
      ok: response.ok === true,
      readiness: response.readiness ?? null,
      results: response.results ?? [],
    };

    setConnections((current) => current.map((connection) => {
      if (connection.companyId !== selectedCompanyId || connection.providerId !== "meta-ads") {
        return connection;
      }

      return {
        ...connection,
        lastError: response.ok ? null : response.summary ?? "Checklist Meta com pendencias.",
        lastSyncAt: ranAt,
        metadata: {
          ...connection.metadata,
          review_test: reviewTest,
        },
      };
    }));

    setActionLogs((current) => [{
      id: `local-meta-review-${Date.now()}`,
      action: "meta.review_test",
      companyId: selectedCompanyId,
      createdAt: ranAt,
      metadata: reviewTest,
      providerId: "meta-ads",
      status: response.ok ? "success" as const : "warning" as const,
    }, ...current].slice(0, 80));
  }

  async function loadMetaWebhookMonitor(input: { silent?: boolean; signal?: AbortSignal } = {}) {
    if (!selectedCompanyId) return;

    if (!input.silent) {
      setLoadingMetaWebhookMonitor(true);
      setNotice(null);
    }

    try {
      const params = new URLSearchParams({ companyId: selectedCompanyId });
      const response = await fetch(`/api/dashboard/integrations/meta/webhooks?${params.toString()}`, {
        method: "GET",
        signal: input.signal,
      });
      const data = await response.json().catch(() => null) as MetaWebhookActionResponse | null;

      if (!response.ok || !data?.monitor) {
        throw new Error(data?.error ?? "Nao foi possivel carregar o monitor Meta.");
      }

      setMetaWebhookMonitor(data.monitor);

      if (!input.silent) {
        setNotice({
          tone: data.monitor.summary.failed > 0 ? "warning" : "success",
          message: `Monitor Meta atualizado: ${data.monitor.summary.total} evento(s) recentes.`,
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      if (!input.silent) {
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Erro ao carregar monitor Meta.",
        });
      }
    } finally {
      if (!input.silent) {
        setLoadingMetaWebhookMonitor(false);
      }
    }
  }

  async function runMetaWebhookAction(action: "subscribe_page" | "simulate", scenario?: MetaWebhookSimulationScenario) {
    if (!selectedCompanyId || metaWebhookAction) return;

    const actionKey = action === "simulate" ? `simulate:${scenario ?? ""}` : action;

    setMetaWebhookAction(actionKey);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/integrations/meta/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          companyId: selectedCompanyId,
          scenario,
        }),
      });
      const data = await response.json().catch(() => null) as MetaWebhookActionResponse | null;

      if (!response.ok || (!data?.activation && !data?.simulation)) {
        throw new Error(data?.error ?? "Nao foi possivel executar a acao Meta.");
      }

      if (data.activation) {
        const activation = data.activation;

        setConnections((current) => current.map((connection) => {
          if (connection.companyId !== selectedCompanyId || connection.providerId !== "meta-ads") {
            return connection;
          }

          return {
            ...connection,
            lastError: activation.ok ? null : activation.detail,
            lastSyncAt: activation.activatedAt,
            metadata: {
              ...connection.metadata,
              webhook_activation: activation,
            },
          };
        }));
        setActionLogs((current) => [{
          id: `local-meta-webhook-subscribe-${Date.now()}`,
          action: "meta.webhook.subscribe",
          companyId: selectedCompanyId,
          createdAt: activation.activatedAt,
          metadata: activation,
          providerId: "meta-ads",
          status: activation.ok ? "success" as const : "warning" as const,
        }, ...current].slice(0, 80));
        setNotice({
          tone: activation.ok ? "success" : "warning",
          message: activation.detail,
        });
        void loadMetaWebhookMonitor({ silent: true });
      }

      if (data.simulation) {
        const simulation = data.simulation;
        const simulationOk = simulation.ingest.normalized > 0 && simulation.ingest.failed === 0;

        setConnections((current) => current.map((connection) => {
          if (connection.companyId !== selectedCompanyId || connection.providerId !== "meta-ads") {
            return connection;
          }

          return {
            ...connection,
            lastError: simulationOk ? null : simulation.detail,
            lastSyncAt: simulation.simulatedAt,
            metadata: {
              ...connection.metadata,
              webhook_simulation: simulation,
            },
          };
        }));
        setActionLogs((current) => [{
          id: `local-meta-webhook-simulate-${Date.now()}`,
          action: "meta.webhook.simulate",
          companyId: selectedCompanyId,
          createdAt: simulation.simulatedAt,
          metadata: simulation,
          providerId: "meta-ads",
          status: simulationOk ? "success" as const : "warning" as const,
        }, ...current].slice(0, 80));
        setNotice({
          tone: simulationOk ? "success" : "warning",
          message: simulation.detail,
        });
        void loadMetaWebhookMonitor({ silent: true });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro ao executar acao Meta.",
      });
    } finally {
      setMetaWebhookAction(null);
    }
  }

  async function replayMetaWebhookEvent(eventId: string) {
    if (!selectedCompanyId || metaWebhookAction) return;

    setMetaWebhookAction(`replay:${eventId}`);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/integrations/meta/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replay_event",
          companyId: selectedCompanyId,
          eventId,
        }),
      });
      const data = await response.json().catch(() => null) as MetaWebhookActionResponse | null;

      if (!response.ok || !data?.replay) {
        throw new Error(data?.error ?? "Nao foi possivel reprocessar o evento Meta.");
      }

      if (data.monitor) {
        setMetaWebhookMonitor(data.monitor);
      }

      setActionLogs((current) => [{
        id: `local-meta-webhook-replay-${Date.now()}`,
        action: "meta.webhook.replay",
        companyId: selectedCompanyId,
        createdAt: data.replay!.replayedAt,
        metadata: data.replay!,
        providerId: "meta-ads",
        status: data.replay!.ok ? "success" as const : data.replay!.status === "failed" ? "error" as const : "warning" as const,
      }, ...current].slice(0, 80));
      setNotice({
        tone: data.replay.ok ? "success" : data.replay.status === "failed" ? "error" : "warning",
        message: data.replay.detail,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro ao reprocessar evento Meta.",
      });
    } finally {
      setMetaWebhookAction(null);
    }
  }

  async function saveMetaLiveDispatchActivation(draft: MetaSocialLiveActivationDraft) {
    if (!selectedCompanyId || savingMetaLiveActivation) return;

    setSavingMetaLiveActivation(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/integrations/meta/live-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appLiveModeConfirmed: draft.appLiveModeConfirmed,
          channels: draft.channels,
          companyId: selectedCompanyId,
        }),
      });
      const data = await response.json().catch(() => null) as MetaSocialLiveActivationResponse | null;

      if (!response.ok || !data?.connection || !data.activation) {
        throw new Error(data?.error ?? "Nao foi possivel salvar a ativacao live Meta.");
      }

      setConnections((current) => [
        data.connection!,
        ...current.filter((connection) => !(connection.companyId === selectedCompanyId && connection.providerId === "meta-ads")),
      ]);
      setActionLogs((current) => [{
        id: `local-meta-live-dispatch-${Date.now()}`,
        action: "meta.social_dispatch.live_activation.updated",
        companyId: selectedCompanyId,
        createdAt: data.activation!.updatedAt,
        metadata: data.activation!,
        providerId: "meta-ads",
        status: data.activation!.blockedChannels > 0 ? "warning" as const : "success" as const,
      }, ...current].slice(0, 80));
      setNotice({
        tone: data.activation.blockedChannels > 0 ? "warning" : "success",
        message: data.activation.blockedChannels > 0
          ? `Ativacao Meta salva com ${data.activation.blockedChannels} canal(is) bloqueado(s).`
          : "Ativacao live Meta salva para os canais selecionados.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro ao salvar ativacao live Meta.",
      });
    } finally {
      setSavingMetaLiveActivation(false);
    }
  }

  async function runMetaSocialCanary(draft: MetaSocialCanaryDraft) {
    if (!selectedCompanyId || runningMetaCanary) {
      throw new Error("Canario Meta ja esta em execucao.");
    }

    setRunningMetaCanary(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/integrations/meta/canary-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          companyId: selectedCompanyId,
        }),
      });
      const data = await response.json().catch(() => null) as MetaSocialCanaryResponse | null;

      if (!response.ok || !data?.canary || !data.connection) {
        throw new Error(data?.error ?? "Nao foi possivel executar o canario Meta.");
      }

      setConnections((current) => [
        data.connection!,
        ...current.filter((connection) => !(connection.companyId === selectedCompanyId && connection.providerId === "meta-ads")),
      ]);
      setActionLogs((current) => [{
        id: `local-meta-canary-${Date.now()}`,
        action: "meta.social_dispatch.canary",
        companyId: selectedCompanyId,
        createdAt: data.canary!.ranAt,
        metadata: data.canary!,
        providerId: "meta-ads",
        status: data.canary!.status === "sent"
          ? "success" as const
          : data.canary!.status === "failed"
            ? "error" as const
            : "warning" as const,
      }, ...current].slice(0, 80));
      setNotice({
        tone: data.canary.status === "sent" ? "success" : data.canary.status === "failed" ? "error" : "warning",
        message: data.canary.detail,
      });

      return data.canary;
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro ao executar canario Meta.",
      });
      throw error;
    } finally {
      setRunningMetaCanary(false);
    }
  }

  async function disconnectMercadoPago() {
    if (!selectedCompanyId || disconnectingMercadoPago) return;

    setDisconnectingMercadoPago(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/sales-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disconnect_mercado_pago",
          companyId: selectedCompanyId,
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Nao foi possivel desconectar Mercado Pago.");
      }

      setConnections((current) => {
        const existing = current.find((connection) => connection.companyId === selectedCompanyId && connection.providerId === "mercado-pago");
        const nextConnection: ClientIntegrationConnection = {
          providerId: "mercado-pago",
          companyId: selectedCompanyId,
          companyName: selectedCompany?.name ?? existing?.companyName ?? "Empresa",
          status: "disabled",
          label: "Desativado",
          detail: "Mercado Pago desconectado desta empresa.",
          accountLabel: null,
          lastSyncAt: new Date().toISOString(),
          lastError: null,
          managementHref: "/dashboard/links",
          metadata: {},
        };

        return [
          nextConnection,
          ...current.filter((connection) => !(connection.companyId === selectedCompanyId && connection.providerId === "mercado-pago")),
        ];
      });
      setNotice({ tone: "success", message: "Mercado Pago desconectado desta empresa." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Erro ao desconectar Mercado Pago." });
    } finally {
      setDisconnectingMercadoPago(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Client OS / Integracoes"
        title="Integracoes"
        description="Conecte contas externas quando elas forem fonte de dados, pagamento, campanha, agenda, frete ou entrada de eventos."
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone={state.schemaReady ? "green" : "amber"}>
              {state.schemaReady ? "modelo ativo" : "SQL pendente"}
            </NeonBadge>
            <NeonBadge tone="cyan">{metrics.providers} provedores</NeonBadge>
          </div>
        }
      />

      {notice ? <NoticeBar notice={notice} /> : null}

      {!state.schemaReady && state.schemaMessage ? (
        <div
          className="mb-4 rounded-2xl px-4 py-3 text-[12px] leading-5 text-amber-100"
          style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.24)" }}
        >
          {state.schemaMessage}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-4">
        <Metric icon={PlugZap} label="Catalogo" value={String(metrics.providers)} detail="integracoes mapeadas" tone="cyan" />
        <Metric icon={CheckCircle2} label="Conectadas" value={String(metrics.connected)} detail={selectedCompany?.name ?? "empresa"} tone="green" />
        <Metric icon={ShieldCheck} label="Ativas" value={String(metrics.active)} detail="prontas ou internas" tone="violet" />
        <Metric icon={Link2} label="Webhooks" value={String(metrics.endpoints)} detail="endpoints universais" tone="amber" />
      </div>

      <div
        className="mb-5 grid gap-3 rounded-2xl p-3 sm:p-4 lg:grid-cols-[minmax(260px,380px)_minmax(0,1fr)]"
        style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
      >
        <label className="block">
          <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Empresa</span>
          <select
            value={selectedCompanyId}
            onChange={(event) => {
              setSelectedCompanyId(event.target.value);
              setNotice(null);
              setNewWebhookSecret(null);
              setMetaWebhookAction(null);
              setMetaWebhookMonitor(null);
              setGuidedSelectionDrafts({});
            }}
            className="h-11 w-full rounded-xl px-3 text-[13px] outline-none"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
          >
            {state.companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>
        <div
          className="rounded-xl px-4 py-3 text-[12px] leading-5 text-slate-400"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
        >
          A Central organiza as conexoes por empresa. Mercado Pago, Meta e Google usam autorizacao guiada oficial; segredos tecnicos ficam somente na ConnectyHub.
        </div>
      </div>

      {state.companies.length > 0 ? (
        <div className="mb-5 grid gap-3 xl:grid-cols-2">
          <MercadoPagoGuidedCard
            accountLabel={mercadoPagoConnection?.accountLabel ?? null}
            connected={mercadoPagoConnected}
            connecting={connectingMercadoPago}
            disconnecting={disconnectingMercadoPago}
            lastError={mercadoPagoConnection?.lastError ?? null}
            selectedCompanyId={selectedCompanyId}
            selectedCompanyName={selectedCompany?.name ?? null}
            onConnect={handleMercadoPagoConnectClick}
            onDisconnect={disconnectMercadoPago}
          />

          <GuidedOAuthCard
            accountLabel={metaConnection?.accountLabel ?? null}
            connected={metaConnection?.status === "connected"}
            connection={metaConnection}
            connecting={connectingGuidedProvider === "meta-ads"}
            disconnecting={disconnectingGuidedProvider === "meta-ads"}
            kind="meta"
            actionLogs={metaActionLogs}
            loadingMetaWebhookMonitor={loadingMetaWebhookMonitor}
            metaWebhookAction={metaWebhookAction}
            metaWebhookMonitor={metaWebhookMonitor}
            runningMetaCanary={runningMetaCanary}
            savingMetaLiveActivation={savingMetaLiveActivation}
            savingSelection={savingSelectionProvider === "meta-ads"}
            selectionDraft={guidedSelectionDrafts[guidedSelectionKey(selectedCompanyId, "meta-ads")] ?? {}}
            selectedCompanyId={selectedCompanyId}
            selectedCompanyName={selectedCompany?.name ?? null}
            onActivateMetaWebhooks={() => runMetaWebhookAction("subscribe_page")}
            onConnect={(event) => handleGuidedOAuthConnectClick("meta-ads", event)}
            onDisconnect={() => disconnectGuidedOAuth("meta-ads")}
            onMetaReviewTestResult={handleMetaReviewTestResult}
            onRefreshMetaWebhookMonitor={() => loadMetaWebhookMonitor()}
            onReplayMetaWebhookEvent={replayMetaWebhookEvent}
            onRunMetaCanary={runMetaSocialCanary}
            onSaveMetaLiveActivation={saveMetaLiveDispatchActivation}
            onSaveSelection={(selection) => saveGuidedSelection("meta-ads", selection)}
            onSelectionChange={(selection) => {
              setGuidedSelectionDrafts((current) => ({
                ...current,
                [guidedSelectionKey(selectedCompanyId, "meta-ads")]: selection,
              }));
            }}
            onSimulateMetaWebhook={(scenario) => runMetaWebhookAction("simulate", scenario)}
          />

          <GuidedOAuthCard
            accountLabel={googleConnection?.accountLabel ?? null}
            connected={googleConnection?.status === "connected"}
            connection={googleConnection}
            connecting={connectingGuidedProvider === "google-growth"}
            disconnecting={disconnectingGuidedProvider === "google-growth"}
            kind="google"
            actionLogs={[]}
            runningMetaCanary={false}
            savingMetaLiveActivation={false}
            savingSelection={savingSelectionProvider === "google-growth"}
            selectionDraft={guidedSelectionDrafts[guidedSelectionKey(selectedCompanyId, "google-growth")] ?? {}}
            selectedCompanyId={selectedCompanyId}
            selectedCompanyName={selectedCompany?.name ?? null}
            onConnect={(event) => handleGuidedOAuthConnectClick("google-growth", event)}
            onDisconnect={() => disconnectGuidedOAuth("google-growth")}
            onMetaReviewTestResult={undefined}
            onRunMetaCanary={undefined}
            onSaveMetaLiveActivation={undefined}
            onSaveSelection={(selection) => saveGuidedSelection("google-growth", selection)}
            onSelectionChange={(selection) => {
              setGuidedSelectionDrafts((current) => ({
                ...current,
                [guidedSelectionKey(selectedCompanyId, "google-growth")]: selection,
              }));
            }}
          />

          <div className="rounded-2xl p-4" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">entrada externa</p>
                <h2 className="mt-1 text-[16px] font-semibold text-slate-100">Webhook Universal</h2>
                <p className="mt-2 text-[12px] leading-5 text-slate-400">
                  Crie uma URL assinada para receber leads e eventos de qualquer sistema que ainda nao tem integracao nativa.
                </p>
              </div>
              <PlugZap className="h-5 w-5 text-cyan-300" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className={cn(
                  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 font-mono text-[10px] font-bold uppercase tracking-wide",
                  state.schemaReady ? "text-cyan-100 hover:bg-cyan-400/10" : "cursor-not-allowed text-amber-200 opacity-70",
                )}
                disabled={!state.schemaReady || creatingWebhook}
                onClick={createUniversalWebhook}
                style={{ borderColor: "var(--ch-border)" }}
                type="button"
              >
                {creatingWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Criar Webhook Universal
              </button>
              <StatusBadge
                status={webhookConnection?.status === "connected" ? "online" : "warning"}
                label={selectedEndpoints.length > 0 ? `${selectedEndpoints.length} endpoint(s)` : "nenhum endpoint"}
              />
            </div>
            {newWebhookSecret || selectedEndpoints.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {newWebhookSecret ? <SecretBox secret={newWebhookSecret} /> : null}
                {selectedEndpoints.map((endpoint) => (
                  <WebhookEndpointCard key={endpoint.id} endpoint={endpoint} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.companies.length === 0 ? (
        <div
          className="rounded-2xl px-4 py-8 text-center text-[13px] text-slate-400"
          style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
        >
          Crie uma empresa em Minha Empresa antes de conectar integracoes.
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            {visibleProviders.map((provider) => (
              <IntegrationCard
                key={provider.id}
                connection={connectionByProvider.get(provider.id)}
                credentialDefinitions={credentialDefinitionsByProvider.get(provider.id) ?? []}
                credentialDrafts={credentialDrafts}
                credentialSnapshotByField={credentialSnapshotByField}
                creatingWebhook={creatingWebhook}
                isSavingCredentials={savingProviderId === provider.id}
                provider={provider}
                schemaReady={state.schemaReady}
                selectedCompanyId={selectedCompanyId}
                onCredentialChange={(envName, value) => {
                  setCredentialDrafts((current) => ({
                    ...current,
                    [credentialKey(selectedCompanyId, provider.id, envName)]: value,
                  }));
                }}
                onCreateWebhook={createUniversalWebhook}
                onSaveCredentials={() => saveProviderCredentials(provider)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationCard({
  provider,
  connection,
  credentialDefinitions,
  credentialDrafts,
  credentialSnapshotByField,
  schemaReady,
  selectedCompanyId,
  creatingWebhook,
  isSavingCredentials,
  onCredentialChange,
  onCreateWebhook,
  onSaveCredentials,
}: {
  provider: ClientIntegrationProvider;
  connection?: ClientIntegrationConnection;
  credentialDefinitions: ClientIntegrationCredentialDefinition[];
  credentialDrafts: Record<string, string>;
  credentialSnapshotByField: Map<string, ClientIntegrationCredentialSnapshot>;
  schemaReady: boolean;
  selectedCompanyId: string;
  creatingWebhook: boolean;
  isSavingCredentials: boolean;
  onCredentialChange: (envName: string, value: string) => void;
  onCreateWebhook: () => void;
  onSaveCredentials: () => void;
}) {
  const Icon = categoryIcons[provider.category];
  const tone = statusTone(connection?.status ?? (provider.status === "active" ? "available" : "planned"));
  const configuredCredentials = credentialDefinitions.filter((definition) =>
    credentialSnapshotByField.has(credentialKey(selectedCompanyId, provider.id, definition.envName)),
  ).length;

  return (
    <article
      className="grid min-h-[280px] gap-3 rounded-2xl p-4"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: "rgba(var(--ch-accent-rgb),0.12)", color: "var(--ch-accent)" }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <NeonBadge tone={categoryTone(provider.category)}>{categoryLabels[provider.category]}</NeonBadge>
          </div>
          <h2 className="mt-3 text-[15px] font-semibold leading-5 text-slate-100">{provider.name}</h2>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">{provider.headline}</p>
        </div>
        <StatusBadge status={tone} label={connectionLabel(connection, provider)} />
      </div>

      <p className="text-[12px] leading-5 text-slate-400">{provider.summary}</p>

      {credentialDefinitions.length > 0 ? (
        <CredentialFields
          configuredCount={configuredCredentials}
          credentialDrafts={credentialDrafts}
          credentialSnapshotByField={credentialSnapshotByField}
          definitions={credentialDefinitions}
          isSaving={isSavingCredentials}
          providerId={provider.id}
          selectedCompanyId={selectedCompanyId}
          onChange={onCredentialChange}
          onSave={onSaveCredentials}
        />
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {provider.items.map((item) => (
          <span key={item} className="rounded-lg border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
            {item}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {provider.metrics.slice(0, 3).map((metric) => (
          <div key={metric} className="rounded-xl px-2 py-2" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
            <p className="truncate font-mono text-[8px] uppercase tracking-[0.11em] text-slate-500">{metric}</p>
          </div>
        ))}
      </div>

      <div className="mt-auto grid gap-2">
        {connection?.lastError ? (
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-[11px] leading-4 text-rose-200">
            {connection.lastError}
          </div>
        ) : null}
        <p className="text-[11px] leading-4 text-slate-500">{connection?.detail ?? provider.primaryUse}</p>
        <ProviderAction
          creatingWebhook={creatingWebhook}
          provider={provider}
          schemaReady={schemaReady}
          onCreateWebhook={onCreateWebhook}
        />
      </div>
    </article>
  );
}

function ProviderAction({
  provider,
  schemaReady,
  creatingWebhook,
  onCreateWebhook,
}: {
  provider: ClientIntegrationProvider;
  schemaReady: boolean;
  creatingWebhook: boolean;
  onCreateWebhook: () => void;
}) {
  const className = "inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border px-3 font-mono text-[10px] font-bold uppercase tracking-wide transition";

  if (provider.id === "meta-ads" || provider.id === "google-growth") {
    const href = provider.id === "meta-ads" ? "/dashboard/trafego/meta-ads" : "/dashboard/trafego/google-ads";

    return (
      <Link className={cn(className, "text-cyan-100 hover:bg-cyan-400/10")} href={href} style={{ borderColor: "var(--ch-border)" }}>
        <BarChart3 className="h-3.5 w-3.5" />
        Abrir dashboard
      </Link>
    );
  }

  if (provider.actionHref) {
    return (
      <Link className={cn(className, "text-cyan-100 hover:bg-cyan-400/10")} href={provider.actionHref} style={{ borderColor: "var(--ch-border)" }}>
        <ExternalLink className="h-3.5 w-3.5" />
        {provider.actionLabel}
      </Link>
    );
  }

  if (provider.id === "webhook-universal") {
    return (
      <button
        className={cn(className, schemaReady ? "text-cyan-100 hover:bg-cyan-400/10" : "cursor-not-allowed text-amber-200 opacity-70")}
        disabled={!schemaReady || creatingWebhook}
        onClick={onCreateWebhook}
        style={{ borderColor: "var(--ch-border)" }}
        type="button"
      >
        {creatingWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        {schemaReady ? provider.actionLabel : "Aplicar SQL"}
      </button>
    );
  }

  return (
    <button
      className={cn(className, "cursor-not-allowed text-slate-500 opacity-70")}
      disabled
      style={{ borderColor: "var(--ch-border)" }}
      type="button"
    >
      <PackageCheck className="h-3.5 w-3.5" />
      {provider.actionLabel}
    </button>
  );
}

function CredentialFields({
  configuredCount,
  credentialDrafts,
  credentialSnapshotByField,
  definitions,
  isSaving,
  providerId,
  selectedCompanyId,
  onChange,
  onSave,
}: {
  configuredCount: number;
  credentialDrafts: Record<string, string>;
  credentialSnapshotByField: Map<string, ClientIntegrationCredentialSnapshot>;
  definitions: ClientIntegrationCredentialDefinition[];
  isSaving: boolean;
  providerId: string;
  selectedCompanyId: string;
  onChange: (envName: string, value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-2xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">credenciais da empresa</p>
          <p className="mt-1 text-[12px] text-slate-400">{configuredCount}/{definitions.length} campo(s) configurado(s)</p>
        </div>
        <StatusBadge status={configuredCount > 0 ? "online" : "warning"} label={configuredCount > 0 ? "com dados" : "pendente"} />
      </div>

      <div className="grid gap-2">
        {definitions.map((definition) => {
          const key = credentialKey(selectedCompanyId, providerId, definition.envName);
          const snapshot = credentialSnapshotByField.get(key);
          const draftValue = credentialDrafts[key] ?? "";

          return (
            <label key={definition.envName} className="block">
              <span className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">{definition.label}</span>
                <span className="shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[8px] uppercase text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                  {definition.requirement}
                </span>
              </span>
              <input
                className="h-10 w-full rounded-xl px-3 font-mono text-[12px] outline-none"
                onChange={(event) => onChange(definition.envName, event.target.value)}
                placeholder={snapshot ? `Configurado: ${snapshot.displayValue}` : definition.envName}
                type={definition.kind === "secret" ? "password" : "text"}
                value={draftValue}
                style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
              />
              <span className="mt-1 block text-[10px] leading-4 text-slate-600">{definition.help}</span>
            </label>
          );
        })}
      </div>

      <button
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        onClick={onSave}
        style={{ borderColor: "var(--ch-border)" }}
        type="button"
      >
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Salvar credenciais
      </button>
    </div>
  );
}

function WebhookEndpointCard({ endpoint }: { endpoint: ClientIntegrationWebhookEndpoint }) {
  const endpointUrl = endpoint.endpointUrl ?? endpoint.urlPath;

  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-slate-100">{endpoint.label}</p>
          <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{endpointUrl}</p>
        </div>
        <StatusBadge status={endpoint.status === "active" ? "online" : "idle"} label={endpoint.status} />
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_36px] gap-2">
        <div className="min-w-0 rounded-lg px-2 py-2 font-mono text-[10px] text-slate-400" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
          <span className="block truncate">{endpointUrl}</span>
        </div>
        <button
          aria-label="Copiar URL do webhook"
          className="inline-flex h-9 items-center justify-center rounded-lg border text-slate-300"
          onClick={() => copyText(endpointUrl)}
          style={{ borderColor: "var(--ch-border)" }}
          type="button"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
        <span>{endpoint.receivedCount} evento(s)</span>
        {endpoint.lastReceivedAt ? <span>ultimo {formatShortDate(endpoint.lastReceivedAt)}</span> : null}
      </div>
    </div>
  );
}

function SecretBox({ secret }: { secret: string }) {
  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber-200">segredo exibido uma vez</p>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_36px] gap-2">
        <code className="min-w-0 truncate rounded-lg px-2 py-2 font-mono text-[11px] text-amber-100" style={{ background: "rgba(0,0,0,0.22)" }}>
          {secret}
        </code>
        <button
          aria-label="Copiar segredo do webhook"
          className="inline-flex h-9 items-center justify-center rounded-lg border text-amber-100"
          onClick={() => copyText(secret)}
          style={{ borderColor: "rgba(251,191,36,0.28)" }}
          type="button"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function NoticeBar({ notice }: { notice: Notice }) {
  const style = notice.tone === "success"
    ? { background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.24)", color: "#86efac" }
    : notice.tone === "warning"
      ? { background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.24)", color: "#fde68a" }
      : { background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.22)", color: "#fda4af" };

  return <div className="mb-4 rounded-2xl px-4 py-3 text-[13px] font-medium" style={style}>{notice.message}</div>;
}

function MercadoPagoGuidedCard({
  accountLabel,
  connected,
  connecting,
  disconnecting,
  lastError,
  selectedCompanyId,
  selectedCompanyName,
  onConnect,
  onDisconnect,
}: {
  accountLabel: string | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  lastError: string | null;
  selectedCompanyId: string;
  selectedCompanyName: string | null;
  onConnect: (event: MouseEvent<HTMLAnchorElement>) => void;
  onDisconnect: () => void;
}) {
  return (
    <section id="mercado-pago-guiado" className="rounded-2xl p-4" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">integracao guiada</p>
          <h2 className="mt-1 text-[16px] font-semibold text-slate-100">Mercado Pago</h2>
          <p className="mt-2 text-[12px] leading-5 text-slate-400">
            O cliente conecta pela autorizacao oficial do Mercado Pago. A ConnectyHub nao pede token manual, senha, callback ou webhook.
          </p>
        </div>
        <WalletCards className="h-5 w-5 shrink-0 text-emerald-300" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <PaymentGuideStep done={Boolean(selectedCompanyId)} index="1" title="Empresa" body={selectedCompanyName ?? "Escolha a empresa"} />
        <PaymentGuideStep done={connected} index="2" title="Autorizar" body="Aba oficial" />
        <PaymentGuideStep done={connected} index="3" title="Retorno" body="Conta conectada" />
        <PaymentGuideStep done={connected} index="4" title="Checkout" body="Pix e cartao" />
      </div>

      <div className="mt-4 rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-100">Conta Mercado Pago</p>
            <p className="mt-1 truncate text-[11px] text-slate-500">{accountLabel ? `Conta: ${accountLabel}` : "Nenhuma conta conectada"}</p>
          </div>
          <NeonBadge tone={connected ? "green" : "amber"}>{connected ? "pronto para vender" : "pendente"}</NeonBadge>
        </div>

        {lastError ? (
          <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-100">
            {lastError}
          </p>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <a
            href={buildMercadoPagoConnectUrl(selectedCompanyId)}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!selectedCompanyId || connecting}
            onClick={onConnect}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200",
              !selectedCompanyId || connecting ? "cursor-not-allowed opacity-50" : "",
            )}
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {connected ? "Reconectar no Mercado Pago" : "Conectar com Mercado Pago"}
          </a>
          <button
            type="button"
            disabled={!connected || disconnecting}
            onClick={onDisconnect}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-[12px] font-bold text-slate-300 transition hover:bg-rose-400/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--ch-border)" }}
          >
            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Desconectar
          </button>
        </div>

        <p className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-[11px] leading-5 text-cyan-100">
          Se o usuario ja estiver logado, ele so confirma a autorizacao. Se nao estiver, o login acontece no proprio Mercado Pago.
        </p>
      </div>
    </section>
  );
}

function GuidedOAuthCard({
  accountLabel,
  actionLogs,
  connected,
  connection,
  connecting,
  disconnecting,
  kind,
  loadingMetaWebhookMonitor,
  metaWebhookAction,
  metaWebhookMonitor,
  runningMetaCanary,
  savingMetaLiveActivation,
  savingSelection,
  selectionDraft,
  selectedCompanyId,
  selectedCompanyName,
  onActivateMetaWebhooks,
  onConnect,
  onDisconnect,
  onMetaReviewTestResult,
  onRefreshMetaWebhookMonitor,
  onReplayMetaWebhookEvent,
  onRunMetaCanary,
  onSaveMetaLiveActivation,
  onSaveSelection,
  onSelectionChange,
  onSimulateMetaWebhook,
}: {
  accountLabel: string | null;
  actionLogs: ClientIntegrationActionLog[];
  connected: boolean;
  connection?: ClientIntegrationConnection;
  connecting: boolean;
  disconnecting: boolean;
  kind: "meta" | "google";
  loadingMetaWebhookMonitor?: boolean;
  metaWebhookAction?: string | null;
  metaWebhookMonitor?: MetaWebhookMonitorSnapshot | null;
  runningMetaCanary: boolean;
  savingMetaLiveActivation: boolean;
  savingSelection: boolean;
  selectionDraft: GuidedSelectionDraft;
  selectedCompanyId: string;
  selectedCompanyName: string | null;
  onActivateMetaWebhooks?: () => void;
  onConnect: (event: MouseEvent<HTMLAnchorElement>) => void;
  onDisconnect: () => void;
  onMetaReviewTestResult?: (response: ReviewTestResponse) => void;
  onRefreshMetaWebhookMonitor?: () => void;
  onReplayMetaWebhookEvent?: (eventId: string) => void;
  onRunMetaCanary?: (draft: MetaSocialCanaryDraft) => Promise<MetaSocialCanarySnapshot>;
  onSaveMetaLiveActivation?: (draft: MetaSocialLiveActivationDraft) => void;
  onSaveSelection: (selection: GuidedSelectionDraft) => void;
  onSelectionChange: (selection: GuidedSelectionDraft) => void;
  onSimulateMetaWebhook?: (scenario: MetaWebhookSimulationScenario) => void;
}) {
  const config = kind === "meta"
    ? {
        id: "meta-ads-guiado",
        eyebrow: "integracao guiada",
        title: "Meta Ads / Instagram",
        body: "Conecte a conta Meta pela autorizacao oficial. A ConnectyHub recebe permissao para ler campanhas, leads e sinais organicos aprovados.",
        icon: BarChart3,
        iconColor: "text-sky-300",
        connectLabel: connected ? "Reconectar Meta" : "Conectar Meta",
        dashboardHref: "/dashboard/trafego/meta-ads",
        providerLabel: "Meta",
        stepTwo: "Autorizar Meta",
        stepFour: "Dashboard Meta",
      }
    : {
        id: "google-ads-guiado",
        eyebrow: "integracao guiada",
        title: "Google Ads / Search",
        body: "Conecte o Google pela autorizacao oficial. A ConnectyHub salva o refresh token da empresa e usa o app tecnico configurado na manutencao.",
        icon: BarChart3,
        iconColor: "text-cyan-300",
        connectLabel: connected ? "Reconectar Google" : "Conectar Google",
        dashboardHref: "/dashboard/trafego/google-ads",
        providerLabel: "Google",
        stepTwo: "Autorizar Google",
        stepFour: "Dashboard Google",
      };
  const Icon = config.icon;
  const selectionGroups = buildGuidedSelectionGroups(kind, connection, selectionDraft);
  const primaryAccountReady = hasGuidedPrimaryAccount(kind, connection);
  const hasRequiredSelectionGroup = selectionGroups.some((group) => !group.optional);
  const requiredSelectionReady = selectionGroups.filter((group) => !group.optional).every((group) => Boolean(group.value));
  const accountLine = buildGuidedAccountLine(kind, connected, primaryAccountReady, accountLabel);
  const readinessText = buildGuidedReadinessText(kind, connected, primaryAccountReady, selectionGroups.length, hasRequiredSelectionGroup);
  const currentSelection = selectionGroups.reduce<GuidedSelectionDraft>((current, group) => ({
    ...current,
    [group.field]: group.value,
  }), {});
  const metaReview = kind === "meta" ? readMetaReviewTest(connection?.metadata?.review_test) : null;
  const metaWebhookActivation = kind === "meta" ? readMetaWebhookActivation(connection?.metadata?.webhook_activation) : null;
  const metaWebhookSimulation = kind === "meta" ? readMetaWebhookSimulation(connection?.metadata?.webhook_simulation) : null;
  const metaLiveActivation = kind === "meta" ? readMetaSocialLiveActivation(connection?.metadata?.meta_social_dispatch_activation) : null;

  return (
    <section id={config.id} className="rounded-2xl p-4" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{config.eyebrow}</p>
          <h2 className="mt-1 text-[16px] font-semibold text-slate-100">{config.title}</h2>
          <p className="mt-2 text-[12px] leading-5 text-slate-400">{config.body}</p>
        </div>
        <Icon className={cn("h-5 w-5 shrink-0", config.iconColor)} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <PaymentGuideStep done={Boolean(selectedCompanyId)} index="1" title="Empresa" body={selectedCompanyName ?? "Escolha a empresa"} />
        <PaymentGuideStep done={connected} index="2" title="Autorizar" body={config.stepTwo} />
        <PaymentGuideStep done={primaryAccountReady} index="3" title="Conta" body={primaryAccountReady ? accountLabel ?? "Conta selecionada" : "Selecionar acesso"} />
        <PaymentGuideStep done={connected && primaryAccountReady} index="4" title="Dados" body={primaryAccountReady ? config.stepFour : "Aguardando conta"} />
      </div>

      <div className="mt-4 rounded-xl border p-3" style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-100">Conta {config.providerLabel}</p>
            <p className="mt-1 truncate text-[11px] text-slate-500">{accountLine}</p>
          </div>
          <NeonBadge tone={primaryAccountReady ? "green" : "amber"}>{primaryAccountReady ? "conectado" : connected ? "autorizado" : "pendente"}</NeonBadge>
        </div>

        {connection?.lastError ? (
          <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-100">
            {connection.lastError}
          </p>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <a
            href={buildGuidedOAuthConnectUrl(kind, selectedCompanyId)}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!selectedCompanyId || connecting}
            onClick={onConnect}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-[12px] font-bold text-slate-950 transition hover:bg-cyan-200 sm:col-span-2",
              !selectedCompanyId || connecting ? "cursor-not-allowed opacity-50" : "",
            )}
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {config.connectLabel}
          </a>
          <button
            type="button"
            disabled={!connected || disconnecting}
            onClick={onDisconnect}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-[12px] font-bold text-slate-300 transition hover:bg-rose-400/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--ch-border)" }}
          >
            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Desconectar
          </button>
        </div>

        <Link
          href={config.dashboardHref}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
          style={{ borderColor: "var(--ch-border)" }}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          {primaryAccountReady ? "Abrir dashboard" : "Ver status do dashboard"}
        </Link>

        <p
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-[11px] leading-5",
            primaryAccountReady
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
              : "border-amber-300/20 bg-amber-300/10 text-amber-100",
          )}
        >
          {readinessText}
        </p>

        {connected && selectionGroups.length > 0 ? (
          <div className="mt-3 rounded-xl border p-3" style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">conta usada nos dashboards</p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">Escolha qual ativo desta empresa alimenta os mostradores.</p>
              </div>
              <NeonBadge tone="cyan">{selectionGroups.length} seletor(es)</NeonBadge>
            </div>

            <div className="grid gap-2">
              {selectionGroups.map((group) => (
                <label key={group.field} className="block">
                  <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">{group.label}</span>
                  <select
                    value={group.value}
                    onChange={(event) => onSelectionChange({ ...currentSelection, [group.field]: event.target.value })}
                    className="h-10 w-full rounded-xl px-3 text-[12px] outline-none"
                    style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
                  >
                    {group.optional ? <option value="">Nao usar agora</option> : null}
                    {group.options.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <button
              type="button"
              disabled={savingSelection || !requiredSelectionReady}
              onClick={() => onSaveSelection(currentSelection)}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ borderColor: "var(--ch-border)" }}
            >
              {savingSelection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar escolha
            </button>
          </div>
        ) : null}

        {kind === "meta" ? (
          <MetaReadinessPanel
            actionLogs={actionLogs}
            activation={metaWebhookActivation}
            connected={connected}
            loadingMonitor={loadingMetaWebhookMonitor ?? false}
            metaWebhookAction={metaWebhookAction ?? null}
            monitor={metaWebhookMonitor ?? null}
            review={metaReview}
            runningCanary={runningMetaCanary}
            savingLiveActivation={savingMetaLiveActivation}
            simulation={metaWebhookSimulation}
            liveActivation={metaLiveActivation}
            onActivateWebhooks={onActivateMetaWebhooks}
            onReviewResult={onMetaReviewTestResult}
            onRefreshMonitor={onRefreshMetaWebhookMonitor}
            onReplayEvent={onReplayMetaWebhookEvent}
            onRunCanary={onRunMetaCanary}
            onSaveLiveActivation={onSaveMetaLiveActivation}
            onSimulateWebhook={onSimulateMetaWebhook}
          />
        ) : null}
      </div>
    </section>
  );
}

function MetaReadinessPanel({
  actionLogs,
  activation,
  connected,
  loadingMonitor,
  metaWebhookAction,
  monitor,
  review,
  runningCanary,
  savingLiveActivation,
  simulation,
  liveActivation,
  onActivateWebhooks,
  onReviewResult,
  onRefreshMonitor,
  onReplayEvent,
  onRunCanary,
  onSaveLiveActivation,
  onSimulateWebhook,
}: {
  actionLogs: ClientIntegrationActionLog[];
  activation: MetaWebhookActivationSnapshot | null;
  connected: boolean;
  loadingMonitor: boolean;
  metaWebhookAction: string | null;
  monitor: MetaWebhookMonitorSnapshot | null;
  review: MetaReviewSnapshot | null;
  runningCanary: boolean;
  savingLiveActivation: boolean;
  simulation: MetaWebhookSimulationSnapshot | null;
  liveActivation: MetaSocialLiveActivationSnapshot | null;
  onActivateWebhooks?: () => void;
  onReviewResult?: (response: ReviewTestResponse) => void;
  onRefreshMonitor?: () => void;
  onReplayEvent?: (eventId: string) => void;
  onRunCanary?: (draft: MetaSocialCanaryDraft) => Promise<MetaSocialCanarySnapshot>;
  onSaveLiveActivation?: (draft: MetaSocialLiveActivationDraft) => void;
  onSimulateWebhook?: (scenario: MetaWebhookSimulationScenario) => void;
}) {
  const summary = review?.readiness;
  const tone = summary?.status === "ready"
    ? "green"
    : summary?.status === "warning"
      ? "amber"
      : "rose";
  const actionRunning = Boolean(metaWebhookAction);

  return (
    <div className="mt-3 rounded-xl border p-3" style={{ background: "var(--ch-surface)", borderColor: "var(--ch-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">readiness Meta</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            {summary
              ? `${summary.ready}/${summary.total} checks prontos`
              : "Execute o checklist antes de operar com usuarios reais."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary ? (
            <NeonBadge tone={tone}>
              {summary.status === "ready" ? "pronto" : summary.status === "warning" ? "alerta" : "bloqueado"}
            </NeonBadge>
          ) : null}
          <MetaReviewTestButton
            label={connected ? "Rodar checklist" : "Testar Meta"}
            onResult={onReviewResult}
            tone="violet"
          />
        </div>
      </div>

      {summary ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <ReadinessMiniStat label="OK" value={String(summary.ready)} tone="green" />
          <ReadinessMiniStat label="Alertas" value={String(summary.warning)} tone="amber" />
          <ReadinessMiniStat label="Bloqueios" value={String(summary.blocked)} tone="rose" />
        </div>
      ) : null}

      {review?.results.length ? (
        <div className="mt-3 grid gap-2">
          {review.results.slice(0, 10).map((result) => (
            <MetaReviewResultRow key={result.id} result={result} />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-[11px] text-slate-500">
          Sem checklist salvo para esta empresa.
        </div>
      )}

      <MetaLiveDispatchPanel
        key={liveActivation?.updatedAt || "meta-live-empty"}
        activation={liveActivation}
        connected={connected}
        saving={savingLiveActivation}
        onSave={onSaveLiveActivation}
      />

      <MetaCanaryDispatchPanel
        connected={connected}
        running={runningCanary}
        onRun={onRunCanary}
      />

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">ativacao webhooks</p>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {activation ? formatShortDate(activation.activatedAt) : "Aguardando assinatura da Pagina"}
            </p>
          </div>
          <button
            type="button"
            disabled={!connected || actionRunning || !onActivateWebhooks}
            onClick={onActivateWebhooks}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[9px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: "var(--ch-border)" }}
          >
            {metaWebhookAction === "subscribe_page" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
            Assinar Page
          </button>
        </div>

        {activation ? (
          <div className="mt-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="truncate text-[12px] font-semibold text-slate-100">Page {activation.pageId}</p>
              <NeonBadge tone={activation.ok ? "green" : "amber"}>
                {activation.ok ? "assinada" : `${activation.missingFields.length} pendente(s)`}
              </NeonBadge>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{activation.detail}</p>
            <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">
              {activation.subscribedFields.length ? activation.subscribedFields.join(", ") : "sem confirmacao de campos"}
            </p>
            {activation.instagramAppDashboardRequired ? (
              <p className="mt-2 rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1.5 text-[10px] leading-4 text-amber-100">
                Instagram Direct e comentarios seguem pelo App Dashboard da Meta.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {metaWebhookSimulationScenarios.map((scenario) => {
            const key = `simulate:${scenario.id}`;

            return (
              <button
                key={scenario.id}
                type="button"
                disabled={!connected || actionRunning || !onSimulateWebhook}
                onClick={() => onSimulateWebhook?.(scenario.id)}
                className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 font-mono text-[8px] font-bold uppercase tracking-wide text-slate-300 transition hover:bg-emerald-400/10 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderColor: "var(--ch-border)" }}
              >
                {metaWebhookAction === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                {scenario.label}
              </button>
            );
          })}
        </div>

        {simulation ? (
          <div className="mt-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="truncate text-[12px] font-semibold text-slate-100">{formatMetaWebhookScenario(simulation.scenario)}</p>
              <span className="font-mono text-[9px] uppercase tracking-wide text-slate-500">{formatShortDate(simulation.simulatedAt)}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{simulation.detail}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <ReadinessMiniStat label="Eventos" value={String(simulation.ingest.received)} tone="green" />
              <ReadinessMiniStat label="CRM" value={String(simulation.ingest.normalized)} tone="green" />
              <ReadinessMiniStat label="Falhas" value={String(simulation.ingest.failed + simulation.ingest.unmapped)} tone={simulation.ingest.failed + simulation.ingest.unmapped > 0 ? "amber" : "green"} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">monitor operacional</p>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {monitor ? `${monitor.summary.total} evento(s), ${monitor.summary.failed} falha(s)` : "Eventos Meta reais e simulados"}
            </p>
          </div>
          <button
            type="button"
            disabled={!connected || loadingMonitor || !onRefreshMonitor}
            onClick={onRefreshMonitor}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 font-mono text-[9px] font-bold uppercase tracking-wide text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: "var(--ch-border)" }}
          >
            {loadingMonitor ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Atualizar
          </button>
        </div>

        {monitor ? (
          <div className="mt-3 grid gap-3">
            <div className="grid grid-cols-4 gap-2">
              <ReadinessMiniStat label="Total" value={String(monitor.summary.total)} tone="green" />
              <ReadinessMiniStat label="OK" value={String(monitor.summary.processed)} tone="green" />
              <ReadinessMiniStat label="Replay" value={String(monitor.summary.replayable)} tone={monitor.summary.replayable > 0 ? "amber" : "green"} />
              <ReadinessMiniStat label="Agentes" value={String(monitor.agentQueue.total)} tone={monitor.agentQueue.failed > 0 ? "rose" : "green"} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {monitor.diagnostics.slice(0, 4).map((diagnostic) => (
                <div key={diagnostic.id} className="min-w-0 border-t border-white/10 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold text-slate-200">{diagnostic.label}</p>
                    <span className={cn(
                      "shrink-0 font-mono text-[8px] uppercase tracking-wide",
                      diagnostic.status === "ok" ? "text-emerald-300" : diagnostic.status === "warning" ? "text-amber-300" : "text-rose-300",
                    )}>
                      {diagnostic.status === "ok" ? "ok" : diagnostic.status === "warning" ? "atencao" : "critico"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{diagnostic.detail}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-1.5">
              {monitor.channels.filter((channel) => channel.total > 0).slice(0, 5).map((channel) => (
                <div key={channel.channel} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-white/10 pt-1.5">
                  <p className="truncate text-[11px] text-slate-300">{formatMetaMonitorChannel(channel.channel)}</p>
                  <span className="font-mono text-[9px] uppercase text-emerald-300">{channel.processed} ok</span>
                  <span className={cn("font-mono text-[9px] uppercase", channel.failed > 0 ? "text-rose-300" : "text-slate-500")}>
                    {channel.failed} falha(s)
                  </span>
                </div>
              ))}
            </div>

            {monitor.events.length ? (
              <div className="grid gap-1.5">
                {monitor.events.slice(0, 8).map((event) => (
                  <MetaWebhookEventRow
                    key={event.id}
                    event={event}
                    replaying={metaWebhookAction === `replay:${event.id}`}
                    onReplay={onReplayEvent}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-slate-500">
                Sem eventos Meta recebidos para esta empresa.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-slate-500">
            Atualize o monitor depois de conectar a Meta ou simular um evento.
          </div>
        )}
      </div>

      {actionLogs.length ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-200" />
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">ultimos logs Meta</p>
          </div>
          <div className="grid gap-1.5">
            {actionLogs.map((log) => (
              <div key={log.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--ch-border)" }}>
                <span className="truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">{log.action}</span>
                <span className={cn(
                  "shrink-0 font-mono text-[9px] uppercase",
                  log.status === "success" ? "text-emerald-300" : log.status === "warning" ? "text-amber-300" : "text-rose-300",
                )}>
                  {formatShortDate(log.createdAt ?? "")}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetaLiveDispatchPanel({
  activation,
  connected,
  saving,
  onSave,
}: {
  activation: MetaSocialLiveActivationSnapshot | null;
  connected: boolean;
  saving: boolean;
  onSave?: (draft: MetaSocialLiveActivationDraft) => void;
}) {
  const [draft, setDraft] = useState<MetaSocialLiveActivationDraft>(() => buildMetaLiveActivationDraft(activation));

  const enabledCount = Object.values(draft.channels).filter(Boolean).length;
  const status = activation?.status ?? "disabled";
  const statusTone = getMetaLiveActivationTone(status);

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">envio social live</p>
          <p className="mt-1 truncate text-[11px] text-slate-500">
            {activation
              ? `${activation.readyChannels}/${activation.enabledChannels || enabledCount} canal(is) pronto(s)`
              : "Canais Meta seguem em dry-run ate a ativacao operacional."}
          </p>
        </div>
        <NeonBadge tone={statusTone}>{formatMetaLiveActivationStatus(status)}</NeonBadge>
      </div>

      <label className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
        <input
          type="checkbox"
          checked={draft.appLiveModeConfirmed}
          onChange={(event) => setDraft((current) => ({ ...current, appLiveModeConfirmed: event.target.checked }))}
          className="mt-0.5 h-4 w-4 accent-emerald-300"
        />
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-slate-100">App Meta em Live Mode e App Review aprovado</span>
          <span className="mt-1 block text-[10px] leading-4 text-slate-500">
            Esta confirmacao libera apenas a trava operacional da empresa; o servidor ainda precisa estar em modo live.
          </span>
        </span>
      </label>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {metaSocialLiveChannels.map((item) => {
          const channel = activation?.channels[item.id];
          const checked = draft.channels[item.id];

          return (
            <label key={item.id} className="min-w-0 rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    channels: {
                      ...current.channels,
                      [item.id]: event.target.checked,
                    },
                  }))}
                  className="mt-0.5 h-4 w-4 accent-cyan-300"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-semibold text-slate-100">{item.label}</span>
                    <span className={cn("shrink-0 font-mono text-[8px] uppercase tracking-wide", metaLiveChannelStatusClass(channel?.status ?? "disabled"))}>
                      {formatMetaLiveChannelStatus(channel?.status ?? "disabled")}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[10px] leading-4 text-slate-500">
                    {channel?.detail ?? "Aguardando primeira ativacao."}
                  </span>
                  {channel?.missingPermissions.length || channel?.missingAssets.length ? (
                    <span className="mt-1 block truncate font-mono text-[8px] uppercase tracking-wide text-amber-300">
                      {[...channel.missingAssets, ...channel.missingPermissions].join(", ")}
                    </span>
                  ) : null}
                </span>
              </div>
            </label>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <ReadinessMiniStat label="Ligados" value={String(enabledCount)} tone={enabledCount > 0 ? "green" : "amber"} />
        <ReadinessMiniStat label="Prontos" value={String(activation?.readyChannels ?? 0)} tone={(activation?.readyChannels ?? 0) > 0 ? "green" : "amber"} />
        <ReadinessMiniStat label="Bloqueados" value={String(activation?.blockedChannels ?? 0)} tone={(activation?.blockedChannels ?? 0) > 0 ? "rose" : "green"} />
      </div>

      <button
        type="button"
        disabled={!connected || saving || !onSave}
        onClick={() => onSave?.(draft)}
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ borderColor: "var(--ch-border)" }}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Salvar envio live
      </button>
    </div>
  );
}

function MetaCanaryDispatchPanel({
  connected,
  running,
  onRun,
}: {
  connected: boolean;
  running: boolean;
  onRun?: (draft: MetaSocialCanaryDraft) => Promise<MetaSocialCanarySnapshot>;
}) {
  const [draft, setDraft] = useState<MetaSocialCanaryDraft>({
    channel: "facebook_messenger",
    targetId: "",
    text: "Teste controlado ConnectyHub.",
    replyMode: "private",
    occurredAt: "",
  });
  const [result, setResult] = useState<MetaSocialCanarySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commentChannel = draft.channel === "facebook_comments" || draft.channel === "instagram_comments";

  async function handleRun() {
    if (!onRun) return;

    setError(null);

    try {
      const nextResult = await onRun(draft);
      setResult(nextResult);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Canario Meta falhou.");
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">canario de envio</p>
          <p className="mt-1 truncate text-[11px] text-slate-500">
            {result ? `${formatMetaCanaryStatus(result.status)} / ${formatShortDate(result.ranAt)}` : "Disparo controlado pelo dispatcher real"}
          </p>
        </div>
        <NeonBadge tone={result ? getMetaCanaryTone(result.status) : "zinc"}>
          {result ? formatMetaCanaryStatus(result.status) : "sem teste"}
        </NeonBadge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">Canal</span>
          <select
            value={draft.channel}
            onChange={(event) => setDraft((current) => ({
              ...current,
              channel: event.target.value as MetaSocialLiveChannelId,
              replyMode: event.target.value.endsWith("_comments") ? current.replyMode : "private",
            }))}
            className="h-10 w-full rounded-xl px-3 text-[12px] outline-none"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
          >
            {metaSocialLiveChannels.map((channel) => (
              <option key={channel.id} value={channel.id}>{channel.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
            {commentChannel ? "ID do comentario" : "ID do lead"}
          </span>
          <input
            value={draft.targetId}
            onChange={(event) => setDraft((current) => ({ ...current, targetId: event.target.value }))}
            className="h-10 w-full rounded-xl px-3 text-[12px] outline-none"
            placeholder={commentChannel ? "comment_id" : "psid / igsid"}
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
          />
        </label>

        {commentChannel ? (
          <label className="block">
            <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">Modo</span>
            <select
              value={draft.replyMode}
              onChange={(event) => setDraft((current) => ({ ...current, replyMode: event.target.value as "private" | "public" }))}
              className="h-10 w-full rounded-xl px-3 text-[12px] outline-none"
              style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
            >
              <option value="private">Mensagem privada</option>
              <option value="public">Comentario publico</option>
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">Data do evento</span>
          <input
            type="datetime-local"
            value={draft.occurredAt}
            onChange={(event) => setDraft((current) => ({ ...current, occurredAt: event.target.value }))}
            className="h-10 w-full rounded-xl px-3 text-[12px] outline-none"
            style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
          />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">Texto</span>
        <textarea
          value={draft.text}
          onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))}
          className="min-h-20 w-full resize-none rounded-xl px-3 py-2 text-[12px] leading-5 outline-none"
          style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)", color: "var(--ch-text)" }}
        />
      </label>

      {error ? (
        <p className="mt-2 rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-[11px] leading-4 text-rose-100">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="truncate text-[12px] font-semibold text-slate-100">{result.channelLabel}</p>
            <span className={cn("font-mono text-[9px] uppercase tracking-wide", metaCanaryStatusClass(result.status))}>
              {formatMetaCanaryStatus(result.status)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{result.detail}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ReadinessMiniStat label="HTTP" value={result.httpStatus ? String(result.httpStatus) : "-"} tone={result.status === "failed" ? "rose" : "green"} />
            <ReadinessMiniStat label="Tentativas" value={String(result.audit.filter((entry) => entry.type === "dispatch_started").length)} tone="green" />
            <ReadinessMiniStat label="Run" value={result.runId ? "ok" : "-"} tone={result.runId ? "green" : "amber"} />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={!connected || running || !onRun}
        onClick={handleRun}
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-4 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ borderColor: "var(--ch-border)" }}
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Executar canario
      </button>
    </div>
  );
}

function ReadinessMiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "amber" | "rose";
}) {
  const className = tone === "green"
    ? "text-emerald-300"
    : tone === "amber"
      ? "text-amber-300"
      : "text-rose-300";

  return (
    <div className="rounded-lg border px-2 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
      <p className="font-mono text-[8px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 font-mono text-[15px] font-bold", className)}>{value}</p>
    </div>
  );
}

function MetaReviewResultRow({ result }: { result: ReviewTestResult }) {
  return (
    <div className="grid gap-2 rounded-lg border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {result.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
          <p className="truncate text-[12px] font-semibold text-slate-100">{result.label}</p>
          <span className="rounded-md border px-1.5 py-0.5 font-mono text-[8px] uppercase text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
            {result.surface ?? "meta"}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{result.detail}</p>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <span className={cn(
          "rounded-md border px-2 py-1 font-mono text-[8px] uppercase tracking-wide",
          result.ok ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-amber-300/20 bg-amber-300/10 text-amber-200",
        )}>
          {result.ok ? "ok" : result.severity === "recommended" ? "alerta" : "acao"}
        </span>
      </div>
    </div>
  );
}

function MetaWebhookEventRow({
  event,
  replaying,
  onReplay,
}: {
  event: MetaWebhookMonitorEvent;
  replaying: boolean;
  onReplay?: (eventId: string) => void;
}) {
  return (
    <div className="grid gap-2 border-t border-white/10 pt-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            "rounded-md border px-1.5 py-0.5 font-mono text-[8px] uppercase",
            metaMonitorStatusClass(event.status),
          )}>
            {formatMetaMonitorStatus(event.status)}
          </span>
          <p className="truncate text-[11px] font-semibold text-slate-100">{formatMetaMonitorChannel(event.channel)}</p>
          <span className="font-mono text-[8px] uppercase tracking-wide text-slate-500">{event.origin}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">
          {event.textPreview ?? event.errorMessage ?? event.eventType}
        </p>
        <p className="mt-1 truncate font-mono text-[8px] uppercase tracking-wide text-slate-600">
          {event.leadIdentity ?? event.assetId ?? event.sourceEventId ?? event.id}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="shrink-0 font-mono text-[9px] uppercase text-slate-500">
          {formatShortDate(event.receivedAt ?? "")}
        </span>
        <button
          type="button"
          disabled={!event.replayable || replaying || !onReplay}
          onClick={() => onReplay?.(event.id)}
          className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 font-mono text-[8px] font-bold uppercase tracking-wide text-amber-100 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: "var(--ch-border)" }}
        >
          {replaying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Replay
        </button>
      </div>
    </div>
  );
}

function PaymentGuideStep({
  body,
  done,
  index,
  title,
}: {
  body: string;
  done: boolean;
  index: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--ch-border)", background: "var(--ch-panel)" }}>
      <div className="flex items-center gap-2">
        <span className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold",
          done ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-100" : "border-cyan-300/40 bg-cyan-300/10 text-cyan-100",
        )}>
          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index}
        </span>
        <p className="truncate text-[12px] font-semibold text-slate-100">{title}</p>
      </div>
      <p className="mt-1 truncate pl-8 text-[10px] leading-4 text-slate-500">{body}</p>
    </div>
  );
}

function Metric({
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
  const colors = {
    amber: "251,191,36",
    cyan: "34,211,238",
    green: "52,211,153",
    violet: "167,139,250",
  }[tone];

  return (
    <div className="min-w-0 rounded-2xl p-2.5 sm:p-5" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-2">
        <p className="truncate font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500 sm:text-[10px] sm:tracking-widest">{label}</p>
        <div className="hidden h-9 w-9 items-center justify-center rounded-xl sm:flex" style={{ background: `rgba(${colors},0.14)`, color: `rgb(${colors})` }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 truncate font-mono text-[17px] font-bold leading-none sm:mt-4 sm:text-[26px]" style={{ color: `rgb(${colors})` }}>{value}</p>
      <p className="mt-1 truncate text-[10px] text-slate-500 sm:mt-3 sm:text-[12px]">{detail}</p>
    </div>
  );
}

function statusTone(status: IntegrationConnectionStatus): "online" | "warning" | "critical" | "idle" {
  if (status === "connected") return "online";
  if (status === "error") return "critical";
  if (status === "pending" || status === "available") return "warning";
  return "idle";
}

function categoryTone(category: IntegrationCategory): "green" | "cyan" | "amber" | "violet" | "zinc" {
  if (category === "payments") return "green";
  if (category === "ads") return "cyan";
  if (category === "commerce") return "violet";
  if (category === "shipping") return "amber";
  if (category === "webhooks") return "cyan";
  return "zinc";
}

function connectionLabel(connection: ClientIntegrationConnection | undefined, provider: ClientIntegrationProvider) {
  if (connection?.label) return connection.label;
  if (provider.status === "built_in") return "Interno";
  if (provider.status === "active") return "Disponivel";
  if (provider.status === "next") return "Proxima";
  return "Planejado";
}

function upsertWebhookConnection(
  current: ClientIntegrationConnection[],
  endpoint: ClientIntegrationWebhookEndpoint,
  companyName: string,
) {
  const nextConnection: ClientIntegrationConnection = {
    providerId: "webhook-universal",
    companyId: endpoint.companyId,
    companyName,
    status: "connected",
    label: "Endpoint ativo",
    detail: "Webhook Universal criado para esta empresa.",
    accountLabel: endpoint.label,
    lastSyncAt: endpoint.updatedAt ?? endpoint.createdAt,
    lastError: endpoint.lastError,
    managementHref: null,
    metadata: { webhook_endpoint_id: endpoint.id },
  };

  return [
    nextConnection,
    ...current.filter((item) => !(item.companyId === endpoint.companyId && item.providerId === "webhook-universal")),
  ];
}

function buildMercadoPagoConnectUrl(companyId: string) {
  if (!companyId) return "#";

  const params = new URLSearchParams({
    companyId,
    returnTo: "integrations",
  });

  return `/api/dashboard/sales-catalog/payments/mercado-pago/connect?${params.toString()}`;
}

function buildGuidedOAuthConnectUrl(kind: "meta" | "google", companyId: string) {
  if (!companyId) return "#";

  const params = new URLSearchParams({ companyId });
  return `/api/dashboard/integrations/${kind}/connect?${params.toString()}`;
}

function buildGuidedSelectionGroups(
  kind: "meta" | "google",
  connection: ClientIntegrationConnection | undefined,
  draft: GuidedSelectionDraft,
): GuidedSelectionGroup[] {
  const metadata = connection?.metadata ?? {};

  if (!connection || connection.status !== "connected") {
    return [];
  }

  if (kind === "google") {
    const options = readMetadataStringArray(metadata.accessible_customers)
      .map((customerId) => normalizeGoogleCustomerId(customerId))
      .filter(Boolean)
      .map((customerId) => ({ id: customerId, label: `Google Ads ${customerId}` }));

    if (options.length === 0) {
      return [];
    }

    const current = draft.customerId
      ?? normalizeGoogleCustomerId(readMetadataString(metadata.selected_customer_id));

    return [{
      field: "customerId",
      label: "Conta Google Ads",
      optional: false,
      options,
      value: current || options[0]?.id || "",
    }];
  }

  const adOptions = readMetadataOptions(metadata.ad_accounts)
    .map((option) => ({ ...option, id: normalizeMetaAdAccountId(option.id) }))
    .filter((option) => option.id);
  const pageOptions = readMetadataOptions(metadata.facebook_pages);
  const instagramOptions = readMetadataOptions(metadata.instagram_accounts);
  const groups: GuidedSelectionGroup[] = [];

  if (adOptions.length > 0) {
    groups.push({
      field: "adAccountId",
      label: "Conta de anuncios Meta",
      optional: false,
      options: adOptions,
      value: (draft.adAccountId
        ?? normalizeMetaAdAccountId(readMetadataString(metadata.selected_ad_account_id) || readMetadataString(metadata.ad_account_id)))
        || adOptions[0]?.id
        || "",
    });
  }

  if (pageOptions.length > 0) {
    groups.push({
      field: "pageId",
      label: "Pagina Facebook",
      optional: true,
      options: pageOptions,
      value: draft.pageId
        ?? readMetadataString(metadata.selected_facebook_page_id)
        ?? readMetadataString(metadata.facebook_page_id)
        ?? "",
    });
  }

  if (instagramOptions.length > 0) {
    groups.push({
      field: "instagramBusinessId",
      label: "Instagram Business",
      optional: true,
      options: instagramOptions,
      value: draft.instagramBusinessId
        ?? readMetadataString(metadata.selected_instagram_business_id)
        ?? readMetadataString(metadata.instagram_business_id)
        ?? "",
    });
  }

  return groups;
}

function hasGuidedPrimaryAccount(kind: "meta" | "google", connection: ClientIntegrationConnection | undefined) {
  if (!connection || connection.status !== "connected") {
    return false;
  }

  const metadata = connection.metadata ?? {};

  if (kind === "google") {
    return Boolean(
      normalizeGoogleCustomerId(readMetadataString(metadata.selected_customer_id))
      || normalizeGoogleCustomerId(readMetadataString(metadata.customer_id))
      || normalizeGoogleCustomerId(readMetadataString(metadata.external_account_id)),
    );
  }

  return Boolean(
    normalizeMetaAdAccountId(readMetadataString(metadata.selected_ad_account_id))
    || normalizeMetaAdAccountId(readMetadataString(metadata.ad_account_id)),
  );
}

function buildGuidedAccountLine(
  kind: "meta" | "google",
  connected: boolean,
  primaryAccountReady: boolean,
  accountLabel: string | null,
) {
  if (primaryAccountReady) {
    return accountLabel
      ? `Conta: ${accountLabel}`
      : kind === "meta"
        ? "Conta de anuncios Meta selecionada"
        : "Conta Google Ads selecionada";
  }

  if (connected) {
    return kind === "meta"
      ? "Meta autorizado; selecione uma conta de anuncios."
      : "Google autorizado; selecione uma conta Google Ads.";
  }

  return "Nenhuma conta conectada";
}

function buildGuidedReadinessText(
  kind: "meta" | "google",
  connected: boolean,
  primaryAccountReady: boolean,
  selectionGroupCount: number,
  hasRequiredSelectionGroup: boolean,
) {
  const provider = kind === "meta" ? "Meta" : "Google";
  const account = kind === "meta" ? "conta de anuncios Meta" : "conta Google Ads";

  if (!connected) {
    return `Conecte ${provider} pelo fluxo oficial. Depois da autorizacao, os dashboards usam a ${account} salva aqui.`;
  }

  if (primaryAccountReady) {
    return `Pronto para leitura: a ${account} ja esta salva para alimentar o dashboard.`;
  }

  if (selectionGroupCount > 0 && hasRequiredSelectionGroup) {
    return `Autorizacao concluida. Escolha e salve a ${account} antes de analisar os dados.`;
  }

  if (selectionGroupCount > 0) {
    return `Autorizacao concluida, mas nenhuma ${account} foi encontrada. Salve os ativos opcionais se quiser leitura organica e confira o acesso a conta de anuncios.`;
  }

  return `Autorizacao concluida, mas nenhuma ${account} foi encontrada pelo OAuth. Confirme se o usuario autorizado tem acesso administrativo a essa conta.`;
}

function isTopGuidedProvider(providerId: string) {
  return providerId === "meta-ads" || providerId === "google-growth" || providerId === "webhook-universal";
}

function guidedSelectionKey(companyId: string, providerId: string) {
  return `${companyId}:${providerId}:selection`;
}

function credentialKey(companyId: string, providerId: string, envName: string) {
  return `${companyId}:${providerId}:${envName}`;
}

function getGuidedOAuthErrorMessage(integration: string, reason: string | null) {
  const provider = integration === "meta_error" ? "Meta" : "Google";

  if (reason === "config") {
    return `${provider} ainda precisa das credenciais do app oficial na sala de manutencao.`;
  }

  if (reason === "missing_company") {
    return `Escolha uma empresa antes de conectar ${provider}.`;
  }

  if (reason === "permission") {
    return `Somente dono ou admin da empresa pode conectar ${provider}.`;
  }

  if (reason === "invalid_state") {
    return `Nao conseguimos validar o retorno do ${provider}. Tente conectar novamente.`;
  }

  if (reason === "refresh_token") {
    return "Google autorizou, mas nao retornou refresh token. Reconecte confirmando o consentimento.";
  }

  if (reason === "encryption") {
    return "O cofre de credenciais precisa da CREDENTIAL_ENCRYPTION_KEY para salvar essa conexao.";
  }

  if (reason === "schema") {
    return "A migration da Central de Integracoes precisa estar aplicada no Supabase.";
  }

  return `Nao foi possivel concluir a conexao com ${provider}. Tente novamente ou chame o suporte.`;
}

function getMercadoPagoConnectionErrorMessage(reason: string | null) {
  if (reason === "config") {
    return "Mercado Pago ainda precisa ser configurado no painel admin da ConnectyHub. Depois disso, este botao abre a autorizacao oficial.";
  }

  if (reason === "invalid_oauth_credentials") {
    return "As credenciais do aplicativo Mercado Pago da ConnectyHub nao foram aceitas. Confira se o Client ID e o App ID do aplicativo, nao o e-mail da conta, e tente novamente.";
  }

  if (reason === "missing_company") {
    return "Escolha uma empresa antes de conectar o Mercado Pago.";
  }

  if (reason === "invalid_state") {
    return "Nao conseguimos validar o retorno do Mercado Pago. Tente conectar novamente.";
  }

  if (reason === "token_exchange") {
    return "Mercado Pago retornou a autorizacao, mas nao conseguimos concluir a conexao. Tente novamente ou chame o suporte.";
  }

  return "Nao foi possivel abrir a conexao com Mercado Pago agora. Tente novamente ou chame o suporte.";
}

function copyText(value: string) {
  void navigator.clipboard.writeText(value);
}

function buildMetaLiveActivationDraft(activation: MetaSocialLiveActivationSnapshot | null): MetaSocialLiveActivationDraft {
  return {
    appLiveModeConfirmed: activation?.appLiveModeConfirmed ?? false,
    channels: Object.fromEntries(metaSocialLiveChannels.map((channel) => [
      channel.id,
      activation?.channels[channel.id]?.enabled === true,
    ])) as Record<MetaSocialLiveChannelId, boolean>,
  };
}

function readMetaSocialLiveActivation(value: unknown): MetaSocialLiveActivationSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const channelRecord = readRecord(record.channels);
  const channels = Object.fromEntries(metaSocialLiveChannels.map((channel) => [
    channel.id,
    readMetaSocialLiveChannel(channel.id, channelRecord[channel.id]),
  ])) as Record<MetaSocialLiveChannelId, MetaSocialLiveChannelSnapshot>;
  const enabled = Object.values(channels).filter((channel) => channel.enabled);
  const ready = enabled.filter((channel) => channel.status === "ready");
  const blocked = enabled.filter((channel) => channel.status === "blocked");

  return {
    status: readMetaLiveActivationStatus(record.status, enabled.length, ready.length, blocked.length),
    appLiveModeConfirmed: record.appLiveModeConfirmed === true || record.app_live_mode_confirmed === true,
    updatedAt: readMetadataString(record.updatedAt ?? record.updated_at) ?? "",
    updatedBy: readMetadataString(record.updatedBy ?? record.updated_by),
    enabledChannels: readMetadataNumber(record.enabledChannels ?? record.enabled_channels) || enabled.length,
    readyChannels: readMetadataNumber(record.readyChannels ?? record.ready_channels) || ready.length,
    blockedChannels: readMetadataNumber(record.blockedChannels ?? record.blocked_channels) || blocked.length,
    channels,
  };
}

function readMetaSocialLiveChannel(channel: MetaSocialLiveChannelId, value: unknown): MetaSocialLiveChannelSnapshot {
  const record = readRecord(value);
  const enabled = record.enabled === true;

  return {
    channel,
    enabled,
    status: readMetaLiveChannelStatus(record.status, enabled),
    detail: readMetadataString(record.detail) ?? (enabled ? "Canal aguardando nova validacao live." : "Canal mantido em dry-run operacional."),
    requiredPermissions: readMetadataStringArray(record.requiredPermissions ?? record.required_permissions),
    missingPermissions: readMetadataStringArray(record.missingPermissions ?? record.missing_permissions),
    missingAssets: readMetadataStringArray(record.missingAssets ?? record.missing_assets),
    warnings: readMetadataStringArray(record.warnings),
    activatedAt: readMetadataString(record.activatedAt ?? record.activated_at),
    activatedBy: readMetadataString(record.activatedBy ?? record.activated_by),
  };
}

function readMetaReviewTest(value: unknown): MetaReviewSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const results = Array.isArray(record.results)
    ? record.results.map(readMetaReviewResult).filter((item): item is ReviewTestResult => Boolean(item))
    : [];

  return {
    ranAt: readMetadataString(record.ran_at),
    ok: record.ok === true,
    readiness: readMetaReviewReadiness(record.readiness),
    results,
  };
}

function readMetaReviewResult(value: unknown): ReviewTestResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = readMetadataString(record.id);
  const label = readMetadataString(record.label);
  const permission = readMetadataString(record.permission);
  const detail = readMetadataString(record.detail);

  if (!id || !label || !permission || !detail) {
    return null;
  }

  return {
    id,
    label,
    ok: record.ok === true,
    permission,
    permissions: readMetadataStringArray(record.permissions),
    status: typeof record.status === "number" ? record.status : null,
    detail,
    endpoint: readMetadataString(record.endpoint) ?? "unknown",
    surface: readMetadataString(record.surface) ?? undefined,
    severity: readMetadataString(record.severity) ?? undefined,
    action: readMetadataString(record.action) ?? undefined,
  };
}

function readMetaReviewReadiness(value: unknown): MetaReviewSnapshot["readiness"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const status = readMetadataString(record.status);

  if (status !== "ready" && status !== "warning" && status !== "blocked") {
    return null;
  }

  return {
    status,
    total: readMetadataNumber(record.total),
    ready: readMetadataNumber(record.ready),
    warning: readMetadataNumber(record.warning),
    blocked: readMetadataNumber(record.blocked),
    generatedAt: readMetadataString(record.generatedAt) ?? readMetadataString(record.generated_at) ?? "",
  };
}

function readMetaWebhookActivation(value: unknown): MetaWebhookActivationSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const pageId = readMetadataString(record.pageId ?? record.page_id);
  const detail = readMetadataString(record.detail);
  const activatedAt = readMetadataString(record.activatedAt ?? record.activated_at);

  if (!pageId || !detail || !activatedAt) {
    return null;
  }

  return {
    ok: record.ok === true,
    pageId,
    requestedFields: readMetadataStringArray(record.requestedFields ?? record.requested_fields),
    subscribedFields: readMetadataStringArray(record.subscribedFields ?? record.subscribed_fields),
    missingFields: readMetadataStringArray(record.missingFields ?? record.missing_fields),
    endpoint: readMetadataString(record.endpoint) ?? "unknown",
    httpStatus: typeof record.httpStatus === "number"
      ? record.httpStatus
      : typeof record.http_status === "number"
        ? record.http_status
        : null,
    detail,
    activatedAt,
    instagramAppDashboardRequired: record.instagramAppDashboardRequired === true || record.instagram_app_dashboard_required === true,
  };
}

function readMetaWebhookSimulation(value: unknown): MetaWebhookSimulationSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const scenario = readMetaWebhookScenario(record.scenario);
  const assetId = readMetadataString(record.assetId ?? record.asset_id);
  const simulatedAt = readMetadataString(record.simulatedAt ?? record.simulated_at);
  const detail = readMetadataString(record.detail);
  const ingest = readMetaWebhookIngest(record.ingest);

  if (!scenario || !assetId || !simulatedAt || !detail || !ingest) {
    return null;
  }

  return {
    scenario,
    assetId,
    simulatedAt,
    detail,
    ingest,
  };
}

function readMetaWebhookScenario(value: unknown): MetaWebhookSimulationScenario | null {
  if (
    value === "facebook_comment"
    || value === "facebook_messenger"
    || value === "instagram_comment"
    || value === "instagram_direct"
  ) {
    return value;
  }

  return null;
}

function readMetaWebhookIngest(value: unknown): MetaWebhookIngestSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  return {
    received: readMetadataNumber(record.received),
    stored: readMetadataNumber(record.stored),
    normalized: readMetadataNumber(record.normalized),
    ignored: readMetadataNumber(record.ignored),
    failed: readMetadataNumber(record.failed),
    unmapped: readMetadataNumber(record.unmapped),
  };
}

function readMetadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readMetadataStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readMetaLiveActivationStatus(
  value: unknown,
  enabled: number,
  ready: number,
  blocked: number,
): MetaSocialLiveActivationSnapshot["status"] {
  if (value === "ready" || value === "blocked" || value === "partially_ready" || value === "disabled") {
    return value;
  }

  if (enabled === 0) return "disabled";
  if (blocked > 0 && ready > 0) return "partially_ready";
  if (blocked > 0) return "blocked";
  return "ready";
}

function readMetaLiveChannelStatus(value: unknown, enabled: boolean): MetaSocialLiveChannelSnapshot["status"] {
  if (!enabled) return "disabled";
  if (value === "ready" || value === "blocked") return value;
  return "blocked";
}

function readMetadataOptions(value: unknown): GuidedSelectionOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const id = readMetadataString(record.id);

    if (!id) {
      return [];
    }

    return [{
      id,
      label: readMetadataString(record.label) ?? id,
    }];
  });
}

function normalizeGoogleCustomerId(value: string | null) {
  return value?.replace(/^customers\//, "").replace(/\D/g, "") || "";
}

function normalizeMetaAdAccountId(value: string | null) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed.replace(/^act_/, "")}`;
}

function getMetaLiveActivationTone(status: MetaSocialLiveActivationSnapshot["status"] | "disabled"): "green" | "amber" | "rose" | "zinc" {
  if (status === "ready") return "green";
  if (status === "blocked") return "rose";
  if (status === "partially_ready") return "amber";
  return "zinc";
}

function formatMetaLiveActivationStatus(status: MetaSocialLiveActivationSnapshot["status"] | "disabled") {
  if (status === "ready") return "live pronto";
  if (status === "partially_ready") return "live parcial";
  if (status === "blocked") return "bloqueado";
  return "dry-run";
}

function formatMetaLiveChannelStatus(status: MetaSocialLiveChannelSnapshot["status"]) {
  if (status === "ready") return "pronto";
  if (status === "blocked") return "bloqueado";
  return "dry-run";
}

function metaLiveChannelStatusClass(status: MetaSocialLiveChannelSnapshot["status"]) {
  if (status === "ready") return "text-emerald-300";
  if (status === "blocked") return "text-rose-300";
  return "text-slate-500";
}

function getMetaCanaryTone(status: MetaSocialCanarySnapshot["status"]): "green" | "amber" | "rose" {
  if (status === "sent") return "green";
  if (status === "failed") return "rose";
  return "amber";
}

function formatMetaCanaryStatus(status: MetaSocialCanarySnapshot["status"]) {
  if (status === "sent") return "enviado";
  if (status === "blocked") return "bloqueado";
  if (status === "failed") return "falhou";
  return "sem envio";
}

function metaCanaryStatusClass(status: MetaSocialCanarySnapshot["status"]) {
  if (status === "sent") return "text-emerald-300";
  if (status === "failed") return "text-rose-300";
  return "text-amber-300";
}

function formatMetaMonitorChannel(value: MetaWebhookMonitorChannel | null) {
  switch (value) {
    case "facebook_comments":
      return "Comentarios Facebook";
    case "facebook_messenger":
      return "Messenger Facebook";
    case "instagram_comments":
      return "Comentarios Instagram";
    case "instagram_direct":
      return "Direct Instagram";
    default:
      return "Meta desconhecido";
  }
}

function formatMetaMonitorStatus(value: MetaWebhookMonitorStatus) {
  if (value === "processed") return "ok";
  if (value === "ignored") return "ignorado";
  if (value === "failed") return "falha";
  return "recebido";
}

function metaMonitorStatusClass(value: MetaWebhookMonitorStatus) {
  if (value === "processed") return "border-emerald-300/20 bg-emerald-300/10 text-emerald-200";
  if (value === "failed") return "border-rose-300/20 bg-rose-300/10 text-rose-200";
  if (value === "ignored") return "border-slate-300/20 bg-slate-300/10 text-slate-300";
  return "border-amber-300/20 bg-amber-300/10 text-amber-200";
}

function formatShortDate(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

function formatMetaWebhookScenario(value: MetaWebhookSimulationScenario) {
  return metaWebhookSimulationScenarios.find((scenario) => scenario.id === value)?.label ?? value;
}
