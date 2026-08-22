import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, FileText, MessageCircle, Package, ShieldCheck, Sparkles, Store } from "lucide-react";
import { SalesCatalogMediaGallery } from "@/components/checkout/sales-catalog-media-gallery";
import { ProductCheckoutButton } from "@/components/checkout/sales-catalog-product-actions";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import { buildLeadAwareSalesCatalogProductUrl } from "@/lib/sales-catalog/public-urls";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
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

type OrganizationBranding = {
  displayName: string;
  logoUrl: string | null;
  logoAlt: string;
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

  if (item.status !== "active") {
    notFound();
  }

  const organization = await loadOrganization(client, row.organization_id);

  if (!organization) {
    notFound();
  }

  const related = await loadRelatedProducts(client, item, row.organization_id);
  const price = normalizeCurrencyAmount(item.offer.salePrice) ?? normalizeCurrencyAmount(item.price);
  const priceLabel = price ? formatCurrency(price) : "Sob consulta";
  const galleryMedia = item.media.filter((media) => media.kind === "image" || media.kind === "video");
  const documents = item.media.filter((media) => media.kind === "document");
  const leadId = readSearchString(query.lead_id);
  const leadPhone = readSearchString(query.lead_phone);
  const conversationId = readSearchString(query.conversation_id);
  const trackingLinkId = readSearchString(query.tracking_link_id);
  const publicTrackingContext = buildProductPublicTrackingContext({
    organizationId: organization.id,
    productId: item.id,
    leadId,
    leadPhone,
    conversationId,
    trackingLinkId,
  });
  const branding = resolveOrganizationBranding(organization);
  const descriptionPreview = createShortDescription(item.description);
  const hasLongDescription = isLongDescription(item.description, descriptionPreview);

  return (
    <main className="min-h-screen bg-[#f3f8ff] text-slate-950">
      <script
        id="connecty-public-tracking-context"
        dangerouslySetInnerHTML={{
          __html: `window.__CONNECTYHUB_TRACKING_CONTEXT__=${safeJson(publicTrackingContext)};`,
        }}
      />
      <section className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8 lg:py-8">
        <div className="overflow-hidden rounded-[8px] border border-blue-100 bg-white shadow-2xl shadow-blue-950/10">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
            <div className="border-b border-blue-100 lg:border-b-0 lg:border-r">
              <SalesCatalogMediaGallery title={item.title} media={galleryMedia} />
            </div>

            <div className="flex min-h-[420px] flex-col p-5 sm:p-7">
              <div>
                <StoreIdentity branding={branding} />
                <h1 className="mt-5 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                  {item.title}
                </h1>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {descriptionPreview}
                </p>
                {hasLongDescription ? (
                  <a
                    href="#descricao-completa"
                    className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-[#25D366]/35 bg-[#25D366]/10 px-3 py-2 text-xs font-bold text-[#128C4A] transition hover:bg-[#25D366]/15"
                  >
                    Ver mais
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : null}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <ProductFact icon={<ShieldCheck className="h-4 w-4" />} label="Checkout seguro" />
                <ProductFact icon={<MessageCircle className="h-4 w-4" />} label="Atendimento no WhatsApp" />
                <ProductFact icon={<CheckCircle2 className="h-4 w-4" />} label={formatStockLabel(item)} />
              </div>

              <div className="mt-auto pt-7">
                <div className="rounded-[8px] border border-blue-100 bg-blue-50/70 p-4">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600">Valor</p>
                  <p className="mt-2 text-3xl font-black text-slate-950">{priceLabel}</p>
                  {item.offer.callToAction ? (
                    <p className="mt-2 text-sm font-semibold text-[#128C4A]">{item.offer.callToAction}</p>
                  ) : null}
                </div>
                <div className="mt-4">
                  <ProductCheckoutButton
                    productId={item.id}
                    disabled={item.salesDestination !== "connectyhub_checkout" || !price}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <section className="rounded-[8px] border border-blue-100 bg-white p-5 shadow-xl shadow-blue-950/10">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600">Detalhes</p>
            <div className="mt-4 grid gap-3 text-sm">
              <DetailLine label="Categoria" value={item.category ?? "Produto"} />
              <DetailLine label="Entrega" value={formatFulfillment(item.fulfillment.mode)} />
              <DetailLine label="Disponibilidade" value={formatStockLabel(item)} />
              {item.shipping.notes ? <DetailLine label="Frete" value={item.shipping.notes} /> : null}
            </div>
          </section>

          {related.length > 0 ? (
            <section className="rounded-[8px] border border-blue-100 bg-white p-5 shadow-xl shadow-blue-950/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600">Relacionados</p>
                  <h2 className="mt-1 text-lg font-black text-slate-950">Produtos semelhantes</h2>
                </div>
                <Sparkles className="h-5 w-5 text-[#25D366]" aria-hidden="true" />
              </div>
              <div className="mt-4 grid gap-3">
                {related.map((relatedItem) => {
                  const relatedCover = relatedItem.media.find((media) => media.kind === "image") ?? null;

                  return (
                    <Link
                      key={relatedItem.id}
                      href={buildLeadAwareSalesCatalogProductUrl({
                        productId: relatedItem.id,
                        organizationId: organization.id,
                        leadId,
                        leadPhone,
                        conversationId,
                        trackingLinkId,
                      })}
                      className="group flex items-center gap-3 rounded-[8px] border border-blue-100 bg-slate-50 p-3 transition hover:border-[#25D366] hover:bg-emerald-50"
                      data-track-event="sales_catalog_similar_product_clicked"
                      data-track-label={relatedItem.title}
                    >
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] bg-white">
                        {relatedCover ? (
                          <Image
                            alt={relatedItem.title}
                            src={relatedCover.storageUrl}
                            fill
                            unoptimized
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <Package className="m-4 h-6 w-6 text-blue-300" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-950">{relatedItem.title}</p>
                        <p className="mt-1 text-xs font-semibold text-blue-600">{formatProductPrice(relatedItem)}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-[#128C4A]" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </aside>

        <section className="rounded-[8px] border border-blue-100 bg-white p-5 shadow-xl shadow-blue-950/10 lg:col-span-2 sm:p-7">
          <details id="descricao-completa" className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span>
                <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600">Descricao completa</span>
                <span className="mt-1 block text-lg font-black text-slate-950">Detalhes do produto</span>
              </span>
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 transition group-open:bg-[#25D366] group-open:text-white">
                Ver mais
              </span>
            </summary>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
              {splitDescription(item.description).map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
              ))}
            </div>
          </details>

          {documents.length > 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {documents.map((media) => (
                <a
                  key={media.id}
                  href={media.storageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-14 items-center gap-3 rounded-[8px] border border-blue-100 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:border-blue-300"
                  data-track-event="sales_catalog_product_media_opened"
                  data-track-label={media.fileName}
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  <span className="truncate">{media.fileName}</span>
                </a>
              ))}
            </div>
          ) : null}
        </section>
      </section>
      <PoweredByConnectyHub tone="light" />
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
      && !(related.inventory.status === "out_of_stock" && !related.inventory.allowBackorder)
    ))
    .slice(0, 4);
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

function createShortDescription(value: string) {
  const firstParagraph = splitDescription(value)[0] ?? value;
  const compact = firstParagraph.replace(/\s+/g, " ").trim();

  if (compact.length <= 240) return compact;

  const slice = compact.slice(0, 240);
  const lastBreak = Math.max(slice.lastIndexOf("."), slice.lastIndexOf(","), slice.lastIndexOf(" "));
  const ending = lastBreak > 120 ? slice.slice(0, lastBreak) : slice;

  return `${ending.trim()}...`;
}

function isLongDescription(fullDescription: string, preview: string) {
  return fullDescription.replace(/\s+/g, " ").trim().length > preview.replace(/\s+/g, " ").trim().length;
}

function ProductFact({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-[8px] border border-emerald-100 bg-emerald-50 px-3 text-xs font-bold text-[#128C4A]">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function StoreIdentity({ branding }: { branding: OrganizationBranding }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-blue-100 bg-white shadow-sm">
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
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#25D366]">Loja oficial</p>
        <p className="truncate text-sm font-black text-slate-950">{branding.displayName}</p>
      </div>
    </div>
  );
}

function PoweredByConnectyHub({ tone }: { tone: "light" | "dark" }) {
  return (
    <footer className={cn(
      "mx-auto w-full max-w-6xl px-4 pb-8 text-center text-xs font-semibold sm:px-6 lg:px-8",
      tone === "dark" ? "text-slate-500" : "text-slate-500",
    )}>
      Desenvolvido por ConnectyHub
    </footer>
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

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
