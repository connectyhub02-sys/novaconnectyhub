import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  buildSalesCatalogContent,
  createSalesCatalogSlug,
  createSalesCatalogTag,
  emptySalesCatalogProductFulfillment,
  emptySalesCatalogProductInventory,
  emptySalesCatalogProductOffer,
  getSalesCatalogReadiness,
  salesCatalogBusinessTemplates,
  type SalesCatalogAttribute,
  type SalesCatalogBusinessType,
  type SalesCatalogItemAttribute,
  type SalesCatalogMedia,
  type SalesCatalogProductFulfillment,
  type SalesCatalogProductInventory,
  type SalesCatalogProductOffer,
  type SalesCatalogProductShipping,
  type SalesCatalogSku,
  type SalesCatalogSkuStatus,
  type SalesCatalogStockStatus,
} from "@/lib/sales-catalog/shared";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

export type PlatformProductStatus = "draft" | "active" | "paused" | "archived";
export type PlatformProductMarketplaceStatus = "hidden" | "visible" | "featured";
export type PlatformProductCommissionBase = "gross" | "net";
export type PlatformProductOwnerType = "connectyhub" | "client" | "external_provider";
export type PlatformProductSalesChannelType = "direct" | "resale" | "affiliate" | "marketplace";
export type PlatformProductRevenueOwnerType = "connectyhub" | "client" | "split" | "external_provider";
export type PlatformProductCommissionPolicyType = "none" | "percentage" | "fixed" | "custom";
export type PlatformProductPayoutTargetType = "connectyhub" | "client" | "split" | "external_provider";
export type PlatformProductImportStatus = "active" | "paused" | "removed";
export type PlatformProductCommissionStatus = "pending" | "available" | "paid" | "cancelled" | "blocked" | "refunded";

