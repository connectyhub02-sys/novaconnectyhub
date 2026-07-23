import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { CheckoutPaymentOptions } from "@/components/checkout/checkout-payment-options";
import { CheckoutStatusPoller } from "@/components/checkout/checkout-status-poller";
import { createServiceClient } from "@/lib/supabase/service";
import { loadMercadoPagoPlatformBillingConfig } from "@/lib/sales-catalog/mercado-pago";
import {
  formatSalesCatalogPaymentSessionStatus,
  type SalesCatalogCommercialFlowType,
  type SalesCatalogRevenueOwnerType,
} from "@/lib/sales-catalog/shared";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout | ConnectyHub",
  description: "Checkout seguro para pedidos feitos pelo WhatsApp.",
};

const mercadoPagoSecurityScriptAttributes: Record<string, string> = {
  view: "checkout",
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
  payment_owner_type?: string | null;
  commercial_flow_type?: string | null;
  revenue_owner_type?: string | null;
  commission_context?: JsonRecord | null;
  metadata: JsonRecord | null;
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
  commercial_flow_type?: string | null;
  revenue_owner_type?: string | null;
  contains_platform_products?: boolean | null;
  commission_eligible?: boolean | null;
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
  product_origin_type?: string | null;
  commercial_flow_type?: string | null;
  commission_eligible?: boolean | null;
  metadata?: JsonRecord | null;
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

type CheckoutWhatsappRow = {
  id: string;
  phone_number: string | null;
  display_name: string | null;
  status: string | null;
};

type CheckoutWhatsappReturn = {
  href: string;
  phoneLabel: string;
  displayName: string | null;
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const client = createServiceClient();
  const { session, order, items, organization, integration, whatsapp } = await loadCheckoutData(client, sessionId);

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
  const canUseCard = session.method !== "card"
    && !shippingBlocked
    && !paid
    && !failed
    && amountNumber !== null
    && integration?.status === "connected"
    && Boolean(integration.public_key);
  const commercialContext = resolveCheckoutCommercialContext(session, order);
  const whatsappReturn = buildCheckoutWhatsappReturn({
    phoneNumber: whatsapp?.phone_number ?? null,
    displayName: whatsapp?.display_name ?? null,
    organizationName: organization.name,
    orderId: order.id,
    status,
  });

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

            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CheckoutMetric label="Total" value={amount} />
              <CheckoutMetric label="Pedido" value={`#${order.id.slice(0, 8).toUpperCase()}`} />
              <CheckoutMetric label="Pagamento" value={session.method === "card" ? "Cartao" : "Pix"} />
              <CheckoutMetric label="Recebedor" value={commercialContext.receiverLabel} />
            </div>

            <div className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">Itens</h2>
              <div className="mt-3 divide-y divide-slate-700/70 overflow-hidden rounded-[8px] border border-slate-700/70 bg-slate-900/70">
                {items.length > 0 ? items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <ItemOriginBadge item={item} />
                      </div>
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
            <CheckoutDetail label="Origem da venda" value={commercialContext.flowLabel} />
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

          <div className="mt-5 rounded-[8px] border border-slate-700/70 bg-slate-900/70 p-4">
            <p className="text-sm font-semibold text-white">{commercialContext.flowLabel}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">{commercialContext.checkoutNote}</p>
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
            <CheckoutPaymentOptions
              sessionId={session.id}
              amount={amountNumber ?? 0}
              payerEmail={session.payer_email}
              canUseCard={canUseCard}
              cardPublicKey={integration?.public_key ?? null}
              pixQrCode={session.pix_qr_code}
              pixQrCodeBase64={session.pix_qr_code_base64}
              pixTicketUrl={session.pix_ticket_url}
            />
          )}

          <p className="mt-5 text-xs leading-5 text-slate-400">
            A confirmacao volta automaticamente para a loja no ConnectyHub. Nao envie comprovantes fora da conversa oficial.
          </p>

          <CheckoutWhatsAppReturn link={whatsappReturn} />
        </aside>
      </main>
    </CheckoutShell>
  );
}

function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050912] text-white">
      <Script
        id="mercado-pago-security"
        src="https://www.mercadopago.com/v2/security.js"
        strategy="afterInteractive"
        {...mercadoPagoSecurityScriptAttributes}
      />
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

