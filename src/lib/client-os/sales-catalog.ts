import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClientCompanyAccess, listClientCompanies } from "@/lib/client-os/companies";
import {
  buildPagBankScopeReconnectMessage,
  listMissingPagBankRequestedScopes,
} from "@/lib/sales-catalog/pagbank";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildSalesCatalogContent,
  createDefaultSalesCatalogOrderBumps,
  createDefaultSalesCatalogShippingServices,
  createDefaultSalesCatalogCommerceSettings,
  defaultSalesCatalogShippingRules,
  emptySalesCatalogProductFulfillment,
  emptySalesCatalogProductInventory,
  emptySalesCatalogProductOffer,
  emptySalesCatalogProductPageContent,
  emptySalesCatalogProductShipping,
  createSalesCatalogTag,
  getSalesCatalogReadiness,
  normalizeSalesCatalogStorefrontFontPreset,
  resolveSalesCatalogMediaKind,
  salesCatalogAsaasPaymentMethodOptions,
  salesCatalogLeadDataFields,
  salesCatalogPagBankPaymentMethodOptions,
  salesCatalogPaymentMethodTemplates,
  type ClientSalesCatalogPaymentIntegration,
  type ClientSalesCatalogPaymentSession,
  type ClientSalesCatalogSettings,
  type ClientSalesCatalogItem,
  type ClientSalesCatalogOrder,
  type ClientSalesCatalogShippingSettings,
  type ClientSalesCatalogWhatsappInstance,
  type SalesCatalogAttribute,
  type SalesCatalogBillingCycle,
  type SalesCatalogBillingInterval,
  type SalesCatalogBusinessType,
  type SalesCatalogFulfillmentStatus,
  type SalesCatalogItemAttribute,
  type SalesCatalogItemStatus,
  type SalesCatalogLeadDataField,
  type SalesCatalogPaymentMethod,
  type SalesCatalogPaymentMethodId,
  type SalesCatalogAsaasPaymentMethod,
  type SalesCatalogAsaasSettings,
  type SalesCatalogPagBankPaymentMethod,
  type SalesCatalogPagBankSettings,
  type SalesCatalogPaymentStatus,
  type SalesCatalogPaymentIntegrationMode,
  type SalesCatalogPaymentIntegrationStatus,
  type SalesCatalogPaymentProvider,
  type SalesCatalogPaymentSessionMethod,
  type SalesCatalogPaymentSessionStatus,
  type SalesCatalogReservationPolicy,
  type SalesCatalogMedia,
  type SalesCatalogFulfillmentMode,
  type SalesCatalogGeoPoint,
  type SalesCatalogOrderStatus,
  type SalesCatalogLocalDeliveryZone,
  type SalesCatalogLocalDeliveryZoneShape,
  type SalesCatalogCommercialFlowType,
  type SalesCatalogProductOriginType,
  type SalesCatalogRevenueOwnerType,
  type SalesCatalogProductFulfillment,
  type SalesCatalogProductShipping,
  type SalesCatalogProductInventory,
  type SalesCatalogProductOffer,
  type SalesCatalogProductPageContent,
  type SalesCatalogShippingProvider,
  type SalesCatalogShippingProfile,
  type SalesCatalogShippingRule,
  type SalesCatalogShippingService,
  type SalesCatalogShippingWeightTier,
  type SalesCatalogStockStatus,
  type SalesCatalogWhatsAppMessageTemplates,
  type SalesCatalogAutomationSettings,
  type SalesCatalogCommerceAgentSettings,
  type SalesCatalogCommerceAgentMode,
  type SalesCatalogCommerceAgentSurface,
  type SalesCatalogCommerceAgentVerticalPlaybook,
  type SalesCatalogOrderBumpSettings,
  type SalesCatalogSource,
  type SalesCatalogSalesDestination,
  type SalesCatalogSku,
  type SalesCatalogSkuStatus,
  type SalesCatalogWhatsappExportStatus,
  type SalesCatalogWhatsappExportTarget,
  isSalesCatalogDisplayableProduct,
} from "@/lib/sales-catalog/shared";
import { normalizeSalesCatalogCategoryIconMap } from "@/lib/sales-catalog/category-icons";
import { buildTrackedLinkUrl, createTrackedLinkTag } from "@/lib/tracking/tracked-links";

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

type TrackedLinkButtonMemoryRow = SalesCatalogMemoryRow & {
  tags: string[] | null;
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
  commercial_flow_type: string | null;
  revenue_owner_type: string | null;
  contains_platform_products: boolean | null;
  commission_eligible: boolean | null;
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
  product_origin_type: string | null;
  commercial_flow_type: string | null;
  revenue_owner_type: string | null;
  commission_eligible: boolean | null;
  platform_product_id: string | null;
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
  token_scope: string | null;
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
  payment_owner_type: string | null;
  commercial_flow_type: string | null;
  revenue_owner_type: string | null;
  commission_context: JsonRecord | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type WhatsappInstanceRow = {
  id: string;
  organization_id: string | null;
  provider_instance_id: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: string | null;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
  updated_at: string | null;
};

type AgentRegistryRow = {
  id: string;
  organization_id: string | null;
  name: string | null;
  persona_name: string | null;
  agent_code: string | null;
  status: string | null;
  metadata: JsonRecord | null;
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

  await promoteLegacyTrackedLinkButtonsToSalesCatalog(client, companyIds).catch(() => undefined);

  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_item")
    .in("organization_id", companyIds)
    .neq("metadata->>status", "archived")
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    throw new Error(`Nao foi possivel carregar o catalogo de vendas: ${error.message}`);
  }

  return attachSalesCatalogSkus(
    client,
    ((data ?? []) as SalesCatalogMemoryRow[])
      .map(mapSalesCatalogItem)
      .filter(isSalesCatalogDisplayableProduct),
  );
}

