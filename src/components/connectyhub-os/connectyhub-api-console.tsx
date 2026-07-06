"use client";

import Image from "next/image";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ChevronDown,
  Copy,
  ExternalLink,
  KeyRound,
  MessageCircle,
  PlugZap,
  RadioTower,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminGatewayState } from "@/lib/connectyhub-api/gateway";
import type { StatusTone, Tone } from "@/lib/connectyhub-os-data";
import { normalizeWhatsappInstanceDisplayName } from "@/lib/whatsapp/instance-display-name";
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
  result?: {
    deleted?: boolean;
    providerDeleted?: boolean;
    providerStatus?: number | null;
  };
  error?: {
    message?: string;
  };
};

type MigrationCredentialKind = "serverUrl" | "instanceToken";

type MigrationCredentialResponse = {
  ok?: boolean;
  value?: string;
  notice?: Notice;
  error?: {
    message?: string;
  };
};

const PASSKEY_CONNECTION_HELP_TEXT =
  "Esta conta pediu uma verificacao extra por chave de acesso. Esse tipo de verificacao ainda nao pode ser concluido diretamente pelo QR Code do painel.";
const PASSKEY_MIGRATION_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/cdjfbjfolpeenlmanmkoglhhcjfgcbpp";

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
type AdminGatewayClient = AdminGatewayState["clients"][number];
type AdminGatewayInstance = AdminGatewayState["instances"][number];
type AdminGatewayHealthSummary = NonNullable<AdminGatewayClient["health"]>;
type AdminGatewayHealthSignal = NonNullable<AdminGatewayInstance["health"]>;
type AdminProviderInstance = AdminGatewayState["providerInstances"][number];
type AdminProviderEvent = AdminGatewayState["providerEvents"][number];
type AdminUsageEvent = AdminGatewayState["usage"][number];
type FilterOption = { value: string; label: string };
type AdminApiInstanceGroup = {
  key: string;
  client: AdminGatewayClient | null;
  fallbackTitle: string;
  fallbackSubtitle: string;
  instances: AdminGatewayInstance[];
};
type AdminApiClientItemGroup<T> = {
  key: string;
  client: AdminGatewayClient | null;
  fallbackTitle: string;
  fallbackSubtitle: string;
  items: T[];
};

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

const apiInstanceStatusOptions: FilterOption[] = [
  { value: "all", label: "Todas" },
  { value: "issues", label: "Com atencao" },
  { value: "connected", label: "Conectadas" },
  { value: "disconnected", label: "Desconectadas" },
  { value: "webhook_pending", label: "Webhook pendente" },
];

