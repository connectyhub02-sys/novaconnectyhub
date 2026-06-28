"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  Copy,
  ExternalLink,
  KeyRound,
  LinkIcon,
  MessageCircle,
  Pause,
  Play,
  PlugZap,
  RadioTower,
  RefreshCcw,
  Send,
  ShieldCheck,
  Trash2,
  Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ClientGatewayState } from "@/lib/connectyhub-api/gateway";
import type { StatusTone, Tone } from "@/lib/connectyhub-os-data";
import { cn } from "@/lib/utils";
import { normalizeWhatsappInstanceDisplayName } from "@/lib/whatsapp/instance-display-name";
import { ConnectyShell } from "./connecty-shell";
import { DataTable, NeonBadge, PageHeader, Panel, StatusBadge } from "./panel-primitives";

type ClientGatewayInstance = ClientGatewayState["instances"][number];
type ClientGatewayEndpoint = ClientGatewayState["endpoints"][number];
type ClientGatewayDelivery = ClientGatewayState["deliveries"][number];

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
    ok?: boolean;
    providerDeleted?: boolean;
    providerStatus?: number | null;
    statusCode?: number | null;
    error?: string | null;
  };
  error?: {
    message?: string;
  };
};

type TabId = "overview" | "keys" | "webhooks" | "usage";

const tabs: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Visao geral", icon: PlugZap },
  { id: "keys", label: "Chaves", icon: KeyRound },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "usage", label: "Uso", icon: Activity },
];

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

