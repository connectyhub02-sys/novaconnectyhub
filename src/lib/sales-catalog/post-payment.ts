import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import {
  readAgentResponsibleHuman,
  readFirstResponsibleWhatsappPhone,
} from "@/lib/agents/responsible-human";
import { recordPlatformProductCommissionsForApprovedPayment } from "@/lib/platform-product-sales";
import {
  buildSalesCatalogContent,
  createDefaultSalesCatalogCommerceSettings,
  type SalesCatalogProductInventory,
  type SalesCatalogStockStatus,
} from "@/lib/sales-catalog/shared";
import { getOrganizationSalesCatalogSettings, mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
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

type ResponsibleAgentRow = {
  id: string;
  name: string;
  persona_name: string | null;
  metadata: JsonRecord | null;
};

type SalesCatalogPaymentStatus = "created" | "pending" | "approved" | "rejected" | "cancelled" | "expired" | "refunded" | "error";
type SalesCatalogPostPaymentSource = "mercado_pago_webhook" | "pagbank_webhook" | "checkout_card";
type SalesCatalogPaymentNotificationStatus = "pending" | "rejected" | "cancelled" | "expired" | "refunded" | "error";

export async function handleSalesCatalogPaymentStatusChange(input: {
  client: SupabaseClient;
  organizationId: string;
  orderId: string;
  paymentSessionId: string;
  providerPaymentId: string | null;
  paymentMethodLabel: string;
  status: SalesCatalogPaymentStatus;
  source: SalesCatalogPostPaymentSource;
}) {
  if (input.status === "approved") {
    return handleSalesCatalogApprovedPayment(input);
  }

  const notificationStatus = normalizePaymentNotificationStatus(input.status);
  const order = await loadOrder(input.client, input.organizationId, input.orderId);

  if (!order || !notificationStatus) {
    return { inventoryDeducted: false, whatsappNotified: false, responsibleNotified: false, commissions: null };
  }

  const items = await loadOrderItems(input.client, input.organizationId, input.orderId);
  const whatsappNotified = await maybeNotifyPaymentStatus({
    client: input.client,
    order,
    items,
    paymentSessionId: input.paymentSessionId,
    providerPaymentId: input.providerPaymentId,
    paymentMethodLabel: input.paymentMethodLabel,
    status: notificationStatus,
    source: input.source,
  });
  const responsibleNotified = await maybeNotifyResponsiblePaymentStatus({
    client: input.client,
    order,
    items,
    paymentSessionId: input.paymentSessionId,
    providerPaymentId: input.providerPaymentId,
    paymentMethodLabel: input.paymentMethodLabel,
    status: notificationStatus,
    source: input.source,
  });

  return { inventoryDeducted: false, whatsappNotified, responsibleNotified, commissions: null };
}

export async function handleSalesCatalogApprovedPayment(input: {
  client: SupabaseClient;
  organizationId: string;
  orderId: string;
  paymentSessionId: string;
  providerPaymentId: string | null;
  paymentMethodLabel: string;
  source: SalesCatalogPostPaymentSource;
}) {
  const order = await loadOrder(input.client, input.organizationId, input.orderId);
  if (!order) {
    return { inventoryDeducted: false, whatsappNotified: false, responsibleNotified: false };
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
  const responsibleNotified = await maybeNotifyResponsiblePaymentApproved({
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

  return { inventoryDeducted, whatsappNotified, responsibleNotified, commissions };
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
  const settings = await getOrganizationSalesCatalogSettings(input.client, input.order.organization_id).catch(() => null);
  const automation = settings?.automationSettings ?? createDefaultSalesCatalogCommerceSettings().automationSettings;

  if (!automation.paymentStatusNotifications) return false;

  const conversation = input.order.conversation_id && automation.useConversationWhatsappFirst
    ? await loadOrderConversation(input.client, input.order)
    : null;
  const whatsappInstanceId = conversation?.whatsapp_instance_id ?? automation.defaultWhatsappInstanceId;

  if (!whatsappInstanceId) return false;

  const [{ data: instance }, { data: lead }] = await Promise.all([
    input.client
      .from("whatsapp_instances")
      .select("id, organization_id, phone_number, display_name, instance_token_encrypted, metadata")
      .eq("id", whatsappInstanceId)
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

  const text = buildPaymentApprovedMessage({
    order: input.order,
    items: input.items,
    paymentMethod: input.paymentMethodLabel,
    template: settings?.messageTemplates.paymentConfirmed ?? null,
  });
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

  if (conversation && input.order.conversation_id) {
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
        author_type: "system",
        author_label: "Sistema",
        author_source: "sales_catalog_payment_confirmation",
        origin_channel: "whatsapp",
        origin_confidence: "high",
        origin_device: null,
        origin_source: "connectyhub_payment_system",
        message_origin: {
          channel: "whatsapp",
          confidence: "high",
          device: null,
          source: "connectyhub_payment_system",
        },
        provider_response: sanitizeProviderData(providerResponse),
        payment_session_id: input.paymentSessionId,
        provider_payment_id: input.providerPaymentId,
        payment_method: input.paymentMethodLabel,
      },
      occurred_at: now,
    });
  }

  await Promise.all([
    conversation && input.order.conversation_id
      ? input.client
          .from("conversations")
          .update({
            status: "waiting_customer",
            last_message_preview: preview(text, 240),
            last_message_at: now,
          })
          .eq("id", input.order.conversation_id)
          .eq("organization_id", input.order.organization_id)
      : Promise.resolve(),
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
          payment_whatsapp_notified_instance_id: instance.id,
          payment_whatsapp_notified_source: conversation ? "conversation_whatsapp" : "automation_default_whatsapp",
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
    tags: ["sales_catalog", "sales_catalog_order", "payment", "whatsapp", "lead_tracking"],
    payload: {
      order_id: input.order.id,
      lead_id: input.order.lead_id,
      lead_phone: input.order.customer_phone,
      payment_session_id: input.paymentSessionId,
      provider_payment_id: input.providerPaymentId,
      whatsapp_instance_id: instance.id,
      conversation_id: input.order.conversation_id,
      items: summarizePaymentConfirmationItems(input.items),
      delivery_source: conversation ? "conversation_whatsapp" : "automation_default_whatsapp",
      source: input.source,
    },
  });

  return true;
}

async function maybeNotifyResponsiblePaymentApproved(input: {
  client: SupabaseClient;
  order: OrderRow;
  items: OrderItemRow[];
  paymentSessionId: string;
  providerPaymentId: string | null;
  paymentMethodLabel: string;
  source: string;
}) {
  const orderMetadata = readRecord(input.order.metadata);
  if (readString(orderMetadata.payment_responsible_whatsapp_notified_at)) return false;

  const settings = await getOrganizationSalesCatalogSettings(input.client, input.order.organization_id).catch(() => null);
  const automation = settings?.automationSettings ?? createDefaultSalesCatalogCommerceSettings().automationSettings;
  const conversation = input.order.conversation_id ? await loadOrderConversation(input.client, input.order) : null;
  const whatsappInstanceId = conversation?.whatsapp_instance_id ?? automation.defaultWhatsappInstanceId;

  if (!whatsappInstanceId) return false;

  const { data: instance } = await input.client
    .from("whatsapp_instances")
    .select("id, organization_id, phone_number, display_name, instance_token_encrypted, metadata")
    .eq("id", whatsappInstanceId)
    .eq("organization_id", input.order.organization_id)
    .maybeSingle<WhatsappInstanceRow>();

  const token = instance?.instance_token_encrypted ? decryptCredentialValue(instance.instance_token_encrypted) : null;
  if (!instance || !token) return false;

  const agent = await loadResponsiblePaymentAgent(input.client, input.order, instance);
  const responsiblePhone = resolveResponsiblePaymentPhone(agent, "approved");
  if (!responsiblePhone) return false;

  const text = buildResponsiblePaymentApprovedMessage({
    order: input.order,
    items: input.items,
    paymentMethod: input.paymentMethodLabel,
    agent,
  });
  const credentials = await loadUazapiCredentials(input.client);
  const providerResponse = await callUazapi(credentials, "/send/text", {
    method: "POST",
    token,
    body: {
      number: responsiblePhone,
      text,
      linkPreview: false,
      readchat: true,
      readmessages: true,
      track_source: "connectyhub",
      track_id: `sales_catalog_responsible_${input.order.id.slice(0, 8)}_${Date.now()}`,
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

  await input.client
    .from("sales_catalog_orders")
    .update({
      metadata: {
        ...latestMetadata,
        payment_responsible_whatsapp_notified_at: now,
        payment_responsible_whatsapp_notified_session_id: input.paymentSessionId,
        payment_responsible_whatsapp_notified_provider_payment_id: input.providerPaymentId,
        payment_responsible_whatsapp_notified_instance_id: instance.id,
        payment_responsible_whatsapp_notified_agent_id: agent?.id ?? null,
        payment_responsible_whatsapp_notified_phone: responsiblePhone,
        payment_responsible_whatsapp_notified_source: conversation ? "conversation_whatsapp" : "automation_default_whatsapp",
      },
    })
    .eq("id", input.order.id)
    .eq("organization_id", input.order.organization_id);

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.order.organization_id,
    source_type: "sales_catalog_order",
    source_id: input.order.id,
    event_type: "sales_catalog.payment_responsible_notification_sent",
    title: "Responsavel do agente avisado sobre pagamento aprovado",
    summary: preview(text, 500),
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "payment", "whatsapp", "agent_responsible"],
    payload: {
      order_id: input.order.id,
      lead_id: input.order.lead_id,
      customer_phone: input.order.customer_phone,
      payment_session_id: input.paymentSessionId,
      provider_payment_id: input.providerPaymentId,
      whatsapp_instance_id: instance.id,
      conversation_id: input.order.conversation_id,
      agent_id: agent?.id ?? null,
      responsible_phone: responsiblePhone,
      provider_message_id: findProviderMessageId(providerResponse),
      provider_response: sanitizeProviderData(providerResponse),
      delivery_source: conversation ? "conversation_whatsapp" : "automation_default_whatsapp",
      source: input.source,
    },
  });

  return true;
}

async function maybeNotifyPaymentStatus(input: {
  client: SupabaseClient;
  order: OrderRow;
  items: OrderItemRow[];
  paymentSessionId: string;
  providerPaymentId: string | null;
  paymentMethodLabel: string;
  status: SalesCatalogPaymentNotificationStatus;
  source: string;
}) {
  const orderMetadata = readRecord(input.order.metadata);
  const metadataPrefix = getPaymentStatusNotificationPrefix(input.status);
  if (readString(orderMetadata[`${metadataPrefix}_at`])) return false;

  const settings = await getOrganizationSalesCatalogSettings(input.client, input.order.organization_id).catch(() => null);
  const automation = settings?.automationSettings ?? createDefaultSalesCatalogCommerceSettings().automationSettings;

  if (!automation.paymentStatusNotifications) return false;

  const conversation = input.order.conversation_id && automation.useConversationWhatsappFirst
    ? await loadOrderConversation(input.client, input.order)
    : null;
  const whatsappInstanceId = conversation?.whatsapp_instance_id ?? automation.defaultWhatsappInstanceId;

  if (!whatsappInstanceId) return false;

  const [{ data: instance }, { data: lead }] = await Promise.all([
    input.client
      .from("whatsapp_instances")
      .select("id, organization_id, phone_number, display_name, instance_token_encrypted, metadata")
      .eq("id", whatsappInstanceId)
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

  const text = buildPaymentStatusMessage({
    order: input.order,
    items: input.items,
    paymentMethod: input.paymentMethodLabel,
    status: input.status,
    template: getPaymentStatusTemplate(settings?.messageTemplates ?? null, input.status),
  });
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
      track_id: `sales_catalog_${input.status}_${input.order.id.slice(0, 8)}_${Date.now()}`,
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

  if (conversation && input.order.conversation_id) {
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
        delivery_source: `sales_catalog_payment_${input.status}`,
        author_type: "system",
        author_label: "Sistema",
        author_source: `sales_catalog_payment_${input.status}`,
        origin_channel: "whatsapp",
        origin_confidence: "high",
        origin_device: null,
        origin_source: "connectyhub_payment_system",
        message_origin: {
          channel: "whatsapp",
          confidence: "high",
          device: null,
          source: "connectyhub_payment_system",
        },
        provider_response: sanitizeProviderData(providerResponse),
        payment_session_id: input.paymentSessionId,
        provider_payment_id: input.providerPaymentId,
        payment_method: input.paymentMethodLabel,
        payment_status: input.status,
      },
      occurred_at: now,
    });
  }

  await Promise.all([
    conversation && input.order.conversation_id
      ? input.client
          .from("conversations")
          .update({
            status: "waiting_customer",
            last_message_preview: preview(text, 240),
            last_message_at: now,
          })
          .eq("id", input.order.conversation_id)
          .eq("organization_id", input.order.organization_id)
      : Promise.resolve(),
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
          [`${metadataPrefix}_at`]: now,
          [`${metadataPrefix}_session_id`]: input.paymentSessionId,
          [`${metadataPrefix}_provider_payment_id`]: input.providerPaymentId,
          [`${metadataPrefix}_instance_id`]: instance.id,
          [`${metadataPrefix}_source`]: conversation ? "conversation_whatsapp" : "automation_default_whatsapp",
          [`${metadataPrefix}_status`]: input.status,
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
    event_type: `sales_catalog.payment_${input.status}_sent`,
    title: getPaymentStatusCustomerEventTitle(input.status),
    summary: preview(text, 500),
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "payment", "whatsapp", "lead_tracking", input.status],
    payload: {
      order_id: input.order.id,
      lead_id: input.order.lead_id,
      lead_phone: input.order.customer_phone,
      payment_session_id: input.paymentSessionId,
      provider_payment_id: input.providerPaymentId,
      whatsapp_instance_id: instance.id,
      conversation_id: input.order.conversation_id,
      payment_status: input.status,
      payment_method: input.paymentMethodLabel,
      items: summarizePaymentConfirmationItems(input.items),
      delivery_source: conversation ? "conversation_whatsapp" : "automation_default_whatsapp",
      source: input.source,
    },
  });

  return true;
}

async function maybeNotifyResponsiblePaymentStatus(input: {
  client: SupabaseClient;
  order: OrderRow;
  items: OrderItemRow[];
  paymentSessionId: string;
  providerPaymentId: string | null;
  paymentMethodLabel: string;
  status: SalesCatalogPaymentNotificationStatus;
  source: string;
}) {
  const orderMetadata = readRecord(input.order.metadata);
  const metadataPrefix = getPaymentStatusResponsibleNotificationPrefix(input.status);
  if (readString(orderMetadata[`${metadataPrefix}_at`])) return false;

  const settings = await getOrganizationSalesCatalogSettings(input.client, input.order.organization_id).catch(() => null);
  const automation = settings?.automationSettings ?? createDefaultSalesCatalogCommerceSettings().automationSettings;
  const conversation = input.order.conversation_id ? await loadOrderConversation(input.client, input.order) : null;
  const whatsappInstanceId = conversation?.whatsapp_instance_id ?? automation.defaultWhatsappInstanceId;

  if (!whatsappInstanceId) return false;

  const { data: instance } = await input.client
    .from("whatsapp_instances")
    .select("id, organization_id, phone_number, display_name, instance_token_encrypted, metadata")
    .eq("id", whatsappInstanceId)
    .eq("organization_id", input.order.organization_id)
    .maybeSingle<WhatsappInstanceRow>();

  const token = instance?.instance_token_encrypted ? decryptCredentialValue(instance.instance_token_encrypted) : null;
  if (!instance || !token) return false;

  const agent = await loadResponsiblePaymentAgent(input.client, input.order, instance);
  const responsiblePhone = resolveResponsiblePaymentPhone(agent, input.status);
  if (!responsiblePhone) return false;

  const text = buildResponsiblePaymentStatusMessage({
    order: input.order,
    items: input.items,
    paymentMethod: input.paymentMethodLabel,
    status: input.status,
    agent,
  });
  const credentials = await loadUazapiCredentials(input.client);
  const providerResponse = await callUazapi(credentials, "/send/text", {
    method: "POST",
    token,
    body: {
      number: responsiblePhone,
      text,
      linkPreview: false,
      readchat: true,
      readmessages: true,
      track_source: "connectyhub",
      track_id: `sales_catalog_responsible_${input.status}_${input.order.id.slice(0, 8)}_${Date.now()}`,
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

  await input.client
    .from("sales_catalog_orders")
    .update({
      metadata: {
        ...latestMetadata,
        [`${metadataPrefix}_at`]: now,
        [`${metadataPrefix}_session_id`]: input.paymentSessionId,
        [`${metadataPrefix}_provider_payment_id`]: input.providerPaymentId,
        [`${metadataPrefix}_instance_id`]: instance.id,
        [`${metadataPrefix}_agent_id`]: agent?.id ?? null,
        [`${metadataPrefix}_phone`]: responsiblePhone,
        [`${metadataPrefix}_source`]: conversation ? "conversation_whatsapp" : "automation_default_whatsapp",
        [`${metadataPrefix}_status`]: input.status,
      },
    })
    .eq("id", input.order.id)
    .eq("organization_id", input.order.organization_id);

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.order.organization_id,
    source_type: "sales_catalog_order",
    source_id: input.order.id,
    event_type: `sales_catalog.payment_${input.status}_responsible_notification_sent`,
    title: getPaymentStatusResponsibleEventTitle(input.status),
    summary: preview(text, 500),
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "payment", "whatsapp", "agent_responsible", input.status],
    payload: {
      order_id: input.order.id,
      lead_id: input.order.lead_id,
      customer_phone: input.order.customer_phone,
      payment_session_id: input.paymentSessionId,
      provider_payment_id: input.providerPaymentId,
      whatsapp_instance_id: instance.id,
      conversation_id: input.order.conversation_id,
      agent_id: agent?.id ?? null,
      responsible_phone: responsiblePhone,
      provider_message_id: findProviderMessageId(providerResponse),
      provider_response: sanitizeProviderData(providerResponse),
      payment_status: input.status,
      payment_method: input.paymentMethodLabel,
      delivery_source: conversation ? "conversation_whatsapp" : "automation_default_whatsapp",
      source: input.source,
    },
  });

  return true;
}

function summarizePaymentConfirmationItems(items: OrderItemRow[]) {
  return items.map((item) => ({
    order_item_id: item.id,
    catalog_item_id: item.catalog_item_id,
    sku_id: item.sku_id,
    sku_code: item.sku_code,
    title: item.title,
    quantity: item.quantity ?? 1,
  }));
}

async function loadOrderConversation(client: SupabaseClient, order: OrderRow) {
  if (!order.conversation_id) return null;

  const { data } = await client
    .from("conversations")
    .select("id, whatsapp_instance_id, provider_chat_id")
    .eq("id", order.conversation_id)
    .eq("organization_id", order.organization_id)
    .maybeSingle<ConversationRow>();

  return data ?? null;
}

async function loadResponsiblePaymentAgent(client: SupabaseClient, order: OrderRow, instance: WhatsappInstanceRow) {
  const orderMetadata = readRecord(order.metadata);
  const instanceMetadata = readRecord(instance.metadata);
  const agentId = resolveOrderAgentId(orderMetadata) ?? readString(instanceMetadata.agent_id);

  if (!agentId) {
    return null;
  }

  const { data } = await client
    .from("agent_registry")
    .select("id, name, persona_name, metadata")
    .eq("id", agentId)
    .eq("organization_id", order.organization_id)
    .maybeSingle<ResponsibleAgentRow>();

  return data ?? null;
}

function buildPaymentApprovedMessage(input: {
  order: OrderRow;
  items: OrderItemRow[];
  paymentMethod: string;
  template: string | null;
}) {
  const { order, items } = input;
  const itemSummary = items.length > 0
    ? items.slice(0, 3).map((item) => {
        const quantity = normalizeQuantity(item.quantity);
        const sku = item.sku_code ? ` (${item.sku_code})` : "";
        return `${quantity}x ${item.title}${sku}`;
      }).join(", ")
    : "seu pedido";
  const total = order.total ? ` Total: ${order.total}.` : "";
  const template = input.template?.trim();

  if (template) {
    return renderMessageTemplate(template, {
      cliente: order.customer_name ?? "cliente",
      pedido: order.id.slice(0, 8),
      itens: itemSummary,
      valor: order.total ? `R$ ${order.total}` : "valor do pedido",
      metodo_pagamento: input.paymentMethod,
    });
  }

  return [
    "Pagamento confirmado",
    `Recebemos o pagamento via ${input.paymentMethod} para ${itemSummary}.${total}`,
    "Vou acompanhar a separacao do pedido e te aviso por aqui no WhatsApp.",
  ].join("\n");
}

function buildResponsiblePaymentApprovedMessage(input: {
  order: OrderRow;
  items: OrderItemRow[];
  paymentMethod: string;
  agent: ResponsibleAgentRow | null;
}) {
  const itemSummary = summarizeItemsForMessage(input.items);
  const agentName = input.agent?.persona_name?.trim() || input.agent?.name || "agente";
  const customerPhone = input.order.customer_phone ? ` (${input.order.customer_phone})` : "";
  const total = formatOrderTotal(input.order.total);

  return [
    "Venda confirmada",
    `O pagamento do pedido ${input.order.id.slice(0, 8)} foi aprovado via ${input.paymentMethod}.`,
    `Agente: ${agentName}.`,
    `Cliente: ${input.order.customer_name ?? "cliente"}${customerPhone}.`,
    `Itens: ${itemSummary}.`,
    total ? `Valor: ${total}.` : null,
    "O agente pode seguir com a entrega ou proximo passo combinado no atendimento.",
  ].filter(Boolean).join("\n");
}

function buildPaymentStatusMessage(input: {
  order: OrderRow;
  items: OrderItemRow[];
  paymentMethod: string;
  status: SalesCatalogPaymentNotificationStatus;
  template: string | null;
}) {
  const itemSummary = summarizeItemsForMessage(input.items);
  const variables = buildPaymentTemplateVariables(input.order, itemSummary, input.paymentMethod);
  const template = input.template?.trim();
  const checkoutUrl = readLatestCheckoutUrl(input.order.metadata);

  if (template) {
    const rendered = renderMessageTemplate(template, {
      ...variables,
      link_pagamento: checkoutUrl,
    });

    if (input.status === "pending" && checkoutUrl && !rendered.includes(checkoutUrl)) {
      return `${rendered}\nLink de pagamento: ${checkoutUrl}`;
    }

    return rendered;
  }

  if (input.status === "pending") {
    return [
      `${variables.cliente}, seu pagamento do pedido ${variables.pedido} ainda esta aguardando confirmacao.`,
      checkoutUrl ? `Link de pagamento: ${checkoutUrl}` : "Se ja pagou, assim que o gateway confirmar eu te aviso por aqui.",
    ].join("\n");
  }

  if (input.status === "refunded") {
    return `${variables.cliente}, o pagamento do pedido ${variables.pedido} foi estornado. Se precisar de ajuda para refazer a compra, eu te acompanho por aqui.`;
  }

  if (input.status === "cancelled" || input.status === "expired") {
    const label = input.status === "expired" ? "expirou" : "foi cancelado";
    return `${variables.cliente}, o pagamento do pedido ${variables.pedido} ${label}. Nenhuma cobranca foi concluida. Posso te ajudar a refazer o pagamento por aqui.`;
  }

  return `${variables.cliente}, o pagamento do pedido ${variables.pedido} nao foi aprovado. Nenhuma cobranca foi concluida. Tente outro cartao ou use Pix.`;
}

function buildResponsiblePaymentStatusMessage(input: {
  order: OrderRow;
  items: OrderItemRow[];
  paymentMethod: string;
  status: SalesCatalogPaymentNotificationStatus;
  agent: ResponsibleAgentRow | null;
}) {
  const itemSummary = summarizeItemsForMessage(input.items);
  const agentName = input.agent?.persona_name?.trim() || input.agent?.name || "agente";
  const customerPhone = input.order.customer_phone ? ` (${input.order.customer_phone})` : "";
  const total = formatOrderTotal(input.order.total);
  const statusLabel = formatPaymentNotificationStatus(input.status);

  return [
    `Pagamento ${statusLabel}`,
    `O pedido ${input.order.id.slice(0, 8)} foi atualizado para ${statusLabel} via ${input.paymentMethod}.`,
    `Agente: ${agentName}.`,
    `Cliente: ${input.order.customer_name ?? "cliente"}${customerPhone}.`,
    `Itens: ${itemSummary}.`,
    total ? `Valor: ${total}.` : null,
    input.status === "pending"
      ? "Acompanhe a conversa e ajude o cliente a concluir o pagamento se necessario."
      : "Revise o pedido no painel e conduza recuperacao ou proximo passo com o cliente.",
  ].filter(Boolean).join("\n");
}

function buildPaymentTemplateVariables(order: OrderRow, itemSummary: string, paymentMethod: string) {
  return {
    cliente: order.customer_name ?? "cliente",
    pedido: order.id.slice(0, 8),
    itens: itemSummary,
    valor: order.total ? `R$ ${order.total}` : "valor do pedido",
    metodo_pagamento: paymentMethod,
  };
}

function renderMessageTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => variables[key.toLowerCase()] ?? match);
}