const apiClientStatusOptions: FilterOption[] = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Ativas" },
  { value: "paused", label: "Pausadas" },
  { value: "inactive", label: "Inativas" },
  { value: "in_use", label: "Em uso" },
  { value: "without_use", label: "Sem uso" },
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
  const [migrationInstance, setMigrationInstance] = useState<AdminGatewayInstance | null>(null);
  const [migrationCopying, setMigrationCopying] = useState<MigrationCredentialKind | null>(null);
  const [activeTab, setActiveTab] = useState<AdminApiTab>("overview");
  const [diagnosticQuery, setDiagnosticQuery] = useState("");
  const [diagnosticStatus, setDiagnosticStatus] = useState("all");
  const [deliveryQuery, setDeliveryQuery] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("all");
  const [providerEventQuery, setProviderEventQuery] = useState("");
  const [providerEventStatus, setProviderEventStatus] = useState("all");
  const [usageQuery, setUsageQuery] = useState("");
  const [usageStatus, setUsageStatus] = useState("all");
  const [apiInstanceQuery, setApiInstanceQuery] = useState("");
  const [apiInstanceStatus, setApiInstanceStatus] = useState("all");
  const [apiClientQuery, setApiClientQuery] = useState("");
  const [apiClientStatus, setApiClientStatus] = useState("all");
  const [apiClientGroupOpenState, setApiClientGroupOpenState] = useState<Record<string, boolean>>({});
  const [apiInstanceGroupOpenState, setApiInstanceGroupOpenState] = useState<Record<string, boolean>>({});
  const [diagnosticGroupOpenState, setDiagnosticGroupOpenState] = useState<Record<string, boolean>>({});
  const [deliveryGroupOpenState, setDeliveryGroupOpenState] = useState<Record<string, boolean>>({});
  const [providerEventGroupOpenState, setProviderEventGroupOpenState] = useState<Record<string, boolean>>({});
  const [usageGroupOpenState, setUsageGroupOpenState] = useState<Record<string, boolean>>({});
  const clientsById = useMemo(() => new Map(state.clients.map((client) => [client.id, client])), [state.clients]);
  const clientsByOrganizationId = useMemo(() => new Map(state.clients.map((client) => [client.organizationId, client])), [state.clients]);
  const keysByClient = useMemo(() => groupBy(state.keys, (key) => key.clientId), [state.keys]);
  const endpointsByClient = useMemo(() => groupBy(state.endpoints, (endpoint) => endpoint.clientId), [state.endpoints]);
  const instancesByClient = useMemo(() => groupBy(state.instances, (instance) => instance.apiClientId ?? "internal"), [state.instances]);
  const filteredApiClients = useMemo(() => {
    const query = normalizeSearch(apiClientQuery);

    return state.clients.filter((client) => {
      const keyCount = keysByClient.get(client.id)?.length ?? 0;
      const instanceCount = instancesByClient.get(client.id)?.length ?? 0;
      const webhookCount = endpointsByClient.get(client.id)?.length ?? 0;
      const inUse = keyCount > 0 || instanceCount > 0 || webhookCount > 0;
      const statusMatch =
        apiClientStatus === "all"
        || client.status === apiClientStatus
        || (apiClientStatus === "inactive" && client.status !== "active" && client.status !== "paused")
        || (apiClientStatus === "in_use" && inUse)
        || (apiClientStatus === "without_use" && !inUse);

      return statusMatch && matchesQuery(query, [
        client.name,
        client.slug,
        client.organization?.name,
        client.planCode,
        client.contactEmail,
        client.status,
      ]);
    });
  }, [apiClientQuery, apiClientStatus, endpointsByClient, instancesByClient, keysByClient, state.clients]);
  const apiInstances = useMemo(() => state.instances.filter((instance) => instance.apiClientId), [state.instances]);
  const filteredApiInstances = useMemo(() => {
    const query = normalizeSearch(apiInstanceQuery);

    return apiInstances.filter((instance) => {
      const client = instance.apiClientId ? clientsById.get(instance.apiClientId) : null;
      const hasIssue = hasApiInstanceIssue(instance);
      const statusMatch =
        apiInstanceStatus === "all"
        || (apiInstanceStatus === "issues" && hasIssue)
        || (apiInstanceStatus === "connected" && instance.status === "connected")
        || (apiInstanceStatus === "disconnected" && instance.status !== "connected")
        || (apiInstanceStatus === "webhook_pending" && !instance.webhookConfigured);

      return statusMatch && matchesQuery(query, [
        client?.name,
        client?.slug,
        client?.organization?.name,
        instance.organization?.name,
        instance.displayName,
        instance.phoneNumber,
        instance.providerInstanceId,
        instance.id,
        instance.status,
      ]);
    });
  }, [apiInstanceQuery, apiInstanceStatus, apiInstances, clientsById]);
  const apiInstanceGroups = useMemo(() => {
    const groups = new Map<string, AdminApiInstanceGroup>();

    for (const instance of filteredApiInstances) {
      const key = instance.apiClientId ?? `organization:${instance.organizationId}`;
      const client = instance.apiClientId ? clientsById.get(instance.apiClientId) ?? null : null;
      const group = groups.get(key) ?? {
        key,
        client,
        fallbackTitle: instance.organization?.name ?? "Empresa sem cadastro",
        fallbackSubtitle: instance.organizationId,
        instances: [],
      };

      group.instances.push(instance);
      groups.set(key, group);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        instances: [...group.instances].sort((a, b) => {
          const statusOrder = Number(b.status === "connected") - Number(a.status === "connected");
          return statusOrder || getAdminInstanceDisplayTitle(a).localeCompare(getAdminInstanceDisplayTitle(b));
        }),
      }))
      .sort((a, b) => getApiInstanceGroupTitle(a).localeCompare(getApiInstanceGroupTitle(b)));
  }, [clientsById, filteredApiInstances]);
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
  const gatewayHealth = useMemo(
    () => summarizeGatewayHealth(state.clients.map((client) => client.health)),
    [state.clients],
  );
  const providerInstancesAvailableForApi = state.providerInstances.filter((instance) => instance.availableForApi);
  const isApiClientGroupOpen = (client: AdminGatewayClient) => {
    if (apiClientQuery.trim() || apiClientStatus !== "all") return true;
    const manualState = apiClientGroupOpenState[client.id];
    if (typeof manualState === "boolean") return manualState;
    return false;
  };
  const toggleApiClientGroup = (client: AdminGatewayClient) => {
    const isOpen = isApiClientGroupOpen(client);
    setApiClientGroupOpenState((current) => ({ ...current, [client.id]: !isOpen }));
  };
  const isApiInstanceGroupOpen = (group: AdminApiInstanceGroup) => {
    if (apiInstanceQuery.trim() || apiInstanceStatus !== "all") return true;
    const manualState = apiInstanceGroupOpenState[group.key];
    if (typeof manualState === "boolean") return manualState;
    return false;
  };
  const toggleApiInstanceGroup = (group: AdminApiInstanceGroup) => {
    const isOpen = isApiInstanceGroupOpen(group);
    setApiInstanceGroupOpenState((current) => ({ ...current, [group.key]: !isOpen }));
  };
  const isDiagnosticGroupOpen = (client: AdminGatewayClient) => {
    if (diagnosticQuery.trim() || diagnosticStatus !== "all") return true;
    const manualState = diagnosticGroupOpenState[client.id];
    if (typeof manualState === "boolean") return manualState;
    return false;
  };
  const toggleDiagnosticGroup = (client: AdminGatewayClient) => {
    const isOpen = isDiagnosticGroupOpen(client);
    setDiagnosticGroupOpenState((current) => ({ ...current, [client.id]: !isOpen }));
  };
  const isDeliveryGroupOpen = (group: AdminApiClientItemGroup<AdminDelivery>) => {
    if (deliveryQuery.trim() || deliveryStatus !== "all") return true;
    const manualState = deliveryGroupOpenState[group.key];
    if (typeof manualState === "boolean") return manualState;
    return false;
  };
  const toggleDeliveryGroup = (group: AdminApiClientItemGroup<AdminDelivery>) => {
    const isOpen = isDeliveryGroupOpen(group);
    setDeliveryGroupOpenState((current) => ({ ...current, [group.key]: !isOpen }));
  };
  const isProviderEventGroupOpen = (group: AdminApiClientItemGroup<AdminProviderEvent>) => {
    if (providerEventQuery.trim() || providerEventStatus !== "all") return true;
    const manualState = providerEventGroupOpenState[group.key];
    if (typeof manualState === "boolean") return manualState;
    return false;
  };
  const toggleProviderEventGroup = (group: AdminApiClientItemGroup<AdminProviderEvent>) => {
    const isOpen = isProviderEventGroupOpen(group);
    setProviderEventGroupOpenState((current) => ({ ...current, [group.key]: !isOpen }));
  };
  const isUsageGroupOpen = (group: AdminApiClientItemGroup<AdminUsageEvent>) => {
    if (usageQuery.trim() || usageStatus !== "all") return true;
    const manualState = usageGroupOpenState[group.key];
    if (typeof manualState === "boolean") return manualState;
    return false;
  };
  const toggleUsageGroup = (group: AdminApiClientItemGroup<AdminUsageEvent>) => {
    const isOpen = isUsageGroupOpen(group);
    setUsageGroupOpenState((current) => ({ ...current, [group.key]: !isOpen }));
  };
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
  const deliveryGroups = useMemo(() => {
    const groups = new Map<string, AdminApiClientItemGroup<AdminDelivery>>();

    for (const delivery of filteredDeliveries) {
      const client = delivery.clientId ? clientsById.get(delivery.clientId) ?? null : null;
      const key = client?.id ?? `delivery:${delivery.clientId ?? delivery.endpointId ?? delivery.targetUrl}`;
      const group: AdminApiClientItemGroup<AdminDelivery> = groups.get(key) ?? {
        key,
        client,
        fallbackTitle: "Sem cliente API",
        fallbackSubtitle: delivery.clientId ?? delivery.targetUrl ?? "sem destino",
        items: [],
      };

      group.items.push(delivery);
      groups.set(key, group);
    }

    return Array.from(groups.values()).sort((a, b) => getClientItemGroupTitle(a).localeCompare(getClientItemGroupTitle(b)));
  }, [clientsById, filteredDeliveries]);
  const filteredProviderEvents = useMemo(() => {
    const query = normalizeSearch(providerEventQuery);

    return state.providerEvents.filter((event) => {
      const client = event.organizationId ? clientsByOrganizationId.get(event.organizationId) : null;
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
  }, [clientsByOrganizationId, providerEventQuery, providerEventStatus, state.providerEvents]);
  const providerEventGroups = useMemo(() => {
    const groups = new Map<string, AdminApiClientItemGroup<AdminProviderEvent>>();

    for (const event of filteredProviderEvents) {
      const client = event.organizationId ? clientsByOrganizationId.get(event.organizationId) ?? null : null;
      const key = client?.id ?? `provider:${event.organizationId ?? event.provider}`;
      const group: AdminApiClientItemGroup<AdminProviderEvent> = groups.get(key) ?? {
        key,
        client,
        fallbackTitle: event.organizationId ? "Empresa sem cliente API" : "Sem organizacao",
        fallbackSubtitle: event.organizationId ?? event.provider ?? "sem provedor",
        items: [],
      };

      group.items.push(event);
      groups.set(key, group);
    }

    return Array.from(groups.values()).sort((a, b) => getClientItemGroupTitle(a).localeCompare(getClientItemGroupTitle(b)));
  }, [clientsByOrganizationId, filteredProviderEvents]);
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
        event.requestId,
        event.latencyMs,
      ]);
    });
  }, [clientsById, state.usage, usageQuery, usageStatus]);
  const usageGroups = useMemo(() => {
    const groups = new Map<string, AdminApiClientItemGroup<AdminUsageEvent>>();

    for (const event of filteredUsage) {
      const client = event.clientId ? clientsById.get(event.clientId) ?? null : null;
      const key = client?.id ?? `usage:${event.clientId ?? "unknown"}`;
      const group: AdminApiClientItemGroup<AdminUsageEvent> = groups.get(key) ?? {
        key,
        client,
        fallbackTitle: event.clientId ? "Cliente API nao localizado" : "Sem cliente API",
        fallbackSubtitle: event.clientId ?? event.provider ?? "gateway",
        items: [],
      };

      group.items.push(event);
      groups.set(key, group);
    }

    return Array.from(groups.values()).sort((a, b) => getClientItemGroupTitle(a).localeCompare(getClientItemGroupTitle(b)));
  }, [clientsById, filteredUsage]);

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
        tone: data.result?.providerDeleted === false ? "warning" : "success",
        message: data.result?.providerDeleted === false
          ? "Instancia removida da ConnectyHub, mas a exclusao no provedor ficou pendente."
          : successMessage(String(payload.action ?? actionKey)),
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

  async function copyMigrationCredential(kind: MigrationCredentialKind) {
    if (!migrationInstance) {
      setNotice({ tone: "warning", message: "Escolha uma instancia antes de copiar os dados de migracao." });
      return;
    }

    setMigrationCopying(kind);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/connectyhub-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copy_migration_credential",
          instanceId: migrationInstance.id,
          credential: kind,
        }),
      });
      const data = (await response.json().catch(() => null)) as MigrationCredentialResponse | null;

      if (!response.ok || !data?.ok || !data.value) {
        throw new Error(data?.error?.message ?? "Nao foi possivel liberar a credencial de migracao.");
      }

      copyText(data.value);
      setNotice(data.notice ?? { tone: "success", message: "Credencial copiada para a area de transferencia." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel copiar a credencial de migracao.",
      });
    } finally {
      setMigrationCopying(null);
    }
  }

  function confirmDeleteInstance(instance: AdminGatewayInstance) {
    const label = getAdminInstanceDisplayTitle(instance);
    const confirmed = window.confirm(`Excluir a instancia "${label}"?\n\nA ConnectyHub vai remover o registro do cliente API e tentar excluir imediatamente no provedor WhatsApp.`);

    if (!confirmed) return;

    void runAction(`delete_instance:${instance.id}`, {
      action: "delete_instance",
      instanceId: instance.id,
    });
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
            <NeonBadge tone={healthTone(gatewayHealth.status)}>{healthLabel(gatewayHealth.status)}</NeonBadge>
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

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <MetricTile icon={PlugZap} label="Empresas com acesso" value={String(state.summary.clients)} detail={`${state.summary.activeClients} ativas`} tone="cyan" />
        <MetricTile icon={KeyRound} label="Usando API" value={String(clientsUsingApi.length)} detail={`${state.summary.activeKeys} chaves ativas`} tone="green" />
        <MetricTile icon={MessageCircle} label="Instancias API" value={String(state.summary.apiInstances)} detail={`${state.summary.connectedApiInstances} conectadas`} tone="green" />
        <MetricTile icon={RadioTower} label="Provedor" value={String(state.summary.providerInstances)} detail={`${state.summary.unmappedProviderInstances} disponiveis p/ API`} tone="amber" />
        <MetricTile icon={Activity} label="24h" value={String(state.summary.requests24h)} detail="requests API" tone="violet" />
        <MetricTile icon={Send} label="Webhooks 24h" value={String(state.summary.webhookDeliveries24h)} detail={`${state.summary.webhookFailures24h} falhas`} tone={state.summary.webhookFailures24h > 0 ? "amber" : "cyan"} />
        <MetricTile icon={ShieldCheck} label="Saude API" value={healthLabel(gatewayHealth.status)} detail={`${gatewayHealth.critical} criticos / ${gatewayHealth.warning} avisos`} tone={healthTone(gatewayHealth.status)} />
      </div>

      <ApiTrafficPanel state={state} />

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
              <div className="space-y-3">
                <TableFilterBar
                  filteredCount={filteredApiClients.length}
                  options={apiClientStatusOptions}
                  placeholder="Buscar empresa, plano, email ou status"
                  query={apiClientQuery}
                  status={apiClientStatus}
                  totalCount={state.clients.length}
                  onQueryChange={setApiClientQuery}
                  onStatusChange={setApiClientStatus}
                />
                {filteredApiClients.length > 0 ? (
                  <ScrollableTable>
                    <div className="space-y-3 p-2">
                      {filteredApiClients.map((client) => {
                        const keyCount = keysByClient.get(client.id)?.length ?? 0;
                        const instanceCount = instancesByClient.get(client.id)?.length ?? 0;
                        const webhookCount = endpointsByClient.get(client.id)?.length ?? 0;
                        const inUse = keyCount > 0 || instanceCount > 0 || webhookCount > 0;
                        const isOpen = isApiClientGroupOpen(client);

                        return (
                          <AccordionGroupCard
                            key={client.id}
                            title={getClientTitle(client)}
                            subtitle={getClientSubtitle(client)}
                            isOpen={isOpen}
                            onToggle={() => toggleApiClientGroup(client)}
                            badges={(
                              <>
                                <NeonBadge tone={client.status === "active" ? "green" : client.status === "paused" ? "amber" : "zinc"}>{client.status}</NeonBadge>
                                <NeonBadge tone={inUse ? "cyan" : "zinc"}>{inUse ? "em uso" : "sem uso"}</NeonBadge>
                                <NeonBadge tone={healthTone(client.health?.status)}>{healthLabel(client.health?.status)}</NeonBadge>
                                <NeonBadge tone="cyan">{keyCount} chaves</NeonBadge>
                                <NeonBadge tone={instanceCount > 0 ? "green" : "zinc"}>{instanceCount} instancias</NeonBadge>
                                <NeonBadge tone={webhookCount > 0 ? "violet" : "zinc"}>{webhookCount} webhooks</NeonBadge>
                              </>
                            )}
                          >
                            <DataTable
                              columns={["Acesso", "Uso API", "Saude", "Chaves", "Instancias API", "Webhooks", "Plano"]}
                              rows={[[
                                <StatusBadge key="status" status={client.status === "active" ? "online" : client.status === "paused" ? "warning" : "idle"} label={client.status} />,
                                <StatusBadge key="usage" status={inUse ? "online" : "idle"} label={inUse ? "cliente API" : "sem uso"} />,
                                <TextCell key="health" value={healthLabel(client.health?.status)} muted={healthSummaryDetail(client.health)} />,
                                <TextCell key="keys" value={String(keyCount)} muted="chaves" />,
                                <TextCell key="instances" value={String(instanceCount)} muted="instancias" />,
                                <TextCell key="hooks" value={String(webhookCount)} muted="webhooks" />,
                                <NeonBadge key="plan" tone="cyan">{client.planCode ?? "api_starter"}</NeonBadge>,
                              ]]}
                            />
                          </AccordionGroupCard>
                        );
                      })}
                    </div>
                  </ScrollableTable>
                ) : (
                  <EmptyCopy title="Nenhuma empresa encontrada" text="Ajuste a busca ou o filtro para localizar empresas com acesso a API." />
                )}
              </div>
            ) : (
              <EmptyCopy title="Nenhuma empresa com acesso a API" text="Todo workspace ConnectyHub deve receber acesso automaticamente." />
            )}
            </Panel>
          )}

          {activeTab === "instances" && (
            <Panel title="Instancias controladas pela API" eyebrow="connectyhub_instance_id / provider_instance_id">
            {apiInstances.length > 0 ? (
              <div className="space-y-3">
                <TableFilterBar
                  filteredCount={filteredApiInstances.length}
                  options={apiInstanceStatusOptions}
                  placeholder="Buscar empresa, numero, instancia ou provider id"
                  query={apiInstanceQuery}
                  status={apiInstanceStatus}
                  totalCount={apiInstances.length}
                  onQueryChange={setApiInstanceQuery}
                  onStatusChange={setApiInstanceStatus}
                />
                {apiInstanceGroups.length > 0 ? (
                  <ScrollableTable>
                    <div className="space-y-3 p-2">
                      {apiInstanceGroups.map((group) => {
                        const connectedCount = group.instances.filter((instance) => instance.status === "connected").length;
                        const webhookOkCount = group.instances.filter((instance) => instance.webhookConfigured).length;
                        const healthIssueCount = group.instances.filter((instance) => isHealthIssue(instance.health?.status)).length;
                        const hasIssue = group.instances.some(hasApiInstanceIssue);
                        const isOpen = isApiInstanceGroupOpen(group);

                        return (
                          <AccordionGroupCard
                            key={group.key}
                            title={getApiInstanceGroupTitle(group)}
                            subtitle={getApiInstanceGroupSubtitle(group)}
                            hasIssue={hasIssue}
                            isOpen={isOpen}
                            onToggle={() => toggleApiInstanceGroup(group)}
                            badges={(
                              <>
                                <NeonBadge tone="cyan">{group.instances.length} instancias</NeonBadge>
                                <NeonBadge tone={connectedCount > 0 ? "green" : "zinc"}>{connectedCount} conectadas</NeonBadge>
                                <NeonBadge tone={webhookOkCount === group.instances.length ? "green" : "amber"}>{webhookOkCount} webhooks ok</NeonBadge>
                                <NeonBadge tone={healthIssueCount > 0 ? "amber" : "green"}>{healthIssueCount} alertas</NeonBadge>
                              </>
                            )}
                          >
                            <DataTable
                              columns={["Instancia", "Status", "Saude", "Numero", "Webhook", "Ultimo sinal", "Acoes"]}
                              rows={group.instances.map((instance) => [
                                <InstanceIdentityCell
                                  key="id"
                                  title={getAdminInstanceDisplayTitle(instance)}
                                  subtitle={instance.id}
                                  imageUrl={instance.profileImageUrl}
                                  imageStatus={instance.profileImageUrl ? "foto sincronizada" : "foto pendente"}
                                />,
                                <StatusBadge key="status" status={instanceTone(instance.status)} label={instance.status} />,
                                <TextCell key="health" value={healthLabel(instance.health?.status)} muted={healthSignalDetail(instance.health)} />,
                                <TextCell key="phone" value={instance.phoneNumber ?? "Sem numero"} muted={instance.providerInstanceId ?? "sem provider id"} />,
                                <StatusBadge key="webhook" status={instance.webhookConfigured ? "online" : "warning"} label={instance.webhookConfigured ? "ok" : "pendente"} />,
                                <TextCell key="sync" value={formatDate(instance.lastMessageAt ?? instance.lastHeartbeatAt ?? instance.updatedAt)} muted="sync" />,
                                <div key="actions" className="flex min-w-[120px] flex-wrap gap-2">
                                  {isPasskeyBlockedInstance(instance) && (
                                    <InlineActionButton
                                      icon={KeyRound}
                                      label="Migrar"
                                      onClick={() => setMigrationInstance(instance)}
                                      tone="amber"
                                    />
                                  )}
                                  <InlineActionButton
                                    disabled={running === `delete_instance:${instance.id}`}
                                    icon={Trash2}
                                    label="Excluir"
                                    loading={running === `delete_instance:${instance.id}`}
                                    onClick={() => confirmDeleteInstance(instance)}
                                    tone="rose"
                                  />
                                </div>,
                              ])}
                            />
                          </AccordionGroupCard>
                        );
                      })}
                    </div>
                  </ScrollableTable>
                ) : (
                  <EmptyCopy title="Nenhuma instancia encontrada" text="Ajuste a busca ou o filtro para localizar instancias API de uma empresa." />
                )}
              </div>
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
                    <div className="space-y-3 p-2">
                      {filteredDiagnosticClients.map((client) => {
                        const latestEvent = latestProviderEventByOrg.get(client.organizationId);
                        const latestDelivery = latestDeliveryByClient.get(client.id);
                        const endpoint = endpointsByClient.get(client.id)?.find((item) => item.status === "active") ?? endpointsByClient.get(client.id)?.[0] ?? null;
                        const retryableDelivery = latestDelivery && latestDelivery.status !== "delivered" ? latestDelivery : null;
                        const hasIssue = hasDeliveryIssue(latestDelivery) || hasProviderEventIssue(latestEvent) || !endpoint || !latestDelivery;
                        const isOpen = isDiagnosticGroupOpen(client);

                        return (
                          <AccordionGroupCard
                            key={client.id}
                            title={getClientTitle(client)}
                            subtitle={getClientSubtitle(client)}
                            hasIssue={hasIssue}
                            isOpen={isOpen}
                            onToggle={() => toggleDiagnosticGroup(client)}
                            badges={(
                              <>
                                <NeonBadge tone={hasIssue ? "amber" : "green"}>{hasIssue ? "atencao" : "ok"}</NeonBadge>
                                <NeonBadge tone={endpoint ? "cyan" : "zinc"}>{endpoint ? "webhook ativo" : "sem webhook"}</NeonBadge>
                                <NeonBadge tone={latestDelivery?.status === "delivered" ? "green" : latestDelivery ? "amber" : "zinc"}>{latestDelivery?.status ?? "sem entrega"}</NeonBadge>
                              </>
                            )}
                          >
                            <DataTable
                              columns={["Entrada ConnectyHub", "Entrega cliente", "HTTP", "Acoes"]}
                              rows={[[
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
                              ]]}
                            />
                          </AccordionGroupCard>
                        );
                      })}
                    </div>
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
                    <div className="space-y-3 p-2">
                      {deliveryGroups.map((group) => {
                        const failedCount = group.items.filter(hasDeliveryIssue).length;
                        const deliveredCount = group.items.filter((delivery) => delivery.status === "delivered").length;
                        const isOpen = isDeliveryGroupOpen(group);

                        return (
                          <AccordionGroupCard
                            key={group.key}
                            title={getClientItemGroupTitle(group)}
                            subtitle={getClientItemGroupSubtitle(group)}
                            hasIssue={failedCount > 0}
                            isOpen={isOpen}
                            onToggle={() => toggleDeliveryGroup(group)}
                            badges={(
                              <>
                                <NeonBadge tone="cyan">{group.items.length} entregas</NeonBadge>
                                <NeonBadge tone={deliveredCount > 0 ? "green" : "zinc"}>{deliveredCount} entregues</NeonBadge>
                                <NeonBadge tone={failedCount > 0 ? "amber" : "green"}>{failedCount} falhas</NeonBadge>
                              </>
                            )}
                          >
                            <DataTable
                              columns={["Evento", "Destino", "Status", "Erro", "Quando", "Acoes"]}
                              rows={group.items.map((delivery) => [
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
                              ])}
                            />
                          </AccordionGroupCard>
                        );
                      })}
                    </div>
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
                    <div className="space-y-3 p-2">
                      {providerEventGroups.map((group) => {
                        const issueCount = group.items.filter(hasProviderEventIssue).length;
                        const processedCount = group.items.filter(isProviderEventProcessed).length;
                        const isOpen = isProviderEventGroupOpen(group);

                        return (
                          <AccordionGroupCard
                            key={group.key}
                            title={getClientItemGroupTitle(group)}
                            subtitle={getClientItemGroupSubtitle(group)}
                            hasIssue={issueCount > 0}
                            isOpen={isOpen}
                            onToggle={() => toggleProviderEventGroup(group)}
                            badges={(
                              <>
                                <NeonBadge tone="cyan">{group.items.length} eventos</NeonBadge>
                                <NeonBadge tone={processedCount > 0 ? "green" : "zinc"}>{processedCount} processados</NeonBadge>
                                <NeonBadge tone={issueCount > 0 ? "amber" : "green"}>{issueCount} erros</NeonBadge>
                              </>
                            )}
                          >
                            <DataTable
                              columns={["Evento", "Instancia", "Status", "Quando"]}
                              rows={group.items.map((event) => [
                                <TextCell key="event" value={event.eventType} muted={event.providerMessageId ?? event.providerChatId ?? event.provider} />,
                                <TextCell key="instance" value={event.providerInstanceId ?? "Sem provider id"} muted={event.whatsappInstanceId ?? "sem instancia local"} />,
                                <StatusBadge key="status" status={providerEventTone(event.processingStatus)} label={event.processingStatus} />,
                                <TextCell key="date" value={formatDate(event.receivedAt)} muted={event.errorMessage ?? "recebido"} />,
                              ])}
                            />
                          </AccordionGroupCard>
                        );
                      })}
                    </div>
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
                      title={getProviderInstanceDisplayTitle(instance)}
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
                {usageGroups.length > 0 ? (
                  <ScrollableTable>
                    <div className="space-y-3 p-2">
                      {usageGroups.map((group) => {
                        const errorCount = group.items.filter(hasUsageIssue).length;
                        const averageLatency = getAverageLatency(group.items);
                        const isOpen = isUsageGroupOpen(group);

                        return (
                          <AccordionGroupCard
                            key={group.key}
                            title={getClientItemGroupTitle(group)}
                            subtitle={getClientItemGroupSubtitle(group)}
                            isOpen={isOpen}
                            onToggle={() => toggleUsageGroup(group)}
                            hasIssue={errorCount > 0}
                            badges={(
                              <>
                                <NeonBadge tone="cyan">{group.items.length} requests</NeonBadge>
                                <NeonBadge tone={errorCount > 0 ? "amber" : "green"}>{errorCount} falhas</NeonBadge>
                                <NeonBadge tone="violet">{formatLatency(averageLatency)}</NeonBadge>
                              </>
                            )}
                          >
                            <DataTable
                              columns={["Endpoint", "Status", "Unidade", "Latencia", "Quando"]}
                              rows={group.items.map((event) => [
                                <TextCell key="endpoint" value={event.endpoint} muted={event.requestId ?? event.provider ?? "gateway"} />,
                                <StatusBadge key="status" status={(event.statusCode ?? 500) < 400 ? "online" : "critical"} label={String(event.statusCode ?? "-")} />,
                                <TextCell key="unit" value={event.unitType} muted={String(event.quantity)} />,
                                <TextCell key="latency" value={formatLatency(event.latencyMs)} muted={event.providerStatus ? `provider ${event.providerStatus}` : event.provider ?? "gateway"} />,
                                <TextCell key="date" value={formatDate(event.createdAt)} muted={event.method ?? "request"} />,
                              ])}
                            />
                          </AccordionGroupCard>
                        );
                      })}
                    </div>
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
                      {getProviderInstanceDisplayTitle(instance)} / {instance.status}
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
                ["DELETE", "/api/v1/instances/:id"],
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

      {migrationInstance && (
        <MigrationAssistModal
          instance={migrationInstance}
          loading={migrationCopying}
          onClose={() => setMigrationInstance(null)}
          onCopyCredential={copyMigrationCredential}
        />
      )}
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

function AccordionGroupCard({
  badges,
  children,
  hasIssue,
  isOpen,
  onToggle,
  subtitle,
  title,
}: {
  badges: ReactNode;
  children: ReactNode;
  hasIssue?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border bg-slate-950/35 ${hasIssue ? "border-amber-500/20" : "border-slate-800"}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex w-full flex-col gap-3 border-b border-slate-800 bg-cyan-500/[0.03] px-3 py-3 text-left transition hover:bg-cyan-500/[0.06] lg:flex-row lg:items-center lg:justify-between"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-950/60 text-cyan-300">
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
              {title}
            </span>
            <span className="mt-1 block truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">
              {subtitle}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap gap-2">{badges}</span>
      </button>
      {isOpen && <div className="p-3">{children}</div>}
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

function ApiTrafficPanel({ state }: { state: AdminGatewayState }) {
  const traffic = state.traffic;
  const hasEndpointRows = traffic.topEndpoints.length > 0;
  const hasClientRows = traffic.topClients.length > 0;

  return (
    <Panel className="mb-5" title="Telemetria da API" eyebrow="trafego / consumo / qualidade">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          icon={Activity}
          label="Sucesso 24h"
          value={`${traffic.successRate24h}%`}
          detail={`${traffic.successfulRequests24h} ok / ${traffic.failedRequests24h} falhas`}
          tone={traffic.failedRequests24h > 0 ? "amber" : "green"}
        />
        <MetricTile
          icon={Send}
          label="Mensagens 24h"
          value={String(traffic.messages24h)}
          detail={`${traffic.textMessages24h} texto / ${traffic.mediaMessages24h} midia`}
          tone="cyan"
        />
        <MetricTile
          icon={PlugZap}
          label="Clientes ativos"
          value={String(traffic.activeClients24h)}
          detail={`${traffic.requests24h} requests`}
          tone="green"
        />
        <MetricTile
          icon={MessageCircle}
          label="Instancias"
          value={String(traffic.instanceRequests24h)}
          detail={`${traffic.webhookRequests24h} webhooks`}
          tone="violet"
        />
        <MetricTile
          icon={RadioTower}
          label="Latencia media"
          value={formatLatency(traffic.averageLatencyMs)}
          detail={`${traffic.providerProxyRequests24h} provider proxy`}
          tone="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/20 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Endpoints mais usados</p>
            <NeonBadge tone="cyan">{traffic.topEndpoints.length} rotas</NeonBadge>
          </div>
          {hasEndpointRows ? (
            <DataTable
              columns={["Endpoint", "Requests", "Erros", "Msgs", "Latencia"]}
              rows={traffic.topEndpoints.map((endpoint) => [
                <TextCell key="endpoint" value={`${endpoint.method} ${endpoint.endpoint}`} muted={formatDate(endpoint.lastUsedAt)} />,
                <TextCell key="requests" value={String(endpoint.requests)} muted="24h" />,
                <StatusBadge key="errors" status={endpoint.errors > 0 ? "warning" : "online"} label={String(endpoint.errors)} />,
                <TextCell key="messages" value={String(endpoint.messages)} muted="mensagens" />,
                <TextCell key="latency" value={formatLatency(endpoint.averageLatencyMs)} muted="media" />,
              ])}
            />
          ) : (
            <EmptyCopy title="Sem trafego em 24h" text="As rotas mais usadas aparecem aqui quando clientes chamarem a API." />
          )}
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/20 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Clientes com trafego</p>
            <NeonBadge tone="green">{traffic.topClients.length} clientes</NeonBadge>
          </div>
          {hasClientRows ? (
            <DataTable
              columns={["Cliente", "Requests", "Msgs", "Webhooks", "Ultimo"]}
              rows={traffic.topClients.map((client) => [
                <TextCell key="client" value={client.organizationName ?? client.clientName} muted={client.clientName} />,
                <TextCell key="requests" value={String(client.requests)} muted={`${client.errors} erros`} />,
                <TextCell key="messages" value={String(client.messages)} muted="mensagens" />,
                <StatusBadge key="webhooks" status={client.webhookFailures > 0 ? "warning" : "online"} label={`${client.webhookDeliveries}/${client.webhookFailures}`} />,
                <TextCell key="last" value={formatDate(client.lastUsedAt)} muted={client.clientId ?? "sem id"} />,
              ])}
            />
          ) : (
            <EmptyCopy title="Sem cliente ativo em 24h" text="Quando um cliente consumir a API, ele aparece neste ranking." />
          )}
        </div>
      </div>
    </Panel>
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

function MigrationAssistModal({
  instance,
  loading,
  onClose,
  onCopyCredential,
}: {
  instance: AdminGatewayInstance;
  loading: MigrationCredentialKind | null;
  onClose: () => void;
  onCopyCredential: (kind: MigrationCredentialKind) => void;
}) {
  return (
    <div
      aria-labelledby="admin-api-passkey-migration-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      role="dialog"
      tabIndex={0}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-cyan-300/20 bg-[#101827] p-5 text-left shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          aria-label="Fechar migracao assistida"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-300/10 text-amber-200">
          <KeyRound className="h-6 w-6" />
        </div>

        <h3 id="admin-api-passkey-migration-title" className="mt-4 pr-8 text-lg font-semibold text-white">
          Migracao assistida
        </h3>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-cyan-300">
          {getAdminInstanceDisplayTitle(instance)}
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {PASSKEY_CONNECTION_HELP_TEXT}
        </p>

        <div className="mt-4 grid gap-2 text-[12px] leading-5 text-slate-400">
          <p>1. Instale a extensao Session Migration Connector.</p>
          <p>2. Entre no WhatsApp Web oficial e conclua a verificacao pelo celular.</p>
          <p>3. Na extensao, use os botoes abaixo para copiar a Server URL e o Instance Token.</p>
          <p>4. Clique em Migrar sessao e volte aqui para atualizar o status da instancia.</p>
        </div>

        <a
          className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-4 font-mono text-[11px] font-semibold uppercase text-cyan-100 transition hover:bg-cyan-300/15"
          href={PASSKEY_MIGRATION_EXTENSION_URL}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir extensao
        </a>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <MigrationCopyButton
            description="URL do servidor da UaZapi"
            disabled={Boolean(loading)}
            label="Copiar Server URL"
            loading={loading === "serverUrl"}
            onClick={() => onCopyCredential("serverUrl")}
          />
          <MigrationCopyButton
            description="Token sensivel desta instancia"
            disabled={Boolean(loading)}
            label="Copiar Instance Token"
            loading={loading === "instanceToken"}
            onClick={() => onCopyCredential("instanceToken")}
          />
        </div>

        <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[11px] leading-5 text-amber-100/90">
          O token nao fica visivel no painel. Ele e copiado diretamente para uso na extensao indicada.
        </div>
      </div>
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
      className="grid min-h-20 gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase text-white">
        {loading ? <RefreshCcw className="h-4 w-4 animate-spin text-cyan-200" /> : <Copy className="h-4 w-4 text-cyan-200" />}
        {label}
      </span>
      <span className="text-[11px] leading-4 text-slate-500">{description}</span>
    </button>
  );
}

function InlineActionButton({
  disabled,
  icon: Icon,
  label,
  loading,
  onClick,
  tone = "cyan",
}: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  loading?: boolean;
  onClick: () => void;
  tone?: "cyan" | "green" | "amber" | "rose";
}) {
  const toneClass = {
    cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15",
    green: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15",
    rose: "border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15",
  }[tone];

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      title={label}
      className={`inline-flex h-8 min-w-20 items-center justify-center gap-1.5 rounded-xl border px-2 font-mono text-[9px] uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
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

function hasApiInstanceIssue(instance: AdminGatewayInstance) {
  return instance.status !== "connected" || !instance.webhookConfigured || isHealthIssue(instance.health?.status);
}

function isPasskeyBlockedInstance(instance: AdminGatewayInstance) {
  const attempt = instance.connectionDiagnostics?.latestAttempt;
  const reason = `${attempt?.lastDisconnectReason ?? ""} ${attempt?.finalReason ?? ""}`.toLowerCase();

  return attempt?.finalStatus === "passkey_blocked"
    || reason.includes("passkey")
    || reason.includes("chave de acesso")
    || reason.includes("access key")
    || reason.includes("security key")
    || reason.includes("webauthn");
}

function summarizeGatewayHealth(items: Array<AdminGatewayClient["health"] | null | undefined>) {
  const known = items.filter(Boolean) as AdminGatewayHealthSummary[];
  const critical = known.filter((item) => item.status === "critical").length;
  const warning = known.filter((item) => item.status === "warning").length;
  const ok = known.filter((item) => item.status === "ok").length;
  const unknown = items.length - known.length + known.filter((item) => item.status === "unknown").length;
  const status = critical > 0 ? "critical" : warning > 0 ? "warning" : ok > 0 ? "ok" : "unknown";

  return {
    status,
    ok,
    warning,
    critical,
    unknown,
  };
}

function isHealthIssue(status: string | null | undefined) {
  return status === "warning" || status === "critical";
}

function healthTone(status: string | null | undefined): Tone {
  if (status === "ok") return "green";
  if (status === "warning") return "amber";
  if (status === "critical") return "rose";
  return "zinc";
}

function healthLabel(status: string | null | undefined) {
  if (status === "ok") return "ok";
  if (status === "warning") return "atencao";
  if (status === "critical") return "critico";
  return "sem check";
}

function healthSummaryDetail(health: AdminGatewayClient["health"] | null | undefined) {
  if (!health) return "aguardando inngest";
  return `${health.provider.ok}/${health.provider.total} provider - ${health.webhooks.ok}/${health.webhooks.total} webhooks`;
}

function healthSignalDetail(health: AdminGatewayHealthSignal | null | undefined) {
  if (!health) return "aguardando check";
  const parts = [
    health.message,
    formatLatency(health.latencyMs),
    formatDate(health.checkedAt),
  ].filter(Boolean);

  return parts.join(" / ");
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

function getAdminInstanceDisplayTitle(instance: AdminGatewayInstance) {
  const phoneLabel = instance.phoneNumber ?? null;

  return normalizeWhatsappInstanceDisplayName(instance.displayName, [
    instance.phoneNumber,
    instance.providerInstanceId,
    instance.id,
  ]) ?? phoneLabel ?? instance.providerInstanceId ?? instance.id;
}

function getClientTitle(client: AdminGatewayClient | null) {
  return client?.organization?.name ?? client?.name ?? "Sem cliente API";
}

function getClientSubtitle(client: AdminGatewayClient | null) {
  const organizationName = client?.organization?.name;
  const clientName = client?.name;

  if (organizationName && clientName && organizationName !== clientName) {
    return clientName;
  }

  return client?.slug ?? client?.organizationId ?? "sem cliente";
}

function getApiInstanceGroupTitle(group: AdminApiInstanceGroup) {
  return getClientTitle(group.client) === "Sem cliente API" ? group.fallbackTitle : getClientTitle(group.client);
}

function getApiInstanceGroupSubtitle(group: AdminApiInstanceGroup) {
  const subtitle = getClientSubtitle(group.client);
  return subtitle === "sem cliente" ? group.fallbackSubtitle : subtitle;
}

function getClientItemGroupTitle<T>(group: AdminApiClientItemGroup<T>) {
  return getClientTitle(group.client) === "Sem cliente API" ? group.fallbackTitle : getClientTitle(group.client);
}

function getClientItemGroupSubtitle<T>(group: AdminApiClientItemGroup<T>) {
  const subtitle = getClientSubtitle(group.client);
  return subtitle === "sem cliente" ? group.fallbackSubtitle : subtitle;
}

function getProviderInstanceDisplayTitle(instance: AdminProviderInstance) {
  const phoneLabel = instance.phoneNumber ?? null;

  return normalizeWhatsappInstanceDisplayName(instance.name, [
    instance.phoneNumber,
    instance.providerInstanceId,
  ]) ?? phoneLabel ?? instance.providerInstanceId;
}

function profileImageStatusLabel(status: string | null | undefined) {
  if (status === "synced") return "foto sincronizada";
  if (status === "not_found") return "sem foto localizada";
  return "foto pendente";
}

function successMessage(action: string) {
  if (action.startsWith("delete_instance")) return "Instancia excluida da ConnectyHub e do provedor.";

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

function formatLatency(value: number | null | undefined) {
  if (typeof value !== "number") return "Sem dado";
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s`;
  return `${value}ms`;
}

function getAverageLatency(events: AdminUsageEvent[]) {
  const latencies = events
    .map((event) => event.latencyMs)
    .filter((value): value is number => typeof value === "number");

  if (latencies.length === 0) return null;

  const total = latencies.reduce((sum, value) => sum + value, 0);
  return Math.round(total / latencies.length);
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return (parts.map((part) => part[0]).join("") || "WA").toUpperCase();
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value).catch(() => undefined);
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
