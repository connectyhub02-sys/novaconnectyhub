import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attachSalesCatalogSkus,
  getOrganizationSalesCatalogSettings,
  mapSalesCatalogItem,
} from "@/lib/client-os/sales-catalog";
import { isSalesCatalogDisplayableProduct, type ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { canAddCommerceOfferDirectly, getCommerceOfferPrice, isEligibleCommerceOffer, matchesCommerceOfferConditions } from "./commerce-offers";

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

type SalesCatalogOrderRow = {
  id: string;
  organization_id: string;
  status: string | null;
  payment_status: string | null;
  subtotal: string | number | null;
  discount_total: string | number | null;
  destination_address: string | null;
  shipping_total: string | number | null;
  shipping_method: string | null;
  total: string | number | null;
  metadata: JsonRecord | null;
};

export type SalesCatalogCheckoutOrderItem = {
  id: string;
  catalog_item_id: string | null;
  sku_id?: string | null;
  sku_code: string | null;
  title: string;
  quantity: number | null;
  unit_price: string | number | null;
  sale_price: string | number | null;
  total: string | number | null;
  fulfillment?: unknown;
  metadata?: JsonRecord | null;
};

export type SalesCatalogCheckoutOrderBump = {
  productId: string;
  title: string;
  description: string | null;
  badge: string | null;
  price: number;
  priceLabel: string;
  mediaUrl: string | null;
};

type AppliedOrderBumpItem = {
  config: SalesCatalogCheckoutOrderBump;
  item: ClientSalesCatalogItem;
};

export async function loadSalesCatalogCheckoutOrderBumps(input: {
  client: SupabaseClient;
  organizationId: string;
  excludeCatalogItemIds?: string[];
  leadId?: string | null;
  selectedProductIds?: string[];
  subtotal?: number;
}): Promise<SalesCatalogCheckoutOrderBump[]> {
  const configured = await loadConfiguredOrderBumps(input.client, input.organizationId);
  if (configured.length === 0) return [];

  const rows = await loadCatalogItems(input.client, input.organizationId, configured.map((item) => item.productId));
  const products = await attachSalesCatalogSkus(input.client, rows.map(row => mapSalesCatalogItem(row)), { strict: true });
  const rowsById = new Map(products.map(item => [item.id, item]));
  const excluded = new Set(input.excludeCatalogItemIds ?? []);
  const currentProducts = (await loadCatalogItems(input.client, input.organizationId, [...excluded])).map(row => mapSalesCatalogItem(row));
  if (input.leadId) {
    const { data: decisions, error } = await input.client.from("lead_commerce_offer_states").select("catalog_item_id").eq("organization_id", input.organizationId).eq("lead_id", input.leadId).eq("status", "declined").gte("updated_at", new Date(Date.now() - 86400000).toISOString());
    if (error) return [];
    for (const decision of decisions ?? []) excluded.add(decision.catalog_item_id);
  }

  const settings = await getOrganizationSalesCatalogSettings(input.client, input.organizationId);
  const selected = new Set(input.selectedProductIds ?? []);
  for (const id of selected) excluded.delete(id);
  return configured
    .map((config) => {
      const row = rowsById.get(config.productId);
      if (!row || excluded.has(row.id) || !selected.has(row.id) && !matchesCommerceOfferConditions(config, currentProducts, input.subtotal)) return null;

      return toCheckoutOrderBump(row, config);
    })
    .filter((item): item is SalesCatalogCheckoutOrderBump => Boolean(item))
    .sort((a, b) => Number(selected.has(b.productId)) - Number(selected.has(a.productId)))
    .slice(0, Math.max(selected.size, settings?.orderBumps.maxOffersPerOrder ?? 1));
}

export async function applySalesCatalogCheckoutOrderBumps(input: {
  client: SupabaseClient;
  organizationId: string;
  orderId: string;
  selectedProductIds: string[];
}): Promise<{
  order: SalesCatalogOrderRow;
  items: SalesCatalogCheckoutOrderItem[];
  appliedBumps: SalesCatalogCheckoutOrderBump[];
  addedBumps: SalesCatalogCheckoutOrderBump[];
  totalAmount: number | null;
}> {
  const { setSalesCatalogCheckoutOrderBumps } = await import("./checkout-cart");
  return setSalesCatalogCheckoutOrderBumps(input);
}

async function loadConfiguredOrderBumps(client: SupabaseClient, organizationId: string) {
  const settings = await getOrganizationSalesCatalogSettings(client, organizationId);
  if (!settings?.orderBumps.enabled || !settings.orderBumps.checkoutEnabled || settings.orderBumps.webSurfaces && !settings.orderBumps.webSurfaces.includes("checkout")) return [];

  const configured = settings.orderBumps.items.filter((item) => item.active && item.productId);
  if (!settings.orderBumps.autoSuggestionsEnabled) return configured;
  const { data: rows } = await client.from("intelligence_memory").select("id, organization_id, title, content, metadata, created_at, updated_at").eq("organization_id", organizationId).eq("memory_type", "sales_catalog_item").order("updated_at", { ascending: false }).limit(100);
  return [...configured, ...(rows ?? []).map(row => mapSalesCatalogItem(row)).filter(item => isEligibleCommerceOffer(item) && !configured.some(config => config.productId === item.id)).map(item => ({ productId: item.id, active: true, badge: item.highlightLabel, title: null, description: null, triggerText: null }))];
}

export async function loadValidatedOrderBumpItems(input: {
  client: SupabaseClient;
  organizationId: string;
  selectedProductIds: string[];
  currentProductIds?: string[];
  subtotal?: number;
}): Promise<AppliedOrderBumpItem[]> {
  const configured = await loadConfiguredOrderBumps(input.client, input.organizationId);
  const currentProducts = (await loadCatalogItems(input.client, input.organizationId, input.currentProductIds ?? [])).map(row => mapSalesCatalogItem(row));
  const configuredById = new Map(configured.filter(config => matchesCommerceOfferConditions(config, currentProducts, input.subtotal)).map((item) => [item.productId, item]));
  const invalidSelection = input.selectedProductIds.find((productId) => !configuredById.has(productId));

  if (invalidSelection) {
    throw new Error("Uma das ofertas selecionadas nao esta disponivel neste checkout.");
  }

  const rows = await loadCatalogItems(input.client, input.organizationId, input.selectedProductIds);
  const products = await attachSalesCatalogSkus(input.client, rows.map(row => mapSalesCatalogItem(row)));
  const rowsById = new Map(products.map(item => [item.id, item]));

  return input.selectedProductIds.map((productId) => {
    const row = rowsById.get(productId);
    const config = configuredById.get(productId);
    if (!row || !config) {
      throw new Error("Uma das ofertas selecionadas nao foi encontrada.");
    }

    const item = row;
    const checkoutBump = toCheckoutOrderBump(item, config);
    if (!checkoutBump) {
      throw new Error(`${item.title} nao esta disponivel para Order Bump.`);
    }

    return { config: checkoutBump, item };
  });
}

async function loadCatalogItems(client: SupabaseClient, organizationId: string, productIds: string[]) {
  const ids = uniqueStrings(productIds);
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_item")
    .in("id", ids);

  if (error) {
    throw new Error(`Nao foi possivel carregar os produtos extras: ${error.message}`);
  }

  return (data ?? []) as SalesCatalogMemoryRow[];
}

export function buildCheckoutOrderBumpRows(items: AppliedOrderBumpItem[], organizationId: string, orderId: string) {
  return items.map(({ config, item }) => ({
    order_id: orderId,
    organization_id: organizationId,
    catalog_item_id: item.id,
    sku_id: item.skus.find(sku => sku.status === "active")?.id ?? null,
    sku_code: item.skus.find(sku => sku.status === "active")?.skuCode ?? null,
    title: item.title,
    tag: item.tag,
    quantity: 1,
    unit_price: config.price,
    sale_price: config.price,
    total: config.price,
    product_origin_type: item.productOriginType,
    commercial_flow_type: item.commercialFlowType,
    revenue_owner_type: item.revenueOwnerType,
    commission_eligible: item.commissionEligible,
    platform_product_id: item.platformProductId,
    attributes: item.attributes.map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      values: attribute.values,
    })),
    fulfillment: {
      mode: item.fulfillment.mode,
      scheduling_required: item.fulfillment.schedulingRequired,
      service_duration: item.fulfillment.serviceDuration,
      delivery_instructions: item.fulfillment.deliveryInstructions,
      access_instructions: item.fulfillment.accessInstructions,
    },
    metadata: {
      order_bump: true,
      order_bump_badge: config.badge,
      category: item.category,
      currency: item.currency,
      source: item.source,
      stock_status: item.inventory.status,
      billing_cycle: item.billingCycle,
      billing_interval: item.billingInterval,
      platform_product_id: item.platformProductId,
      platform_product_code: item.platformProductCode,
      commercial_flow_type: item.commercialFlowType,
      revenue_owner_type: item.revenueOwnerType,
      commission_policy_type: item.commissionPolicyType,
      commission_eligible: item.commissionEligible,
      platform_product_commission_percentage: item.platformProductCommissionPercentage,
      platform_product_commission_release_days: item.platformProductCommissionReleaseDays,
      platform_product_agent_prompt: item.platformProductAgentPrompt,
    },
  }));

}

function toCheckoutOrderBump(
  item: ClientSalesCatalogItem,
  config: { badge: string | null; title: string | null; description: string | null },
): SalesCatalogCheckoutOrderBump | null {
  const price = getCommerceOfferPrice(item);
  if (
    !isSalesCatalogDisplayableProduct(item)
    || !isEligibleCommerceOffer(item)
    || item.status !== "active"
    || item.salesDestination !== "connectyhub_checkout"
    || item.billingCycle !== "one_time"
    || !price
    || !canAddCommerceOfferDirectly(item)
    || item.inventory.status === "out_of_stock" && !item.inventory.allowBackorder
    || item.inventory.quantity !== null && item.inventory.quantity < 1 && !item.inventory.allowBackorder
  ) {
    return null;
  }

  return {
    productId: item.id,
    title: config.title || item.title,
    description: config.description || item.description || null,
    badge: config.badge || item.highlightLabel || null,
    price,
    priceLabel: formatCurrency(price),
    mediaUrl: item.media.find((media) => media.kind === "image")?.storageUrl ?? null,
  };
}


function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}




function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