function resolveResponsiblePaymentPhone(agent: ResponsibleAgentRow | null, status: "approved" | SalesCatalogPaymentNotificationStatus) {
  if (!agent) return "";

  const responsible = readAgentResponsibleHuman(agent.metadata);
  const wantsNotification = status === "approved"
    ? responsible.notifySales || responsible.notifyPayments
    : responsible.notifyPayments || responsible.notifyOperational;

  if (responsible.phone && !wantsNotification) {
    return "";
  }

  return responsible.phone
    || readFirstResponsibleWhatsappPhone(readRecord(readRecord(agent.metadata).whatsapp_behavior_config).humanHandoffNotificationNumbers)
    || "";
}

function normalizePaymentNotificationStatus(status: SalesCatalogPaymentStatus): SalesCatalogPaymentNotificationStatus | null {
  if (status === "created" || status === "pending") return "pending";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "refunded") return "refunded";
  if (status === "error") return "error";
  return null;
}

function getPaymentStatusNotificationPrefix(status: SalesCatalogPaymentNotificationStatus) {
  return `payment_${status}_whatsapp_notified`;
}

function getPaymentStatusResponsibleNotificationPrefix(status: SalesCatalogPaymentNotificationStatus) {
  return `payment_${status}_responsible_whatsapp_notified`;
}

