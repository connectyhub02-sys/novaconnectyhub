import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";

type JsonRecord = Record<string, unknown>;

type OrderItemRow = {
  id: string;
  order_id: string;
  organization_id: string | null;
  catalog_item_id: string | null;
  sku_id: string | null;
  sku_code: string | null;
  title: string;
  quantity: number | null;
  unit_price: string | null;
  sale_price: string | null;
  total: string | null;
  metadata: JsonRecord | null;
};

type CatalogItemRow = {
  id: string;
  metadata: JsonRecord | null;
};

type PlatformProductSalesRow = {
  id: string;
  product_code: string;
  name: string;
  commission_percentage: string | number | null;
  commission_base: string | null;
  commission_release_days: string | number | null;
  recurring_commission_months: string | number | null;
  refund_window_days: string | number | null;
};

type PlatformProductImportRow = {
  id: string;
  platform_product_id: string;
  organization_id: string;
  local_catalog_item_id: string | null;
};

type ExistingCommissionRow = {
  id: string;
  order_item_id: string | null;
  status: string | null;
};

type PlatformOrderItem = {
  item: OrderItemRow;
  platformProductId: string;
  catalogMetadata: JsonRecord;
};

export type SalesCatalogPaymentOwner =
  | { owner: "seller"; platformProductIds: string[]; catalogItemIds: string[] }
  | { owner: "connectyhub"; platformProductIds: string[]; catalogItemIds: string[] };

export async function resolveSalesCatalogOrderPaymentOwner(input: {
  client: SupabaseClient;
  organizationId: string;
  orderId: string;
}): Promise<SalesCatalogPaymentOwner> {
  const items = await loadOrderItems(input.client, input.organizationId, input.orderId);
  const platformItems = await findPlatformOrderItems(input.client, items);

  if (platformItems.length === 0) {
    return { owner: "seller", platformProductIds: [], catalogItemIds: [] };
  }

  const platformOrderItemIds = new Set(platformItems.map((entry) => entry.item.id));
  const nonPlatformItems = items.filter((item) => !platformOrderItemIds.has(item.id));

  if (nonPlatformItems.length > 0) {
    throw new Error("Nao misture produtos proprios e produtos ConnectyHub no mesmo checkout. Crie pedidos separados para garantir o recebimento correto.");
  }

  return {
    owner: "connectyhub",
    platformProductIds: uniqueStrings(platformItems.map((entry) => entry.platformProductId)),
    catalogItemIds: uniqueStrings(platformItems.map((entry) => entry.item.catalog_item_id)),
  };
}

