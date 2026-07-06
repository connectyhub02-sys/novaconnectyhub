import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientCompanyAccess, listClientCompanies } from "@/lib/client-os/companies";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createDefaultSalesCatalogShippingServices,
  createDefaultSalesCatalogCommerceSettings,
  defaultSalesCatalogShippingRules,
  emptySalesCatalogProductFulfillment,
  emptySalesCatalogProductInventory,
  emptySalesCatalogProductOffer,
  emptySalesCatalogProductShipping,
  createSalesCatalogTag,
  getSalesCatalogReadiness,
  resolveSalesCatalogMediaKind,
  salesCatalogLeadDataFields,
  salesCatalogPaymentMethodTemplates,
  salesCatalogBusinessTemplates,
  type ClientSalesCatalogSettings,
  type ClientSalesCatalogItem,
  type ClientSalesCatalogOrder,
  type ClientSalesCatalogShippingSettings,
  type SalesCatalogAttribute,
  type SalesCatalogBusinessType,
  type SalesCatalogFulfillmentStatus,
  type SalesCatalogItemAttribute,
  type SalesCatalogItemStatus,
  type SalesCatalogLeadDataField,
  type SalesCatalogPaymentMethod,
  type SalesCatalogPaymentMethodId,
  type SalesCatalogPaymentStatus,
  type SalesCatalogReservationPolicy,
  type SalesCatalogMedia,
  type SalesCatalogFulfillmentMode,
  type SalesCatalogOrderStatus,
  type SalesCatalogProductFulfillment,
  type SalesCatalogProductShipping,
  type SalesCatalogProductInventory,
  type SalesCatalogProductOffer,
  type SalesCatalogShippingProvider,
  type SalesCatalogShippingProfile,
  type SalesCatalogShippingRule,
  type SalesCatalogShippingService,
  type SalesCatalogShippingWeightTier,
  type SalesCatalogStockStatus,
  type SalesCatalogWhatsAppMessageTemplates,
  type SalesCatalogSource,
} from "@/lib/sales-catalog/shared";

type JsonRecord = Record<string, unknown>;

type SalesCatalogMemoryRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SalesCatalogOrderRow = {
  id: string;
  organization_id: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  source: string | null;
  status: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_document: string | null;
  customer_email: string | null;
  destination_cep: string | null;
  destination_address: string | null;
  subtotal: string | null;
  discount_total: string | null;
  shipping_total: string | null;
  total: string | null;
  payment_method: string | null;
  shipping_method: string | null;
  agent_notes: string | null;
  internal_notes: string | null;
  metadata: JsonRecord | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SalesCatalogOrderItemRow = {
  id: string;
  order_id: string;
  organization_id: string | null;
  catalog_item_id: string | null;
  title: string;
  tag: string | null;
  quantity: number | null;
  unit_price: string | null;
  sale_price: string | null;
  total: string | null;
  attributes: unknown;
  fulfillment: unknown;
  metadata: JsonRecord | null;
  created_at: string | null;
};

export async function listClientSalesCatalog(input: {
  userId: string;
  companyId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const companyIds = input.companyId
    ? [(await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client })).id]
    : (await listClientCompanies(input.userId, client)).map((company) => company.id);

  if (companyIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_item")
    .in("organization_id", companyIds)
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    throw new Error(`Nao foi possivel carregar o catalogo de vendas: ${error.message}`);
  }

  return ((data ?? []) as SalesCatalogMemoryRow[]).map(mapSalesCatalogItem);
}

export async function listClientSalesCatalogSettings(input: {
  userId: string;
  companyId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const companyIds = input.companyId
    ? [(await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client })).id]
    : (await listClientCompanies(input.userId, client)).map((company) => company.id);

  if (companyIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_settings")
    .in("organization_id", companyIds)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(`Nao foi possivel carregar a configuracao do catalogo: ${error.message}`);
  }

  const latestByCompany = new Map<string, ClientSalesCatalogSettings>();

  for (const row of (data ?? []) as SalesCatalogMemoryRow[]) {
    const settings = mapSalesCatalogSettings(row);
    if (settings.companyId && !latestByCompany.has(settings.companyId)) {
      latestByCompany.set(settings.companyId, settings);
    }
  }

  return Array.from(latestByCompany.values());
}