function getPaymentStatusTemplate(
  templates: ReturnType<typeof createDefaultSalesCatalogCommerceSettings>["messageTemplates"] | null,
  status: SalesCatalogPaymentNotificationStatus,
) {
  if (!templates) return null;
  if (status === "pending") return templates.paymentRequest;
  if (status === "refunded") return templates.paymentRefunded;
  if (status === "rejected" || status === "error") return templates.paymentRejected;
  return null;
}

function getPaymentStatusCustomerEventTitle(status: SalesCatalogPaymentNotificationStatus) {
  if (status === "pending") return "Pagamento pendente enviado no WhatsApp";
  if (status === "refunded") return "Estorno informado no WhatsApp";
  if (status === "expired") return "Pagamento expirado informado no WhatsApp";
  if (status === "cancelled") return "Pagamento cancelado informado no WhatsApp";
  return "Pagamento recusado informado no WhatsApp";
}

function getPaymentStatusResponsibleEventTitle(status: SalesCatalogPaymentNotificationStatus) {
  if (status === "pending") return "Responsavel avisado sobre pagamento pendente";
  if (status === "refunded") return "Responsavel avisado sobre estorno";
  if (status === "expired") return "Responsavel avisado sobre pagamento expirado";
  if (status === "cancelled") return "Responsavel avisado sobre pagamento cancelado";
  return "Responsavel avisado sobre pagamento recusado";
}