export function ClientApiConsole({
  state,
  canManage,
  isPlatformAdmin = false,
  userAvatarUrl,
  userLabel,
  workspaceName,
}: {
  state: ClientGatewayState;
  canManage: boolean;
  isPlatformAdmin?: boolean;
  userAvatarUrl?: string | null;
  userLabel?: string;
  workspaceName?: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const clientsById = useMemo(() => new Map(state.clients.map((client) => [client.id, client])), [state.clients]);
  const activeClient = state.activeClientId ? clientsById.get(state.activeClientId) ?? null : state.clients[0] ?? null;
  const apiInstances = state.instances.filter((instance) => instance.apiClientId);
  const connectyhubInstances = state.instances.filter((instance) => !instance.apiClientId);

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

    await runAction(action, payload, form);
  }

  async function runAction(action: string, payload: Record<string, unknown> = {}, form?: HTMLFormElement) {
    if (!canManage) {
      setNotice({ tone: "warning", message: "Apenas owner/admin do workspace pode alterar a API." });
      return;
    }

    setRunning(action);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/connectyhub-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error?.message ?? "Acao nao concluida.");
      }

      const actionResult = data.result;
      setNotice({
        tone: actionResult?.ok === false || actionResult?.providerDeleted === false ? "warning" : "success",
        message: actionResult?.ok === false
          ? actionResult.error ?? "Teste enviado, mas o endpoint nao confirmou sucesso."
          : actionResult?.providerDeleted === false
            ? "Instancia removida da ConnectyHub, mas a exclusao no provedor ficou pendente."
            : successMessage(action),
        secret: data.secret,
      });
      form?.reset();
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

  function confirmDeleteInstance(instance: ClientGatewayInstance) {
    const label = getInstanceDisplayTitle(instance);
    const confirmed = window.confirm(`Excluir a instancia "${label}"?\n\nEla sera removida deste painel e a ConnectyHub tentara excluir imediatamente no provedor WhatsApp.`);

    if (!confirmed) return;

    void runAction(`delete_instance:${instance.id}`, {
      action: "delete_instance",
      instanceId: instance.id,
    });
  }

  return (
    <ConnectyShell
      activeHref="/dashboard/api-whatsapp"
      isPlatformAdmin={isPlatformAdmin}
      mode="client"
      userAvatarUrl={userAvatarUrl}
      userLabel={userLabel}
      workspaceName={workspaceName}
    >
      <PageHeader
        eyebrow="ConnectyHub API / WhatsApp"
        title="API WhatsApp"
        description="Chaves, webhooks, instancias e consumo da API deste workspace."
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone={state.summary.activeKeys > 0 ? "green" : "amber"}>{state.summary.activeKeys} chaves ativas</NeonBadge>
            <NeonBadge tone="cyan">{state.summary.connectedApiInstances} instancias API</NeonBadge>
          </div>
        }
      />

      {state.warnings.length > 0 && (
        <Panel className="mb-5" title="Avisos" eyebrow="gateway">
          <ul className="space-y-2 text-[13px] leading-6 text-amber-200">
            {state.warnings.slice(0, 5).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Panel>
      )}

      {notice && (
        <Panel className="mb-5" title={notice.tone === "error" ? "Falha na acao" : "Acao concluida"} eyebrow="api">
          <div className="space-y-3">
            <NeonBadge tone={notice.tone === "error" ? "rose" : notice.tone === "warning" ? "amber" : "green"}>
              {notice.message}
            </NeonBadge>
            {notice.secret && <SecretBox secret={notice.secret} />}
          </div>
        </Panel>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricTile icon={PlugZap} label="Cliente API" value={String(state.summary.clients)} detail={`${state.summary.activeClients} ativo(s)`} tone="cyan" />
        <MetricTile icon={KeyRound} label="Chaves" value={String(state.summary.keys)} detail={`${state.summary.activeKeys} ativas`} tone="green" />
        <MetricTile icon={MessageCircle} label="Instancias" value={String(state.summary.workspaceInstances)} detail={`${state.summary.connectedWorkspaceInstances} conectadas`} tone="green" />
        <MetricTile icon={Webhook} label="Webhooks" value={String(state.summary.endpoints)} detail={`${state.summary.activeEndpoints} ativos`} tone="violet" />
        <MetricTile icon={Activity} label="Mes atual" value={String(state.summary.requestsCurrentPeriod)} detail={`${state.summary.messagesUsed} mensagens`} tone="amber" />
      </div>

      <ClientTrafficPanel state={state} />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 font-mono text-[10px] uppercase tracking-wide transition",
                active ? "border-cyan-400/40 bg-cyan-400/12 text-cyan-200" : "border-slate-700 bg-slate-950/35 text-slate-500 hover:text-slate-200",
              )}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {state.clients.length === 0 && (
        <Panel
          className="mb-5"
          title="API WhatsApp"
          eyebrow="workspace"
        >
          <EmptyCopy title="Cadastro API em preparacao" text="Todo workspace ConnectyHub recebe a API automaticamente. Recarregue a tela se este estado persistir." />
        </Panel>
      )}

      {activeTab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <Panel title="Cliente API" eyebrow="workspace / plano / status">
              {state.clients.length > 0 ? (
                <DataTable
                  columns={["Cliente", "Status", "Plano", "Chaves", "Webhooks", "Criado"]}
                  rows={state.clients.map((client) => [
                    <IdentityCell key="client" icon={PlugZap} title={client.name} subtitle={client.slug ?? client.id} />,
                    <StatusBadge key="status" status={client.status === "active" ? "online" : client.status === "paused" ? "warning" : "idle"} label={client.status} />,
                    <NeonBadge key="plan" tone="cyan">{client.planCode ?? "api_starter"}</NeonBadge>,
                    <TextCell key="keys" value={String(state.keys.filter((key) => key.clientId === client.id).length)} muted="chaves" />,
                    <TextCell key="hooks" value={String(state.endpoints.filter((endpoint) => endpoint.clientId === client.id).length)} muted="webhooks" />,
                    <TextCell key="created" value={formatDate(client.createdAt)} muted="ativacao" />,
                  ])}
                />
              ) : (
                <EmptyCopy title="Nenhum cliente API" text="Ative a API para este workspace." />
              )}
            </Panel>

            <Panel title="Instancias do workspace" eyebrow="foto / status / acesso api">
              {state.instances.length > 0 ? (
                <DataTable
                  columns={["WhatsApp", "Status", "Numero", "Acesso API", "Ultimo sinal", "Acoes"]}
                  rows={state.instances.map((instance) => [
                    <InstanceCell key="instance" instance={instance} />,
                    <StatusBadge key="status" status={instanceTone(instance.status)} label={instance.status} />,
                    <TextCell key="phone" value={formatPhone(instance.phoneNumber)} muted={instance.providerInstanceId ?? "sem provider id"} />,
                    <StatusBadge key="api" status={instance.apiClientId ? "online" : "idle"} label={instance.apiClientId ? "liberada" : "connectyhub"} />,
                    <TextCell key="sync" value={formatDate(instance.lastMessageAt ?? instance.lastHeartbeatAt ?? instance.updatedAt)} muted="sync" />,
                    <RowActions key="actions">
                      {instance.apiClientId ? (
                        <IconButton
                          disabled={!canManage || running === `delete_instance:${instance.id}`}
                          icon={Trash2}
                          label="Excluir"
                          loading={running === `delete_instance:${instance.id}`}
                          onClick={() => confirmDeleteInstance(instance)}
                          tone="rose"
                        />
                      ) : (
                        <NeonBadge tone="zinc">Interna</NeonBadge>
                      )}
                    </RowActions>,
                  ])}
                />
              ) : (
                <EmptyCopy title="Sem instancias" text="As instancias conectadas no WhatsApp aparecem aqui com a foto do perfil quando sincronizada." />
              )}
            </Panel>
          </div>

          <div className="space-y-5">
            <DocsPanel baseUrl={state.docs.baseUrl} docsUrl={state.docs.docsUrl} openapiUrl={state.docs.openapiUrl} />
            <Panel title="Resumo de acesso" eyebrow="api / workspace">
              <div className="grid gap-3">
                <InfoTile label="Cliente ativo" value={activeClient?.name ?? "Nao ativado"} />
                <InfoTile label="Instancias API" value={`${apiInstances.length} liberada(s)`} />
                <InfoTile label="Instancias ConnectyHub" value={`${connectyhubInstances.length} interna(s)`} />
                <InfoTile label="Limite mensal" value={formatLimit(state.summary.monthlyMessageLimit)} />
              </div>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "keys" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <Panel title="Chaves API" eyebrow="bearer token">
            {state.keys.length > 0 ? (
              <DataTable
                columns={["Chave", "Status", "Escopos", "Ultimo uso", "Acoes"]}
                rows={state.keys.map((key) => [
                  <TextCell key="key" value={key.name} muted={`${key.keyPrefix}...`} />,
                  <StatusBadge key="status" status={key.status === "active" ? "online" : key.status === "paused" ? "warning" : "idle"} label={key.status} />,
                  <TextCell key="scopes" value={`${key.scopes.length} permissoes`} muted={key.scopes.slice(0, 3).join(", ")} />,
                  <TextCell key="used" value={formatDate(key.lastUsedAt ?? key.createdAt)} muted={key.lastUsedAt ? "last used" : "criada"} />,
                  <RowActions key="actions">
                    <IconButton
                      disabled={!canManage || key.status === "revoked" || running === `revoke_key:${key.id}`}
                      icon={Trash2}
                      label="Revogar"
                      loading={running === `revoke_key:${key.id}`}
                      onClick={() => runAction(`revoke_key:${key.id}`, { action: "revoke_key", keyId: key.id })}
                      tone="rose"
                    />
                  </RowActions>,
                ])}
              />
            ) : (
              <EmptyCopy title="Nenhuma chave" text="Gere uma chave para conectar sistemas externos na API ConnectyHub." />
            )}
          </Panel>

          <Panel title="Gerar chave" eyebrow="token exibido uma vez">
            <form className="space-y-3" onSubmit={submitForm}>
              <input name="action" type="hidden" value="create_key" />
              {activeClient && <input name="clientId" type="hidden" value={activeClient.id} />}
              <Field label="Nome da chave">
                <input className={inputClassName} name="name" placeholder="Producao" />
              </Field>
              <ActionButton disabled={!canManage} loading={running === "create_key"} type="submit">Gerar chave</ActionButton>
            </form>
          </Panel>
        </div>
      )}

      {activeTab === "webhooks" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <Panel title="Webhooks" eyebrow="eventos / entregas">
            {state.endpoints.length > 0 ? (
              <DataTable
                columns={["Endpoint", "Status", "Eventos", "Ultimo sucesso", "Acoes"]}
                rows={state.endpoints.map((endpoint) => [
                  <TextCell key="url" value={endpoint.description ?? endpoint.url} muted={endpoint.url} />,
                  <StatusBadge key="status" status={endpoint.status === "active" ? "online" : endpoint.status === "paused" ? "warning" : "idle"} label={endpoint.status} />,
                  <TextCell key="events" value={`${endpoint.events.length} eventos`} muted={endpoint.events.join(", ")} />,
                  <TextCell key="last" value={formatDate(endpoint.lastSuccessAt ?? endpoint.lastFailureAt ?? endpoint.createdAt)} muted={endpoint.lastSuccessAt ? "sucesso" : endpoint.lastFailureAt ? "falha" : "criado"} />,
                  <WebhookActions
                    key="actions"
                    canManage={canManage}
                    endpoint={endpoint}
                    running={running}
                    runAction={runAction}
                  />,
                ])}
              />
            ) : (
              <EmptyCopy title="Nenhum webhook" text="Cadastre um endpoint para receber eventos de mensagens, conexao e contatos." />
            )}
          </Panel>

          <Panel title="Criar webhook" eyebrow="assinatura hmac">
            <form className="space-y-3" onSubmit={submitForm}>
              <input name="action" type="hidden" value="create_webhook" />
              {activeClient && <input name="clientId" type="hidden" value={activeClient.id} />}
              <Field label="Dominio ou URL publica">
                <input className={inputClassName} name="url" placeholder="meuprojeto.com.br" required />
              </Field>
              <Field label="Descricao">
                <input className={inputClassName} name="description" placeholder="Webhook principal" />
              </Field>
              <WebhookEventPicker />
              <ActionButton disabled={!canManage} loading={running === "create_webhook"} type="submit">Criar webhook</ActionButton>
            </form>
          </Panel>
        </div>
      )}

      {activeTab === "usage" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Uso recente" eyebrow="requests / status">
            {state.usage.length > 0 ? (
              <DataTable
                columns={["Endpoint", "Status", "Unidade", "Latencia", "Quando"]}
                rows={state.usage.map((event) => [
                  <TextCell key="endpoint" value={`${event.method} ${event.endpoint}`} muted={event.requestId ?? event.provider ?? "gateway"} />,
                  <StatusBadge key="status" status={(event.statusCode ?? 500) < 400 ? "online" : "critical"} label={String(event.statusCode ?? "-")} />,
                  <TextCell key="unit" value={event.unitType} muted={String(event.quantity)} />,
                  <TextCell key="latency" value={formatLatency(event.latencyMs)} muted={event.providerStatus ? `provider ${event.providerStatus}` : event.provider ?? "gateway"} />,
                  <TextCell key="date" value={formatDate(event.createdAt)} muted="request" />,
                ])}
              />
            ) : (
              <EmptyCopy title="Sem uso registrado" text="As chamadas feitas em /api/v1 aparecem aqui." />
            )}
          </Panel>

          <Panel title="Entregas webhook" eyebrow="delivery / retry">
            {state.deliveries.length > 0 ? (
              <DataTable
                columns={["Evento", "Status", "Tentativas", "Quando", "Acoes"]}
                rows={state.deliveries.map((delivery) => [
                  <TextCell key="event" value={delivery.eventType} muted={delivery.targetUrl} />,
                  <StatusBadge key="status" status={deliveryTone(delivery)} label={delivery.statusCode ? `${delivery.status} ${delivery.statusCode}` : delivery.status} />,
                  <TextCell key="attempts" value={String(delivery.attemptCount)} muted={delivery.errorMessage ?? "tentativas"} />,
                  <TextCell key="date" value={formatDate(delivery.deliveredAt ?? delivery.createdAt)} muted={delivery.deliveredAt ? "entregue" : "criado"} />,
                  <RowActions key="actions">
                    <IconButton
                      disabled={!canManage || delivery.status === "delivered" || running === `retry_delivery:${delivery.id}`}
                      icon={RefreshCcw}
                      label="Reenviar"
                      loading={running === `retry_delivery:${delivery.id}`}
                      onClick={() => runAction(`retry_delivery:${delivery.id}`, { action: "retry_delivery", deliveryId: delivery.id })}
                      tone="cyan"
                    />
                  </RowActions>,
                ])}
              />
            ) : (
              <EmptyCopy title="Sem entregas" text="As entregas dos webhooks aparecem aqui." />
            )}
          </Panel>
        </div>
      )}
    </ConnectyShell>
  );
}

