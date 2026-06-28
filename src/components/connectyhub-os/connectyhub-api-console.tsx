"use client";

import Image from "next/image";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  KeyRound,
  MessageCircle,
  PlugZap,
  RadioTower,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminGatewayState } from "@/lib/connectyhub-api/gateway";
import type { StatusTone, Tone } from "@/lib/connectyhub-os-data";
import { ConnectyShell } from "./connecty-shell";
import { DataTable, NeonBadge, PageHeader, Panel, StatusBadge } from "./panel-primitives";

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
  secret?: string;
};

type ActionResponse = {
  ok?: boolean;
  secret?: string;
  error?: {
    message?: string;
  };
};

const webhookEventGroups = [
  {
    title: "Essenciais",
    events: [
      { value: "messages", label: "Mensagens", defaultChecked: true },
      { value: "messages_update", label: "Atualizacoes", defaultChecked: true },
      { value: "connection", label: "Conexao", defaultChecked: true },
    ],
  },
  {
    title: "CRM",
    events: [
      { value: "chats", label: "Conversas" },
      { value: "contacts", label: "Contatos" },
      { value: "history", label: "Historico" },
    ],
  },
  {
    title: "Avancados",
    events: [
      { value: "presence", label: "Presenca" },
      { value: "groups", label: "Grupos" },
      { value: "labels", label: "Etiquetas" },
      { value: "chat_labels", label: "Etiquetas do chat" },
      { value: "newsletter_messages", label: "Newsletters/canais" },
    ],
  },
  {
    title: "Operacao",
    events: [
      { value: "call", label: "Chamadas" },
      { value: "blocks", label: "Bloqueios" },
      { value: "sender", label: "Campanhas" },
    ],
  },
];

type AdminApiTab = "overview" | "clients" | "instances" | "webhooks" | "provider" | "settings";
type AdminDelivery = AdminGatewayState["deliveries"][number];
type AdminProviderEvent = AdminGatewayState["providerEvents"][number];
type AdminUsageEvent = AdminGatewayState["usage"][number];
type FilterOption = { value: string; label: string };

const adminApiTabs: Array<{ id: AdminApiTab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Visao geral", icon: Activity },
  { id: "clients", label: "Empresas", icon: PlugZap },
  { id: "instances", label: "Instancias", icon: MessageCircle },
  { id: "webhooks", label: "Webhooks", icon: Send },
  { id: "provider", label: "Provedor", icon: RadioTower },
  { id: "settings", label: "Configuracao", icon: KeyRound },
];

const diagnosticStatusOptions: FilterOption[] = [
  { value: "all", label: "Todos" },
  { value: "issues", label: "Com erro" },
  { value: "ok", label: "OK" },
  { value: "missing", label: "Sem entrega" },
];

const deliveryStatusOptions: FilterOption[] = [
  { value: "all", label: "Todos" },
  { value: "error", label: "Erros" },
  { value: "failed", label: "Failed" },
  { value: "queued", label: "Queued" },
  { value: "delivered", label: "Delivered" },
];

const providerEventStatusOptions: FilterOption[] = [
  { value: "all", label: "Todos" },
  { value: "error", label: "Erros" },
  { value: "processed", label: "Processados" },
  { value: "pending", label: "Pendentes" },
];

const usageStatusOptions: FilterOption[] = [
  { value: "all", label: "Todos" },
  { value: "error", label: "Erros" },
  { value: "ok", label: "OK" },
];