function formatPaymentNotificationStatus(status: SalesCatalogPaymentNotificationStatus) {
  if (status === "pending") return "pendente";
  if (status === "refunded") return "estornado";
  if (status === "expired") return "expirado";
  if (status === "cancelled") return "cancelado";
  return "recusado";
}

function readLatestCheckoutUrl(metadata: JsonRecord | null) {
  const record = readRecord(metadata);

  return readString(record.latest_checkout_tracking_url)
    ?? readString(record.latest_checkout_url)
    ?? readString(record.checkout_tracking_url)
    ?? readString(record.checkout_url)
    ?? "";
}

function resolveOrderAgentId(metadata: JsonRecord) {
  return readString(metadata.agent_id)
    ?? readString(metadata.whatsapp_agent_id)
    ?? readString(metadata.producer_agent_id)
    ?? readString(metadata.created_by_agent_id)
    ?? readString(metadata.latest_agent_id);
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

function summarizeItemsForMessage(items: OrderItemRow[]) {
  return items.length > 0
    ? items.slice(0, 4).map((item) => {
        const quantity = normalizeQuantity(item.quantity);
        const sku = item.sku_code ? ` (${item.sku_code})` : "";
        return `${quantity}x ${item.title}${sku}`;
      }).join(", ")
    : "pedido";
}

function formatOrderTotal(value: string | null) {
  const raw = readString(value);
  if (!raw) return "";

  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return `R$ ${raw}`;
  }

  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsed);
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
