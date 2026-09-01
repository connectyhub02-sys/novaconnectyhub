import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrganizationSalesCatalogSettings,
  mapSalesCatalogItem,
} from "@/lib/client-os/sales-catalog";
import { isSalesCatalogDisplayableProduct, type ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";

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
}): Promise<SalesCatalogCheckoutOrderBump[]> {
  const configured = await loadConfiguredOrderBumps(input.client, input.organizationId);
  if (configured.length === 0) return [];

  const rows = await loadCatalogItems(input.client, input.organizationId, configured.map((item) => item.productId));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const excluded = new Set(input.excludeCatalogItemIds ?? []);

  return configured
    .map((config) => {
      const row = rowsById.get(config.productId);
      if (!row || excluded.has(row.id)) return null;

      const item = mapSalesCatalogItem(row);
      return toCheckoutOrderBump(item, config);
    })
    .filter((item): item is SalesCatalogCheckoutOrderBump => Boolean(item));
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
  const selectedProductIds = uniqueStrings(input.selectedProductIds).slice(0, 12);
  const [order, currentItems] = await Promise.all([
    loadOrder(input.client, input.organizationId, input.orderId),
    loadOrderItems(input.client, input.organizationId, input.orderId),
  ]);

  if (selectedProductIds.length === 0) {
    return {
      order,
      items: currentItems,
      appliedBumps: [],
      addedBumps: [],
      totalAmount: normalizeCurrencyAmount(order.total) ?? normalizeCurrencyAmount(order.subtotal),
    };
  }

  if (isClosedOrder(order)) {
    throw new Error("Este pedido ja foi finalizado. Solicite um novo checkout para adicionar ofertas.");
  }

  const applied = await loadValidatedOrderBumpItems({
    client: input.client,
    organizationId: input.organizationId,
    selectedProductIds,
  });
  const existingCatalogItemIds = new Set(currentItems.map((item) => item.catalog_item_id).filter(Boolean));
  const missing = applied.filter((entry) => !existingCatalogItemIds.has(entry.item.id));
  const insertedItems = missing.length > 0
    ? await insertOrderBumpItems({
        client: input.client,
        organizationId: input.organizationId,
        orderId: input.orderId,
        items: missing,
      })
    : [];
  const amountToAdd = roundMoney(missing.reduce((sum, entry) => sum + entry.config.price, 0));
  const nextOrder = amountToAdd > 0
    ? await updateOrderTotals({
        client: input.client,
        organizationId: input.organizationId,
        order,
        amountToAdd,
        selectedProductIds,
        addedProductIds: missing.map((entry) => entry.item.id),
      })
    : order;

  return {
    order: nextOrder,
    items: [...currentItems, ...insertedItems],
    appliedBumps: applied.map((entry) => entry.config),
    addedBumps: missing.map((entry) => entry.config),
    totalAmount: normalizeCurrencyAmount(nextOrder.total) ?? normalizeCurrencyAmount(nextOrder.subtotal),
  };
}

async function loadConfiguredOrderBumps(client: SupabaseClient, organizationId: string) {
  const settings = await getOrganizationSalesCatalogSettings(client, organizationId);
  if (!settings?.orderBumps.enabled) return [];

  return settings.orderBumps.items.filter((item) => item.active && item.productId);
}

