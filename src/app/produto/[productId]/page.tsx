import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, FileText, MessageCircle, Package, ShieldCheck, Sparkles } from "lucide-react";
import { ProductCheckoutButton } from "@/components/checkout/sales-catalog-product-actions";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import { buildLeadAwareSalesCatalogProductUrl } from "@/lib/sales-catalog/public-urls";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { createServiceClient } from "@/lib/supabase/service";
import { createOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";
import type { ConnectyPublicTrackingContext } from "@/lib/tracking/public-context";

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
  const cover = item.media.find((media) => media.kind === "image") ?? null;
  const videos = item.media.filter((media) => media.kind === "video");
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
            <div className="relative min-h-[320px] border-b border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 lg:border-b-0 lg:border-r">
              {cover ? (
                <Image
                  alt={item.title}
                  src={cover.storageUrl}
                  fill
                  unoptimized
                  sizes="(max-width: 1023px) 100vw, 52vw"
                  className="object-contain p-6"
                  priority
                />
              ) : (
                <div className="flex h-full min-h-[320px] items-center justify-center">
                  <Package className="h-20 w-20 text-blue-200" aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="flex min-h-[420px] flex-col p-5 sm:p-7">
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[#25D366]">
                  {organization.name}
                </p>
                <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                  {item.title}
                </h1>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {item.description}
                </p>
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
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600">Descricao completa</p>
          <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700">
            {splitDescription(item.description).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
            ))}
          </div>

          {videos.length > 0 || documents.length > 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[...videos, ...documents].map((media) => (
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
    .select("id, name, slug")
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

function ProductFact({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-[8px] border border-emerald-100 bg-emerald-50 px-3 text-xs font-bold text-[#128C4A]">
      {icon}
      <span>{label}</span>
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

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