export async function listClientSalesCatalogWhatsappInstances(input: {
  userId: string;
  companyId?: string | null;
  client?: SupabaseClient;
}): Promise<ClientSalesCatalogWhatsappInstance[]> {
  const client = input.client ?? createServiceClient();
  const companies = input.companyId
    ? [await requireClientCompanyAccess({ userId: input.userId, companyId: input.companyId, client })]
    : await listClientCompanies(input.userId, client);
  const companyIds = companies.map((company) => company.id);

  if (companyIds.length === 0) {
    return [];
  }

  const [{ data: instances, error: instanceError }, { data: agents, error: agentError }] = await Promise.all([
    client
      .from("whatsapp_instances")
      .select("id, organization_id, provider_instance_id, phone_number, display_name, status, instance_token_encrypted, metadata, updated_at")
      .in("organization_id", companyIds)
      .eq("provider", "uazapi")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .returns<WhatsappInstanceRow[]>(),
    client
      .from("agent_registry")
      .select("id, organization_id, name, persona_name, agent_code, status, metadata")
      .in("organization_id", companyIds)
      .neq("status", "archived")
      .returns<AgentRegistryRow[]>(),
  ]);

  if (instanceError) {
    throw new Error(`Nao foi possivel carregar as instancias WhatsApp: ${instanceError.message}`);
  }

  if (agentError) {
    throw new Error(`Nao foi possivel carregar os agentes WhatsApp: ${agentError.message}`);
  }

  const agentsById = new Map((agents ?? []).map((agent) => [agent.id, agent]));
  const agentsByCompany = new Map<string, AgentRegistryRow[]>();

  for (const agent of agents ?? []) {
    const companyId = readString(agent.organization_id);
    if (!companyId) continue;

    const current = agentsByCompany.get(companyId) ?? [];
    current.push(agent);
    agentsByCompany.set(companyId, current);
  }

  return (instances ?? [])
    .filter((instance) => Boolean(readString(instance.organization_id)))
    .map((instance) => {
      const companyId = readString(instance.organization_id) ?? "";
      const agent = resolveWhatsappInstanceAgent(instance, agentsById, agentsByCompany.get(companyId) ?? []);
      const agentName = agent ? readString(agent.persona_name) ?? readString(agent.name) : null;

      return {
        id: instance.id,
        companyId,
        agentId: agent?.id ?? null,
        agentName,
        displayName: readString(instance.display_name),
        phoneNumber: readString(instance.phone_number),
        status: readString(instance.status) ?? "unknown",
        tokenReady: Boolean(instance.instance_token_encrypted),
        label: formatWhatsappInstanceLabel(instance, agentName),
      };
    });
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
      "commercial_flow_type",
      "revenue_owner_type",
      "contains_platform_products",
      "commission_eligible",
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
    .select("id, order_id, organization_id, catalog_item_id, sku_id, sku_code, title, tag, quantity, unit_price, sale_price, total, attributes, fulfillment, product_origin_type, commercial_flow_type, revenue_owner_type, commission_eligible, platform_product_id, metadata, created_at")
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
    .select("id, organization_id, provider, mode, status, account_label, provider_account_id, public_key, access_token_encrypted, refresh_token_encrypted, token_scope, token_expires_at, connected_at, last_error, webhook_secret_encrypted, webhook_url, metadata, created_at, updated_at")
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
    .select("id, organization_id, order_id, integration_id, provider, method, status, amount, currency, payer_email, provider_payment_id, provider_status, provider_status_detail, checkout_url, pix_qr_code, pix_qr_code_base64, pix_ticket_url, external_reference, expires_at, paid_at, failure_reason, payment_owner_type, commercial_flow_type, revenue_owner_type, commission_context, metadata, created_at, updated_at")
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
  options: { promoteLegacyLinkButtons?: boolean } = {},
) {
  if (options.promoteLegacyLinkButtons) {
    await promoteLegacyTrackedLinkButtonsToSalesCatalog(client, [organizationId]).catch(() => undefined);
  }

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

  return attachSalesCatalogSkus(
    client,
    ((data ?? []) as SalesCatalogMemoryRow[])
      .map(mapSalesCatalogItem)
      .filter(isSalesCatalogDisplayableProduct),
  );
}