async function loadValidatedOrderBumpItems(input: {
  client: SupabaseClient;
  organizationId: string;
  selectedProductIds: string[];
}): Promise<AppliedOrderBumpItem[]> {
  const configured = await loadConfiguredOrderBumps(input.client, input.organizationId);
  const configuredById = new Map(configured.map((item) => [item.productId, item]));
  const invalidSelection = input.selectedProductIds.find((productId) => !configuredById.has(productId));

  if (invalidSelection) {
    throw new Error("Uma das ofertas selecionadas nao esta disponivel neste checkout.");
  }

  const rows = await loadCatalogItems(input.client, input.organizationId, input.selectedProductIds);
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  return input.selectedProductIds.map((productId) => {
    const row = rowsById.get(productId);
    const config = configuredById.get(productId);
    if (!row || !config) {
      throw new Error("Uma das ofertas selecionadas nao foi encontrada.");
    }

    const item = mapSalesCatalogItem(row);
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

async function loadOrder(client: SupabaseClient, organizationId: string, orderId: string) {
  const { data, error } = await client
    .from("sales_catalog_orders")
    .select("id, organization_id, status, payment_status, subtotal, discount_total, shipping_total, shipping_method, total, metadata")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .maybeSingle<SalesCatalogOrderRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o pedido: ${error.message}`);
  }

  if (!data) {
    throw new Error("Pedido nao encontrado.");
  }

  return data;
}

async function loadOrderItems(client: SupabaseClient, organizationId: string, orderId: string) {
  const { data, error } = await client
    .from("sales_catalog_order_items")
    .select("id, catalog_item_id, sku_id, sku_code, title, quantity, unit_price, sale_price, total, fulfillment, metadata")
    .eq("order_id", orderId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Nao foi possivel carregar os itens do pedido: ${error.message}`);
  }

  return (data ?? []) as SalesCatalogCheckoutOrderItem[];
}

async function insertOrderBumpItems(input: {
  client: SupabaseClient;
  organizationId: string;
  orderId: string;
  items: AppliedOrderBumpItem[];
}) {
  const rows = input.items.map(({ config, item }) => ({
    order_id: input.orderId,
    organization_id: input.organizationId,
    catalog_item_id: item.id,
    sku_id: null,
    sku_code: null,
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

  const { data, error } = await input.client
    .from("sales_catalog_order_items")
    .insert(rows)
    .select("id, catalog_item_id, sku_id, sku_code, title, quantity, unit_price, sale_price, total, fulfillment, metadata");

  if (error) {
    throw new Error(`Nao foi possivel adicionar as ofertas ao pedido: ${error.message}`);
  }

  return (data ?? []) as SalesCatalogCheckoutOrderItem[];
}

async function updateOrderTotals(input: {
  client: SupabaseClient;
  organizationId: string;
  order: SalesCatalogOrderRow;
  amountToAdd: number;
  selectedProductIds: string[];
  addedProductIds: string[];
}) {
  const currentSubtotal = normalizeCurrencyAmount(input.order.subtotal)
    ?? normalizeCurrencyAmount(input.order.total)
    ?? 0;
  const currentTotal = normalizeCurrencyAmount(input.order.total)
    ?? currentSubtotal
      + (normalizeCurrencyAmount(input.order.shipping_total) ?? 0)
      - (normalizeCurrencyAmount(input.order.discount_total) ?? 0);
  const nextSubtotal = roundMoney(currentSubtotal + input.amountToAdd);
  const nextTotal = roundMoney(currentTotal + input.amountToAdd);
  const metadata = readRecord(input.order.metadata);
  const previousBumps = readStringList(metadata.order_bump_product_ids);
  const orderBumpProductIds = uniqueStrings([...previousBumps, ...input.selectedProductIds]);

  const { data, error } = await input.client
    .from("sales_catalog_orders")
    .update({
      subtotal: nextSubtotal,
      total: nextTotal,
      metadata: {
        ...metadata,
        order_bump_product_ids: orderBumpProductIds,
        order_bump_added_product_ids: uniqueStrings([
          ...readStringList(metadata.order_bump_added_product_ids),
          ...input.addedProductIds,
        ]),
        order_bump_total_added: roundMoney((normalizeCurrencyAmount(metadata.order_bump_total_added as string | number | null) ?? 0) + input.amountToAdd),
        order_bump_updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.order.id)
    .eq("organization_id", input.organizationId)
    .select("id, organization_id, status, payment_status, subtotal, discount_total, shipping_total, shipping_method, total, metadata")
    .single<SalesCatalogOrderRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel atualizar o total do pedido.");
  }

  return data;
}

function toCheckoutOrderBump(
  item: ClientSalesCatalogItem,
  config: { badge: string | null; title: string | null; description: string | null },
): SalesCatalogCheckoutOrderBump | null {
  const price = normalizeCurrencyAmount(item.price);
  if (
    !isSalesCatalogDisplayableProduct(item)
    || item.status !== "active"
    || item.salesDestination !== "connectyhub_checkout"
    || item.billingCycle !== "one_time"
    || !price
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

function isClosedOrder(order: SalesCatalogOrderRow) {
  return order.status === "paid"
    || order.status === "cancelled"
    || order.status === "refunded"
    || order.payment_status === "confirmed"
    || order.payment_status === "refunded";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
