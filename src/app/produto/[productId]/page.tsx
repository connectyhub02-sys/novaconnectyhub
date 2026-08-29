import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  FileText,
  LockKeyhole,
  Menu,
  MessageCircle,
  Package,
  PackageCheck,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck,
} from "lucide-react";
import { SalesCatalogMediaGallery } from "@/components/checkout/sales-catalog-media-gallery";
import { ProductMobileCheckoutBar, ProductPurchaseControls } from "@/components/checkout/sales-catalog-product-actions";
import { StoreNewsletterCard } from "@/components/checkout/store-newsletter-card";
import { getOrganizationSalesCatalogSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import {
  buildLeadAwareSalesCatalogStoreCartUrl,
  buildLeadAwareSalesCatalogStoreProductUrl,
  buildLeadAwareSalesCatalogStoreProductsUrl,
  buildLeadAwareSalesCatalogStoreUrl,
} from "@/lib/sales-catalog/public-urls";
import {
  isSalesCatalogDisplayableProduct,
  resolveSalesCatalogStorefrontFontFamily,
  type ClientSalesCatalogItem,
  type SalesCatalogStorefrontSettings,
} from "@/lib/sales-catalog/shared";
import { createServiceClient } from "@/lib/supabase/service";
import { createOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";
import type { ConnectyPublicTrackingContext } from "@/lib/tracking/public-context";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const defaultStorefrontPrimaryColor = "#063f2c";
const connectHubPublicUrl = process.env.NEXT_PUBLIC_CONNECTYHUB_SITE_URL ?? "https://connectyhub.com.br";

type JsonRecord = Record<string, unknown>;

type ProductPageProps = {
  params: Promise<{ productId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SalesCatalogMemoryRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  metadata?: JsonRecord | null;
};

type ProductConversationRow = {
  whatsapp_instance_id: string | null;
  metadata: JsonRecord | null;
};

type ProductWhatsappRow = {
  id: string;
  phone_number: string | null;
  display_name: string | null;
  status: string | null;
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

type ProductWhatsappReturn = {
  href: string;
  phoneLabel: string;
  displayName: string | null;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { productId } = await params;
  const client = createServiceClient();
  const row = await loadProductRow(client, productId);

  if (!row) {
    return {
      title: "Produto | ConnectyHub",
      description: "Produto indisponível no catálogo ConnectyHub.",
    };
  }

  const item = mapSalesCatalogItem(row);

  if (!isSalesCatalogDisplayableProduct(item)) {
    return {
      title: "Produto | ConnectyHub",
      description: "Produto indisponível no catálogo ConnectyHub.",
    };
  }

  return {
    title: `${item.title} | ConnectyHub`,
    description: item.description.slice(0, 155),
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { productId } = await params;
  const query = (await searchParams) ?? {};
  const client = createServiceClient();
  const row = await loadProductRow(client, productId);

  if (!row?.organization_id) {
    notFound();
  }

  const item = mapSalesCatalogItem(row);

  if (item.status !== "active" || !isSalesCatalogDisplayableProduct(item)) {
    notFound();
  }

  const organization = await loadOrganization(client, row.organization_id);

  if (!organization) {
    notFound();
  }

  const leadId = readSearchString(query.lead_id);
  const leadPhone = readSearchString(query.lead_phone);
  const conversationId = readSearchString(query.conversation_id);
  const trackingLinkId = readSearchString(query.tracking_link_id);
  const [related, whatsapp, catalogSettings] = await Promise.all([
    loadRelatedProducts(client, item, row.organization_id),
    loadProductWhatsapp(client, {
      organizationId: row.organization_id,
      conversationId,
      item,
    }),
    getOrganizationSalesCatalogSettings(client, row.organization_id).catch(() => null),
  ]);
  const price = normalizeCurrencyAmount(item.offer.salePrice) ?? normalizeCurrencyAmount(item.price);
  const canCheckout = item.salesDestination === "connectyhub_checkout"
    && price !== null
    && !(item.inventory.status === "out_of_stock" && !item.inventory.allowBackorder);
  const priceLabel = price !== null ? formatCurrency(price) : "Sob consulta";
  const installments = price !== null ? formatCurrency(price / 6) : null;
  const galleryMedia = item.media.filter((media) => media.kind === "image" || media.kind === "video");
  const documents = item.media.filter((media) => media.kind === "document");
  const publicTrackingContext = buildProductPublicTrackingContext({
    organizationId: organization.id,
    productId: item.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
  });
  const branding = resolveOrganizationBranding(organization, catalogSettings?.storefront ?? null);
  const storefront = resolvePublicPageStorefront(catalogSettings?.storefront ?? null, branding);
  const primaryColor = storefront.primaryColor ?? defaultStorefrontPrimaryColor;
  const accentColor = getReadableAccentColor(primaryColor, storefront.textColor);
  const publicLayoutStyle = {
    "--store-primary": primaryColor,
    "--store-accent": accentColor,
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
  const storeSlug = organization.slug ?? organization.id;
  const storeUrl = buildLeadAwareSalesCatalogStoreUrl({
    storeSlug,
    organizationId: organization.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
  });
  const storeProductsUrl = buildLeadAwareSalesCatalogStoreProductsUrl({
    storeSlug,
    organizationId: organization.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
  });
  const storeCartUrl = buildLeadAwareSalesCatalogStoreCartUrl({
    storeSlug,
    organizationId: organization.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
  });
  const whatsappReturn = buildProductWhatsappReturn({
    phoneNumber: whatsapp?.phone_number ?? null,
    displayName: whatsapp?.display_name ?? null,
    organizationName: branding.displayName,
    productTitle: item.title,
  });
  const fullDescription = item.pageContent.fullDescription ?? item.description;
  const descriptionPreview = createShortDescription(item.description);
  const descriptionParagraphs = splitDescription(fullDescription);
  const usageParagraphs = splitDescription(item.pageContent.usage ?? buildDefaultUsageInfo(item));
  const shippingParagraphs = splitDescription(item.pageContent.shippingInfo ?? buildDefaultShippingInfo(item));
  const faqParagraphs = splitDescription(item.pageContent.faq ?? buildDefaultFaqInfo(item));
  const importantNotice = item.pageContent.importantNotice
    ?? "Confira os dados do pedido antes de finalizar. O atendimento continua pelo WhatsApp oficial da loja.";
  const highlights = buildProductHighlights(item, descriptionPreview);
  const sku = item.skus.find((entry) => entry.status === "active")?.skuCode
    ?? item.platformProductCode
    ?? item.tag;
  const brand = findAttributeValue(item, "marca") ?? inferBrandFromTitle(item.title);
  const application = findAttributeValue(item, "aplicacao") ?? formatFulfillment(item.fulfillment.mode);
  const quickDetails = buildProductQuickDetails(item, brand, application);

  return (
    <main className="storefront-public min-h-screen bg-white pb-28 text-[color:var(--store-text)] sm:pb-0" style={publicLayoutStyle}>
      <script
        id="connecty-public-tracking-context"
        dangerouslySetInnerHTML={{
          __html: `window.__CONNECTYHUB_TRACKING_CONTEXT__=${safeJson(publicTrackingContext)};`,
        }}
      />
      <ProductTopBar
        branding={branding}
        cartUrl={storeCartUrl}
        productsUrl={storeProductsUrl}
        storeUrl={storeUrl}
      />

      <section className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-9">
        <nav className="hidden items-center gap-2 text-xs font-semibold text-[color:var(--store-text-muted)] lg:flex">
          <Link href={storeUrl} className="transition hover:text-[color:var(--store-accent)]">Início</Link>
          <ArrowRight className="h-3.5 w-3.5" />
          <span>{item.category ?? "Produto"}</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="line-clamp-1 max-w-sm text-[color:var(--store-text)]">{item.title}</span>
        </nav>

        <div className="mt-4 hidden flex-wrap items-center justify-end gap-3 lg:flex">
          <TrustPill icon={<ShieldCheck className="h-4 w-4" />} label="Compra segura" />
          <TrustPill icon={<MessageCircle className="h-4 w-4" />} label="Atendimento WhatsApp" />
          <TrustPill icon={<CheckCircle2 className="h-4 w-4" />} label={formatStockLabel(item)} tone="green" />
        </div>

        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,580px)_minmax(0,1fr)] lg:items-start xl:gap-12">
          <SalesCatalogMediaGallery title={item.title} media={galleryMedia} />

          <section className="min-w-0 rounded-[20px] border border-black/10 bg-white p-4 shadow-lg shadow-black/5 sm:p-6 lg:border-0 lg:p-0 lg:shadow-none">
            <div className="flex flex-wrap gap-2">
              <ProductBadge>{item.category ?? "Produto"}</ProductBadge>
              <ProductBadge tone="green">{formatStockLabel(item)}</ProductBadge>
            </div>

            <h1 className="mt-4 text-[22px] font-semibold leading-[27px] text-[color:var(--store-text)] sm:text-3xl sm:leading-tight lg:text-[32px] lg:leading-[38px]">
              {item.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-1 text-[#ffc633]" aria-label="Produto em destaque da loja">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <span className="font-semibold text-[color:var(--store-text-muted)]">4.8/5</span>
              <span className="hidden h-4 w-px bg-slate-200 sm:block" />
              <span className="font-mono text-xs font-semibold text-[color:var(--store-text-muted)]">SKU: {sku}</span>
            </div>

            <p className="mt-4 text-[32px] font-semibold leading-none text-[color:var(--store-text)]">{priceLabel}</p>
            {installments ? (
              <p className="mt-2 text-sm font-medium text-[color:var(--store-text-muted)]">
                ou 6x de <span className="font-semibold text-[color:var(--store-text)]">{installments}</span> sem juros
              </p>
            ) : null}

            <p className="mt-4 text-sm leading-6 text-[color:var(--store-text-muted)]">
              {descriptionPreview}
            </p>

            <ProductPurchaseControls
              cartUrl={storeCartUrl}
              disabled={!canCheckout}
              organizationId={organization.id}
              productId={item.id}
              className="mt-5 hidden sm:grid"
            />

            <ul className="mt-5 grid gap-2.5">
              {highlights.map((highlight) => (
                <li key={highlight} className="flex gap-2 text-sm font-semibold leading-5 text-[color:var(--store-text)]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--store-accent)]" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-8 grid grid-cols-2 gap-3 rounded-[20px] border border-black/10 bg-white p-4 shadow-lg shadow-black/5 sm:grid-cols-4 sm:p-5">
          <Benefit icon={<LockKeyhole className="h-6 w-6" />} title="Checkout seguro" subtitle="Ambiente criptografado" />
          <Benefit icon={<Truck className="h-6 w-6" />} title="Envio discreto" subtitle="Pedido acompanhado" />
          <Benefit icon={<BadgeCheck className="h-6 w-6" />} title="Produto original" subtitle="Catálogo da loja" />
          <Benefit icon={<PackageCheck className="h-6 w-6" />} title="Pedido rastreado" subtitle="Acompanhe em tempo real" />
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.46fr)]">
          <section className="rounded-[20px] border border-black/10 bg-white shadow-lg shadow-black/5">
            <div className="grid grid-cols-2 border-b border-black/10 text-center text-xs font-semibold text-black/60 sm:grid-cols-4 sm:text-sm">
              <a href="#descricao-completa" className="border-b-2 px-3 py-4 text-[color:var(--store-accent)]" style={{ borderColor: "var(--store-accent)" }}>Descrição completa</a>
              <a href="#modo-de-uso" className="px-4 py-4 transition hover:text-[color:var(--store-text)]">Modo de uso</a>
              <a href="#informacoes-de-envio" className="px-4 py-4 transition hover:text-[color:var(--store-text)]">Informações de envio</a>
              <a href="#perguntas-frequentes" className="px-4 py-4 transition hover:text-[color:var(--store-text)]">Perguntas frequentes</a>
            </div>

            <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-7 text-sm leading-7 text-[color:var(--store-text-muted)]">
                <ProductInfoBlock id="descricao-completa" paragraphs={descriptionParagraphs} title="Descrição completa" />
                <ProductInfoBlock id="modo-de-uso" paragraphs={usageParagraphs} title="Modo de uso" />
                <ProductInfoBlock id="informacoes-de-envio" paragraphs={shippingParagraphs} title="Informações de envio" />
                <ProductInfoBlock id="perguntas-frequentes" paragraphs={faqParagraphs} title="Perguntas frequentes" />
                {documents.length > 0 ? (
                  <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    {documents.map((media) => (
                      <a
                        key={media.id}
                        href={media.storageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-12 items-center gap-3 rounded-full border border-black/10 bg-[#f0f0f0] px-4 text-sm font-semibold text-black transition hover:border-black/30"
                        data-track-event="sales_catalog_product_media_opened"
                        data-track-label={media.fileName}
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        <span className="truncate">{media.fileName}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>

              <aside className="rounded-[20px] border border-black/10 bg-[#f0f0f0] p-4">
                <div className="flex items-center gap-2 text-black">
                  <ReceiptText className="h-4 w-4" />
                  <p className="text-sm font-semibold text-[color:var(--store-text)]">Importante</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-[color:var(--store-text-muted)]">
                  {importantNotice}
                </p>
              </aside>
            </div>
          </section>

          <aside className="grid content-start gap-5">
            <section className="rounded-[20px] border border-black/10 bg-white p-5 shadow-lg shadow-black/5">
              <p className="text-sm font-semibold text-[color:var(--store-text)]">Detalhes rápidos</p>
              <div className="mt-4 grid gap-3 text-sm">
                {quickDetails.map((detail) => (
                  <DetailLine key={detail.id} label={detail.label} value={detail.value} />
                ))}
              </div>
              <details className="mt-4">
                <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-full bg-[#f0f0f0] px-4 py-3 text-xs font-bold text-black">
                  Ver mais informações técnicas
                  <ChevronDown className="h-4 w-4" />
                </summary>
                <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                  {item.attributes.length > 0 ? (
                    item.attributes.map((attribute) => (
                      <p key={attribute.id}>
                        <strong>{attribute.name}:</strong> {attribute.values.join(", ")}
                      </p>
                    ))
                  ) : (
                    <p>Sem variacoes tecnicas adicionais cadastradas.</p>
                  )}
                </div>
              </details>
            </section>

          </aside>
        </div>

        {related.length > 0 ? (
          <section className="mt-14 border-t border-black/10 pt-10 sm:mt-16 sm:pt-14">
            <h2 className="text-center text-[24px] font-semibold leading-[30px] text-[color:var(--store-text)] md:text-[34px] md:leading-[40px]">
              Você também pode gostar
            </h2>
            <div className="mt-8 grid grid-cols-2 gap-4 md:mt-12 md:grid-cols-4 md:gap-5">
              {related.map((relatedItem) => (
                <RelatedProductCard
                  key={relatedItem.id}
                  item={relatedItem}
                  href={buildLeadAwareSalesCatalogStoreProductUrl({
                    storeSlug,
                    productId: relatedItem.id,
                    organizationId: organization.id,
                    leadId,
                    leadPhone,
                    conversationId,
                    trackingLinkId,
                  })}
                  variant="showcase"
                />
              ))}
            </div>
          </section>
        ) : null}
      </section>

      {whatsappReturn ? (
        <a
          href={whatsappReturn.href}
          className="fixed bottom-20 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-2xl shadow-emerald-900/30 transition hover:bg-[#20bf5a] sm:bottom-7 sm:right-7"
          target="_blank"
          rel="noreferrer"
          data-track-event="sales_catalog_product_whatsapp_clicked"
          data-track-label={item.title}
          aria-label={`Falar com ${whatsappReturn.displayName ?? branding.displayName} no WhatsApp`}
        >
          <MessageCircle className="h-7 w-7" />
        </a>
      ) : null}
      <ProductMobileCheckoutBar
        cartUrl={storeCartUrl}
        disabled={!canCheckout}
        organizationId={organization.id}
        productId={item.id}
      />
      <PublicStoreFooter
        branding={branding}
        cartUrl={storeCartUrl}
        footerContactText={storefront.footerContactText}
        footerText={storefront.footerText}
        storeSlug={storeSlug}
        storeProductsUrl={storeProductsUrl}
        storeUrl={storeUrl}
        tracking={{
          leadId,
          leadPhone,
          conversationId,
          trackingLinkId,
        }}
        whatsappHref={whatsappReturn?.href ?? null}
      />
    </main>
  );
}

async function loadProductRow(client: ReturnType<typeof createServiceClient>, productId: string) {
  const itemId = normalizeUuid(productId);

  if (!itemId) return null;

  const { data } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("id", itemId)
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_item")
    .maybeSingle<SalesCatalogMemoryRow>();

  return data ?? null;
}

async function loadOrganization(client: ReturnType<typeof createServiceClient>, organizationId: string) {
  const { data } = await client
    .from("organizations")
    .select("id, name, slug, metadata")
    .eq("id", organizationId)
    .maybeSingle<OrganizationRow>();

  return data ?? null;
}

async function loadRelatedProducts(
  client: ReturnType<typeof createServiceClient>,
  item: ClientSalesCatalogItem,
  organizationId: string,
) {
  const query = client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_item")
    .neq("id", item.id)
    .filter("metadata->>status", "eq", "active")
    .limit(8);

  if (item.category) {
    query.filter("metadata->>category", "eq", item.category);
  }

  const { data } = await query;

  return ((data ?? []) as SalesCatalogMemoryRow[])
    .map(mapSalesCatalogItem)
    .filter((related) => (
      related.salesDestination === "connectyhub_checkout"
      && related.status === "active"
      && isSalesCatalogDisplayableProduct(related)
      && !(related.inventory.status === "out_of_stock" && !related.inventory.allowBackorder)
    ))
    .slice(0, 4);
}

async function loadProductWhatsapp(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    conversationId: string | null;
    item: ClientSalesCatalogItem;
  },
) {
  const candidateInstanceIds = [
    input.item.sourceWhatsappInstanceId,
    ...input.item.assignedWhatsappInstanceIds,
  ].filter((value): value is string => Boolean(value));

  if (input.conversationId) {
    const { data: conversation } = await client
      .from("conversations")
      .select("whatsapp_instance_id, metadata")
      .eq("id", input.conversationId)
      .eq("organization_id", input.organizationId)
      .maybeSingle<ProductConversationRow>();
    const metadata = readRecord(conversation?.metadata);
    const conversationWhatsappInstanceId = conversation?.whatsapp_instance_id ?? readString(metadata.whatsapp_instance_id);

    if (conversationWhatsappInstanceId && !candidateInstanceIds.includes(conversationWhatsappInstanceId)) {
      candidateInstanceIds.unshift(conversationWhatsappInstanceId);
    }
  }

  for (const instanceId of candidateInstanceIds) {
    const { data: instance } = await client
      .from("whatsapp_instances")
      .select("id, phone_number, display_name, status")
      .eq("id", instanceId)
      .eq("organization_id", input.organizationId)
      .not("phone_number", "is", null)
      .maybeSingle<ProductWhatsappRow>();

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
    .maybeSingle<ProductWhatsappRow>();

  return data ?? null;
}

function buildProductPublicTrackingContext(input: {
  organizationId: string;
  productId: string;
  leadId: string | null;
  leadPhone: string | null;
  conversationId: string | null;
  trackingLinkId: string | null;
}): ConnectyPublicTrackingContext {
  const secret = process.env.TRACKING_PUBLIC_TOKEN_SECRET;

  return {
    scope: "organization",
    organization_id: input.organizationId,
    tracking_token: secret ? createOrganizationTrackingToken(input.organizationId, secret) : null,
    lead_id: input.leadId,
    lead_phone: input.leadPhone,
    conversation_id: input.conversationId,
    tracking_link_id: input.trackingLinkId,
    product_id: input.productId,
    catalog_item_id: input.productId,
    tracking_source: "sales_catalog_product",
  };
}

function ProductTopBar({
  branding,
  cartUrl,
  productsUrl,
  storeUrl,
}: {
  branding: OrganizationBranding;
  cartUrl: string;
  productsUrl: string;
  storeUrl: string;
}) {
  return (
    <>
      <div className="px-4 py-2 text-center text-xs font-medium text-[color:var(--store-offer-text)] sm:text-sm" style={{ backgroundColor: "var(--store-primary)" }}>
        <span>Compra segura na {branding.displayName}.</span>
        <Link className="ml-1 font-bold underline underline-offset-2" href={productsUrl}>
          Ver outros produtos
        </Link>
      </div>
      <header className="sticky top-0 z-30 bg-white">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:py-6">
          <div className="flex min-w-0 items-center gap-4">
            <details className="group relative md:hidden">
              <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full text-[color:var(--store-text)] transition hover:bg-black/5" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </summary>
              <div className="absolute left-0 top-12 z-40 grid w-56 gap-1 rounded-[16px] border border-black/10 bg-white p-2 shadow-2xl shadow-black/15">
                <ProductMenuLink href={storeUrl} label="Início" icon={<ArrowLeft className="h-4 w-4" />} />
                <ProductMenuLink href={productsUrl} label="Produtos" />
                <ProductMenuLink href={`${productsUrl}#ofertas`} label="Ofertas" />
                <ProductMenuLink href={storeUrl} label="Novidades" />
                <ProductMenuLink href={`${storeUrl}#categorias`} label="Categorias" />
                <ProductMenuLink href={cartUrl} label="Carrinho" />
              </div>
            </details>
            <StoreIdentity branding={branding} storeUrl={storeUrl} />
          </div>

          <nav className="hidden items-center gap-6 text-sm text-[color:var(--store-text)] md:flex">
            <Link className="font-medium hover:opacity-70" href={productsUrl}>Produtos</Link>
            <Link className="font-medium hover:opacity-70" href={`${productsUrl}#ofertas`}>Ofertas</Link>
            <Link className="font-medium hover:opacity-70" href={storeUrl}>Novidades</Link>
            <Link className="font-medium hover:opacity-70" href={`${storeUrl}#categorias`}>Categorias</Link>
          </nav>

          <label className="relative hidden min-h-12 flex-1 lg:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/40" />
            <input
              readOnly
              className="h-12 w-full rounded-full border-0 bg-[#f0f0f0] px-12 text-sm font-medium text-black outline-none placeholder:text-black/40"
              value=""
              placeholder="Buscar produtos..."
            />
          </label>

          <div className="flex shrink-0 items-center justify-end gap-3">
            <Link href={cartUrl} className="grid h-10 w-10 place-items-center rounded-full text-[color:var(--store-text)] transition hover:bg-black/5" aria-label="Carrinho">
              <ShoppingCart className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}

function ProductMenuLink({ href, icon, label }: { href: string; icon?: ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-semibold text-[color:var(--store-text)] transition hover:bg-black/5">
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function StoreIdentity({
  branding,
  storeUrl,
}: {
  branding: OrganizationBranding;
  storeUrl: string;
}) {
  return (
    <Link href={storeUrl} className="flex min-w-0 items-center gap-3">
      <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-black/10 bg-white shadow-sm">
        {branding.logoUrl ? (
          <Image
            alt={branding.logoAlt}
            src={branding.logoUrl}
            fill
            unoptimized
            sizes="40px"
            className="object-contain p-1"
          />
        ) : (
          <Store className="h-5 w-5" style={{ color: "var(--store-accent)" }} aria-hidden="true" />
        )}
      </div>
      <p className="truncate text-lg font-semibold leading-none text-[color:var(--store-text)] lg:text-2xl">{branding.displayName}</p>
    </Link>
  );
}

function TrustPill({ icon, label, tone = "blue" }: { icon: ReactNode; label: string; tone?: "blue" | "green" }) {
  return (
    <span className={cn(
      "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-bold",
      tone === "green"
        ? "border-emerald-100 bg-emerald-50 text-[#128C4A]"
        : "border-black/10 bg-[#f0f0f0] text-black",
    )}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

function ProductBadge({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" }) {
  return (
    <span className={cn(
      "rounded-full border px-3 py-1.5 text-xs font-semibold",
      tone === "green"
        ? "border-[#25D366]/35 bg-[#25D366]/10 text-[#128C4A]"
        : "border-black/10 bg-[#f0f0f0] text-black",
    )}>
      {children}
    </span>
  );
}

function Benefit({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-black/10 sm:gap-3 sm:border-r sm:last:border-r-0">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f0f0f0] text-[color:var(--store-accent)] sm:h-11 sm:w-11">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold leading-4 text-[color:var(--store-text)] sm:text-sm">{title}</span>
        <span className="block text-[11px] font-medium leading-4 text-[color:var(--store-text-muted)] sm:text-xs">{subtitle}</span>
      </span>
    </div>
  );
}

function ProductInfoBlock({
  id,
  paragraphs,
  title,
}: {
  id: string;
  paragraphs: string[];
  title: string;
}) {
  if (paragraphs.length === 0) return null;

  return (
    <section id={id} className="scroll-mt-24">
      <h3 className="mb-3 text-sm font-semibold text-[color:var(--store-text)]">{title}</h3>
      <div className="space-y-4">
        {paragraphs.map((paragraph, index) => (
          <p key={`${id}-${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <span className="text-[color:var(--store-text-muted)]">{label}</span>
      <span className="max-w-[58%] truncate text-right font-bold text-[color:var(--store-text)]">{value}</span>
    </div>
  );
}

function RelatedProductCard({
  href,
  item,
  variant = "compact",
}: {
  href: string;
  item: ClientSalesCatalogItem;
  variant?: "compact" | "showcase";
}) {
  const cover = item.media.find((media) => media.kind === "image") ?? null;

  if (variant === "showcase") {
    return (
      <Link
        href={href}
        className="group flex min-w-0 flex-col items-start text-left"
        data-track-event="sales_catalog_similar_product_clicked"
        data-track-label={item.title}
      >
        <span className="relative mb-2.5 grid aspect-square w-full place-items-center overflow-hidden rounded-[13px] bg-[#f0f0f0] lg:mb-4 lg:rounded-[20px]">
          {cover ? (
            <Image
              alt={item.title}
              src={cover.storageUrl}
              fill
              unoptimized
              sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 230px"
              className="object-contain p-3 transition duration-500 group-hover:scale-105"
            />
          ) : (
            <Package className="h-10 w-10 text-black/30" aria-hidden="true" />
          )}
        </span>
        <strong className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[color:var(--store-card-text)] xl:text-lg">
          {item.title}
        </strong>
        <span className="mt-1 flex items-end">
          <span className="flex items-center gap-0.5 text-[#ffc633]">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star className="h-4 w-4 fill-current" key={index} />
            ))}
          </span>
          <span className="ml-[11px] pb-0.5 text-xs text-black xl:ml-[13px] xl:text-sm">
            4.8<span className="text-black/60">/5</span>
          </span>
        </span>
        <span className="mt-1 text-xl font-semibold text-[color:var(--store-card-text)] xl:text-2xl">{formatProductPrice(item)}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border border-black/10 bg-white p-3 transition hover:border-black/30 hover:bg-[#f0f0f0]"
      data-track-event="sales_catalog_similar_product_clicked"
      data-track-label={item.title}
    >
      <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-50">
        {cover ? (
          <Image
            alt={item.title}
            src={cover.storageUrl}
            fill
            unoptimized
            sizes="64px"
            className="object-contain p-1"
          />
        ) : (
          <Package className="m-5 h-6 w-6 text-black/30" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-semibold leading-5 text-[color:var(--store-card-text)]">{item.title}</p>
        <p className="mt-1 text-sm font-semibold text-[color:var(--store-card-text)]">{formatProductPrice(item)}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-[color:var(--store-accent)]" />
    </Link>
  );
}

function PublicStoreFooter({
  branding,
  cartUrl,
  footerContactText,
  footerText,
  storeSlug,
  storeProductsUrl,
  storeUrl,
  tracking,
  whatsappHref,
}: {
  branding: OrganizationBranding;
  cartUrl: string;
  footerContactText: string;
  footerText: string;
  storeSlug: string;
  storeProductsUrl: string;
  storeUrl: string;
  tracking: {
    leadId: string | null;
    leadPhone: string | null;
    conversationId: string | null;
    trackingLinkId: string | null;
  };
  whatsappHref: string | null;
}) {
  const supportHref = whatsappHref ?? storeUrl;
  const supportIsExternal = Boolean(whatsappHref);

  return (
    <footer className="mt-16 bg-[#f0f0f0]">
      <div className="mx-auto w-full max-w-[1240px] px-4">
        <StoreNewsletterCard branding={branding} storeSlug={storeSlug} tracking={tracking} />

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 px-0 pb-10 pt-12 md:grid-cols-[1.35fr_1fr_1fr_1fr] md:pt-14">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-3">
              <FooterStoreLogo branding={branding} />
              <h2 className="text-[22px] font-semibold leading-none text-[color:var(--store-text)]">{branding.displayName}</h2>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-[color:var(--store-text-muted)]">{footerText}</p>
          </div>
          <ProductFooterColumn
            title="Empresa"
            items={[
              { label: "Sobre", href: storeUrl },
              { label: "Produtos", href: storeProductsUrl },
              { label: "Carrinho", href: cartUrl },
              { label: "Atendimento", href: supportHref, external: supportIsExternal },
            ]}
          />
          <ProductFooterColumn
            title="Ajuda"
            items={[
              { label: "Suporte", href: supportHref, external: supportIsExternal },
              { label: "Entrega", href: supportHref, external: supportIsExternal },
              { label: "Pedidos", href: supportHref, external: supportIsExternal },
              { label: "Pagamentos", href: supportHref, external: supportIsExternal },
            ]}
          />
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-sm font-bold uppercase tracking-[3px] text-[color:var(--store-text)]">Pagamento</h3>
            <p className="mt-4 text-sm leading-6 text-[color:var(--store-text-muted)]">
              Checkout seguro pela ConnectyHub. {footerContactText}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {productPaymentBadges.map((item) => (
                <ProductPaymentBadge key={item.label} label={item.label} tone={item.tone} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mx-auto w-full max-w-[1240px] border-t border-black/10 px-4 py-5 text-xs text-[color:var(--store-text-muted)]">
        {branding.displayName} - Checkout seguro pela{" "}
        <a className="font-bold text-[color:var(--store-text)] hover:underline" href={connectHubPublicUrl} rel="noreferrer" target="_blank">
          ConnectyHub
        </a>
      </p>
    </footer>
  );
}

function FooterStoreLogo({ branding }: { branding: OrganizationBranding }) {
  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-[#e5e2d8] bg-white">
      {branding.logoUrl ? (
        <Image alt={branding.logoAlt} className="object-contain p-1" fill sizes="40px" src={branding.logoUrl} unoptimized />
      ) : (
        <Store className="h-5 w-5 text-[color:var(--store-accent)]" />
      )}
    </span>
  );
}

type ProductPaymentBadgeTone = "visa" | "mastercard" | "pix" | "paypal" | "gpay";

const productPaymentBadges: Array<{ label: string; tone: ProductPaymentBadgeTone }> = [
  { label: "Visa", tone: "visa" },
  { label: "Mastercard", tone: "mastercard" },
  { label: "Pix", tone: "pix" },
  { label: "PayPal", tone: "paypal" },
  { label: "G Pay", tone: "gpay" },
];

function ProductPaymentBadge({ label, tone }: { label: string; tone: ProductPaymentBadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-[6px] border px-3 text-xs font-bold shadow-sm",
        tone === "visa" && "border-[#1a1f71]/20 bg-[#1a1f71] text-white",
        tone === "mastercard" && "border-[#eb001b]/20 bg-gradient-to-r from-[#eb001b] to-[#f79e1b] text-white",
        tone === "pix" && "border-[#32bcad]/20 bg-[#32bcad] text-white",
        tone === "paypal" && "border-[#003087]/20 bg-[#003087] text-white",
        tone === "gpay" && "border-black/10 bg-white text-black",
      )}
    >
      {label}
    </span>
  );
}

function ProductFooterColumn({
  items,
  title,
}: {
  items: Array<{ label: string; href: string; external?: boolean }>;
  title: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-[3px] text-[color:var(--store-text)]">{title}</h3>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <a
            className="text-sm text-[color:var(--store-text-muted)] transition hover:text-[color:var(--store-text)]"
            href={item.href}
            key={item.label}
            rel={item.external ? "noreferrer" : undefined}
            target={item.external ? "_blank" : undefined}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
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

function buildProductWhatsappReturn(input: {
  phoneNumber: string | null;
  displayName: string | null;
  organizationName: string;
  productTitle: string;
}): ProductWhatsappReturn | null {
  const phone = normalizeWhatsappPhone(input.phoneNumber);

  if (!phone) {
    return null;
  }

  const message = [
    `Ola, vim da pagina do produto ${input.productTitle} da ${input.organizationName}.`,
    "Quero continuar o atendimento pelo WhatsApp.",
  ].join(" ");

  return {
    href: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    phoneLabel: formatWhatsappPhone(phone),
    displayName: input.displayName ?? input.organizationName,
  };
}

function createShortDescription(value: string) {
  const firstParagraph = splitDescription(value)[0] ?? value;
  const compact = firstParagraph.replace(/\s+/g, " ").trim();

  if (compact.length <= 190) return compact;

  const slice = compact.slice(0, 190);
  const lastBreak = Math.max(slice.lastIndexOf("."), slice.lastIndexOf(","), slice.lastIndexOf(" "));
  const ending = lastBreak > 110 ? slice.slice(0, lastBreak) : slice;

  return `${ending.trim()}...`;
}

function buildProductHighlights(item: ClientSalesCatalogItem, preview: string) {
  const candidates = [
    item.offer.callToAction,
    ...splitDescription(item.description)
      .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
      .map((sentence) => sentence.replace(/^[-*\u2022]\s*/, "").trim()),
    preview,
    `${formatFulfillment(item.fulfillment.mode)} com atendimento pelo WhatsApp`,
    "Compra segura dentro da estrutura da loja",
  ];
  const unique = new Set<string>();

  for (const candidate of candidates) {
    const value = cleanHighlight(candidate);
    if (value) {
      unique.add(value);
    }
    if (unique.size >= 4) break;
  }

  return Array.from(unique);
}

function buildDefaultUsageInfo(item: ClientSalesCatalogItem) {
  const instructions = [
    item.fulfillment.accessInstructions,
    item.fulfillment.deliveryInstructions,
    item.offer.callToAction,
  ].filter(Boolean).join(" ");

  return instructions
    || "Combine pelo WhatsApp oficial da loja antes de finalizar a compra. O atendimento confirma os dados do pedido, disponibilidade e orientacoes deste item.";
}

function buildDefaultShippingInfo(item: ClientSalesCatalogItem) {
  const parts = [
    item.shipping.notes,
    item.fulfillment.deliveryInstructions,
    item.shipping.profile === "free" ? "Frete gratis quando aplicavel." : null,
    item.shipping.profile === "custom" ? "Frete combinado diretamente no atendimento." : null,
  ].filter(Boolean);

  return parts.join(" ") || "O pedido e acompanhado pela loja pelo WhatsApp. Dados de entrega, retirada ou acesso sao confirmados antes da finalizacao.";
}

function buildDefaultFaqInfo(item: ClientSalesCatalogItem) {
  return [
    `Este item esta ${formatStockLabel(item).toLowerCase()}? A disponibilidade e confirmada no momento do pedido.`,
    `Como finalizar? Toque em comprar agora e siga o checkout seguro da loja.`,
    `Preciso falar com alguem? O atendimento continua pelo WhatsApp oficial da loja.`,
  ].join("\n");
}

function buildProductQuickDetails(
  item: ClientSalesCatalogItem,
  brand: string | null,
  application: string | null,
) {
  const defaultDetails = [
    { id: "category", label: "Categoria", value: item.category ?? "Produto" },
    { id: "fulfillment", label: "Entrega", value: formatFulfillment(item.fulfillment.mode) },
    { id: "availability", label: "Disponibilidade", value: formatStockLabel(item) },
    brand ? { id: "brand", label: "Marca", value: brand } : null,
    application ? { id: "application", label: "Aplicacao", value: application } : null,
  ].filter((detail): detail is { id: string; label: string; value: string } => Boolean(detail));
  const customDetails = item.pageContent.quickDetails.map((detail) => ({
    id: `custom_${detail.id}`,
    label: detail.label,
    value: detail.value,
  }));
  const seenLabels = new Set<string>();
  const details = [...defaultDetails, ...customDetails].filter((detail) => {
    const label = normalizeText(detail.label);
    if (seenLabels.has(label)) return false;
    seenLabels.add(label);
    return true;
  });

  return details.slice(0, 10);
}

function cleanHighlight(value: string | null | undefined) {
  const compact = value?.replace(/\s+/g, " ").trim();

  if (!compact || compact.length < 18) return null;
  if (compact.length <= 86) return compact;

  const slice = compact.slice(0, 86);
  const lastBreak = Math.max(slice.lastIndexOf("."), slice.lastIndexOf(","), slice.lastIndexOf(" "));

  return `${(lastBreak > 42 ? slice.slice(0, lastBreak) : slice).trim()}...`;
}

function findAttributeValue(item: ClientSalesCatalogItem, name: string) {
  const normalizedName = normalizeText(name);
  const attribute = item.attributes.find((entry) => normalizeText(entry.name).includes(normalizedName));

  return attribute?.values[0] ?? null;
}

function inferBrandFromTitle(title: string) {
  const parts = title.split("|").map((part) => part.trim()).filter(Boolean);

  return parts.length > 1 ? parts[parts.length - 1] : null;
}

function formatProductPrice(item: ClientSalesCatalogItem) {
  const price = normalizeCurrencyAmount(item.offer.salePrice) ?? normalizeCurrencyAmount(item.price);

  return price ? formatCurrency(price) : "Sob consulta";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatStockLabel(item: ClientSalesCatalogItem) {
  if (item.inventory.status === "out_of_stock") {
    return item.inventory.allowBackorder ? "Sob encomenda" : "Esgotado";
  }

  if (item.inventory.status === "on_backorder") {
    return "Sob encomenda";
  }

  return "Disponível";
}

function formatFulfillment(value: ClientSalesCatalogItem["fulfillment"]["mode"]) {
  if (value === "digital") return "Digital";
  if (value === "service") return "Serviço";
  if (value === "subscription") return "Assinatura";
  return "Produto físico";
}

function splitDescription(value: string) {
  return value
    .split(/\n{2,}|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readSearchString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