export type PlatformProductSettings = {
  id: string | null;
  configured: boolean;
  businessType: SalesCatalogBusinessType;
  categories: string[];
  attributes: SalesCatalogAttribute[];
  trackInventory: boolean;
  variationMedia: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PlatformProduct = {
  id: string;
  productCode: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  commercialDescription: string;
  category: string | null;
  status: PlatformProductStatus;
  marketplaceStatus: PlatformProductMarketplaceStatus;
  ownerType: PlatformProductOwnerType;
  salesChannelType: PlatformProductSalesChannelType;
  revenueOwnerType: PlatformProductRevenueOwnerType;
  commissionPolicyType: PlatformProductCommissionPolicyType;
  payoutTargetType: PlatformProductPayoutTargetType;
  price: string | null;
  currency: string;
  attributes: SalesCatalogItemAttribute[];
  inventory: SalesCatalogProductInventory;
  offer: SalesCatalogProductOffer;
  fulfillment: SalesCatalogProductFulfillment;
  shipping: SalesCatalogProductShipping;
  skus: SalesCatalogSku[];
  media: SalesCatalogMedia[];
  agentTag: string;
  agentPrompt: string | null;
  salesNotes: string | null;
  commissionPercentage: number;
  commissionBase: PlatformProductCommissionBase;
  commissionReleaseDays: number;
  recurringCommissionMonths: number;
  refundWindowDays: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformProductImport = {
  id: string;
  platformProductId: string;
  organizationId: string;
  importedBy: string | null;
  localCatalogItemId: string | null;
  status: PlatformProductImportStatus;
  salesChannelType: Exclude<PlatformProductSalesChannelType, "direct">;
  revenueOwnerType: Exclude<PlatformProductRevenueOwnerType, "client">;
  commissionPolicyType: Exclude<PlatformProductCommissionPolicyType, "none">;
  localTitle: string | null;
  localAgentNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformProductCommission = {
  id: string;
  platformProductId: string;
  importId: string | null;
  organizationId: string;
  orderId: string | null;
  orderItemId: string | null;
  paymentSessionId: string | null;
  status: PlatformProductCommissionStatus;
  currency: string;
  saleAmount: number;
  saleQuantity: number;
  commissionPercentage: number;
  commissionAmount: number;
  releaseAt: string | null;
  paidAt: string | null;
  metadata: JsonRecord;
  createdAt: string;
  updatedAt: string;
};

export type PlatformProductCatalog = {
  schemaReady: boolean;
  settings: PlatformProductSettings;
  products: PlatformProduct[];
  imports: PlatformProductImport[];
  commissions: PlatformProductCommission[];
  warnings: string[];
};

export type PlatformProductImportResult = {
  importRecord: PlatformProductImport;
  catalogItemId: string;
  agentTag: string;
};

export type PlatformProductRow = {
  id: string;
  product_code: string;
  slug: string;
  name: string;
  short_description: string | null;
  commercial_description: string | null;
  category: string | null;
  status: string | null;
  marketplace_status: string | null;
  owner_type?: string | null;
  sales_channel_type?: string | null;
  revenue_owner_type?: string | null;
  commission_policy_type?: string | null;
  payout_target_type?: string | null;
  price: string | null;
  currency: string | null;
  attributes: unknown;
  inventory: unknown;
  offer: unknown;
  fulfillment: unknown;
  shipping: unknown;
  skus: unknown;
  media: unknown;
  agent_tag: string | null;
  agent_prompt: string | null;
  sales_notes: string | null;
  commission_percentage: string | number | null;
  commission_base: string | null;
  commission_release_days: string | number | null;
  recurring_commission_months: string | number | null;
  refund_window_days: string | number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformProductImportRow = {
  id: string;
  platform_product_id: string;
  organization_id: string;
  imported_by: string | null;
  local_catalog_item_id: string | null;
  status: string | null;
  sales_channel_type?: string | null;
  revenue_owner_type?: string | null;
  commission_policy_type?: string | null;
  local_title: string | null;
  local_agent_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformProductCommissionRow = {
  id: string;
  platform_product_id: string;
  import_id: string | null;
  organization_id: string;
  order_id: string | null;
  order_item_id?: string | null;
  payment_session_id: string | null;
  status: string | null;
  currency: string | null;
  sale_amount: string | number | null;
  sale_quantity?: number | null;
  commission_percentage: string | number | null;
  commission_amount: string | number | null;
  release_at: string | null;
  paid_at: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type PlatformProductSettingsRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

export const PLATFORM_PRODUCT_SELECT = [
  "id",
  "product_code",
  "slug",
  "name",
  "short_description",
  "commercial_description",
  "category",
  "status",
  "marketplace_status",
  "owner_type",
  "sales_channel_type",
  "revenue_owner_type",
  "commission_policy_type",
  "payout_target_type",
  "price",
  "currency",
  "attributes",
  "inventory",
  "offer",
  "fulfillment",
  "shipping",
  "skus",
  "media",
  "agent_tag",
  "agent_prompt",
  "sales_notes",
  "commission_percentage",
  "commission_base",
  "commission_release_days",
  "recurring_commission_months",
  "refund_window_days",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");

const PLATFORM_PRODUCT_IMPORT_SELECT = [
  "id",
  "platform_product_id",
  "organization_id",
  "imported_by",
  "local_catalog_item_id",
  "status",
  "sales_channel_type",
  "revenue_owner_type",
  "commission_policy_type",
  "local_title",
  "local_agent_notes",
  "created_at",
  "updated_at",
].join(", ");

export const PLATFORM_PRODUCT_COMMISSION_SELECT = [
  "id",
  "platform_product_id",
  "import_id",
  "organization_id",
  "order_id",
  "order_item_id",
  "payment_session_id",
  "status",
  "currency",
  "sale_amount",
  "sale_quantity",
  "commission_percentage",
  "commission_amount",
  "release_at",
  "paid_at",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

export async function getAdminPlatformProductCatalog(
  client: SupabaseClient = createServiceClient(),
): Promise<PlatformProductCatalog> {
  await releaseDuePlatformProductCommissions(client);

  const [productsResult, importsResult, commissionsResult] = await Promise.all([
    client
      .from("platform_products")
      .select(PLATFORM_PRODUCT_SELECT)
      .order("updated_at", { ascending: false })
      .limit(150),
    client
      .from("platform_product_imports")
      .select(PLATFORM_PRODUCT_IMPORT_SELECT)
      .order("created_at", { ascending: false })
      .limit(300),
    client
      .from("platform_product_commissions")
      .select(PLATFORM_PRODUCT_COMMISSION_SELECT)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  if (productsResult.error) {
    return {
      schemaReady: false,
      settings: getDefaultPlatformProductSettings(),
      products: [],
      imports: [],
      commissions: [],
      warnings: [productsResult.error.message],
    };
  }

  const warnings = [
    ...(importsResult.error ? [importsResult.error.message] : []),
    ...(commissionsResult.error ? [commissionsResult.error.message] : []),
  ];
  const settings = await getPlatformProductSettings(client).catch((error) => {
    warnings.push(error instanceof Error ? error.message : "Nao foi possivel carregar a configuracao global de produtos.");
    return getDefaultPlatformProductSettings();
  });

  return {
    schemaReady: true,
    settings,
    products: ((productsResult.data ?? []) as unknown as PlatformProductRow[]).map(mapPlatformProductRow),
    imports: importsResult.error
      ? []
      : ((importsResult.data ?? []) as unknown as PlatformProductImportRow[]).map(mapPlatformProductImportRow),
    commissions: commissionsResult.error
      ? []
      : ((commissionsResult.data ?? []) as unknown as PlatformProductCommissionRow[]).map(mapPlatformProductCommissionRow),
    warnings,
  };
}

export async function getClientPlatformProductCatalog(input: {
  userId: string;
  companyIds: string[];
  client?: SupabaseClient;
}): Promise<PlatformProductCatalog> {
  const client = input.client ?? createServiceClient();
  await releaseDuePlatformProductCommissions(client);

  const productsResult = await client
    .from("platform_products")
    .select(PLATFORM_PRODUCT_SELECT)
    .eq("status", "active")
    .neq("sales_channel_type", "direct")
    .in("marketplace_status", ["visible", "featured"])
    .order("marketplace_status", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(150);

  if (productsResult.error) {
    return {
      schemaReady: false,
      settings: getDefaultPlatformProductSettings(),
      products: [],
      imports: [],
      commissions: [],
      warnings: [productsResult.error.message],
    };
  }

  const [importsResult, commissionsResult] = input.companyIds.length > 0
    ? await Promise.all([
        client
          .from("platform_product_imports")
          .select(PLATFORM_PRODUCT_IMPORT_SELECT)
          .in("organization_id", input.companyIds)
          .order("created_at", { ascending: false })
          .limit(300),
        client
          .from("platform_product_commissions")
          .select(PLATFORM_PRODUCT_COMMISSION_SELECT)
          .in("organization_id", input.companyIds)
          .order("created_at", { ascending: false })
          .limit(300),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const warnings = [
    ...(importsResult.error ? [importsResult.error.message] : []),
    ...(commissionsResult.error ? [commissionsResult.error.message] : []),
  ];

  return {
    schemaReady: true,
    settings: getDefaultPlatformProductSettings(),
    products: ((productsResult.data ?? []) as unknown as PlatformProductRow[]).map(mapPlatformProductRow),
    imports: importsResult.error
      ? []
      : ((importsResult.data ?? []) as unknown as PlatformProductImportRow[]).map(mapPlatformProductImportRow),
    commissions: commissionsResult.error
      ? []
      : ((commissionsResult.data ?? []) as unknown as PlatformProductCommissionRow[]).map(mapPlatformProductCommissionRow),
    warnings,
  };
}

export async function getPlatformProductSettings(
  client: SupabaseClient = createServiceClient(),
): Promise<PlatformProductSettings> {
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "platform")
    .is("organization_id", null)
    .eq("memory_type", "platform_product_settings")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<PlatformProductSettingsRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar a configuracao global de produtos: ${error.message}`);
  }

  return data ? mapPlatformProductSettingsRow(data) : getDefaultPlatformProductSettings();
}

export async function importPlatformProductToCompany(input: {
  userId: string;
  companyId: string;
  productId: string;
  client?: SupabaseClient;
}): Promise<PlatformProductImportResult> {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client,
  });

  const { data: productRow, error: productError } = await client
    .from("platform_products")
    .select(PLATFORM_PRODUCT_SELECT)
    .eq("id", input.productId)
    .eq("status", "active")
    .in("marketplace_status", ["visible", "featured"])
    .maybeSingle<PlatformProductRow>();

  if (productError) {
    throw new Error(`Nao foi possivel carregar o produto ConnectyHub: ${productError.message}`);
  }

  if (!productRow) {
    throw new Error("Produto ConnectyHub indisponivel para importacao.");
  }

  const product = mapPlatformProductRow(productRow);

  if (!isPlatformProductImportable(product)) {
    throw new Error("Este produto ConnectyHub esta configurado como venda direta e nao pode ser importado para revenda.");
  }

  const localCatalogItemId = await createOrUpdateImportedCatalogItem({
    client,
    companyId: company.id,
    userId: input.userId,
    product,
  });

  const { data: importRow, error: importError } = await client
    .from("platform_product_imports")
    .upsert(
      {
        platform_product_id: product.id,
        organization_id: company.id,
        imported_by: input.userId,
        local_catalog_item_id: localCatalogItemId,
        status: "active",
        sales_channel_type: normalizeImportSalesChannel(product.salesChannelType),
        revenue_owner_type: normalizeImportRevenueOwner(product.revenueOwnerType),
        commission_policy_type: normalizeImportCommissionPolicy(product.commissionPolicyType),
        local_title: product.name,
        commission_snapshot: {
          percentage: product.commissionPercentage,
          base: product.commissionBase,
          release_days: product.commissionReleaseDays,
          policy_type: product.commissionPolicyType,
        },
        metadata: {
          source: "connectyhub_marketplace",
          product_code: product.productCode,
          agent_tag: product.agentTag,
          owner_type: product.ownerType,
          sales_channel_type: product.salesChannelType,
          revenue_owner_type: product.revenueOwnerType,
          commission_policy_type: product.commissionPolicyType,
          payout_target_type: product.payoutTargetType,
          commercial_flow_type: resolvePlatformProductCommercialFlow(product),
          commission_eligible: isPlatformProductCommissionEligible(product),
          commission_percentage: product.commissionPercentage,
          commission_release_days: product.commissionReleaseDays,
        },
      },
      { onConflict: "platform_product_id,organization_id" },
    )
    .select(PLATFORM_PRODUCT_IMPORT_SELECT)
    .single<PlatformProductImportRow>();

  if (importError || !importRow) {
    throw new Error(importError?.message ?? "Nao foi possivel importar o produto ConnectyHub.");
  }

  await client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "platform_product_import",
    source_id: importRow.id,
    event_type: "platform_product.imported",
    title: `Produto ConnectyHub importado: ${product.name}`,
    summary: `Tag ${product.agentTag} liberada no Catalogo de Vendas desta empresa.`,
    confidence: 1,
    visibility: "organization",
    tags: ["platform_product", "connectyhub_marketplace", "sales_catalog", "whatsapp_agent"],
    payload: {
      product_id: product.id,
      catalog_item_id: localCatalogItemId,
      owner_type: product.ownerType,
      sales_channel_type: product.salesChannelType,
      commercial_flow_type: resolvePlatformProductCommercialFlow(product),
      revenue_owner_type: product.revenueOwnerType,
      commission_policy_type: product.commissionPolicyType,
      commission_eligible: isPlatformProductCommissionEligible(product),
      commission_percentage: product.commissionPercentage,
      commission_release_days: product.commissionReleaseDays,
      actor_id: input.userId,
    },
  });

  return {
    importRecord: mapPlatformProductImportRow(importRow),
    catalogItemId: localCatalogItemId,
    agentTag: product.agentTag,
  };
}

export function mapPlatformProductRow(row: PlatformProductRow): PlatformProduct {
  const name = row.name || "Produto ConnectyHub";
  const id = row.id;
  const media = readMediaList(row.media);
  const commercialDescription = readString(row.commercial_description) ?? "";

  return {
    id,
    productCode: row.product_code,
    slug: row.slug,
    name,
    shortDescription: readString(row.short_description),
    commercialDescription,
    category: readString(row.category),
    status: normalizeProductStatus(row.status),
    marketplaceStatus: normalizeMarketplaceStatus(row.marketplace_status),
    ownerType: normalizeOwnerType(row.owner_type),
    salesChannelType: normalizeSalesChannelType(row.sales_channel_type),
    revenueOwnerType: normalizeRevenueOwnerType(row.revenue_owner_type),
    commissionPolicyType: normalizeCommissionPolicyType(row.commission_policy_type),
    payoutTargetType: normalizePayoutTargetType(row.payout_target_type),
    price: readString(row.price),
    currency: readString(row.currency) ?? "BRL",
    attributes: readItemAttributes(row.attributes),
    inventory: readProductInventory(row.inventory),
    offer: readProductOffer(row.offer),
    fulfillment: readProductFulfillment(row.fulfillment),
    shipping: readProductShipping(row.shipping),
    skus: readSkus(row.skus, id),
    media,
    agentTag: readString(row.agent_tag) ?? createSalesCatalogTag(name, id),
    agentPrompt: readString(row.agent_prompt),
    salesNotes: readString(row.sales_notes),
    commissionPercentage: toNumber(row.commission_percentage),
    commissionBase: row.commission_base === "net" ? "net" : "gross",
    commissionReleaseDays: toInteger(row.commission_release_days, 15),
    recurringCommissionMonths: toInteger(row.recurring_commission_months, 0),
    refundWindowDays: toInteger(row.refund_window_days, 7),
    createdBy: readString(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPlatformProductImportRow(row: PlatformProductImportRow): PlatformProductImport {
  return {
    id: row.id,
    platformProductId: row.platform_product_id,
    organizationId: row.organization_id,
    importedBy: row.imported_by,
    localCatalogItemId: row.local_catalog_item_id,
    status: normalizeImportStatus(row.status),
    salesChannelType: normalizeImportSalesChannel(row.sales_channel_type),
    revenueOwnerType: normalizeImportRevenueOwner(row.revenue_owner_type),
    commissionPolicyType: normalizeImportCommissionPolicy(row.commission_policy_type),
    localTitle: row.local_title,
    localAgentNotes: row.local_agent_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPlatformProductCommissionRow(row: PlatformProductCommissionRow): PlatformProductCommission {
  return {
    id: row.id,
    platformProductId: row.platform_product_id,
    importId: row.import_id,
    organizationId: row.organization_id,
    orderId: row.order_id,
    orderItemId: row.order_item_id ?? null,
    paymentSessionId: row.payment_session_id,
    status: normalizeCommissionStatus(row.status),
    currency: row.currency ?? "BRL",
    saleAmount: toNumber(row.sale_amount),
    saleQuantity: toInteger(row.sale_quantity, 1),
    commissionPercentage: toNumber(row.commission_percentage),
    commissionAmount: toNumber(row.commission_amount),
    releaseAt: row.release_at,
    paidAt: row.paid_at,
    metadata: readRecord(row.metadata) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPlatformProductSettingsRow(row: PlatformProductSettingsRow): PlatformProductSettings {
  const metadata = readRecord(row.metadata) ?? {};
  const businessType = normalizeBusinessType(readString(metadata.business_type));
  const fallback = salesCatalogBusinessTemplates.find((template) => template.value === businessType)
    ?? salesCatalogBusinessTemplates[salesCatalogBusinessTemplates.length - 1];

  return {
    id: row.id,
    configured: readBoolean(metadata.configured) ?? false,
    businessType,
    categories: readStringList(metadata.categories, fallback.categories),
    attributes: readSettingsAttributes(metadata.attributes, fallback.attributes),
    trackInventory: readBoolean(metadata.track_inventory) ?? fallback.trackInventory,
    variationMedia: readBoolean(metadata.variation_media) ?? fallback.variationMedia,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getDefaultPlatformProductSettings(): PlatformProductSettings {
  const fallback = salesCatalogBusinessTemplates.find((template) => template.value === "fashion")
    ?? salesCatalogBusinessTemplates[0];

  return {
    id: null,
    configured: false,
    businessType: fallback.value,
    categories: [...fallback.categories],
    attributes: fallback.attributes.map((attribute) => ({ ...attribute, values: [...attribute.values] })),
    trackInventory: fallback.trackInventory,
    variationMedia: fallback.variationMedia,
    createdAt: null,
    updatedAt: null,
  };
}

export function createPlatformProductCode(name: string, id: string) {
  const base = createSalesCatalogSlug(name).replace(/_/g, "-").toUpperCase().slice(0, 36) || "PRODUTO";
  return `CH-${base}-${id.slice(0, 6).toUpperCase()}`;
}

export function createPlatformProductSlug(name: string, id: string) {
  return `${createSalesCatalogSlug(name).replace(/_/g, "-")}-${id.slice(0, 8)}`;
}

export function isPlatformProductImportable(product: PlatformProduct) {
  return product.ownerType === "connectyhub" && product.salesChannelType !== "direct";
}

export function isPlatformProductCommissionEligible(product: PlatformProduct) {
  return isPlatformProductImportable(product)
    && product.commissionPolicyType !== "none"
    && product.commissionPercentage > 0;
}

export function resolvePlatformProductCommercialFlow(product: PlatformProduct) {
  if (product.ownerType === "external_provider") return "external_marketplace";
  if (product.ownerType === "client") return "client_direct";
  return product.salesChannelType === "direct" ? "connectyhub_direct" : "connectyhub_resale";
}

async function createOrUpdateImportedCatalogItem(input: {
  client: SupabaseClient;
  companyId: string;
  userId: string;
  product: PlatformProduct;
}) {
  const now = new Date().toISOString();
  const itemId = randomUUID();
  const product = input.product;
  const tag = product.agentTag;
  const content = buildSalesCatalogContent({
    title: product.name,
    description: product.commercialDescription,
    category: product.category,
    price: product.price,
    currency: product.currency,
    media: product.media,
    attributes: product.attributes,
    inventory: product.inventory,
    offer: product.offer,
    fulfillment: product.fulfillment,
    shipping: product.shipping,
  });
  const metadata = {
    title: product.name,
    description: product.commercialDescription,
    category: product.category,
    price: product.price,
    currency: product.currency,
    status: "active",
    tag,
    attributes: serializeItemAttributes(product.attributes),
    inventory: serializeProductInventory(product.inventory),
    offer: serializeProductOffer(product.offer),
    fulfillment: serializeProductFulfillment(product.fulfillment),
    shipping: serializeProductShipping(product.shipping),
    media: serializeSalesCatalogMedia(product.media),
    skus: serializeSalesCatalogSkus(product.skus),
    source: "manual",
    platform_product_id: product.id,
    platform_product_code: product.productCode,
    product_origin_type: product.ownerType,
    sales_channel_type: product.salesChannelType,
    commercial_flow_type: resolvePlatformProductCommercialFlow(product),
    revenue_owner_type: product.revenueOwnerType,
    commission_policy_type: product.commissionPolicyType,
    commission_eligible: isPlatformProductCommissionEligible(product),
    payout_target_type: product.payoutTargetType,
    platform_product_commission_percentage: product.commissionPercentage,
    platform_product_commission_release_days: product.commissionReleaseDays,
    platform_product_agent_prompt: product.agentPrompt,
    updated_from: "platform_product_import",
    created_by: input.userId,
    updated_by: input.userId,
    readiness: getSalesCatalogReadiness({
      description: product.commercialDescription,
      media: product.media,
    }),
  };

  const { data: existingImport } = await input.client
    .from("platform_product_imports")
    .select("local_catalog_item_id")
    .eq("platform_product_id", product.id)
    .eq("organization_id", input.companyId)
    .maybeSingle<{ local_catalog_item_id: string | null }>();
  const existingCatalogItemId = existingImport?.local_catalog_item_id ?? null;
  const catalogItemId = existingCatalogItemId ?? itemId;
  const payload = {
    scope: "organization",
    organization_id: input.companyId,
    memory_type: "sales_catalog_item",
    title: product.name,
    content,
    importance: 0.84,
    tags: [
      "sales_catalog_item",
      "sales_catalog",
      "connectyhub_product",
      "connectyhub_marketplace",
      "whatsapp_agent",
      "lead_tracking",
    ],
    metadata,
    updated_at: now,
  };
  const query = existingCatalogItemId
    ? input.client
        .from("intelligence_memory")
        .update(payload)
        .eq("id", existingCatalogItemId)
        .eq("organization_id", input.companyId)
    : input.client
        .from("intelligence_memory")
        .insert({ id: catalogItemId, ...payload, created_at: now });
  const { data, error } = await query
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar o item importado no Catalogo de Vendas.");
  }

  await persistImportedSkus({
    client: input.client,
    companyId: input.companyId,
    itemId: data.id,
    product,
  });

  return data.id;
}

async function releaseDuePlatformProductCommissions(client: SupabaseClient) {
  await client
    .from("platform_product_commissions")
    .update({
      status: "available",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "pending")
    .not("release_at", "is", null)
    .lte("release_at", new Date().toISOString());
}

async function persistImportedSkus(input: {
  client: SupabaseClient;
  companyId: string;
  itemId: string;
  product: PlatformProduct;
}) {
  const now = new Date().toISOString();
  const sourceSkus = input.product.skus.length > 0
    ? input.product.skus
    : [{
        id: null,
        companyId: input.companyId,
        catalogItemId: input.itemId,
        skuCode: createSkuCode(input.product.name, input.itemId),
        title: input.product.name,
        attributes: input.product.attributes,
        price: input.product.price,
        salePrice: input.product.offer.salePrice,
        currency: input.product.currency,
        stockStatus: input.product.inventory.status,
        stockQuantity: input.product.inventory.quantity,
        lowStockThreshold: input.product.inventory.lowStockThreshold,
        weightGrams: input.product.shipping.weightGrams,
        dimensions: input.product.shipping.dimensions,
        mediaIds: [],
        status: "active" as SalesCatalogSkuStatus,
        createdAt: null,
        updatedAt: null,
      }];
  const payload = sourceSkus.map((sku) => ({
    id: randomUUID(),
    organization_id: input.companyId,
    catalog_item_id: input.itemId,
    sku_code: sku.skuCode,
    title: sku.title,
    attributes: serializeItemAttributes(sku.attributes),
    price: sku.price,
    sale_price: sku.salePrice,
    currency: sku.currency,
    stock_status: sku.stockStatus,
    stock_quantity: sku.stockQuantity,
    low_stock_threshold: sku.lowStockThreshold,
    weight_grams: sku.weightGrams,
    dimensions: {
      length_cm: sku.dimensions.lengthCm,
      width_cm: sku.dimensions.widthCm,
      height_cm: sku.dimensions.heightCm,
    },
    media_ids: sku.mediaIds,
    status: sku.status,
    metadata: {
      source: "connectyhub_marketplace",
      platform_product_id: input.product.id,
      platform_product_code: input.product.productCode,
      product_origin_type: input.product.ownerType,
      sales_channel_type: input.product.salesChannelType,
      commercial_flow_type: resolvePlatformProductCommercialFlow(input.product),
      revenue_owner_type: input.product.revenueOwnerType,
      commission_policy_type: input.product.commissionPolicyType,
      commission_eligible: isPlatformProductCommissionEligible(input.product),
      payout_target_type: input.product.payoutTargetType,
    },
    updated_at: now,
  }));

  await input.client
    .from("sales_catalog_skus")
    .delete()
    .eq("organization_id", input.companyId)
    .eq("catalog_item_id", input.itemId);

  if (payload.length > 0) {
    await input.client.from("sales_catalog_skus").insert(payload);
  }
}

function readItemAttributes(value: unknown): SalesCatalogItemAttribute[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogItemAttribute | null => {
      const record = readRecord(item);
      const id = readString(record?.id);
      const name = readString(record?.name);
      const values = readStringList(record?.values, []);

      if (!id || !name || values.length === 0) return null;
      return { id, name, values };
    })
    .filter((item): item is SalesCatalogItemAttribute => Boolean(item))
    .slice(0, 20);
}

function readSettingsAttributes(value: unknown, fallback: SalesCatalogAttribute[]): SalesCatalogAttribute[] {
  if (!Array.isArray(value)) {
    return fallback.map((attribute) => ({ ...attribute, values: [...attribute.values] }));
  }

  const attributes: SalesCatalogAttribute[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const record = readRecord(item);
    const name = readString(record?.name);
    if (!name) continue;

    const id = readString(record?.id) ?? createAttributeId(name);
    const key = id.toLowerCase();
    const values = readStringList(record?.values, []);
    if (seen.has(key) || values.length === 0) continue;

    seen.add(key);
    attributes.push({
      id,
      name: name.slice(0, 50),
      values: values.slice(0, 40),
      required: readBoolean(record?.required) ?? false,
    });

    if (attributes.length >= 12) break;
  }

  return attributes.length > 0
    ? attributes
    : fallback.map((attribute) => ({ ...attribute, values: [...attribute.values] }));
}

function readMediaList(value: unknown): SalesCatalogMedia[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogMedia | null => {
      const record = readRecord(item);
      const id = readString(record?.id);
      const fileName = readString(record?.file_name ?? record?.fileName);
      const contentType = readString(record?.content_type ?? record?.contentType);
      const size = readNumber(record?.size);
      const storageUrl = readString(record?.storage_url ?? record?.storageUrl);
      const kind = readString(record?.kind);

      if (!id || !fileName || !contentType || !storageUrl) return null;

      return {
        id,
        fileName,
        contentType,
        size: size ?? 0,
        storageUrl,
        kind: kind === "video" || kind === "document" ? kind : "image",
        createdAt: readString(record?.created_at ?? record?.createdAt),
      };
    })
    .filter((item): item is SalesCatalogMedia => Boolean(item))
    .slice(0, 12);
}

function readSkus(value: unknown, productId: string): SalesCatalogSku[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogSku | null => {
      const record = readRecord(item);
      const skuCode = readString(record?.sku_code ?? record?.skuCode);
      if (!skuCode) return null;
      const dimensions = readRecord(record?.dimensions) ?? {};

      return {
        id: readString(record?.id),
        companyId: "",
        catalogItemId: productId,
        skuCode,
        title: readString(record?.title),
        attributes: readItemAttributes(record?.attributes),
        price: readString(record?.price),
        salePrice: readString(record?.sale_price ?? record?.salePrice),
        currency: readString(record?.currency) ?? "BRL",
        stockStatus: normalizeStockStatus(readString(record?.stock_status ?? record?.stockStatus)),
        stockQuantity: readNumber(record?.stock_quantity ?? record?.stockQuantity),
        lowStockThreshold: readNumber(record?.low_stock_threshold ?? record?.lowStockThreshold),
        weightGrams: readNumber(record?.weight_grams ?? record?.weightGrams),
        dimensions: {
          lengthCm: readNumber(dimensions.length_cm ?? dimensions.lengthCm),
          widthCm: readNumber(dimensions.width_cm ?? dimensions.widthCm),
          heightCm: readNumber(dimensions.height_cm ?? dimensions.heightCm),
        },
        mediaIds: readStringList(record?.media_ids ?? record?.mediaIds, []),
        status: normalizeSkuStatus(readString(record?.status)),
        createdAt: readString(record?.created_at ?? record?.createdAt),
        updatedAt: readString(record?.updated_at ?? record?.updatedAt),
      };
    })
    .filter((item): item is SalesCatalogSku => Boolean(item))
    .slice(0, 80);
}

function readProductInventory(value: unknown): SalesCatalogProductInventory {
  const record = readRecord(value);
  const fallback = emptySalesCatalogProductInventory();

  return {
    status: normalizeStockStatus(readString(record?.status)),
    quantity: readNumber(record?.quantity),
    lowStockThreshold: readNumber(record?.low_stock_threshold ?? record?.lowStockThreshold),
    allowBackorder: readBoolean(record?.allow_backorder ?? record?.allowBackorder) ?? fallback.allowBackorder,
    notes: readString(record?.notes),
  };
}

function readProductOffer(value: unknown): SalesCatalogProductOffer {
  const record = readRecord(value);
  const fallback = emptySalesCatalogProductOffer();

  return {
    salePrice: readString(record?.sale_price ?? record?.salePrice) ?? fallback.salePrice,
    saleStartsAt: readString(record?.sale_starts_at ?? record?.saleStartsAt) ?? fallback.saleStartsAt,
    saleEndsAt: readString(record?.sale_ends_at ?? record?.saleEndsAt) ?? fallback.saleEndsAt,
    couponCode: readString(record?.coupon_code ?? record?.couponCode) ?? fallback.couponCode,
    couponDescription: readString(record?.coupon_description ?? record?.couponDescription) ?? fallback.couponDescription,
    callToAction: readString(record?.call_to_action ?? record?.callToAction) ?? fallback.callToAction,
    notes: readString(record?.notes) ?? fallback.notes,
  };
}

function readProductFulfillment(value: unknown): SalesCatalogProductFulfillment {
  const record = readRecord(value);
  const fallback = emptySalesCatalogProductFulfillment();
  const mode = readString(record?.mode);

  return {
    mode: mode === "digital" || mode === "service" || mode === "subscription" ? mode : fallback.mode,
    schedulingRequired: readBoolean(record?.scheduling_required ?? record?.schedulingRequired) ?? fallback.schedulingRequired,
    serviceDuration: readString(record?.service_duration ?? record?.serviceDuration),
    deliveryInstructions: readString(record?.delivery_instructions ?? record?.deliveryInstructions),
    accessInstructions: readString(record?.access_instructions ?? record?.accessInstructions),
  };
}

function readProductShipping(value: unknown): SalesCatalogProductShipping {
  const record = readRecord(value);
  const dimensions = readRecord(record?.dimensions) ?? {};
  const profile = readString(record?.profile);

  return {
    weightGrams: readNumber(record?.weight_grams ?? record?.weightGrams),
    dimensions: {
      lengthCm: readNumber(dimensions.length_cm ?? dimensions.lengthCm),
      widthCm: readNumber(dimensions.width_cm ?? dimensions.widthCm),
      heightCm: readNumber(dimensions.height_cm ?? dimensions.heightCm),
    },
    profile: profile === "free" || profile === "custom" ? profile : "default",
    notes: readString(record?.notes),
  };
}

function serializeItemAttributes(attributes: SalesCatalogItemAttribute[]) {
  return attributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    values: attribute.values,
  }));
}

function serializeSalesCatalogMedia(media: SalesCatalogMedia[]) {
  return media.map((item) => ({
    id: item.id,
    file_name: item.fileName,
    content_type: item.contentType,
    size: item.size,
    storage_url: item.storageUrl,
    kind: item.kind,
    created_at: item.createdAt,
  }));
}

function serializeSalesCatalogSkus(skus: SalesCatalogSku[]) {
  return skus.map((sku) => ({
    id: sku.id,
    sku_code: sku.skuCode,
    title: sku.title,
    attributes: serializeItemAttributes(sku.attributes),
    price: sku.price,
    sale_price: sku.salePrice,
    currency: sku.currency,
    stock_status: sku.stockStatus,
    stock_quantity: sku.stockQuantity,
    low_stock_threshold: sku.lowStockThreshold,
    weight_grams: sku.weightGrams,
    dimensions: {
      length_cm: sku.dimensions.lengthCm,
      width_cm: sku.dimensions.widthCm,
      height_cm: sku.dimensions.heightCm,
    },
    media_ids: sku.mediaIds,
    status: sku.status,
  }));
}

function serializeProductShipping(shipping: SalesCatalogProductShipping) {
  return {
    weight_grams: shipping.weightGrams,
    dimensions: {
      length_cm: shipping.dimensions.lengthCm,
      width_cm: shipping.dimensions.widthCm,
      height_cm: shipping.dimensions.heightCm,
    },
    profile: shipping.profile,
    notes: shipping.notes,
  };
}

function serializeProductInventory(inventory: SalesCatalogProductInventory) {
  return {
    status: inventory.status,
    quantity: inventory.quantity,
    low_stock_threshold: inventory.lowStockThreshold,
    allow_backorder: inventory.allowBackorder,
    notes: inventory.notes,
  };
}

function serializeProductOffer(offer: SalesCatalogProductOffer) {
  return {
    sale_price: offer.salePrice,
    sale_starts_at: offer.saleStartsAt,
    sale_ends_at: offer.saleEndsAt,
    coupon_code: offer.couponCode,
    coupon_description: offer.couponDescription,
    call_to_action: offer.callToAction,
    notes: offer.notes,
  };
}

function serializeProductFulfillment(fulfillment: SalesCatalogProductFulfillment) {
  return {
    mode: fulfillment.mode,
    scheduling_required: fulfillment.schedulingRequired,
    service_duration: fulfillment.serviceDuration,
    delivery_instructions: fulfillment.deliveryInstructions,
    access_instructions: fulfillment.accessInstructions,
  };
}

function createSkuCode(title: string, id: string) {
  return `${createSalesCatalogSlug(title).toUpperCase().replace(/_/g, "-") || "SKU"}-${id.slice(0, 6).toUpperCase()}`.slice(0, 64);
}

function normalizeProductStatus(value: string | null): PlatformProductStatus {
  if (value === "active" || value === "paused" || value === "archived") return value;
  return "draft";
}

function normalizeMarketplaceStatus(value: string | null): PlatformProductMarketplaceStatus {
  if (value === "visible" || value === "featured") return value;
  return "hidden";
}

function normalizeOwnerType(value: string | null | undefined): PlatformProductOwnerType {
  if (value === "client" || value === "external_provider") return value;
  return "connectyhub";
}

function normalizeSalesChannelType(value: string | null | undefined): PlatformProductSalesChannelType {
  if (value === "direct" || value === "affiliate" || value === "marketplace") return value;
  return "resale";
}

function normalizeRevenueOwnerType(value: string | null | undefined): PlatformProductRevenueOwnerType {
  if (value === "client" || value === "split" || value === "external_provider") return value;
  return "connectyhub";
}

function normalizeCommissionPolicyType(value: string | null | undefined): PlatformProductCommissionPolicyType {
  if (value === "none" || value === "fixed" || value === "custom") return value;
  return "percentage";
}

function normalizePayoutTargetType(value: string | null | undefined): PlatformProductPayoutTargetType {
  if (value === "client" || value === "split" || value === "external_provider") return value;
  return "connectyhub";
}

function normalizeImportSalesChannel(value: string | null | undefined): Exclude<PlatformProductSalesChannelType, "direct"> {
  if (value === "affiliate" || value === "marketplace") return value;
  return "resale";
}

function normalizeImportRevenueOwner(value: string | null | undefined): Exclude<PlatformProductRevenueOwnerType, "client"> {
  if (value === "split" || value === "external_provider") return value;
  return "connectyhub";
}

function normalizeImportCommissionPolicy(value: string | null | undefined): Exclude<PlatformProductCommissionPolicyType, "none"> {
  if (value === "fixed" || value === "custom") return value;
  return "percentage";
}

function normalizeImportStatus(value: string | null): PlatformProductImportStatus {
  if (value === "paused" || value === "removed") return value;
  return "active";
}

function normalizeCommissionStatus(value: string | null): PlatformProductCommissionStatus {
  if (
    value === "available"
    || value === "paid"
    || value === "cancelled"
    || value === "blocked"
    || value === "refunded"
  ) {
    return value;
  }

  return "pending";
}

function normalizeStockStatus(value: string | null): SalesCatalogStockStatus {
  if (value === "out_of_stock" || value === "on_backorder") return value;
  return "in_stock";
}

function normalizeSkuStatus(value: string | null): SalesCatalogSkuStatus {
  if (value === "draft" || value === "archived") return value;
  return "active";
}

function normalizeBusinessType(value: string | null): SalesCatalogBusinessType {
  if (value === "fashion" || value === "physical" || value === "services" || value === "digital" || value === "food") {
    return value;
  }

  return "simple";
}

function createAttributeId(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "atributo";
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: unknown) {
  return readNumber(value) ?? 0;
}

function toInteger(value: unknown, fallback: number) {
  const number = readNumber(value);
  return number === null ? fallback : Math.trunc(number);
}
