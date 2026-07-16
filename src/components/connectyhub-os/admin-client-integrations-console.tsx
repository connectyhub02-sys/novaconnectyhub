import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BellRing, CheckCircle2, Eye, Filter, History, PlugZap, RefreshCw, ShieldCheck } from "lucide-react";
import {
  DataTable,
  KpiStat,
  NeonBadge,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/components/connectyhub-os/panel-primitives";
import type {
  AdminClientIntegrationCompany,
  AdminClientIntegrationAlert,
  AdminClientIntegrationAlertSeverity,
  AdminClientIntegrationEvent,
  AdminClientIntegrationEventStatus,
  AdminClientIntegrationFilters,
  AdminClientIntegrationProviderId,
  AdminClientIntegrationStatus,
  AdminClientIntegrationsOverview,
  AdminClientProviderStatus,
  AdminClientProviderSummary,
} from "@/lib/admin/client-integrations";
import { registerClientIntegrationAdminAction } from "@/lib/admin/client-integration-actions";
import type { StatusTone, Tone } from "@/lib/connectyhub-os-data";

type AdminIntegrationAction = "admin_alert_acknowledged" | "admin_retest_requested";

export function AdminClientIntegrationsConsole({ overview }: { overview: AdminClientIntegrationsOverview }) {
  const totalAlerts = overview.criticalAlerts + overview.warningAlerts + overview.infoAlerts;
  const rows = overview.companies.map((company) => [
    <CompanyCell key={`${company.id}-company`} company={company} filters={overview.filters} />,
    providerCell(company, "meta-ads"),
    providerCell(company, "google-growth"),
    providerCell(company, "mercado-pago"),
    providerCell(company, "webhook-universal"),
    <span key={`${company.id}-last`} className="font-mono text-[11px] text-slate-400">
      {formatDateTime(company.lastActivityAt)}
    </span>,
    <IssueCell key={`${company.id}-issue`} company={company} />,
  ]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow="Clientes / Integracoes"
        title="Integracoes dos clientes"
        description="Controle operacional das conexoes externas criadas no painel do usuario."
        actions={
          <Link
            href="/admin/clientes"
            className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 font-mono text-[10px] uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-400/10"
            style={{ borderColor: "rgba(34,211,238,0.32)" }}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Clientes
          </Link>
        }
      />

      {!overview.schemaReady && (
        <Panel title="Leitura parcial" eyebrow="diagnostico" tone="amber" compact>
          <div className="flex items-start gap-3 text-[12px] leading-5 text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <p className="font-semibold">Algumas tabelas nao puderam ser lidas. A tela continua funcionando com os dados disponiveis.</p>
              <ul className="mt-2 grid gap-1 font-mono text-[10px] text-amber-200/80">
                {overview.schemaMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiStat label="Clientes" value={String(overview.totalCompanies)} tone="cyan" />
        <KpiStat label="Conexoes ativas" value={String(overview.connectedLinks)} tone="green" />
        <KpiStat label="Pendencias" value={String(overview.warningLinks)} tone="amber" />
        <KpiStat label="Erros" value={String(overview.errorLinks)} tone="rose" />
        <KpiStat label="Alertas" value={String(totalAlerts)} tone={overview.criticalAlerts > 0 ? "rose" : totalAlerts > 0 ? "amber" : "green"} />
        <KpiStat label="Ultima atividade" value={formatDateShort(overview.lastActivityAt)} tone="violet" />
      </div>

      <FiltersPanel overview={overview} />

      <OperationalAlertsPanel overview={overview} />

      <Panel title="Cobertura por provedor" eyebrow="status geral" tone="cyan">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {overview.providers.map((provider) => (
            <ProviderSummaryCard key={provider.providerId} provider={provider} />
          ))}
        </div>
      </Panel>

      <Panel title="Clientes e conexoes" eyebrow="controle visual" tone="violet">
        {overview.companies.length > 0 ? (
          <DataTable
            columns={["Cliente", "Meta Ads", "Google Ads", "Mercado Pago", "Webhook", "Ultima atividade", "Pendencia"]}
            rows={rows}
          />
        ) : (
          <EmptyState
            title={overview.totalCompanies > 0 ? "Nenhum cliente encontrado nesse filtro." : "Nenhuma empresa cliente encontrada."}
            description={
              overview.totalCompanies > 0
                ? "Ajuste provedor ou status para ampliar a visao."
                : "A lista usa organizacoes com slug iniciado por empresa-cliente-."
            }
          />
        )}
      </Panel>

      <SelectedCompanyPanel company={overview.selectedCompany} filters={overview.filters} />

      <RecentEventsPanel events={overview.recentEvents} filters={overview.filters} />
    </div>
  );
}

function FiltersPanel({ overview }: { overview: AdminClientIntegrationsOverview }) {
  const hasFilters = overview.filters.provider !== "all" || overview.filters.status !== "all" || overview.filters.companyId;

  return (
    <Panel title="Filtros operacionais" eyebrow="controle admin" tone="cyan" compact>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12px] text-slate-300">
            <Filter className="h-4 w-4 text-cyan-300" />
            <span>
              Exibindo {overview.filteredCompanies} de {overview.totalCompanies} cliente(s)
            </span>
          </div>
          {hasFilters && (
            <Link
              href="/admin/clientes/integracoes"
              className="rounded-xl border px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-slate-300 transition hover:bg-slate-800/60"
              style={{ borderColor: "var(--ch-border)" }}
            >
              Limpar filtros
            </Link>
          )}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <FilterGroup
            label="Provedor"
            options={overview.providerFilterOptions}
            active={overview.filters.provider}
            getHref={(value) => filterHref(overview.filters, { provider: value, companyId: null })}
          />
          <FilterGroup
            label="Status"
            options={overview.statusFilterOptions}
            active={overview.filters.status}
            getHref={(value) => filterHref(overview.filters, { status: value, companyId: null })}
          />
        </div>
      </div>
    </Panel>
  );
}

function OperationalAlertsPanel({ overview }: { overview: AdminClientIntegrationsOverview }) {
  const tone = overview.criticalAlerts > 0 ? "rose" : overview.warningAlerts > 0 ? "amber" : "green";
  const totalAlerts = overview.criticalAlerts + overview.warningAlerts + overview.infoAlerts;

  return (
    <Panel
      title="Alertas operacionais"
      eyebrow="prioridade admin"
      tone={tone}
      action={<NeonBadge tone={tone}>{totalAlerts} alerta(s)</NeonBadge>}
    >
      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <AlertSummaryPill label="Criticos" value={overview.criticalAlerts} tone="rose" />
          <AlertSummaryPill label="Atencao" value={overview.warningAlerts} tone="amber" />
          <AlertSummaryPill label="Monitorar" value={overview.infoAlerts} tone="cyan" />
        </div>

        {overview.alerts.length > 0 ? (
          <div className="grid gap-2 xl:grid-cols-2">
            {overview.alerts.slice(0, 8).map((alert) => (
              <OperationalAlertCard key={alert.id} alert={alert} filters={overview.filters} />
            ))}
          </div>
        ) : (
          <div
            className="grid place-items-center rounded-2xl px-4 py-8 text-center"
            style={{ background: "var(--ch-panel-2)", border: "1px dashed var(--ch-border)" }}
          >
            <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-400" />
            <p className="text-[13px] font-semibold text-slate-200">Nenhum alerta no filtro atual.</p>
            <p className="mt-1 text-[12px] text-slate-500">Erros, OAuth pendente e conexoes sem atividade recente aparecerao aqui.</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function AlertSummaryPill({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3"
      style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-slate-600">{label}</p>
        <p className={`mt-1 font-mono text-[18px] font-bold ${toneText(tone)}`}>{value}</p>
      </div>
      <BellRing className={`h-4 w-4 ${toneText(tone)}`} />
    </div>
  );
}

function OperationalAlertCard({
  alert,
  filters,
}: {
  alert: AdminClientIntegrationAlert;
  filters: AdminClientIntegrationFilters;
}) {
  const tone = alertSeverityTone(alert.severity);
  const logsHref = `${filterHref(filters, { provider: alert.providerId, companyId: alert.companyId })}#historico-cliente`;

  return (
    <div
      className="min-w-0 rounded-2xl p-3"
      style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge status={alertSeverityStatus(alert.severity)} label={alertSeverityLabel(alert.severity)} />
            <span className="font-mono text-[9px] uppercase tracking-wide text-slate-600">{alert.providerLabel}</span>
          </div>
          <p className="truncate text-[13px] font-semibold text-slate-100">{alert.companyName}</p>
          <p className={`mt-1 text-[12px] font-semibold ${toneText(tone)}`}>{alert.title}</p>
        </div>
        <Link href={logsHref} className="rounded-lg p-1 transition hover:bg-white/5" aria-label="Abrir logs do alerta">
          <ArrowUpRight className={`h-4 w-4 shrink-0 ${toneText(tone)}`} />
        </Link>
      </div>
      <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-slate-400">{alert.detail}</p>
      <p className="mt-3 font-mono text-[9px] uppercase tracking-wide text-slate-600">
        Ultima atividade: {formatDateShort(alert.lastActivityAt)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AdminIntegrationActionForm
          adminAction="admin_alert_acknowledged"
          label="Acompanhar"
          organizationId={alert.companyId}
          companyName={alert.companyName}
          providerId={alert.providerId}
          providerLabel={alert.providerLabel}
          severity={alert.severity}
          alertTitle={alert.title}
          alertDetail={alert.detail}
          note={`Alerta acompanhado no painel admin: ${alert.title}.`}
        />
        <AdminIntegrationActionForm
          adminAction="admin_retest_requested"
          label="Solicitar reteste"
          organizationId={alert.companyId}
          companyName={alert.companyName}
          providerId={alert.providerId}
          providerLabel={alert.providerLabel}
          severity={alert.severity}
          alertTitle={alert.title}
          alertDetail={alert.detail}
          note={`Reteste solicitado pelo admin para investigar: ${alert.title}.`}
        />
        <Link
          href={logsHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 font-mono text-[9px] uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-400/10"
          style={{ borderColor: "rgba(34,211,238,0.24)" }}
        >
          <History className="h-3 w-3" />
          Logs
        </Link>
      </div>
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  active,
  getHref,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  active: T;
  getHref: (value: T) => string;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = option.id === active;

          return (
            <Link
              key={option.id}
              href={getHref(option.id)}
              className={`rounded-xl border px-3 py-2 font-mono text-[10px] uppercase tracking-wide transition ${
                isActive ? "text-cyan-200" : "text-slate-400 hover:text-slate-100"
              }`}
              style={{
                borderColor: isActive ? "rgba(34,211,238,0.48)" : "var(--ch-border)",
                background: isActive ? "rgba(34,211,238,0.1)" : "rgba(255,255,255,0.02)",
              }}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CompanyCell({ company, filters }: { company: AdminClientIntegrationCompany; filters: AdminClientIntegrationFilters }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-[13px] font-semibold text-slate-100">{company.name}</p>
        <StatusBadge status={statusTone(company.health)} label={companyHealthLabel(company.health)} />
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-wide text-slate-600">
        {company.slug && <span className="max-w-[220px] truncate">{company.slug}</span>}
        {company.planCode && <NeonBadge tone="zinc">{company.planCode}</NeonBadge>}
        {company.status && <span>{company.status}</span>}
      </div>
      <Link
        href={filterHref(filters, { companyId: company.id })}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-400/10"
        style={{ borderColor: "rgba(34,211,238,0.24)" }}
      >
        <Eye className="h-3 w-3" />
        Detalhar
      </Link>
    </div>
  );
}

function ProviderSummaryCard({ provider }: { provider: AdminClientProviderSummary }) {
  const coverage = provider.total > 0 ? Math.round((provider.connected / provider.total) * 100) : 0;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-100">{provider.label}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-slate-600">{coverage}% de cobertura</p>
        </div>
        <NeonBadge tone={provider.error > 0 ? "rose" : provider.warning > 0 ? "amber" : "green"}>
          {provider.connected}/{provider.total}
        </NeonBadge>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        <TinyCount label="ok" value={provider.connected} tone="green" />
        <TinyCount label="pend." value={provider.warning} tone="amber" />
        <TinyCount label="erro" value={provider.error} tone="rose" />
        <TinyCount label="vazio" value={provider.notConfigured} tone="zinc" />
      </div>
    </div>
  );
}

function TinyCount({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="min-w-0 rounded-xl px-2 py-2 text-center" style={{ background: "rgba(255,255,255,0.025)" }}>
      <p className="font-mono text-[13px] font-bold text-slate-100">{value}</p>
      <p className={`truncate font-mono text-[8px] uppercase tracking-wide ${toneText(tone)}`}>{label}</p>
    </div>
  );
}

function providerCell(company: AdminClientIntegrationCompany, providerId: AdminClientIntegrationProviderId) {
  const provider = company.providers.find((item) => item.providerId === providerId);

  if (!provider) {
    return <StatusBadge key={`${company.id}-${providerId}`} status="idle" label="Sem dados" />;
  }

  return <ProviderCell key={`${company.id}-${providerId}`} provider={provider} />;
}

function ProviderCell({ provider }: { provider: AdminClientProviderStatus }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <StatusBadge status={statusTone(provider.status)} label={provider.statusLabel} />
      {provider.accountLabel && (
        <p className="max-w-[190px] truncate font-mono text-[10px] text-slate-300">{provider.accountLabel}</p>
      )}
      <p className="max-w-[220px] truncate text-[11px] text-slate-500">{provider.detail}</p>
    </div>
  );
}

function IssueCell({ company }: { company: AdminClientIntegrationCompany }) {
  if (!company.issue) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-emerald-300">
        <CheckCircle2 className="h-4 w-4" />
        Sem pendencia critica
      </div>
    );
  }

  return <p className="max-w-[260px] text-[12px] leading-5 text-slate-300">{company.issue}</p>;
}

function SelectedCompanyPanel({
  company,
  filters,
}: {
  company: AdminClientIntegrationCompany | null;
  filters: AdminClientIntegrationFilters;
}) {
  if (!company) {
    return (
      <Panel title="Detalhe por cliente" eyebrow="operacao" tone="cyan">
        <EmptyState
          title="Selecione um cliente para detalhar."
          description="Use o botao Detalhar na tabela para ver provedores, pendencias e eventos daquele cliente."
        />
      </Panel>
    );
  }

  const eventRows = company.events.map((event) => eventRow(event));

  return (
    <Panel title={company.name} eyebrow="detalhe do cliente" tone="cyan">
      <div className="grid gap-3 lg:grid-cols-4">
        {company.providers.map((provider) => (
          <ProviderDetailCard
            key={provider.providerId}
            provider={provider}
            filters={filters}
            companyId={company.id}
            companyName={company.name}
          />
        ))}
      </div>

      <div
        id="historico-cliente"
        className="mt-4 scroll-mt-24 rounded-2xl p-4"
        style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">historico</p>
            <h3 className="text-[14px] font-semibold text-slate-100">Eventos do cliente</h3>
          </div>
          <NeonBadge tone={company.events.length > 0 ? "cyan" : "zinc"}>{company.events.length}</NeonBadge>
        </div>
        {eventRows.length > 0 ? (
          <DataTable columns={["Horario", "Provedor", "Acao", "Status", "Resumo"]} rows={eventRows} />
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-[12px] text-slate-500" style={{ borderColor: "var(--ch-border)" }}>
            Nenhum evento registrado para este cliente nas ultimas leituras.
          </p>
        )}
      </div>
    </Panel>
  );
}

function ProviderDetailCard({
  provider,
  filters,
  companyId,
  companyName,
}: {
  provider: AdminClientProviderStatus;
  filters: AdminClientIntegrationFilters;
  companyId: string;
  companyName: string;
}) {
  const logsHref = `${filterHref(filters, { provider: provider.providerId, companyId })}#historico-cliente`;

  return (
    <div className="min-w-0 rounded-2xl p-4" style={{ background: "var(--ch-panel-2)", border: "1px solid var(--ch-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-100">{provider.label}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-slate-600">{formatDateShort(provider.lastActivityAt)}</p>
        </div>
        <StatusBadge status={statusTone(provider.status)} label={provider.statusLabel} />
      </div>
      <p className="mt-3 min-h-10 text-[12px] leading-5 text-slate-300">{provider.detail}</p>
      {provider.accountLabel && (
        <p className="mt-3 truncate rounded-xl px-3 py-2 font-mono text-[10px] text-slate-300" style={{ background: "rgba(255,255,255,0.035)" }}>
          {provider.accountLabel}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={filterHref(filters, { provider: provider.providerId, companyId })}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 font-mono text-[9px] uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-400/10"
          style={{ borderColor: "rgba(34,211,238,0.24)" }}
        >
          <Filter className="h-3 w-3" />
          Filtrar
        </Link>
        <Link
          href={logsHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 font-mono text-[9px] uppercase tracking-wide text-slate-300 transition hover:bg-white/5"
          style={{ borderColor: "var(--ch-border)" }}
        >
          <History className="h-3 w-3" />
          Logs
        </Link>
        <AdminIntegrationActionForm
          adminAction="admin_retest_requested"
          label="Solicitar reteste"
          organizationId={companyId}
          companyName={companyName}
          providerId={provider.providerId}
          providerLabel={provider.label}
          severity={provider.status === "error" ? "critical" : provider.status === "warning" ? "warning" : "info"}
          alertTitle={`${provider.label} - ${provider.statusLabel}`}
          alertDetail={provider.detail}
          note={`Reteste solicitado pelo admin no detalhe do cliente para ${provider.label}.`}
        />
      </div>
    </div>
  );
}

function AdminIntegrationActionForm({
  adminAction,
  label,
  organizationId,
  companyName,
  providerId,
  providerLabel,
  severity,
  alertTitle,
  alertDetail,
  note,
}: {
  adminAction: AdminIntegrationAction;
  label: string;
  organizationId: string;
  companyName: string;
  providerId: AdminClientIntegrationProviderId;
  providerLabel: string;
  severity: AdminClientIntegrationAlertSeverity;
  alertTitle: string;
  alertDetail: string;
  note: string;
}) {
  const Icon = adminAction === "admin_alert_acknowledged" ? ShieldCheck : RefreshCw;
  const toneClass = adminAction === "admin_alert_acknowledged"
    ? "text-emerald-300 hover:bg-emerald-400/10"
    : "text-amber-300 hover:bg-amber-400/10";

  return (
    <form action={registerClientIntegrationAdminAction} className="inline-flex">
      <input type="hidden" name="adminAction" value={adminAction} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="companyName" value={companyName} />
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="providerLabel" value={providerLabel} />
      <input type="hidden" name="severity" value={severity} />
      <input type="hidden" name="alertTitle" value={alertTitle} />
      <input type="hidden" name="alertDetail" value={alertDetail} />
      <input type="hidden" name="note" value={note} />
      <button
        type="submit"
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 font-mono text-[9px] uppercase tracking-wide transition ${toneClass}`}
        style={{ borderColor: "var(--ch-border)" }}
      >
        <Icon className="h-3 w-3" />
        {label}
      </button>
    </form>
  );
}

function RecentEventsPanel({ events, filters }: { events: AdminClientIntegrationEvent[]; filters: AdminClientIntegrationFilters }) {
  return (
    <Panel title="Historico recente" eyebrow="eventos de integracao" tone="amber">
      {events.length > 0 ? (
        <DataTable columns={["Horario", "Cliente", "Provedor", "Acao", "Status"]} rows={events.slice(0, 10).map((event) => [
          <span key={`${event.id}-created`} className="font-mono text-[10px] text-slate-400">{formatDateTime(event.createdAt)}</span>,
          <Link
            key={`${event.id}-company`}
            href={filterHref(filters, { companyId: event.companyId })}
            className="text-[12px] font-semibold text-cyan-300 transition hover:text-cyan-100"
          >
            {event.companyName}
          </Link>,
          <span key={`${event.id}-provider`} className="text-[12px] text-slate-300">{event.providerLabel}</span>,
          <span key={`${event.id}-action`} className="text-[12px] text-slate-300">{event.action}</span>,
          <StatusBadge key={`${event.id}-status`} status={eventTone(event.status)} label={eventStatusLabel(event.status)} />,
        ])} />
      ) : (
        <div className="grid place-items-center rounded-2xl px-4 py-10 text-center" style={{ background: "var(--ch-panel-2)", border: "1px dashed var(--ch-border)" }}>
          <History className="mb-3 h-8 w-8 text-slate-500" />
          <p className="text-[13px] font-semibold text-slate-200">Nenhum evento de integracao encontrado.</p>
          <p className="mt-1 text-[12px] text-slate-500">Quando clientes conectarem ou testarem provedores, os eventos aparecerao aqui.</p>
        </div>
      )}
    </Panel>
  );
}

function eventRow(event: AdminClientIntegrationEvent) {
  return [
    <span key={`${event.id}-created`} className="font-mono text-[10px] text-slate-400">{formatDateTime(event.createdAt)}</span>,
    <span key={`${event.id}-provider`} className="text-[12px] text-slate-300">{event.providerLabel}</span>,
    <span key={`${event.id}-action`} className="text-[12px] text-slate-300">{event.action}</span>,
    <StatusBadge key={`${event.id}-status`} status={eventTone(event.status)} label={eventStatusLabel(event.status)} />,
    <span key={`${event.id}-message`} className="line-clamp-2 max-w-[420px] text-[12px] text-slate-400">{event.message ?? "--"}</span>,
  ];
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div
      className="grid place-items-center rounded-2xl px-4 py-12 text-center"
      style={{ background: "var(--ch-panel-2)", border: "1px dashed var(--ch-border)" }}
    >
      <PlugZap className="mb-3 h-8 w-8 text-slate-500" />
      <p className="text-[13px] font-semibold text-slate-200">{title}</p>
      <p className="mt-1 text-[12px] text-slate-500">{description}</p>
    </div>
  );
}

function filterHref(filters: AdminClientIntegrationFilters, patch: Partial<AdminClientIntegrationFilters>) {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();

  if (next.provider && next.provider !== "all") params.set("provider", next.provider);
  if (next.status && next.status !== "all") params.set("status", next.status);
  if (next.companyId) params.set("company", next.companyId);

  const query = params.toString();
  return query ? `/admin/clientes/integracoes?${query}` : "/admin/clientes/integracoes";
}

function statusTone(status: AdminClientIntegrationStatus): StatusTone {
  if (status === "connected") return "online";
  if (status === "warning") return "warning";
  if (status === "error") return "critical";
  return "idle";
}

function eventTone(status: AdminClientIntegrationEventStatus): StatusTone {
  if (status === "success") return "online";
  if (status === "warning") return "warning";
  return "critical";
}

function companyHealthLabel(status: AdminClientIntegrationStatus) {
  if (status === "connected") return "Com conexoes";
  if (status === "warning") return "Pendencias";
  if (status === "error") return "Erro";
  return "Sem conexoes";
}

function eventStatusLabel(status: AdminClientIntegrationEventStatus) {
  if (status === "success") return "Sucesso";
  if (status === "warning") return "Aviso";
  return "Erro";
}

function alertSeverityTone(severity: AdminClientIntegrationAlertSeverity): Tone {
  if (severity === "critical") return "rose";
  if (severity === "warning") return "amber";
  return "cyan";
}

function alertSeverityStatus(severity: AdminClientIntegrationAlertSeverity): StatusTone {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "idle";
}

function alertSeverityLabel(severity: AdminClientIntegrationAlertSeverity) {
  if (severity === "critical") return "Critico";
  if (severity === "warning") return "Atencao";
  return "Monitorar";
}

function toneText(tone: Tone) {
  if (tone === "green") return "text-emerald-400";
  if (tone === "amber") return "text-amber-400";
  if (tone === "rose") return "text-rose-400";
  if (tone === "cyan") return "text-cyan-400";
  return "text-slate-500";
}

function formatDateTime(value: string | null) {
  if (!value) return "--";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatDateShort(value: string | null) {
  if (!value) return "--";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