export async function recordPlatformProductCommissionsForApprovedPayment(input: {
  client: SupabaseClient;
  organizationId: string;
  orderId: string;
  paymentSessionId: string;
  providerPaymentId: string | null;
  paymentMethodLabel: string;
  source: string;
}) {
  const items = await loadOrderItems(input.client, input.organizationId, input.orderId);
  const platformItems = await findPlatformOrderItems(input.client, items);

  if (platformItems.length === 0) {
    return {
      created: 0,
      updated: 0,
      totalCommission: 0,
      totalSaleAmount: 0,
      items: [] as JsonRecord[],
    };
  }

  const productIds = uniqueStrings(platformItems.map((entry) => entry.platformProductId));
  const [productsById, importsByProductId, existingByOrderItemId] = await Promise.all([
    loadPlatformProducts(input.client, productIds),
    loadPlatformProductImports(input.client, input.organizationId, productIds),
    loadExistingCommissions(input.client, input.paymentSessionId, platformItems.map((entry) => entry.item.id)),
  ]);
  const now = new Date();
  const nowIso = now.toISOString();
  let created = 0;
  let updated = 0;
  let totalCommission = 0;
  let totalSaleAmount = 0;
  const recordedItems: JsonRecord[] = [];

  for (const entry of platformItems) {
    const product = productsById.get(entry.platformProductId);
    const importRecord = importsByProductId.get(entry.platformProductId);
    const quantity = normalizeQuantity(entry.item.quantity);
    const saleAmount = resolveOrderItemSaleAmount(entry.item);

    if (!saleAmount || saleAmount <= 0) continue;

    const commissionPercentage = clampPercentage(
      readNumber(product?.commission_percentage)
        ?? readNumber(entry.catalogMetadata.platform_product_commission_percentage),
    );
    const releaseDays = Math.max(0, toInteger(
      product?.commission_release_days ?? entry.catalogMetadata.platform_product_commission_release_days,
      15,
    ));
    const commissionAmount = roundMoney((saleAmount * commissionPercentage) / 100);
    const releaseAt = new Date(now.getTime() + releaseDays * 24 * 60 * 60 * 1000).toISOString();
    const commissionStatus = releaseDays === 0 ? "available" : "pending";
    const existing = existingByOrderItemId.get(entry.item.id);
    const payload = {
      platform_product_id: entry.platformProductId,
      import_id: importRecord?.id ?? null,
      organization_id: input.organizationId,
      order_id: input.orderId,
      order_item_id: entry.item.id,
      payment_session_id: input.paymentSessionId,
      status: commissionStatus,
      sale_amount: saleAmount,
      sale_quantity: quantity,
      commission_percentage: commissionPercentage,
      commission_amount: commissionAmount,
      release_at: releaseAt,
      metadata: {
        source: input.source,
        payment_method: input.paymentMethodLabel,
        provider_payment_id: input.providerPaymentId,
        product_code: product?.product_code ?? readString(entry.catalogMetadata.platform_product_code),
        product_name: product?.name ?? entry.item.title,
        order_item_title: entry.item.title,
        order_item_sku_code: entry.item.sku_code,
        commission_base: product?.commission_base ?? "gross",
        recurring_commission_months: toInteger(product?.recurring_commission_months, 0),
        refund_window_days: toInteger(product?.refund_window_days, 7),
        recorded_at: nowIso,
      },
      updated_at: nowIso,
    };

    if (existing?.id) {
      if (existing.status === "paid") continue;

      const { error } = await input.client
        .from("platform_product_commissions")
        .update(payload)
        .eq("id", existing.id)
        .neq("status", "paid");

      if (!error) updated += 1;
    } else {
      const { error } = await input.client
        .from("platform_product_commissions")
        .insert({ ...payload, created_at: nowIso });

      if (!error) created += 1;
    }

    totalCommission = roundMoney(totalCommission + commissionAmount);
    totalSaleAmount = roundMoney(totalSaleAmount + saleAmount);
    recordedItems.push({
      order_item_id: entry.item.id,
      platform_product_id: entry.platformProductId,
      product_code: product?.product_code ?? readString(entry.catalogMetadata.platform_product_code),
      sale_amount: saleAmount,
      commission_percentage: commissionPercentage,
      commission_amount: commissionAmount,
      release_at: releaseAt,
    });
  }

  if (created > 0 || updated > 0) {
    await input.client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: input.organizationId,
      source_type: "sales_catalog_order",
      source_id: input.orderId,
      event_type: "platform_product.commission_recorded",
      title: "Comissao ConnectyHub registrada",
      summary: `${created + updated} comissao(oes) registradas para repasse.`,
      confidence: 1,
      visibility: "organization",
      tags: ["platform_product", "connectyhub_marketplace", "commission", "payment"],
      payload: {
        order_id: input.orderId,
        payment_session_id: input.paymentSessionId,
        provider_payment_id: input.providerPaymentId,
        total_sale_amount: totalSaleAmount,
        total_commission: totalCommission,
        items: recordedItems,
      },
    });
  }

  return { created, updated, totalCommission, totalSaleAmount, items: recordedItems };
}