function ClientTrafficPanel({ state }: { state: ClientGatewayState }) {
  const traffic = state.traffic;

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
          icon={MessageCircle}
          label="Instancias"
          value={String(traffic.instanceRequests24h)}
          detail="requests 24h"
          tone="violet"
        />
        <MetricTile
          icon={Webhook}
          label="Webhooks"
          value={String(traffic.webhookRequests24h)}
          detail={`${state.summary.activeEndpoints} ativos`}
          tone="green"
        />
        <MetricTile
          icon={RadioTower}
          label="Latencia media"
          value={formatLatency(traffic.averageLatencyMs)}
          detail={`${traffic.providerProxyRequests24h} provider proxy`}
          tone="amber"
        />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-950/20 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">Rotas mais usadas</p>
          <NeonBadge tone="cyan">{traffic.topEndpoints.length} rotas</NeonBadge>
        </div>
        {traffic.topEndpoints.length > 0 ? (
          <DataTable
            columns={["Endpoint", "Requests", "Erros", "Msgs", "Latencia", "Ultimo"]}
            rows={traffic.topEndpoints.map((endpoint) => [
              <TextCell key="endpoint" value={`${endpoint.method} ${endpoint.endpoint}`} muted="24h" />,
              <TextCell key="requests" value={String(endpoint.requests)} muted="requests" />,
              <StatusBadge key="errors" status={endpoint.errors > 0 ? "warning" : "online"} label={String(endpoint.errors)} />,
              <TextCell key="messages" value={String(endpoint.messages)} muted="mensagens" />,
              <TextCell key="latency" value={formatLatency(endpoint.averageLatencyMs)} muted="media" />,
              <TextCell key="last" value={formatDate(endpoint.lastUsedAt)} muted="ultimo uso" />,
            ])}
          />
        ) : (
          <EmptyCopy title="Sem trafego em 24h" text="As chamadas feitas pela sua chave API aparecem aqui." />
        )}
      </div>
    </Panel>
  );
}

