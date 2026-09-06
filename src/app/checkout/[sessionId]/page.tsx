import type { Metadata } from "next";
import Image from "next/image";
import Script from "next/script";
import { headers } from "next/headers";
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, MessageCircle, PackageCheck, ShieldCheck } from "lucide-react";
import { CheckoutPaymentOptions } from "@/components/checkout/checkout-payment-options";
import { CheckoutCustomerAvatar } from "@/components/checkout/checkout-customer-avatar";
import { CheckoutUpsell } from "@/components/checkout/checkout-upsell";
import {
  CheckoutPaymentFeedbackModal,
  type CheckoutPaymentFeedbackPayload,
  type CheckoutPaymentFeedbackStatus,
} from "@/components/checkout/checkout-payment-feedback-modal";
import { CheckoutStatusPoller } from "@/components/checkout/checkout-status-poller";
import { PublicTrackingContextBridge } from "@/components/tracking/public-tracking-context-bridge";
import { createServiceClient } from "@/lib/supabase/service";
import {
  loadSalesCatalogCheckoutOrderBumps,
  type SalesCatalogCheckoutOrderBump,
} from "@/lib/sales-catalog/checkout-order-bumps";
import { requiresSalesCatalogShippingBeforePayment } from "@/lib/sales-catalog/checkout-guards";
import { loadCheckoutCustomer } from "@/lib/sales-catalog/checkout-customer";
import { loadCheckoutLeadAvatar } from "@/lib/sales-catalog/checkout-lead-avatar";
import { getOrganizationSalesCatalogSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { loadMercadoPagoPlatformBillingConfig } from "@/lib/sales-catalog/mercado-pago";
import {
  resolveSalesCatalogStorefrontFontFamily,
  type SalesCatalogStorefrontSettings,
} from "@/lib/sales-catalog/shared";
import { createOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";
import type { ConnectyPublicTrackingContext } from "@/lib/tracking/public-context";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout | ConnectyHub",
  description: "Checkout seguro para pedidos feitos pelo WhatsApp.",
  robots: {
    index: false,
    follow: false,
  },
};

const mercadoPagoSecurityScriptAttributes: Record<string, string> = {
  view: "checkout",
};
const defaultStorefrontPrimaryColor = "#063f2c";
const connectHubPublicUrl = process.env.NEXT_PUBLIC_CONNECTYHUB_SITE_URL ?? "https://connectyhub.com.br";

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
  provider_status_detail: string | null;
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
  lead_id: string | null;
  conversation_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_document: string | null;
  destination_cep: string | null;
  destination_address: string | null;
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
  catalog_item_id: string | null;
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
  catalogDescription?: string | null;
  catalogImageUrl?: string | null;
  catalogCategory?: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  metadata?: JsonRecord | null;
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

type CheckoutConversationRow = {
  whatsapp_instance_id: string | null;
  metadata: JsonRecord | null;
};

type CheckoutWhatsappReturn = {
  href: string;
  phoneLabel: string;
  displayName: string | null;
};

type OrganizationBranding = {
  displayName: string;
  logoUrl: string | null;
  logoAlt: string;
};

type PublicPageStorefrontSettings = {
  heroTitle: string | null;
  heroHighlight: string | null;
  heroSubtitle: string | null;
  headerText: string;
  footerText: string;
  footerContactText: string;
  primaryColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  cardTextColor: string;
  offerTextColor: string;
  bodyFontFamily: string;
  headingFontFamily: string;
};

type CheckoutPageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CheckoutPage({
  params,
  searchParams,
}: CheckoutPageProps) {
  const { sessionId } = await params;
  const query = (await searchParams) ?? {};
  const client = createServiceClient();
  const { session, order, items, organization, integration, whatsapp, orderBumps, customerAvatarUrl } = await loadCheckoutData(client, sessionId);

  if (!session || !order || !organization) {
    return (
      <CheckoutShell>
        <section className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
          <span className="mb-4 rounded-full border border-black/10 bg-[#f0f0f0] px-3 py-1 text-xs font-bold uppercase text-black">
            ConnectyHub Checkout
          </span>
          <h1 className="text-3xl font-semibold text-slate-950">Checkout indisponível</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            Não encontramos esta sessão de pagamento. Volte para a conversa no WhatsApp e solicite um novo link de pagamento.
          </p>
        </section>
      </CheckoutShell>
    );
  }

  const status = order.payment_status === "confirmed" ? "approved" : order.payment_status === "refunded" ? "refunded" : session.provider === "asaas" && order.status !== "cancelled" && ["expired", "cancelled"].includes(session.status ?? "") ? "pending" : normalizePaymentSessionStatus(session.status);
  const paid = status === "approved" || order.payment_status === "confirmed";
  const failed = order.status === "cancelled" || order.payment_status === "refunded" || (session.provider !== "asaas" && ["rejected", "cancelled", "expired", "error"].includes(status));
  const gatewayUnavailable = status === "error"
    && (session.provider_status === "gateway_unavailable" || session.provider_status === "gateway_error");
  const amount = formatCurrency(order.total ?? session.amount ?? order.subtotal);
  const amountNumber = normalizeCurrency(order.total ?? session.amount ?? order.subtotal);
  const subtotal = formatCurrency(order.subtotal);
  const shipping = formatCurrency(order.shipping_total);
  const shippingBlocked = requiresShippingBeforePayment(order, items) && !paid;
  const paymentProviderLabel = formatCheckoutPaymentProviderLabel(session.provider);
  const catalogSettings = await getOrganizationSalesCatalogSettings(client, organization.id).catch(() => null);
  const asaasPixEnabled = catalogSettings?.asaas.enabledMethods.includes("pix") ?? true;
  const asaasCardEnabled = catalogSettings?.asaas.enabledMethods.includes("credit_card") ?? true;
  const pagBankCardEnabled = false;
  const initialPaymentMethod = normalizeCheckoutInitialPaymentMethod(query.payment_method ?? query.method)
    ?? (session.method === "card" ? "card" : null);
  const sessionMetadata = readRecord(session.metadata);
  const checkoutPaymentOwner = readString(session.payment_owner_type)
    ?? readString(sessionMetadata.payment_owner)
    ?? readString(sessionMetadata.payment_receiver);
  const connectyHubOwned = checkoutPaymentOwner === "connectyhub";
  const pagBankCardPaymentMethodTypes: Array<"CREDIT_CARD" | "DEBIT_CARD"> = pagBankCardEnabled
    ? connectyHubOwned
      ? ["CREDIT_CARD", "DEBIT_CARD"]
      : [
          catalogSettings?.pagBank.enabledMethods.includes("credit_card") ? "CREDIT_CARD" : null,
          catalogSettings?.pagBank.enabledMethods.includes("debit_card") ? "DEBIT_CARD" : null,
        ].filter((method): method is "CREDIT_CARD" | "DEBIT_CARD" => Boolean(method))
    : [];
  const paymentProvider = session.provider === "asaas" ? "asaas" : session.provider === "pagbank" ? "pagbank" : "mercado_pago";
  const canUseAsaasCard = session.provider === "asaas"
    && !shippingBlocked
    && !paid
    && !failed
    && amountNumber !== null
    && (connectyHubOwned || integration?.status === "connected")
    && (connectyHubOwned || asaasCardEnabled);
  const canUseCard = canUseAsaasCard;
  const canUsePix = session.provider === "asaas"
    ? (connectyHubOwned || asaasPixEnabled)
    : false;
  const branding = resolveOrganizationBranding(organization, catalogSettings?.storefront ?? null);
  const storefront = resolvePublicPageStorefront(catalogSettings?.storefront ?? null, branding);
  const primaryColor = storefront.primaryColor ?? defaultStorefrontPrimaryColor;
  const publicLayoutStyle = {
    "--store-primary": primaryColor,
    "--store-accent": getReadableAccentColor(primaryColor, storefront.textColor),
    "--store-text": storefront.textColor,
    "--store-text-muted": `color-mix(in srgb, ${storefront.textColor} 72%, white 28%)`,
    "--store-button": storefront.buttonColor,
    "--store-button-text": storefront.buttonTextColor,
    "--store-button-border": getReadableBorderColor(storefront.buttonColor),
    "--store-card-text": storefront.cardTextColor,
    "--store-card-text-muted": `color-mix(in srgb, ${storefront.cardTextColor} 72%, white 28%)`,
    "--store-offer-text": storefront.offerTextColor,
    "--store-font-body": storefront.bodyFontFamily,
    "--store-font-heading": storefront.headingFontFamily,
    "--store-primary-border": getReadableBorderColor(primaryColor),
  } as CSSProperties;
  const whatsappReturn = buildCheckoutWhatsappReturn({
    phoneNumber: whatsapp?.phone_number ?? null,
    displayName: whatsapp?.display_name ?? null,
    organizationName: branding.displayName,
    orderId: order.id,
    status,
  });
  const paymentFeedback = buildCheckoutPaymentFeedback({
    status,
    session,
    order,
    items,
    organizationName: branding.displayName,
    amountLabel: amount,
  });
  const publicStoreUrl = `/loja/${encodeURIComponent(organization.slug ?? organization.id)}`;
  const publicTrackingContext = buildCheckoutPublicTrackingContext({
    organizationId: organization.id,
    order,
    session,
  });

  return (
    <CheckoutShell
      publicTrackingContext={publicTrackingContext}
      style={publicLayoutStyle}
      loadMercadoPagoSecurity={false}
    >
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[960px] items-center justify-between gap-3 px-4 py-2 sm:px-6 sm:py-4">
          <a className="flex min-w-0 items-center gap-2.5" href={publicStoreUrl}>
            <CheckoutStoreLogo branding={branding} />
            <span className="truncate text-base font-bold text-[color:var(--store-text)] sm:text-xl">{branding.displayName}</span>
          </a>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" /> Seguro</span>
            <CheckoutCustomerAvatar name={order.customer_name} avatarUrl={customerAvatarUrl} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[960px] px-3 py-3 sm:px-6 sm:py-8">
        <div className="grid min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr]">
        <section className="min-w-0 px-4 pt-4 lg:col-start-1 lg:row-start-1 lg:p-6" aria-label="Resumo do pedido">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-950 sm:text-xl" style={{ fontFamily: "var(--store-font-body)" }}>{paid ? "Pedido pago" : "Finalizar pedido"}</h1>
              <p className="mt-1 text-[11px] text-slate-500">#{order.id.slice(0, 8).toUpperCase()} · {items.reduce((sum, item) => sum + (item.quantity ?? 1), 0)} itens</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="whitespace-nowrap text-xl font-bold tracking-tight text-[color:var(--store-accent)] sm:text-2xl">{amount}</p>
              <p className="mt-1 text-[11px] text-slate-500">{shipping ? `Frete ${shipping} incluído` : "Total do pedido"}</p>
            </div>
          </div>
          <div className="mt-3 divide-y divide-slate-100 border-b border-slate-100">
            {items.slice(0, 2).map(item => <CheckoutItemCard key={item.id} item={item} />)}
            {items.length > 2 ? <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-medium text-slate-600 [&::-webkit-details-marker]:hidden">Ver mais {items.length - 2} {items.length - 2 === 1 ? "produto" : "produtos"}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
              <div className="divide-y divide-slate-100">{items.slice(2).map(item => <CheckoutItemCard key={item.id} item={item} />)}</div>
            </details> : null}
          </div>
        </section>
        <section className="min-w-0 p-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-slate-100 lg:p-6" aria-label="Pagamento">
          <CheckoutStatusPoller hidePendingStatus={session.provider === "asaas"} sessionId={session.id} initialStatus={status} initialOrderStatus={order.status} initialProviderStatus={session.provider_status} providerLabel={paymentProviderLabel} />
          {paid ? (
            <><CheckoutState
              tone="success"
              title="Pagamento confirmado"
              body="Recebemos a confirmação do pagamento. Volte ao WhatsApp para acompanhar o atendimento."
            />
            <CheckoutUpsell organizationId={organization.id} sessionId={session.id} productIds={items.map(item => item.catalog_item_id).filter((id): id is string => Boolean(id))} /></>
          ) : failed ? (
            <CheckoutState
              tone={gatewayUnavailable ? "info" : "error"}
              title={gatewayUnavailable ? "Pagamento temporariamente indisponível" : "Pagamento não concluído"}
              body={gatewayUnavailable
                ? "Seu pedido foi criado, mas a loja ainda precisa ajustar o gateway de pagamento. Volte ao WhatsApp para combinar o próximo passo com o atendimento."
                : session.failure_reason ?? "Solicite um novo link no WhatsApp para tentar novamente."}
            />
          ) : shippingBlocked ? (
            <CheckoutState
              tone="info"
              title="Frete pendente"
              body="Este pedido tem produto físico. O pagamento será liberado assim que o frete, retirada ou entrega for definido no WhatsApp."
            />
          ) : session.method === "card" && session.provider !== "asaas" ? (
            <CheckoutState
              tone="info"
              title="Pagamento com cartão registrado"
              body="A confirmação pode levar alguns instantes. Volte ao WhatsApp para acompanhar o pedido."
            />
          ) : (
            <CheckoutPaymentOptions
              sessionId={session.id}
              amount={amountNumber ?? 0}
              payerEmail={session.payer_email}
              payerPhone={order.customer_phone}
              paymentProvider={paymentProvider}
              canUsePix={canUsePix}
              canUseCard={canUseCard}
              cardPublicKey={integration?.public_key ?? null}
              pagBankCardPaymentMethodTypes={pagBankCardPaymentMethodTypes}
              pixAmount={normalizeCurrency(session.amount)}
              pixNeedsRefresh={["cancelled", "expired", "error", "rejected"].includes(session.status ?? "")}
              pixQrCode={session.pix_qr_code}
              pixQrCodeBase64={session.pix_qr_code_base64}
              pixTicketUrl={session.pix_ticket_url}
              paymentProviderLabel={paymentProviderLabel}
              initialPaymentMethod={initialPaymentMethod}
              maxInstallments={connectyHubOwned ? 12 : catalogSettings?.asaas.maxInstallments ?? 1}
              organizationName={branding.displayName}
              orderCode={order.id.slice(0, 8).toUpperCase()}
              items={items.map((item) => ({
                title: item.title,
                quantity: item.quantity ?? 1,
                total: formatCurrency(item.total ?? item.sale_price ?? item.unit_price),
              }))}
              orderBumps={orderBumps}
              initialSelectedOrderBumpIds={items.filter(item => item.metadata?.order_bump === true).map(item => item.catalog_item_id).filter((id): id is string => Boolean(id))}
              whatsappHref={whatsappReturn?.href ?? null}
            />
          )}

          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Pagamento protegido • Confirmação pelo WhatsApp</p>
          {whatsappReturn ? <a href={whatsappReturn.href} className="mt-1 flex min-h-11 items-center justify-center gap-2 text-xs font-medium text-emerald-700"><MessageCircle className="h-4 w-4" /> Falar com {whatsappReturn.displayName ?? "a loja"}</a> : null}
          <CheckoutPaymentFeedbackModal feedback={paymentFeedback} whatsappHref={whatsappReturn?.href ?? null} />
        </section>
          <details className="group mx-4 mb-4 min-w-0 self-start rounded-xl border border-slate-200 bg-slate-50/60 lg:col-start-1 lg:row-start-2 lg:mx-6 lg:mb-6" aria-label="Dados do cliente">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 px-3 py-2 [&::-webkit-details-marker]:hidden">
              <PackageCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-950">Seus dados e entrega</span><span className="mt-0.5 block text-[11px] text-slate-500">Já preenchidos pelo WhatsApp</span></span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-200 px-3 pb-3">
            <p className="mt-3 break-words text-sm font-semibold text-slate-950">{order.customer_name ?? "Cliente"}</p>
            <p className="mt-1 break-all text-xs text-slate-600">{order.customer_email}</p>
            <p className="mt-1 text-xs text-slate-600">{order.customer_phone ? formatWhatsappPhone(order.customer_phone) : null}</p>
            {order.destination_address ? <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">{order.destination_address}{order.destination_cep && !order.destination_address.includes(order.destination_cep) ? ` • CEP ${order.destination_cep}` : ""}</p> : null}
            {order.customer_document ? <p className="mt-2 text-xs text-slate-500">CPF/CNPJ cadastrado • final {order.customer_document.replace(/\D/g, "").slice(-4)}</p> : null}
            {whatsappReturn ? <a className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-emerald-700 underline underline-offset-2" href={whatsappReturn.href}>Corrigir dados pelo WhatsApp</a> : null}
            <dl className="mt-2 space-y-2 border-t border-slate-200 pt-3 text-xs">
              <div className="flex justify-between gap-4 text-slate-600"><dt>Produtos</dt><dd>{subtotal}</dd></div>
              <div className="flex justify-between gap-4 text-slate-600"><dt>Frete</dt><dd>{shipping ?? order.shipping_method ?? "Não se aplica"}</dd></div>
              <div className="flex justify-between gap-4 border-t border-slate-100 pt-2 font-bold text-slate-950"><dt>Total</dt><dd className="whitespace-nowrap">{amount}</dd></div>
            </dl>
            </div>
          </details>
        </div>
      </main>
      <footer className="mx-auto flex max-w-[960px] flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 pb-24 pt-2 text-center text-[11px] text-slate-500 sm:pb-6">
        <span>Pagamento seguro por {paymentProviderLabel}</span>
        <a className="underline underline-offset-2" href={publicStoreUrl}>Voltar para a loja</a>
        <a href={connectHubPublicUrl} rel="noreferrer" target="_blank">Checkout ConnectyHub</a>
      </footer>
    </CheckoutShell>
  );
}

async function CheckoutShell({
  children,
  loadMercadoPagoSecurity = false,
  publicTrackingContext,
  style,
}: {
  children: ReactNode;
  loadMercadoPagoSecurity?: boolean;
  publicTrackingContext?: ConnectyPublicTrackingContext | null;
  style?: CSSProperties;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <div className="storefront-public min-h-screen bg-white text-[color:var(--store-text,#0f172a)]" style={style}>
      {publicTrackingContext ? (
        <>
          <script
            id="connecty-public-tracking-context"
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `window.__CONNECTYHUB_TRACKING_CONTEXT__=${safeJson(publicTrackingContext)};`,
            }}
          />
          <PublicTrackingContextBridge context={publicTrackingContext} />
        </>
      ) : null}
      {loadMercadoPagoSecurity ? (
        <Script
          id="mercado-pago-security"
          src="https://www.mercadopago.com/v2/security.js"
          strategy="afterInteractive"
          {...mercadoPagoSecurityScriptAttributes}
        />
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

function buildCheckoutPublicTrackingContext(input: {
  organizationId: string;
  order: CheckoutOrderRow;
  session: CheckoutSessionRow;
}): ConnectyPublicTrackingContext {
  const secret = process.env.TRACKING_PUBLIC_TOKEN_SECRET;
  const orderMetadata = readRecord(input.order.metadata);
  const sessionMetadata = readRecord(input.session.metadata);

  return {
    scope: "organization",
    organization_id: input.organizationId,
    tracking_token: secret ? createOrganizationTrackingToken(input.organizationId, secret) : null,
    lead_id: input.order.lead_id,
    lead_name: input.order.customer_name,
    lead_phone: input.order.customer_phone,
    lead_email: input.session.payer_email,
    conversation_id: input.order.conversation_id,
    agent_id: resolveCheckoutAgentId(orderMetadata, sessionMetadata),
    order_id: input.order.id,
    payment_session_id: input.session.id,
    tracking_link_id: resolveCheckoutTrackingLinkId(orderMetadata, sessionMetadata),
    tracking_source: "sales_catalog_checkout",
  };
}

function resolveCheckoutAgentId(orderMetadata: JsonRecord, sessionMetadata: JsonRecord) {
  return readString(orderMetadata.agent_id)
    ?? readString(orderMetadata.whatsapp_agent_id)
    ?? readString(orderMetadata.producer_agent_id)
    ?? readString(orderMetadata.created_by_agent_id)
    ?? readString(orderMetadata.latest_agent_id)
    ?? readString(sessionMetadata.agent_id)
    ?? readString(sessionMetadata.whatsapp_agent_id)
    ?? readString(sessionMetadata.producer_agent_id)
    ?? readString(sessionMetadata.created_by_agent_id)
    ?? readString(sessionMetadata.latest_agent_id);
}

function resolveCheckoutTrackingLinkId(orderMetadata: JsonRecord, sessionMetadata: JsonRecord) {
  return readString(sessionMetadata.checkout_tracking_link_id)
    ?? readString(sessionMetadata.tracking_link_id)
    ?? readString(orderMetadata.latest_checkout_tracking_link_id)
    ?? readString(orderMetadata.tracking_link_id);
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function CheckoutStoreLogo({ branding }: { branding: OrganizationBranding }) {
  return (
    <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-black/10 bg-white text-slate-950 sm:h-12 sm:w-12">
      {branding.logoUrl ? (
        <Image
          alt={branding.logoAlt}
          src={branding.logoUrl}
          fill
          unoptimized
          sizes="56px"
          className="object-contain p-1.5"
        />
      ) : (
        <span className="text-lg font-black">{branding.displayName.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

function CheckoutItemCard({ item }: { item: CheckoutOrderItemRow }) {
  const price = formatCurrency(item.total ?? item.sale_price ?? item.unit_price);
  return (
    <div className="flex min-w-0 items-center gap-2.5 py-2">
      <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
        {item.catalogImageUrl ? <Image alt="" src={item.catalogImageUrl} fill unoptimized sizes="40px" className="object-contain" /> : <PackageCheck className="h-5 w-5 text-slate-400" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-xs font-semibold leading-4 text-slate-950" title={item.title}>{item.title}</p>
        <div className="mt-0.5 flex items-center justify-between gap-2"><span className="text-[11px] text-slate-500">Qtd. {item.quantity ?? 1}</span><span className="shrink-0 text-xs font-bold text-slate-950">{price}</span></div>
      </div>
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
        ? "border-emerald-200 bg-emerald-50"
        : tone === "error"
          ? "border-rose-200 bg-rose-50"
          : "border-black/10 bg-[#f0f0f0]",
    )}>
      <p className={cn(
        "font-bold",
        tone === "success" ? "text-[#128C4A]" : tone === "error" ? "text-rose-700" : "text-black",
      )}>{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{body}</p>
    </div>
  );
}

async function loadCheckoutData(client: ReturnType<typeof createServiceClient>, sessionId: string) {
  const { data: session } = await client
    .from("sales_catalog_payment_sessions")
    .select("id, organization_id, order_id, integration_id, provider, method, status, amount, currency, payer_email, pix_qr_code, pix_qr_code_base64, pix_ticket_url, provider_status, provider_status_detail, failure_reason, paid_at, updated_at, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata")
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
      customerAvatarUrl: null,
      orderBumps: [] as SalesCatalogCheckoutOrderBump[],
    };
  }

  const [orderResult, itemsResult, organizationResult, integration] = await Promise.all([
    client
      .from("sales_catalog_orders")
      .select("id, lead_id, conversation_id, customer_name, customer_phone, customer_email, customer_document, destination_cep, destination_address, subtotal, shipping_total, total, shipping_method, status, payment_status, commercial_flow_type, revenue_owner_type, contains_platform_products, commission_eligible, metadata")
      .eq("id", session.order_id)
      .eq("organization_id", session.organization_id)
      .maybeSingle<CheckoutOrderRow>(),
    client
      .from("sales_catalog_order_items")
      .select("id, catalog_item_id, title, sku_code, quantity, unit_price, sale_price, total, attributes, fulfillment, product_origin_type, commercial_flow_type, commission_eligible, metadata")
      .eq("order_id", session.order_id)
      .eq("organization_id", session.organization_id)
      .order("created_at", { ascending: true }),
    client
      .from("organizations")
      .select("id, name, slug, metadata")
      .eq("id", session.organization_id)
      .maybeSingle<OrganizationRow>(),
    loadCheckoutIntegration(client, session),
  ]);

  const rawItems = (itemsResult.data ?? []) as CheckoutOrderItemRow[];
  const order = orderResult.data ? await loadCheckoutCustomer(client, session.organization_id, orderResult.data) : null;
  const [items, whatsapp, customerAvatarUrl] = await Promise.all([
    enrichCheckoutItemsWithCatalog(client, rawItems, session.organization_id),
    order
      ? loadCheckoutWhatsapp(client, {
          organizationId: session.organization_id,
          conversationId: order.conversation_id,
          orderMetadata: order.metadata,
          sessionMetadata: session.metadata,
        })
      : Promise.resolve(null),
    loadCheckoutLeadAvatar(client, {
      organizationId: session.organization_id,
      leadId: order?.lead_id ?? null,
      conversationId: order?.conversation_id ?? null,
    }),
  ]);
  const orderBumps = orderResult.data
    ? await loadSalesCatalogCheckoutOrderBumps({
        client,
        organizationId: session.organization_id,
        leadId: orderResult.data.lead_id,
        subtotal: normalizeCurrency(orderResult.data.subtotal) ?? 0,
        selectedProductIds: items.filter(item => item.metadata?.order_bump === true).map(item => item.catalog_item_id).filter((id): id is string => Boolean(id)),
        excludeCatalogItemIds: items
          .filter(item => item.metadata?.order_bump !== true)
          .map((item) => item.catalog_item_id)
          .filter((item): item is string => typeof item === "string"),
      }).catch(() => [])
    : [];

  return {
    session,
    order,
    items,
    organization: organizationResult.data ?? null,
    integration,
    whatsapp,
    customerAvatarUrl,
    orderBumps,
  };
}

async function enrichCheckoutItemsWithCatalog(
  client: ReturnType<typeof createServiceClient>,
  items: CheckoutOrderItemRow[],
  organizationId: string,
) {
  const catalogItemIds = Array.from(new Set(
    items
      .map((item) => item.catalog_item_id)
      .filter((item): item is string => typeof item === "string" && item.length > 0),
  ));

  if (catalogItemIds.length === 0) {
    return items;
  }

  const { data } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_item")
    .in("id", catalogItemIds);
  const catalogById = new Map(
    ((data ?? []) as Array<{
      id: string;
      organization_id: string | null;
      title: string;
      content: string;
      metadata: JsonRecord | null;
      created_at: string | null;
      updated_at: string | null;
    }>).map((row) => [row.id, mapSalesCatalogItem(row)]),
  );

  return items.map((item) => {
    const catalogItem = item.catalog_item_id ? catalogById.get(item.catalog_item_id) ?? null : null;
    const cover = catalogItem?.media.find((media) => media.kind === "image") ?? null;

    return {
      ...item,
      catalogDescription: catalogItem?.description ?? readString(readRecord(item.metadata).product_description),
      catalogImageUrl: cover?.storageUrl ?? readString(readRecord(item.metadata).product_image_url),
      catalogCategory: catalogItem?.category ?? readString(readRecord(item.metadata).category),
    };
  });
}

async function loadCheckoutWhatsapp(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    conversationId: string | null;
    orderMetadata?: JsonRecord | null;
    sessionMetadata?: JsonRecord | null;
  },
) {
  const candidateInstanceIds: string[] = [];
  if (input.conversationId) {
    const { data: conversation } = await client
      .from("conversations")
      .select("whatsapp_instance_id, metadata")
      .eq("id", input.conversationId)
      .eq("organization_id", input.organizationId)
      .maybeSingle<CheckoutConversationRow>();
    const metadata = readRecord(conversation?.metadata);
    const conversationWhatsappInstanceId = conversation?.whatsapp_instance_id ?? readString(metadata.whatsapp_instance_id);

    if (conversationWhatsappInstanceId) {
      candidateInstanceIds.push(conversationWhatsappInstanceId);
    }
  }

  for (const metadata of [input.orderMetadata, input.sessionMetadata]) {
    const record = readRecord(metadata);
    const instanceId = readString(record.whatsapp_instance_id)
      ?? readString(record.source_whatsapp_instance_id)
      ?? readString(record.conversation_whatsapp_instance_id);

    if (instanceId && !candidateInstanceIds.includes(instanceId)) {
      candidateInstanceIds.push(instanceId);
    }
  }

  for (const instanceId of candidateInstanceIds) {
    const { data: instance } = await client
      .from("whatsapp_instances")
      .select("id, phone_number, display_name, status")
      .eq("id", instanceId)
      .eq("organization_id", input.organizationId)
      .not("phone_number", "is", null)
      .maybeSingle<CheckoutWhatsappRow>();

    if (instance?.phone_number) {
      return instance;
    }
  }

  const { data } = await client
    .from("whatsapp_instances")
    .select("id, phone_number, display_name, status")
    .eq("organization_id", input.organizationId)
    .eq("status", "connected")
    .not("phone_number", "is", null)
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<CheckoutWhatsappRow>();

  return data ?? null;
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

  if (session.provider !== "mercado_pago") {
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

function formatCheckoutPaymentProviderLabel(provider: string | null) {
  if (provider === "asaas") return "Asaas";
  return provider === "pagbank" ? "PagBank" : "Mercado Pago";
}

function normalizeCheckoutInitialPaymentMethod(value: unknown): "pix" | "card" | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = readString(raw)?.toLowerCase();

  if (normalized === "card" || normalized === "cartao" || normalized === "cartão") {
    return "card";
  }

  if (normalized === "pix") {
    return "pix";
  }

  return null;
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
  const checkoutName = input.organizationName.trim() || "sua loja";
  const statusLine = input.status === "approved"
    ? "Meu pagamento foi aprovado."
    : input.status === "rejected" || input.status === "cancelled" || input.status === "expired" || input.status === "error"
      ? "Tive um problema no pagamento."
      : "Estou finalizando o pagamento.";
  const message = [
    `Ola, vim do checkout de ${checkoutName} do pedido #${orderCode}.`,
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

function buildCheckoutPaymentFeedback(input: {
  status: string;
  session: CheckoutSessionRow;
  order: CheckoutOrderRow;
  items: CheckoutOrderItemRow[];
  organizationName: string;
  amountLabel: string | null;
}): CheckoutPaymentFeedbackPayload | null {
  const status = normalizeCheckoutFeedbackStatus(input.status);
  if (!status) return null;

  const gatewayUnavailable = status === "error"
    && (input.session.provider_status === "gateway_unavailable" || input.session.provider_status === "gateway_error");

  return {
    status,
    organizationName: input.organizationName,
    orderCode: input.order.id.slice(0, 8).toUpperCase(),
    amountLabel: input.amountLabel,
    providerStatusDetail: input.session.provider_status_detail ?? input.session.provider_status,
    rejection: gatewayUnavailable ? {
      inlineMessage: "Pagamento temporariamente indisponível. O pedido foi criado, mas a loja precisa ajustar o gateway de pagamento.",
      title: "Pagamento temporariamente indisponível",
      description: "Seu pedido foi criado, mas a loja ainda precisa ajustar o gateway de pagamento antes de receber online.",
      reason: "Gateway de pagamento indisponível.",
      recommendation: "Volte ao WhatsApp oficial da loja para combinar o próximo passo do pedido.",
      nextSteps: [
        "O pedido já ficou registrado com os itens escolhidos.",
        "Continue pelo WhatsApp oficial da loja enquanto o pagamento online é ajustado.",
      ],
      statusDetail: input.session.provider_status_detail ?? input.session.provider_status,
    } : null,
    items: input.items.map((item) => ({
      title: item.title,
      quantity: item.quantity ?? 1,
      total: formatCurrency(item.total ?? item.sale_price ?? item.unit_price),
    })),
  };
}

function normalizeCheckoutFeedbackStatus(status: string): CheckoutPaymentFeedbackStatus | null {
  if (
    status === "approved"
    || status === "rejected"
    || status === "cancelled"
    || status === "expired"
    || status === "refunded"
    || status === "error"
  ) {
    return status;
  }

  return null;
}

function resolveOrganizationBranding(
  organization: OrganizationRow,
  storefront?: SalesCatalogStorefrontSettings | null,
): OrganizationBranding {
  const metadata = readRecord(organization.metadata);
  const logoUrl = readString(metadata.brand_logo_url);
  const displayName = readString(storefront?.publicDisplayName)
    ?? readString(metadata.public_display_name)
    ?? organization.name;

  return {
    displayName,
    logoUrl,
    logoAlt: readString(metadata.brand_logo_alt) ?? displayName,
  };
}

function resolvePublicPageStorefront(
  settings: SalesCatalogStorefrontSettings | null,
  branding: OrganizationBranding,
): PublicPageStorefrontSettings {
  const heroTitle = readString(settings?.heroTitle);
  const heroHighlight = readString(settings?.heroHighlight);
  const heroSubtitle = readString(settings?.heroSubtitle);
  const legacyHeaderText = [heroTitle, heroHighlight].filter(Boolean).join(" ").trim();
  const primaryColor = normalizeStorefrontPrimaryColor(settings?.primaryColor) ?? defaultStorefrontPrimaryColor;
  const textColor = normalizeStorefrontTextColor(settings?.textColor) ?? "#111111";
  const buttonColor = normalizeStorefrontTextColor(settings?.buttonColor) ?? primaryColor;
  const cardTextColor = normalizeStorefrontTextColor(settings?.cardTextColor) ?? textColor;
  const bodyFontFamily = resolveSalesCatalogStorefrontFontFamily(settings?.bodyFont);

  return {
    heroTitle,
    heroHighlight,
    heroSubtitle,
    headerText: readString(settings?.headerText)
      ?? legacyHeaderText
      ?? heroSubtitle
      ?? `Produtos selecionados pela ${branding.displayName}, compra segura e atendimento conectado ao WhatsApp.`,
    footerText: readString(settings?.footerText)
      ?? `${branding.displayName} atende pelo WhatsApp com catálogo, checkout seguro e acompanhamento do pedido em um só lugar.`,
    footerContactText: readString(settings?.footerContactText) ?? "Atendimento pelo WhatsApp oficial da loja.",
    primaryColor,
    textColor,
    buttonColor,
    buttonTextColor: normalizeStorefrontTextColor(settings?.buttonTextColor) ?? getReadableTextColor(buttonColor),
    cardTextColor,
    offerTextColor: normalizeStorefrontTextColor(settings?.offerTextColor) ?? getReadableTextColor(primaryColor),
    bodyFontFamily,
    headingFontFamily: settings?.headingFont
      ? resolveSalesCatalogStorefrontFontFamily(settings.headingFont)
      : bodyFontFamily,
  };
}

function normalizeStorefrontPrimaryColor(value: string | null | undefined) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function normalizeStorefrontTextColor(value: string | null | undefined) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function getReadableTextColor(hex: string) {
  return getColorLuminance(hex) > 0.66 ? "#111111" : "#ffffff";
}

function getReadableAccentColor(hex: string, fallbackTextColor: string) {
  return getColorLuminance(hex) > 0.82 ? fallbackTextColor : hex;
}

function getReadableBorderColor(hex: string) {
  return getColorLuminance(hex) > 0.82 ? "#d9ded7" : `color-mix(in srgb, ${hex} 78%, black 22%)`;
}

function getColorLuminance(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);

  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiresShippingBeforePayment(order: CheckoutOrderRow, items: CheckoutOrderItemRow[]) {
  return requiresSalesCatalogShippingBeforePayment(order, items);
}