export async function markPlatformProductCommissionsForPaymentStatus(input: {
  client: SupabaseClient;
  organizationId: string;
  paymentSessionId: string;
  status: "created" | "pending" | "approved" | "rejected" | "cancelled" | "expired" | "refunded" | "error";
  providerPaymentId: string | null;
}) {
  const commissionStatus = resolveCommissionStatusFromPayment(input.status);
  if (!commissionStatus) return { updated: 0 };

  const { data, error } = await input.client
    .from("platform_product_commissions")
    .update({
      status: commissionStatus,
      metadata: {
        payment_status: input.status,
        provider_payment_id: input.providerPaymentId,
        status_updated_from: "payment_gateway",
        status_updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId)
    .eq("payment_session_id", input.paymentSessionId)
    .in("status", ["pending", "available"])
    .select("id");

  if (error) return { updated: 0 };
  return { updated: (data ?? []).length };
}

async function loadOrderItems(client: SupabaseClient, organizationId: string, orderId: string) {
  const { data, error } = await client
    .from("sales_catalog_order_items")
    .select("id, order_id, organization_id, catalog_item_id, sku_id, sku_code, title, quantity, unit_price, sale_price, total, metadata")
    .eq("order_id", orderId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Nao foi possivel carregar os itens do pedido: ${error.message}`);
  }

  return (data ?? []) as unknown as OrderItemRow[];
}

async function findPlatformOrderItems(client: SupabaseClient, items: OrderItemRow[]) {
  const catalogItemIds = uniqueStrings(items.map((item) => item.catalog_item_id));
  if (catalogItemIds.length === 0) return [] as PlatformOrderItem[];

  const { data } = await client
    .from("intelligence_memory")
    .select("id, metadata")
    .eq("scope", "organization")
    .eq("memory_type", "sales_catalog_item")
    .in("id", catalogItemIds);
  const catalogById = new Map<string, CatalogItemRow>();

  for (const row of (data ?? []) as unknown as CatalogItemRow[]) {
    catalogById.set(row.id, row);
  }

  return items
    .map((item): PlatformOrderItem | null => {
      if (!item.catalog_item_id) return null;
      const catalogItem = catalogById.get(item.catalog_item_id);
      const catalogMetadata = readRecord(catalogItem?.metadata);
      const itemMetadata = readRecord(item.metadata);
      const platformProductId = readString(itemMetadata.platform_product_id)
        ?? readString(catalogMetadata.platform_product_id);

      if (!platformProductId) return null;

      return { item, platformProductId, catalogMetadata };
    })
    .filter((item): item is PlatformOrderItem => Boolean(item));
}

async function loadPlatformProducts(client: SupabaseClient, productIds: string[]) {
  const productsById = new Map<string, PlatformProductSalesRow>();
  if (productIds.length === 0) return productsById;

  const { data } = await client
    .from("platform_products")
    .select("id, product_code, name, commission_percentage, commission_base, commission_release_days, recurring_commission_months, refund_window_days")
    .in("id", productIds);

  for (const row of (data ?? []) as unknown as PlatformProductSalesRow[]) {
    productsById.set(row.id, row);
  }

  return productsById;
}

async function loadPlatformProductImports(client: SupabaseClient, organizationId: string, productIds: string[]) {
  const importsByProductId = new Map<string, PlatformProductImportRow>();
  if (productIds.length === 0) return importsByProductId;

  const { data } = await client
    .from("platform_product_imports")
    .select("id, platform_product_id, organization_id, local_catalog_item_id")
    .eq("organization_id", organizationId)
    .in("platform_product_id", productIds);

  for (const row of (data ?? []) as unknown as PlatformProductImportRow[]) {
    importsByProductId.set(row.platform_product_id, row);
  }

  return importsByProductId;
}

async function loadExistingCommissions(client: SupabaseClient, paymentSessionId: string, orderItemIds: string[]) {
  const existingByOrderItemId = new Map<string, ExistingCommissionRow>();
  const ids = uniqueStrings(orderItemIds);
  if (ids.length === 0) return existingByOrderItemId;

  const { data } = await client
    .from("platform_product_commissions")
    .select("id, order_item_id, status")
    .eq("payment_session_id", paymentSessionId)
    .in("order_item_id", ids);

  for (const row of (data ?? []) as unknown as ExistingCommissionRow[]) {
    if (row.order_item_id) existingByOrderItemId.set(row.order_item_id, row);
  }

  return existingByOrderItemId;
}

function resolveOrderItemSaleAmount(item: OrderItemRow) {
  const total = normalizeCurrencyAmount(item.total);
  if (total) return total;

  const unit = normalizeCurrencyAmount(item.sale_price) ?? normalizeCurrencyAmount(item.unit_price);
  if (!unit) return null;

  return roundMoney(unit * normalizeQuantity(item.quantity));
}

function resolveCommissionStatusFromPayment(status: string) {
  if (status === "refunded") return "refunded";
  if (status === "rejected" || status === "cancelled" || status === "expired" || status === "error") {
    return "cancelled";
  }

  return null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function normalizeQuantity(value: number | null | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
}

function clampPercentage(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function toInteger(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
