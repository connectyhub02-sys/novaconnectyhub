import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { AccountInvoiceActions } from "@/components/connectyhub-os/account-invoice-actions";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { ensureStarterOrganization, getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fatura | ConnectyHub",
  description: "Detalhes da fatura da conta ConnectyHub.",
};

type InvoiceRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  cycle_id: string | null;
  status: string;
  currency: string;
  subtotal_brl: number | string | null;
  discount_brl: number | string | null;
  total_brl: number | string | null;
  due_at: string | null;
  paid_at: string | null;
  provider: string | null;
  provider_invoice_id: string | null;
  provider_payment_id: string | null;
  created_at: string | null;
};

type InvoiceItemRow = {
  id: string;
  item_type: string;
  description: string;
  quantity: number | string | null;
  unit_price_brl: number | string | null;
  total_brl: number | string | null;
  credit_amount: number | string | null;
  created_at: string | null;
};

type PaymentRow = {
  id: string;
  status: string;
  provider: string | null;
  provider_payment_id: string | null;
  provider_status: string | null;
  amount_brl: number | string | null;
  paid_at: string | null;
  created_at: string | null;
};

type SubscriptionRow = {
  id: string;
  plan_code: string;
  status: string;
};

export default async function DashboardInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  await connection();
  const { invoiceId } = await params;

  if (!isUuid(invoiceId)) {
    notFound();
  }

  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect(`/login?next=${encodeURIComponent(`/dashboard/minha-conta/faturas/${invoiceId}`)}`);
  }

  const organization = workspace.organization ?? await ensureStarterOrganization();

  if (!organization) {
    notFound();
  }

  const client = createServiceClient();
  const [{ data: invoice, error: invoiceError }, { data: items, error: itemsError }, { data: payments, error: paymentsError }] = await Promise.all([
    client
      .from("billing_invoices")
      .select("id, organization_id, subscription_id, cycle_id, status, currency, subtotal_brl, discount_brl, total_brl, due_at, paid_at, provider, provider_invoice_id, provider_payment_id, created_at")
      .eq("id", invoiceId)
      .eq("organization_id", organization.id)
      .maybeSingle<InvoiceRow>(),
    client
      .from("billing_invoice_items")
      .select("id, item_type, description, quantity, unit_price_brl, total_brl, credit_amount, created_at")
      .eq("invoice_id", invoiceId)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true })
      .returns<InvoiceItemRow[]>(),
    client
      .from("billing_payments")
      .select("id, status, provider, provider_payment_id, provider_status, amount_brl, paid_at, created_at")
      .eq("invoice_id", invoiceId)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(6)
      .returns<PaymentRow[]>(),
  ]);

  if (invoiceError || !invoice) {
    return (
      <InvoiceShell
        isPlatformAdmin={workspace.profile.isPlatformAdmin}
        userAvatarUrl={workspace.profile.avatarUrl}
        userLabel={workspace.profile.email ?? undefined}
        workspaceName={organization.name ?? workspace.profile.companyName ?? "Workspace"}
      >
        <InvoiceUnavailableState />
      </InvoiceShell>
    );
  }

  const subscription = invoice.subscription_id
    ? await loadSubscription(client, organization.id, invoice.subscription_id)
    : null;
  const invoiceItems = itemsError ? [] : (items ?? []);
  const invoicePayments = paymentsError ? [] : (payments ?? []);
  const detailLoadError = itemsError || paymentsError;

  return (
    <InvoiceShell
      activeHref="/dashboard/minha-conta"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
              Minha conta / Fatura
            </div>
            <h1 className="mt-3 text-[28px] font-black leading-tight text-white sm:text-[36px]">
              Fatura {shortId(invoice.id)}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              {organization.name} - {formatDate(invoice.created_at)}
            </p>
          </div>
          <AccountInvoiceActions />
        </div>

        {detailLoadError ? (
          <div className="rounded-[8px] border border-amber-300/35 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
            A fatura foi encontrada, mas alguns detalhes complementares nao carregaram agora. Tente atualizar a pagina em alguns instantes.
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-[#0c1422]/88 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.24)] print:border-slate-300 print:bg-white print:text-slate-950 print:shadow-none">
          <div className="flex flex-col gap-5 border-b border-white/10 pb-5 print:border-slate-200 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Cliente</p>
              <h2 className="mt-2 text-xl font-black text-white print:text-slate-950">{organization.name}</h2>
              <p className="mt-1 text-sm text-slate-400 print:text-slate-600">{workspace.profile.email ?? workspace.user.email}</p>
            </div>
            <div className="text-left sm:text-right">
              <StatusBadge status={invoice.status} />
              <p className="mt-3 font-mono text-2xl font-black text-white print:text-slate-950">{formatMoney(invoice.total_brl)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400 print:text-slate-600">
                Vencimento: {formatDate(invoice.due_at)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Info label="Plano" value={subscription?.plan_code ?? "Nao vinculado"} />
            <Info label="Pagamento" value={invoice.paid_at ? formatDate(invoice.paid_at) : "Pendente"} />
            <Info label="Provedor" value={invoice.provider ?? "interno"} />
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 print:border-slate-200">
            <div className="grid grid-cols-[1fr_90px_120px] gap-3 bg-white/[0.055] px-4 py-3 font-mono text-[10px] font-black uppercase tracking-wide text-slate-400 print:bg-slate-100 print:text-slate-600">
              <span>Item</span>
              <span className="text-right">Qtd</span>
              <span className="text-right">Total</span>
            </div>
            {invoiceItems.length ? invoiceItems.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_90px_120px] gap-3 border-t border-white/10 px-4 py-4 text-sm print:border-slate-200">
                <div className="min-w-0">
                  <p className="font-bold text-white print:text-slate-950">{item.description}</p>
                  <p className="mt-1 text-xs text-slate-400 print:text-slate-600">
                    {itemTypeLabel(item.item_type)} {toNumber(item.credit_amount) ? `- ${formatCredits(item.credit_amount)} creditos` : ""}
                  </p>
                </div>
                <span className="text-right font-mono font-bold text-slate-200 print:text-slate-700">{formatQuantity(item.quantity)}</span>
                <span className="text-right font-mono font-black text-white print:text-slate-950">{formatMoney(item.total_brl)}</span>
              </div>
            )) : (
              <div className="border-t border-white/10 px-4 py-4 text-sm font-semibold text-slate-400 print:border-slate-200">
                Nenhum item registrado.
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Info label="Subtotal" value={formatMoney(invoice.subtotal_brl)} />
            <Info label="Desconto" value={formatMoney(invoice.discount_brl)} />
            <Info label="Total" value={formatMoney(invoice.total_brl)} highlight />
          </div>

          {invoicePayments.length ? (
            <div className="mt-6">
              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400 print:text-slate-600">Pagamentos</h3>
              <div className="mt-3 space-y-3">
                {invoicePayments.map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 print:border-slate-200 print:bg-white">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-mono text-sm font-black text-white print:text-slate-950">{formatMoney(payment.amount_brl)}</p>
                        <p className="mt-1 text-xs text-slate-400 print:text-slate-600">
                          {payment.provider ?? "interno"} - {payment.provider_status ?? payment.status}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-300 print:text-slate-700">{formatDateTime(payment.paid_at ?? payment.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-xs leading-5 text-slate-400 print:border-slate-200 print:bg-slate-50 print:text-slate-600">
            Fatura interna gerada pela ConnectyHub. IDs do provedor aparecem apenas quando retornados pelo processador de pagamento.
          </div>
        </div>
      </section>
    </InvoiceShell>
  );
}

function InvoiceShell({
  activeHref = "/dashboard/minha-conta",
  children,
  isPlatformAdmin,
  userAvatarUrl,
  userLabel,
  workspaceName,
}: {
  activeHref?: string;
  children: ReactNode;
  isPlatformAdmin: boolean;
  userAvatarUrl: string | null;
  userLabel?: string;
  workspaceName: string;
}) {
  return (
    <ConnectyShell
      activeHref={activeHref}
      isPlatformAdmin={isPlatformAdmin}
      mode="client"
      userAvatarUrl={userAvatarUrl}
      userLabel={userLabel}
      workspaceName={workspaceName}
    >
      {children}
    </ConnectyShell>
  );
}

function InvoiceUnavailableState() {
  return (
    <section className="rounded-[8px] border border-rose-300/25 bg-rose-950/20 p-6">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-rose-200">
        Minha conta / Fatura
      </div>
      <h1 className="mt-3 text-2xl font-black text-white">Fatura indisponivel</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
        Nao encontramos esta fatura para a sua empresa. Volte para Minha Conta e tente abrir novamente.
      </p>
      <AccountInvoiceActions />
    </section>
  );
}

async function loadSubscription(client: ReturnType<typeof createServiceClient>, organizationId: string, subscriptionId: string) {
  const { data } = await client
    .from("organization_subscriptions")
    .select("id, plan_code, status")
    .eq("id", subscriptionId)
    .eq("organization_id", organizationId)
    .maybeSingle<SubscriptionRow>();

  return data ?? null;
}

function Info({ highlight = false, label, value }: { highlight?: boolean; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 print:border-slate-200 print:bg-slate-50">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={highlight ? "mt-2 font-mono text-lg font-black text-white print:text-slate-950" : "mt-2 text-sm font-bold text-slate-100 print:text-slate-800"}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-full border border-cyan-300/30 bg-cyan-300/12 px-3 font-mono text-[10px] font-black uppercase tracking-wide text-cyan-100 print:border-slate-300 print:bg-slate-100 print:text-slate-700">
      {statusLabel(status)}
    </span>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    failed: "Falhou",
    open: "Aberta",
    paid: "Paga",
    refunded: "Reembolsada",
    void: "Cancelada",
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

function itemTypeLabel(type: string) {
  const labels: Record<string, string> = {
    adjustment: "Ajuste",
    credit_pack: "Pacote",
    included_credits: "Creditos inclusos",
    overage_credits: "Excedente",
    plan: "Plano",
  };

  return labels[type] ?? type.replaceAll("_", " ");
}

function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(toNumber(value));
}

function formatCredits(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatQuantity(value: number | string | null | undefined) {
  const number = toNumber(value);

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: number % 1 === 0 ? 0 : 2,
  }).format(number);
}

function formatDate(value: string | null) {
  if (!value) return "Nao informado";
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "Nao informado" : date.toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null) {
  if (!value) return "Nao informado";
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Nao informado"
    : date.toLocaleString("pt-BR", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
}

function shortId(value: string) {
  return `#${value.slice(0, 8).toUpperCase()}`;
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}
