import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { CheckoutStatusPoller } from "@/components/checkout/checkout-status-poller";
import { MercadoPagoCardBrick } from "@/components/checkout/mercado-pago-card-brick";
import { createServiceClient } from "@/lib/supabase/service";
import { formatSalesCatalogPaymentSessionStatus } from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout | ConnectyHub",
  description: "Checkout seguro para pedidos feitos pelo WhatsApp.",
};

type JsonRecord = Record<string, unknown>;

type CheckoutSessionRow = {
  id: string;
  organization_id: string;
  order_id: string;
  integration_id: string | null;
  provider: string | null;
  method: string | null;
  status: string | null;
  amount: string | number | null;
  currency: string | null;
  payer_email: string | null;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_ticket_url: string | null;
  provider_status: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  updated_at: string | null;
};

type CheckoutOrderRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: string | null;
  shipping_total: string | null;
  total: string | null;
  shipping_method: string | null;
  status: string | null;
  payment_status: string | null;
  metadata: JsonRecord | null;
};

type CheckoutOrderItemRow = {
  id: string;
  title: string;
  sku_code: string | null;
  quantity: number | null;
  unit_price: string | null;
  sale_price: string | null;
  total: string | null;
  attributes: unknown;
  fulfillment: unknown;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
};

type CheckoutIntegrationRow = {
  id: string;
  public_key: string | null;
  status: string | null;
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const client = createServiceClient();
  const { session, order, items, organization, integration } = await loadCheckoutData(client, sessionId);

  if (!session || !order || !organization) {
    return (
      <CheckoutShell>
        <section className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
          <span className="mb-4 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
            ConnectyHub Checkout
          </span>
          <h1 className="text-3xl font-semibold text-white">Checkout indisponivel</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
            Nao encontramos esta sessao de pagamento. Volte para a conversa no WhatsApp e solicite um novo link de pagamento.
          </p>
        </section>
      </CheckoutShell>
    );
  }

  const status = normalizePaymentSessionStatus(session.status);
  const paid = status === "approved";
  const failed = status === "rejected" || status === "cancelled" || status === "expired" || status === "error";
  const amount = formatCurrency(session.amount ?? order.total ?? order.subtotal);
  const amountNumber = normalizeCurrency(session.amount ?? order.total ?? order.subtotal);
  const subtotal = formatCurrency(order.subtotal);
  const shipping = formatCurrency(order.shipping_total);
  const updatedAt = formatDateTime(session.updated_at);
  const shippingBlocked = requiresShippingBeforePayment(order, items) && !paid;
  const canUseCard = !shippingBlocked && !paid && !failed && amountNumber !== null && integration?.status === "connected" && Boolean(integration.public_key);

  return (
    <CheckoutShell>
      <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:px-8 lg:py-10">
        <section className="flex flex-col justify-between rounded-[8px] border border-cyan-400/20 bg-slate-950/72 p-5 shadow-2xl shadow-black/30 sm:p-8">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Pedido WhatsApp</span>
                <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{organization.name}</h1>
              </div>
              <span className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                paid
                  ? "border-emerald-300/40 bg-emerald-400/12 text-emerald-200"
                  : failed
                    ? "border-rose-300/40 bg-rose-400/12 text-rose-200"
                    : "border-cyan-300/40 bg-cyan-400/12 text-cyan-100",
              )}>
                {formatSalesCatalogPaymentSessionStatus(status)}
              </span>
            </div>

            <CheckoutStatusPoller
              sessionId={session.id}
              initialStatus={status}
              initialOrderStatus={order.status}
            />

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <CheckoutMetric label="Total" value={amount} />
              <CheckoutMetric label="Pedido" value={`#${order.id.slice(0, 8).toUpperCase()}`} />
              <CheckoutMetric label="Pagamento" value={session.method === "card" ? "Cartao" : "Pix"} />
            </div>

            <div className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">Itens</h2>
              <div className="mt-3 divide-y divide-slate-700/70 overflow-hidden rounded-[8px] border border-slate-700/70 bg-slate-900/70">
                {items.length > 0 ? items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {item.sku_code ? `SKU ${item.sku_code}` : "Item do catalogo"} · Qtd. {item.quantity ?? 1}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-cyan-100">{formatCurrency(item.total ?? item.sale_price ?? item.unit_price)}</span>
                  </div>
                )) : (
                  <div className="px-4 py-4 text-sm text-slate-300">Pedido registrado no catalogo de vendas.</div>
                )}
              </div>
            </div>
          </div>

          <dl className="mt-8 grid gap-3 border-t border-slate-700/70 pt-5 text-sm text-slate-300 sm:grid-cols-2">
            <CheckoutDetail label="Cliente" value={order.customer_name ?? order.customer_phone ?? "Lead WhatsApp"} />
            <CheckoutDetail label="Subtotal" value={subtotal} />
            <CheckoutDetail label="Frete" value={shipping ?? order.shipping_method ?? "A combinar"} />
            <CheckoutDetail label="Ultima atualizacao" value={updatedAt ?? "Agora"} />
          </dl>
        </section>

        <aside className="rounded-[8px] border border-cyan-400/20 bg-slate-950/80 p-5 shadow-2xl shadow-black/30 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Mercado Pago</span>
              <h2 className="mt-2 text-2xl font-semibold text-white">{session.method === "card" ? "Pagamento do pedido" : "Pague com Pix"}</h2>
            </div>
            <span className="rounded-full border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200">Seguro</span>
          </div>

          {paid ? (
            <CheckoutState
              tone="success"
              title="Pagamento confirmado"
              body="Recebemos a confirmacao do pagamento. Volte ao WhatsApp para acompanhar o atendimento."
            />
          ) : failed ? (
            <CheckoutState
              tone="error"
              title="Pagamento nao concluido"
              body={session.failure_reason ?? "Solicite um novo link no WhatsApp para tentar novamente."}
            />
          ) : shippingBlocked ? (
            <CheckoutState
              tone="info"
              title="Frete pendente"
              body="Este pedido tem produto fisico. O pagamento sera liberado assim que o frete, retirada ou entrega for definido no WhatsApp."
            />
          ) : session.method === "card" ? (
            <CheckoutState
              tone="info"
              title="Pagamento com cartao registrado"
              body="A confirmacao pode levar alguns instantes. Volte ao WhatsApp para acompanhar o pedido."
            />
          ) : (
            <>
              {session.pix_qr_code_base64 ? (
                <div className="mt-6 flex justify-center rounded-[8px] border border-slate-700 bg-white p-4">
                  <Image
                    src={`data:image/png;base64,${session.pix_qr_code_base64}`}
                    alt="QR Code Pix"
                    width={220}
                    height={220}
                    unoptimized
                    className="h-[220px] w-[220px]"
                  />
                </div>
              ) : (
                <CheckoutState
                  tone="info"
                  title="Pix sendo gerado"
                  body="Aguarde alguns instantes ou solicite um novo link pelo WhatsApp."
                />
              )}

              {session.pix_qr_code ? (
                <div className="mt-5">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300" htmlFor="pix-code">
                    Pix copia e cola
                  </label>
                  <textarea
                    id="pix-code"
                    readOnly
                    value={session.pix_qr_code}
                    className="mt-2 h-32 w-full resize-none rounded-[8px] border border-slate-700 bg-slate-900 p-3 text-xs leading-5 text-cyan-50 outline-none"
                  />
                </div>
              ) : null}

              {session.pix_ticket_url ? (
                <a
                  href={session.pix_ticket_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[8px] bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                >
                  Abrir pagamento no Mercado Pago
                </a>
              ) : null}
            </>
          )}

          {canUseCard ? (
            <MercadoPagoCardBrick
              publicKey={integration!.public_key!}
              sessionId={session.id}
              amount={amountNumber}
              payerEmail={session.payer_email}
            />
          ) : null}

          <p className="mt-5 text-xs leading-5 text-slate-400">
            A confirmacao volta automaticamente para a loja no ConnectyHub. Nao envie comprovantes fora da conversa oficial.
          </p>
        </aside>
      </main>
    </CheckoutShell>
  );
}