export async function listClientSalesCatalogShippingSettings(input: {
  userId: string;
  companyId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const companyIds = input.companyId
    ? [(await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client })).id]
    : (await listClientCompanies(input.userId, client)).map((company) => company.id);

  if (companyIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_shipping_settings")
    .in("organization_id", companyIds)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(`Nao foi possivel carregar o frete do catalogo: ${error.message}`);
  }

  const latestByCompany = new Map<string, ClientSalesCatalogShippingSettings>();

  for (const row of (data ?? []) as SalesCatalogMemoryRow[]) {
    const settings = mapSalesCatalogShippingSettings(row);
    if (settings.companyId && !latestByCompany.has(settings.companyId)) {
      latestByCompany.set(settings.companyId, settings);
    }
  }

  return Array.from(latestByCompany.values());
}

export async function listClientSalesCatalogOrders(input: {
  userId: string;
  companyId?: string | null;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const companyIds = input.companyId
    ? [(await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client })).id]
    : (await listClientCompanies(input.userId, client)).map((company) => company.id);

  if (companyIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("sales_catalog_orders")
    .select([
      "id",
      "organization_id",
      "lead_id",
      "conversation_id",
      "source",
      "status",
      "payment_status",
      "fulfillment_status",
      "customer_name",
      "customer_phone",
      "customer_document",
      "customer_email",
      "destination_cep",
      "destination_address",
      "subtotal",
      "discount_total",
      "shipping_total",
      "total",
      "payment_method",
      "shipping_method",
      "agent_notes",
      "internal_notes",
      "metadata",
      "created_by",
      "created_at",
      "updated_at",
    ].join(", "))
    .in("organization_id", companyIds)
    .order("updated_at", { ascending: false })
    .limit(120);

  if (error) {
    throw new Error(`Nao foi possivel carregar os pedidos do catalogo: ${error.message}`);
  }

  const orderRows = (data ?? []) as unknown as SalesCatalogOrderRow[];
  const orderIds = orderRows.map((order) => order.id);

  if (orderIds.length === 0) {
    return [];
  }

  const { data: itemData, error: itemError } = await client
    .from("sales_catalog_order_items")
    .select("id, order_id, organization_id, catalog_item_id, title, tag, quantity, unit_price, sale_price, total, attributes, fulfillment, metadata, created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (itemError) {
    throw new Error(`Nao foi possivel carregar os itens dos pedidos: ${itemError.message}`);
  }

  const itemsByOrder = new Map<string, SalesCatalogOrderItemRow[]>();
  for (const item of (itemData ?? []) as unknown as SalesCatalogOrderItemRow[]) {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
  }

  return orderRows.map((order) => mapSalesCatalogOrder(order, itemsByOrder.get(order.id) ?? []));
}

export async function listOrganizationSalesCatalog(
  client: SupabaseClient,
  organizationId: string,
  limit = 80,
) {
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_item")
    .neq("metadata->>status", "archived")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Nao foi possivel carregar o catalogo de vendas: ${error.message}`);
  }

  return ((data ?? []) as SalesCatalogMemoryRow[]).map(mapSalesCatalogItem);
}

export async function getOrganizationSalesCatalogSettings(
  client: SupabaseClient,
  organizationId: string,
) {
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_settings")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<SalesCatalogMemoryRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar a configuracao do catalogo de vendas: ${error.message}`);
  }

  return data ? mapSalesCatalogSettings(data) : null;
}

export async function getOrganizationSalesCatalogShippingSettings(
  client: SupabaseClient,
  organizationId: string,
) {
  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_shipping_settings")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<SalesCatalogMemoryRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o frete do catalogo de vendas: ${error.message}`);
  }

  return data ? mapSalesCatalogShippingSettings(data) : null;
}

