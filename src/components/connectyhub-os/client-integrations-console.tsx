"use client";

import { useMemo, useState } from "react";
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
  Send,
  ShieldCheck,
  ShoppingBag,
  Truck,
  WalletCards,
} from "lucide-react";
import type {
  ClientIntegrationConnection,
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
  const [webhookEndpoints, setWebhookEndpoints] = useState(state.webhookEndpoints);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
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
          A Central organiza as conexoes por empresa. Mercado Pago continua no fluxo do Catalogo de Vendas; as novas integracoes entram aqui com status, logs e webhooks.
        </div>
      </div>

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
                creatingWebhook={creatingWebhook}
                provider={provider}
                schemaReady={state.schemaReady}
                onCreateWebhook={createUniversalWebhook}
              />
            ))}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Mercado Pago</p>
                  <p className="mt-1 text-[14px] font-semibold text-slate-100">Fluxo protegido</p>
                </div>
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="space-y-2 text-[12px] leading-5 text-slate-400">
                <p>A Central apenas le o status atual. OAuth, callback, tokens, webhook e checkout seguem no Catalogo de Vendas.</p>
                <Link
                  className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100"
                  href="/dashboard/links"
                  style={{ borderColor: "var(--ch-border)" }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir Catalogo
                </Link>
              </div>
            </div>

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
  schemaReady,
  creatingWebhook,
  onCreateWebhook,
}: {
  provider: ClientIntegrationProvider;
  connection?: ClientIntegrationConnection;
  schemaReady: boolean;
  creatingWebhook: boolean;
  onCreateWebhook: () => void;
}) {
  const Icon = categoryIcons[provider.category];
  const tone = statusTone(connection?.status ?? (provider.status === "active" ? "available" : "planned"));

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
            {provider.protectedFlow ? <NeonBadge tone="green">protegido</NeonBadge> : null}
          </div>
          <h2 className="mt-3 text-[15px] font-semibold leading-5 text-slate-100">{provider.name}</h2>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">{provider.headline}</p>
        </div>
        <StatusBadge status={tone} label={connectionLabel(connection, provider)} />
      </div>

      <p className="text-[12px] leading-5 text-slate-400">{provider.summary}</p>

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
