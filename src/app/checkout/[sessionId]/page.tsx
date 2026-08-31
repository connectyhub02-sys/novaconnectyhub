import type { Metadata } from "next";
import Image from "next/image";
import Script from "next/script";
import type { CSSProperties, ReactNode } from "react";
import { MessageCircle, PackageCheck, ShieldCheck } from "lucide-react";
import { CheckoutPaymentOptions } from "@/components/checkout/checkout-payment-options";
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
import { getOrganizationSalesCatalogSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { loadMercadoPagoPlatformBillingConfig } from "@/lib/sales-catalog/mercado-pago";
import {
  formatSalesCatalogPaymentSessionStatus,
  resolveSalesCatalogStorefrontFontFamily,
  type SalesCatalogCommercialFlowType,
  type SalesCatalogRevenueOwnerType,
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

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const client = createServiceClient();
  const { session, order, items, organization, integration, whatsapp, orderBumps } = await loadCheckoutData(client, sessionId);

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

  const status = normalizePaymentSessionStatus(session.status);
  const paid = status === "approved";
  const failed = status === "rejected" || status === "cancelled" || status === "expired" || status === "error";
  const gatewayUnavailable = status === "error"
    && (session.provider_status === "gateway_unavailable" || session.provider_status === "gateway_error");
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
  const catalogSettings = await getOrganizationSalesCatalogSettings(client, organization.id).catch(() => null);
  const commercialContext = resolveCheckoutCommercialContext(session, order);
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
    <CheckoutShell publicTrackingContext={publicTrackingContext} style={publicLayoutStyle}>
      <div className="px-4 py-2 text-center text-xs font-medium text-[color:var(--store-offer-text)] sm:text-sm" style={{ backgroundColor: "var(--store-primary)" }}>
        Checkout seguro da {branding.displayName}.{" "}
        <a className="font-bold underline underline-offset-2" href={publicStoreUrl}>
          Voltar para loja
        </a>
      </div>
      <header className="sticky top-0 z-30 bg-white">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:py-6">
          <a className="flex min-w-0 items-center gap-3" href={publicStoreUrl}>
            <CheckoutStoreLogo branding={branding} />
            <span className="truncate text-xl font-semibold leading-none text-[color:var(--store-text)] lg:text-2xl">
              {branding.displayName}
            </span>
          </a>
          <div className="hidden items-center gap-6 text-sm text-[color:var(--store-text)] md:flex">
            <a className="font-medium hover:opacity-70" href={publicStoreUrl}>Loja</a>
            <span className="font-bold">Checkout</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1240px] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-9">
        <section className="order-1 rounded-[20px] border border-black/10 bg-white p-4 shadow-xl shadow-black/5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <CheckoutStoreLogo branding={branding} />
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase" style={{ color: "var(--store-accent)" }}>Pedido WhatsApp</span>
                <h1 className="mt-1 truncate text-2xl font-bold text-[color:var(--store-text)] sm:text-3xl">{branding.displayName}</h1>
                <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-500">{storefront.headerText}</p>
              </div>
            </div>
            <span className={cn(
              "rounded-full border px-3 py-1 text-xs font-bold uppercase",
              paid
                ? "border-emerald-200 bg-emerald-50 text-[#128C4A]"
                : failed
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-black/10 bg-[#f0f0f0] text-black",
            )}>
              {formatSalesCatalogPaymentSessionStatus(status)}
            </span>
          </div>

          <CheckoutStatusPoller
            sessionId={session.id}
            initialStatus={status}
            initialOrderStatus={order.status}
          />

          <div
            className="mt-5 rounded-[20px] border p-4"
            style={{
              backgroundColor: "var(--store-primary)",
              borderColor: "var(--store-primary-border)",
              color: "var(--store-offer-text)",
            }}
          >
            <p className="text-xs font-bold uppercase opacity-80">Total para finalizar</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <p className="text-3xl font-black sm:text-4xl">{amount ?? "A combinar"}</p>
              <p className="max-w-[360px] text-sm font-semibold leading-6 opacity-75">
                Seu pedido ficou pronto. Conclua o pagamento e continue o atendimento pelo WhatsApp da loja.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <CheckoutTrustItem icon={<ShieldCheck className="h-4 w-4" />} label="Pagamento seguro" />
            <CheckoutTrustItem icon={<MessageCircle className="h-4 w-4" />} label="Retorno ao WhatsApp" />
            <CheckoutTrustItem icon={<PackageCheck className="h-4 w-4" />} label="Pedido registrado" />
          </div>
        </section>

        <aside className="order-2 rounded-[20px] border border-black/10 bg-white p-4 shadow-2xl shadow-black/10 sm:p-6 lg:sticky lg:top-28 lg:order-none lg:row-span-3 lg:self-start">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase text-[color:var(--store-accent)]">Mercado Pago</span>
              <h2 className="mt-2 text-2xl font-black text-[color:var(--store-text)]">{session.method === "card" ? "Pagamento do pedido" : "Pague com Pix"}</h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-bold text-[#128C4A]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Seguro
            </span>
          </div>

          <div className="mt-5 rounded-[20px] border border-black/10 bg-[#f0f0f0] p-4">
            <p className="text-sm font-bold text-slate-950">{commercialContext.flowLabel}</p>
            <p className="mt-2 text-xs leading-5 text-slate-600">{commercialContext.checkoutNote}</p>
          </div>

          {paid ? (
            <CheckoutState
              tone="success"
              title="Pagamento confirmado"
              body="Recebemos a confirmação do pagamento. Volte ao WhatsApp para acompanhar o atendimento."
            />
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
          ) : session.method === "card" ? (
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
              canUseCard={canUseCard}
              cardPublicKey={integration?.public_key ?? null}
              pixQrCode={session.pix_qr_code}
              pixQrCodeBase64={session.pix_qr_code_base64}
              pixTicketUrl={session.pix_ticket_url}
              organizationName={branding.displayName}
              orderCode={order.id.slice(0, 8).toUpperCase()}
              items={items.map((item) => ({
                title: item.title,
                quantity: item.quantity ?? 1,
                total: formatCurrency(item.total ?? item.sale_price ?? item.unit_price),
              }))}
              orderBumps={orderBumps}
              whatsappHref={whatsappReturn?.href ?? null}
            />
          )}

          <p className="mt-5 text-xs leading-5 text-slate-400">
            A confirmação volta automaticamente para a loja no ConnectyHub. Não envie comprovantes fora da conversa oficial.
          </p>

          <CheckoutWhatsAppReturn link={whatsappReturn} />
          <CheckoutPaymentFeedbackModal
            feedback={paymentFeedback}
            whatsappHref={whatsappReturn?.href ?? null}
          />
        </aside>

        <section className="order-3 rounded-[20px] border border-black/10 bg-white p-4 shadow-xl shadow-black/5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-[color:var(--store-accent)]">Resumo</p>
              <h2 className="mt-1 text-xl font-black text-[color:var(--store-text)]">Seu pedido</h2>
            </div>
            <span className="rounded-full border border-black/10 bg-[#f0f0f0] px-3 py-1 text-xs font-bold text-black">
              #{order.id.slice(0, 8).toUpperCase()}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CheckoutMetric label="Total" value={amount} />
            <CheckoutMetric label="Pagamento" value={session.method === "card" ? "Cartão" : "Pix"} />
            <CheckoutMetric label="Recebedor" value={commercialContext.receiverLabel} />
            <CheckoutMetric label="Status" value={formatSalesCatalogPaymentSessionStatus(status)} />
          </div>

          <div className="mt-5 divide-y divide-black/10 overflow-hidden rounded-[20px] border border-black/10 bg-white">
            {items.length > 0 ? items.map((item) => (
              <CheckoutItemCard key={item.id} item={item} />
            )) : (
              <div className="px-4 py-4 text-sm text-slate-600">Pedido registrado no catálogo de vendas.</div>
            )}
          </div>
        </section>

        <section className="order-4 rounded-[20px] border border-black/10 bg-white p-4 shadow-xl shadow-black/5 sm:p-6">
          <p className="text-xs font-bold uppercase text-[color:var(--store-accent)]">Dados do pedido</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <CheckoutDetail label="Cliente" value={order.customer_name ?? order.customer_phone ?? "Lead WhatsApp"} />
            <CheckoutDetail label="Subtotal" value={subtotal} />
            <CheckoutDetail label="Frete" value={shipping ?? order.shipping_method ?? "A combinar"} />
            <CheckoutDetail label="Origem da venda" value={commercialContext.flowLabel} />
            <CheckoutDetail label="Última atualização" value={updatedAt ?? "Agora"} />
          </dl>
        </section>
      </main>
      <PublicStoreFooter branding={branding} footerContactText={storefront.footerContactText} footerText={storefront.footerText} />
    </CheckoutShell>
  );
}

function CheckoutShell({
  children,
  publicTrackingContext,
  style,
}: {
  children: ReactNode;
  publicTrackingContext?: ConnectyPublicTrackingContext | null;
  style?: CSSProperties;
}) {
  return (
    <div className="storefront-public min-h-screen bg-white text-[color:var(--store-text,#0f172a)]" style={style}>
      {publicTrackingContext ? (
        <>
          <script
            id="connecty-public-tracking-context"
            dangerouslySetInnerHTML={{
              __html: `window.__CONNECTYHUB_TRACKING_CONTEXT__=${safeJson(publicTrackingContext)};`,
            }}
          />
          <PublicTrackingContextBridge context={publicTrackingContext} />
        </>
      ) : null}
      <Script
        id="mercado-pago-security"
        src="https://www.mercadopago.com/v2/security.js"
        strategy="afterInteractive"
        {...mercadoPagoSecurityScriptAttributes}
      />
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
    lead_phone: input.order.customer_phone,
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

function CheckoutMetric({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-[16px] border border-black/10 bg-[#f0f0f0] p-3">
      <dt className="text-xs font-bold uppercase text-[color:var(--store-accent)]">{label}</dt>
      <dd className="mt-2 truncate text-base font-black text-[color:var(--store-card-text)]">{value ?? "A combinar"}</dd>
    </div>
  );
}

function CheckoutDetail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-[16px] border border-black/10 bg-[#f0f0f0] px-3 py-2">
      <dt className="text-xs font-bold uppercase text-[color:var(--store-card-text-muted)]">{label}</dt>
      <dd className="mt-1 font-bold text-[color:var(--store-card-text)]">{value ?? "A combinar"}</dd>
    </div>
  );
}

function CheckoutStoreLogo({ branding }: { branding: OrganizationBranding }) {
  return (
    <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-black/10 bg-white text-slate-950 shadow-sm">
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
  const description = createShortCheckoutDescription(item.catalogDescription ?? readString(readRecord(item.metadata).cart_item_note));
  const hasLongDescription = Boolean(item.catalogDescription && isLongCheckoutDescription(item.catalogDescription, description));
  const price = formatCurrency(item.total ?? item.sale_price ?? item.unit_price);

  return (
    <div className="flex gap-3 px-4 py-4">
      <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-black/10 bg-[#f0f0f0]">
        {item.catalogImageUrl ? (
          <Image
            alt={item.title}
            src={item.catalogImageUrl}
            fill
            unoptimized
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <span className="text-[10px] font-black uppercase text-black/50">Item</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className="min-w-0 text-sm font-bold leading-5 text-[color:var(--store-card-text)]"
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            }}
            title={item.title}
          >
            {item.title}
          </p>
          <ItemOriginBadge item={item} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {item.sku_code ? `SKU ${item.sku_code}` : item.catalogCategory ?? "Item do catálogo"} - Qtd. {item.quantity ?? 1}
        </p>
        {description ? (
          <div className="mt-2 text-xs leading-5 text-slate-600">
            <p>{description}</p>
            {hasLongDescription ? (
              <details className="mt-1">
                <summary className="cursor-pointer font-bold text-black">Ver detalhes</summary>
                <p className="mt-2 rounded-[16px] border border-black/10 bg-[#f0f0f0] p-3 text-slate-700">
                  {item.catalogDescription}
                </p>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
      <span className="shrink-0 text-sm font-black text-[color:var(--store-card-text)]">{price ?? "A combinar"}</span>
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
    <span className="rounded-full border border-black/10 bg-[#f0f0f0] px-2 py-0.5 text-[10px] font-bold uppercase text-black">
      {label}
    </span>
  );
}

function CheckoutTrustItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-3 text-xs font-bold text-slate-700">
      <span className="text-[#128C4A]">{icon}</span>
      <span>{label}</span>
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

function CheckoutWhatsAppReturn({ link }: { link: CheckoutWhatsappReturn | null }) {
  return (
    <div className="mt-5 rounded-[8px] border border-emerald-100 bg-emerald-50 p-4">
      <p className="text-sm font-bold text-[#128C4A]">Continue pelo WhatsApp</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        O atendimento do pedido continua na conversa oficial da loja.
      </p>
      {link ? (
        <>
          <a
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[8px] bg-[#25D366] px-4 text-sm font-semibold text-white transition hover:bg-[#20bf5a]"
          >
            Voltar ao WhatsApp
          </a>
          <p className="mt-2 text-center text-[11px] font-semibold text-[#128C4A]">
            {link.displayName ? `${link.displayName} - ` : ""}{link.phoneLabel}
          </p>
        </>
      ) : (
        <p className="mt-3 rounded-[8px] border border-emerald-100 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
          Volte para a conversa em que recebeu este checkout para concluir o atendimento.
        </p>
      )}
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
      orderBumps: [] as SalesCatalogCheckoutOrderBump[],
    };
  }

  const [orderResult, itemsResult, organizationResult, integration] = await Promise.all([
    client
      .from("sales_catalog_orders")
      .select("id, lead_id, conversation_id, customer_name, customer_phone, subtotal, shipping_total, total, shipping_method, status, payment_status, commercial_flow_type, revenue_owner_type, contains_platform_products, commission_eligible, metadata")
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
  const order = orderResult.data ?? null;
  const [items, whatsapp] = await Promise.all([
    enrichCheckoutItemsWithCatalog(client, rawItems, session.organization_id),
    order
      ? loadCheckoutWhatsapp(client, {
          organizationId: session.organization_id,
          conversationId: order.conversation_id,
          orderMetadata: order.metadata,
          sessionMetadata: session.metadata,
        })
      : Promise.resolve(null),
  ]);
  const orderBumps = orderResult.data
    ? await loadSalesCatalogCheckoutOrderBumps({
        client,
        organizationId: session.organization_id,
        excludeCatalogItemIds: items
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

function createShortCheckoutDescription(value: string | null | undefined) {
  const compact = value?.replace(/\s+/g, " ").trim() ?? "";

  if (!compact) return null;
  if (compact.length <= 120) return compact;

  const slice = compact.slice(0, 120);
  const lastBreak = Math.max(slice.lastIndexOf("."), slice.lastIndexOf(","), slice.lastIndexOf(" "));
  const ending = lastBreak > 60 ? slice.slice(0, lastBreak) : slice;

  return `${ending.trim()}...`;
}

function isLongCheckoutDescription(fullDescription: string, preview: string | null) {
  if (!preview) return Boolean(fullDescription.trim());

  return fullDescription.replace(/\s+/g, " ").trim().length > preview.replace(/\s+/g, " ").trim().length;
}

function PublicStoreFooter({
  branding,
  footerContactText,
  footerText,
}: {
  branding: OrganizationBranding;
  footerContactText: string;
  footerText: string;
}) {
  return (
    <footer className="mt-12 bg-[#f0f0f0]">
      <div className="mx-auto grid w-full max-w-[1240px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <CheckoutStoreLogo branding={branding} />
            <p className="text-[22px] font-semibold leading-none text-[color:var(--store-text)]">{branding.displayName}</p>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[color:var(--store-text-muted)]">{footerText}</p>
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-[3px] text-[color:var(--store-text)]">Atendimento</p>
          <p className="mt-4 text-sm leading-6 text-[color:var(--store-text-muted)]">{footerContactText}</p>
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-[3px] text-[color:var(--store-text)]">Checkout seguro</p>
          <p className="mt-4 text-sm leading-6 text-[color:var(--store-text-muted)]">Checkout seguro pela ConnectyHub, pagamento protegido e pedido acompanhado no WhatsApp.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {checkoutPaymentBadges.map((item) => (
              <CheckoutPaymentBadge key={item.label} label={item.label} tone={item.tone} />
            ))}
          </div>
        </div>
      </div>
      <p className="mx-auto w-full max-w-[1240px] border-t border-black/10 px-4 py-5 text-xs text-[color:var(--store-text-muted)]">
        Checkout seguro pela{" "}
        <a className="font-bold text-black hover:underline" href={connectHubPublicUrl} rel="noreferrer" target="_blank">
          ConnectyHub
        </a>
      </p>
    </footer>
  );
}

type CheckoutPaymentBadgeTone = "visa" | "pix" | "card" | "mp";

const checkoutPaymentBadges: Array<{ label: string; tone: CheckoutPaymentBadgeTone }> = [
  { label: "Visa", tone: "visa" },
  { label: "Pix", tone: "pix" },
  { label: "Card", tone: "card" },
  { label: "MP", tone: "mp" },
];

function CheckoutPaymentBadge({ label, tone }: { label: string; tone: CheckoutPaymentBadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-[6px] border px-3 text-xs font-bold shadow-sm",
        tone === "visa" && "border-[#1a1f71]/20 bg-[#1a1f71] text-white",
        tone === "pix" && "border-[#32bcad]/20 bg-[#32bcad] text-white",
        tone === "card" && "border-[#eb001b]/20 bg-gradient-to-r from-[#eb001b] to-[#f79e1b] text-white",
        tone === "mp" && "border-[#009ee3]/20 bg-[#009ee3] text-white",
      )}
    >
      {label}
    </span>
  );
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
      checkoutNote: "O pagamento é processado pela ConnectyHub e o acompanhamento continua pelo WhatsApp da loja parceira.",
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
      checkoutNote: "O pedido será acompanhado no WhatsApp e liquidado conforme a regra comercial do fornecedor parceiro.",
    };
  }

  return {
    flow,
    revenueOwner,
    commissionEligible,
    flowLabel: "Produto da loja",
    receiverLabel: "Loja parceira",
    checkoutNote: "O pagamento vai para a conta configurada pela loja. Você continua acompanhando tudo pelo WhatsApp.",
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
  return requiresSalesCatalogShippingBeforePayment(order, items);
}