function DocsPanel({ baseUrl, docsUrl, openapiUrl }: { baseUrl: string; docsUrl: string; openapiUrl: string }) {
  const curl = `curl "${baseUrl}/instances" \\
  -H "Authorization: Bearer ch_live_SEU_TOKEN"`;

  return (
    <Panel title="Documentacao" eyebrow="api v1">
      <div className="space-y-3">
        <InfoTile label="Base URL" value={baseUrl} copyValue={baseUrl} />
        <CodeBlock code={curl} />
        <div className="grid grid-cols-2 gap-2">
          <LinkButton href={docsUrl} icon={ExternalLink} label="Docs" />
          <LinkButton href={openapiUrl} icon={LinkIcon} label="OpenAPI" />
        </div>
      </div>
    </Panel>
  );
}

function SecretBox({ secret }: { secret: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">exibida uma unica vez</p>
        <IconButton icon={Copy} label="Copiar" onClick={() => copyText(secret)} tone="cyan" />
      </div>
      <code className="mt-2 block break-all font-mono text-[12px] text-cyan-200">{secret}</code>
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

function InstanceCell({ instance }: { instance: ClientGatewayInstance }) {
  const label = getInstanceDisplayTitle(instance);

  return (
    <div className="flex min-w-[230px] items-center gap-2">
      <WhatsappAvatar fallback={label} imageUrl={instance.profileImageUrl} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{label}</p>
        <p className="truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">{instance.id}</p>
      </div>
    </div>
  );
}

function getInstanceDisplayTitle(instance: ClientGatewayInstance) {
  const phoneLabel = instance.phoneNumber ? formatPhone(instance.phoneNumber) : null;

  return normalizeWhatsappInstanceDisplayName(instance.displayName, [
    instance.phoneNumber,
    instance.providerInstanceId,
    instance.id,
  ]) ?? phoneLabel ?? instance.id;
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
      {muted && <p className="mt-1 max-w-[260px] truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">{muted}</p>}
    </div>
  );
}

function InfoTile({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate-600">{label}</p>
        {copyValue && <IconButton icon={Copy} label="Copiar" onClick={() => copyText(copyValue)} tone="cyan" />}
      </div>
      <p className="mt-1 break-all font-mono text-[12px] text-slate-200">{value}</p>
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

function ActionButton({
  children,
  disabled,
  loading,
  onClick,
  type = "button",
}: {
  children: string;
  disabled?: boolean;
  loading: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 font-mono text-[10px] uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/15 disabled:opacity-55"
      disabled={disabled || loading}
      onClick={onClick}
      type={type}
    >
      {loading ? "Executando..." : children}
    </button>
  );
}

function IconButton({
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
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 font-mono text-[9px] uppercase tracking-wide transition disabled:opacity-45", toneClass)}
      disabled={disabled || loading}
      onClick={onClick}
      title={label}
      type="button"
    >
      {loading ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function WebhookActions({
  canManage,
  endpoint,
  running,
  runAction,
}: {
  canManage: boolean;
  endpoint: ClientGatewayEndpoint;
  running: string | null;
  runAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const nextStatus = endpoint.status === "active" ? "paused" : "active";

  return (
    <RowActions>
      <IconButton
        disabled={!canManage || running === `set_webhook_status:${endpoint.id}`}
        icon={endpoint.status === "active" ? Pause : Play}
        label={endpoint.status === "active" ? "Pausar" : "Ativar"}
        loading={running === `set_webhook_status:${endpoint.id}`}
        onClick={() => runAction(`set_webhook_status:${endpoint.id}`, { action: "set_webhook_status", webhookId: endpoint.id, status: nextStatus })}
        tone={endpoint.status === "active" ? "amber" : "green"}
      />
      <IconButton
        disabled={!canManage || endpoint.status !== "active" || running === `test_webhook:${endpoint.id}`}
        icon={Send}
        label="Testar"
        loading={running === `test_webhook:${endpoint.id}`}
        onClick={() => runAction(`test_webhook:${endpoint.id}`, { action: "test_webhook", webhookId: endpoint.id })}
        tone="cyan"
      />
      <IconButton
        disabled={!canManage || running === `archive_webhook:${endpoint.id}`}
        icon={Trash2}
        label="Arquivar"
        loading={running === `archive_webhook:${endpoint.id}`}
        onClick={() => runAction(`archive_webhook:${endpoint.id}`, { action: "set_webhook_status", webhookId: endpoint.id, status: "archived" })}
        tone="rose"
      />
    </RowActions>
  );
}

function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex min-w-[170px] flex-wrap gap-2">{children}</div>;
}

function LinkButton({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <a
      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 font-mono text-[10px] uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/15"
      href={href}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl p-3 text-[11px] leading-5 text-cyan-100" style={{ background: "#05070b", border: "1px solid var(--ch-border)" }}>
      <code>{code}</code>
    </pre>
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

function instanceTone(status: string): StatusTone {
  if (status === "connected") return "online";
  if (status === "error" || status === "blocked") return "critical";
  if (status === "qr_pending" || status === "draft") return "warning";
  return "idle";
}

function deliveryTone(delivery: ClientGatewayDelivery): StatusTone {
  if (delivery.status === "delivered") return "online";
  if (delivery.status === "queued") return "warning";
  return "critical";
}

function successMessage(action: string) {
  if (action.startsWith("delete_instance")) return "Instancia excluida da ConnectyHub e do provedor.";
  if (action.startsWith("revoke_key")) return "Chave revogada.";
  if (action.startsWith("set_webhook_status")) return "Webhook atualizado.";
  if (action.startsWith("test_webhook")) return "Teste enviado.";
  if (action.startsWith("retry_delivery")) return "Entrega reenviada.";

  const messages: Record<string, string> = {
    ensure_client: "API WhatsApp ativada.",
    create_key: "Chave API gerada.",
    create_webhook: "Webhook criado.",
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

function formatPhone(value: string | null | undefined) {
  if (!value) return "Sem numero";
  const digits = value.replace(/\D/g, "");

  if (digits.length === 13) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  return value;
}

function formatLimit(value: number | null) {
  return typeof value === "number" ? `${value.toLocaleString("pt-BR")} mensagens` : "Sem limite definido";
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

const inputClassName =
  "h-9 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 text-[12px] text-slate-100 outline-none transition focus:border-cyan-400";
