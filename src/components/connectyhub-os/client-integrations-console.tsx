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
  simulation?: MetaWebhookSimulationSnapshot;
  error?: string;
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
            metaWebhookAction={metaWebhookAction}
            savingSelection={savingSelectionProvider === "meta-ads"}
            selectionDraft={guidedSelectionDrafts[guidedSelectionKey(selectedCompanyId, "meta-ads")] ?? {}}
            selectedCompanyId={selectedCompanyId}
            selectedCompanyName={selectedCompany?.name ?? null}
            onActivateMetaWebhooks={() => runMetaWebhookAction("subscribe_page")}
            onConnect={(event) => handleGuidedOAuthConnectClick("meta-ads", event)}
            onDisconnect={() => disconnectGuidedOAuth("meta-ads")}
            onMetaReviewTestResult={handleMetaReviewTestResult}
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
            savingSelection={savingSelectionProvider === "google-growth"}
            selectionDraft={guidedSelectionDrafts[guidedSelectionKey(selectedCompanyId, "google-growth")] ?? {}}
            selectedCompanyId={selectedCompanyId}
            selectedCompanyName={selectedCompany?.name ?? null}
            onConnect={(event) => handleGuidedOAuthConnectClick("google-growth", event)}
            onDisconnect={() => disconnectGuidedOAuth("google-growth")}
            onMetaReviewTestResult={undefined}
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
  metaWebhookAction,
  savingSelection,
  selectionDraft,
  selectedCompanyId,
  selectedCompanyName,
  onActivateMetaWebhooks,
  onConnect,
  onDisconnect,
  onMetaReviewTestResult,
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
  metaWebhookAction?: string | null;
  savingSelection: boolean;
  selectionDraft: GuidedSelectionDraft;
  selectedCompanyId: string;
  selectedCompanyName: string | null;
  onActivateMetaWebhooks?: () => void;
  onConnect: (event: MouseEvent<HTMLAnchorElement>) => void;
  onDisconnect: () => void;
  onMetaReviewTestResult?: (response: ReviewTestResponse) => void;
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
            metaWebhookAction={metaWebhookAction ?? null}
            review={metaReview}
            simulation={metaWebhookSimulation}
            onActivateWebhooks={onActivateMetaWebhooks}
            onReviewResult={onMetaReviewTestResult}
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
  metaWebhookAction,
  review,
  simulation,
  onActivateWebhooks,
  onReviewResult,
  onSimulateWebhook,
}: {
  actionLogs: ClientIntegrationActionLog[];
  activation: MetaWebhookActivationSnapshot | null;
  connected: boolean;
  metaWebhookAction: string | null;
  review: MetaReviewSnapshot | null;
  simulation: MetaWebhookSimulationSnapshot | null;
  onActivateWebhooks?: () => void;
  onReviewResult?: (response: ReviewTestResponse) => void;
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
