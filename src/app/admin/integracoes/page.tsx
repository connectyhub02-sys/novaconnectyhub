import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ExternalLink,
  DatabaseZap,
  KeyRound,
  PlugZap,
  ShieldCheck,
  ShoppingBag,
  Truck,
  WalletCards,
} from "lucide-react";
import { AccessDenied } from "@/components/connectyhub-os/access-denied";
import { AdminIntegrationsClientActions, type AdminIntegrationClientTarget } from "@/components/connectyhub-os/admin-integrations-client-actions";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { CredentialVaultForm } from "@/components/connectyhub-os/credential-vault-form";
import { NeonBadge, PageHeader, Panel, StatusBadge } from "@/components/connectyhub-os/panel-primitives";
import { getIntegrationProviders, type IntegrationCategory, type IntegrationProviderStatus } from "@/lib/client-os/integrations";
import { maintenanceIntegrations } from "@/lib/maintenance-vault";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integracoes | Admin OS",
  description: "Catalogo admin de provedores, conexoes e eventos da Central de Integracoes.",
};

type AdminIntegrationSnapshot = {
  schemaReady: boolean;
  schemaError: string | null;
  providers: number;
  connections: number;
  webhooks: number;
  events: number;
  credentials: number;
  clients: AdminIntegrationClientTarget[];
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string | null;
  plan_code: string | null;
  status: string | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
};

type PaymentIntegrationRow = {
  organization_id: string;
  status: string | null;
  account_label: string | null;
  last_error: string | null;
};

type CountOrganizationRow = {
  organization_id: string;
};

const credentialIntegrationIds = new Set(["mercado-pago", "meta", "google-ads"]);

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