function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050912] text-white">
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.22),_transparent_55%)]" />
      <div className="relative">{children}</div>
    </div>
  );
}

function CheckoutMetric({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-[8px] border border-slate-700/70 bg-slate-900/70 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</dt>
      <dd className="mt-2 text-lg font-semibold text-cyan-100">{value ?? "A combinar"}</dd>
    </div>
  );
}

function CheckoutDetail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-100">{value ?? "A combinar"}</dd>
    </div>
  );
}

function CheckoutState({
  tone,
  title,
  body,
}: {
  tone: "success" | "error" | "info";
  title: string;
  body: string;
}) {
  return (
    <div className={cn(
      "mt-6 rounded-[8px] border p-4",
      tone === "success"
        ? "border-emerald-300/40 bg-emerald-400/12"
        : tone === "error"
          ? "border-rose-300/40 bg-rose-400/12"
          : "border-cyan-300/40 bg-cyan-400/12",
    )}>
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}

async function loadCheckoutData(client: ReturnType<typeof createServiceClient>, sessionId: string) {
  const { data: session } = await client
    .from("sales_catalog_payment_sessions")
    .select("id, organization_id, order_id, integration_id, provider, method, status, amount, currency, payer_email, pix_qr_code, pix_qr_code_base64, pix_ticket_url, provider_status, failure_reason, paid_at, updated_at")
    .eq("id", sessionId)
    .maybeSingle<CheckoutSessionRow>();

  if (!session) {
    return {
      session: null,
      order: null,
      items: [] as CheckoutOrderItemRow[],
      organization: null,
      integration: null,
    };
  }

  const [orderResult, itemsResult, organizationResult, integrationResult] = await Promise.all([
    client
      .from("sales_catalog_orders")
      .select("id, customer_name, customer_phone, subtotal, shipping_total, total, shipping_method, status, payment_status, metadata")
      .eq("id", session.order_id)
      .eq("organization_id", session.organization_id)
      .maybeSingle<CheckoutOrderRow>(),
    client
      .from("sales_catalog_order_items")
      .select("id, title, sku_code, quantity, unit_price, sale_price, total, attributes, fulfillment")
      .eq("order_id", session.order_id)
      .eq("organization_id", session.organization_id)
      .order("created_at", { ascending: true }),
    client
      .from("organizations")
      .select("id, name, slug")
      .eq("id", session.organization_id)
      .maybeSingle<OrganizationRow>(),
    session.integration_id
      ? client
          .from("sales_catalog_payment_integrations")
          .select("id, public_key, status")
          .eq("id", session.integration_id)
          .eq("organization_id", session.organization_id)
          .maybeSingle<CheckoutIntegrationRow>()
      : Promise.resolve({ data: null }),
  ]);

  return {
    session,
    order: orderResult.data ?? null,
    items: (itemsResult.data ?? []) as CheckoutOrderItemRow[],
    organization: organizationResult.data ?? null,
    integration: integrationResult.data ?? null,
  };
}

function normalizePaymentSessionStatus(value: string | null) {
  if (
    value === "created"
    || value === "pending"
    || value === "approved"
    || value === "rejected"
    || value === "cancelled"
    || value === "expired"
    || value === "refunded"
    || value === "error"
  ) {
    return value;
  }

  return "created";
}

function formatCurrency(value: string | number | null | undefined) {
  const number = normalizeCurrency(value);

  if (number === null) {
    return null;
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(number);
}

function normalizeCurrency(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (!value) return null;

  const parsed = Number(String(value).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function requiresShippingBeforePayment(order: CheckoutOrderRow, items: CheckoutOrderItemRow[]) {
  const hasPhysicalItem = items.some((item) => readFulfillmentMode(item.fulfillment) === "physical");

  if (!hasPhysicalItem) {
    return false;
  }

  return !order.shipping_method && !order.shipping_total;
}

function readFulfillmentMode(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const mode = typeof record.mode === "string" ? record.mode : null;

  return mode === "digital" || mode === "service" || mode === "subscription" ? mode : "physical";
}
