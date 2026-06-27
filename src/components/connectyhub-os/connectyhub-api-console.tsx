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
  const clientsById = useMemo(() => new Map(state.clients.map((client) => [client.id, client])), [state.clients]);
  const keysByClient = useMemo(() => groupBy(state.keys, (key) => key.clientId), [state.keys]);
  const endpointsByClient = useMemo(() => groupBy(state.endpoints, (endpoint) => endpoint.clientId), [state.endpoints]);
  const instancesByClient = useMemo(() => groupBy(state.instances, (instance) => instance.apiClientId ?? "internal"), [state.instances]);
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

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const action = String(formData.get("action") ?? "");
    const payload: Record<string, unknown> = { action };

    for (const [key, value] of formData.entries()) {
      if (key !== "action" && typeof value === "string" && value.trim()) {
        payload[key] = value.trim();
      }
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

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricTile icon={PlugZap} label="Empresas com acesso" value={String(state.summary.clients)} detail={`${state.summary.activeClients} ativas`} tone="cyan" />
        <MetricTile icon={KeyRound} label="Usando API" value={String(clientsUsingApi.length)} detail={`${state.summary.activeKeys} chaves ativas`} tone="green" />
        <MetricTile icon={MessageCircle} label="Instancias API" value={String(state.summary.apiInstances)} detail={`${state.summary.connectedApiInstances} conectadas`} tone="green" />
        <MetricTile icon={RadioTower} label="Provedor" value={String(state.summary.providerInstances)} detail={`${state.summary.unmappedProviderInstances} disponiveis p/ API`} tone="amber" />
        <MetricTile icon={Activity} label="24h" value={String(state.summary.requests24h)} detail="requests API" tone="violet" />
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <Panel title="Empresas com acesso a API" eyebrow="empresa / acesso / uso real">
            {state.clients.length > 0 ? (
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
            ) : (
              <EmptyCopy title="Nenhuma empresa com acesso a API" text="Todo workspace ConnectyHub deve receber acesso automaticamente." />
            )}
          </Panel>

          <Panel title="Instancias controladas pela API" eyebrow="connectyhub_instance_id / provider_instance_id">
            {state.instances.filter((instance) => instance.apiClientId).length > 0 ? (
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
            ) : (
              <EmptyCopy title="Nenhuma instancia API vinculada" text="Adote uma instancia existente do provedor ou crie uma instancia nova pela API ConnectyHub." />
            )}
          </Panel>

          <Panel title="Instancias do provedor disponiveis para API" eyebrow="adocao / controle / origem">
            {providerInstancesAvailableForApi.length > 0 ? (
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
            ) : (
              <EmptyCopy title="Nenhuma instancia livre para API" text="Instancias ja usadas no painel normal da ConnectyHub ficam fora da adocao API." />
            )}
          </Panel>

          <Panel title="Uso recente da API" eyebrow="requests / status / provedor">
            {state.usage.length > 0 ? (
              <DataTable
                columns={["Empresa", "Endpoint", "Status", "Unidade", "Quando"]}
                rows={state.usage.slice(0, 40).map((event) => {
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
            ) : (
              <EmptyCopy title="Sem uso registrado" text="As chamadas feitas em /api/v1 vao aparecer aqui." />
            )}
          </Panel>
        </div>

        <div className="space-y-5 2xl:sticky 2xl:top-20 2xl:self-start">
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
              <Field label="URL publica">
                <input name="url" required className={inputClassName} placeholder="https://cliente.com/webhooks/connectyhub" />
              </Field>
              <Field label="Descricao">
                <input name="description" className={inputClassName} placeholder="Webhook principal" />
              </Field>
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
      </div>
    </ConnectyShell>
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

const inputClassName =
  "h-9 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 text-[12px] text-slate-100 outline-none transition focus:border-cyan-400";
