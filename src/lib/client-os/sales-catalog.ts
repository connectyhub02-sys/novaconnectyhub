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
  type ClientSalesCatalogPaymentIntegration,
  type ClientSalesCatalogPaymentSession,
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
  type SalesCatalogPaymentIntegrationMode,
  type SalesCatalogPaymentIntegrationStatus,
  type SalesCatalogPaymentProvider,
  type SalesCatalogPaymentSessionMethod,
  type SalesCatalogPaymentSessionStatus,
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
  type SalesCatalogSku,
  type SalesCatalogSkuStatus,
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
  latest_payment_session_id: string | null;
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
  sku_id: string | null;
  sku_code: string | null;
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

export type SalesCatalogSkuRow = {
  id: string;
  organization_id: string | null;
  catalog_item_id: string | null;
  sku_code: string | null;
  title: string | null;
  attributes: unknown;
  price: string | null;
  sale_price: string | null;
  currency: string | null;
  stock_status: string | null;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
  weight_grams: number | null;
  dimensions: JsonRecord | null;
  media_ids: string[] | null;
  status: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SalesCatalogPaymentIntegrationRow = {
  id: string;
  organization_id: string | null;
  provider: string | null;
  mode: string | null;
  status: string | null;
  account_label: string | null;
  provider_account_id: string | null;
  public_key: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  connected_at: string | null;
  last_error: string | null;
  webhook_secret_encrypted: string | null;
  webhook_url: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SalesCatalogPaymentSessionRow = {
  id: string;
  organization_id: string | null;
  order_id: string | null;
  integration_id: string | null;
  provider: string | null;
  method: string | null;
  status: string | null;
  amount: string | number | null;
  currency: string | null;
  payer_email: string | null;
  provider_payment_id: string | null;
  provider_status: string | null;
  provider_status_detail: string | null;
  checkout_url: string | null;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_ticket_url: string | null;
  external_reference: string | null;
  expires_at: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
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

  return attachSalesCatalogSkus(client, ((data ?? []) as SalesCatalogMemoryRow[]).map(mapSalesCatalogItem));
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
      "latest_payment_session_id",
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
    .select("id, order_id, organization_id, catalog_item_id, sku_id, sku_code, title, tag, quantity, unit_price, sale_price, total, attributes, fulfillment, metadata, created_at")
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

export async function listClientSalesCatalogPaymentIntegrations(input: {
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
    .from("sales_catalog_payment_integrations")
    .select("id, organization_id, provider, mode, status, account_label, provider_account_id, public_key, access_token_encrypted, refresh_token_encrypted, token_expires_at, connected_at, last_error, webhook_secret_encrypted, webhook_url, metadata, created_at, updated_at")
    .in("organization_id", companyIds)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Nao foi possivel carregar pagamentos do catalogo: ${error.message}`);
  }

  return ((data ?? []) as unknown as SalesCatalogPaymentIntegrationRow[]).map(mapSalesCatalogPaymentIntegration);
}

export async function listClientSalesCatalogPaymentSessions(input: {
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
    .from("sales_catalog_payment_sessions")
    .select("id, organization_id, order_id, integration_id, provider, method, status, amount, currency, payer_email, provider_payment_id, provider_status, provider_status_detail, checkout_url, pix_qr_code, pix_qr_code_base64, pix_ticket_url, external_reference, expires_at, paid_at, failure_reason, metadata, created_at, updated_at")
    .in("organization_id", companyIds)
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    throw new Error(`Nao foi possivel carregar sessoes de pagamento: ${error.message}`);
  }

  return ((data ?? []) as unknown as SalesCatalogPaymentSessionRow[]).map(mapSalesCatalogPaymentSession);
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

  return attachSalesCatalogSkus(client, ((data ?? []) as SalesCatalogMemoryRow[]).map(mapSalesCatalogItem));
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

async function attachSalesCatalogSkus(client: SupabaseClient, items: ClientSalesCatalogItem[]) {
  const itemIds = items.map((item) => item.id);

  if (itemIds.length === 0) {
    return items;
  }

  const { data, error } = await client
    .from("sales_catalog_skus")
    .select("id, organization_id, catalog_item_id, sku_code, title, attributes, price, sale_price, currency, stock_status, stock_quantity, low_stock_threshold, weight_grams, dimensions, media_ids, status, metadata, created_at, updated_at")
    .in("catalog_item_id", itemIds)
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  if (error) {
    return items;
  }

  const skusByItem = new Map<string, SalesCatalogSku[]>();
  for (const row of (data ?? []) as unknown as SalesCatalogSkuRow[]) {
    const catalogItemId = readString(row.catalog_item_id);
    if (!catalogItemId) continue;

    const current = skusByItem.get(catalogItemId) ?? [];
    current.push(mapSalesCatalogSku(row));
    skusByItem.set(catalogItemId, current);
  }

  return items.map((item) => ({
    ...item,
    skus: skusByItem.get(item.id) ?? item.skus,
  }));
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
    skus: readSkus(metadata.skus, readString(row.organization_id) ?? "", row.id),
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
    latestPaymentSessionId: readString(row.latest_payment_session_id),
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
    skuId: readString(row.sku_id),
    skuCode: readString(row.sku_code),
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

export function mapSalesCatalogSku(row: SalesCatalogSkuRow): SalesCatalogSku {
  const dimensions = readRecord(row.dimensions) ?? {};

  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    catalogItemId: readString(row.catalog_item_id),
    skuCode: readString(row.sku_code) ?? row.id.slice(0, 8),
    title: readString(row.title),
    attributes: readItemAttributes(row.attributes),
    price: readString(row.price),
    salePrice: readString(row.sale_price),
    currency: readString(row.currency) ?? "BRL",
    stockStatus: normalizeStockStatus(readString(row.stock_status)),
    stockQuantity: readNumber(row.stock_quantity),
    lowStockThreshold: readNumber(row.low_stock_threshold),
    weightGrams: readNumber(row.weight_grams),
    dimensions: {
      lengthCm: readNumber(dimensions.length_cm) ?? readNumber(dimensions.lengthCm),
      widthCm: readNumber(dimensions.width_cm) ?? readNumber(dimensions.widthCm),
      heightCm: readNumber(dimensions.height_cm) ?? readNumber(dimensions.heightCm),
    },
    mediaIds: Array.isArray(row.media_ids) ? row.media_ids.filter((item): item is string => typeof item === "string") : [],
    status: normalizeSkuStatus(readString(row.status)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogPaymentIntegration(row: SalesCatalogPaymentIntegrationRow): ClientSalesCatalogPaymentIntegration {
  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    provider: normalizePaymentProvider(readString(row.provider)),
    mode: normalizePaymentIntegrationMode(readString(row.mode)),
    status: normalizePaymentIntegrationStatus(readString(row.status)),
    accountLabel: readString(row.account_label),
    providerAccountId: readString(row.provider_account_id),
    publicKey: readString(row.public_key),
    tokenExpiresAt: row.token_expires_at,
    connectedAt: row.connected_at,
    lastError: readString(row.last_error),
    webhookUrl: readString(row.webhook_url),
    hasAccessToken: Boolean(row.access_token_encrypted),
    hasRefreshToken: Boolean(row.refresh_token_encrypted),
    hasWebhookSecret: Boolean(row.webhook_secret_encrypted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogPaymentSession(row: SalesCatalogPaymentSessionRow): ClientSalesCatalogPaymentSession {
  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    orderId: readString(row.order_id) ?? "",
    integrationId: readString(row.integration_id),
    provider: normalizePaymentProvider(readString(row.provider)),
    method: normalizePaymentSessionMethod(readString(row.method)),
    status: normalizePaymentSessionStatus(readString(row.status)),
    amount: formatAmount(row.amount),
    currency: readString(row.currency) ?? "BRL",
    payerEmail: readString(row.payer_email),
    providerPaymentId: readString(row.provider_payment_id),
    providerStatus: readString(row.provider_status),
    providerStatusDetail: readString(row.provider_status_detail),
    checkoutUrl: readString(row.checkout_url),
    pixQrCode: readString(row.pix_qr_code),
    pixQrCodeBase64: readString(row.pix_qr_code_base64),
    pixTicketUrl: readString(row.pix_ticket_url),
    externalReference: readString(row.external_reference) ?? row.id,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    failureReason: readString(row.failure_reason),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

function readSkus(value: unknown, companyId: string, catalogItemId: string): SalesCatalogSku[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): SalesCatalogSku | null => {
      const record = readRecord(item);
      if (!record) return null;

      const skuCode = readString(record.sku_code) ?? readString(record.skuCode);
      if (!skuCode) return null;

      const dimensions = readRecord(record.dimensions) ?? {};

      return {
        id: readString(record.id),
        companyId,
        catalogItemId,
        skuCode,
        title: readString(record.title),
        attributes: readItemAttributes(record.attributes),
        price: readString(record.price),
        salePrice: readString(record.sale_price) ?? readString(record.salePrice),
        currency: readString(record.currency) ?? "BRL",
        stockStatus: normalizeStockStatus(readString(record.stock_status) ?? readString(record.stockStatus)),
        stockQuantity: readNumber(record.stock_quantity) ?? readNumber(record.stockQuantity),
        lowStockThreshold: readNumber(record.low_stock_threshold) ?? readNumber(record.lowStockThreshold),
        weightGrams: readNumber(record.weight_grams) ?? readNumber(record.weightGrams),
        dimensions: {
          lengthCm: readNumber(dimensions.length_cm) ?? readNumber(dimensions.lengthCm),
          widthCm: readNumber(dimensions.width_cm) ?? readNumber(dimensions.widthCm),
          heightCm: readNumber(dimensions.height_cm) ?? readNumber(dimensions.heightCm),
        },
        mediaIds: readStringList(record.media_ids ?? record.mediaIds, []),
        status: normalizeSkuStatus(readString(record.status)),
        createdAt: readString(record.created_at) ?? readString(record.createdAt),
        updatedAt: readString(record.updated_at) ?? readString(record.updatedAt),
      };
    })
    .filter((item): item is SalesCatalogSku => Boolean(item));
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

function normalizeSkuStatus(value: string | null): SalesCatalogSkuStatus {
  if (value === "draft" || value === "archived") return value;
  return "active";
}

function normalizePaymentProvider(value: string | null): SalesCatalogPaymentProvider {
  if (value === "mercado_pago") return "mercado_pago";
  return "mercado_pago";
}

function normalizePaymentIntegrationStatus(value: string | null): SalesCatalogPaymentIntegrationStatus {
  if (value === "connected" || value === "disabled" || value === "error") return value;
  return "pending";
}

function normalizePaymentIntegrationMode(value: string | null): SalesCatalogPaymentIntegrationMode {
  if (value === "sandbox") return "sandbox";
  return "production";
}

function normalizePaymentSessionMethod(value: string | null): SalesCatalogPaymentSessionMethod {
  if (value === "card" || value === "checkout_link") return value;
  return "pix";
}

function normalizePaymentSessionStatus(value: string | null): SalesCatalogPaymentSessionStatus {
  if (
    value === "pending"
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

function formatAmount(value: string | number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "0.00";
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