function ItemOriginBadge({ item }: { item: CheckoutOrderItemRow }) {
  const metadata = readRecord(item.metadata);
  const flow = normalizeCommercialFlowType(item.commercial_flow_type ?? readString(metadata.commercial_flow_type));
  const origin = item.product_origin_type ?? readString(metadata.product_origin_type);
  const label = flow === "connectyhub_resale"
    ? "ConnectyHub"
    : flow === "connectyhub_direct"
      ? "Venda CH"
      : origin === "external_provider" || flow === "external_marketplace"
        ? "Parceiro"
        : null;

  if (!label) return null;

  return (
    <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
      {label}
    </span>
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

function CheckoutWhatsAppReturn({ link }: { link: CheckoutWhatsappReturn | null }) {
  return (
    <div className="mt-5 rounded-[8px] border border-emerald-300/30 bg-emerald-400/10 p-4">
      <p className="text-sm font-semibold text-white">Continue pelo WhatsApp</p>
      <p className="mt-2 text-xs leading-5 text-emerald-50/80">
        O atendimento do pedido continua na conversa oficial da loja.
      </p>
      {link ? (
        <>
          <a
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[8px] bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200"
          >
            Voltar ao WhatsApp
          </a>
          <p className="mt-2 text-center text-[11px] text-emerald-50/70">
            {link.displayName ? `${link.displayName} - ` : ""}{link.phoneLabel}
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-[8px] border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs leading-5 text-emerald-50/75">
          Volte para a conversa em que recebeu este checkout para concluir o atendimento.
        </p>
      )}
    </div>
  );
}

async function loadCheckoutData(client: ReturnType<typeof createServiceClient>, sessionId: string) {
  const { data: session } = await client
    .from("sales_catalog_payment_sessions")
    .select("id, organization_id, order_id, integration_id, provider, method, status, amount, currency, payer_email, pix_qr_code, pix_qr_code_base64, pix_ticket_url, provider_status, failure_reason, paid_at, updated_at, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata")
    .eq("id", sessionId)
    .maybeSingle<CheckoutSessionRow>();

  if (!session) {
    return {
      session: null,
      order: null,
      items: [] as CheckoutOrderItemRow[],
      organization: null,
      integration: null,
      whatsapp: null,
    };
  }

  const [orderResult, itemsResult, organizationResult, whatsappResult, integration] = await Promise.all([
    client
      .from("sales_catalog_orders")
      .select("id, customer_name, customer_phone, subtotal, shipping_total, total, shipping_method, status, payment_status, commercial_flow_type, revenue_owner_type, contains_platform_products, commission_eligible, metadata")
      .eq("id", session.order_id)
      .eq("organization_id", session.organization_id)
      .maybeSingle<CheckoutOrderRow>(),
    client
      .from("sales_catalog_order_items")
      .select("id, title, sku_code, quantity, unit_price, sale_price, total, attributes, fulfillment, product_origin_type, commercial_flow_type, commission_eligible, metadata")
      .eq("order_id", session.order_id)
      .eq("organization_id", session.organization_id)
      .order("created_at", { ascending: true }),
    client
      .from("organizations")
      .select("id, name, slug")
      .eq("id", session.organization_id)
      .maybeSingle<OrganizationRow>(),
    client
      .from("whatsapp_instances")
      .select("id, phone_number, display_name, status")
      .eq("organization_id", session.organization_id)
      .eq("status", "connected")
      .not("phone_number", "is", null)
      .order("connected_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<CheckoutWhatsappRow>(),
    loadCheckoutIntegration(client, session),
  ]);

  return {
    session,
    order: orderResult.data ?? null,
    items: (itemsResult.data ?? []) as CheckoutOrderItemRow[],
    organization: organizationResult.data ?? null,
    integration,
    whatsapp: whatsappResult.data ?? null,
  };
}

async function loadCheckoutIntegration(client: ReturnType<typeof createServiceClient>, session: CheckoutSessionRow) {
  if (session.integration_id) {
    const { data } = await client
      .from("sales_catalog_payment_integrations")
      .select("id, public_key, status")
      .eq("id", session.integration_id)
      .eq("organization_id", session.organization_id)
      .maybeSingle<CheckoutIntegrationRow>();

    return data ?? null;
  }

  const metadata = readRecord(session.metadata);
  if (session.payment_owner_type !== "connectyhub" && readString(metadata.payment_owner) !== "connectyhub") {
    return null;
  }

  try {
    const billing = await loadMercadoPagoPlatformBillingConfig({ client });

    return {
      id: "connectyhub-platform-billing",
      public_key: billing.publicKey,
      status: billing.publicKey ? "connected" : "pending",
    };
  } catch {
    return null;
  }
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

function buildCheckoutWhatsappReturn(input: {
  phoneNumber: string | null;
  displayName: string | null;
  organizationName: string;
  orderId: string;
  status: string;
}): CheckoutWhatsappReturn | null {
  const phone = normalizeWhatsappPhone(input.phoneNumber);

  if (!phone) {
    return null;
  }

  const orderCode = input.orderId.slice(0, 8).toUpperCase();
  const statusLine = input.status === "approved"
    ? "Meu pagamento foi aprovado."
    : input.status === "rejected" || input.status === "cancelled" || input.status === "expired" || input.status === "error"
      ? "Tive um problema no pagamento."
      : "Estou finalizando o pagamento.";
  const message = [
    `Ola, vim do checkout ConnectyHub do pedido #${orderCode}.`,
    statusLine,
    "Quero continuar o atendimento pelo WhatsApp.",
  ].join(" ");

  return {
    href: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    phoneLabel: formatWhatsappPhone(phone),
    displayName: input.displayName ?? input.organizationName,
  };
}

function normalizeWhatsappPhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length >= 10 ? digits : null;
}

function formatWhatsappPhone(value: string) {
  if (value.length === 13 && value.startsWith("55")) {
    return `+${value.slice(0, 2)} (${value.slice(2, 4)}) ${value.slice(4, 9)}-${value.slice(9)}`;
  }

  if (value.length === 12 && value.startsWith("55")) {
    return `+${value.slice(0, 2)} (${value.slice(2, 4)}) ${value.slice(4, 8)}-${value.slice(8)}`;
  }

  return `+${value}`;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function resolveCheckoutCommercialContext(session: CheckoutSessionRow, order: CheckoutOrderRow) {
  const sessionMetadata = readRecord(session.metadata);
  const commissionContext = readRecord(session.commission_context);
  const orderMetadata = readRecord(order.metadata);
  const flow = normalizeCommercialFlowType(
    session.commercial_flow_type
      ?? order.commercial_flow_type
      ?? readString(sessionMetadata.commercial_flow_type)
      ?? readString(orderMetadata.latest_commercial_flow_type)
      ?? readString(orderMetadata.commercial_flow_type),
  );
  const revenueOwner = normalizeRevenueOwnerType(
    session.revenue_owner_type
      ?? order.revenue_owner_type
      ?? readString(sessionMetadata.revenue_owner_type)
      ?? readString(orderMetadata.latest_revenue_owner_type)
      ?? readString(orderMetadata.revenue_owner_type),
  );
  const commissionEligible = readBoolean(order.commission_eligible)
    ?? readBoolean(commissionContext.eligible)
    ?? readBoolean(sessionMetadata.commission_eligible)
    ?? readBoolean(orderMetadata.latest_commission_eligible)
    ?? false;

  if (flow === "connectyhub_resale") {
    return {
      flow,
      revenueOwner,
      commissionEligible,
      flowLabel: "Produto ConnectyHub via loja parceira",
      receiverLabel: "ConnectyHub",
      checkoutNote: "O pagamento e processado pela ConnectyHub e o acompanhamento continua pelo WhatsApp da loja parceira.",
    };
  }

  if (flow === "connectyhub_direct") {
    return {
      flow,
      revenueOwner,
      commissionEligible,
      flowLabel: "Venda direta ConnectyHub",
      receiverLabel: "ConnectyHub",
      checkoutNote: "O pagamento e recebido pela ConnectyHub para este produto. O atendimento continua pelo WhatsApp oficial.",
    };
  }

  if (flow === "external_marketplace") {
    return {
      flow,
      revenueOwner,
      commissionEligible,
      flowLabel: "Marketplace parceiro",
      receiverLabel: revenueOwner === "external_provider" ? "Fornecedor" : "ConnectyHub",
      checkoutNote: "O pedido sera acompanhado no WhatsApp e liquidado conforme a regra comercial do fornecedor parceiro.",
    };
  }

  return {
    flow,
    revenueOwner,
    commissionEligible,
    flowLabel: "Produto da loja",
    receiverLabel: "Loja parceira",
    checkoutNote: "O pagamento vai para a conta configurada pela loja. Voce continua acompanhando tudo pelo WhatsApp.",
  };
}

function normalizeCommercialFlowType(value: string | null | undefined): SalesCatalogCommercialFlowType {
  if (value === "connectyhub_resale" || value === "connectyhub_direct" || value === "external_marketplace") return value;
  return "client_direct";
}

function normalizeRevenueOwnerType(value: string | null | undefined): SalesCatalogRevenueOwnerType {
  if (value === "connectyhub" || value === "split" || value === "external_provider") return value;
  return "client";
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
