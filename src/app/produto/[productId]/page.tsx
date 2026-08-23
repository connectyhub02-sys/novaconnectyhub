import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Box,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileText,
  Headphones,
  Home,
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
import { ProductCheckoutButton } from "@/components/checkout/sales-catalog-product-actions";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import { buildLeadAwareSalesCatalogProductUrl, buildLeadAwareSalesCatalogStoreUrl } from "@/lib/sales-catalog/public-urls";
import { isSalesCatalogDisplayableProduct, type ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { createServiceClient } from "@/lib/supabase/service";
import { createOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";
import type { ConnectyPublicTrackingContext } from "@/lib/tracking/public-context";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
      description: "Produto indisponivel no catalogo ConnectyHub.",
    };
  }

  const item = mapSalesCatalogItem(row);

  if (!isSalesCatalogDisplayableProduct(item)) {
    return {
      title: "Produto | ConnectyHub",
      description: "Produto indisponivel no catalogo ConnectyHub.",
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
  const [related, whatsapp] = await Promise.all([
    loadRelatedProducts(client, item, row.organization_id),
    loadProductWhatsapp(client, {
      organizationId: row.organization_id,
      conversationId,
      item,
    }),
  ]);
  const price = normalizeCurrencyAmount(item.offer.salePrice) ?? normalizeCurrencyAmount(item.price);
  const canCheckout = item.salesDestination === "connectyhub_checkout" && price !== null;
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
  const branding = resolveOrganizationBranding(organization);
  const storeSlug = organization.slug ?? organization.id;
  const storeUrl = buildLeadAwareSalesCatalogStoreUrl({
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
  const descriptionPreview = createShortDescription(item.description);
  const descriptionParagraphs = splitDescription(item.description);
  const highlights = buildProductHighlights(item, descriptionPreview);
  const sku = item.skus.find((entry) => entry.status === "active")?.skuCode
    ?? item.platformProductCode
    ?? item.tag;
  const brand = findAttributeValue(item, "marca") ?? inferBrandFromTitle(item.title);
  const application = findAttributeValue(item, "aplicacao") ?? formatFulfillment(item.fulfillment.mode);

  return (
    <main className="min-h-screen bg-white pb-24 text-slate-950 sm:pb-0">
      <script
        id="connecty-public-tracking-context"
        dangerouslySetInnerHTML={{
          __html: `window.__CONNECTYHUB_TRACKING_CONTEXT__=${safeJson(publicTrackingContext)};`,
        }}
      />
      <ProductTopBar branding={branding} storeUrl={storeUrl} />

      <section className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
        <nav className="hidden items-center gap-2 text-xs font-semibold text-slate-500 lg:flex">
          <Link href={storeUrl} className="transition hover:text-blue-600">Inicio</Link>
          <ArrowRight className="h-3.5 w-3.5" />
          <span>{item.category ?? "Produto"}</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="line-clamp-1 max-w-sm text-slate-950">{item.title}</span>
        </nav>

        <div className="mt-4 hidden flex-wrap items-center justify-end gap-3 lg:flex">
          <TrustPill icon={<ShieldCheck className="h-4 w-4" />} label="Compra segura" />
          <TrustPill icon={<MessageCircle className="h-4 w-4" />} label="Atendimento WhatsApp" />
          <TrustPill icon={<CheckCircle2 className="h-4 w-4" />} label={formatStockLabel(item)} tone="green" />
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,0.84fr)]">
            <SalesCatalogMediaGallery title={item.title} media={galleryMedia} />

            <div className="min-w-0 rounded-lg border border-blue-100 bg-white p-4 shadow-lg shadow-blue-950/5 sm:p-6 lg:border-0 lg:p-2 lg:shadow-none">
              <div className="flex flex-wrap gap-2">
                <ProductBadge>{item.category ?? "Produto"}</ProductBadge>
                <ProductBadge tone="green">{formatStockLabel(item)}</ProductBadge>
              </div>

              <h1 className="mt-4 text-2xl font-black uppercase leading-tight text-[#070b1d] sm:text-3xl xl:text-[34px]">
                {item.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <div className="flex items-center gap-1 text-blue-600" aria-label="Produto em destaque da loja">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <span className="font-semibold text-slate-600">Produto da loja oficial</span>
                <span className="hidden h-4 w-px bg-slate-200 sm:block" />
                <span className="font-mono text-xs font-semibold text-slate-500">SKU: {sku}</span>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-600">
                {descriptionPreview}
              </p>

              <ul className="mt-5 grid gap-2.5">
                {highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-2 text-sm font-semibold leading-5 text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 hidden grid-cols-3 gap-3 border-t border-blue-100 pt-5 lg:grid">
                <MicroTrust icon={<Truck className="h-4 w-4" />} title="Entrega discreta" subtitle="Embalagem neutra" />
                <MicroTrust icon={<CreditCard className="h-4 w-4" />} title="Pagamento seguro" subtitle="Dados protegidos" />
                <MicroTrust icon={<ShieldCheck className="h-4 w-4" />} title="Privacidade total" subtitle="Compra segura" />
              </div>
            </div>
          </section>

          <PurchaseCard
            canCheckout={canCheckout}
            installments={installments}
            item={item}
            priceLabel={priceLabel}
            productId={item.id}
            whatsappReturn={whatsappReturn}
            storeUrl={storeUrl}
          />
        </div>

        <section className="mt-5 grid gap-3 rounded-lg border border-blue-100 bg-white p-4 shadow-lg shadow-blue-950/5 sm:grid-cols-4 sm:p-5">
          <Benefit icon={<LockKeyhole className="h-6 w-6" />} title="Checkout seguro" subtitle="Ambiente criptografado" />
          <Benefit icon={<Truck className="h-6 w-6" />} title="Envio discreto" subtitle="Pedido acompanhado" />
          <Benefit icon={<BadgeCheck className="h-6 w-6" />} title="Produto original" subtitle="Catalogo da loja" />
          <Benefit icon={<PackageCheck className="h-6 w-6" />} title="Pedido rastreado" subtitle="Acompanhe em tempo real" />
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.46fr)]">
          <section className="rounded-lg border border-blue-100 bg-white shadow-lg shadow-blue-950/5">
            <div className="grid border-b border-blue-100 text-center text-sm font-bold text-slate-600 sm:grid-cols-4">
              <span className="border-b-2 border-blue-600 px-4 py-4 text-blue-600">Descricao completa</span>
              <span className="px-4 py-4">Modo de uso</span>
              <span className="px-4 py-4">Informacoes de envio</span>
              <span className="px-4 py-4">Perguntas frequentes</span>
            </div>

            <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4 text-sm leading-7 text-slate-700">
                {descriptionParagraphs.map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
                ))}
                {documents.length > 0 ? (
                  <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    {documents.map((media) => (
                      <a
                        key={media.id}
                        href={media.storageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-12 items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:border-blue-300"
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

              <aside className="rounded-lg border border-blue-100 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-blue-600">
                  <ReceiptText className="h-4 w-4" />
                  <p className="text-sm font-black text-slate-950">Importante</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Confira os dados do pedido antes de finalizar. O atendimento continua pelo WhatsApp oficial da loja.
                </p>
              </aside>
            </div>
          </section>

          <aside className="grid content-start gap-5">
            <section className="rounded-lg border border-blue-100 bg-white p-5 shadow-lg shadow-blue-950/5">
              <p className="text-sm font-black text-slate-950">Detalhes rapidos</p>
              <div className="mt-4 grid gap-3 text-sm">
                <DetailLine label="Categoria" value={item.category ?? "Produto"} />
                <DetailLine label="Entrega" value={formatFulfillment(item.fulfillment.mode)} />
                <DetailLine label="Disponibilidade" value={formatStockLabel(item)} />
                {brand ? <DetailLine label="Marca" value={brand} /> : null}
                {application ? <DetailLine label="Aplicacao" value={application} /> : null}
              </div>
              <details className="mt-4">
                <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700">
                  Ver mais informacoes tecnicas
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

            {related.length > 0 ? (
              <section className="rounded-lg border border-blue-100 bg-white p-5 shadow-lg shadow-blue-950/5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-slate-950">Produtos semelhantes</p>
                  <Link href={storeUrl} className="text-xs font-bold text-blue-600">Ver todos</Link>
                </div>
                <div className="mt-4 grid gap-3">
                  {related.map((relatedItem) => (
                    <RelatedProductCard
                      key={relatedItem.id}
                      item={relatedItem}
                      href={buildLeadAwareSalesCatalogProductUrl({
                        productId: relatedItem.id,
                        organizationId: organization.id,
                        leadId,
                        leadPhone,
                        conversationId,
                        trackingLinkId,
                      })}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>

        <section className="mt-5 grid gap-3 sm:hidden">
          <MobileAccordion title="Descricao completa">
            {descriptionParagraphs.slice(0, 4).map((paragraph, index) => (
              <p key={`${index}-mobile-description`}>{paragraph}</p>
            ))}
          </MobileAccordion>
          <MobileAccordion title="Modo de uso">
            <p>{item.fulfillment.deliveryInstructions ?? item.fulfillment.accessInstructions ?? "Combine os detalhes com o atendimento da loja pelo WhatsApp."}</p>
          </MobileAccordion>
          <MobileAccordion title="Informacoes de envio">
            <p>{item.shipping.notes ?? "A loja confirma envio, prazo e disponibilidade durante o atendimento."}</p>
          </MobileAccordion>
        </section>
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
      <MobileBottomNav storeUrl={storeUrl} whatsappHref={whatsappReturn?.href ?? null} />
      <PoweredByConnectyHub />
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

function ProductTopBar({ branding, storeUrl }: { branding: OrganizationBranding; storeUrl: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-blue-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 lg:w-[260px]">
          <Link href={storeUrl} className="grid h-10 w-10 place-items-center rounded-full text-slate-950 transition hover:bg-blue-50 lg:hidden" aria-label="Voltar para loja">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button type="button" className="hidden h-10 w-10 place-items-center rounded-full text-slate-950 transition hover:bg-blue-50 sm:grid lg:hidden" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
          <StoreIdentity branding={branding} storeUrl={storeUrl} />
        </div>

        <label className="relative hidden min-w-0 flex-1 lg:block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            readOnly
            className="h-12 w-full rounded-lg border border-blue-100 bg-white px-12 text-sm font-medium text-slate-500 outline-none"
            value=""
            placeholder="Buscar produtos..."
          />
        </label>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-3 lg:w-[420px]">
          <HeaderTrust icon={<ShieldCheck className="h-5 w-5" />} label="Compra segura" />
          <HeaderTrust icon={<MessageCircle className="h-5 w-5" />} label="Atendimento WhatsApp" />
          <HeaderTrust icon={<Box className="h-5 w-5" />} label="Disponivel para envio" />
          <Link href={storeUrl} className="relative grid h-11 w-11 place-items-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-700/20" aria-label="Sacola">
            <ShoppingCart className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-blue-800 text-[11px] font-black text-white">0</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function PurchaseCard({
  canCheckout,
  installments,
  item,
  priceLabel,
  productId,
  whatsappReturn,
  storeUrl,
}: {
  canCheckout: boolean;
  installments: string | null;
  item: ClientSalesCatalogItem;
  priceLabel: string;
  productId: string;
  whatsappReturn: ProductWhatsappReturn | null;
  storeUrl: string;
}) {
  return (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-2xl shadow-blue-950/10">
        <p className="text-sm font-semibold text-slate-600">Valor do produto</p>
        <p className="mt-1 text-4xl font-black text-blue-600">{priceLabel}</p>
        {installments ? (
          <p className="mt-2 text-sm font-semibold text-slate-600">
            ou 6x de <span className="font-black text-blue-600">{installments}</span> sem juros
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm font-bold text-[#128C4A]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#25D366]" />
            {formatStockLabel(item)}
          </span>
          <span>{item.shipping.profile === "free" ? "Frete gratis" : "Envio imediato"}</span>
        </div>

        <div className="mt-5 grid gap-3">
          <ProductCheckoutButton productId={productId} disabled={!canCheckout} />
          <a
            href={whatsappReturn?.href ?? storeUrl}
            target={whatsappReturn ? "_blank" : undefined}
            rel={whatsappReturn ? "noreferrer" : undefined}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#25D366]/30 bg-white px-5 text-sm font-bold text-[#128C4A] transition hover:bg-[#25D366] hover:text-white"
            data-track-event="sales_catalog_product_whatsapp_clicked"
            data-track-label={item.title}
          >
            <MessageCircle className="h-4 w-4" />
            {whatsappReturn ? "Falar no WhatsApp" : "Ver loja"}
          </a>
        </div>

        <div className="mt-5 grid gap-3 border-t border-blue-100 pt-5 text-sm font-semibold text-slate-700">
          <span className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-blue-600" /> Checkout 100% seguro</span>
          <span className="flex items-center gap-3"><LockKeyhole className="h-4 w-4 text-blue-600" /> Seus dados sempre protegidos</span>
          <span className="flex items-center gap-3"><BadgeCheck className="h-4 w-4 text-blue-600" /> Satisfacao garantida pela loja</span>
        </div>
      </div>
    </aside>
  );
}

function StoreIdentity({ branding, storeUrl }: { branding: OrganizationBranding; storeUrl: string }) {
  return (
    <Link href={storeUrl} className="flex min-w-0 items-center gap-3">
      <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm">
        {branding.logoUrl ? (
          <Image
            alt={branding.logoAlt}
            src={branding.logoUrl}
            fill
            unoptimized
            sizes="48px"
            className="object-contain p-1"
          />
        ) : (
          <Store className="h-5 w-5 text-blue-600" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase leading-4 text-slate-600">Loja oficial</p>
        <p className="truncate text-base font-black leading-5 text-slate-950">{branding.displayName}</p>
      </div>
    </Link>
  );
}

function HeaderTrust({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="hidden items-center gap-2 text-sm font-bold text-slate-800 xl:flex">
      {icon}
      <span className="max-w-24 leading-4">{label}</span>
    </span>
  );
}

function TrustPill({ icon, label, tone = "blue" }: { icon: ReactNode; label: string; tone?: "blue" | "green" }) {
  return (
    <span className={cn(
      "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold",
      tone === "green"
        ? "border-emerald-100 bg-emerald-50 text-[#128C4A]"
        : "border-blue-100 bg-blue-50 text-blue-700",
    )}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

function ProductBadge({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" }) {
  return (
    <span className={cn(
      "rounded-lg border px-3 py-1.5 text-xs font-black",
      tone === "green"
        ? "border-[#25D366]/35 bg-[#25D366]/10 text-[#128C4A]"
        : "border-blue-200 bg-blue-50 text-blue-700",
    )}>
      {children}
    </span>
  );
}

function MicroTrust({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-slate-600">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-black text-slate-950">{title}</span>
        <span className="block truncate text-[10px] font-semibold text-slate-500">{subtitle}</span>
      </span>
    </div>
  );
}

function Benefit({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-blue-100 sm:border-r sm:last:border-r-0">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-slate-950">{title}</span>
        <span className="block truncate text-xs font-medium text-slate-500">{subtitle}</span>
      </span>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[58%] truncate text-right font-bold text-slate-950">{value}</span>
    </div>
  );
}

function RelatedProductCard({ item, href }: { item: ClientSalesCatalogItem; href: string }) {
  const cover = item.media.find((media) => media.kind === "image") ?? null;

  return (
    <Link
      href={href}
      className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-blue-100 bg-white p-3 transition hover:border-blue-300 hover:bg-blue-50"
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
          <Package className="m-5 h-6 w-6 text-blue-300" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-black leading-5 text-slate-950">{item.title}</p>
        <p className="mt-1 text-sm font-black text-blue-600">{formatProductPrice(item)}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-blue-600" />
    </Link>
  );
}

function MobileAccordion({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-lg border border-blue-100 bg-white shadow-lg shadow-blue-950/5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-bold text-slate-950">
        {title}
        <ChevronDown className="h-4 w-4 text-blue-600" />
      </summary>
      <div className="space-y-3 border-t border-blue-100 px-4 py-4 text-sm leading-6 text-slate-600">
        {children}
      </div>
    </details>
  );
}

function MobileBottomNav({ storeUrl, whatsappHref }: { storeUrl: string; whatsappHref: string | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-blue-100 bg-white px-2 py-2 shadow-[0_-16px_40px_rgba(15,23,42,0.12)] sm:hidden">
      <MobileNavItem href={storeUrl} icon={<Home className="h-5 w-5" />} label="Inicio" active />
      <MobileNavItem href={storeUrl} icon={<Package className="h-5 w-5" />} label="Categorias" />
      <MobileNavItem href={storeUrl} icon={<Box className="h-5 w-5" />} label="Pedidos" />
      <MobileNavItem href={whatsappHref ?? storeUrl} icon={<MessageCircle className="h-5 w-5" />} label="WhatsApp" external={Boolean(whatsappHref)} />
      <MobileNavItem href={storeUrl} icon={<Headphones className="h-5 w-5" />} label="Conta" />
    </nav>
  );
}

function MobileNavItem({ active, external, href, icon, label }: { active?: boolean; external?: boolean; href: string; icon: ReactNode; label: string }) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={cn("grid place-items-center gap-1 rounded-lg py-1 text-[11px] font-semibold", active ? "text-blue-600" : "text-slate-600")}
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

function PoweredByConnectyHub() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-center text-xs font-semibold text-slate-500 sm:px-6 lg:px-8">
      Desenvolvido por ConnectyHub
    </footer>
  );
}

function resolveOrganizationBranding(organization: OrganizationRow): OrganizationBranding {
  const metadata = readRecord(organization.metadata);
  const logoUrl = readString(metadata.brand_logo_url);
  const displayName = readString(metadata.public_display_name) ?? organization.name;

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

  return "Disponivel";
}

function formatFulfillment(value: ClientSalesCatalogItem["fulfillment"]["mode"]) {
  if (value === "digital") return "Digital";
  if (value === "service") return "Servico";
  if (value === "subscription") return "Assinatura";
  return "Produto fisico";
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