export function ConnectyHubApiConsole({
  state,
  userLabel = "CEO_HUMAN_ADM",
}: {
  state: AdminGatewayState;
  userLabel?: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeTab, setActiveTab] = useState<AdminApiTab>("overview");
  const [diagnosticQuery, setDiagnosticQuery] = useState("");
  const [diagnosticStatus, setDiagnosticStatus] = useState("all");
  const [deliveryQuery, setDeliveryQuery] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("all");
  const [providerEventQuery, setProviderEventQuery] = useState("");
  const [providerEventStatus, setProviderEventStatus] = useState("all");
  const [usageQuery, setUsageQuery] = useState("");
  const [usageStatus, setUsageStatus] = useState("all");
  const clientsById = useMemo(() => new Map(state.clients.map((client) => [client.id, client])), [state.clients]);
  const keysByClient = useMemo(() => groupBy(state.keys, (key) => key.clientId), [state.keys]);
  const endpointsByClient = useMemo(() => groupBy(state.endpoints, (endpoint) => endpoint.clientId), [state.endpoints]);
  const instancesByClient = useMemo(() => groupBy(state.instances, (instance) => instance.apiClientId ?? "internal"), [state.instances]);
  const latestProviderEventByOrg = useMemo(() => latestBy(state.providerEvents, (event) => event.organizationId), [state.providerEvents]);
  const latestDeliveryByClient = useMemo(() => latestBy(state.deliveries, (delivery) => delivery.clientId), [state.deliveries]);
  const clientsUsingApi = useMemo(() => {
    const clientIds = new Set<string>();
    state.keys.forEach((key) => clientIds.add(key.clientId));
    state.endpoints.forEach((endpoint) => clientIds.add(endpoint.clientId));
    state.instances.forEach((instance) => {
      if (instance.apiClientId) clientIds.add(instance.apiClientId);
    });
    return state.clients.filter((client) => clientIds.has(client.id));
  }, [state.clients, state.endpoints, state.instances, state.keys]);
  const providerInstancesAvailableForApi = state.providerInstances.filter((instance) => instance.availableForApi);
  const filteredDiagnosticClients = useMemo(() => {
    const query = normalizeSearch(diagnosticQuery);

    return clientsUsingApi.filter((client) => {
      const latestEvent = latestProviderEventByOrg.get(client.organizationId);
      const latestDelivery = latestDeliveryByClient.get(client.id);
      const endpoint = endpointsByClient.get(client.id)?.find((item) => item.status === "active") ?? endpointsByClient.get(client.id)?.[0] ?? null;
      const hasIssue = hasDeliveryIssue(latestDelivery) || hasProviderEventIssue(latestEvent) || !endpoint || !latestDelivery;
      const isOk = Boolean(endpoint && latestDelivery?.status === "delivered" && !hasProviderEventIssue(latestEvent));
      const statusMatch =
        diagnosticStatus === "all"
        || (diagnosticStatus === "issues" && hasIssue)
        || (diagnosticStatus === "ok" && isOk)
        || (diagnosticStatus === "missing" && (!endpoint || !latestDelivery));

      return statusMatch && matchesQuery(query, [
        client.name,
        client.organization?.name,
        latestEvent?.eventType,
        latestEvent?.processingStatus,
        latestEvent?.errorMessage,
        latestDelivery?.status,
        latestDelivery?.statusCode,
        latestDelivery?.errorMessage,
        latestDelivery?.targetUrl,
        endpoint?.url,
      ]);
    });
  }, [clientsUsingApi, diagnosticQuery, diagnosticStatus, endpointsByClient, latestDeliveryByClient, latestProviderEventByOrg]);
  const filteredDeliveries = useMemo(() => {
    const query = normalizeSearch(deliveryQuery);

    return state.deliveries.filter((delivery) => {
      const client = delivery.clientId ? clientsById.get(delivery.clientId) : null;
      const statusMatch =
        deliveryStatus === "all"
        || delivery.status === deliveryStatus
        || (deliveryStatus === "error" && hasDeliveryIssue(delivery));

      return statusMatch && matchesQuery(query, [
        client?.name,
        client?.organization?.name,
        delivery.eventType,
        delivery.status,
        delivery.statusCode,
        delivery.targetUrl,
        delivery.errorMessage,
        delivery.responsePreview,
        delivery.webhookEventId,
        delivery.whatsappInstanceId,
      ]);
    });
  }, [clientsById, deliveryQuery, deliveryStatus, state.deliveries]);
  const filteredProviderEvents = useMemo(() => {
    const query = normalizeSearch(providerEventQuery);

    return state.providerEvents.filter((event) => {
      const client = state.clients.find((item) => item.organizationId === event.organizationId);
      const statusMatch =
        providerEventStatus === "all"
        || (providerEventStatus === "error" && hasProviderEventIssue(event))
        || (providerEventStatus === "processed" && isProviderEventProcessed(event))
        || (providerEventStatus === "pending" && !hasProviderEventIssue(event) && !isProviderEventProcessed(event));

      return statusMatch && matchesQuery(query, [
        client?.name,
        client?.organization?.name,
        event.eventType,
        event.processingStatus,
        event.errorMessage,
        event.providerInstanceId,
        event.whatsappInstanceId,
        event.providerMessageId,
        event.providerChatId,
      ]);
    });
  }, [providerEventQuery, providerEventStatus, state.clients, state.providerEvents]);
  const filteredUsage = useMemo(() => {
    const query = normalizeSearch(usageQuery);

    return state.usage.filter((event) => {
      const client = event.clientId ? clientsById.get(event.clientId) : null;
      const statusMatch =
        usageStatus === "all"
        || (usageStatus === "error" && hasUsageIssue(event))
        || (usageStatus === "ok" && !hasUsageIssue(event));

      return statusMatch && matchesQuery(query, [
        client?.name,
        event.method,
        event.endpoint,
        event.provider,
        event.statusCode,
        event.providerStatus,
        event.unitType,
      ]);
    });
  }, [clientsById, state.usage, usageQuery, usageStatus]);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const action = String(formData.get("action") ?? "");
    const payload: Record<string, unknown> = { action };

    for (const [key, value] of formData.entries()) {
      if (key !== "action" && key !== "events" && typeof value === "string" && value.trim()) {
        payload[key] = value.trim();
      }
    }

    const events = formData.getAll("events").filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (events.length > 0) {
      payload.events = events;
    }

    setRunning(action);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/connectyhub-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error?.message ?? "Acao nao concluida.");
      }

      setNotice({
        tone: "success",
        message: successMessage(action),
        secret: data.secret,
      });
      form.reset();
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado.",
      });
    } finally {
      setRunning(null);
    }
  }

  async function runAction(actionKey: string, payload: Record<string, unknown>) {
    setRunning(actionKey);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/connectyhub-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error?.message ?? "Acao nao concluida.");
      }

      setNotice({
        tone: "success",
        message: successMessage(String(payload.action ?? actionKey)),
      });
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado.",
      });
    } finally {
      setRunning(null);
    }
  }

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={userLabel} activeHref="/admin/api-whatsapp">
      <PageHeader
        eyebrow="ConnectyHub API / WhatsApp Gateway"
        title="API WhatsApp ConnectyHub"
        description="Controle de empresas com acesso a API, clientes em uso, chaves, webhooks e instancias adotadas."
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone="green">{state.summary.activeClients} empresas com acesso</NeonBadge>
            <NeonBadge tone="amber">{clientsUsingApi.length} usando API</NeonBadge>
            <NeonBadge tone="cyan">{state.summary.connectedApiInstances} instancias conectadas</NeonBadge>
          </div>
        }
      />

      {state.warnings.length > 0 && (
        <Panel className="mb-5" title="Avisos do gateway" eyebrow="schema / provedor">
          <ul className="space-y-2 text-[13px] leading-6 text-amber-200">
            {state.warnings.slice(0, 6).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Panel>
      )}

      {notice && (
        <Panel className="mb-5" title={notice.tone === "error" ? "Falha na acao" : "Acao concluida"} eyebrow="admin api">
          <div className="space-y-3">
            <NeonBadge tone={notice.tone === "error" ? "rose" : notice.tone === "warning" ? "amber" : "green"}>
              {notice.message}
            </NeonBadge>
            {notice.secret && (
              <div className="rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
                <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">chave exibida uma unica vez</p>
                <code className="mt-2 block break-all font-mono text-[12px] text-cyan-200">{notice.secret}</code>
              </div>
            )}
          </div>
        </Panel>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricTile icon={PlugZap} label="Empresas com acesso" value={String(state.summary.clients)} detail={`${state.summary.activeClients} ativas`} tone="cyan" />
        <MetricTile icon={KeyRound} label="Usando API" value={String(clientsUsingApi.length)} detail={`${state.summary.activeKeys} chaves ativas`} tone="green" />
        <MetricTile icon={MessageCircle} label="Instancias API" value={String(state.summary.apiInstances)} detail={`${state.summary.connectedApiInstances} conectadas`} tone="green" />
        <MetricTile icon={RadioTower} label="Provedor" value={String(state.summary.providerInstances)} detail={`${state.summary.unmappedProviderInstances} disponiveis p/ API`} tone="amber" />
        <MetricTile icon={Activity} label="24h" value={String(state.summary.requests24h)} detail="requests API" tone="violet" />
        <MetricTile icon={Send} label="Webhooks 24h" value={String(state.summary.webhookDeliveries24h)} detail={`${state.summary.webhookFailures24h} falhas`} tone={state.summary.webhookFailures24h > 0 ? "amber" : "cyan"} />
      </div>

      <div className="mb-5 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2 rounded-2xl border border-slate-800 bg-slate-950/45 p-1">
          {adminApiTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                className={`flex h-10 items-center gap-2 rounded-xl px-4 font-mono text-[10px] uppercase tracking-widest transition ${
                  selected
                    ? "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/40"
                    : "text-slate-500 hover:bg-slate-900 hover:text-slate-200"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.id === "webhooks" && state.summary.webhookFailures24h > 0 && (
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] text-amber-200">
                    {state.summary.webhookFailures24h}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-5">
          {activeTab === "clients" && (
            <Panel title="Empresas com acesso a API" eyebrow="empresa / acesso / uso real">
            {state.clients.length > 0 ? (
              <ScrollableTable>
                <DataTable
                  columns={["Empresa", "Acesso", "Uso API", "Chaves", "Instancias API", "Webhooks", "Plano"]}
                  rows={state.clients.map((client) => {
                    const keyCount = keysByClient.get(client.id)?.length ?? 0;
                    const instanceCount = instancesByClient.get(client.id)?.length ?? 0;
                    const webhookCount = endpointsByClient.get(client.id)?.length ?? 0;
                    const inUse = keyCount > 0 || instanceCount > 0 || webhookCount > 0;

                    return [
                      <IdentityCell key="client" title={client.organization?.name ?? client.name} subtitle={client.name} icon={PlugZap} />,
                      <StatusBadge key="status" status={client.status === "active" ? "online" : client.status === "paused" ? "warning" : "idle"} label={client.status} />,
                      <StatusBadge key="usage" status={inUse ? "online" : "idle"} label={inUse ? "cliente API" : "sem uso"} />,
                      <TextCell key="keys" value={String(keyCount)} muted="chaves" />,
                      <TextCell key="instances" value={String(instanceCount)} muted="instancias" />,
                      <TextCell key="hooks" value={String(webhookCount)} muted="webhooks" />,
                      <NeonBadge key="plan" tone="cyan">{client.planCode ?? "api_starter"}</NeonBadge>,
                    ];
                  })}
                />
              </ScrollableTable>
            ) : (
              <EmptyCopy title="Nenhuma empresa com acesso a API" text="Todo workspace ConnectyHub deve receber acesso automaticamente." />
            )}
            </Panel>
          )}

          {activeTab === "instances" && (
            <Panel title="Instancias controladas pela API" eyebrow="connectyhub_instance_id / provider_instance_id">
            {state.instances.filter((instance) => instance.apiClientId).length > 0 ? (
              <ScrollableTable>
                <DataTable
                  columns={["Empresa", "Instancia", "Status", "Numero", "Webhook", "Ultimo sinal"]}
                  rows={state.instances.filter((instance) => instance.apiClientId).map((instance) => {
                    const client = instance.apiClientId ? clientsById.get(instance.apiClientId) : null;
                    return [
                      <TextCell key="client" value={client?.name ?? "Sem cliente"} muted={client?.organization?.name ?? instance.organization?.name ?? instance.organizationId} />,
                      <InstanceIdentityCell
                        key="id"
                        title={instance.displayName ?? instance.providerInstanceId ?? instance.id}
                        subtitle={instance.id}
                        imageUrl={instance.profileImageUrl}
                        imageStatus={instance.profileImageUrl ? "foto sincronizada" : "foto pendente"}
                      />,
                      <StatusBadge key="status" status={instanceTone(instance.status)} label={instance.status} />,
                      <TextCell key="phone" value={instance.phoneNumber ?? "Sem numero"} muted={instance.providerInstanceId ?? "sem provider id"} />,
                      <StatusBadge key="webhook" status={instance.webhookConfigured ? "online" : "warning"} label={instance.webhookConfigured ? "ok" : "pendente"} />,
                      <TextCell key="sync" value={formatDate(instance.lastMessageAt ?? instance.lastHeartbeatAt ?? instance.updatedAt)} muted="sync" />,
                    ];
                  })}
                />
              </ScrollableTable>
            ) : (
              <EmptyCopy title="Nenhuma instancia API vinculada" text="Adote uma instancia existente do provedor ou crie uma instancia nova pela API ConnectyHub." />
            )}
            </Panel>
          )}

          {(activeTab === "overview" || activeTab === "webhooks") && (
            <Panel title="Diagnostico de webhook por cliente" eyebrow="entrada / entrega / resposta">
            {clientsUsingApi.length > 0 ? (
              <div className="space-y-3">
                <TableFilterBar
                  filteredCount={filteredDiagnosticClients.length}
                  options={diagnosticStatusOptions}
                  placeholder="Buscar empresa, evento, URL ou erro"
                  query={diagnosticQuery}
                  status={diagnosticStatus}
                  totalCount={clientsUsingApi.length}
                  onQueryChange={setDiagnosticQuery}
                  onStatusChange={setDiagnosticStatus}
                />
                {filteredDiagnosticClients.length > 0 ? (
                  <ScrollableTable>
                    <DataTable
                      columns={["Empresa", "Entrada ConnectyHub", "Entrega cliente", "HTTP", "Acoes"]}
                      rows={filteredDiagnosticClients.map((client) => {
                        const latestEvent = latestProviderEventByOrg.get(client.organizationId);
                        const latestDelivery = latestDeliveryByClient.get(client.id);
                        const endpoint = endpointsByClient.get(client.id)?.find((item) => item.status === "active") ?? endpointsByClient.get(client.id)?.[0] ?? null;
                        const retryableDelivery = latestDelivery && latestDelivery.status !== "delivered" ? latestDelivery : null;

                        return [
                          <IdentityCell key="client" title={client.organization?.name ?? client.name} subtitle={client.name} icon={PlugZap} />,
                          <TextCell
                            key="event"
                            value={latestEvent?.eventType ?? "Sem evento"}
                            muted={latestEvent ? `${latestEvent.processingStatus} / ${formatDate(latestEvent.receivedAt)}` : "nenhum webhook recebido"}
                          />,
                          <StatusBadge
                            key="delivery"
                            status={latestDelivery ? deliveryTone(latestDelivery.status) : "idle"}
                            label={latestDelivery ? latestDelivery.status : "sem entrega"}
                          />,
                          <TextCell
                            key="http"
                            value={latestDelivery?.statusCode ? String(latestDelivery.statusCode) : "-"}
                            muted={latestDelivery?.errorMessage ?? latestDelivery?.targetUrl ?? endpoint?.url ?? "sem webhook ativo"}
                          />,
                          <div key="actions" className="flex min-w-[120px] flex-wrap gap-2">
                            <InlineActionButton
                              disabled={!endpoint || running === `test_webhook:${endpoint?.id}`}
                              icon={Send}
                              label="Testar"
                              loading={running === `test_webhook:${endpoint?.id}`}
                              onClick={() => {
                                if (!endpoint) return;
                                void runAction(`test_webhook:${endpoint.id}`, { action: "test_webhook", clientId: client.id, webhookId: endpoint.id });
                              }}
                            />
                            <InlineActionButton
                              disabled={!retryableDelivery || running === `retry_delivery:${retryableDelivery?.id}`}
                              icon={RefreshCcw}
                              label="Retry"
                              loading={running === `retry_delivery:${retryableDelivery?.id}`}
                              onClick={() => {
                                if (!retryableDelivery) return;
                                void runAction(`retry_delivery:${retryableDelivery.id}`, { action: "retry_delivery", deliveryId: retryableDelivery.id });
                              }}
                            />
                          </div>,
                        ];
                      })}
                    />
                  </ScrollableTable>
                ) : (
                  <EmptyCopy title="Nenhum resultado nesse filtro" text="Ajuste a busca ou selecione outro status." />
                )}
              </div>
            ) : (
              <EmptyCopy title="Nenhum cliente usando a API" text="Quando houver chave, webhook ou instancia adotada, o diagnostico aparece aqui." />
            )}
            </Panel>
          )}

          {activeTab === "webhooks" && (
            <Panel title="Entregas webhook recentes" eyebrow="cliente / destino / http">
            {state.deliveries.length > 0 ? (
              <div className="space-y-3">
                <TableFilterBar
                  filteredCount={filteredDeliveries.length}
                  options={deliveryStatusOptions}
                  placeholder="Buscar empresa, destino, evento ou mensagem de erro"
                  query={deliveryQuery}
                  status={deliveryStatus}
                  totalCount={state.deliveries.length}
                  onQueryChange={setDeliveryQuery}
                  onStatusChange={setDeliveryStatus}
                />
                {filteredDeliveries.length > 0 ? (
                  <ScrollableTable>
                    <DataTable
                      columns={["Empresa", "Evento", "Destino", "Status", "Erro", "Quando", "Acoes"]}
                      rows={filteredDeliveries.map((delivery) => {
                        const client = delivery.clientId ? clientsById.get(delivery.clientId) : null;

                        return [
                          <TextCell key="client" value={client?.organization?.name ?? client?.name ?? "Sem cliente"} muted={delivery.clientId ?? "sem client id"} />,
                          <TextCell key="event" value={delivery.eventType} muted={delivery.webhookEventId ?? delivery.whatsappInstanceId ?? "evento manual"} />,
                          <TextCell key="target" value={delivery.targetUrl} muted={delivery.endpointId ?? "sem endpoint"} />,
                          <StatusBadge key="status" status={deliveryTone(delivery.status)} label={delivery.statusCode ? `${delivery.status} ${delivery.statusCode}` : delivery.status} />,
                          <TextCell key="error" value={delivery.errorMessage ?? "Sem erro"} muted={delivery.responsePreview ?? `${delivery.attemptCount} tentativa(s)`} />,
                          <TextCell key="date" value={formatDate(delivery.deliveredAt ?? delivery.createdAt)} muted={delivery.deliveredAt ? "entregue" : "criado"} />,
                          <InlineActionButton
                            key="retry"
                            disabled={delivery.status === "delivered" || running === `retry_delivery:${delivery.id}`}
                            icon={RefreshCcw}
                            label="Retry"
                            loading={running === `retry_delivery:${delivery.id}`}
                            onClick={() => void runAction(`retry_delivery:${delivery.id}`, { action: "retry_delivery", deliveryId: delivery.id })}
                          />,
                        ];
                      })}
                    />
                  </ScrollableTable>
                ) : (
                  <EmptyCopy title="Nenhuma entrega nesse filtro" text="Ajuste a busca ou selecione outro status." />
                )}
              </div>
            ) : (
              <EmptyCopy title="Sem entregas registradas" text="Quando a ConnectyHub receber evento do WhatsApp e enviar ao cliente API, a entrega aparece aqui." />
            )}
            </Panel>
          )}

          {activeTab === "webhooks" && (
            <Panel title="Eventos recebidos do provedor" eyebrow="provedor / entrada / processamento">
            {state.providerEvents.length > 0 ? (
              <div className="space-y-3">
                <TableFilterBar
                  filteredCount={filteredProviderEvents.length}
                  options={providerEventStatusOptions}
                  placeholder="Buscar empresa, evento, instancia ou erro"
                  query={providerEventQuery}
                  status={providerEventStatus}
                  totalCount={state.providerEvents.length}
                  onQueryChange={setProviderEventQuery}
                  onStatusChange={setProviderEventStatus}
                />
                {filteredProviderEvents.length > 0 ? (
                  <ScrollableTable>
                    <DataTable
                      columns={["Empresa", "Evento", "Instancia", "Status", "Quando"]}
                      rows={filteredProviderEvents.map((event) => {
                        const client = state.clients.find((item) => item.organizationId === event.organizationId);

                        return [
                          <TextCell key="client" value={client?.organization?.name ?? client?.name ?? "Sem cliente API"} muted={event.organizationId ?? "sem organizacao"} />,
                          <TextCell key="event" value={event.eventType} muted={event.providerMessageId ?? event.providerChatId ?? event.provider} />,
                          <TextCell key="instance" value={event.providerInstanceId ?? "Sem provider id"} muted={event.whatsappInstanceId ?? "sem instancia local"} />,
                          <StatusBadge key="status" status={providerEventTone(event.processingStatus)} label={event.processingStatus} />,
                          <TextCell key="date" value={formatDate(event.receivedAt)} muted={event.errorMessage ?? "recebido"} />,
                        ];
                      })}
                    />
                  </ScrollableTable>
                ) : (
                  <EmptyCopy title="Nenhum evento nesse filtro" text="Ajuste a busca ou selecione outro status." />
                )}
              </div>
            ) : (
              <EmptyCopy title="Sem eventos recebidos" text="Assim que o provedor enviar eventos para a ConnectyHub, eles aparecem aqui." />
            )}
            </Panel>
          )}

          {activeTab === "provider" && (
            <Panel title="Instancias do provedor disponiveis para API" eyebrow="adocao / controle / origem">
            {providerInstancesAvailableForApi.length > 0 ? (
              <ScrollableTable>
                <DataTable
                  columns={["WhatsApp", "Status", "Numero", "Token", "ConnectyHub"]}
                  rows={providerInstancesAvailableForApi.map((instance) => [
                    <InstanceIdentityCell
                      key="provider"
                      title={instance.name ?? instance.phoneNumber ?? instance.providerInstanceId}
                      subtitle={instance.providerInstanceId}
                      imageUrl={instance.profileImageUrl}
                      imageStatus={profileImageStatusLabel(instance.profileImageStatus)}
                    />,
                    <StatusBadge key="status" status={instanceTone(instance.status)} label={instance.status} />,
                    <TextCell key="phone" value={instance.phoneNumber ?? "Sem numero"} muted="owner" />,
                    <StatusBadge key="token" status={instance.tokenPresent ? "online" : "warning"} label={instance.tokenPresent ? "token" : "sem token"} />,
                    <StatusBadge key="local" status="idle" label="disponivel" />,
                  ])}
                />
              </ScrollableTable>
            ) : (
              <EmptyCopy title="Nenhuma instancia livre para API" text="Instancias ja usadas no painel normal da ConnectyHub ficam fora da adocao API." />
            )}
            </Panel>
          )}

          {(activeTab === "overview" || activeTab === "provider") && (
            <Panel title="Uso recente da API" eyebrow="requests / status / provedor">
            {state.usage.length > 0 ? (
              <div className="space-y-3">
                <TableFilterBar
                  filteredCount={filteredUsage.length}
                  options={usageStatusOptions}
                  placeholder="Buscar empresa, endpoint, metodo ou provedor"
                  query={usageQuery}
                  status={usageStatus}
                  totalCount={state.usage.length}
                  onQueryChange={setUsageQuery}
                  onStatusChange={setUsageStatus}
                />
                {filteredUsage.length > 0 ? (
                  <ScrollableTable>
                    <DataTable
                      columns={["Empresa", "Endpoint", "Status", "Unidade", "Quando"]}
                      rows={filteredUsage.map((event) => {
                        const client = event.clientId ? clientsById.get(event.clientId) : null;
                        return [
                          <TextCell key="client" value={client?.name ?? "Sem cliente"} muted={event.method} />,
                          <TextCell key="endpoint" value={event.endpoint} muted={event.provider ?? "gateway"} />,
                          <StatusBadge key="status" status={(event.statusCode ?? 500) < 400 ? "online" : "critical"} label={String(event.statusCode ?? "-")} />,
                          <TextCell key="unit" value={event.unitType} muted={String(event.quantity)} />,
                          <TextCell key="date" value={formatDate(event.createdAt)} muted="request" />,
                        ];
                      })}
                    />
                  </ScrollableTable>
                ) : (
                  <EmptyCopy title="Nenhum uso nesse filtro" text="Ajuste a busca ou selecione outro status." />
                )}
              </div>
            ) : (
              <EmptyCopy title="Sem uso registrado" text="As chamadas feitas em /api/v1 vao aparecer aqui." />
            )}
            </Panel>
          )}
        </div>

        {activeTab === "settings" && (
          <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          <Panel title="Garantir acesso a API" eyebrow="empresa / produto">
            <form className="space-y-3" onSubmit={submitForm}>
              <input name="action" type="hidden" value="create_client" />
              <Field label="Empresa">
                <select name="organizationId" required className={inputClassName}>
                  <option value="">Selecione</option>
                  {state.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nome tecnico">
                <input name="name" required className={inputClassName} placeholder="Sistema Buffalo Mass" />
              </Field>
              <Field label="Email">
                <input name="contactEmail" className={inputClassName} placeholder="ops@cliente.com" />
              </Field>
              <ActionButton loading={running === "create_client"}>Garantir acesso</ActionButton>
            </form>
          </Panel>

          <Panel title="Gerar chave" eyebrow="bearer token">
            <form className="space-y-3" onSubmit={submitForm}>
              <input name="action" type="hidden" value="create_key" />
              <ClientSelect clients={state.clients} />
              <Field label="Nome da chave">
                <input name="name" className={inputClassName} placeholder="Producao" />
              </Field>
              <ActionButton loading={running === "create_key"}>Gerar chave</ActionButton>
            </form>
          </Panel>

          <Panel title="Webhook do cliente" eyebrow="saida / assinatura">
            <form className="space-y-3" onSubmit={submitForm}>
              <input name="action" type="hidden" value="create_webhook" />
              <ClientSelect clients={state.clients} />
              <Field label="Dominio ou URL publica">
                <input name="url" required className={inputClassName} placeholder="meuprojeto.com.br" />
              </Field>
              <Field label="Descricao">
                <input name="description" className={inputClassName} placeholder="Webhook principal" />
              </Field>
              <WebhookEventPicker />
              <ActionButton loading={running === "create_webhook"}>Criar webhook</ActionButton>
            </form>
          </Panel>

          <Panel title="Adotar instancia do provedor" eyebrow="migracao / controle">
            <form className="space-y-3" onSubmit={submitForm}>
              <input name="action" type="hidden" value="adopt_instance" />
              <ClientSelect clients={state.clients} />
              <Field label="Instancia do provedor">
                <select name="providerInstanceId" required className={inputClassName}>
                  <option value="">Selecione</option>
                  {providerInstancesAvailableForApi.map((instance) => (
                    <option key={instance.providerInstanceId} value={instance.providerInstanceId}>
                      {instance.name ?? instance.providerInstanceId} / {instance.status}
                    </option>
                  ))}
                </select>
              </Field>
              <ActionButton loading={running === "adopt_instance"}>Adotar instancia</ActionButton>
            </form>
          </Panel>

          <Panel title="Endpoints iniciais" eyebrow="api v1">
            <div className="space-y-3">
              {[
                ["POST", "/api/v1/instances"],
                ["POST", "/api/v1/instances/:id/connect"],
                ["GET", "/api/v1/instances/:id/status"],
                ["POST", "/api/v1/messages/text"],
                ["ANY", "/api/v1/provider/*"],
              ].map(([method, endpoint]) => (
                <div key={endpoint} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
                  <NeonBadge tone={method === "POST" ? "green" : method === "GET" ? "cyan" : "violet"}>{method}</NeonBadge>
                  <code className="min-w-0 truncate font-mono text-[11px] text-slate-300">{endpoint}</code>
                </div>
              ))}
            </div>
          </Panel>
          </div>
        )}
      </div>
    </ConnectyShell>
  );
}

function TableFilterBar({
  filteredCount,
  options,
  placeholder,
  query,
  status,
  totalCount,
  onQueryChange,
  onStatusChange,
}: {
  filteredCount: number;
  options: FilterOption[];
  placeholder: string;
  query: string;
  status: string;
  totalCount: number;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/30 p-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
        <input
          className={`${inputClassName} pl-9`}
          placeholder={placeholder}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <select className={`${inputClassName} min-w-[150px]`} value={status} onChange={(event) => onStatusChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <NeonBadge tone={filteredCount === totalCount ? "cyan" : "amber"}>{filteredCount}/{totalCount}</NeonBadge>
      </div>
    </div>
  );
}

function ScrollableTable({ children }: { children: ReactNode }) {
  return (
    <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-800/80 bg-slate-950/20">
      {children}
    </div>
  );
}

function WebhookEventPicker() {
  return (
    <div className="space-y-3">
      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Eventos</p>
      {webhookEventGroups.map((group) => (
        <div key={group.title} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{group.title}</span>
            <span className="font-mono text-[9px] text-slate-600">{group.events.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {group.events.map((event) => (
              <label key={event.value} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-[12px] text-slate-300">
                <input
                  className="h-3.5 w-3.5 accent-cyan-400"
                  defaultChecked={"defaultChecked" in event && event.defaultChecked === true}
                  name="events"
                  type="checkbox"
                  value={event.value}
                />
                <span className="min-w-0">
                  <span className="block truncate" style={{ color: "var(--ch-text)" }}>{event.label}</span>
                  <span className="block truncate font-mono text-[8px] uppercase tracking-wider text-slate-600">{event.value}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricTile({
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
  tone: Tone;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10">
          <Icon className="h-4 w-4 text-cyan-300" />
        </div>
      </div>
      <p className="mt-3 font-mono text-[26px] font-bold leading-none" style={{ color: "var(--ch-text)" }}>{value}</p>
      <div className="mt-3"><NeonBadge tone={tone}>{detail}</NeonBadge></div>
    </div>
  );
}

function IdentityCell({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon: LucideIcon }) {
  return (
    <div className="flex min-w-[210px] items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
        <p className="truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function InstanceIdentityCell({
  title,
  subtitle,
  imageUrl,
  imageStatus,
}: {
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  imageStatus?: string | null;
}) {
  return (
    <div className="flex min-w-[260px] items-center gap-2.5">
      <WhatsappAvatar fallback={title} imageUrl={imageUrl ?? null} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
        <p className="truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">{subtitle}</p>
        {imageStatus && <p className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-wider text-cyan-500/80">{imageStatus}</p>}
      </div>
    </div>
  );
}

function WhatsappAvatar({ fallback, imageUrl }: { fallback: string; imageUrl: string | null }) {
  return (
    <div
      className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border bg-cyan-400/10 text-cyan-200"
      style={{ borderColor: "var(--ch-border)" }}
      title={imageUrl ? "Foto do WhatsApp conectado" : "Foto pendente"}
    >
      {imageUrl ? (
        <Image alt={`Foto do WhatsApp ${fallback}`} className="object-cover" fill sizes="40px" src={imageUrl} unoptimized />
      ) : (
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest">{getInitials(fallback)}</span>
      )}
    </div>
  );
}

function TextCell({ value, muted }: { value: string; muted?: string | null }) {
  return (
    <div className="min-w-[130px]">
      <p className="truncate text-[12px]" style={{ color: "var(--ch-text)" }}>{value}</p>
      {muted && <p className="mt-1 max-w-[220px] truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">{muted}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ClientSelect({ clients }: { clients: AdminGatewayState["clients"] }) {
  return (
    <Field label="Empresa com acesso">
      <select name="clientId" required className={inputClassName}>
        <option value="">Selecione</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>{client.name}</option>
        ))}
      </select>
    </Field>
  );
}

function ActionButton({ children, loading }: { children: string; loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 font-mono text-[10px] uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/15 disabled:opacity-55"
    >
      {loading ? "Executando..." : children}
    </button>
  );
}

function InlineActionButton({
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
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      title={label}
      className="inline-flex h-8 min-w-20 items-center justify-center gap-1.5 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-2 font-mono text-[9px] uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      <span>{loading ? "..." : label}</span>
    </button>
  );
}

function EmptyCopy({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl p-8 text-center" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
        <ShieldCheck className="h-5 w-5" />
      </div>
      <p className="mt-4 text-[15px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
      <p className="mt-2 max-w-md text-[13px] leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function matchesQuery(query: string, values: Array<string | number | null | undefined>) {
  if (!query) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

function hasDeliveryIssue(delivery: AdminDelivery | null | undefined) {
  if (!delivery) return false;
  return delivery.status === "failed" || Boolean(delivery.errorMessage) || (typeof delivery.statusCode === "number" && delivery.statusCode >= 400);
}

function hasProviderEventIssue(event: AdminProviderEvent | null | undefined) {
  if (!event) return false;
  const status = event.processingStatus.toLowerCase();
  return Boolean(event.errorMessage) || status.includes("fail") || status.includes("error");
}

function isProviderEventProcessed(event: AdminProviderEvent) {
  return ["processed", "completed", "queued", "received"].includes(event.processingStatus);
}

function hasUsageIssue(event: AdminUsageEvent) {
  return (event.statusCode ?? 500) >= 400 || (typeof event.providerStatus === "number" && event.providerStatus >= 400);
}

function instanceTone(status: string): StatusTone {
  if (status === "connected") return "online";
  if (status === "error" || status === "blocked") return "critical";
  if (status === "qr_pending" || status === "draft") return "warning";
  return "idle";
}

function deliveryTone(status: string): StatusTone {
  if (status === "delivered") return "online";
  if (status === "queued") return "warning";
  if (status === "failed") return "critical";
  return "idle";
}

function providerEventTone(status: string): StatusTone {
  if (["processed", "completed", "queued", "received"].includes(status)) return "online";
  if (["failed", "error"].includes(status)) return "critical";
  return "warning";
}

function profileImageStatusLabel(status: string | null | undefined) {
  if (status === "synced") return "foto sincronizada";
  if (status === "not_found") return "sem foto localizada";
  return "foto pendente";
}

function successMessage(action: string) {
  const messages: Record<string, string> = {
    create_client: "API garantida para a empresa.",
    create_key: "Chave API gerada.",
    create_webhook: "Webhook do cliente criado.",
    adopt_instance: "Instancia adotada pela ConnectyHub API.",
    test_webhook: "Teste de webhook registrado.",
    retry_delivery: "Reenvio de webhook registrado.",
  };

  return messages[action] ?? "Acao concluida.";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data invalida";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return (parts.map((part) => part[0]).join("") || "WA").toUpperCase();
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }

  return map;
}

function latestBy<T>(items: T[], getKey: (item: T) => string | null | undefined) {
  const map = new Map<string, T>();

  for (const item of items) {
    const key = getKey(item);
    if (key && !map.has(key)) {
      map.set(key, item);
    }
  }

  return map;
}

const inputClassName =
  "h-9 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 text-[12px] text-slate-100 outline-none transition focus:border-cyan-400";
