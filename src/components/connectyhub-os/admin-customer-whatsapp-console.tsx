import Image from "next/image";
import {
  Activity,
  Bot,
  MessageCircle,
  Network,
  ShieldCheck,
  UsersRound,
  Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  AdminCustomerWhatsappInstance,
  AdminCustomerWhatsappWorkspace,
  CustomerWhatsappInstanceStatus,
} from "@/lib/admin/customer-whatsapp";
import type { StatusTone, Tone } from "@/lib/connectyhub-os-data";
import { ConnectyShell, type ConnectyShellNotification } from "./connecty-shell";
import { DataTable, KpiStat, NeonBadge, PageHeader, Panel, StatusBadge } from "./panel-primitives";
import { SyncWhatsAppInstancesButton } from "./sync-whatsapp-instances-button";

export function AdminCustomerWhatsappConsole({
  workspace,
  userLabel = "CEO_HUMAN_ADM",
}: {
  workspace: AdminCustomerWhatsappWorkspace;
  userLabel?: string;
}) {
  const connectedRate = workspace.summary.totalInstances > 0
    ? Math.round((workspace.summary.connectedInstances / workspace.summary.totalInstances) * 100)
    : 0;

  return (
    <ConnectyShell
      mode="admin"
      isPlatformAdmin
      userLabel={userLabel}
      activeHref="/admin/clientes/whatsapp"
      initialNotifications={buildCustomerWhatsappNotifications(workspace)}
    >
      <PageHeader
        eyebrow="Clientes / WhatsApp"
        title="WhatsApp dos clientes"
        description="Instancias usadas dentro do painel ConnectyHub. Instancias vendidas ou controladas por API ficam isoladas em API WhatsApp."
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone="green">{workspace.summary.connectedInstances} conectadas</NeonBadge>
            {workspace.summary.internalInstanceBlockedRuns > 0 ? (
              <NeonBadge tone="amber">{workspace.summary.internalInstanceBlockedRuns} protecoes eco</NeonBadge>
            ) : null}
            <NeonBadge tone="cyan">Painel cliente</NeonBadge>
            <NeonBadge tone="violet">API isolada</NeonBadge>
          </div>
        }
      />

      {workspace.warnings.length > 0 && (
        <Panel className="mb-5" title="Avisos da area de clientes" eyebrow="dados / supabase">
          <ul className="space-y-2 text-[13px] leading-6 text-amber-200">
            {workspace.warnings.slice(0, 5).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricTile
          icon={MessageCircle}
          label="Instancias"
          value={String(workspace.summary.totalInstances)}
          detail={`${connectedRate}% conectadas`}
          tone="cyan"
        />
        <MetricTile
          icon={Webhook}
          label="Webhooks"
          value={String(workspace.summary.webhookConfigured)}
          detail={`${workspace.summary.webhookErrors} erros recentes`}
          tone={workspace.summary.webhookErrors > 0 ? "amber" : "green"}
        />
        <MetricTile
          icon={Bot}
          label="Agentes clientes"
          value={String(workspace.summary.whatsappAgents)}
          detail="fora do organograma interno"
          tone="violet"
        />
        <MetricTile
          icon={UsersRound}
          label="Leads WhatsApp"
          value={String(workspace.summary.totalLeads)}
          detail={`${workspace.summary.activeLeads} ativos`}
          tone="green"
        />
        <MetricTile
          icon={Activity}
          label="Conversas abertas"
          value={String(workspace.summary.openConversations)}
          detail={`${workspace.summary.pendingInstances} pendentes`}
          tone="amber"
        />
        <MetricTile
          icon={ShieldCheck}
          label="Protecao eco"
          value={String(workspace.summary.internalInstanceBlockedRuns)}
          detail="instancias internas"
          tone={workspace.summary.internalInstanceBlockedRuns > 0 ? "amber" : "green"}
        />
      </div>

      <Panel className="mb-5" title="Telemetria WhatsApp" eyebrow="mensagens / midia / agentes">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiStat label="mensagens" value={String(workspace.summary.messagesTotal)} tone="cyan" />
          <KpiStat label="recebidas" value={String(workspace.summary.inboundMessages)} tone="green" />
          <KpiStat label="enviadas" value={String(workspace.summary.outboundMessages)} tone="violet" />
          <KpiStat
            label="audio / midia"
            value={`${workspace.summary.audioMessages} / ${workspace.summary.mediaMessages}`}
            tone="amber"
          />
          <KpiStat
            label="ia concluida / falha"
            value={`${workspace.summary.agentRunsCompleted} / ${workspace.summary.agentRunsFailed}`}
            tone={workspace.summary.agentRunsFailed > 0 ? "amber" : "green"}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <NeonBadge tone="cyan">{workspace.summary.agentRunsTotal} execucoes IA</NeonBadge>
          <NeonBadge tone={workspace.summary.averageAgentRunSeconds ? "green" : "zinc"}>
            media {formatDuration(workspace.summary.averageAgentRunSeconds)}
          </NeonBadge>
          {workspace.summary.internalInstanceBlockedRuns > 0 ? (
            <NeonBadge tone="amber">{workspace.summary.internalInstanceBlockedRuns} conversas internas ignoradas</NeonBadge>
          ) : null}
        </div>
      </Panel>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <Panel
          title="Instancias do painel dos usuarios"
          eyebrow="empresa / numero / agente / crm"
          action={<NeonBadge tone="cyan">{workspace.instances.length} registros</NeonBadge>}
        >
          {workspace.instances.length > 0 ? (
            <DataTable
              columns={["Empresa", "Numero", "Status", "Agente", "Leads", "Conversas", "Mensagens", "IA", "Webhook", "Ultimo sinal"]}
              rows={workspace.instances.map((instance) => [
                <InstanceIdentity key="identity" instance={instance} />,
                <PhoneCell key="phone" instance={instance} />,
                <StatusBadge key="status" status={instanceStatusTone(instance.status)} label={statusLabel(instance.status)} />,
                <AgentsCell key="agents" instance={instance} />,
                <CountCell key="leads" total={instance.leadCount} active={instance.activeLeadCount} activeLabel="ativos" />,
                <CountCell
                  key="conversations"
                  total={instance.conversationCount}
                  active={instance.openConversationCount}
                  activeLabel="abertas"
                />,
                <MessageTelemetryCell key="messages" instance={instance} />,
                <AgentTelemetryCell key="ai" instance={instance} />,
                <WebhookCell key="webhook" instance={instance} />,
                <LastSignalCell key="signal" instance={instance} />,
              ])}
            />
          ) : (
            <EmptyState
              icon={MessageCircle}
              title="Nenhuma instancia de cliente registrada"
              text="Quando um usuario conectar o WhatsApp pelo painel cliente, o numero aparece aqui. Instancias criadas pela API ficam na area API WhatsApp."
            />
          )}
        </Panel>

        <div className="space-y-5 2xl:sticky 2xl:top-20 2xl:self-start">
          <Panel title="Separacao operacional" eyebrow="admin / clientes">
            <div className="space-y-3">
              <RuleRow
                icon={ShieldCheck}
                title="Agentes internos"
                text="Ficam em /admin/agentes e atuam como operadores do sistema, auditoria, inteligencia e orquestracao."
              />
              <RuleRow
                icon={MessageCircle}
                title="WhatsApp dos usuarios"
                text="Fica nesta area quando o numero e usado no painel ConnectyHub do cliente."
              />
              <RuleRow
                icon={Network}
                title="API WhatsApp"
                text="Fica separada para empresas que usam nossa API em sistemas externos."
              />
            </div>
          </Panel>

          <Panel title="Sincronia com provedor" eyebrow="provedor / webhooks">
            <div className="space-y-4">
              <SyncWhatsAppInstancesButton />
              <div className="grid gap-3">
                <KpiStat label="conectadas" value={String(workspace.summary.connectedInstances)} tone="green" />
                <KpiStat label="aguardando qr" value={String(workspace.summary.pendingInstances)} tone="amber" />
                <KpiStat label="webhook ok" value={String(workspace.summary.webhookConfigured)} tone="cyan" />
              </div>
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
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10">
          <Icon className="h-4 w-4 text-cyan-300" />
        </div>
      </div>
      <p className="mt-3 font-mono text-[26px] font-bold leading-none" style={{ color: "var(--ch-text)" }}>
        {value}
      </p>
      <div className="mt-3">
        <NeonBadge tone={tone}>{detail}</NeonBadge>
      </div>
    </div>
  );
}

function buildCustomerWhatsappNotifications(workspace: AdminCustomerWhatsappWorkspace): ConnectyShellNotification[] {
  return workspace.instances
    .filter((instance) => instance.internalInstanceBlockedRunCount > 0)
    .flatMap((instance) => {
      if (instance.runtimeAlerts.length > 0) {
        return instance.runtimeAlerts.map((alert) => ({
          id: `customer-whatsapp-${alert.runId}`,
          title: "Protecao entre instancias",
          description: `${instance.organizationName}: ${alert.inputPreview || alert.outputSummary || "Conversa interna ignorada."}`,
          meta: `${alert.phoneNumber ?? alert.providerChatId ?? instance.phoneNumber ?? "numero nao informado"} / ${formatDate(alert.occurredAt)} / Gemini nao acionada`,
          occurredAt: alert.occurredAt,
          tone: "amber" as const,
        }));
      }

      return [{
        id: `customer-whatsapp-${instance.id}`,
        title: "Protecao entre instancias",
        description: `${instance.organizationName}: conversa interna ignorada.`,
        meta: `${instance.lastInternalInstanceBlockedPhone ?? instance.phoneNumber ?? "numero nao informado"} / ${formatDate(instance.lastInternalInstanceBlockedAt)} / Gemini nao acionada`,
        occurredAt: instance.lastInternalInstanceBlockedAt,
        tone: "amber" as const,
      }];
    })
    .sort((left, right) => dateTime(right.occurredAt) - dateTime(left.occurredAt))
    .slice(0, 12);
}

function InstanceIdentity({ instance }: { instance: AdminCustomerWhatsappInstance }) {
  const primaryAgentName = instance.agents[0]?.name ?? "sem vinculo";

  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-2.5">
        <WhatsappAvatar fallback={primaryAgentName || instance.organizationName} imageUrl={instance.profileImageUrl} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>
            {instance.organizationName}
          </p>
          <p className="truncate text-[11px] text-slate-500">
            {primaryAgentName}
          </p>
          <p className="font-mono text-[8px] uppercase tracking-wider text-slate-600">
            {instance.profileImageUrl ? "foto whatsapp" : "foto pendente"}
          </p>
        </div>
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

function PhoneCell({ instance }: { instance: AdminCustomerWhatsappInstance }) {
  return (
    <div className="min-w-[150px]">
      <p className="font-mono text-[11px]" style={{ color: "var(--ch-text)" }}>
        {instance.phoneNumber ?? "Sem numero"}
      </p>
      <p className="mt-1 max-w-[180px] truncate text-[11px] text-slate-500">
        {instance.displayName ?? instance.providerInstanceId ?? instance.provider}
      </p>
    </div>
  );
}

function AgentsCell({ instance }: { instance: AdminCustomerWhatsappInstance }) {
  if (instance.agents.length === 0) {
    return <NeonBadge tone="amber">sem vinculo</NeonBadge>;
  }

  return (
    <div className="min-w-[170px] space-y-1">
      {instance.agents.slice(0, 2).map((agent) => (
        <div key={agent.id} className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px]" style={{ color: "var(--ch-text)" }}>
            {agent.name}
          </span>
          <StatusBadge status={agentStatusTone(agent.status)} label={agent.status} />
        </div>
      ))}
      {instance.agents.length > 2 && (
        <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
          +{instance.agents.length - 2} agentes
        </p>
      )}
    </div>
  );
}

function CountCell({ total, active, activeLabel }: { total: number; active: number; activeLabel: string }) {
  return (
    <div className="min-w-[88px]">
      <p className="font-mono text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
        {total}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
        {active} {activeLabel}
      </p>
    </div>
  );
}

function MessageTelemetryCell({ instance }: { instance: AdminCustomerWhatsappInstance }) {
  return (
    <div className="min-w-[150px]">
      <p className="font-mono text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
        {instance.messageCount}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
        {instance.inboundMessageCount} in / {instance.outboundMessageCount} out
      </p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
        {instance.audioMessageCount} audio / {instance.mediaMessageCount} midia
      </p>
    </div>
  );
}

function AgentTelemetryCell({ instance }: { instance: AdminCustomerWhatsappInstance }) {
  if (instance.agentRunCount === 0) {
    return <NeonBadge tone="zinc">sem runs</NeonBadge>;
  }

  return (
    <div className="min-w-[150px] space-y-1">
      <div className="flex items-center gap-2">
        <p className="font-mono text-[14px] font-semibold" style={{ color: "var(--ch-text)" }}>
          {instance.agentRunCount}
        </p>
        <StatusBadge
          status={instance.failedAgentRunCount > 0 ? "warning" : "online"}
          label={instance.lastAgentRunStatus ?? "ia"}
        />
      </div>
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
        {instance.completedAgentRunCount} ok / {instance.failedAgentRunCount} falhas
      </p>
      {instance.internalInstanceBlockedRunCount > 0 ? (
        <NeonBadge tone="amber">{instance.internalInstanceBlockedRunCount} eco</NeonBadge>
      ) : null}
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
        media {formatDuration(instance.averageAgentRunSeconds)}
      </p>
    </div>
  );
}

function WebhookCell({ instance }: { instance: AdminCustomerWhatsappInstance }) {
  const hasError = Boolean(instance.lastWebhookError);

  return (
    <div className="min-w-[120px] space-y-1">
      <StatusBadge
        status={hasError ? "critical" : instance.webhookConfigured ? "online" : "warning"}
        label={hasError ? "erro" : instance.webhookConfigured ? "configurado" : "pendente"}
      />
      <p className="truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">
        {instance.lastWebhookStatus ?? "sem evento"}
      </p>
    </div>
  );
}

function LastSignalCell({ instance }: { instance: AdminCustomerWhatsappInstance }) {
  return (
    <div className="min-w-[130px]">
      <p className="text-[12px]" style={{ color: "var(--ch-text)" }}>
        {formatDate(instance.lastMessageAt ?? instance.lastHeartbeatAt ?? instance.updatedAt)}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
        {instance.lastMessageAt ? "mensagem" : instance.lastHeartbeatAt ? "heartbeat" : "atualizacao"}
      </p>
    </div>
  );
}

function RuleRow({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}>
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">{text}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div
      className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl p-8 text-center"
      style={{ background: "var(--ch-surface-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-[15px] font-semibold" style={{ color: "var(--ch-text)" }}>{title}</p>
      <p className="mt-2 max-w-md text-[13px] leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function instanceStatusTone(status: CustomerWhatsappInstanceStatus): StatusTone {
  if (status === "connected") return "online";
  if (status === "error" || status === "blocked") return "critical";
  if (status === "qr_pending" || status === "draft") return "warning";
  return "idle";
}

function agentStatusTone(status: string): StatusTone {
  if (status === "online") return "online";
  if (status === "needs_review" || status === "paused") return "warning";
  if (status === "archived") return "idle";
  return "idle";
}

function statusLabel(status: CustomerWhatsappInstanceStatus) {
  const labels: Record<CustomerWhatsappInstanceStatus, string> = {
    draft: "rascunho",
    qr_pending: "qr pendente",
    connected: "conectada",
    disconnected: "desconectada",
    blocked: "bloqueada",
    error: "erro",
    archived: "arquivada",
  };

  return labels[status] ?? status;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Sem registro";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Data invalida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) {
    return "sem dados";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
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