async function promoteLegacyTrackedLinkButtonsToSalesCatalog(client: SupabaseClient, companyIds: string[]) {
  const organizationIds = uniqueStrings(companyIds);

  if (organizationIds.length === 0) {
    return;
  }

  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, tags, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("memory_type", "tracked_link_button")
    .in("organization_id", organizationIds)
    .contains("tags", ["tracked_link_button"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Nao foi possivel preparar links antigos como produtos: ${error.message}`);
  }

  const now = new Date().toISOString();
  const promotions = ((data ?? []) as TrackedLinkButtonMemoryRow[])
    .map((row) => buildLegacyLinkButtonPromotion(row, now))
    .filter((promotion): promotion is NonNullable<typeof promotion> => Boolean(promotion));

  if (promotions.length === 0) {
    return;
  }

  const { data: existingItems, error: existingError } = await client
    .from("intelligence_memory")
    .select("id")
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_item")
    .in("id", promotions.map((promotion) => promotion.itemId))
    .returns<Array<{ id: string }>>();

  if (existingError) {
    throw new Error(`Nao foi possivel verificar produtos importados: ${existingError.message}`);
  }

  const existingItemIds = new Set((existingItems ?? []).map((item) => item.id));
  const productPayloads = promotions
    .filter((promotion) => !existingItemIds.has(promotion.itemId))
    .map((promotion) => promotion.productPayload);

  if (productPayloads.length > 0) {
    const { error: upsertError } = await client
      .from("intelligence_memory")
      .upsert(productPayloads, { onConflict: "id" });

    if (upsertError) {
      throw new Error(`Nao foi possivel mover links antigos para produtos: ${upsertError.message}`);
    }
  }

  await Promise.all(promotions.map((promotion) => markLegacyLinkButtonAsSalesCatalogProduct(client, promotion, now)));
}

type LegacyLinkButtonPromotion = {
  row: TrackedLinkButtonMemoryRow;
  organizationId: string;
  itemId: string;
  title: string;
  description: string;
  category: string;
  productUrl: string;
  linkTag: string;
  trackingUrl: string;
  itemTag: string;
  productPayload: JsonRecord;
};

function buildLegacyLinkButtonPromotion(
  row: TrackedLinkButtonMemoryRow,
  now: string,
): LegacyLinkButtonPromotion | null {
  const metadata = readRecord(row.metadata) ?? {};
  const tags = new Set(readStringList(row.tags, []));

  if (tags.has("sales_catalog_item") || tags.has("external_site_product") || tags.has("platform_whatsapp_sector")) {
    return null;
  }

  if (isCheckoutTrackedLinkButton(metadata, tags)) {
    return null;
  }

  if (
    readString(metadata.catalog_item_id)
    || readString(metadata.sales_catalog_item_id)
    || readString(metadata.link_button_catalog_item_id)
    || readString(metadata.source) === "sales_catalog_product"
  ) {
    return null;
  }

  const organizationId = readString(row.organization_id);
  const title = readString(metadata.label) ?? readString(metadata.title) ?? readString(row.title);
  const productUrl = normalizeLegacyTrackedLinkButtonUrl(readString(metadata.url) ?? readString(row.content));

  if (!organizationId || !title || !productUrl) {
    return null;
  }

  if (isCheckoutUrl(productUrl) || /^pagamento pedido\b/i.test(title)) {
    return null;
  }

  const itemId = createLegacySalesCatalogItemId(row.id);
  const itemTag = createSalesCatalogTag(title, itemId);
  const linkTag = readString(metadata.tag) ?? createTrackedLinkTag(title, row.id);
  const trackingUrl = readString(metadata.tracking_url) ?? buildTrackedLinkUrl(row.id);
  const category = readString(metadata.product_category) ?? readString(metadata.category) ?? "Links importados";
  const description = readString(metadata.product_description)
    ?? "Produto importado dos botoes antigos do agente. Revise preco, descricao e midias no Catalogo de Vendas.";
  const media: SalesCatalogMedia[] = [];
  const inventory = emptySalesCatalogProductInventory();
  const offer = emptySalesCatalogProductOffer();
  const fulfillment = emptySalesCatalogProductFulfillment();
  const shipping = emptySalesCatalogProductShipping();
  const pageContent = emptySalesCatalogProductPageContent();
  const content = buildSalesCatalogContent({
    title,
    description,
    category,
    price: null,
    currency: "BRL",
    media,
    attributes: [],
    inventory,
    offer,
    fulfillment,
    shipping,
    pageContent,
    salesDestination: "external_site",
    productUrl,
    externalLinkButtonTag: linkTag,
  });
  const productMetadata: JsonRecord = {
    title,
    description,
    category,
    price: null,
    currency: "BRL",
    status: "active",
    tag: itemTag,
    highlight_label: null,
    attributes: [],
    inventory,
    offer,
    fulfillment,
    shipping,
    page_content: pageContent,
    media,
    skus: [],
    source: "manual",
    sales_destination: "external_site",
    source_product_url: productUrl,
    product_url: productUrl,
    link_button_id: row.id,
    link_button_label: title,
    link_button_tag: linkTag,
    link_button_tracking_url: trackingUrl,
    external_link_button_id: row.id,
    external_link_button_label: title,
    external_link_button_tag: linkTag,
    external_link_button_tracking_url: trackingUrl,
    legacy_link_button_id: row.id,
    migrated_from: "agent_link_button",
    migrated_at: now,
    readiness: getSalesCatalogReadiness({ description, media }),
    created_by: readString(metadata.created_by),
    updated_from: "legacy_agent_button_migration",
  };

  return {
    row,
    organizationId,
    itemId,
    title,
    description,
    category,
    productUrl,
    linkTag,
    trackingUrl,
    itemTag,
    productPayload: {
      id: itemId,
      scope: "organization",
      organization_id: organizationId,
      memory_type: "sales_catalog_item",
      title,
      content,
      importance: 0.78,
      tags: ["sales_catalog_item", "sales_catalog", "external_site_product", "legacy_agent_button", "whatsapp_agent", "lead_tracking"],
      metadata: productMetadata,
      created_at: row.created_at ?? now,
      updated_at: now,
    },
  };
}

async function markLegacyLinkButtonAsSalesCatalogProduct(
  client: SupabaseClient,
  promotion: LegacyLinkButtonPromotion,
  now: string,
) {
  const metadata = readRecord(promotion.row.metadata) ?? {};
  const tags = uniqueStrings([
    ...readStringList(promotion.row.tags, []),
    "sales_catalog_item",
    "external_site_product",
    "legacy_agent_button",
    "whatsapp_agent",
    "lead_tracking",
  ]);

  await client
    .from("intelligence_memory")
    .update({
      tags,
      metadata: {
        ...metadata,
        label: promotion.title,
        url: promotion.productUrl,
        tag: promotion.linkTag,
        tracking_url: promotion.trackingUrl,
        sales_destination: "external_site",
        source: "sales_catalog_product",
        catalog_item_id: promotion.itemId,
        sales_catalog_item_id: promotion.itemId,
        product_title: promotion.title,
        product_description: promotion.description,
        product_category: promotion.category,
        product_currency: "BRL",
        migrated_to_sales_catalog_at: now,
        migrated_to_sales_catalog_from: "agent_link_button",
      },
      updated_at: now,
    })
    .eq("id", promotion.row.id)
    .eq("scope", "organization")
    .eq("organization_id", promotion.organizationId)
    .eq("memory_type", "tracked_link_button");
}

function createLegacySalesCatalogItemId(linkButtonId: string) {
  const hash = createHash("sha256").update(`sales_catalog_link_button:${linkButtonId}`).digest("hex").slice(0, 32).split("");
  hash[12] = "5";
  hash[16] = (((Number.parseInt(hash[16] ?? "8", 16) & 0x3) | 0x8)).toString(16);
  const value = hash.join("");

  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

function normalizeLegacyTrackedLinkButtonUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isCheckoutTrackedLinkButton(metadata: JsonRecord, tags: Set<string>) {
  if (
    tags.has("sales_catalog_checkout")
    || tags.has("sales_catalog_order")
    || tags.has("payment")
  ) {
    return true;
  }

  return readString(metadata.source) === "sales_catalog_checkout"
    || readString(metadata.sales_destination) === "connectyhub_checkout"
    || Boolean(readString(metadata.order_id))
    || Boolean(readString(metadata.payment_session_id))
    || isCheckoutUrl(readString(metadata.url));
}

function isCheckoutUrl(value: string | null) {
  if (!value) return false;

  try {
    const path = new URL(value).pathname.toLowerCase();
    return path === "/checkout" || path.startsWith("/checkout/");
  } catch {
    return false;
  }
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
    highlightLabel: readHighlightLabel(metadata),
    storeFeatured: readBoolean(metadata.store_featured ?? metadata.storeFeatured),
    storeFeaturedRank: readNumber(metadata.store_featured_rank ?? metadata.storeFeaturedRank),
    storeFeaturedAt: readString(metadata.store_featured_at ?? metadata.storeFeaturedAt),
    media,
    attributes: readItemAttributes(metadata.attributes),
    inventory: readProductInventory(metadata.inventory),
    skus: readSkus(metadata.skus, readString(row.organization_id) ?? "", row.id),
    offer: readProductOffer(metadata.offer),
    fulfillment: readProductFulfillment(metadata.fulfillment),
    shipping: readProductShipping(metadata.shipping),
    billingCycle: normalizeBillingCycle(readString(metadata.billing_cycle)),
    billingInterval: normalizeBillingInterval(readString(metadata.billing_interval)),
    pageContent: readProductPageContent(metadata.page_content ?? metadata.pageContent),
    productOriginType: normalizeProductOriginType(readString(metadata.product_origin_type)),
    commercialFlowType: normalizeCommercialFlowType(readString(metadata.commercial_flow_type)),
    revenueOwnerType: normalizeRevenueOwnerType(readString(metadata.revenue_owner_type)),
    commissionPolicyType: normalizeCommissionPolicyType(readString(metadata.commission_policy_type)),
    commissionEligible: readBoolean(metadata.commission_eligible) ?? false,
    platformProductId: readString(metadata.platform_product_id),
    platformProductCode: readString(metadata.platform_product_code),
    platformProductCommissionPercentage: readNumber(metadata.platform_product_commission_percentage),
    platformProductCommissionReleaseDays: readNumber(metadata.platform_product_commission_release_days),
    platformProductAgentPrompt: readString(metadata.platform_product_agent_prompt),
    salesDestination: normalizeSalesDestination(readString(metadata.sales_destination)),
    productUrl: readString(metadata.source_product_url) ?? readString(metadata.product_url),
    externalLinkButtonId: readString(metadata.link_button_id) ?? readString(metadata.external_link_button_id),
    externalLinkButtonLabel: readString(metadata.link_button_label) ?? readString(metadata.external_link_button_label),
    externalLinkButtonTag: readString(metadata.link_button_tag) ?? readString(metadata.external_link_button_tag),
    externalLinkButtonTrackingUrl: readString(metadata.link_button_tracking_url) ?? readString(metadata.external_link_button_tracking_url),
    assignedAgentIds: readStringList(metadata.assigned_agent_ids ?? metadata.agent_ids, []),
    assignedWhatsappInstanceIds: readStringList(metadata.assigned_whatsapp_instance_ids ?? metadata.whatsapp_instance_ids, []),
    sourceAgentId: readString(metadata.source_agent_id) ?? readString(metadata.agent_id),
    sourceWhatsappInstanceId: readString(metadata.source_whatsapp_instance_id) ?? readString(metadata.whatsapp_instance_id),
    whatsappExportTargets: readWhatsappExportTargets(metadata.whatsapp_export_targets),
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
  const rules = readShippingRules(metadata.rules);
  const shippingEnabled = readNullableBoolean(metadata.shipping_enabled ?? metadata.shippingEnabled)
    ?? rules.some((rule) => rule.active);
  const localDeliveryZones = readLocalDeliveryZones(metadata.local_delivery_zones ?? metadata.localDeliveryZones);
  const localDeliveryEnabled = readNullableBoolean(metadata.local_delivery_enabled ?? metadata.localDeliveryEnabled)
    ?? localDeliveryZones.some((zone) => zone.active);

  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    configured: readBoolean(metadata.configured),
    shippingEnabled,
    localDeliveryEnabled,
    localPickup: readBoolean(metadata.local_pickup),
    originCep: readString(metadata.origin_cep),
    defaultHandlingDays: readNumber(metadata.default_handling_days),
    rules,
    localDeliveryZones,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogSettings(row: SalesCatalogMemoryRow): ClientSalesCatalogSettings {
  const metadata = readRecord(row.metadata) ?? {};
  const businessType = normalizeBusinessType(readString(metadata.business_type));
  const commerceDefaults = createDefaultSalesCatalogCommerceSettings();
  const categories = readStringList(metadata.categories, []);

  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    configured: readBoolean(metadata.configured),
    businessType,
    categories,
    attributes: readAttributeList(metadata.attributes, []),
    storefront: readStorefrontSettings(metadata.storefront ?? metadata.storefront_settings ?? metadata.storefrontSettings, categories),
    trackInventory: readNullableBoolean(metadata.track_inventory) ?? false,
    variationMedia: readNullableBoolean(metadata.variation_media) ?? false,
    paymentMethods: readPaymentMethods(metadata.payment_methods, commerceDefaults.paymentMethods, {
      configuredAt: metadata.payment_methods_configured_at ?? metadata.paymentMethodsConfiguredAt,
    }),
    pagBank: readPagBankSettings(metadata.pagbank ?? metadata.pag_bank ?? metadata.pagBank, commerceDefaults.pagBank),
    asaas: readAsaasSettings(metadata.asaas ?? metadata.asaas_settings ?? metadata.asaasSettings, commerceDefaults.asaas),
    orderPolicy: readOrderPolicy(metadata.order_policy, commerceDefaults.orderPolicy),
    leadDataPolicy: readLeadDataPolicy(metadata.lead_data_policy, commerceDefaults.leadDataPolicy),
    messageTemplates: readMessageTemplates(metadata.message_templates, commerceDefaults.messageTemplates),
    automationSettings: readAutomationSettings(metadata.automation_settings ?? metadata.automationSettings, commerceDefaults.automationSettings),
    orderBumps: readOrderBumps(metadata.order_bumps ?? metadata.orderBumps, createDefaultSalesCatalogOrderBumps(), {
      configuredAt: metadata.order_bumps_configured_at ?? metadata.orderBumpsConfiguredAt,
    }),
    commerceAgent: readCommerceAgentSettings(metadata.commerce_agent ?? metadata.commerceAgent, commerceDefaults.commerceAgent, {
      configuredAt: metadata.commerce_agent_configured_at ?? metadata.commerceAgentConfiguredAt,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogOrder(
  row: SalesCatalogOrderRow,
  items: SalesCatalogOrderItemRow[] = [],
): ClientSalesCatalogOrder {
  const metadata = readRecord(row.metadata) ?? {};

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
    commercialFlowType: normalizeCommercialFlowType(readString(row.commercial_flow_type) ?? readString(metadata.commercial_flow_type)),
    revenueOwnerType: normalizeRevenueOwnerType(readString(row.revenue_owner_type) ?? readString(metadata.revenue_owner_type)),
    containsPlatformProducts: row.contains_platform_products ?? readBoolean(metadata.contains_platform_products),
    commissionEligible: row.commission_eligible ?? readBoolean(metadata.commission_eligible),
    inventoryDeductedAt: readString(metadata.inventory_deducted_at),
    inventoryRestoredAt: readString(metadata.inventory_restored_at),
    paymentWhatsappNotifiedAt: readString(metadata.payment_whatsapp_notified_at),
    inventoryDeductedItems: readArrayLength(metadata.inventory_deducted_items),
    inventoryRestoredItems: readArrayLength(metadata.inventory_restored_items),
    items: items.map(mapSalesCatalogOrderItem),
    createdBy: readString(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogOrderItem(row: SalesCatalogOrderItemRow): ClientSalesCatalogOrder["items"][number] {
  const metadata = readRecord(row.metadata) ?? {};

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
    productOriginType: normalizeProductOriginType(readString(row.product_origin_type) ?? readString(metadata.product_origin_type)),
    commercialFlowType: normalizeCommercialFlowType(readString(row.commercial_flow_type) ?? readString(metadata.commercial_flow_type)),
    revenueOwnerType: normalizeRevenueOwnerType(readString(row.revenue_owner_type) ?? readString(metadata.revenue_owner_type)),
    commissionEligible: row.commission_eligible ?? readBoolean(metadata.commission_eligible),
    platformProductId: readString(row.platform_product_id) ?? readString(metadata.platform_product_id),
    platformProductCode: readString(metadata.platform_product_code),
    platformProductCommissionPercentage: readNumber(metadata.platform_product_commission_percentage),
    platformProductCommissionReleaseDays: readNumber(metadata.platform_product_commission_release_days),
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
  const provider = normalizePaymentProvider(readString(row.provider));
  const missingPagBankScopes = provider === "pagbank"
    ? listMissingPagBankRequestedScopes(row.token_scope)
    : [];

  return {
    id: row.id,
    companyId: readString(row.organization_id) ?? "",
    provider,
    mode: normalizePaymentIntegrationMode(readString(row.mode)),
    status: normalizePaymentIntegrationStatus(readString(row.status)),
    accountLabel: readString(row.account_label),
    providerAccountId: readString(row.provider_account_id),
    publicKey: readString(row.public_key),
    tokenExpiresAt: row.token_expires_at,
    connectedAt: row.connected_at,
    lastError: readString(row.last_error)
      ?? (missingPagBankScopes.length > 0 ? buildPagBankScopeReconnectMessage(missingPagBankScopes) : null),
    webhookUrl: readString(row.webhook_url),
    hasAccessToken: Boolean(row.access_token_encrypted),
    hasRefreshToken: Boolean(row.refresh_token_encrypted),
    hasWebhookSecret: Boolean(row.webhook_secret_encrypted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesCatalogPaymentSession(row: SalesCatalogPaymentSessionRow): ClientSalesCatalogPaymentSession {
  const metadata = readRecord(row.metadata) ?? {};
  const commissionContext = readRecord(row.commission_context) ?? {};

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
    paymentOwnerType: normalizeRevenueOwnerType(readString(row.payment_owner_type) ?? readString(metadata.payment_owner_type) ?? readString(metadata.payment_owner)),
    commercialFlowType: normalizeCommercialFlowType(readString(row.commercial_flow_type) ?? readString(metadata.commercial_flow_type)),
    revenueOwnerType: normalizeRevenueOwnerType(readString(row.revenue_owner_type) ?? readString(metadata.revenue_owner_type)),
    commissionEligible: readBoolean(commissionContext.eligible)
      || readBoolean(commissionContext.commission_eligible)
      || readBoolean(metadata.commission_eligible),
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
        objectKey: readString(record.object_key ?? record.objectKey),
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

function readProductPageContent(value: unknown): SalesCatalogProductPageContent {
  const fallback = emptySalesCatalogProductPageContent();
  const record = readRecord(value);

  if (!record) return fallback;

  return {
    fullDescription: readString(record.full_description) ?? readString(record.fullDescription),
    usage: readString(record.usage),
    shippingInfo: readString(record.shipping_info) ?? readString(record.shippingInfo),
    faq: readString(record.faq),
    importantNotice: readString(record.important_notice) ?? readString(record.importantNotice),
    quickDetails: readProductQuickDetails(record.quick_details ?? record.quickDetails),
  };
}

function readProductQuickDetails(value: unknown): SalesCatalogProductPageContent["quickDetails"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      const record = readRecord(item);
      if (!record) return null;

      const label = readString(record.label);
      const detailValue = readString(record.value);
      if (!label || !detailValue) return null;

      return {
        id: readString(record.id) ?? `detail_${index + 1}`,
        label,
        value: detailValue,
      };
    })
    .filter((item): item is SalesCatalogProductPageContent["quickDetails"][number] => Boolean(item));
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

function readLocalDeliveryZones(value: unknown): SalesCatalogLocalDeliveryZone[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 40)
    .map((item, index): SalesCatalogLocalDeliveryZone | null => {
      const record = readRecord(item);
      if (!record) return null;

      const name = readString(record.name) ?? `Zona local ${index + 1}`;
      const shape = normalizeLocalDeliveryZoneShape(readString(record.shape));
      const minDays = readNumber(record.min_days) ?? readNumber(record.minDays);
      const rawMaxDays = readNumber(record.max_days) ?? readNumber(record.maxDays);

      return {
        id: readString(record.id) ?? `local_zone_${index + 1}`,
        name,
        active: readNullableBoolean(record.active) ?? true,
        shape,
        baseAddress: readString(record.base_address) ?? readString(record.baseAddress),
        baseLatitude: readNumber(record.base_latitude) ?? readNumber(record.baseLatitude),
        baseLongitude: readNumber(record.base_longitude) ?? readNumber(record.baseLongitude),
        radiusKm: readNumber(record.radius_km) ?? readNumber(record.radiusKm),
        polygon: readGeoPoints(record.polygon),
        neighborhoods: readTextList(record.neighborhoods),
        cities: readTextList(record.cities),
        price: readString(record.price),
        minDays,
        maxDays: minDays !== null && rawMaxDays !== null && rawMaxDays < minDays ? minDays : rawMaxDays,
        freeDeliveryThreshold: readString(record.free_delivery_threshold) ?? readString(record.freeDeliveryThreshold),
        orderMinimum: readString(record.order_minimum) ?? readString(record.orderMinimum),
        notes: readString(record.notes),
      };
    })
    .filter((item): item is SalesCatalogLocalDeliveryZone => Boolean(item));
}

function normalizeLocalDeliveryZoneShape(value: string | null): SalesCatalogLocalDeliveryZoneShape {
  if (value === "neighborhoods" || value === "polygon") return value;
  return "radius";
}

function readGeoPoints(value: unknown): SalesCatalogGeoPoint[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 80)
    .map((item): SalesCatalogGeoPoint | null => {
      const record = readRecord(item);
      if (!record) return null;

      const lat = readNumber(record.lat) ?? readNumber(record.latitude);
      const lng = readNumber(record.lng) ?? readNumber(record.longitude);

      return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
        ? { lat, lng }
        : null;
    })
    .filter((item): item is SalesCatalogGeoPoint => Boolean(item));
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

function normalizeSalesDestination(value: string | null): SalesCatalogSalesDestination {
  if (value === "external_site" || value === "manual_handoff" || value === "connectyhub_checkout") return value;
  return "connectyhub_checkout";
}

function normalizeProductOriginType(value: string | null): SalesCatalogProductOriginType {
  if (value === "connectyhub" || value === "external_provider") return value;
  return "client";
}

function normalizeCommercialFlowType(value: string | null): SalesCatalogCommercialFlowType {
  if (value === "connectyhub_resale" || value === "connectyhub_direct" || value === "external_marketplace") return value;
  return "client_direct";
}

function normalizeRevenueOwnerType(value: string | null): SalesCatalogRevenueOwnerType {
  if (value === "connectyhub" || value === "split" || value === "external_provider") return value;
  return "client";
}

function normalizeCommissionPolicyType(value: string | null) {
  if (value === "percentage" || value === "fixed" || value === "custom") return value;
  return "none";
}

function normalizeBillingCycle(value: string | null): SalesCatalogBillingCycle {
  return value === "recurring" ? "recurring" : "one_time";
}

function normalizeBillingInterval(value: string | null): SalesCatalogBillingInterval {
  if (value === "week" || value === "quarter" || value === "year") return value;
  return "month";
}

function normalizeSkuStatus(value: string | null): SalesCatalogSkuStatus {
  if (value === "draft" || value === "archived") return value;
  return "active";
}

function normalizePaymentProvider(value: string | null): SalesCatalogPaymentProvider {
  if (value === "asaas") return "asaas";
  if (value === "pagbank") return "pagbank";
  if (value === "mercado_pago") return "mercado_pago";
  return "asaas";
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

function readPaymentMethods(
  value: unknown,
  fallback: SalesCatalogPaymentMethod[],
  options: { configuredAt?: unknown } = {},
): SalesCatalogPaymentMethod[] {
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

  const methods = salesCatalogPaymentMethodTemplates.map((method) => methodsById.get(method.id) ?? { ...method });

  if (methods.some((method) => method.enabled) || readString(options.configuredAt)) {
    return methods;
  }

  return fallback.map((method) => ({ ...method }));
}

function readPagBankSettings(value: unknown, fallback: SalesCatalogPagBankSettings): SalesCatalogPagBankSettings {
  const record = readRecord(value);
  if (!record) return { ...fallback, enabledMethods: [...fallback.enabledMethods] };

  const enabledMethods = normalizePagBankPaymentMethods(
    record.enabled_methods ?? record.enabledMethods,
    fallback.enabledMethods,
  );
  const maxInstallments = clampInteger(
    readNumber(record.max_installments ?? record.maxInstallments) ?? fallback.maxInstallments,
    1,
    12,
  );
  const interestFreeInstallments = clampInteger(
    readNumber(record.interest_free_installments ?? record.interestFreeInstallments) ?? fallback.interestFreeInstallments,
    0,
    maxInstallments,
  );

  return {
    enabledMethods,
    maxInstallments,
    interestFreeInstallments,
    softDescriptor: readString(record.soft_descriptor ?? record.softDescriptor) ?? fallback.softDescriptor,
    pixExpirationMinutes: clampInteger(
      readNumber(record.pix_expiration_minutes ?? record.pixExpirationMinutes) ?? fallback.pixExpirationMinutes,
      5,
      43200,
    ),
    checkoutExpirationMinutes: clampInteger(
      readNumber(record.checkout_expiration_minutes ?? record.checkoutExpirationMinutes) ?? fallback.checkoutExpirationMinutes,
      5,
      43200,
    ),
    allowBuyerEdit: readNullableBoolean(record.allow_buyer_edit ?? record.allowBuyerEdit) ?? fallback.allowBuyerEdit,
    recurringEnabled: readNullableBoolean(record.recurring_enabled ?? record.recurringEnabled) ?? fallback.recurringEnabled,
  };
}

function readAsaasSettings(value: unknown, fallback: SalesCatalogAsaasSettings): SalesCatalogAsaasSettings {
  const record = readRecord(value);
  if (!record) return { ...fallback, enabledMethods: [...fallback.enabledMethods] };

  const enabledMethods = normalizeAsaasPaymentMethods(
    record.enabled_methods ?? record.enabledMethods,
    fallback.enabledMethods,
  );
  const maxInstallments = clampInteger(
    readNumber(record.max_installments ?? record.maxInstallments) ?? fallback.maxInstallments,
    1,
    21,
  );
  const interestFreeInstallments = clampInteger(
    readNumber(record.interest_free_installments ?? record.interestFreeInstallments) ?? fallback.interestFreeInstallments,
    0,
    maxInstallments,
  );

  return {
    enabledMethods,
    maxInstallments,
    interestFreeInstallments,
    softDescriptor: readString(record.soft_descriptor ?? record.softDescriptor) ?? fallback.softDescriptor,
    pixExpirationDays: clampInteger(
      readNumber(record.pix_expiration_days ?? record.pixExpirationDays) ?? fallback.pixExpirationDays,
      1,
      30,
    ),
    checkoutExpirationMinutes: clampInteger(
      readNumber(record.checkout_expiration_minutes ?? record.checkoutExpirationMinutes) ?? fallback.checkoutExpirationMinutes,
      10,
      1440,
    ),
    boletoDueDays: clampInteger(
      readNumber(record.boleto_due_days ?? record.boletoDueDays) ?? fallback.boletoDueDays,
      1,
      60,
    ),
    boletoAutoCancelDays: clampInteger(
      readNumber(record.boleto_auto_cancel_days ?? record.boletoAutoCancelDays) ?? fallback.boletoAutoCancelDays,
      0,
      120,
    ),
    allowBuyerEdit: readNullableBoolean(record.allow_buyer_edit ?? record.allowBuyerEdit) ?? fallback.allowBuyerEdit,
    recurringEnabled: readNullableBoolean(record.recurring_enabled ?? record.recurringEnabled) ?? fallback.recurringEnabled,
  };
}

function normalizePagBankPaymentMethods(
  value: unknown,
  fallback: SalesCatalogPagBankPaymentMethod[],
): SalesCatalogPagBankPaymentMethod[] {
  const allowed = new Set(salesCatalogPagBankPaymentMethodOptions.map((method) => method.id));
  const source = Array.isArray(value) ? value : fallback;
  const methods = source
    .map((item) => readString(item))
    .filter((method): method is SalesCatalogPagBankPaymentMethod => allowed.has(method as SalesCatalogPagBankPaymentMethod));

  return methods.length > 0 ? Array.from(new Set(methods)) : [...fallback];
}

function normalizeAsaasPaymentMethods(
  value: unknown,
  fallback: SalesCatalogAsaasPaymentMethod[],
): SalesCatalogAsaasPaymentMethod[] {
  const allowed = new Set(salesCatalogAsaasPaymentMethodOptions.map((method) => method.id));
  const source = Array.isArray(value) ? value : fallback;
  const methods = source
    .map((item) => readString(item))
    .filter((method): method is SalesCatalogAsaasPaymentMethod => allowed.has(method as SalesCatalogAsaasPaymentMethod));

  return methods.length > 0 ? Array.from(new Set(methods)) : [...fallback];
}

function readStorefrontSettings(value: unknown, categories: string[] = []): ClientSalesCatalogSettings["storefront"] {
  const record = readRecord(value) ?? {};

  return {
    publicDisplayName: readString(record.public_display_name ?? record.publicDisplayName),
    heroTitle: readString(record.hero_title ?? record.heroTitle),
    heroHighlight: readString(record.hero_highlight ?? record.heroHighlight),
    heroSubtitle: readString(record.hero_subtitle ?? record.heroSubtitle),
    headerText: readString(record.header_text ?? record.headerText),
    footerText: readString(record.footer_text ?? record.footerText),
    footerContactText: readString(record.footer_contact_text ?? record.footerContactText),
    primaryColor: readString(record.primary_color ?? record.primaryColor),
    textColor: readString(record.text_color ?? record.textColor),
    buttonColor: readString(record.button_color ?? record.buttonColor),
    buttonTextColor: readString(record.button_text_color ?? record.buttonTextColor),
    cardTextColor: readString(record.card_text_color ?? record.cardTextColor),
    offerTextColor: readString(record.offer_text_color ?? record.offerTextColor),
    heroTitleColor: readString(record.hero_title_color ?? record.heroTitleColor),
    heroHighlightColor: readString(record.hero_highlight_color ?? record.heroHighlightColor),
    categoryStripColor: readString(record.category_strip_color ?? record.categoryStripColor),
    categoryIconColor: readString(record.category_icon_color ?? record.categoryIconColor),
    bodyFont: normalizeSalesCatalogStorefrontFontPreset(record.body_font ?? record.bodyFont),
    headingFont: normalizeSalesCatalogStorefrontFontPreset(record.heading_font ?? record.headingFont),
    homeCategoryNames: readStringList(record.home_category_names ?? record.homeCategoryNames, []),
    categoryIcons: normalizeSalesCatalogCategoryIconMap(record.category_icons ?? record.categoryIcons, categories),
  };
}

function readOrderPolicy(value: unknown, fallback: ClientSalesCatalogSettings["orderPolicy"]) {
  const record = readRecord(value);
  if (!record) return fallback;
  const reservationPolicy = readString(record.reservation_policy) ?? readString(record.reservationPolicy);

  return {
    minimumOrderValue: readString(record.minimum_order_value) ?? readString(record.minimumOrderValue) ?? fallback.minimumOrderValue,
    reservationPolicy: reservationPolicy ? normalizeReservationPolicy(reservationPolicy) : fallback.reservationPolicy,
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
    paymentRejected: readString(record.payment_rejected) ?? readString(record.paymentRejected) ?? fallback.paymentRejected,
    paymentRefunded: readString(record.payment_refunded) ?? readString(record.paymentRefunded) ?? fallback.paymentRefunded,
    unavailableItem: readString(record.unavailable_item) ?? readString(record.unavailableItem) ?? fallback.unavailableItem,
    humanHandoff: readString(record.human_handoff) ?? readString(record.humanHandoff) ?? fallback.humanHandoff,
  };
}

function readAutomationSettings(value: unknown, fallback: SalesCatalogAutomationSettings): SalesCatalogAutomationSettings {
  const record = readRecord(value);
  if (!record) return fallback;

  return {
    paymentStatusNotifications: readNullableBoolean(record.payment_status_notifications ?? record.paymentStatusNotifications)
      ?? fallback.paymentStatusNotifications,
    useConversationWhatsappFirst: readNullableBoolean(record.use_conversation_whatsapp_first ?? record.useConversationWhatsappFirst)
      ?? fallback.useConversationWhatsappFirst,
    defaultWhatsappInstanceId: readString(record.default_whatsapp_instance_id ?? record.defaultWhatsappInstanceId),
    defaultAgentId: readString(record.default_agent_id ?? record.defaultAgentId),
  };
}

function readOrderBumps(
  value: unknown,
  fallback: SalesCatalogOrderBumpSettings,
  options: { configuredAt?: unknown } = {},
): SalesCatalogOrderBumpSettings {
  const record = readRecord(value);
  if (!record) return fallback;

  const itemsSource = Array.isArray(record.items) ? record.items : [];
  const items = itemsSource
    .map((item): SalesCatalogOrderBumpSettings["items"][number] | null => {
      const itemRecord = readRecord(item);
      if (!itemRecord) return null;

      const productId = readString(itemRecord.product_id) ?? readString(itemRecord.productId);
      if (!productId) return null;

      return {
        productId,
        active: readNullableBoolean(itemRecord.active) ?? true,
        badge: readString(itemRecord.badge),
        title: readString(itemRecord.title),
        description: readString(itemRecord.description),
        triggerText: readString(itemRecord.trigger_text) ?? readString(itemRecord.triggerText),
      };
    })
    .filter((item): item is SalesCatalogOrderBumpSettings["items"][number] => Boolean(item));

  const settings = {
    enabled: readNullableBoolean(record.enabled) ?? fallback.enabled,
    whatsappEnabled: readNullableBoolean(record.whatsapp_enabled ?? record.whatsappEnabled) ?? fallback.whatsappEnabled,
    checkoutEnabled: readNullableBoolean(record.checkout_enabled ?? record.checkoutEnabled) ?? fallback.checkoutEnabled,
    autoSuggestionsEnabled: readNullableBoolean(record.auto_suggestions_enabled ?? record.autoSuggestionsEnabled) ?? fallback.autoSuggestionsEnabled,
    maxOffersPerOrder: readNumber(record.max_offers_per_order ?? record.maxOffersPerOrder) ?? fallback.maxOffersPerOrder,
    items,
  };

  if (!settings.enabled && settings.items.length === 0 && !readString(options.configuredAt)) {
    return { ...fallback, items: [...fallback.items] };
  }

  return settings;
}

function readCommerceAgentSettings(
  value: unknown,
  fallback: SalesCatalogCommerceAgentSettings,
  options: { configuredAt?: unknown } = {},
): SalesCatalogCommerceAgentSettings {
  const record = readRecord(value);
  if (!record) return fallback;

  const settings = {
    enabled: readNullableBoolean(record.enabled) ?? fallback.enabled,
    mode: normalizeCommerceAgentMode(readString(record.mode), fallback.mode),
    surfaces: normalizeCommerceAgentSurfaces(record.surfaces, fallback.surfaces),
    verticalPlaybook: normalizeCommerceAgentVerticalPlaybook(
      readString(record.vertical_playbook) ?? readString(record.verticalPlaybook),
      fallback.verticalPlaybook,
    ),
    maxOffersPerSession: readNumber(record.max_offers_per_session ?? record.maxOffersPerSession)
      ?? fallback.maxOffersPerSession,
    allowAutoAddToCart: readNullableBoolean(record.allow_auto_add_to_cart ?? record.allowAutoAddToCart)
      ?? fallback.allowAutoAddToCart,
    checkoutQuietMode: readNullableBoolean(record.checkout_quiet_mode ?? record.checkoutQuietMode)
      ?? fallback.checkoutQuietMode,
    agentDockLabel: readString(record.agent_dock_label ?? record.agentDockLabel) ?? fallback.agentDockLabel,
  };

  if (!settings.enabled && !readString(options.configuredAt)) {
    return { ...settings, enabled: fallback.enabled };
  }

  return settings;
}

function normalizeCommerceAgentMode(
  value: string | null,
  fallback: SalesCatalogCommerceAgentMode,
): SalesCatalogCommerceAgentMode {
  if (value === "observer" || value === "assistant" || value === "active_seller") return value;
  return fallback;
}

function normalizeCommerceAgentSurfaces(
  value: unknown,
  fallback: SalesCatalogCommerceAgentSurface[],
): SalesCatalogCommerceAgentSurface[] {
  const allowed = new Set<SalesCatalogCommerceAgentSurface>(["store", "product", "cart", "checkout"]);
  const surfaces = readStringList(value, [])
    .filter((surface): surface is SalesCatalogCommerceAgentSurface => allowed.has(surface as SalesCatalogCommerceAgentSurface));

  return surfaces.length > 0 ? Array.from(new Set(surfaces)) : [...fallback];
}

function normalizeCommerceAgentVerticalPlaybook(
  value: string | null,
  fallback: SalesCatalogCommerceAgentVerticalPlaybook,
): SalesCatalogCommerceAgentVerticalPlaybook {
  if (
    value === "generic"
    || value === "food"
    || value === "fashion"
    || value === "beauty"
    || value === "real_estate"
    || value === "services"
    || value === "digital"
    || value === "physical"
  ) {
    return value;
  }

  return fallback;
}

function readWhatsappExportTargets(value: unknown): SalesCatalogWhatsappExportTarget[] {
  if (!Array.isArray(value)) return [];

  const targets = new Map<string, SalesCatalogWhatsappExportTarget>();

  for (const item of value) {
    const record = readRecord(item);
    const whatsappInstanceId = readString(record?.whatsapp_instance_id) ?? readString(record?.whatsappInstanceId);

    if (!record || !whatsappInstanceId) {
      continue;
    }

    targets.set(whatsappInstanceId, {
      whatsappInstanceId,
      agentId: readString(record.agent_id) ?? readString(record.agentId),
      status: normalizeWhatsappExportStatus(readString(record.status)),
      exportedAt: readString(record.exported_at) ?? readString(record.exportedAt),
      providerProductId: readString(record.provider_product_id) ?? readString(record.providerProductId),
    });
  }

  return Array.from(targets.values());
}

function normalizeWhatsappExportStatus(value: string | null): SalesCatalogWhatsappExportStatus {
  if (value === "linked" || value === "exported" || value === "failed") return value;
  return "pending_provider_support";
}

function resolveWhatsappInstanceAgent(
  instance: WhatsappInstanceRow,
  agentsById: Map<string, AgentRegistryRow>,
  organizationAgents: AgentRegistryRow[],
) {
  const candidateIds = getWhatsappInstanceAgentCandidateIds(instance);

  for (const id of candidateIds) {
    const agent = agentsById.get(id);
    if (agent) return agent;
  }

  const activeWhatsappAgents = organizationAgents.filter((agent) => isWhatsappAgent(agent));
  if (activeWhatsappAgents.length === 1) {
    return activeWhatsappAgents[0];
  }

  if (organizationAgents.length === 1) {
    return organizationAgents[0];
  }

  return null;
}

function getWhatsappInstanceAgentCandidateIds(instance: WhatsappInstanceRow) {
  const metadata = readRecord(instance.metadata) ?? {};

  return uniqueStrings([
    readString(metadata.agent_id),
    readString(metadata.agentId),
    readString(metadata.whatsapp_agent_id),
    readString(metadata.producer_agent_id),
    ...readStringList(metadata.agent_ids, []),
  ]);
}

function isWhatsappAgent(agent: AgentRegistryRow) {
  const metadata = readRecord(agent.metadata) ?? {};
  const agentKind = readString(metadata.agent_kind);
  const agentCode = readString(agent.agent_code);

  return agentKind === "whatsapp" || Boolean(agentCode?.includes("whatsapp"));
}

function formatWhatsappInstanceLabel(instance: WhatsappInstanceRow, agentName: string | null) {
  const base = readString(instance.display_name)
    ?? readString(instance.phone_number)
    ?? readString(instance.provider_instance_id)
    ?? "Instancia WhatsApp";
  const suffix = [
    agentName ? `Agente: ${agentName}` : null,
    readString(instance.status) === "connected" ? "conectada" : readString(instance.status),
    instance.instance_token_encrypted ? null : "sem token",
  ].filter(Boolean).join(" | ");

  return suffix ? `${base} (${suffix})` : base;
}

function readStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;

  const values = value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));

  return Array.from(new Set(values));
}

function readTextList(value: unknown) {
  if (typeof value === "string") {
    return uniqueStrings(value.split(/[\n,;]/g).map((item) => item.replace(/\s+/g, " ").trim().slice(0, 80)));
  }

  return Array.isArray(value)
    ? uniqueStrings(value.map((item) => readString(item)?.slice(0, 80) ?? null))
    : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(readString(value)))));
}

function readArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readHighlightLabel(metadata: JsonRecord) {
  return readString(
    metadata.highlight_label
      ?? metadata.highlightLabel
      ?? metadata.product_highlight_label
      ?? metadata.productHighlightLabel,
  );
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
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