export default async function AdminIntegracoesPage() {
  await connection();
  const workspace = await getCurrentWorkspace();

  if (!workspace?.profile.isPlatformAdmin) {
    return <AccessDenied />;
  }

  const snapshot = await getAdminIntegrationSnapshot();
  const providers = getIntegrationProviders();
  const credentialIntegrations = maintenanceIntegrations
    .filter((integration) => credentialIntegrationIds.has(integration.id))
    .map((integration) => ({
      id: integration.id,
      name: integration.name,
      description: integration.description,
      fields: integration.fields.map((field) => ({
        label: field.label,
        env: field.env,
        aliases: field.aliases,
        kind: field.kind,
        requirement: field.requirement,
        help: field.help,
      })),
    }));

  return (
    <ConnectyShell mode="admin" isPlatformAdmin userLabel={workspace.profile.email ?? "CEO_HUMAN_ADM"}>
      <PageHeader
        eyebrow="Admin OS / Integracoes"
        title="Integracoes"
        description="Controle quais provedores existem, acompanhe conexoes por cliente e monitore webhooks/eventos."
        actions={
          <div className="flex flex-wrap gap-2">
            <NeonBadge tone={snapshot.schemaReady ? "green" : "amber"}>
              {snapshot.schemaReady ? "SQL ativo" : "SQL pendente"}
            </NeonBadge>
            <NeonBadge tone="cyan">{providers.length} provedores</NeonBadge>
            <NeonBadge tone="violet">{snapshot.clients.length} clientes</NeonBadge>
          </div>
        }
      />

      {!snapshot.schemaReady ? (
        <div
          className="mb-4 rounded-2xl px-4 py-3 text-[12px] leading-5 text-amber-100"
          style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.24)" }}
        >
          Aplique `supabase/migrations/0028_integration_hub.sql` no Supabase para ativar conexoes, endpoints universais, eventos e logs. Detalhe: {snapshot.schemaError ?? "tabelas ainda nao encontradas"}.
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-4">
        <AdminMetric icon={DatabaseZap} label="Provedores SQL" value={String(snapshot.providers)} detail="catalogo persistido" tone="cyan" />
        <AdminMetric icon={KeyRound} label="Credenciais" value={String(snapshot.credentials)} detail="plataforma" tone="green" />
        <AdminMetric icon={PlugZap} label="Webhooks" value={String(snapshot.webhooks)} detail="endpoints universais" tone="violet" />
        <AdminMetric icon={Activity} label="Eventos" value={String(snapshot.events)} detail="recebidos/processados" tone="amber" />
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <AdminActionCard
          description="Salve Client ID, Client Secret, redirect URI e webhook secret do app Mercado Pago da ConnectyHub."
          href="#credenciais-plataforma"
          icon={WalletCards}
          label="Configurar Mercado Pago"
          tone="green"
        />
        <AdminActionCard
          description="Abra o painel do cliente certo para conectar Mercado Pago ou criar Webhook Universal na conta dele."
          href="#clientes-integracoes"
          icon={ExternalLink}
          label="Integrar cliente"
          tone="cyan"
        />
        <AdminActionCard
          description="Cadastre Meta Ads e Google Ads para habilitar a proxima etapa de leitura de campanhas."
          href="#credenciais-plataforma"
          icon={BarChart3}
          label="Configurar Meta / Google"
          tone="violet"
        />
      </div>

      <div id="clientes-integracoes" className="mb-5 scroll-mt-6">
        <Panel title="Integrar cliente" eyebrow="acao operacional" tone="green">
          <AdminIntegrationsClientActions targets={snapshot.clients} />
        </Panel>
      </div>

      <div id="credenciais-plataforma" className="mb-5 scroll-mt-6">
        <Panel title="Credenciais de integracao" eyebrow="conectar provedores" tone="cyan">
          <CredentialVaultForm integrations={credentialIntegrations} />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Catalogo de provedores" eyebrow="plano de produto" tone="cyan">
          <div className="grid gap-3 md:grid-cols-2">
            {providers.map((provider) => {
              const Icon = categoryIcons[provider.category];
              return (
                <div
                  key={provider.id}
                  className="rounded-xl border p-3"
                  style={{ background: "var(--ch-surface-2)", borderColor: "var(--ch-border)" }}
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
                        <NeonBadge tone="cyan">{categoryLabels[provider.category]}</NeonBadge>
                      </div>
                      <p className="mt-3 text-[14px] font-semibold text-slate-100">{provider.name}</p>
                      <p className="mt-1 text-[12px] leading-5 text-slate-500">{provider.headline}</p>
                    </div>
                    <StatusBadge status={providerStatusTone(provider.status)} label={provider.status} />
                  </div>
                  <p className="mt-3 text-[12px] leading-5 text-slate-400">{provider.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {provider.items.map((item) => (
                      <span key={item} className="rounded-lg border px-2 py-1 text-[10px] text-slate-400" style={{ borderColor: "var(--ch-border)" }}>
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {getProviderActions(provider.id).map((action) => (
                      <Link
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-400/10"
                        href={action.href}
                        key={action.label}
                        style={{ borderColor: "var(--ch-border)" }}
                      >
                        <action.icon className="h-3.5 w-3.5" />
                        {action.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Ordem de implantacao" eyebrow="governanca" tone="amber">
          <div className="space-y-3">
            {[
              ["1", "Mercado Pago", "Espelhar status sem alterar checkout existente."],
              ["2", "Webhook Universal", "Criar entrada generica assinada para sistemas externos."],
              ["3", "Meta e Google", "Modo leitura para acompanhar campanhas antes da IA executar trafego."],
              ["4", "E-commerce, Agenda e Envios", "Ferramentas internas primeiro; integracoes quando a conta externa for necessaria."],
            ].map(([step, title, detail]) => (
              <div key={step} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-xl border p-3" style={{ borderColor: "var(--ch-border)", background: "var(--ch-surface-2)" }}>
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-400/10 font-mono text-[11px] text-cyan-200">{step}</span>
                <div>
                  <p className="text-[12px] font-semibold text-slate-100">{title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </ConnectyShell>
  );
}

async function getAdminIntegrationSnapshot(): Promise<AdminIntegrationSnapshot> {
  try {
    const client = createServiceClient();
    const [providers, connections, webhooks, events, credentials, clients] = await Promise.all([
      countRows(client, "integration_providers"),
      countRows(client, "organization_integrations"),
      countRows(client, "integration_webhook_endpoints"),
      countRows(client, "integration_events"),
      countRows(client, "integration_credentials"),
      getAdminIntegrationClientTargets(client),
    ]);
    const firstError = [providers, connections, webhooks, events].find((item) => item.error)?.error ?? null;

    return {
      schemaReady: !firstError,
      schemaError: firstError,
      providers: providers.count,
      connections: connections.count,
      webhooks: webhooks.count,
      events: events.count,
      credentials: credentials.count,
      clients,
    };
  } catch (error) {
    return {
      schemaReady: false,
      schemaError: error instanceof Error ? error.message : "Supabase indisponivel.",
      providers: 0,
      connections: 0,
      webhooks: 0,
      events: 0,
      credentials: 0,
      clients: [],
    };
  }
}

async function countRows(client: ReturnType<typeof createServiceClient>, table: string) {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true });

  return {
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

async function getAdminIntegrationClientTargets(client: ReturnType<typeof createServiceClient>): Promise<AdminIntegrationClientTarget[]> {
  const { data: organizations, error } = await client
    .from("organizations")
    .select("id, name, slug, owner_id, plan_code, status, created_at")
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    return [];
  }

  const organizationRows = (organizations ?? []) as OrganizationRow[];
  const organizationIds = organizationRows.map((organization) => organization.id);
  const ownerIds = organizationRows.map((organization) => organization.owner_id).filter((id): id is string => Boolean(id));

  if (organizationRows.length === 0) {
    return [];
  }

  const [profilesResult, paymentsResult, webhookResult, eventsResult] = await Promise.all([
    ownerIds.length > 0
      ? client.from("profiles").select("id, email, full_name, company_name").in("id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
    client
      .from("sales_catalog_payment_integrations")
      .select("organization_id, status, account_label, last_error")
      .eq("provider", "mercado_pago")
      .in("organization_id", organizationIds),
    client
      .from("integration_webhook_endpoints")
      .select("organization_id")
      .in("organization_id", organizationIds),
    client
      .from("integration_events")
      .select("organization_id")
      .in("organization_id", organizationIds),
  ]);

  const profilesById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const paymentsByOrg = new Map(((paymentsResult.data ?? []) as PaymentIntegrationRow[]).map((payment) => [payment.organization_id, payment]));
  const webhookCountByOrg = countByOrganization((webhookResult.data ?? []) as CountOrganizationRow[]);
  const eventCountByOrg = countByOrganization((eventsResult.data ?? []) as CountOrganizationRow[]);

  return organizationRows.map((organization) => {
    const profile = organization.owner_id ? profilesById.get(organization.owner_id) ?? null : null;
    const payment = paymentsByOrg.get(organization.id) ?? null;

    return {
      companyId: organization.id,
      companyName: organization.name,
      planCode: organization.plan_code,
      status: organization.status,
      ownerUserId: organization.owner_id,
      ownerEmail: profile?.email ?? null,
      ownerName: profile?.full_name ?? profile?.company_name ?? null,
      mercadoPagoStatus: payment?.status ?? null,
      mercadoPagoLabel: payment?.account_label ?? null,
      mercadoPagoError: payment?.last_error ?? null,
      webhookCount: webhookCountByOrg.get(organization.id) ?? 0,
      eventCount: eventCountByOrg.get(organization.id) ?? 0,
    };
  });
}

function countByOrganization(rows: CountOrganizationRow[]) {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
  });

  return counts;
}

function getProviderActions(providerId: string): Array<{ label: string; href: string; icon: LucideIcon }> {
  if (providerId === "mercado-pago") {
    return [
      { label: "Configurar app", href: "#credenciais-plataforma", icon: KeyRound },
      { label: "Integrar cliente", href: "#clientes-integracoes", icon: ExternalLink },
    ];
  }

  if (providerId === "webhook-universal") {
    return [{ label: "Criar no cliente", href: "#clientes-integracoes", icon: PlugZap }];
  }

  if (providerId === "meta-ads" || providerId === "google-growth") {
    return [{ label: "Salvar credenciais", href: "#credenciais-plataforma", icon: KeyRound }];
  }

  return [{ label: "Ver proxima fase", href: "#credenciais-plataforma", icon: ShieldCheck }];
}

function AdminActionCard({
  description,
  href,
  icon: Icon,
  label,
  tone,
}: {
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
  tone: "green" | "cyan" | "violet";
}) {
  const colors = {
    cyan: "34,211,238",
    green: "52,211,153",
    violet: "167,139,250",
  }[tone];

  return (
    <Link
      className="group rounded-2xl p-4 transition hover:translate-y-[-1px]"
      href={href}
      style={{ background: "var(--ch-surface)", border: "1px solid var(--ch-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">acao real</p>
          <p className="mt-1 text-[15px] font-semibold text-slate-100">{label}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `rgba(${colors},0.14)`, color: `rgb(${colors})` }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-slate-400">{description}</p>
    </Link>
  );
}

function providerStatusTone(status: IntegrationProviderStatus): "online" | "warning" | "idle" {
  if (status === "active" || status === "built_in") return "online";
  if (status === "next") return "warning";
  return "idle";
}

function AdminMetric({
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
