import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { recordPlatformProductCommissionsForApprovedPayment } from "@/lib/platform-product-sales";
import { buildSalesCatalogContent, type SalesCatalogProductInventory, type SalesCatalogStockStatus } from "@/lib/sales-catalog/shared";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { loadUazapiCredentials, type UazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";

type JsonRecord = Record<string, unknown>;

type OrderRow = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  conversation_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total: string | null;
  payment_method: string | null;
  metadata: JsonRecord | null;
};

type OrderItemRow = {
  id: string;
  organization_id: string | null;
  catalog_item_id: string | null;
  sku_id: string | null;
  sku_code: string | null;
  title: string;
  quantity: number | null;
};

type ProductRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type SkuRow = {
  id: string;
  catalog_item_id: string | null;
  sku_code: string | null;
  title: string | null;
  stock_status: string | null;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
  metadata: JsonRecord | null;
};

type ConversationRow = {
  id: string;
  whatsapp_instance_id: string | null;
  provider_chat_id: string | null;
};

type WhatsappInstanceRow = {
  id: string;
  organization_id: string;
  phone_number: string | null;
  display_name: string | null;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
};

type LeadRow = {
  id: string;
  phone_number: string | null;
  display_name: string | null;
};

export async function handleSalesCatalogApprovedPayment(input: {
  client: SupabaseClient;
  organizationId: string;
  orderId: string;
  paymentSessionId: string;
  providerPaymentId: string | null;
  paymentMethodLabel: string;
  source: "mercado_pago_webhook" | "checkout_card";
}) {
  const order = await loadOrder(input.client, input.organizationId, input.orderId);
  if (!order) {
    return { inventoryDeducted: false, whatsappNotified: false };
  }

  const items = await loadOrderItems(input.client, input.organizationId, input.orderId);
  const inventoryDeducted = await maybeDeductInventory({
    client: input.client,
    order,
    items,
    paymentSessionId: input.paymentSessionId,
    providerPaymentId: input.providerPaymentId,
    paymentMethodLabel: input.paymentMethodLabel,
    source: input.source,
  });
  const whatsappNotified = await maybeNotifyPaymentApproved({
    client: input.client,
    order,
    items,
    paymentSessionId: input.paymentSessionId,
    providerPaymentId: input.providerPaymentId,
    paymentMethodLabel: input.paymentMethodLabel,
    source: input.source,
  });
  const commissions = await recordPlatformProductCommissionsForApprovedPayment({
    client: input.client,
    organizationId: input.organizationId,
    orderId: input.orderId,
    paymentSessionId: input.paymentSessionId,
    providerPaymentId: input.providerPaymentId,
    paymentMethodLabel: input.paymentMethodLabel,
    source: input.source,
  });

  return { inventoryDeducted, whatsappNotified, commissions };
}