export function mapSalesCatalogItem(row: SalesCatalogMemoryRow): ClientSalesCatalogItem {
  const metadata = readRecord(row.metadata) ?? {};
  const media = readMediaList(metadata.media);
  const description = readString(metadata.description) ?? previewContent(row.content);
  const status = normalizeStatus(readString(metadata.status));
  const currency = readString(metadata.currency) ?? "BRL";

  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    title: readString(metadata.title) ?? row.title,
    description,
    category: readString(metadata.category),
    price: readString(metadata.price),
    currency,
    status,
    tag: readString(metadata.tag) ?? createSalesCatalogTag(row.title, row.id),
    media,
    attributes: readItemAttributes(metadata.attributes),
    inventory: readProductInventory(metadata.inventory),
    offer: readProductOffer(metadata.offer),
    fulfillment: readProductFulfillment(metadata.fulfillment),
    shipping: readProductShipping(metadata.shipping),
    source: normalizeSource(readString(metadata.source)),
    whatsappCatalogId: readString(metadata.whatsapp_catalog_id),
    whatsappCatalogJid: readString(metadata.whatsapp_catalog_jid),
    whatsappCatalogHidden: readBoolean(metadata.whatsapp_catalog_hidden),
    whatsappCatalogStatus: readString(metadata.whatsapp_catalog_status),
    whatsappCatalogSyncedAt: readString(metadata.whatsapp_catalog_synced_at),
    readiness: getSalesCatalogReadiness({ description, media }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogShippingSettings(row: SalesCatalogMemoryRow): ClientSalesCatalogShippingSettings {
  const metadata = readRecord(row.metadata) ?? {};

  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    configured: readBoolean(metadata.configured),
    localPickup: readBoolean(metadata.local_pickup),
    originCep: readString(metadata.origin_cep),
    defaultHandlingDays: readNumber(metadata.default_handling_days),
    rules: readShippingRules(metadata.rules),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogSettings(row: SalesCatalogMemoryRow): ClientSalesCatalogSettings {
  const metadata = readRecord(row.metadata) ?? {};
  const businessType = normalizeBusinessType(readString(metadata.business_type));
  const fallback = salesCatalogBusinessTemplates.find((template) => template.value === businessType)
    ?? salesCatalogBusinessTemplates[salesCatalogBusinessTemplates.length - 1];
  const commerceDefaults = createDefaultSalesCatalogCommerceSettings();

  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    configured: readBoolean(metadata.configured),
    businessType,
    categories: readStringList(metadata.categories, fallback.categories),
    attributes: readAttributeList(metadata.attributes, fallback.attributes),
    trackInventory: readNullableBoolean(metadata.track_inventory) ?? fallback.trackInventory,
    variationMedia: readNullableBoolean(metadata.variation_media) ?? fallback.variationMedia,
    paymentMethods: readPaymentMethods(metadata.payment_methods, commerceDefaults.paymentMethods),
    orderPolicy: readOrderPolicy(metadata.order_policy, commerceDefaults.orderPolicy),
    leadDataPolicy: readLeadDataPolicy(metadata.lead_data_policy, commerceDefaults.leadDataPolicy),
    messageTemplates: readMessageTemplates(metadata.message_templates, commerceDefaults.messageTemplates),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogOrder(
  row: SalesCatalogOrderRow,
  items: SalesCatalogOrderItemRow[] = [],
): ClientSalesCatalogOrder {
  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    leadId: readString(row.lead_id),
    conversationId: readString(row.conversation_id),
    source: readString(row.source) ?? "dashboard",
    status: normalizeOrderStatus(readString(row.status)),
    paymentStatus: normalizePaymentStatus(readString(row.payment_status)),
    fulfillmentStatus: normalizeFulfillmentStatus(readString(row.fulfillment_status)),
    customerName: readString(row.customer_name),
    customerPhone: readString(row.customer_phone),
    customerDocument: readString(row.customer_document),
    customerEmail: readString(row.customer_email),
    destinationCep: readString(row.destination_cep),
    destinationAddress: readString(row.destination_address),
    subtotal: readString(row.subtotal),
    discountTotal: readString(row.discount_total),
    shippingTotal: readString(row.shipping_total),
    total: readString(row.total),
    paymentMethod: readString(row.payment_method),
    shippingMethod: readString(row.shipping_method),
    agentNotes: readString(row.agent_notes),
    internalNotes: readString(row.internal_notes),
    items: items.map(mapSalesCatalogOrderItem),
    createdBy: readString(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogOrderItem(row: SalesCatalogOrderItemRow): ClientSalesCatalogOrder["items"][number] {
  return {
    id: row.id,
    orderId: row.order_id,
    companyId: readString(row.organization_id) ?? "",
    catalogItemId: readString(row.catalog_item_id),
    title: readString(row.title) ?? "Item do catalogo",
    tag: readString(row.tag),
    quantity: readNumber(row.quantity) ?? 1,
    unitPrice: readString(row.unit_price),
    salePrice: readString(row.sale_price),
    total: readString(row.total),
    attributes: readItemAttributes(row.attributes),
    fulfillment: readProductFulfillment(row.fulfillment),
    createdAt: row.created_at,
  };
}

function readMediaList(value: unknown): SalesCatalogMedia[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogMedia | null => {
      const record = readRecord(item);
      if (!record) return null;

      const storageUrl = readString(record.storage_url);
      const fileName = readString(record.file_name);
      const contentType = readString(record.content_type) ?? "application/octet-stream";
      const size = readNumber(record.size) ?? 0;

      if (!storageUrl || !fileName) return null;

      return {
        id: readString(record.id) ?? fileName,
        fileName,
        contentType,
        size,
        storageUrl,
        kind: normalizeKind(readString(record.kind), contentType, fileName),
        createdAt: readString(record.created_at),
      };
    })
    .filter((item): item is SalesCatalogMedia => Boolean(item));
}

function readProductShipping(value: unknown): SalesCatalogProductShipping {
  const fallback = emptySalesCatalogProductShipping();
  const record = readRecord(value);

  if (!record) return fallback;

  const dimensions = readRecord(record.dimensions) ?? {};

  return {
    weightGrams: readNumber(record.weight_grams) ?? readNumber(record.weightGrams),
    dimensions: {
      lengthCm: readNumber(dimensions.length_cm) ?? readNumber(dimensions.lengthCm),
      widthCm: readNumber(dimensions.width_cm) ?? readNumber(dimensions.widthCm),
      heightCm: readNumber(dimensions.height_cm) ?? readNumber(dimensions.heightCm),
    },
    profile: normalizeShippingProfile(readString(record.profile)),
    notes: readString(record.notes),
  };
}

function readProductInventory(value: unknown): SalesCatalogProductInventory {
  const fallback = emptySalesCatalogProductInventory();
  const record = readRecord(value);

  if (!record) return fallback;

  return {
    status: normalizeStockStatus(readString(record.status)),
    quantity: readNumber(record.quantity),
    lowStockThreshold: readNumber(record.low_stock_threshold) ?? readNumber(record.lowStockThreshold),
    allowBackorder: readNullableBoolean(record.allow_backorder) ?? readNullableBoolean(record.allowBackorder) ?? fallback.allowBackorder,
    notes: readString(record.notes),
  };
}

function readProductOffer(value: unknown): SalesCatalogProductOffer {
  const record = readRecord(value);

  if (!record) return emptySalesCatalogProductOffer();

  return {
    salePrice: readString(record.sale_price) ?? readString(record.salePrice),
    saleStartsAt: readString(record.sale_starts_at) ?? readString(record.saleStartsAt),
    saleEndsAt: readString(record.sale_ends_at) ?? readString(record.saleEndsAt),
    couponCode: readString(record.coupon_code) ?? readString(record.couponCode),
    couponDescription: readString(record.coupon_description) ?? readString(record.couponDescription),
    callToAction: readString(record.call_to_action) ?? readString(record.callToAction),
    notes: readString(record.notes),
  };
}

function readProductFulfillment(value: unknown): SalesCatalogProductFulfillment {
  const fallback = emptySalesCatalogProductFulfillment();
  const record = readRecord(value);

  if (!record) return fallback;

  return {
    mode: normalizeFulfillmentMode(readString(record.mode)),
    schedulingRequired: readNullableBoolean(record.scheduling_required) ?? readNullableBoolean(record.schedulingRequired) ?? fallback.schedulingRequired,
    serviceDuration: readString(record.service_duration) ?? readString(record.serviceDuration),
    deliveryInstructions: readString(record.delivery_instructions) ?? readString(record.deliveryInstructions),
    accessInstructions: readString(record.access_instructions) ?? readString(record.accessInstructions),
  };
}

function readShippingRules(value: unknown): SalesCatalogShippingRule[] {
  const rulesByUf = new Map(defaultSalesCatalogShippingRules.map((rule) => [rule.uf, cloneShippingRule(rule)]));

  if (!Array.isArray(value)) {
    return defaultSalesCatalogShippingRules.map(cloneShippingRule);
  }

  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;

    const uf = normalizeUf(readString(record.uf));
    if (!uf || !rulesByUf.has(uf)) continue;

    const fallback = rulesByUf.get(uf)!;
    rulesByUf.set(uf, {
      uf,
      state: readString(record.state) ?? fallback.state,
      active: readNullableBoolean(record.active) ?? fallback.active,
      cepStart: readString(record.cep_start) ?? readString(record.cepStart) ?? fallback.cepStart,
      cepEnd: readString(record.cep_end) ?? readString(record.cepEnd) ?? fallback.cepEnd,
      price: readString(record.price),
      minDays: readNumber(record.min_days) ?? readNumber(record.minDays),
      maxDays: readNumber(record.max_days) ?? readNumber(record.maxDays),
      freeShippingThreshold: readString(record.free_shipping_threshold) ?? readString(record.freeShippingThreshold),
      services: readShippingServices(record.services, fallback.services),
      notes: readString(record.notes),
    });
  }

  return defaultSalesCatalogShippingRules.map((rule) => rulesByUf.get(rule.uf) ?? cloneShippingRule(rule));
}

function cloneShippingRule(rule: SalesCatalogShippingRule): SalesCatalogShippingRule {
  return {
    ...rule,
    services: rule.services.map((service) => ({
      ...service,
      tiers: service.tiers.map((tier) => ({ ...tier })),
    })),
  };
}

function readShippingServices(value: unknown, fallback: SalesCatalogShippingService[]): SalesCatalogShippingService[] {
  const fallbackById = new Map((fallback.length > 0 ? fallback : createDefaultSalesCatalogShippingServices()).map((service) => [service.id, service]));

  if (!Array.isArray(value)) {
    return Array.from(fallbackById.values()).map(cloneShippingService);
  }

  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;

    const id = readString(record.id);
    if (!id) continue;

    const fallbackService = fallbackById.get(id);
    fallbackById.set(id, {
      id,
      provider: normalizeShippingProvider(readString(record.provider), fallbackService?.provider),
      name: readString(record.name) ?? fallbackService?.name ?? id,
      active: readNullableBoolean(record.active) ?? fallbackService?.active ?? false,
      tiers: readWeightTiers(record.tiers, fallbackService?.tiers ?? []),
    });
  }

  return Array.from(fallbackById.values()).map(cloneShippingService);
}

function readWeightTiers(value: unknown, fallback: SalesCatalogShippingWeightTier[]): SalesCatalogShippingWeightTier[] {
  if (!Array.isArray(value)) {
    return fallback.map((tier) => ({ ...tier }));
  }

  const tiers = value
    .map((item): SalesCatalogShippingWeightTier | null => {
      const record = readRecord(item);
      if (!record) return null;

      const id = readString(record.id);
      const maxWeightGrams = readNumber(record.max_weight_grams) ?? readNumber(record.maxWeightGrams);

      if (!id && maxWeightGrams === null) return null;

      return {
        id: id ?? `tier_${maxWeightGrams}`,
        name: readString(record.name) ?? (maxWeightGrams ? `Ate ${maxWeightGrams} g` : "Faixa"),
        active: readNullableBoolean(record.active) ?? true,
        maxWeightGrams,
        price: readString(record.price),
        minDays: readNumber(record.min_days) ?? readNumber(record.minDays),
        maxDays: readNumber(record.max_days) ?? readNumber(record.maxDays),
      };
    })
    .filter((item): item is SalesCatalogShippingWeightTier => Boolean(item));

  return tiers.length > 0 ? tiers : fallback.map((tier) => ({ ...tier }));
}

function cloneShippingService(service: SalesCatalogShippingService): SalesCatalogShippingService {
  return {
    ...service,
    tiers: service.tiers.map((tier) => ({ ...tier })),
  };
}

function normalizeShippingProvider(value: string | null, fallback?: SalesCatalogShippingProvider): SalesCatalogShippingProvider {
  if (value === "carrier") return "carrier";
  if (value === "correios") return "correios";
  return fallback ?? "carrier";
}

function normalizeKind(value: string | null, contentType: string, fileName: string) {
  if (value === "image" || value === "video" || value === "document") {
    return value;
  }

  return resolveSalesCatalogMediaKind(contentType, fileName);
}

function normalizeStatus(value: string | null): SalesCatalogItemStatus {
  if (value === "draft" || value === "archived") return value;
  return "active";
}

function normalizeBusinessType(value: string | null): SalesCatalogBusinessType {
  if (value === "fashion" || value === "physical" || value === "services" || value === "digital" || value === "food") {
    return value;
  }

  return "simple";
}

function normalizeSource(value: string | null): SalesCatalogSource {
  if (value === "whatsapp_catalog") return "whatsapp_catalog";
  return "manual";
}

function normalizeShippingProfile(value: string | null): SalesCatalogShippingProfile {
  if (value === "free" || value === "custom") return value;
  return "default";
}

function normalizeStockStatus(value: string | null): SalesCatalogStockStatus {
  if (value === "out_of_stock" || value === "on_backorder") return value;
  return "in_stock";
}

function normalizeFulfillmentMode(value: string | null): SalesCatalogFulfillmentMode {
  if (value === "digital" || value === "service" || value === "subscription") return value;
  return "physical";
}

function normalizeOrderStatus(value: string | null): SalesCatalogOrderStatus {
  if (
    value === "pending_payment"
    || value === "paid"
    || value === "in_preparation"
    || value === "shipped"
    || value === "delivered"
    || value === "cancelled"
    || value === "needs_human"
  ) {
    return value;
  }

  return "draft";
}

function normalizePaymentStatus(value: string | null): SalesCatalogPaymentStatus {
  if (value === "proof_sent" || value === "confirmed" || value === "failed" || value === "refunded") {
    return value;
  }

  return "pending";
}

function normalizeFulfillmentStatus(value: string | null): SalesCatalogFulfillmentStatus {
  if (value === "scheduled" || value === "in_progress" || value === "fulfilled" || value === "cancelled") {
    return value;
  }

  return "pending";
}

function normalizePaymentMethodId(value: string | null): SalesCatalogPaymentMethodId | null {
  if (value === "pix" || value === "card_link" || value === "boleto" || value === "cash_on_delivery" || value === "manual") {
    return value;
  }

  return null;
}

function normalizeReservationPolicy(value: string | null): SalesCatalogReservationPolicy {
  if (value === "before_payment" || value === "manual_approval") return value;
  return "after_payment";
}

function normalizeLeadDataField(value: string | null): SalesCatalogLeadDataField | null {
  return salesCatalogLeadDataFields.some((field) => field.value === value) ? (value as SalesCatalogLeadDataField) : null;
}

function normalizeUf(value: string | null) {
  if (!value) return null;
  const uf = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(uf) ? uf : null;
}

function previewContent(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 600);
}

function readItemAttributes(value: unknown): SalesCatalogItemAttribute[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogItemAttribute | null => {
      const record = readRecord(item);
      if (!record) return null;

      const name = readString(record.name);
      const values = readStringList(record.values, []);

      if (!name || values.length === 0) return null;

      return {
        id: readString(record.id) ?? createAttributeId(name),
        name,
        values,
      };
    })
    .filter((item): item is SalesCatalogItemAttribute => Boolean(item));
}

function readAttributeList(value: unknown, fallback: SalesCatalogAttribute[]): SalesCatalogAttribute[] {
  if (!Array.isArray(value)) return fallback;

  const attributes = value
    .map((item): SalesCatalogAttribute | null => {
      const record = readRecord(item);
      if (!record) return null;

      const name = readString(record.name);
      const values = readStringList(record.values, []);

      if (!name) return null;

      return {
        id: readString(record.id) ?? createAttributeId(name),
        name,
        values,
        required: readNullableBoolean(record.required) ?? false,
      };
    })
    .filter((item): item is SalesCatalogAttribute => Boolean(item));

  return attributes.length > 0 ? attributes : fallback;
}

function readPaymentMethods(value: unknown, fallback: SalesCatalogPaymentMethod[]): SalesCatalogPaymentMethod[] {
  const methodsById = new Map(fallback.map((method) => [method.id, { ...method }]));

  if (Array.isArray(value)) {
    for (const item of value) {
      const record = readRecord(item);
      if (!record) continue;

      const id = normalizePaymentMethodId(readString(record.id));
      if (!id) continue;

      const fallbackMethod = methodsById.get(id) ?? salesCatalogPaymentMethodTemplates.find((method) => method.id === id);
      methodsById.set(id, {
        id,
        label: readString(record.label) ?? fallbackMethod?.label ?? id,
        enabled: readNullableBoolean(record.enabled) ?? fallbackMethod?.enabled ?? false,
        instructions: readString(record.instructions) ?? fallbackMethod?.instructions ?? null,
        requiresProof: readNullableBoolean(record.requires_proof) ?? readNullableBoolean(record.requiresProof) ?? fallbackMethod?.requiresProof ?? false,
      });
    }
  }

  return salesCatalogPaymentMethodTemplates.map((method) => methodsById.get(method.id) ?? { ...method });
}

function readOrderPolicy(value: unknown, fallback: ClientSalesCatalogSettings["orderPolicy"]) {
  const record = readRecord(value);
  if (!record) return fallback;

  return {
    minimumOrderValue: readString(record.minimum_order_value) ?? readString(record.minimumOrderValue) ?? fallback.minimumOrderValue,
    reservationPolicy: normalizeReservationPolicy(readString(record.reservation_policy) ?? readString(record.reservationPolicy)),
    allowOrderWithoutPayment: readNullableBoolean(record.allow_order_without_payment) ?? readNullableBoolean(record.allowOrderWithoutPayment) ?? fallback.allowOrderWithoutPayment,
    requireHumanConfirmation: readNullableBoolean(record.require_human_confirmation) ?? readNullableBoolean(record.requireHumanConfirmation) ?? fallback.requireHumanConfirmation,
    askCepBeforeQuote: readNullableBoolean(record.ask_cep_before_quote) ?? readNullableBoolean(record.askCepBeforeQuote) ?? fallback.askCepBeforeQuote,
    abandonedCartMinutes: readNumber(record.abandoned_cart_minutes) ?? readNumber(record.abandonedCartMinutes) ?? fallback.abandonedCartMinutes,
    followUpDays: readNumber(record.follow_up_days) ?? readNumber(record.followUpDays) ?? fallback.followUpDays,
  };
}

function readLeadDataPolicy(value: unknown, fallback: ClientSalesCatalogSettings["leadDataPolicy"]) {
  const record = readRecord(value);
  if (!record) return fallback;

  const requiredFields = Array.isArray(record.required_fields) || Array.isArray(record.requiredFields)
    ? readStringList(record.required_fields ?? record.requiredFields, [])
        .map(normalizeLeadDataField)
        .filter((field): field is SalesCatalogLeadDataField => Boolean(field))
    : fallback.requiredFields;

  return {
    requiredFields,
    consentMessage: readString(record.consent_message) ?? readString(record.consentMessage) ?? fallback.consentMessage,
    retentionDays: readNumber(record.retention_days) ?? readNumber(record.retentionDays) ?? fallback.retentionDays,
  };
}

function readMessageTemplates(value: unknown, fallback: SalesCatalogWhatsAppMessageTemplates): SalesCatalogWhatsAppMessageTemplates {
  const record = readRecord(value);
  if (!record) return fallback;

  return {
    orderSummary: readString(record.order_summary) ?? readString(record.orderSummary) ?? fallback.orderSummary,
    paymentRequest: readString(record.payment_request) ?? readString(record.paymentRequest) ?? fallback.paymentRequest,
    paymentConfirmed: readString(record.payment_confirmed) ?? readString(record.paymentConfirmed) ?? fallback.paymentConfirmed,
    unavailableItem: readString(record.unavailable_item) ?? readString(record.unavailableItem) ?? fallback.unavailableItem,
    humanHandoff: readString(record.human_handoff) ?? readString(record.humanHandoff) ?? fallback.humanHandoff,
  };
}

function readStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;

  const values = value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));

  return Array.from(new Set(values));
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function readNullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
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
