"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
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

export function ClientIntegrationsConsole({ state }: { state: ClientIntegrationHubState }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(state.selectedCompanyId ?? state.companies[0]?.id ?? "");
  const [connections, setConnections] = useState(state.connections);
  const [credentialSnapshots, setCredentialSnapshots] = useState(state.credentialSnapshots);
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, string>>({});
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [webhookEndpoints, setWebhookEndpoints] = useState(state.webhookEndpoints);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [connectingMercadoPago, setConnectingMercadoPago] = useState(false);
  const [disconnectingMercadoPago, setDisconnectingMercadoPago] = useState(false);
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
  const webhookConnection = connectionByProvider.get("webhook-universal");
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

    if (!payment) return;

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
    }, 0);

    params.delete("payment");
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
          A Central organiza as conexoes por empresa. Mercado Pago usa autorizacao guiada oficial; Meta e Google usam credenciais de leitura da empresa.
        </div>
      </div>

      {state.companies.length > 0 ? (
        <div className="mb-5 grid gap-3 lg:grid-cols-2">
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3 md:grid-cols-2">
            {state.providers.map((provider) => (
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

          <aside className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Webhook Universal</p>
                  <p className="mt-1 text-[14px] font-semibold text-slate-100">Endpoints da empresa</p>
                </div>
                <PlugZap className="h-5 w-5 text-cyan-300" />
              </div>
              <div className="grid gap-2">
                {selectedEndpoints.length > 0 ? selectedEndpoints.map((endpoint) => (
                  <WebhookEndpointCard key={endpoint.id} endpoint={endpoint} />
                )) : (
                  <div className="rounded-xl border border-dashed px-3 py-5 text-center text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
                    Nenhum endpoint criado para esta empresa.
                  </div>
                )}
              </div>
              {newWebhookSecret ? (
                <SecretBox secret={newWebhookSecret} />
              ) : null}
            </div>
          </aside>
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
    <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
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

function credentialKey(companyId: string, providerId: string, envName: string) {
  return `${companyId}:${providerId}:${envName}`;
}

function getMercadoPagoConnectionErrorMessage(reason: string | null) {
  if (reason === "config") {
    return "Mercado Pago ainda precisa ser configurado no painel admin da ConnectyHub. Depois disso, este botao abre a autorizacao oficial.";
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