async function maybeDeductInventory(input: {
  client: SupabaseClient;
  order: OrderRow;
  items: OrderItemRow[];
  paymentSessionId: string;
  providerPaymentId: string | null;
  paymentMethodLabel: string;
  source: string;
}) {
  const orderMetadata = readRecord(input.order.metadata);
  if (readString(orderMetadata.inventory_deducted_at)) return false;

  const skuQuantities = new Map<string, number>();
  const productQuantities = new Map<string, number>();

  for (const item of input.items) {
    const quantity = normalizeQuantity(item.quantity);
    if (item.sku_id) {
      skuQuantities.set(item.sku_id, (skuQuantities.get(item.sku_id) ?? 0) + quantity);
    } else if (item.catalog_item_id) {
      productQuantities.set(item.catalog_item_id, (productQuantities.get(item.catalog_item_id) ?? 0) + quantity);
    }
  }

  const now = new Date().toISOString();
  const deductions: JsonRecord[] = [];

  if (skuQuantities.size > 0) {
    const { data } = await input.client
      .from("sales_catalog_skus")
      .select("id, catalog_item_id, sku_code, title, stock_status, stock_quantity, low_stock_threshold, metadata")
      .eq("organization_id", input.order.organization_id)
      .in("id", Array.from(skuQuantities.keys()));

    for (const sku of (data ?? []) as SkuRow[]) {
      const quantity = skuQuantities.get(sku.id);
      if (!quantity || sku.stock_quantity === null) continue;

      const nextQuantity = Math.max(0, sku.stock_quantity - quantity);
      const nextStatus = resolveNextStockStatus(nextQuantity, sku.stock_status);

      await input.client
        .from("sales_catalog_skus")
        .update({
          stock_quantity: nextQuantity,
          stock_status: nextStatus,
          metadata: {
            ...readRecord(sku.metadata),
            inventory_updated_at: now,
            inventory_updated_from_order_id: input.order.id,
            inventory_update_reason: "payment_approved",
          },
        })
        .eq("id", sku.id)
        .eq("organization_id", input.order.organization_id);

      deductions.push({
        kind: "sku",
        sku_id: sku.id,
        catalog_item_id: sku.catalog_item_id,
        sku_code: sku.sku_code,
        title: sku.title,
        deducted_quantity: quantity,
        previous_quantity: sku.stock_quantity,
        next_quantity: nextQuantity,
        next_status: nextStatus,
      });
    }
  }

  if (productQuantities.size > 0) {
    const { data } = await input.client
      .from("intelligence_memory")
      .select("id, organization_id, title, content, metadata, created_at, updated_at")
      .eq("scope", "organization")
      .eq("organization_id", input.order.organization_id)
      .eq("memory_type", "sales_catalog_item")
      .in("id", Array.from(productQuantities.keys()));

    for (const product of (data ?? []) as ProductRow[]) {
      const quantity = productQuantities.get(product.id);
      if (!quantity) continue;

      const metadata = readRecord(product.metadata);
      const inventory = readProductInventory(metadata.inventory);
      if (inventory.quantity === null) continue;

      const nextQuantity = Math.max(0, inventory.quantity - quantity);
      const nextInventory: SalesCatalogProductInventory = {
        ...inventory,
        quantity: nextQuantity,
        status: nextQuantity <= 0 ? (inventory.allowBackorder ? "on_backorder" : "out_of_stock") : "in_stock",
      };
      const nextMetadata = {
        ...metadata,
        inventory: serializeProductInventory(nextInventory),
        inventory_updated_at: now,
        inventory_updated_from_order_id: input.order.id,
        inventory_update_reason: "payment_approved",
      };
      const item = mapSalesCatalogItem({ ...product, metadata: nextMetadata });

      await input.client
        .from("intelligence_memory")
        .update({
          content: buildSalesCatalogContent({
            title: item.title,
            description: item.description,
            category: item.category,
            price: item.price,
            currency: item.currency,
            media: item.media,
            attributes: item.attributes,
            inventory: item.inventory,
            offer: item.offer,
            fulfillment: item.fulfillment,
            shipping: item.shipping,
          }),
          metadata: nextMetadata,
          updated_at: now,
        })
        .eq("id", product.id)
        .eq("scope", "organization")
        .eq("organization_id", input.order.organization_id)
        .eq("memory_type", "sales_catalog_item");

      deductions.push({
        kind: "product",
        product_id: product.id,
        title: product.title,
        deducted_quantity: quantity,
        previous_quantity: inventory.quantity,
        next_quantity: nextQuantity,
        next_status: nextInventory.status,
      });
    }
  }

  if (deductions.length === 0) return false;

  await input.client
    .from("sales_catalog_orders")
    .update({
      metadata: {
        ...orderMetadata,
        inventory_deducted_at: now,
        inventory_deducted_by: "payment_gateway",
        inventory_deducted_source: input.source,
        inventory_deducted_payment_session_id: input.paymentSessionId,
        inventory_deducted_provider_payment_id: input.providerPaymentId,
        inventory_deducted_items: deductions,
      },
    })
    .eq("id", input.order.id)
    .eq("organization_id", input.order.organization_id);

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.order.organization_id,
    source_type: "sales_catalog_order",
    source_id: input.order.id,
    event_type: "sales_catalog.inventory_deducted",
    title: "Estoque baixado apos pagamento aprovado",
    summary: `${deductions.length} item(ns) atualizado(s) apos confirmacao do pagamento.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "sales_catalog_inventory", "payment_gateway"],
    payload: {
      order_id: input.order.id,
      payment_session_id: input.paymentSessionId,
      provider_payment_id: input.providerPaymentId,
      payment_method: input.paymentMethodLabel,
      items: deductions,
    },
  });

  return true;
}

async function maybeNotifyPaymentApproved(input: {
  client: SupabaseClient;
  order: OrderRow;
  items: OrderItemRow[];
  paymentSessionId: string;
  providerPaymentId: string | null;
  paymentMethodLabel: string;
  source: string;
}) {
  const orderMetadata = readRecord(input.order.metadata);
  if (readString(orderMetadata.payment_whatsapp_notified_at)) return false;
  if (!input.order.conversation_id) return false;

  const { data: conversation } = await input.client
    .from("conversations")
    .select("id, whatsapp_instance_id, provider_chat_id")
    .eq("id", input.order.conversation_id)
    .eq("organization_id", input.order.organization_id)
    .maybeSingle<ConversationRow>();

  if (!conversation?.whatsapp_instance_id) return false;

  const [{ data: instance }, { data: lead }] = await Promise.all([
    input.client
      .from("whatsapp_instances")
      .select("id, organization_id, phone_number, display_name, instance_token_encrypted, metadata")
      .eq("id", conversation.whatsapp_instance_id)
      .eq("organization_id", input.order.organization_id)
      .maybeSingle<WhatsappInstanceRow>(),
    input.order.lead_id
      ? input.client
          .from("leads")
          .select("id, phone_number, display_name")
          .eq("id", input.order.lead_id)
          .eq("organization_id", input.order.organization_id)
          .maybeSingle<LeadRow>()
      : Promise.resolve({ data: null }),
  ]);

  const token = instance?.instance_token_encrypted ? decryptCredentialValue(instance.instance_token_encrypted) : null;
  const phone = lead?.phone_number ?? input.order.customer_phone;
  if (!instance || !token || !phone) return false;

  const text = buildPaymentApprovedMessage(input.order, input.items, input.paymentMethodLabel);
  const credentials = await loadUazapiCredentials(input.client);
  const providerResponse = await callUazapi(credentials, "/send/text", {
    method: "POST",
    token,
    body: {
      number: phone,
      text,
      linkPreview: false,
      readchat: true,
      readmessages: true,
      track_source: "connectyhub",
      track_id: `sales_catalog_paid_${input.order.id.slice(0, 8)}_${Date.now()}`,
    },
  });
  const now = new Date().toISOString();
  const { data: latestOrder } = await input.client
    .from("sales_catalog_orders")
    .select("metadata")
    .eq("id", input.order.id)
    .eq("organization_id", input.order.organization_id)
    .maybeSingle<{ metadata: JsonRecord | null }>();
  const latestMetadata = readRecord(latestOrder?.metadata);

  await input.client.from("conversation_messages").insert({
    organization_id: input.order.organization_id,
    conversation_id: input.order.conversation_id,
    lead_id: input.order.lead_id,
    whatsapp_instance_id: instance.id,
    provider: "uazapi",
    provider_message_id: findProviderMessageId(providerResponse),
    provider_chat_id: conversation.provider_chat_id,
    direction: "outbound",
    message_type: "text",
    text_content: text,
    payload: {
      delivery_source: "sales_catalog_payment_confirmation",
      provider_response: sanitizeProviderData(providerResponse),
      payment_session_id: input.paymentSessionId,
      provider_payment_id: input.providerPaymentId,
      payment_method: input.paymentMethodLabel,
    },
    occurred_at: now,
  });

  await Promise.all([
    input.client
      .from("conversations")
      .update({
        status: "waiting_customer",
        last_message_preview: preview(text, 240),
        last_message_at: now,
      })
      .eq("id", input.order.conversation_id)
      .eq("organization_id", input.order.organization_id),
    input.order.lead_id
      ? input.client
          .from("leads")
          .update({
            last_event_summary: preview(text, 240),
            last_message_at: now,
          })
          .eq("id", input.order.lead_id)
          .eq("organization_id", input.order.organization_id)
      : Promise.resolve(),
    input.client
      .from("sales_catalog_orders")
      .update({
        metadata: {
          ...latestMetadata,
          payment_whatsapp_notified_at: now,
          payment_whatsapp_notified_session_id: input.paymentSessionId,
          payment_whatsapp_notified_provider_payment_id: input.providerPaymentId,
        },
      })
      .eq("id", input.order.id)
      .eq("organization_id", input.order.organization_id),
  ]);

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.order.organization_id,
    source_type: "sales_catalog_order",
    source_id: input.order.id,
    event_type: "sales_catalog.payment_confirmation_sent",
    title: "Confirmacao de pagamento enviada no WhatsApp",
    summary: preview(text, 500),
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "payment", "whatsapp"],
    payload: {
      order_id: input.order.id,
      payment_session_id: input.paymentSessionId,
      provider_payment_id: input.providerPaymentId,
      source: input.source,
    },
  });

  return true;
}

function buildPaymentApprovedMessage(order: OrderRow, items: OrderItemRow[], paymentMethod: string) {
  const itemSummary = items.length > 0
    ? items.slice(0, 3).map((item) => {
        const quantity = normalizeQuantity(item.quantity);
        const sku = item.sku_code ? ` (${item.sku_code})` : "";
        return `${quantity}x ${item.title}${sku}`;
      }).join(", ")
    : "seu pedido";
  const total = order.total ? ` Total: ${order.total}.` : "";

  return [
    "Pagamento confirmado",
    `Recebemos o pagamento via ${paymentMethod} para ${itemSummary}.${total}`,
    "Vou acompanhar a separacao do pedido e te aviso por aqui no WhatsApp.",
  ].join("\n");
}

async function loadOrder(client: SupabaseClient, organizationId: string, orderId: string) {
  const { data } = await client
    .from("sales_catalog_orders")
    .select("id, organization_id, lead_id, conversation_id, customer_name, customer_phone, total, payment_method, metadata")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .maybeSingle<OrderRow>();

  return data ?? null;
}

async function loadOrderItems(client: SupabaseClient, organizationId: string, orderId: string) {
  const { data } = await client
    .from("sales_catalog_order_items")
    .select("id, organization_id, catalog_item_id, sku_id, sku_code, title, quantity")
    .eq("order_id", orderId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return (data ?? []) as OrderItemRow[];
}

function readProductInventory(value: unknown): SalesCatalogProductInventory {
  const record = readRecord(value);
  return {
    status: normalizeStockStatus(readString(record.status)),
    quantity: readNumber(record.quantity),
    lowStockThreshold: readNumber(record.low_stock_threshold ?? record.lowStockThreshold),
    allowBackorder: readBoolean(record.allow_backorder ?? record.allowBackorder) ?? false,
    notes: readString(record.notes),
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

function resolveNextStockStatus(nextQuantity: number, currentStatus: string | null): SalesCatalogStockStatus {
  if (nextQuantity > 0) return "in_stock";
  return currentStatus === "on_backorder" ? "on_backorder" : "out_of_stock";
}

async function callUazapi(
  credentials: UazapiCredentials,
  path: string,
  options: { method: "POST"; body: unknown; token: string },
) {
  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: options.token,
    },
    body: JSON.stringify(options.body),
    cache: "no-store",
  });

  const text = await response.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function findProviderMessageId(value: unknown) {
  return findString(value, ["messageId", "message_id", "id"]);
}

function findString(value: unknown, keys: string[]): string | null {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0);
  return typeof found === "string" ? found.trim() : null;
}

function findValue(value: unknown, predicate: (key: string, value: unknown) => boolean): unknown {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, predicate);
      if (found) return found;
    }
    return null;
  }

  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (predicate(key, item)) return item;

    const found = findValue(item, predicate);
    if (found) return found;
  }

  return null;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function normalizeStockStatus(value: string | null): SalesCatalogStockStatus {
  if (value === "out_of_stock" || value === "on_backorder") return value;
  return "in_stock";
}

function normalizeQuantity(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(Math.round(value), 100000) : 1;
}

function preview(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function sanitizeProviderData(value: unknown): unknown {
  try {
    const text = JSON.stringify(value);
    return text.length > 3000 ? { truncated: true, preview: text.slice(0, 3000) } : value;
  } catch {
    return null;
  }
}
